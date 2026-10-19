from cryptography.fernet import Fernet

from app.core import credentials
from app.core.config import settings
from app.services import settings_store


def test_secret_key_names():
    for key in ("nebius_api_key", "wazuh_password", "webhook_soar_auth_token", "some_secret",
                "custom_cti_my_feed_key", "wazuh_ingest_token"):
        assert credentials.is_secret_key(key), key
    for key in ("wazuh_url", "agent1_model", "custom_cti_sources", "test_key", "active_soar"):
        assert not credentials.is_secret_key(key), key


def test_encrypt_decrypt_roundtrip(secret_key):
    stored = credentials.encrypt("sk-live-123")
    assert stored.startswith("enc:v1:") and "sk-live-123" not in stored
    assert credentials.decrypt(stored) == "sk-live-123"


def test_encrypt_leaves_empty_and_encrypted_values(secret_key):
    assert credentials.encrypt("") == ""
    assert credentials.encrypt(None) is None
    once = credentials.encrypt("abc")
    assert credentials.encrypt(once) == once


def test_decrypt_with_wrong_key_returns_none(secret_key, monkeypatch):
    stored = credentials.encrypt("abc")
    monkeypatch.setattr(settings, "nightshift_secret_key", Fernet.generate_key().decode())
    monkeypatch.setattr(credentials, "_fernet", None)
    monkeypatch.setattr(credentials, "_fernet_checked", False)
    assert credentials.decrypt(stored) is None


def test_without_key_values_stay_plaintext(monkeypatch):
    monkeypatch.setattr(settings, "nightshift_secret_key", None)
    monkeypatch.setattr(credentials, "_fernet", None)
    monkeypatch.setattr(credentials, "_fernet_checked", False)
    assert credentials.encrypt("abc") == "abc"
    assert not credentials.encryption_enabled()


def test_mask_and_resolve(set_setting):
    assert credentials.mask("real") == credentials.SECRET_PLACEHOLDER
    assert credentials.mask("") == ""
    set_setting("virustotal_api_key", "vt-stored")
    assert credentials.resolve(credentials.SECRET_PLACEHOLDER, "virustotal_api_key") == "vt-stored"
    assert credentials.resolve("  typed  ", "virustotal_api_key") == "typed"


def test_public_view_masks_secrets_and_hides_server_settings():
    view = settings_store.public_view({
        "nebius_api_key": "secret", "wazuh_url": "https://w:55000", "postgres_password": "pg",
        "nightshift_secret_key": "k", "keycloak_admin_password": "kc", "empty_api_key": "",
    })
    assert view == {"nebius_api_key": credentials.SECRET_PLACEHOLDER, "wazuh_url": "https://w:55000", "empty_api_key": ""}
