"""
Database-backed system settings (the system_settings key/value table).

All reads and writes of that table go through here so secrets are always
encrypted at rest and decrypted only inside the server process.
"""
import logging
from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm.attributes import flag_modified

from app.core import credentials
from app.models.settings import SystemSettings

logger = logging.getLogger(__name__)

MAX_KEY_LENGTH = 128


async def load_all(db: AsyncSession) -> Dict[str, Any]:
    """Every stored setting, with secrets decrypted. Server-side use only."""
    result = await db.execute(select(SystemSettings))
    values = {}
    for row in result.scalars().all():
        values[row.key] = credentials.decrypt(row.value) if credentials.is_secret_key(row.key) else row.value
    return values


async def save(db: AsyncSession, updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Upsert settings from the API. Returns the plaintext values that actually changed,
    for hot-reloading the in-memory settings.

    Secrets equal to the placeholder are skipped (the UI sent back what it was shown).
    Raises ValueError for keys that are not writable through the API.
    """
    for key in updates:
        if not isinstance(key, str) or not key or len(key) > MAX_KEY_LENGTH:
            raise ValueError(f"Invalid setting name: {key!r}")
        if key in credentials.INFRA_KEYS:
            raise ValueError(f"'{key}' is managed by the server configuration and cannot be changed here")

    applied: Dict[str, Any] = {}
    for key, value in updates.items():
        if credentials.is_secret_key(key):
            if value == credentials.SECRET_PLACEHOLDER:
                continue
            stored = credentials.encrypt(value)
        else:
            stored = value

        result = await db.execute(select(SystemSettings).where(SystemSettings.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = stored
            flag_modified(row, "value")
        else:
            db.add(SystemSettings(key=key, value=stored))
        applied[key] = value

    await db.commit()
    return applied


async def encrypt_plaintext_secrets(db: AsyncSession) -> int:
    """Encrypt secrets that were stored before encryption existed. Safe to run on every start."""
    if not credentials.encryption_enabled():
        logger.warning("NIGHTSHIFT_SECRET_KEY is not set: API keys in the database are stored unencrypted.")
        return 0

    result = await db.execute(select(SystemSettings))
    count = 0
    for row in result.scalars().all():
        if credentials.is_secret_key(row.key) and isinstance(row.value, str) and row.value \
                and not credentials.is_encrypted(row.value):
            row.value = credentials.encrypt(row.value)
            flag_modified(row, "value")
            count += 1
    if count:
        await db.commit()
        logger.info(f"Encrypted {count} previously unencrypted secret(s) in system_settings.")
    return count


def public_view(values: Dict[str, Any]) -> Dict[str, Any]:
    """What the settings API may return: no server-only settings, secrets masked."""
    return {
        key: credentials.mask(value) if credentials.is_secret_key(key) else value
        for key, value in values.items()
        if key not in credentials.INFRA_KEYS
    }
