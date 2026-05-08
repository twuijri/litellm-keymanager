from pydantic_settings import BaseSettings, SettingsConfigDict

from . import settings_store


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    litellm_base_url: str = "http://litellm_app:4000"
    litellm_master_key: str | None = None

    database_url: str | None = None

    admin_username: str = "admin"
    admin_password: str

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12

    cors_origins: str = "*"


_cached_overrides: dict | None = None


def _overrides() -> dict:
    global _cached_overrides
    if _cached_overrides is None:
        _cached_overrides = settings_store.load()
    return _cached_overrides


def reload_overrides() -> None:
    global _cached_overrides
    _cached_overrides = settings_store.load()


def get_settings() -> Settings:
    base = Settings()
    overrides = _overrides()
    for key in settings_store.EDITABLE_KEYS:
        value = overrides.get(key)
        if value not in (None, ""):
            setattr(base, key, value)
    return base
