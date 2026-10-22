"""Generator orchestration with the difficulty adjustment loop."""

from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from typing import Any

import numpy as np

from ..analysis.stems import STEM_NAMES
from ..config import DEFAULT_SYSTEM, difficulty_config, key_modes, load_config
from ..difficulty.estimator import estimate
from ..difficulty.consistency import chart_consistency
from ..difficulty.patterns import pattern_summary
from .candidates import TRIPLETS, build_candidates, triplet_bars, triplet_share
from .effects import camera_effects
from .lanes import Choice, LaneInfo, key_lanes_of, lane_infos, lane_search, notes_from_choices
from .motifs import SlotPlan
from .linter import lint
from .params import GenParams, resolve_params
from .planner import plan_patterns
from . import sections as sectioned
from .repeat import consistency, repeat_references, repeat_targets
from .rolls import song_rolls
from .select import MAX_CHORD_RATIO, Slot, select_slots
from .tempo import TempoMap

GENERATOR_VERSION = "0.9.22"
MAX_SCALE = 4.0
MIN_SCALE = 0.15
DENSITY_FLOOR = 0.8
SILENCE_LEVEL = 0.15  # energy curve value (0 = -60 dB) below which the song counts as silent  # share of the preset's minimum average NPS a chart keeps at least


class GenerationError(RuntimeError):
    pass


def default_seed(audio_hash: str, key_mode: str, difficulty: str, target_level: int | None, system: str = DEFAULT_SYSTEM) -> int:
    """Stable per song/mode/difficulty, so the default chart of a song never changes."""
    tier = difficulty if system == DEFAULT_SYSTEM else f"{system}:{difficulty}"
    digest = hashlib.sha256(f"{audio_hash}|{key_mode}|{tier}|{target_level}".encode()).hexdigest()
    return int(digest[:8], 16)


def chart_id_for(analysis: dict[str, Any], key_mode: str, params: GenParams, seed: int) -> str:
    payload = {
        "audioHash": analysis.get("audioHash", ""),
        "analyzer": analysis.get("analyzer"),
        "overrides": analysis.get("overrides", {}),
        "keyMode": key_mode,
        "params": params.public(),
        "seed": seed,
        "generator": GENERATOR_VERSION,
    }
    return "c" + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:20]


def _level_distance(level: int, levels: tuple[int, int]) -> int:
    lo, hi = levels
    return lo - level if level < lo else (level - hi if level > hi else 0)


