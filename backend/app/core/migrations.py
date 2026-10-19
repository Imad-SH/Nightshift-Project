"""Bring the database schema up to date at startup (Alembic migrations)."""
import asyncio
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.database import SQLALCHEMY_DATABASE_URL

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
BASELINE = "0001_baseline"


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    cfg.attributes["configure_logger"] = False
    return cfg


async def _table_names() -> list:
    engine = create_async_engine(SQLALCHEMY_DATABASE_URL)
    try:
        async with engine.connect() as conn:
            return await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
    finally:
        await engine.dispose()


def _upgrade() -> None:
    # Alembic's env.py runs its own event loop, so this runs in a worker thread
    cfg = _alembic_config()
    tables = asyncio.run(_table_names())
    if "alembic_version" not in tables and "alerts_v2" in tables:
        # Database created before migrations existed: it already matches the baseline
        logger.info("Existing database without migration history: marking it at the baseline.")
        command.stamp(cfg, BASELINE)
    command.upgrade(cfg, "head")


async def upgrade_database() -> None:
    await asyncio.to_thread(_upgrade)
