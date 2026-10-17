"""Merging ML backend output into the core analysis (beats → tempo level and downbeats, notes →
pitch and sustain, labelled segments → sections, stems → per-stem onset activity)."""

from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np

from .meter import MeterResult
from .pitch import MIN_SUSTAIN_S
from .spectral import stft_magnitude
from .stems import STEM_NAMES, StemActivity, activity_from_spectra
from .structure import Section
from .tempo import NORMAL_RANGE

NOTE_MATCH_S = 0.05
BASS_MIDI_LIMIT = 55  # transcribed notes below this belong to the bass register
SEGMENT_LABELS = {
    "intro": "intro",
    "verse": "verse",
    "chorus": "chorus",
    "bridge": "bridge",
    "outro": "outro",
    "inst": "verse",
    "solo": "bridge",
    "break": "bridge",
}


def bpm_hint(beats: np.ndarray) -> float | None:
    """Tempo level of an ML beat track, folded into the normal BPM range."""
    if len(beats) < 8:
        return None
    ibi = np.diff(beats)
    ibi = ibi[(ibi > 0.2) & (ibi < 2.0)]
    if len(ibi) < 4:
        return None
    bpm = 60.0 / float(np.median(ibi))
    while bpm < NORMAL_RANGE[0]:
        bpm *= 2
    while bpm > NORMAL_RANGE[1]:
        bpm /= 2
    return bpm


def meter_from_downbeats(grid: np.ndarray, beats: np.ndarray, downbeats: np.ndarray) -> MeterResult | None:
    """Beats per bar and the downbeat phase on our beat grid, from ML downbeats."""
    if len(grid) < 8 or len(beats) < 8 or len(downbeats) < 4:
        return None
    ibi = float(np.median(np.diff(beats)))
    bpb = int(round(float(np.median(np.diff(downbeats))) / ibi))
    if not 2 <= bpb <= 7:
        return None
    grid_ibi = float(np.median(np.diff(grid)))
    hits = []
    for d in downbeats:
        i = int(np.argmin(np.abs(grid - d)))
        if abs(grid[i] - d) <= grid_ibi / 3:
            hits.append(i % bpb)
    if not hits:
        return None
    return MeterResult(beats_per_bar=bpb, first_downbeat_index=Counter(hits).most_common(1)[0][0])


def apply_notes(
    times: np.ndarray, notes: list[tuple[float, float, float, float]], pitch: np.ndarray, sustain: np.ndarray, sources: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Pitch and sustain end for each onset from transcribed notes starting near it; a bass onset
    takes a low note, any other onset a note above the bass register."""
    pitch = pitch.copy()
    sustain = sustain.copy()
    if not notes:
        return pitch, sustain
    starts = np.array([n[0] for n in notes])
    bass = STEM_NAMES.index("bass")
    for i, t in enumerate(times):
        lo, hi = np.searchsorted(starts, t - NOTE_MATCH_S), np.searchsorted(starts, t + NOTE_MATCH_S)
        cands = notes[lo:hi]
        if not cands:
            continue
        want_low = int(sources[i]) == bass
        pool = [n for n in cands if (n[2] < BASS_MIDI_LIMIT) == want_low] or cands
        start, end, midi, _ = max(pool, key=lambda n: n[3])
        pitch[i] = midi
        sustain[i] = end if end - t >= MIN_SUSTAIN_S else t
    return pitch, sustain


def sections_from_segments(
    segments: list[tuple[float, float, str]], beats: np.ndarray, beat0: int, bpb: int, beat_energy: np.ndarray
) -> list[Section]:
    """Labelled ML segments snapped to bar lines on our grid, with energy and repetition groups."""
    n = len(beats)
    if n < 8:
        return []
    bars = list(range(beat0 % bpb, n, bpb)) or [0]
    marks: dict[int, str] = {}
    for start, _, label in segments:
        mapped = SEGMENT_LABELS.get(label.lower())
        if mapped is not None:
            marks.setdefault(min(bars, key=lambda b: abs(beats[b] - start)), mapped)
    edges = sorted(set(marks) | {0}) + [n]
    raw: list[tuple[int, int, str]] = []
    for a, b in zip(edges, edges[1:]):
        if b <= a:
            continue
        if raw and b - a < bpb:
            raw[-1] = (raw[-1][0], b, raw[-1][2])  # shorter than a bar: part of the previous one
            continue
        raw.append((a, b, marks.get(a, raw[-1][2] if raw else "intro")))
    if not raw:
        return []
    energies = np.array([float(np.median(beat_energy[a:b])) for a, b, _ in raw])
    span = float(np.ptp(energies))
    norm = (energies - energies.min()) / span if span > 1e-9 else np.full(len(raw), 0.5)
    groups: dict[str, str] = {}
    out = []
    for (a, b, label), e in zip(raw, norm):
        group = groups.setdefault(label, chr(ord("A") + len(groups) % 26))
        out.append(Section(start_beat=a, end_beat=b, energy=float(e), group=group, label=label))
    return out


def activity_from_stems(stems: dict[str, np.ndarray], n_fft: int, hop: int, ref: float) -> StemActivity:
    """Per-stem onset activity from separated audio (one stem in memory at a time)."""
    rises, energies = [], []
    for name in STEM_NAMES:
        y = stems[name]
        spec = stft_magnitude(y.mean(axis=1) if y.ndim == 2 else y, n_fft, hop)
        r, e = activity_from_spectra([spec], ref)
        rises.append(r[:, 0])
        energies.append(e[:, 0])
        del spec
    n = min(len(r) for r in rises)
    rise = np.stack([r[:n] for r in rises], axis=1)
    energy = np.stack([e[:n] for e in energies], axis=1)
    return StemActivity(rise=rise, energy=energy, melody_hz=np.full(n, np.nan), bass_hz=np.full(n, np.nan))


def section_stems(sections: list[dict[str, Any]], onset_ms: np.ndarray, strength: np.ndarray, shares: np.ndarray) -> None:
    """Adds each section's stem mix (strength-weighted onset shares) and leading stem in place."""
    for s in sections:
        sel = (onset_ms >= s["t"]) & (onset_ms < s["endT"])
        mix = (strength[sel, None] * shares[sel]).sum(axis=0) if np.any(sel) else np.zeros(len(STEM_NAMES))
        total = float(mix.sum())
        share = mix / total if total > 1e-9 else np.full(len(STEM_NAMES), 1.0 / len(STEM_NAMES))
        s["stems"] = [round(float(v), 3) for v in share]
        s["leader"] = STEM_NAMES[int(np.argmax(share))]
