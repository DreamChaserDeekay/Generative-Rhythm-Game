"""Core analyzer (numpy/scipy only): canonical PCM -> AnalysisResult dict."""

from __future__ import annotations

from typing import Any, Callable

import numpy as np
from scipy.ndimage import uniform_filter1d

from .meter import beat_cues, estimate_meter
from .onsets import detect_onsets
from .pitch import analyze_notes
from .spectral import chroma_matrix, hpss, mel_filterbank, mel_power, stft_magnitude
from .structure import beat_sync, find_sections
from .tempo import estimate_tempo

ANALYZER_NAME = "core"
ANALYZER_VERSION = "1.0.0"
RESULT_VERSION = 1

FINE_NFFT = 1024
FINE_HOP = 256
N_MELS = 80
COARSE_NFFT = 4096
COARSE_HOP = 1024
HARMONIC_MAX_HZ = 5000.0
ONSET_BIAS_S = 0.0  # measured against synthetic ground truth (median error within ±1 ms)
BAND_NAMES = ("low", "mid", "high")

Progress = Callable[[float, str], None]


def _tempo_map(beats: np.ndarray, beat0: int) -> list[dict[str, float]]:
    """Piecewise-constant tempo points that reproduce the beat times exactly."""
    if len(beats) < 2:
        return [{"beat": 0, "bpm": 120.0}]
    ibi = np.diff(beats)
    points: list[dict[str, float]] = []
    start = 0
    for i in range(1, len(ibi) + 1):
        if i == len(ibi) or abs(ibi[i] - ibi[start]) > 1e-4:
            seg_ibi = float(np.mean(ibi[start:i]))
            points.append({"beat": start - beat0, "bpm": 60.0 / seg_ibi})
            start = i
    # the chart tempo map starts at beat 0; earlier beats use the first segment backwards
    first_after = [p for p in points if p["beat"] <= 0]
    head = first_after[-1] if first_after else points[0]
    out = [{"beat": 0, "bpm": round(head["bpm"], 6)}]
    out += [{"beat": int(p["beat"]), "bpm": round(p["bpm"], 6)} for p in points if p["beat"] > 0]
    return out


def _beat_activity(beats: np.ndarray, times: np.ndarray, strength: np.ndarray, bands: np.ndarray) -> np.ndarray:
    """Strength-weighted onset counts per beat and band, smoothed over a bar (n_beats, 3)."""
    out = np.zeros((len(beats), 3))
    if len(beats) == 0:
        return out
    idx = np.clip(np.searchsorted(beats, times, side="right") - 1, 0, len(beats) - 1)
    np.add.at(out, idx, strength[:, None] * bands)
    out = uniform_filter1d(out, size=4, axis=0, mode="nearest")
    scale = np.percentile(out, 95, axis=0)
    return out / np.maximum(scale, 1e-9)


