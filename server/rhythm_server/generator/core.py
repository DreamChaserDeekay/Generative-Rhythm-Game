"""Generator orchestration with the difficulty adjustment loop."""

from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from typing import Any

import numpy as np

from ..analysis.stems import STEM_NAMES
from ..config import difficulty_config, difficulty_order, key_modes, load_config
from ..difficulty.estimator import estimate
from ..difficulty.consistency import chart_consistency
from ..difficulty.patterns import pattern_summary
from .candidates import TRIPLETS, build_candidates, swing_bars
from .effects import camera_effects
from .ending import finish as ending_hold
from .lanes import Choice, LaneInfo, key_lanes_of, lane_infos, lane_search, notes_from_choices
from .motifs import SlotPlan
from .linter import lint
from .near import merge_near
from .params import GenParams, resolve_params
from .planner import plan_patterns
from . import sections as sectioned
from .repeat import consistency, repeat_references, repeat_targets
from .rolls import song_rolls
from .select import MAX_CHORD_RATIO, Slot, select_slots
from .tempo import TempoMap

GENERATOR_VERSION = "0.9.38"
MAX_SCALE = 4.0
MIN_SCALE = 0.15
DENSITY_FLOOR = 0.8
STALL_SHARE = 0.02  # a round within the level range, rated above its middle, that thins less than this share ends the fit
SILENCE_LEVEL = 0.15  # energy curve value (0 = -60 dB) below which the song counts as silent  # share of the preset's minimum average NPS a chart keeps at least


class GenerationError(RuntimeError):
    pass


class TierNotMade(GenerationError):
    """The song has no chart on the tier: the top tier of a song too calm for it (difficulty.json songFit)."""


def default_seed(audio_hash: str, key_mode: str, difficulty: str, target_level: int | None) -> int:
    """Stable per song/mode/difficulty, so the default chart of a song never changes."""
    digest = hashlib.sha256(f"{audio_hash}|{key_mode}|{difficulty}|{target_level}".encode()).hexdigest()
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


def _plan_of(notes: list[dict[str, Any]], lanes: list[LaneInfo]) -> dict[int, float]:
    """Key position of a chart's single notes by beat (beat * sections.GRID): a chord says nothing
    clear of where the line goes (its mean, or its top key, took the easy charts' stairs)."""
    at: dict[int, list[float]] = {}
    for n in notes:
        if lanes[n["lane"]].kind == "key":
            at.setdefault(round(n["beat"] * sectioned.GRID), []).append(lanes[n["lane"]].pos)
    return {k: v[0] for k, v in at.items() if len(v) == 1}


def lane_plan(
    analysis: dict[str, Any], key_mode: str, tier: str, overrides: dict[str, Any] | None = None
) -> tuple[dict[int, float] | None, float | None]:
    """The song's plan (patterns.json sectioned.tierPlan): where the top tier's first round, with
    the chart's options and its default seed, plays at each beat. The industry derives the easier
    charts from the hardest one and keeps its motion (PATTERN_DESIGN 68). With it the round's
    rating: how hard the song is at the top tier's own density (difficulty.json songFit)."""
    try:
        first = generate_chart(analysis, key_mode, tier, overrides=overrides, _plan_round=True)
    except GenerationError:
        return None, None
    return _plan_of(first["notes"], lane_infos(key_mode)), first["rating"]


