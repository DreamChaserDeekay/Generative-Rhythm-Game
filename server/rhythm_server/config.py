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


DEFAULT_SYSTEM = "GRG"


def difficulty_system(name: str | None = None) -> dict[str, Any]:
    """A difficulty system with its tiers (presets), level table and key mode factors.

    GRG is the five-step system at the top of config/difficulty.json; DJMAX and EZ2ON (under
    "systems") follow those games' tiers, level scales and per-level chart character. A tier may
    bring its own level table (DJMAX SC levels are a separate scale).
    """
    cfg = difficulty_config()
    name = name or DEFAULT_SYSTEM
    if name == DEFAULT_SYSTEM:
        return {
            "id": DEFAULT_SYSTEM,
            "maxLevel": len(cfg["levelEffectiveNps"]),
            "order": cfg["order"],
            "tiers": cfg["presets"],
            "levelEffectiveNps": cfg["levelEffectiveNps"],
            "keyModeNpsFactor": cfg["keyModeNpsFactor"],
            "aliases": {},
        }
    system = cfg.get("systems", {}).get(name)
    if not isinstance(system, dict) or "tiers" not in system:
        raise ValueError(f"unknown difficulty system: {name}")
    return {
        "id": name,
        "maxLevel": int(system["maxLevel"]),
        "order": system["order"],
        "tiers": system["tiers"],
        "levelEffectiveNps": system["levelEffectiveNps"],
        "keyModeNpsFactor": {**cfg["keyModeNpsFactor"], **system.get("keyModeNpsFactor", {})},
        "aliases": system.get("aliases", {}),
    }


def difficulty_systems() -> list[str]:
    return [DEFAULT_SYSTEM, *(k for k, v in difficulty_config().get("systems", {}).items() if isinstance(v, dict) and "tiers" in v)]


def level_table_for(system: dict[str, Any], tier: str, key_mode: str) -> tuple[list[float], float]:
    """Level table of a tier (its own, or the system's) and the factor dividing effective NPS.
    A table per key mode is already calibrated for that mode (factor 1); a single table is for 4K
    and is scaled by the key mode factor."""
    table = system["tiers"].get(tier, {}).get("levelEffectiveNps", system["levelEffectiveNps"])
    if isinstance(table, dict):
        return [float(v) for v in table.get(key_mode, table["4K"])], 1.0
    return [float(v) for v in table], float(system["keyModeNpsFactor"].get(key_mode, 1.0))
