"""Difficulty presets -> generation parameters."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from ..config import DEFAULT_SYSTEM, difficulty_config, difficulty_system, key_modes, level_table_for, load_config

STYLES = ("balanced", "stream", "chord", "jack", "longnote", "technical", "melody")
RHYTHM_SOURCES = ("auto", "drum", "bass", "melody", "vocal")
PATTERN_ENGINES = ("sectioned", "designer", "classic")
SIDE_HOLD_SHARE = 0.6  # share of side notes that are long holds over sustained sounds (default)
MAX_CHORD_SHARE = 0.6
MAX_LONG_NOTE_SHARE = 0.5


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
    system: str = DEFAULT_SYSTEM
    # effective NPS at levels 1..N of this tier's scale, and what divides a chart's effective NPS
    # before the lookup (the key mode factor for a 4K table, 1 for a table of this key mode)
    level_table: tuple[float, ...] = ()
    level_factor: float = 1.0
    # lowest average NPS of the tier (density floor of the adjustment loop), key mode factor included
    min_avg_nps: float = 0.0
    side_hold_share: float = SIDE_HOLD_SHARE
    # stem weights for the automatic rhythm source (which instruments the tier follows)
    source_mix: dict[str, float] | None = None
    # "SC" for DJMAX SC charts, whose levels are a scale of their own
    level_scale: str | None = None
    # 0..1 position on the five-step scale (GRG levels 1..15) whatever the difficulty system: rules
    # that grow with difficulty use it instead of tier names
    skill: float = 0.5
    # chords a pad cannot press (sets of lane indices), for the DJMAX tiers below SC
    pad_forbidden: tuple[tuple[int, ...], ...] = ()
    # "sectioned" builds the chart from the song structure down (sections.py), "designer" plans
    # patterns per phrase (planner.py), "classic" places notes one by one
    pattern_engine: str = "sectioned"
    # shortest repeat on a shared middle key (either thumb can hit it); 0 = min_jack_ms
    thumb_jack_ms: float = 0.0
    # hits from which an anchor (one lane every other note of a fast run) costs; 0 = no limit
    anchor_cap: int = 0
    # how fast chord sizes fall off from two notes (smaller = more three- and four-note chords)
    chord_size_power: float = 3.0
    extra: dict[str, Any] = field(default_factory=dict)

    def public(self) -> dict[str, Any]:
        """The user-facing subset stored in chart meta (and hashed into the chart id)."""
        system = {} if self.system == DEFAULT_SYSTEM else {"system": self.system}
        engine = {} if self.pattern_engine == "sectioned" else {"patternEngine": self.pattern_engine}
        return {
            **system,
            **engine,
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


def resolve_tier(system: dict[str, Any], difficulty: str) -> str:
    """A tier id of the system from its id, an alias (the five GRG names) or its label."""
    tiers = system["tiers"]
    if difficulty in tiers:
        return difficulty
    alias = system["aliases"].get(difficulty.upper())
    if alias in tiers:
        return alias
    for tier_id, tier in tiers.items():
        if str(tier.get("label", "")).upper() == difficulty.upper():
            return tier_id
    raise ValueError(f"unknown difficulty: {difficulty}")


def skill_for_rating(rating: float) -> float:
    """A five-step rating (GRG levels 1..15) as a 0..1 skill value."""
    return max(0.0, min(1.0, (rating - 1.0) / 14.0))


def chart_skill(tier: dict[str, Any], levels: tuple[int, int]) -> float:
    """Skill value of the level a tier aims at (the middle of its range). Level numbers mean about
    the same on every system and key mode (DJMAX and EZ2ON have nearly the same density per level
    up to 15, and GRG levels were made on the same scale); a tier with a scale of its own maps onto
    it with "levelEquivalent" [offset, slope] (DJMAX SC: SC 2 / 4 / 6 / 8 = levels 12 / 13 / 14 / 15)."""
    lo, hi = levels
    rating = (lo + hi) / 2 + 0.5
    if "levelEquivalent" in tier:
        offset, slope = tier["levelEquivalent"]
        rating = float(offset) + float(slope) * rating
    return skill_for_rating(rating)


def pad_forbidden_lanes(system: dict[str, Any], key_mode: str) -> tuple[tuple[int, ...], ...]:
    ids = [lane["id"] for lane in key_modes()[key_mode]["lanes"]]
    return tuple(tuple(sorted(ids.index(x) for x in chord)) for chord in system["padForbiddenChords"].get(key_mode, []))


def _at(value: Any, frac: float) -> float:
    """A preset value, or [low, high] across the tier's level range."""
    if isinstance(value, (list, tuple)):
        return float(value[0]) + frac * (float(value[1]) - float(value[0]))
    return float(value)


