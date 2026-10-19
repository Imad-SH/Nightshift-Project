import threading
import time
from typing import Dict, Any, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx

from app.core.config import settings

security = HTTPBearer()

JWKS_URL = f"{settings.keycloak_server_url.rstrip('/')}/realms/{settings.keycloak_realm}/protocol/openid-connect/certs"

# Keycloak's signing keys rarely change: cache them instead of fetching on every request.
# An unknown key id (key rotation) triggers one immediate refresh.
JWKS_TTL_SECONDS = 600
_jwks: Optional[Dict[str, Any]] = None
_jwks_fetched_at = 0.0
_jwks_lock = threading.Lock()


def get_public_keys(force_refresh: bool = False) -> Optional[Dict[str, Any]]:
    global _jwks, _jwks_fetched_at
    with _jwks_lock:
        fresh = _jwks is not None and time.monotonic() - _jwks_fetched_at < JWKS_TTL_SECONDS
        if fresh and not force_refresh:
            return _jwks
        try:
            response = httpx.get(JWKS_URL, timeout=5)
            response.raise_for_status()
            _jwks = response.json()
            _jwks_fetched_at = time.monotonic()
        except Exception as e:
            # Keep serving the last known keys if Keycloak is briefly unreachable
            print(f"Error fetching JWKS from {JWKS_URL}: {e}")
        return _jwks


def _find_key(jwks: Optional[Dict[str, Any]], kid: Optional[str]) -> Dict[str, Any]:
    for key in (jwks or {}).get("keys", []):
        if key.get("kid") == kid:
            return key
    return {}


def verify_jwt(token: str) -> Dict[str, Any]:
    jwks = get_public_keys()
    if not jwks:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to fetch identity provider keys.",
        )

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    kid = unverified_header.get("kid")
    rsa_key = _find_key(jwks, kid) or _find_key(get_public_keys(force_refresh=True), kid)

    if rsa_key:
        try:
            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=["RS256"],
                audience="account",
                options={"verify_aud": False}
            )
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token validation failed: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unable to find appropriate key.",
        headers={"WWW-Authenticate": "Bearer"},
    )

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    token = credentials.credentials
    payload = verify_jwt(token)
    return payload

def require_role(required_role: str):
    def role_checker(user: Dict[str, Any] = Depends(get_current_user)):
        realm_access = user.get("realm_access", {})
        roles = realm_access.get("roles", [])

        # Grant blanket access to literal admins or soc_managers for admin tasks
        is_admin = "admin" in roles or "soc_manager" in roles or "soc_admin" in roles or user.get("preferred_username", "").lower() == "admin"

        # If the endpoint requested an admin role and we are an admin, auto-pass
        if required_role in ["soc_admin", "soc_manager", "admin"] and is_admin:
            return user

        if required_role not in roles and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User does not have required role: {required_role}"
            )
        return user
    return role_checker
