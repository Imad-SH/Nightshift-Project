"""
Unit tests run without a database or network. Run them from the repository root with:

    docker run --rm -v "$PWD/backend:/app" --user 0 --entrypoint sh nightshift-backend:<version> \
        -c "pip install -q -r requirements-dev.txt && python -m pytest"
"""
import pytest
from cryptography.fernet import Fernet

from app.core import credentials
from app.core.config import settings


@pytest.fixture
def secret_key(monkeypatch):
    """A fresh installation key, with the module's cached Fernet instance reset."""
    key = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "nightshift_secret_key", key)
    monkeypatch.setattr(credentials, "_fernet", None)
    monkeypatch.setattr(credentials, "_fernet_checked", False)
    yield key
    credentials._fernet = None
    credentials._fernet_checked = False


@pytest.fixture
def set_setting():
    """
    Set an in-memory setting for one test, restored afterwards. Works for keys that are
    not declared fields (e.g. custom_cti_x_key), set the same way the app does it.
    """
    missing = object()
    saved = []

    def _set(key, value):
        saved.append((key, settings.__dict__.get(key, missing)))
        object.__setattr__(settings, key, value)

    yield _set
    for key, old in reversed(saved):
        if old is missing:
            settings.__dict__.pop(key, None)
        else:
            object.__setattr__(settings, key, old)