def song_place(strength: float, fit: dict[str, Any]) -> float:
    """Where in its tier's level range a song's chart aims (0 the bottom, 1 the top), by the top
    tier's first-round rating (difficulty.json songFit)."""
    return float(np.clip((strength - float(fit["from"])) / (float(fit["to"]) - float(fit["from"])), 0.0, 1.0))


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
    *,
    _plan_round: bool = False,
) -> dict[str, Any]:
    """A chart of the song. `_plan_round` (lane_plan) stops after the level loop's first round and
    returns only {"notes": ..., "rating": ...}. Raises TierNotMade for the top tier of a song too
    calm for it (difficulty.json songFit; a chart asked for at a level is always made)."""
    params = resolve_params(key_mode, difficulty, target_level, overrides)
    if seed is None:
        seed = default_seed(analysis.get("audioHash", ""), key_mode, params.difficulty, params.target_level)
    tempo = TempoMap(analysis["timing"])
    cfg = difficulty_config()
    lanes = lane_infos(key_mode)
    kinds = {l.kind for l in lanes}
    special_kind = "scratch" if "scratch" in kinds else "side" if "side" in kinds else None
    duration = float(analysis["durationMs"])
    # the triplet grid opens in the bars that swing
    swing = swing_bars(analysis, tempo)
    straight = not swing
    if straight:
        params = replace(params, subdivisions=tuple(s for s in params.subdivisions if s not in TRIPLETS))
    candidates = build_candidates(analysis, tempo, params, float(cfg["snapToleranceMs"]), swing)
    if not candidates:
        raise GenerationError("채보로 만들 소리를 찾지 못했습니다")
    rolls = song_rolls(analysis, tempo, params, float(cfg["snapToleranceMs"]), candidates)

    key_count = sum(1 for l in lanes if l.kind == "key")
    key_hands = tuple(l.hand for l in lanes if l.kind == "key")
    factor = params.level_factor
    table = params.level_table
    lo, hi = params.levels
    # Aim at the middle of the level range: the effective NPS halfway through it (4K scale); a
    # default chart aims where the song's strength puts it (songFit, set once that is known)
    def aim(place: float) -> tuple[float, float]:
        rating = lo + place * (hi - lo) + 0.5
        return rating, float(np.interp(rating, np.arange(1, len(table) + 1), table)) * factor

    target_rating, target_eff = aim(0.5)
    # Never thin a chart in its level range below the preset's density floor just because
    # chords/jacks rate it high; this keeps note counts increasing from one difficulty to the next.
    floor_nps = params.min_avg_nps * DENSITY_FLOOR
    scale = 1.0
    chord_scale = 1.0
    best: tuple[tuple[int, float], list[dict[str, Any]], dict[str, Any], list[Slot], list[Choice], list[SlotPlan] | None, float | None] | None = None
    exhausted = False
    sections = analysis.get("sections", [])
    engine = params.pattern_engine
    prev_count = None
    prev_notes: int | None = None
    relax = False
    loud = _loudness_gate(analysis)
    # the song's plan (patterns.json sectioned.tierPlan): every tier moves the way the top tier's
    # first round does; the plan takes the chart's options (a player who turns the instrument lanes
    # or the repeats off gets that in the plan too). The top tier takes its own first round, whatever
    # its seed or level: building the default one too cost it a round (5.2 s on the 4-minute song)
    plan_cfg = sectioned.sectioned_config().get("tierPlan")
    lanes_plan: dict[int, float] | None = None
    own_plan = False
    # the song's strength (songFit): the top tier's first round with its default seed, which the
    # top tier with that seed makes itself, and the plan's round of the other tiers
    fit = cfg.get("songFit") if params.target_level is None and not _plan_round else None
    top = difficulty_order()[-1]
    is_top = params.difficulty == top
    own_strength = fit is not None and is_top and seed == default_seed(analysis.get("audioHash", ""), key_mode, top, None)
    strength: float | None = None
    if not _plan_round:
        own_plan = engine == "sectioned" and bool(plan_cfg) and is_top
        wants_plan = engine == "sectioned" and bool(plan_cfg) and not own_plan
        if wants_plan or (fit is not None and not own_strength):
            top_plan, strength = lane_plan(analysis, key_mode, top, overrides)
            if wants_plan:
                lanes_plan = top_plan

    def place(found: float) -> tuple[float, float, float]:
        """The target (rating, effective NPS) and density floor of a song of strength `found`: a
        song placed low in the range thins further (songFit floorAtBottom; with the tier's floor
        every song stopped there, whatever its place)."""
        assert fit is not None
        if is_top and found < float(fit["from"]):
            raise TierNotMade(f"이 곡에는 {top} 채보가 없습니다")
        at = song_place(found, fit)
        low = float(fit["floorAtBottom"])
        return (*aim(at), params.min_avg_nps * DENSITY_FLOOR * (low + (1.0 - low) * at))

    if fit is not None and strength is not None:
        target_rating, target_eff, floor_nps = place(strength)
    # the top tier keeps to its own first round harder: its later rounds are the chart the plan
    # stands for, and they drifted from it (4 rounds on the test song)
    plan_weight = float(plan_cfg["ownWeight"] if own_plan else plan_cfg["weight"]) if plan_cfg else 0.0
    rounds = 0
    while rounds < int(cfg["maxAdjustIterations"]):
        rounds += 1
        kept = None
        if engine == "sectioned":
            lay = sectioned.layout(candidates, sections, params, tempo, scale, special_kind, key_count, chord_scale, loud, relax)
            slots = lay.slots
            plan = plan_patterns(slots, sections, params, key_hands, tempo, lay.phrases, lay.phrase_keys, seed)
            choices, kept = sectioned.place(lay, lanes, params, tempo, np.random.default_rng(seed), plan, lanes_plan, plan_weight)
        else:
            slots = select_slots(candidates, params, tempo, scale, special_kind, key_count, chord_scale)
            plan = plan_patterns(slots, sections, params, key_hands, tempo, seed=seed) if engine == "designer" else None
            choices = lane_search(slots, lanes, params, tempo, np.random.default_rng(seed), plan=plan)
        notes = merge_near(notes_from_choices(slots, choices, tempo, lanes, plan), lanes, params, tempo)
        est = estimate(notes, key_mode, len(lanes), duration, params.min_jack_ms, table, factor)
        if _plan_round:
            return {"notes": notes, "rating": est["rating"]}
        if own_plan and lanes_plan is None:
            lanes_plan = _plan_of(notes, lanes)
        if own_strength and strength is None:
            strength = est["rating"]
            target_rating, target_eff, floor_nps = place(strength)
        rank = (_level_distance(est["level"], params.levels), abs(est["rating"] - target_rating))
        improved = best is None or rank < best[0]
        if improved:
            best = (rank, notes, est, slots, choices, plan, kept)
        if rank[0] == 0 and rank[1] <= 0.75:
            break
        if (
            rank[0] == 0 and not improved and est["rating"] > target_rating and prev_notes is not None
            and len(notes) > (1.0 - STALL_SHARE) * prev_notes
        ):
            # within the level range but rated above its middle, and thinning no longer takes notes
            # off (the density floor; long notes rate a chart a little high): more rounds only cost time
            break
        prev_notes = len(notes)
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
        # the level range comes first: the floor only stops thinning a chart already in its range
        # (GRG tiers stayed at their floor on real songs, 6K EXPERT around level 14 of its 10-12)
        if new_scale < scale and est["level"] <= params.levels[1] and avg * new_scale / scale < floor_nps:
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
            notes = merge_near(notes, lanes, params, tempo)
            est = estimate(notes, key_mode, len(lanes), duration, params.min_jack_ms, table, factor)
    if ending_hold(notes, analysis, tempo, params, lanes, SILENCE_LEVEL):
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
        "effects": camera_effects(analysis.get("sections", []), tempo, notes, lane_infos(key_mode), analysis.get("onsets", []),
                                  [(candidates[r.hits[0]].beat, candidates[r.hits[-1]].beat) for r in rolls]),
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
