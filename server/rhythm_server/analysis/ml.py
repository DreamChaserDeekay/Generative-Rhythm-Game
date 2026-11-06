"""Merging ML backend output into the core analysis (beats → the half-beat phase of our grid, notes →
pitch and sustain, labelled segments → sections, stems → per-stem onset activity). Analyzers before
1.13.0 took beat_this's tempo level and downbeats (`bpm_hint`, `meter_from_downbeats`); on BMS charts
those made the grid worse than the core analysis (docs/PATTERN_DESIGN.md 75), and only
scripts/measure_bms_timing.py still uses them, to compare."""

from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np

from .meter import MeterResult
from .pitch import MIN_SUSTAIN_S
from .spectral import mel_filterbank, stft_magnitude
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


def _to_nearest(points: np.ndarray, grid: np.ndarray) -> np.ndarray:
    """Each point's distance to the nearest grid point (`grid` sorted, two points or more)."""
    i = np.clip(np.searchsorted(grid, points), 1, len(grid) - 1)
    return np.minimum(np.abs(points - grid[i - 1]), np.abs(points - grid[i]))


def half_beat_phase(grid: np.ndarray, beats: np.ndarray) -> tuple[np.ndarray, bool]:
    """Our beat grid moved half a beat when most of an ML tracker's beats inside it sit nearer its
    half beats than its beats; (grid, moved). On 215 constant-tempo BMS songs this put 6 of the 8
    songs the core analysis had half a beat off on the chart's beats and moved 1 of 200 right ones
    off (docs/PATTERN_DESIGN.md 75). The moved grid keeps the span: it adds half a beat before the
    first beat and after the last."""
    if len(grid) < 4 or len(beats) < 4:
        return grid, False
    inside = beats[(beats > grid[0]) & (beats < grid[-1])]
    if len(inside) < 4:
        return grid, False
    mids = 0.5 * (grid[:-1] + grid[1:])
    if float(np.mean(_to_nearest(inside, mids) < _to_nearest(inside, grid))) <= 0.5:
        return grid, False
    first, last = grid[0] - 0.5 * (grid[1] - grid[0]), grid[-1] + 0.5 * (grid[-1] - grid[-2])
    return np.concatenate([[first], mids, [last]]), True


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


# Instrument stems of a 6-stem separator (Demucs htdemucs_6s; docs/PATTERN_DESIGN.md 86): guitar and
# piano are parts of "other". With them each onset gets its share of the onset strength (spectral
# flux) of the six stems, and each section the stem whose loudness share of its onsets is largest.
INSTRUMENT_STEMS = ("guitar", "piano")
SIX_STEMS = ("drums", "bass", "vocals", "guitar", "piano", "other")  # "other" here is what is left of it
LEAD_STEMS = ("vocals", "guitar", "piano", "other")
INSTRUMENT_NFFT = 2048
INSTRUMENT_HOP = 512
INSTRUMENT_MELS = 64
FLUX_FRAMES = (-1, 3)  # an onset's flux is the largest in these frames around it
LOUD_FRAMES = 5  # an onset's loudness is the mean RMS of this many frames from it


def instrument_activity(stems: dict[str, np.ndarray], sr: int) -> tuple[np.ndarray, np.ndarray] | None:
    """(flux, rms) per frame of SIX_STEMS, (frames, 6) each, when the separator gave guitar and
    piano; None otherwise. Flux: positive change of the log mel spectrum (64 bands)."""
    if not all(k in stems for k in INSTRUMENT_STEMS):
        return None
    fb, _ = mel_filterbank(sr, INSTRUMENT_NFFT, INSTRUMENT_MELS, 30.0, min(16000.0, sr / 2 - 1))
    fluxes, rmses = [], []
    for name in SIX_STEMS:
        y = stems[name]
        y = y.mean(axis=1) if y.ndim == 2 else y
        if name == "other":
            for k in INSTRUMENT_STEMS:
                g = stems[k]
                y = y - (g.mean(axis=1) if g.ndim == 2 else g)
        mel = stft_magnitude(np.asarray(y, dtype=np.float32), INSTRUMENT_NFFT, INSTRUMENT_HOP) @ fb.T
        lm = np.log1p(100.0 * mel)
        flux = np.zeros(len(lm))
        if len(lm) > 1:
            flux[1:] = np.maximum(0.0, lm[1:] - lm[:-1]).sum(axis=1)
        fluxes.append(flux)
        n = len(y) // INSTRUMENT_HOP
        rmses.append(np.sqrt(np.mean(np.asarray(y[: n * INSTRUMENT_HOP], dtype=np.float64).reshape(n, INSTRUMENT_HOP) ** 2, axis=1) + 1e-12))
        del mel, lm
    n = min(min(len(f) for f in fluxes), min(len(r) for r in rmses))
    return np.stack([f[:n] for f in fluxes], axis=1), np.stack([r[:n] for r in rmses], axis=1)


def instrument_shares(activity: tuple[np.ndarray, np.ndarray], sr: int, onset_s: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per onset (seconds) its share of each SIX_STEMS stem's flux and of their loudness, (n, 6) each."""
    flux, rms = activity
    n = len(flux)
    frames = np.round(np.asarray(onset_s) * sr / INSTRUMENT_HOP).astype(int)
    f_out = np.zeros((len(frames), len(SIX_STEMS)))
    e_out = np.zeros((len(frames), len(SIX_STEMS)))
    for i, fr in enumerate(frames):
        lo, hi = max(0, fr + FLUX_FRAMES[0]), min(n, fr + FLUX_FRAMES[1])
        if hi > lo:
            f = flux[lo:hi].max(axis=0)
            f_out[i] = f / max(float(f.sum()), 1e-12)
        lo, hi = max(0, fr), min(n, fr + LOUD_FRAMES)
        if hi > lo:
            e = rms[lo:hi].mean(axis=0)
            e_out[i] = e / max(float(e.sum()), 1e-12)
    return f_out, e_out


def section_leads(sections: list[dict[str, Any]], onset_ms: np.ndarray, loud: np.ndarray) -> None:
    """Adds each section's lead instrument (the LEAD_STEMS stem with the largest loudness share
    summed over its onsets) and those shares, in place."""
    idx = [SIX_STEMS.index(k) for k in LEAD_STEMS]
    for s in sections:
        sel = (onset_ms >= s["t"]) & (onset_ms < s["endT"])
        mix = loud[sel][:, idx].sum(axis=0) if np.any(sel) else np.zeros(len(LEAD_STEMS))
        total = float(mix.sum())
        if total <= 1e-9:
            continue
        share = mix / total
        s["lead"] = LEAD_STEMS[int(np.argmax(share))]
        s["leadShares"] = {k: round(float(v), 3) for k, v in zip(LEAD_STEMS, share)}