def _frame_rms_db(mono: np.ndarray, hop: int, size: int) -> np.ndarray:
    n = 1 + len(mono) // hop
    pad = np.pad(mono, (size // 2, size))
    frames = np.lib.stride_tricks.sliding_window_view(pad, size)[::hop][:n]
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-9)


def _waveform(mono: np.ndarray, sr: int, frame_ms: float) -> list[float]:
    size = max(1, int(sr * frame_ms / 1000))
    n = len(mono) // size
    peaks = np.abs(mono[: n * size]).reshape(n, size).max(axis=1)
    top = float(np.max(peaks)) if n else 1.0
    return [round(float(v), 3) for v in peaks / max(top, 1e-9)]


def analyze(
    pcm: np.ndarray,
    sr: int,
    audio_hash: str = "",
    overrides: dict[str, Any] | None = None,
    progress: Progress | None = None,
) -> dict[str, Any]:
    report = progress or (lambda _p, _m: None)
    overrides = overrides or {}
    mono = pcm.mean(axis=1) if pcm.ndim == 2 else pcm
    mono = mono.astype(np.float32)
    duration = len(mono) / sr

    report(0.05, "스펙트럼 계산")
    mel, centers = mel_power(mono, sr, FINE_NFFT, FINE_HOP, N_MELS, 30.0, min(16000.0, sr / 2 - 1))
    fine_rate = sr / FINE_HOP

    report(0.2, "온셋 검출")
    od = detect_onsets(mel, centers, fine_rate, ONSET_BIAS_S)

    report(0.3, "화성/타악 분리")
    mag = stft_magnitude(mono, COARSE_NFFT, COARSE_HOP)
    freqs = np.fft.rfftfreq(COARSE_NFFT, 1.0 / sr)
    max_bin = int(np.searchsorted(freqs, HARMONIC_MAX_HZ))
    harmonic, percussive = hpss(mag[:, :max_bin])
    coarse_rate = sr / COARSE_HOP

    report(0.45, "템포 분석")
    tempo = estimate_tempo(
        od.times, od.strength, od.bands[:, 0], od.odf, fine_rate, duration, bpm_override=overrides.get("bpm")
    )
    beats = tempo.beats + float(overrides.get("offsetShiftMs", 0.0)) / 1000.0
    beats = beats[(beats >= 0) & (beats <= duration)]

    report(0.6, "마디 분석")
    chroma = (harmonic.astype(np.float64) ** 2) @ chroma_matrix(sr, COARSE_NFFT)[:, :max_bin].T
    chroma /= np.linalg.norm(chroma, axis=1, keepdims=True) + 1e-9
    beat_chroma = beat_sync(chroma, coarse_rate, beats)
    unit = beat_chroma / (np.linalg.norm(beat_chroma, axis=1, keepdims=True) + 1e-9)
    novelty = np.zeros(len(beats))
    if len(beats) > 1:
        novelty[1:] = 1.0 - np.sum(unit[1:] * unit[:-1], axis=1)
    meter = estimate_meter(beat_cues(beats, od.times, od.strength, od.bands, novelty))
    bpb = meter.beats_per_bar
    beat0 = meter.first_downbeat_index if len(beats) else 0

    report(0.7, "음 길이·음높이 분석")
    notes = analyze_notes(od.times, harmonic, percussive, freqs[:max_bin], coarse_rate)

    report(0.8, "곡 구조 분석")
    fb, _ = mel_filterbank(sr, COARSE_NFFT, 40, 30.0, min(16000.0, sr / 2 - 1))
    log_mel = np.log1p(100.0 * (mag.astype(np.float64) ** 2) @ fb.T / (np.max(mag) ** 2 + 1e-12))
    activity = _beat_activity(beats, od.times, od.strength, od.bands)
    features = np.concatenate(
        [beat_sync(log_mel, coarse_rate, beats), 0.5 * beat_sync(chroma, coarse_rate, beats), 2.0 * activity], axis=1
    )
    rms_db = _frame_rms_db(mono, COARSE_HOP, COARSE_NFFT)
    beat_energy = beat_sync(rms_db[:, None], coarse_rate, beats)[:, 0] if len(beats) else np.zeros(0)
    sections = find_sections(features, beat_energy, beat0, bpb) if len(beats) >= 8 else []

    report(0.92, "결과 정리")
    beat_ms = beats * 1000.0
    preview_ms = 0.0
    chorus = next((s for s in sections if s.label == "chorus"), None)
    if chorus is not None:
        preview_ms = float(beat_ms[chorus.start_beat])
    elif len(rms_db):
        win = max(1, int(15 * coarse_rate))
        smooth = np.convolve(rms_db, np.ones(win) / win, mode="valid")
        preview_ms = float(np.argmax(smooth) / coarse_rate * 1000.0)

    energy_hop = int(sr * 0.1)
    energy_db = _frame_rms_db(mono, energy_hop, energy_hop * 2)
    energy = np.clip((energy_db + 60.0) / 60.0, 0.0, 1.0)

    onsets = []
    for i, t in enumerate(od.times):
        p = notes.pitch[i]
        end = notes.sustain_end[i]
        onsets.append(
            {
                "t": round(float(t) * 1000.0, 3),
                "strength": round(float(od.strength[i]), 4),
                "band": BAND_NAMES[int(np.argmax(od.bands[i]))],
                "bands": [round(float(x), 3) for x in od.bands[i]],
                "pitch": None if not np.isfinite(p) else round(float(p), 2),
                "harmonic": round(float(notes.harmonic_ratio[i]), 3),
                "sustainEnd": round(float(end) * 1000.0, 3) if end > t else None,
            }
        )
    sustains = [
        {"t": o["t"], "endT": o["sustainEnd"], "pitch": o["pitch"], "strength": o["strength"]}
        for o in onsets
        if o["sustainEnd"] is not None
    ]
    bpms = [s.bpm for s in tempo.segments] or [120.0]
    return {
        "version": RESULT_VERSION,
        "analyzer": {"name": ANALYZER_NAME, "version": ANALYZER_VERSION},
        "audioHash": audio_hash,
        "sampleRate": sr,
        "durationMs": round(duration * 1000.0, 3),
        "tempo": {
            "bpm": round(bpms[0], 4),
            "bpmMin": round(min(bpms), 4),
            "bpmMax": round(max(bpms), 4),
            "constant": tempo.constant,
            "confidence": round(tempo.confidence, 3),
        },
        "timing": {
            "offsetMs": round(float(beat_ms[beat0]), 3) if len(beat_ms) else 0.0,
            "tempoMap": _tempo_map(beats, beat0),
            "meter": [{"measure": 0, "beatsPerMeasure": bpb}],
        },
        "beats": [{"t": round(float(t), 3), "isDownbeat": (i - beat0) % bpb == 0} for i, t in enumerate(beat_ms)],
        "onsets": onsets,
        "sustains": sustains,
        "sections": [
            {
                "t": round(float(beat_ms[s.start_beat]), 3),
                "endT": round(float(beat_ms[s.end_beat]) if s.end_beat < len(beat_ms) else duration * 1000.0, 3),
                "startBeat": s.start_beat - beat0,
                "label": s.label,
                "group": s.group,
                "energy": round(s.energy, 3),
            }
            for s in sections
        ],
        "energy": {"frameMs": 100, "values": [round(float(v), 3) for v in energy]},
        "waveform": {"frameMs": 20, "peaks": _waveform(mono, sr, 20)},
        "previewMs": round(preview_ms, 1),
        "overrides": {k: v for k, v in overrides.items() if v is not None},
    }
