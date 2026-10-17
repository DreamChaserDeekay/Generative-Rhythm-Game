"""Difficulty presets -> generation parameters."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from ..config import difficulty_config, key_modes, load_config

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
    side_rate: float
    high_band_weight: float
    density: float = 1.0
    style: str = "balanced"
    rhythm_source: str = "auto"
    instrument_mapping: float = 0.6  # 0 = off, 1 = strong pull of drums/bass toward their lane regions
    repeat_consistency: float = 1.0  # 0 = off, 1 = reuse the first occurrence's lanes in repeated sections
    extra: dict[str, Any] = field(default_factory=dict)

    def public(self) -> dict[str, Any]:
        """The user-facing subset stored in chart meta (and hashed into the chart id)."""
        return {
            "difficulty": self.difficulty,
            "targetLevel": self.target_level,
            "density": round(self.density, 3),
            "longNoteRatio": round(self.long_note_ratio, 3),
            "maxChord": self.max_chord,
            "scratchRate": round(self.scratch_rate, 3),
            "sideRate": round(self.side_rate, 3),
            "style": self.style,
            "rhythmSource": self.rhythm_source,
            "instrumentMapping": round(self.instrument_mapping, 3),
            "repeatConsistency": round(self.repeat_consistency, 3),
        }

    def weight(self, name: str, default: float = 1.0) -> float:
        """A style weight (see "styles" in config/difficulty.json)."""
        value = self.extra.get(name, default)
        return float(value) if isinstance(value, (int, float)) else default

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
        side_rate=float(p.get("sideRate", 0.0)),
        high_band_weight=float(p["highBandWeight"]),
    )
    overrides = {k: v for k, v in (overrides or {}).items() if v is not None}
    style = overrides.get("style")
    if style in STYLES:
        params.style = style
    _apply_style(params, cfg["styles"].get(params.style, {}))
    instruments = load_config("instruments")
    params.instrument_mapping = float(instruments["laneMapping"]["strength"])
    params.repeat_consistency = float(instruments["repeat"]["strength"])
    limits = cfg["overrideLimits"]

    def clamp(key: str, value: Any) -> float:
        lo, hi = limits[key]
        return max(float(lo), min(float(hi), float(value)))

    # Explicit values from the UI win over the style.
    for key, value in overrides.items():
        if key == "density":
            params.density = clamp("density", value)
        elif key == "longNoteRatio":
            params.long_note_ratio = clamp("longNoteRatio", value)
        elif key == "maxChord":
            params.max_chord = max(1, min(int(p["maxChord"]) + 1, int(value)))
        elif key == "scratchRate":
            params.scratch_rate = clamp("scratchRate", value)
        elif key == "sideRate":
            params.side_rate = clamp("sideRate", value)
        elif key == "rhythmSource" and value in RHYTHM_SOURCES:
            params.rhythm_source = value
        elif key == "instrumentMapping":
            params.instrument_mapping = max(0.0, min(1.0, float(value)))
        elif key == "repeatConsistency":
            params.repeat_consistency = max(0.0, min(1.0, float(value)))
    return params


def _apply_style(params: GenParams, style: dict[str, Any]) -> None:
    """Scale the preset by a style; weights for scoring and lane costs go to `extra`."""
    params.chord_ratio = min(0.6, params.chord_ratio * float(style.get("chordRatio", 1.0)))
    params.density = max(0.5, min(1.5, params.density * float(style.get("density", 1.0))))
    params.long_note_ratio = min(0.5, params.long_note_ratio * float(style.get("longNoteRatio", 1.0)))
    params.min_ln_beats = max(0.5, params.min_ln_beats * float(style.get("minLnScale", 1.0)))
    params.min_jack_ms = max(90.0, params.min_jack_ms * float(style.get("minJackScale", 1.0)))
    params.max_chord += int(style.get("maxChordBonus", 0))
    scale = float(style.get("partialScale", 1.0))
    params.partial = {k: min(1.0, v * scale) for k, v in params.partial.items()}
    for key in ("jackWeight", "jackBonus", "alternateWeight", "pitchWeight", "contourWeight", "offbeatBoost", "downbeatBoost", "harmonicBoost"):
        if key in style:
            params.extra[key] = float(style[key])
    if "subdivisionBoost" in style:
        params.extra["subdivisionBoost"] = {int(k): float(v) for k, v in style["subdivisionBoost"].items()}
