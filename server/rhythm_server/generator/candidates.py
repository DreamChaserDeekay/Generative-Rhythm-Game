"""Onsets -> grid-quantized, scored note candidates."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.ndimage import uniform_filter1d

from ..analysis.stems import STEM_NAMES
from ..config import load_config
from .params import GenParams
from .tempo import TempoMap

# Snap preference: simpler rhythms first; triplets only when they fit clearly better.
SNAP_ORDER = (1, 2, 4, 3, 8, 6)
METRICAL_WEIGHT = {1: 0.9, 2: 0.72, 4: 0.5, 3: 0.55, 6: 0.42, 8: 0.32}
DOWNBEAT_WEIGHT = 1.0


@dataclass
class Candidate:
    beat: float
    t: float
    subdivision: int
    strength: float
    bands: np.ndarray
    pitch: float | None
    harmonic: float
    sustain_beats: float
    intensity: float
    downbeat: bool
    sources: np.ndarray | None = None  # stem shares (drums, bass, vocals, other) when analysed
    leader: int | None = None  # leading stem of the section this candidate is in
    score: float = 0.0


def _subdivision_of(beat: float) -> int:
    """Coarsest subdivision (beats split into s parts) that contains this grid position."""
    for s in (1, 2, 3, 4, 6, 8):
        if abs(beat * s - round(beat * s)) < 1e-6:
            return s
    return 8


def snap(t_ms: float, tempo: TempoMap, allowed: tuple[int, ...], tolerance_ms: float) -> tuple[float, int] | None:
    beat = tempo.ms_to_beat(t_ms)
    beat_len = tempo.beat_ms(beat)
    for s in SNAP_ORDER:
        if s not in allowed:
            continue
        q = round(beat * s) / s
        err = abs(tempo.beat_to_ms(q) - t_ms)
        if err <= min(tolerance_ms, 0.3 * beat_len / s):
            return q, _subdivision_of(q)
    return None


def intensity_curve(analysis: dict[str, Any], tempo: TempoMap, n_beats: int) -> np.ndarray:
    """Per-beat intensity (0..1): smoothed loudness blended with onset activity."""
    energy = np.asarray(analysis["energy"]["values"], dtype=np.float64)
    frame_ms = float(analysis["energy"]["frameMs"])
    beats_ms = np.array([tempo.beat_to_ms(b) for b in range(n_beats)])
    loud = np.interp(beats_ms, np.arange(len(energy)) * frame_ms, energy) if len(energy) else np.zeros(n_beats)
    activity = np.zeros(n_beats)
    for o in analysis["onsets"]:
        b = int(np.floor(tempo.ms_to_beat(o["t"])))
        if 0 <= b < n_beats:
            activity[b] += o["strength"]
    loud = uniform_filter1d(loud, size=8, mode="nearest")
    activity = uniform_filter1d(activity, size=8, mode="nearest")

    def norm(x: np.ndarray) -> np.ndarray:
        lo, hi = np.percentile(x, 5), np.percentile(x, 98)
        return np.clip((x - lo) / max(hi - lo, 1e-9), 0, 1)

    return 0.5 * norm(loud) + 0.5 * norm(activity)


def _section_leader(sections: list[dict[str, Any]], t: float) -> int | None:
    for s in sections:
        if s["t"] <= t < s["endT"] and s.get("leader") in STEM_NAMES:
            return STEM_NAMES.index(s["leader"])
    return None


def build_candidates(analysis: dict[str, Any], tempo: TempoMap, params: GenParams, tolerance_ms: float) -> list[Candidate]:
    duration = float(analysis["durationMs"])
    n_beats = max(1, int(np.ceil(tempo.ms_to_beat(duration))) + 1)
    intensity = intensity_curve(analysis, tempo, n_beats)
    bpb = tempo.beats_per_bar
    sections = analysis.get("sections", [])
    merged: dict[float, Candidate] = {}
    for o in analysis["onsets"]:
        snapped = snap(o["t"], tempo, params.subdivisions, tolerance_ms)
        if snapped is None:
            continue
        q, sub = snapped
        if q < 0 and tempo.beat_to_ms(q) < 0:
            continue
        key = round(q, 6)
        bands = np.asarray(o["bands"], dtype=np.float64) * o["strength"]
        sustain_beats = 0.0
        if o.get("sustainEnd"):
            sustain_beats = max(0.0, tempo.ms_to_beat(o["sustainEnd"]) - q)
        sources = np.asarray(o["sources"], dtype=np.float64) if o.get("sources") else None
        c = merged.get(key)
        if c is None:
            b_idx = int(np.clip(np.floor(q), 0, n_beats - 1))
            merged[key] = Candidate(
                beat=q,
                t=tempo.beat_to_ms(q),
                subdivision=sub,
                strength=float(o["strength"]),
                bands=bands,
                pitch=o.get("pitch"),
                harmonic=float(o.get("harmonic", 0.0)),
                sustain_beats=sustain_beats,
                intensity=float(intensity[b_idx]),
                downbeat=sub == 1 and int(round(q)) % bpb == 0,
                sources=sources,
                leader=_section_leader(sections, o["t"]),
            )
        else:
            stronger = o["strength"] > c.strength
            if sources is not None:
                # strength-weighted mix of the merged onsets' stem shares
                old = c.sources if c.sources is not None else sources
                w_old, w_new = c.strength, float(o["strength"])
                c.sources = (old * w_old + sources * w_new) / max(w_old + w_new, 1e-9)
            c.strength = max(c.strength, float(o["strength"])) + 0.25 * min(c.strength, float(o["strength"]))
            c.bands = c.bands + bands
            if o.get("pitch") is not None and (c.pitch is None or stronger):
                c.pitch = o["pitch"]
            c.harmonic = max(c.harmonic, float(o.get("harmonic", 0.0)))
            c.sustain_beats = max(c.sustain_beats, sustain_beats)
    cands = sorted(merged.values(), key=lambda c: c.beat)
    _score(cands, params)
    return cands


def _stem_source_weight(c: Candidate, params: GenParams, cfg: dict[str, Any]) -> float | None:
    """Rhythm-source weight from stem shares; None when the analysis has no stems."""
    if c.sources is None:
        return None
    if params.rhythm_source == "auto":
        if c.leader is None:
            return 1.0
        return cfg["autoBase"] + cfg["autoGain"] * float(c.sources[c.leader])
    mix = cfg["sources"].get(params.rhythm_source, {})
    share = sum(float(c.sources[STEM_NAMES.index(name)]) * w for name, w in mix.items())
    return cfg["base"] + cfg["gain"] * min(1.0, share)


def _score(cands: list[Candidate], params: GenParams) -> None:
    band_weight = np.array([1.0, 1.0, params.high_band_weight])
    boosts = params.extra.get("subdivisionBoost", {})
    offbeat = params.weight("offbeatBoost")
    downbeat = params.weight("downbeatBoost")
    harmonic = params.weight("harmonicBoost", 0.0)
    source_cfg = load_config("instruments")["rhythmSource"]
    for c in cands:
        metrical = DOWNBEAT_WEIGHT * downbeat if c.downbeat else METRICAL_WEIGHT.get(c.subdivision, 0.3)
        metrical *= boosts.get(c.subdivision, 1.0) * (offbeat if c.subdivision > 1 else 1.0)
        total = float(np.sum(c.bands)) + 1e-9
        w_band = float(np.dot(c.bands, band_weight)) / total
        stem_weight = _stem_source_weight(c, params, source_cfg)
        source = 1.0
        if stem_weight is not None:
            source = stem_weight
        elif params.rhythm_source == "drum":
            source = 0.6 + 0.8 * (1.0 - c.harmonic)
        elif params.rhythm_source == "bass":
            source = 0.5 + 1.0 * (c.bands[0] / total)
        elif params.rhythm_source in ("melody", "vocal"):
            source = 0.5 + 0.7 * c.harmonic + (0.3 if c.pitch is not None else 0.0)
        source *= 1.0 + harmonic * c.harmonic
        c.score = (min(c.strength, 1.5) ** 0.7) * metrical * w_band * (0.55 + 0.9 * c.intensity) * source