def resolve_params(
    key_mode: str,
    difficulty: str,
    target_level: int | None = None,
    overrides: dict[str, Any] | None = None,
    system: str | None = None,
) -> GenParams:
    cfg = difficulty_config()
    if key_mode not in key_modes():
        raise ValueError(f"unknown key mode: {key_mode}")
    sys_cfg = difficulty_system(system)
    tiers = sys_cfg["tiers"]
    difficulty = resolve_tier(sys_cfg, difficulty)
    if target_level is not None:
        target_level = max(1, min(int(sys_cfg["maxLevel"]), int(target_level)))
        lo, hi = tiers[difficulty]["levels"]
        own_scale = "levelEffectiveNps" in tiers[difficulty]
        if not own_scale and not lo <= target_level <= hi:
            # another tier on the system's level scale covers that level
            covering = [
                d for d in sys_cfg["order"] if "levelEffectiveNps" not in tiers[d] and tiers[d]["levels"][0] <= target_level <= tiers[d]["levels"][1]
            ]
            if covering:
                difficulty = covering[0]
    p = tiers[difficulty]
    lo, hi = p["levels"]
    factor = float(sys_cfg["keyModeNpsFactor"].get(key_mode, 1.0))
    table, level_factor = level_table_for(sys_cfg, difficulty, key_mode)
    # Position of the target inside the preset's level range picks the starting density and the
    # tier's level-dependent character (chords, long notes, side notes).
    frac = 0.5 if target_level is None else min(1.0, max(0.0, (target_level - lo) / max(1, hi - lo)))
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
        chord_ratio=_at(p["chordRatio"], frac),
        long_note_ratio=_at(p["longNoteRatio"], frac),
        min_ln_beats=float(p["minLnBeats"]),
        min_jack_ms=float(p["minJackMs"]),
        hand_chord_limit=int(p["handChordLimit"]),
        hold_hand_limit=int(p["holdHandLimit"]),
        max_holds_per_hand=int(p.get("maxHoldsPerHand", 1)),
        scratch_rate=_at(p["scratchRate"], frac),
        side_rate=_at(p.get("sideRate", 0.0), frac),
        high_band_weight=float(p["highBandWeight"]),
        system=sys_cfg["id"],
        level_table=tuple(table),
        level_factor=level_factor,
        min_avg_nps=float(p["avgNps"][0]) * factor,
        side_hold_share=float(p.get("sideHoldShare", SIDE_HOLD_SHARE)),
        source_mix={k: float(v) for k, v in p["sourceMix"].items()} if "sourceMix" in p else None,
        level_scale=p.get("levelScale"),
        skill=chart_skill(p, levels),
        pad_forbidden=pad_forbidden_lanes(sys_cfg, key_mode) if p.get("padPlayable") else (),
    )
    # the game's habits per key mode (e.g. DJMAX 8B holds fewer long notes than 6B at the same level)
    tendency = sys_cfg.get("keyModeTendency", {}).get(key_mode, {})
    params.chord_ratio = min(MAX_CHORD_SHARE, params.chord_ratio * float(tendency.get("chordRatio", 1.0)))
    params.long_note_ratio = min(MAX_LONG_NOTE_SHARE, params.long_note_ratio * float(tendency.get("longNoteRatio", 1.0)))
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
        elif key == "rhythmSource" and value in RHYTHM_SOURCES and value != "auto":
            params.rhythm_source = value  # "auto" leaves the style's own (the melody style follows the melody)
        elif key == "instrumentMapping":
            params.instrument_mapping = max(0.0, min(1.0, float(value)))
        elif key == "repeatConsistency":
            params.repeat_consistency = max(0.0, min(1.0, float(value)))
        elif key == "patternEngine" and value in PATTERN_ENGINES:
            params.pattern_engine = value
    if params.pattern_engine != "classic":
        for idiom in load_config("patterns")["idioms"]:
            if "chordSizePower" in idiom and idiom.get("keyMode") == key_mode and idiom.get("system", params.system) == params.system:
                params.chord_size_power = float(idiom["chordSizePower"])
    laser = load_config("patterns")["motifs"]["laser"]
    if (
        params.pattern_engine != "classic"
        and params.key_mode in laser.get("keyModes", [])
        and params.system in laser.get("systems", [])
        and params.skill >= float(laser["minSkill"])
    ):
        params.thumb_jack_ms = min(params.min_jack_ms, float(load_config("patterns")["laser"]["thumbJackMs"]))
    if params.pattern_engine != "classic":
        caps = sorted((float(skill), int(hits)) for skill, hits in load_config("patterns")["anchors"]["caps"])
        params.anchor_cap = next((hits for skill, hits in reversed(caps) if params.skill >= skill), 0)
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
    if style.get("rhythmSource") in RHYTHM_SOURCES:
        params.rhythm_source = str(style["rhythmSource"])  # what "auto" follows in this style
