from __future__ import annotations

import json
from typing import Any

import asyncpg

from .config import Settings

_pool: asyncpg.Pool | None = None


async def get_pool(settings: Settings) -> asyncpg.Pool | None:
    global _pool
    if _pool is not None:
        return _pool
    if not settings.database_url:
        return None
    _pool = await asyncpg.create_pool(
        settings.database_url, min_size=1, max_size=5, command_timeout=15
    )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def reset_pool() -> None:
    await close_pool()


def _coerce_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return value
    return value


async def fetch_key_row(settings: Settings, token: str) -> dict[str, Any] | None:
    pool = await get_pool(settings)
    if not pool:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT * FROM "LiteLLM_VerificationToken" WHERE token = $1',
            token,
        )
    if not row:
        return None
    record: dict[str, Any] = {}
    for k, v in dict(row).items():
        record[k] = _coerce_json(v)
    return record


async def fetch_token_by_alias(settings: Settings, alias: str) -> str | None:
    pool = await get_pool(settings)
    if not pool:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT token FROM "LiteLLM_VerificationToken" '
            'WHERE key_alias = $1 ORDER BY created_at DESC NULLS LAST LIMIT 1',
            alias,
        )
    return row["token"] if row else None


async def list_tables(settings: Settings) -> list[dict[str, Any]]:
    pool = await get_pool(settings)
    if not pool:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
            """
        )
    return [dict(r) for r in rows]


async def update_key_router_settings(
    settings: Settings, token: str, value: dict[str, Any]
) -> bool:
    pool = await get_pool(settings)
    if not pool:
        return False
    payload = json.dumps(value)
    async with pool.acquire() as conn:
        result = await conn.execute(
            'UPDATE "LiteLLM_VerificationToken" '
            "SET router_settings = $1::jsonb "
            "WHERE token = $2",
            payload,
            token,
        )
    # asyncpg returns "UPDATE n"; treat any successful execute as success
    return result.startswith("UPDATE")


async def fetch_router_settings(settings: Settings) -> dict[str, Any]:
    pool = await get_pool(settings)
    if not pool:
        return {}

    async with pool.acquire() as conn:
        # LiteLLM has stored router_settings differently across versions.
        # Try every shape we know of and merge what we find.
        candidates = [
            ('SELECT param_value FROM "LiteLLM_Config" WHERE param_name = $1', "router_settings"),
            ('SELECT field_value FROM "LiteLLM_Config" WHERE field_name = $1', "router_settings"),
            ('SELECT router_settings FROM "LiteLLM_ProxySettingsTable" LIMIT 1', None),
        ]
        for sql, arg in candidates:
            try:
                row = await conn.fetchrow(sql, arg) if arg else await conn.fetchrow(sql)
            except Exception:
                continue
            if row:
                value = list(row.values())[0]
                value = _coerce_json(value)
                if isinstance(value, dict):
                    return value
        return {}