def generate_chart(
    analysis: dict[str, Any],
    key_mode: str,
    difficulty: str = "NORMAL",
    target_level: int | None = None,
    seed: int | None = None,
    overrides: dict[str, Any] | None = None,
    meta: dict[str, Any] | None = None,
    system: str | None = None,
) -> dict[str, Any]:
    params = resolve_params(key_mode, difficulty, target_level, overrides, system)
    if seed is None:
        seed = default_seed(analysis.get("audioHash", ""), key_mode, params.difficulty, params.target_level, params.system)
    tempo = TempoMap(analysis["timing"])
    cfg = difficulty_config()
    lanes = lane_infos(key_mode)
    kinds = {l.kind for l in lanes}
    special_kind = "scratch" if "scratch" in kinds else "side" if "side" in kinds else None
    duration = float(analysis["durationMs"])
    straight = triplet_share(analysis, tempo) < float(cfg["tripletFeel"]["minShare"])
    if straight:
        params = replace(params, subdivisions=tuple(s for s in params.subdivisions if s not in TRIPLETS))
    feel = cfg["tripletFeel"]
    local = not straight and params.system in feel.get("localSystems", []) and params.skill >= float(feel["localFromSkill"])
    candidates = build_candidates(analysis, tempo, params, float(cfg["snapToleranceMs"]), triplet_bars(analysis, tempo) if local else None)
    if not candidates:
        raise GenerationError("채보로 만들 소리를 찾지 못했습니다")
    song_rolls(analysis, tempo, params, float(cfg["snapToleranceMs"]), candidates)

    key_count = sum(1 for l in lanes if l.kind == "key")
    key_hands = tuple(l.hand for l in lanes if l.kind == "key")
    factor = params.level_factor
    table = params.level_table
    lo, hi = params.levels
    # Aim at the middle of the level range: the effective NPS halfway through it (4K scale).
    target_rating = (lo + hi) / 2 + 0.5
    target_eff = float(np.interp(target_rating, np.arange(1, len(table) + 1), table)) * factor
    # Never thin a chart below the preset's density floor just because chords/jacks rate it high;
    # this keeps note counts increasing from one difficulty to the next.
    floor_nps = params.min_avg_nps * DENSITY_FLOOR
    scale = 1.0
    chord_scale = 1.0
    best: tuple[tuple[int, float], list[dict[str, Any]], dict[str, Any], list[Slot], list[Choice], list[SlotPlan] | None, float | None] | None = None
    exhausted = False
    sections = analysis.get("sections", [])
    engine = params.pattern_engine
    prev_count = None
    relax = False
    loud = _loudness_gate(analysis)
    rounds = 0
    while rounds < int(cfg["maxAdjustIterations"]):
        rounds += 1
        kept = None
        if engine == "sectioned":
            lay = sectioned.layout(candidates, sections, params, tempo, scale, special_kind, key_count, chord_scale, loud, relax)
            slots = lay.slots
            plan = plan_patterns(slots, sections, params, key_hands, tempo, lay.phrases, lay.phrase_keys, seed)
            choices, kept = sectioned.place(lay, lanes, params, tempo, np.random.default_rng(seed), plan)
        else:
            slots = select_slots(candidates, params, tempo, scale, special_kind, key_count, chord_scale)
            plan = plan_patterns(slots, sections, params, key_hands, tempo, seed=seed) if engine == "designer" else None
            choices = lane_search(slots, lanes, params, tempo, np.random.default_rng(seed), plan=plan)
        notes = notes_from_choices(slots, choices, tempo, lanes, plan)
        est = estimate(notes, key_mode, len(lanes), duration, params.min_jack_ms, table, factor)
        rank = (_level_distance(est["level"], params.levels), abs(est["rating"] - target_rating))
        if best is None or rank < best[0]:
            best = (rank, notes, est, slots, choices, plan, kept)
        if rank[0] == 0 and rank[1] <= 0.75:
            break
        eff = max(0.3, est["effectiveNps"])
        # every usable sound is a note (the sectioned engine keeps to the sounds its loops share:
        # it is out of sounds when a denser setting no longer adds notes)
        out_of_sounds = relax or len(slots) >= 0.97 * len(candidates) or (
            engine == "sectioned" and prev_count is not None and len(slots) <= prev_count * 1.02 and scale > 1.0
        )
        prev_count = len(slots)
        if eff < target_eff and out_of_sounds:
            if engine == "sectioned" and not relax:
                # the level comes first: earlier repeats play every sound too (the build-up then
                # only adds notes where the music has more); this is not a density step, so it
                # does not use up one of the rounds, and a denser setting would add nothing after it
                relax = True
                rounds -= 1
                continue
            # Every usable sound is already a note. Do not invent sounds; strong hits may still
            # become (more) chords, which is how dense charts thicken on sparse songs.
            if params.max_chord < 2 or chord_scale * params.chord_ratio >= MAX_CHORD_RATIO:
                exhausted = True
                break
            chord_scale = min(chord_scale * 1.4, MAX_CHORD_RATIO / params.chord_ratio)
            continue
        new_scale = float(np.clip(scale * (target_eff / eff) ** 0.9, MIN_SCALE, MAX_SCALE))
        avg = max(0.1, est["nps"]["avg"])
        if new_scale < scale and avg * new_scale / scale < floor_nps:
            new_scale = max(new_scale, scale * floor_nps / avg)
            if new_scale >= scale - 0.01:
                break  # already at the density floor
        if abs(new_scale - scale) < 0.01:
            break
        scale = new_scale

    assert best is not None
    _, notes, est, slots, choices, plan, repeat_score = best
    if engine != "sectioned" and params.repeat_consistency > 0:
        consistent = _repeat_consistent(slots, choices, sections, lanes, params, tempo, seed, plan)
        if consistent is not None:
            notes, repeat_score = consistent
            est = estimate(notes, key_mode, len(lanes), duration, params.min_jack_ms, table, factor)
    problems = lint(notes, lanes, params, tempo)
    if problems:
        raise GenerationError("생성된 채보가 플레이 규칙을 어겼습니다: " + "; ".join(problems[:5]))

    meta = meta or {}
    mode_cfg = key_modes()[key_mode]
    chart_id = chart_id_for(analysis, key_mode, params, seed)
    beat0_ms = float(analysis["timing"]["offsetMs"])
    sections = [
        {k: s[k] for k in ("startBeat", "endBeat", "label", "group", "energy", "loopBars", "confidence") if s.get(k) is not None}
        for s in analysis.get("sections", [])
        if s.get("endT", s["t"] + 1) > beat0_ms - 1
    ]
    return {
        "formatVersion": 1,
        "meta": {
            "chartId": chart_id,
            "audioHash": analysis.get("audioHash", ""),
            "songId": meta.get("songId"),
            "title": meta.get("title", "Untitled"),
            "artist": meta.get("artist", ""),
            "keyMode": key_mode,
            "lanes": [l["id"] for l in mode_cfg["lanes"]],
            "difficulty": params.difficulty,
            "difficultySystem": params.system,
            **({"levelScale": params.level_scale} if params.level_scale else {}),
            "level": est["level"],
            "rating": est["rating"],
            "durationMs": duration,
            "noteCount": len(notes),
            "nps": est["nps"],
            "effectiveNps": est["effectiveNps"],
            "densityLimited": exhausted,
            "skillset": est["skillset"],
            "handLoad": est["handLoad"],
            "patterns": pattern_summary(notes, key_mode),
            "keysound": keysound_meta(notes),
            "repeatConsistency": None if repeat_score is None else round(repeat_score, 3),
            "consistency": chart_consistency(notes, analysis.get("sections", []), key_mode, tempo.beats_per_bar),
            "generator": {
                "version": GENERATOR_VERSION,
                "analyzer": f"{analysis['analyzer']['name']}-{analysis['analyzer']['version']}",
                "seed": seed,
                "params": params.public(),
            },
        },
        "timing": analysis["timing"],
        "sections": sections,
        "effects": camera_effects(analysis.get("sections", []), tempo),
        "notes": notes,
    }


