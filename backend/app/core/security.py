import os
from typing import Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx

security = HTTPBearer()

KEYCLOAK_SERVER_URL = os.getenv("KEYCLOAK_SERVER_URL", "http://localhost:8080")
REALM = os.getenv("KEYCLOAK_REALM", "AI-Driven SOC")
CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "bluesec-frontend")
JWKS_URL = f"{KEYCLOAK_SERVER_URL}/realms/{REALM}/protocol/openid-connect/certs"

def get_public_keys():
    try:
        response = httpx.get(JWKS_URL, timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching JWKS from {JWKS_URL}: {e}")
        return None

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

    rsa_key = {}
    for key in jwks.get("keys", []):
        if key.get("kid") == unverified_header.get("kid"):
            rsa_key = key
            break

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
