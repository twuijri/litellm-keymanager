from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import get_current_user
from ..config import Settings, get_settings
from ..litellm_client import LiteLLMClient

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
    # /key/list paginates; we walk pages until we find it.
    page = 1
    while True:
        result = await client.list_keys(page=page, size=200, return_full_object=True)
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
        if len(keys) < 200:
            raise HTTPException(status_code=404, detail="Key not found")
        page += 1


# ---------- routes ----------

@router.get("/keys")
async def list_keys(
    client: Annotated[LiteLLMClient, Depends(get_client)],
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=500),
):
    return await client.list_keys(page=page, size=size, return_full_object=True)


@router.get("/keys/{key}")
async def get_key(
    key: str,
    client: Annotated[LiteLLMClient, Depends(get_client)],
):
    return await _find_key_record(client, key)


@router.post("/keys/update")
async def update_key(
    body: KeyUpdateRequest,
    client: Annotated[LiteLLMClient, Depends(get_client)],
):
    payload: dict[str, Any] = {"key": body.key}
    if body.key_alias is not None:
        payload["key_alias"] = body.key_alias
    if body.models is not None:
        payload["models"] = body.models
    if body.max_budget is not None:
        payload["max_budget"] = body.max_budget

    metadata = body.metadata
    if body.fallbacks is not None:
        metadata = _merge_metadata(metadata, body.fallbacks)
    if metadata is not None:
        payload["metadata"] = metadata

    return await client.update_key(payload)


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


@router.post("/keys/regenerate")
async def regenerate_key(
    body: KeyRegenerateRequest,
    client: Annotated[LiteLLMClient, Depends(get_client)],
):
    record = await _find_key_record(client, body.key)
    metadata = dict(record.get("metadata") or {})
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
    try:
        await client.delete_keys([record.get("token") or body.key])
    except HTTPException:
        # Roll back the new key if delete fails so we don't leave duplicates.
        new_token = (new_key or {}).get("key") if isinstance(new_key, dict) else None
        if new_token:
            try:
                await client.delete_keys([new_token])
            except HTTPException:
                pass
        raise
    return new_key


@router.post("/keys/clone")
async def clone_key(
    body: KeyCloneRequest,
    client: Annotated[LiteLLMClient, Depends(get_client)],
):
    record = await _find_key_record(client, body.key)
    payload: dict[str, Any] = {
        "key_alias": body.new_alias,
        "models": record.get("models") or [],
        "metadata": dict(record.get("metadata") or {}),
    }
    if record.get("max_budget") is not None:
        payload["max_budget"] = record["max_budget"]
    return await client.generate_key(payload)


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