def _loudness_gate(analysis: dict[str, Any]) -> Any:
    """Whether the song is audible at a time (above SILENCE_LEVEL of the 0..1 energy curve)."""
    values = analysis.get("energy", {}).get("values") or []
    frame = float(analysis.get("energy", {}).get("frameMs", 100)) or 100.0
    if not values:
        return None
    return lambda t: values[min(len(values) - 1, max(0, int(t / frame)))] >= SILENCE_LEVEL


def _repeat_consistent(
    slots: list[Slot],
    choices: list[Choice],
    sections: list[dict[str, Any]],
    lanes: list[LaneInfo],
    params: GenParams,
    tempo: TempoMap,
    seed: int,
    plan: list[SlotPlan] | None = None,
) -> tuple[list[dict[str, Any]], float | None] | None:
    """Re-runs the lane search so repeated sections reuse their first occurrence's lanes.
    References come from the previous pass and are refreshed until they stop changing."""
    refs, occurrence = repeat_references(slots, sections)
    if not any(r is not None for r in refs):
        return None
    cfg = load_config("instruments")["repeat"]
    mirror = cfg.get("variant") == "mirror"
    chosen = key_lanes_of(choices, len(slots), lanes)
    for _ in range(int(cfg.get("passes", 2))):
        targets = repeat_targets(refs, occurrence, chosen, lanes, mirror)
        choices = lane_search(slots, lanes, params, tempo, np.random.default_rng(seed), targets, plan)
        updated = key_lanes_of(choices, len(slots), lanes)
        if updated == chosen:
            break
        chosen = updated
    return notes_from_choices(slots, choices, tempo, lanes, plan), consistency(refs, occurrence, chosen, lanes, mirror)


def keysound_meta(notes: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The main keysound stem shown in the chart info, and the share of notes following each stem:
    the pitched stem (vocals, other, bass) most notes follow, or the drums when the notes hardly
    follow any of those."""
    counts = {name: 0 for name in STEM_NAMES}
    for n in notes:
        if n.get("src") in counts:
            counts[n["src"]] += 1
    total = sum(counts.values())
    if total == 0:
        return None
    pitched = max(("vocals", "other", "bass"), key=lambda k: counts[k])
    min_share = load_config("instruments")["keysound"]["minShare"]
    stem = pitched if counts[pitched] >= min_share * total else "drums"
    return {"stem": stem, "share": round(counts[stem] / total, 3), "shares": {k: round(v / total, 3) for k, v in counts.items()}}
