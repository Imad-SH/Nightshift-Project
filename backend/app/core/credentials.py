"""
Secret handling for settings stored in the database.

- Secret values (API keys, passwords, tokens) are encrypted at rest with Fernet,
  using the installation key from NIGHTSHIFT_SECRET_KEY.
- The settings API never returns a stored secret. It returns SECRET_PLACEHOLDER
  instead, and on write treats the placeholder as "keep the stored value".
"""
import logging
from typing import Any, Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

logger = logging.getLogger(__name__)

# What the UI receives instead of a stored secret. Sending it back means "unchanged".
SECRET_PLACEHOLDER = "••••••••••••••••"

_ENC_PREFIX = "enc:v1:"

# Server-side settings that are never exposed through, or writable from, the settings API.
INFRA_KEYS = frozenset({
    "nightshift_secret_key",
    "postgres_server", "postgres_user", "postgres_password", "postgres_db",
    "redis_host", "redis_port", "redis_db", "redis_password",
    "keycloak_server_url", "keycloak_admin_user", "keycloak_admin_password",
    "mitre_data_file", "mitre_update_dir", "mitre_auto_update",
})


def is_secret_key(key: str) -> bool:
    """Whether a setting name holds a credential that must be encrypted and masked."""
    k = key.lower()
    if k.endswith(("_api_key", "_password", "_secret", "_token")):
        return True
    # User-defined CTI sources store their key as custom_cti_<name>_key
    return k.startswith("custom_cti_") and k.endswith("_key")


_fernet: Optional[Fernet] = None
_fernet_checked = False


def _get_fernet() -> Optional[Fernet]:
    global _fernet, _fernet_checked
    if not _fernet_checked:
        _fernet_checked = True
        key = (settings.nightshift_secret_key or "").strip()
        if key:
            try:
                _fernet = Fernet(key.encode())
            except (ValueError, TypeError):
                logger.error("NIGHTSHIFT_SECRET_KEY is not a valid Fernet key; secrets will not be encrypted.")
    return _fernet


def encryption_enabled() -> bool:
    return _get_fernet() is not None


def is_encrypted(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(_ENC_PREFIX)


def encrypt(value: Any) -> Any:
    """Encrypt a secret for storage. Empty values and already-encrypted values pass through."""
    fernet = _get_fernet()
    if fernet is None or not isinstance(value, str) or not value or is_encrypted(value):
        return value
    return _ENC_PREFIX + fernet.encrypt(value.encode()).decode()


def decrypt(value: Any) -> Any:
    """Decrypt a stored secret. Returns None when it cannot be decrypted (missing or wrong key)."""
    if not is_encrypted(value):
        return value
    fernet = _get_fernet()
    if fernet is None:
        logger.error("Found an encrypted secret but NIGHTSHIFT_SECRET_KEY is not set; treating it as unset.")
        return None
    try:
        return fernet.decrypt(value[len(_ENC_PREFIX):].encode()).decode()
    except InvalidToken:
        logger.error("Could not decrypt a stored secret (wrong NIGHTSHIFT_SECRET_KEY?); treating it as unset.")
        return None


def mask(value: Any) -> Any:
    """What the API shows for a secret: the placeholder if one is set, otherwise the empty value."""
    return SECRET_PLACEHOLDER if value else value


def resolve(provided: Optional[str], key: str) -> str:
    """
    Turn a value received from the UI into the real secret.
    The placeholder means "use what is stored"; anything else is a newly typed value.
    """
    if provided == SECRET_PLACEHOLDER:
        return getattr(settings, key, None) or ""
    return (provided or "").strip()
