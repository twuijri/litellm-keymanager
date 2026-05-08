from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user
from .. import config, db as db_mod, settings_store


router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(get_current_user)],
)


def _mask(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:4]}{'•' * (len(value) - 8)}{value[-4:]}"


class SettingsView(BaseModel):
    litellm_base_url: str
    litellm_master_key_masked: str | None
    litellm_master_key_set: bool
    database_url_masked: str | None
    database_url_set: bool
    cors_origins: str
    overrides_active: dict[str, bool]


class SettingsUpdate(BaseModel):
    litellm_base_url: str | None = None
    litellm_master_key: str | None = None
    database_url: str | None = None
    cors_origins: str | None = None


@router.get("", response_model=SettingsView)
def read_settings():
    s = config.get_settings()
    overrides = settings_store.load()
    return SettingsView(
        litellm_base_url=s.litellm_base_url,
        litellm_master_key_masked=_mask(s.litellm_master_key),
        litellm_master_key_set=bool(s.litellm_master_key),
        database_url_masked=_mask(s.database_url),
        database_url_set=bool(s.database_url),
        cors_origins=s.cors_origins,
        overrides_active={k: k in overrides for k in settings_store.EDITABLE_KEYS},
    )


@router.post("", response_model=SettingsView)
async def write_settings(body: SettingsUpdate):
    current = settings_store.load()

    def apply(key: str, value: Any) -> None:
        if value is None:
            return
        # Treat empty string as "clear override and fall back to env"
        if value == "":
            current.pop(key, None)
        else:
            current[key] = value

    apply("litellm_base_url", body.litellm_base_url)
    apply("litellm_master_key", body.litellm_master_key)
    apply("database_url", body.database_url)
    apply("cors_origins", body.cors_origins)

    try:
        settings_store.save(current)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Could not persist settings: {e}")

    config.reload_overrides()
    await db_mod.reset_pool()

    return read_settings()


@router.post("/test-database")
async def test_database():
    s = config.get_settings()
    if not s.database_url:
        raise HTTPException(status_code=400, detail="DATABASE_URL is not set")
    try:
        pool = await db_mod.get_pool(s)
        if not pool:
            raise HTTPException(status_code=500, detail="Could not initialize pool")
        async with pool.acquire() as conn:
            tables = await conn.fetch(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name LIKE 'LiteLLM_%' "
                "ORDER BY table_name"
            )
        return {"ok": True, "tables_found": [t["table_name"] for t in tables]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB connection failed: {e}")
