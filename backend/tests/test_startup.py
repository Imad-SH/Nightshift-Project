"""The backend recovers when PostgreSQL only becomes reachable after startup."""
import asyncio

import main
from app.core import migrations


def test_saved_settings_load_once_the_database_comes_up(monkeypatch):
    attempts, done = [], []

    async def upgrade_database():
        attempts.append(1)
        if len(attempts) < 3:
            raise OSError("[Errno -2] Name or service not known")

    async def no_wait(_seconds):
        return None

    async def load_saved_state():
        done.append("settings loaded")

    async def on_database_ready():
        done.append("statuses refreshed")

    monkeypatch.setattr(migrations, "upgrade_database", upgrade_database)
    monkeypatch.setattr(main.asyncio, "sleep", no_wait)
    monkeypatch.setattr(main, "_load_saved_state", load_saved_state)
    monkeypatch.setattr(main.integrations, "on_database_ready", on_database_ready)

    asyncio.run(main._initialize_database_later())

    assert len(attempts) == 3
    assert done == ["settings loaded", "statuses refreshed"]
