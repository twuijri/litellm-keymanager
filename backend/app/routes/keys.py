from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import get_current_user
from ..config import Settings, get_settings
from ..litellm_client import LiteLLMClient
from .. import db as db_mod

router = APIRouter(prefix="/api", tags=["keys"], dependencies=[Depends(get_current_user)])


def get_client(settings: Annotated[Settings, Depends(get_settings)]) -> LiteLLMClient:
    return LiteLLMClient(settings)


# ---------- request bodies ----------

class FallbackEntry(BaseModel):
    primary: str
    fallbacks: list[str] = Field(default_factory=list)


class KeyUpdateRequest(BaseModel):
    key: str
    key_alias: str | None = None
    models: list[str] | None = None
    max_budget: float | None = None
    metadata: dict[str, Any] | None = None
    fallbacks: list[FallbackEntry] | None = None


class KeyGenerateRequest(BaseModel):
    key_alias: str | None = None
    models: list[str] = Field(default_factory=list)
    max_budget: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    fallbacks: list[FallbackEntry] = Field(default_factory=list)


class KeyRegenerateRequest(BaseModel):
    key: str
    new_alias: str | None = None


class KeyCloneRequest(BaseModel):
    key: str
    new_alias: str


# ---------- helpers ----------

def _fallbacks_to_metadata(fallbacks: list[FallbackEntry]) -> list[dict[str, list[str]]]:
    return [{f.primary: f.fallbacks} for f in fallbacks if f.primary]


def _merge_metadata(existing: dict | None, fallbacks: list[FallbackEntry] | None) -> dict:
    metadata = dict(existing or {})
    if fallbacks is not None:
        metadata["fallbacks"] = _fallbacks_to_metadata(fallbacks)
    return metadata


async def _find_key_record(client: LiteLLMClient, key: str) -> dict:
    # /key/list caps size at 100, so walk pages until we find it.
    page = 1
    while page <= 200:
        result = await client.list_keys(page=page, size=100, return_full_object=True)
        keys = result.get("keys", []) if isinstance(result, dict) else result
        if not keys:
            raise HTTPException(status_code=404, detail="Key not found")
        for k in keys:
            if not isinstance(k, dict):
                continue
            if k.get("token") == key or k.get("key_name") == key or k.get("key") == key:
                return k
        total_pages = result.get("total_pages") if isinstance(result, dict) else None
        if total_pages and page >= total_pages:
            raise HTTPException(status_code=404, detail="Key not found")
        if len(keys) < 100:
            raise HTTPException(status_code=404, detail="Key not found")
        page += 1
    raise HTTPException(status_code=404, detail="Key not found")


# ---------- routes ----------

@router.get("/keys")
async def list_keys(
    client: Annotated[LiteLLMClient, Depends(get_client)],
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=100),
    all: bool = Query(True),
):
    if not all:
        return await client.list_keys(page=page, size=size, return_full_object=True)

    aggregated: list = []
    current = 1
    total_pages = 1
    while current <= total_pages:
        result = await client.list_keys(page=current, size=100, return_full_object=True)
        if isinstance(result, dict):
            aggregated.extend(result.get("keys", []))
            total_pages = result.get("total_pages") or 1
        elif isinstance(result, list):
            aggregated.extend(result)
            break
        current += 1
        if current > 100:
            break

    # Merge router_settings/metadata from DB so per-key fallbacks surface in the list.
    current_settings = get_settings()
    pool_check = await db_mod.get_pool(current_settings)
    if pool_check:
        for i, k in enumerate(aggregated):
            if not isinstance(k, dict):
                continue
            token = k.get("token") or k.get("key_name")
            if not token:
                continue
            db_row = await db_mod.fetch_key_row(current_settings, token)
            if not db_row:
                continue
            aggregated[i] = _merge_db_into_record(k, db_row)

    return {"keys": aggregated, "total_count": len(aggregated)}


def _merge_db_into_record(record: dict, db_row: dict) -> dict:
    enriched = {**record}

    db_metadata = db_row.get("metadata")
    if isinstance(db_metadata, dict) and db_metadata:
        api_metadata = enriched.get("metadata") or {}
        enriched["metadata"] = {**api_metadata, **db_metadata}

    # Per-key fallbacks live in the router_settings column on LiteLLM_VerificationToken.
    db_router = db_row.get("router_settings")
    if isinstance(db_router, dict):
        enriched["router_settings"] = db_router
        fallbacks = db_router.get("fallbacks")
        if isinstance(fallbacks, list):
            metadata = enriched.get("metadata") or {}
            metadata = {**metadata, "fallbacks": fallbacks}
            enriched["metadata"] = metadata

    for field in ("aliases", "config", "permissions", "model_max_budget", "model_spend"):
        value = db_row.get(field)
        if value not in (None, {}, []):
            enriched.setdefault(field, value)

    return enriched


async def _enrich_with_db(settings: Settings, record: dict) -> dict:
    token = record.get("token") or record.get("key_name")
    if not token:
        return record
    db_row = await db_mod.fetch_key_row(settings, token)
    if not db_row:
        return record
    return _merge_db_into_record(record, db_row)


