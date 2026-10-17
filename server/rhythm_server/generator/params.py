"""Difficulty presets -> generation parameters."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from ..config import difficulty_config, key_modes

STYLES = ("balanced", "stream", "chord", "jack", "longnote", "technical", "melody")
RHYTHM_SOURCES = ("auto", "drum", "bass", "melody", "vocal")


@dataclass
class GenParams:
    difficulty: str
    key_mode: str
    levels: tuple[int, int]
    target_level: int | None
    avg_nps: float
    peak_nps: float
    subdivisions: tuple[int, ...]
    partial: dict[int, float]
    max_chord: int
    chord_ratio: float
    long_note_ratio: float
    min_ln_beats: float
    min_jack_ms: float
    hand_chord_limit: int
    hold_hand_limit: int
    max_holds_per_hand: int
    scratch_rate: float
    high_band_weight: float
    density: float = 1.0
    style: str = "balanced"
    rhythm_source: str = "auto"
    extra: dict[str, Any] = field(default_factory=dict)

    def public(self) -> dict[str, Any]:
        """The user-facing subset stored in chart meta (and hashed into the chart id)."""
        return {
            "difficulty": self.difficulty,
            "targetLevel": self.target_level,
            "density": round(self.density, 3),
            "longNoteRatio": round(self.long_note_ratio, 3),
            "maxChord": self.max_chord,
            "style": self.style,
            "rhythmSource": self.rhythm_source,
        }

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def resolve_params(
    key_mode: str,
    difficulty: str,
    target_level: int | None = None,
    overrides: dict[str, Any] | None = None,
) -> GenParams:
    cfg = difficulty_config()
    if key_mode not in key_modes():
        raise ValueError(f"unknown key mode: {key_mode}")
    order = cfg["order"]
    if target_level is not None:
        target_level = max(1, min(15, int(target_level)))
        difficulty = next(d for d in order if cfg["presets"][d]["levels"][0] <= target_level <= cfg["presets"][d]["levels"][1])
    if difficulty not in cfg["presets"]:
        raise ValueError(f"unknown difficulty: {difficulty}")
    p = cfg["presets"][difficulty]
    lo, hi = p["levels"]
    factor = float(cfg["keyModeNpsFactor"].get(key_mode, 1.0))
    # Position of the target inside the preset's level range picks the starting density.
    frac = 0.5 if target_level is None else (target_level - lo) / max(1, hi - lo)
    avg = p["avgNps"][0] + frac * (p["avgNps"][1] - p["avgNps"][0])
    levels = (target_level, target_level) if target_level is not None else (lo, hi)
    params = GenParams(
        difficulty=difficulty,
        key_mode=key_mode,
        levels=levels,
        target_level=target_level,
        avg_nps=avg * factor,
        peak_nps=float(p["peakNps1s"]) * factor,
        subdivisions=tuple(int(s) for s in p["subdivisions"]),
        partial={int(k): float(v) for k, v in p.get("partialSubdivisions", {}).items()},
        max_chord=int(p["maxChord"]),
        chord_ratio=float(p["chordRatio"]),
        long_note_ratio=float(p["longNoteRatio"]),
        min_ln_beats=float(p["minLnBeats"]),
        min_jack_ms=float(p["minJackMs"]),
        hand_chord_limit=int(p["handChordLimit"]),
        hold_hand_limit=int(p["holdHandLimit"]),
        max_holds_per_hand=int(p.get("maxHoldsPerHand", 1)),
        scratch_rate=float(p["scratchRate"]),
        high_band_weight=float(p["highBandWeight"]),
    )
    for key, value in (overrides or {}).items():
        if value is None:
            continue
        if key == "density":
            params.density = max(0.5, min(1.5, float(value)))
        elif key == "longNoteRatio":
            params.long_note_ratio = max(0.0, min(0.5, float(value)))
        elif key == "maxChord":
            params.max_chord = max(1, min(params.max_chord, int(value)))
        elif key == "style" and value in STYLES:
            params.style = value
        elif key == "rhythmSource" and value in RHYTHM_SOURCES:
            params.rhythm_source = value
    return params
