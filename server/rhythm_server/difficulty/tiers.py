"""A difficulty tier of a key mode (config/difficulty.json presets): the levels it covers and what
the level estimate reads of it."""

from __future__ import annotations

from dataclasses import dataclass

from ..config import difficulty_config, key_modes, level_table_for, max_level


@dataclass(frozen=True)
class Tier:
    difficulty: str
    key_mode: str
    # the tier's level range, or (level, level) for a chart asked for at a level
    levels: tuple[int, int]
    target_level: int | None
    # same-lane repeats closer than this count as jacks in the level estimate
    min_jack_ms: float
    # effective NPS at levels 1..N, and what divides a chart's effective NPS before the lookup
    level_table: tuple[float, ...]
    level_factor: float


def resolve_tier(key_mode: str, difficulty: str, target_level: int | None = None) -> Tier:
    """The tier of a chart request (ValueError for an unknown key mode or tier). A level outside the
    tier's range gets the tier that covers it."""
    cfg = difficulty_config()
    if key_mode not in key_modes():
        raise ValueError(f"unknown key mode: {key_mode}")
    tiers = cfg["presets"]
    if difficulty not in tiers:
        raise ValueError(f"unknown difficulty: {difficulty}")
    if target_level is not None:
        target_level = max(int(tiers[cfg["order"][0]]["levels"][0]), min(max_level(), int(target_level)))
        lo, hi = tiers[difficulty]["levels"]
        if not lo <= target_level <= hi:
            covering = [d for d in cfg["order"] if tiers[d]["levels"][0] <= target_level <= tiers[d]["levels"][1]]
            if covering:
                difficulty = covering[0]
    preset = tiers[difficulty]
    lo, hi = preset["levels"]
    table, factor = level_table_for(key_mode)
    return Tier(
        difficulty=difficulty, key_mode=key_mode,
        levels=(target_level, target_level) if target_level is not None else (int(lo), int(hi)),
        target_level=target_level, min_jack_ms=float(preset["minJackMs"]), level_table=tuple(table), level_factor=factor,
    )
