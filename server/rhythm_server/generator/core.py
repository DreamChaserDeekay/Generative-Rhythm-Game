"""Generator orchestration with the difficulty adjustment loop."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import numpy as np

from ..config import difficulty_config, key_modes
from ..difficulty.estimator import estimate
from .candidates import build_candidates
from .lanes import assign_lanes, lane_infos
from .linter import lint
from .params import GenParams, resolve_params
from .select import MAX_CHORD_RATIO, select_slots
from .tempo import TempoMap

GENERATOR_VERSION = "0.1.0"
MAX_SCALE = 4.0
MIN_SCALE = 0.15
DENSITY_FLOOR = 0.8  # share of the preset's minimum average NPS a chart keeps at least


class GenerationError(RuntimeError):
    pass


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
) -> dict[str, Any]:
    params = resolve_params(key_mode, difficulty, target_level, overrides)
    if seed is None:
        seed = default_seed(analysis.get("audioHash", ""), key_mode, params.difficulty, params.target_level)
    tempo = TempoMap(analysis["timing"])
    cfg = difficulty_config()
    lanes = lane_infos(key_mode)
    has_scratch = any(l.kind == "scratch" for l in lanes)
    duration = float(analysis["durationMs"])
    candidates = build_candidates(analysis, tempo, params, float(cfg["snapToleranceMs"]))
    if not candidates:
        raise GenerationError("채보로 만들 소리를 찾지 못했습니다")

    key_count = sum(1 for l in lanes if l.kind == "key")
    factor = float(cfg["keyModeNpsFactor"].get(key_mode, 1.0))
    table = cfg["levelEffectiveNps"]
    lo, hi = params.levels
    # Aim at the middle of the level range: the effective NPS halfway through it (4K scale).
    target_rating = (lo + hi) / 2 + 0.5
    target_eff = float(np.interp(target_rating, np.arange(1, len(table) + 1), table)) * factor
    # Never thin a chart below the preset's density floor just because chords/jacks rate it high;
    # this keeps note counts increasing from one difficulty to the next.
    floor_nps = float(cfg["presets"][params.difficulty]["avgNps"][0]) * factor * DENSITY_FLOOR
    scale = 1.0
    chord_scale = 1.0
    best: tuple[tuple[int, float], list[dict[str, Any]], dict[str, Any]] | None = None
    exhausted = False
    for _ in range(int(cfg["maxAdjustIterations"])):
        slots = select_slots(candidates, params, tempo, scale, has_scratch, key_count, chord_scale)
        notes = assign_lanes(slots, lanes, params, tempo, np.random.default_rng(seed))
        est = estimate(notes, key_mode, len(lanes), duration, params.min_jack_ms)
        rank = (_level_distance(est["level"], params.levels), abs(est["rating"] - target_rating))
        if best is None or rank < best[0]:
            best = (rank, notes, est)
        if rank[0] == 0 and rank[1] <= 0.75:
            break
        eff = max(0.3, est["effectiveNps"])
        if eff < target_eff and len(slots) >= 0.97 * len(candidates):
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
    _, notes, est = best
    problems = lint(notes, lanes, params, tempo)
    if problems:
        raise GenerationError("생성된 채보가 플레이 규칙을 어겼습니다: " + "; ".join(problems[:5]))

    meta = meta or {}
    mode_cfg = key_modes()[key_mode]
    chart_id = chart_id_for(analysis, key_mode, params, seed)
    beat0_ms = float(analysis["timing"]["offsetMs"])
    sections = [
        {"startBeat": s["startBeat"], "label": s["label"], "energy": s["energy"]}
        for s in analysis.get("sections", [])
        if s["t"] >= beat0_ms - 1
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
            "generator": {
                "version": GENERATOR_VERSION,
                "analyzer": f"{analysis['analyzer']['name']}-{analysis['analyzer']['version']}",
                "seed": seed,
                "params": params.public(),
            },
        },
        "timing": analysis["timing"],
        "sections": sections,
        "notes": notes,
    }