@router.get("/keys/{key}")
async def get_key(
    key: str,
    client: Annotated[LiteLLMClient, Depends(get_client)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    record = await _find_key_record(client, key)
    return await _enrich_with_db(settings, record)


@router.get("/router-settings")
async def router_settings(
    settings: Annotated[Settings, Depends(get_settings)],
):
    return await db_mod.fetch_router_settings(settings)


@router.get("/_db/schema")
async def db_schema(
    settings: Annotated[Settings, Depends(get_settings)],
):
    return {"columns": await db_mod.list_tables(settings)}


@router.post("/keys/update")
async def update_key(
    body: KeyUpdateRequest,
    client: Annotated[LiteLLMClient, Depends(get_client)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    payload: dict[str, Any] = {"key": body.key}
    if body.key_alias is not None:
        payload["key_alias"] = body.key_alias
    if body.models is not None:
        payload["models"] = body.models
    if body.max_budget is not None:
        payload["max_budget"] = body.max_budget
    if body.metadata is not None:
        payload["metadata"] = body.metadata

    api_response = await client.update_key(payload)

    # Write fallbacks straight to the router_settings column on the key row,
    # which is where LiteLLM expects per-key fallbacks to live.
    if body.fallbacks is not None:
        router_value = {"fallbacks": _fallbacks_to_metadata(body.fallbacks)}
        wrote = await db_mod.update_key_router_settings(settings, body.key, router_value)
        if wrote:
            if isinstance(api_response, dict):
                api_response = {**api_response, "router_settings": router_value}

    return api_response


@router.post("/keys/generate")
async def generate_key(
    body: KeyGenerateRequest,
    client: Annotated[LiteLLMClient, Depends(get_client)],
):
    payload: dict[str, Any] = {
        "models": body.models,
        "metadata": _merge_metadata(body.metadata, body.fallbacks),
    }
    if body.key_alias:
        payload["key_alias"] = body.key_alias
    if body.max_budget is not None:
        payload["max_budget"] = body.max_budget
    return await client.generate_key(payload)


async def _resolve_new_token(
    client: LiteLLMClient,
    settings: Settings,
    new_key: Any,
    alias: str | None,
) -> str | None:
    if isinstance(new_key, dict):
        token = new_key.get("token")
        if token:
            return token
    if alias:
        return await db_mod.fetch_token_by_alias(settings, alias)
    return None


@router.post("/keys/regenerate")
async def regenerate_key(
    body: KeyRegenerateRequest,
    client: Annotated[LiteLLMClient, Depends(get_client)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    record = await _find_key_record(client, body.key)
    record = await _enrich_with_db(settings, record)

    metadata = dict(record.get("metadata") or {})
    metadata.pop("fallbacks", None)  # fallbacks live in router_settings, not metadata
    payload: dict[str, Any] = {
        "models": record.get("models") or [],
        "metadata": metadata,
    }
    alias = body.new_alias or record.get("key_alias")
    if alias:
        payload["key_alias"] = alias
    if record.get("max_budget") is not None:
        payload["max_budget"] = record["max_budget"]

    new_key = await client.generate_key(payload)

    # Copy router_settings (per-key fallbacks) to the new key's row before deleting old.
    router_value = record.get("router_settings")
    if isinstance(router_value, dict) and router_value:
        new_token = await _resolve_new_token(client, settings, new_key, alias)
        if new_token:
            await db_mod.update_key_router_settings(settings, new_token, router_value)

    try:
        await client.delete_keys([record.get("token") or body.key])
    except HTTPException:
        # Roll back the new key if delete fails so we don't leave duplicates.
        rollback_token = (new_key or {}).get("key") if isinstance(new_key, dict) else None
        if rollback_token:
            try:
                await client.delete_keys([rollback_token])
            except HTTPException:
                pass
        raise
    return new_key


@router.post("/keys/clone")
async def clone_key(
    body: KeyCloneRequest,
    client: Annotated[LiteLLMClient, Depends(get_client)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    record = await _find_key_record(client, body.key)
    record = await _enrich_with_db(settings, record)

    metadata = dict(record.get("metadata") or {})
    metadata.pop("fallbacks", None)
    payload: dict[str, Any] = {
        "key_alias": body.new_alias,
        "models": record.get("models") or [],
        "metadata": metadata,
    }
    if record.get("max_budget") is not None:
        payload["max_budget"] = record["max_budget"]

    new_key = await client.generate_key(payload)

    router_value = record.get("router_settings")
    if isinstance(router_value, dict) and router_value:
        new_token = await _resolve_new_token(client, settings, new_key, body.new_alias)
        if new_token:
            await db_mod.update_key_router_settings(settings, new_token, router_value)

    return new_key


@router.post("/keys/delete")
async def delete_keys(
    body: dict,
    client: Annotated[LiteLLMClient, Depends(get_client)],
):
    keys = body.get("keys") or []
    if not isinstance(keys, list) or not keys:
        raise HTTPException(status_code=400, detail="keys must be a non-empty list")
    return await client.delete_keys(keys)


@router.get("/models")
async def models(client: Annotated[LiteLLMClient, Depends(get_client)]):
    return await client.model_info()
