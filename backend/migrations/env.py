"""Alembic environment: runs migrations against the app's database, using its settings."""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.database import SQLALCHEMY_DATABASE_URL, Base
import app.models.alert  # noqa: F401  (register tables on Base.metadata)
import app.models.settings  # noqa: F401

config = context.config

# When run from the app, logging is already configured; only the CLI sets it up here
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    """Autogenerate only manages tables defined in the app's models; other tables
    (e.g. legacy ones in older databases) are never proposed for removal."""
    if type_ == "table" and reflected and compare_to is None:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(url=SQLALCHEMY_DATABASE_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def _run(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, include_object=include_object)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(SQLALCHEMY_DATABASE_URL)
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
