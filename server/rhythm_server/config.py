"""Paths and shared tuning config (the repository's config/ directory)."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

PACKAGE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PACKAGE_DIR.parent.parent
CONFIG_DIR = Path(os.environ.get("GRG_CONFIG_DIR", REPO_ROOT / "config"))
CLIENT_DIST = Path(os.environ.get("GRG_CLIENT_DIST", REPO_ROOT / "client" / "dist"))
SAMPLE_RATE = 44100


def data_dir() -> Path:
    return Path(os.environ.get("GRG_DATA_DIR", REPO_ROOT / "data"))


@lru_cache(maxsize=None)
def load_config(name: str) -> dict[str, Any]:
    with open(CONFIG_DIR / f"{name}.json", encoding="utf-8") as f:
        return json.load(f)


def key_modes() -> dict[str, Any]:
    return load_config("keymodes")["modes"]


def difficulty_config() -> dict[str, Any]:
    return load_config("difficulty")


def difficulty_order() -> list[str]:
    """The difficulty tiers, easiest first (NORMAL, HARD, EXPERT, ELITE, MASTER)."""
    return list(difficulty_config()["order"])


def max_level() -> int:
    return len(difficulty_config()["levelEffectiveNps"])


def level_table_for(key_mode: str) -> tuple[list[float], float]:
    """The 4K level table and the key mode factor that divides a chart's effective NPS before the
    lookup."""
    cfg = difficulty_config()
    return [float(v) for v in cfg["levelEffectiveNps"]], float(cfg["keyModeNpsFactor"].get(key_mode, 1.0))
