from typing import Any

import httpx
from fastapi import HTTPException

from .config import Settings


class LiteLLMClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.litellm_base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {settings.litellm_master_key}",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.request(method, url, headers=self._headers, **kwargs)
            except httpx.HTTPError as e:
                raise HTTPException(status_code=502, detail=f"LiteLLM unreachable: {e}")
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise HTTPException(status_code=resp.status_code, detail=detail)
        if resp.status_code == 204 or not resp.content:
            return None
        try:
            return resp.json()
        except ValueError:
            return resp.text

    async def list_keys(self, **params) -> Any:
        return await self._request("GET", "/key/list", params=params)

    async def generate_key(self, payload: dict) -> Any:
        return await self._request("POST", "/key/generate", json=payload)

    async def update_key(self, payload: dict) -> Any:
        return await self._request("POST", "/key/update", json=payload)

    async def delete_keys(self, keys: list[str]) -> Any:
        return await self._request("POST", "/key/delete", json={"keys": keys})

    async def model_info(self) -> Any:
        return await self._request("GET", "/model/info")
