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


# the difficulty system of the tiers of 2026-11-19 (config/difficulty.json): a generated chart's
# meta.difficultySystem, and the charts table's system (api/library.py); charts made on the tiers
# before are of "GRG"
TIERS_SYSTEM = "GRG2"


def difficulty_config() -> dict[str, Any]:
    return load_config("difficulty")


def difficulty_order() -> list[str]:
    """The difficulty tiers, easiest first (EASY, NORMAL, HARD, EXPERT, ELITE)."""
    return list(difficulty_config()["order"])


def tier_for_level(level: float) -> str:
    """The tier whose level range holds a level (below the first: the first; above the last: the last)."""
    cfg = difficulty_config()
    for name in cfg["order"]:
        if level <= cfg["presets"][name]["levels"][1]:
            return name
    return cfg["order"][-1]


def saved_chart_tier(difficulty: str | None, level: Any) -> str | None:
    """The tier an edited or imported chart shows under: its own, unless that is no tier now
    (MASTER, of the tiers before 2026-11-19) or its level is outside that tier's range (an ELITE of
    13-16 from then), when it is the tier its level is in."""
    presets = difficulty_config()["presets"]
    if not isinstance(level, (int, float)):
        return difficulty if difficulty in presets else None
    if difficulty in presets and presets[difficulty]["levels"][0] <= level <= presets[difficulty]["levels"][1]:
        return difficulty
    return tier_for_level(level)


def max_level() -> int:
    return len(difficulty_config()["levelEffectiveNps"])


def level_table_for(key_mode: str) -> tuple[list[float], float]:
    """The 4K level table and the key mode factor that divides a chart's effective NPS before the
    lookup."""
    cfg = difficulty_config()
    return [float(v) for v in cfg["levelEffectiveNps"]], float(cfg["keyModeNpsFactor"].get(key_mode, 1.0))
