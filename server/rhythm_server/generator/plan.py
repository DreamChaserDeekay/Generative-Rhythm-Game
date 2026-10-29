"""Section plan (docs/PATTERN_DESIGN.md 74): how dense each unit of the sectioned engine is and how
much of it is chords, relative to the rest of the song, predicted from the music. ManiaGAI plans the
whole song section by section before placing notes (docs/PAPER_SURVEY.md 11); this is the small
version: per unit features of the music (what the candidates and onsets there are, the loudness,
the section it is in), standardised within the song, and a model fitted on human BMS charts that
gives each unit's density and chord share as a log ratio to the song's (config/plan.json).

The features use only analysis fields every analyzer since 1.4 writes, so the model fitted on the
BMS caches reads a new analysis the same way.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Any, Sequence

import numpy as np

from ..config import load_config
from .candidates import Candidate
from .tempo import TempoMap

LABELS = ("intro", "verse", "pre-chorus", "chorus", "drop", "bridge", "outro")
# per unit, in this order (unit_raw)
RAW = (
    "candRate", "scoreRate", "strengthRate", "intensity", "worthRate", "low", "mid", "high", "harmonic", "sustain", "melody",
    "drums", "bass", "vocals", "other", "downbeat", "onBeat", "eighth", "sixteenth", "triplet", "roll", "quiet",
    "onsetRate", "onsetStrength", "pitched", "pitchSpread", "held", "loud", "loudMax", "loudSlope",
    "energy", "loopBars", "occurrence", "occurrences", "lastInGroup", "posInSection", "songPos", "lengthBeats", "first", "last", "accent",
) + tuple("label:" + lab for lab in LABELS)
# features compared within the song (z-score) and, for the rates, as a log ratio to the song's mean
WITHIN = RAW[:30] + ("energy",)
RATES = ("candRate", "scoreRate", "strengthRate", "worthRate", "onsetRate", "loud")
CONTEXT = ("scoreRate", "candRate", "loud", "energy", "onsetRate")
SONG = ("candRate", "scoreRate", "onsetRate", "loud", "sustain", "drums")
# candidates per beat of a kind: the rate times the share (drum hits, sung notes, highs per beat)
SHARED = ("drums", "bass", "vocals", "other", "low", "mid", "high", "melody", "downbeat", "eighth", "sixteenth", "triplet", "roll", "quiet")
CONTEXT_SHARED = ("drums", "vocals", "other", "high", "sixteenth")
# where the unit is in the song, left out of the design: the plan follows the music, not the clock
# (a loop that runs unchanged to the end stays as dense; song-grouped CV density 0.579 -> 0.585)
POSITION = ("songPos", "first", "last")


def plan_config() -> dict[str, Any]:
    return load_config("plan")


def _worth(c: Candidate) -> float:
    """How much a candidate is a chord's sound: strength, spread over the bands, intensity, downbeat
    (sections._chord_worth without the tier's rules)."""
    total = float(np.sum(c.bands)) + 1e-9
    spread = int(np.sum(c.bands / total > 0.22))
    return c.strength * (0.6 + 0.4 * spread) * (0.6 + 0.6 * c.intensity) * (1.4 if c.downbeat else 1.0)


def unit_raw(units: Sequence[Any], cands: Sequence[Candidate], analysis: dict[str, Any], tempo: TempoMap) -> np.ndarray:
    """(units, RAW) features of the music in each unit of the sectioned engine (sections.make_units)."""
    n = len(units)
    out = np.zeros((n, len(RAW)))
    if n == 0:
        return out
    col = {name: i for i, name in enumerate(RAW)}
    beats = np.array([c.beat for c in cands])
    onsets = analysis.get("onsets", [])
    on_t = np.array([float(o["t"]) for o in onsets])
    energy = analysis.get("energy", {}) or {}
    loud = np.asarray(energy.get("values") or [], dtype=np.float64)
    frame = float(energy.get("frameMs", 100.0) or 100.0)
    first = min(u.start for u in units)
    span = max(u.start + u.length for u in units) - first or 1.0
    occurrences: dict[str, int] = {}
    per_section: dict[int, int] = {}
    for u in units:
        occurrences[u.group] = max(occurrences.get(u.group, 0), u.occurrence + 1)
        per_section[u.section] = per_section.get(u.section, 0) + 1
    for k, u in enumerate(units):
        lo, hi = u.start, u.start + u.length
        length = max(u.length, 1e-6)
        row = out[k]
        idx = np.nonzero((beats >= lo) & (beats < hi))[0]
        cs = [cands[i] for i in idx]
        if cs:
            m = len(cs)
            bands = np.array([c.bands / (float(np.sum(c.bands)) + 1e-9) for c in cs])
            row[col["candRate"]] = m / length
            row[col["scoreRate"]] = sum(c.score for c in cs) / length
            row[col["strengthRate"]] = sum(c.strength for c in cs) / length
            row[col["intensity"]] = float(np.mean([c.intensity for c in cs]))
            row[col["worthRate"]] = sum(_worth(c) for c in cs) / length
            row[col["low"]], row[col["mid"]], row[col["high"]] = bands.mean(axis=0)[:3]
            row[col["harmonic"]] = float(np.mean([c.harmonic for c in cs]))
            row[col["sustain"]] = float(np.mean([min(c.sustain_beats, 4.0) for c in cs]))
            row[col["melody"]] = float(np.mean([c.melody or 0.0 for c in cs]))
            src = [c.sources for c in cs if c.sources is not None]
            if src:
                row[col["drums"]], row[col["bass"]], row[col["vocals"]], row[col["other"]] = np.mean(src, axis=0)[:4]
            row[col["downbeat"]] = sum(c.downbeat for c in cs) / m
            subs = [c.subdivision for c in cs]
            row[col["onBeat"]] = sum(s == 1 for s in subs) / m
            row[col["eighth"]] = sum(s == 2 for s in subs) / m
            row[col["sixteenth"]] = sum(s in (4, 8) for s in subs) / m
            row[col["triplet"]] = sum(s in (3, 6) for s in subs) / m
            row[col["roll"]] = sum(c.roll is not None for c in cs) / m
            row[col["quiet"]] = sum(c.quiet for c in cs) / m
        t0, t1 = tempo.beat_to_ms(lo), tempo.beat_to_ms(hi)
        o = np.nonzero((on_t >= t0) & (on_t < t1))[0]
        if len(o):
            pitched = [float(onsets[i]["pitch"]) for i in o if onsets[i].get("pitch") is not None and float(onsets[i].get("harmonic", 0.0)) >= 0.5]
            row[col["onsetRate"]] = len(o) / length
            row[col["onsetStrength"]] = float(np.mean([float(onsets[i]["strength"]) for i in o]))
            row[col["pitched"]] = len(pitched) / len(o)
            row[col["pitchSpread"]] = float(np.std(pitched)) if len(pitched) > 1 else 0.0
            row[col["held"]] = float(np.mean([(float(onsets[i]["sustainEnd"]) - float(onsets[i]["t"])) >= 350.0 if onsets[i].get("sustainEnd") else 0.0 for i in o]))
        if len(loud):
            a, b = int(t0 / frame), max(int(t0 / frame) + 1, int(t1 / frame))
            seg = loud[min(a, len(loud) - 1): min(b, len(loud))]
            if len(seg):
                row[col["loud"]] = float(np.mean(seg))
                row[col["loudMax"]] = float(np.max(seg))
                row[col["loudSlope"]] = float(np.polyfit(np.arange(len(seg)), seg, 1)[0] * len(seg)) if len(seg) > 2 else 0.0
        row[col["energy"]] = u.energy
        row[col["loopBars"]] = u.length / max(1, tempo.beats_per_bar)
        row[col["occurrence"]] = u.occurrence
        row[col["occurrences"]] = occurrences[u.group]
        row[col["lastInGroup"]] = float(u.last_in_group)
        row[col["posInSection"]] = u.pos / max(1, per_section[u.section] - 1)
        row[col["songPos"]] = (lo + 0.5 * u.length - first) / span
        row[col["lengthBeats"]] = u.length
        row[col["first"]] = float(k == 0)
        row[col["last"]] = float(k == n - 1)
        row[col["accent"]] = float(u.accent)
        if u.label in LABELS:
            row[col["label:" + u.label]] = 1.0
    return out


def _mean_by(values: np.ndarray, ids: Sequence[Any]) -> np.ndarray:
    """Each row's mean over the rows sharing its id."""
    out = np.zeros_like(values)
    ids = list(ids)
    for key in set(ids):
        rows = [i for i, x in enumerate(ids) if x == key]
        out[rows] = values[rows].mean(axis=0)
    return out


def design(raw: np.ndarray, groups: Sequence[Any] | None = None) -> np.ndarray:
    """The model's inputs from unit_raw: each music feature as a z-score within the song, the rates
    also as a log ratio to the song's mean, the neighbours' main features and their mean over the
    unit's section and over its repeat group (`groups`, the units' group names), the song's own
    level of a few, and the structure as it is (not the unit's place in the song, POSITION)."""
    n = len(raw)
    col = {name: i for i, name in enumerate(RAW)}
    parts = []
    shared = raw[:, [col[name] for name in SHARED]] * raw[:, [col["candRate"]]]
    w = np.hstack([raw[:, [col[name] for name in WITHIN]], shared])
    mu, sd = w.mean(axis=0), w.std(axis=0)
    z = (w - mu) / np.where(sd > 1e-9, sd, 1.0)
    parts.append(z)
    rates = np.array([raw[:, col[name]] for name in RATES]).T
    rmean = rates.mean(axis=0)
    parts.append(np.log((rates + 0.05 * rmean + 1e-6) / (rmean * 1.05 + 1e-6)))
    zc = z[:, [WITHIN.index(name) for name in CONTEXT] + [len(WITHIN) + SHARED.index(name) for name in CONTEXT_SHARED]]
    prev = np.vstack([zc[:1] * 0.0, zc[:-1]]) if n else zc
    nxt = np.vstack([zc[1:], zc[-1:] * 0.0]) if n else zc
    parts += [prev, nxt]
    sections = np.cumsum(raw[:, col["posInSection"]] == 0) if n else np.zeros(0)
    parts.append(_mean_by(zc, sections))
    parts.append(_mean_by(zc, groups if groups is not None and len(groups) == n else sections))
    song = np.array([raw[:, col[name]].mean() for name in SONG])
    parts.append(np.repeat(np.log1p(np.maximum(song, 0.0))[None, :], n, axis=0))
    structural = [name for name in RAW if name not in WITHIN and name not in POSITION]
    parts.append(np.array([raw[:, col[name]] for name in structural]).T)
    return np.hstack(parts)


_TREES: dict[int, tuple[dict[str, Any], tuple[Any, ...]]] = {}  # model id -> (model, its nodes)


def _tree_arrays(model: dict[str, Any]) -> tuple[Any, ...]:
    """Every tree's nodes in one set of arrays (a leaf's children are itself), the trees' roots and
    the deepest tree's depth; made once per model (plan.json is read once)."""
    held = _TREES.get(id(model))
    if held is None or held[0] is not model:
        if len(_TREES) > 8:
            _TREES.clear()
        parts: list[list[np.ndarray]] = [[], [], [], [], []]
        roots, depth, offset = [], 1, 0
        for t in model["trees"]:
            leaf = np.asarray(t["leaf"], dtype=bool)
            index = np.arange(len(leaf)) + offset
            parts[0].append(np.where(leaf, 0, np.asarray(t["feature"], dtype=np.int64)))
            parts[1].append(np.asarray(t["threshold"], dtype=np.float64))
            parts[2].append(np.where(leaf, index, np.asarray(t["left"], dtype=np.int64) + offset))
            parts[3].append(np.where(leaf, index, np.asarray(t["right"], dtype=np.int64) + offset))
            parts[4].append(np.asarray(t["value"], dtype=np.float64))
            roots.append(offset)
            depth = max(depth, int(t.get("depth", 32)))
            offset += len(leaf)
        held = (model, (*(np.concatenate(p) for p in parts), np.asarray(roots, dtype=np.int64), depth))
        _TREES[id(model)] = held
    return held[1]


def _trees(x: np.ndarray, model: dict[str, Any]) -> np.ndarray:
    """A boosted tree ensemble (plan.json: node arrays per tree; a row goes left when its feature is
    at most the threshold) on rows `x`, every tree a level at a time."""
    feature, threshold, left, right, value, roots, depth = _tree_arrays(model)
    node = np.repeat(roots[None, :], len(x), axis=0)
    rows = np.arange(len(x))[:, None]
    for _ in range(depth):
        nxt = np.where(x[rows, feature[node]] <= threshold[node], left[node], right[node])
        if np.array_equal(nxt, node):
            break
        node = nxt
    return float(model.get("baseline", 0.0)) + value[node].sum(axis=1)


def predict(raw: np.ndarray, target: str, groups: Sequence[Any] | None = None) -> np.ndarray | None:
    """Each unit's `target` ("density" or "chord") as a log ratio to the song's, or None when the
    plan model is off or missing."""
    cfg = plan_config()
    model = (cfg.get("models") or {}).get(target)
    if not cfg.get("enabled", True) or not model or len(raw) == 0:
        return None
    x = design(raw, groups)
    if int(model.get("inputs", x.shape[1])) != x.shape[1]:
        return None  # a model fitted on other inputs than this design gives (an older plan.json)
    if model.get("kind") == "trees":
        return _trees(x, model)
    if model.get("kind") == "mlp":
        return _mlp(x, model)
    coef = np.asarray(model["coef"], dtype=np.float64)
    return x @ coef + float(model.get("intercept", 0.0))


# song-level inputs (plan.json songModels): the unit features but where a unit is, over the whole
# song, read on the EXPERT tier's candidates whatever tier the chart is (the human charts' targets
# were measured against those)
SONG_INPUTS = tuple(name for name in RAW if name not in ("songPos", "first", "last", "posInSection", "occurrence", "lastInGroup", "accent"))
SONG_TIER = "EXPERT"


def song_raw(raw: np.ndarray, seconds: np.ndarray, analysis: dict[str, Any]) -> np.ndarray:
    """The song's inputs for plan.json songModels from unit_raw on SONG_TIER's candidates: the
    SONG_INPUTS features of its units averaged by unit length, then the log of the BPM (median beat)
    and of the units' length in seconds."""
    col = [RAW.index(name) for name in SONG_INPUTS]
    w = np.asarray(seconds, dtype=np.float64)
    w = w / max(1e-9, float(w.sum()))
    beats = np.array([float(b["t"]) for b in analysis.get("beats", [])])
    bpm = 60000.0 / float(np.median(np.diff(beats))) if len(beats) > 2 else 120.0
    return np.concatenate([np.nansum(raw[:, col] * w[:, None], axis=0), [np.log(bpm), np.log(max(1.0, float(np.sum(seconds))))]])


_SONG_CACHE: OrderedDict[tuple[Any, ...], np.ndarray] = OrderedDict()


def song_inputs(units: Sequence[Any], analysis: dict[str, Any], tempo: TempoMap) -> np.ndarray:
    """song_raw for these units on SONG_TIER's 7K+1S candidates (made here; kept per song and units,
    since every tier of the song asks for the same)."""
    key = (analysis.get("audioHash"), float(analysis.get("durationMs", 0.0)), len(analysis.get("onsets", [])), tuple((u.start, u.length) for u in units))
    if key in _SONG_CACHE:
        _SONG_CACHE.move_to_end(key)
        return _SONG_CACHE[key]
    from dataclasses import replace

    from ..config import difficulty_config
    from .candidates import TRIPLETS, build_candidates, swing_bars
    from .params import resolve_params
    from .rolls import song_rolls

    params = resolve_params("7K+1S", SONG_TIER)
    swing = swing_bars(analysis, tempo)
    if not swing:
        params = replace(params, subdivisions=tuple(s for s in params.subdivisions if s not in TRIPLETS))
    tol = float(difficulty_config()["snapToleranceMs"])
    cands = build_candidates(analysis, tempo, params, tol, swing)
    if cands:
        song_rolls(analysis, tempo, params, tol, cands)
    seconds = np.array([(tempo.beat_to_ms(u.start + u.length) - tempo.beat_to_ms(u.start)) / 1000.0 for u in units])
    x = song_raw(unit_raw(units, cands, analysis, tempo), seconds, analysis)
    _SONG_CACHE[key] = x
    while len(_SONG_CACHE) > 16:
        _SONG_CACHE.popitem(last=False)
    return x


def predict_song(x: np.ndarray, target: str) -> float | None:
    """The song's `target` (plan.json songModels: "jack") as a log ratio to the human charts' at the
    same density, or None when the plan model is off or missing."""
    cfg = plan_config()
    model = (cfg.get("songModels") or {}).get(target)
    if not cfg.get("enabled", True) or not model or int(model.get("inputs", len(x))) != len(x):
        return None
    if model.get("kind") == "trees":
        return float(_trees(np.asarray(x, dtype=np.float64)[None, :], model)[0])
    return float(np.asarray(x) @ np.asarray(model["coef"], dtype=np.float64) + float(model.get("intercept", 0.0)))


def _mlp(x: np.ndarray, model: dict[str, Any]) -> np.ndarray:
    """A small ReLU network (plan.json: input mean and scale, then weights and biases per layer)."""
    h = (x - np.asarray(model["mean"], dtype=np.float64)) / np.asarray(model["scale"], dtype=np.float64)
    layers = model["layers"]
    for i, layer in enumerate(layers):
        h = h @ np.asarray(layer["w"], dtype=np.float64) + np.asarray(layer["b"], dtype=np.float64)
        if i < len(layers) - 1:
            h = np.maximum(h, 0.0)
    return h[:, 0]
