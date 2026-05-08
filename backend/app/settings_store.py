from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

SETTINGS_PATH = Path(os.environ.get("SETTINGS_PATH", "/data/settings.json"))

EDITABLE_KEYS = {
    "litellm_base_url",
    "litellm_master_key",
    "database_url",
    "cors_origins",
}


def load() -> dict[str, Any]:
    if not SETTINGS_PATH.exists():
        return {}
    try:
        data = json.loads(SETTINGS_PATH.read_text())
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def save(data: dict[str, Any]) -> None:
    clean = {k: v for k, v in data.items() if k in EDITABLE_KEYS}
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(clean, indent=2))
    tmp.replace(SETTINGS_PATH)
