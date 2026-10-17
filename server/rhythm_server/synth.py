"""Synthetic songs with exact ground truth, used for tests and the built-in demo track.

No copyrighted audio is needed: drums, bass, lead and pads are synthesized and every event is
placed on an exact sample, so beat/onset accuracy can be measured precisely.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.signal import butter, sosfilt

from .config import SAMPLE_RATE

PENTATONIC = [0, 3, 5, 7, 10]  # minor pentatonic degrees


@dataclass
class SynthSong:
    pcm: np.ndarray
    sample_rate: int
    beats: list[float]
    downbeats: list[float]
    onsets: dict[str, list[float]] = field(default_factory=dict)
    tempo_segments: list[tuple[float, float]] = field(default_factory=list)  # (start time s, bpm)
    sustains: list[tuple[float, float, float]] = field(default_factory=list)  # (start, end, midi)
    sections: list[tuple[float, str]] = field(default_factory=list)  # (start time s, label)

    @property
    def duration(self) -> float:
        return len(self.pcm) / self.sample_rate


def _env(n: int, sr: int, tau: float) -> np.ndarray:
    return np.exp(-np.arange(n) / (tau * sr))


def _noise(n: int, rng: np.random.Generator) -> np.ndarray:
    return rng.uniform(-1.0, 1.0, n)


def _kick(sr: int, rng: np.random.Generator) -> np.ndarray:
    n = int(0.35 * sr)
    t = np.arange(n) / sr
    freq = 45 + 85 * np.exp(-t / 0.03)
    phase = 2 * np.pi * np.cumsum(freq) / sr
    body = np.sin(phase) * np.exp(-t / 0.18)
    click = np.zeros(n)
    m = int(0.002 * sr)
    click[:m] = _noise(m, rng) * np.linspace(1, 0, m)
    return 0.95 * body + 0.3 * click


def _snare(sr: int, rng: np.random.Generator) -> np.ndarray:
    n = int(0.22 * sr)
    sos = butter(2, [1500, 7000], btype="bandpass", fs=sr, output="sos")
    noise = sosfilt(sos, _noise(n, rng)) * _env(n, sr, 0.06) * 2.0
    tone = np.sin(2 * np.pi * 185 * np.arange(n) / sr) * _env(n, sr, 0.05)
    return 0.7 * noise + 0.5 * tone


def _hihat(sr: int, rng: np.random.Generator, length: float = 0.05, tau: float = 0.012) -> np.ndarray:
    n = int(length * sr)
    sos = butter(4, 7000, btype="highpass", fs=sr, output="sos")
    return sosfilt(sos, _noise(n, rng)) * _env(n, sr, tau) * 2.5


def _crash(sr: int, rng: np.random.Generator) -> np.ndarray:
    n = int(1.6 * sr)
    sos = butter(3, 4000, btype="highpass", fs=sr, output="sos")
    return sosfilt(sos, _noise(n, rng)) * _env(n, sr, 0.5) * 1.5


def _tone(freq: float, dur: float, sr: int, harmonics: int, attack: float, release: float, decay_tau: float = 0.0) -> np.ndarray:
    n = int((dur + release) * sr)
    t = np.arange(n) / sr
    wave = np.zeros(n)
    for h in range(1, harmonics + 1):
        if freq * h > sr / 2.2:
            break
        wave += np.sin(2 * np.pi * freq * h * t) / h
    env = np.ones(n)
    a = max(1, int(attack * sr))
    env[:a] = np.linspace(0, 1, a)
    if decay_tau > 0:
        env *= np.exp(-t / decay_tau) * 0.6 + 0.4
    r0 = int(dur * sr)
    if r0 < n:
        env[r0:] *= np.linspace(1, 0, n - r0)
    return wave * env


def _midi_to_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def _add(buf: np.ndarray, sig: np.ndarray, start: int, gain: float, pan: float = 0.0) -> None:
    if start >= len(buf):
        return
    end = min(len(buf), start + len(sig))
    seg = sig[: end - start] * gain
    buf[start:end, 0] += seg * (1 - pan) if pan > 0 else seg
    buf[start:end, 1] += seg * (1 + pan) if pan < 0 else seg


def make_song(
    bpm: float = 128.0,
    bars: int = 32,
    offset: float = 0.6,
    sample_rate: int = SAMPLE_RATE,
    seed: int = 0,
    tempo_change: tuple[int, float] | None = None,
    beats_per_bar: int = 4,
    tail: float = 2.0,
) -> SynthSong:
    """Build a song in 8-bar sections: intro, verse, chorus, verse, chorus, ...

    `tempo_change=(bar, new_bpm)` switches tempo at the start of that bar.
    """
    rng = np.random.default_rng(seed)
    # beat times
    beat_times: list[float] = []
    segments: list[tuple[float, float]] = []
    t = offset
    current = bpm
    for bar in range(bars):
        if tempo_change and bar == tempo_change[0]:
            current = tempo_change[1]
        if not segments or segments[-1][1] != current:
            segments.append((t, current))
        for _ in range(beats_per_bar):
            beat_times.append(t)
            t += 60.0 / current
    end_time = t
    n = int((end_time + tail) * sample_rate)
    buf = np.zeros((n, 2), dtype=np.float64)

    kick, snare, crash = _kick(sample_rate, rng), _snare(sample_rate, rng), _crash(sample_rate, rng)
    hat = _hihat(sample_rate, rng)
    open_hat = _hihat(sample_rate, rng, length=0.25, tau=0.08)
    onsets: dict[str, list[float]] = {k: [] for k in ("kick", "snare", "hihat", "crash", "bass", "lead", "pad")}
    sustains: list[tuple[float, float, float]] = []
    sections: list[tuple[float, str]] = []
    root = 57  # A3

    def at(time: float) -> int:
        return int(round(time * sample_rate))

    def sub_time(beat_index: int, frac: float) -> float:
        b0 = beat_times[beat_index]
        b1 = beat_times[beat_index + 1] if beat_index + 1 < len(beat_times) else b0 + 60.0 / current
        return b0 + (b1 - b0) * frac

    chord_roots = [0, -4, -7, -2]  # Am, F, D(m), G (relative)
    for bar in range(bars):
        section_index = bar // 8
        kind = "intro" if section_index == 0 else ("verse" if section_index % 2 == 1 else "chorus")
        if bar % 8 == 0:
            sections.append((beat_times[bar * beats_per_bar], kind))
        chord = chord_roots[bar % 4]
        for beat in range(beats_per_bar):
            bi = bar * beats_per_bar + beat
            bt = beat_times[bi]
            beat_len = (beat_times[bi + 1] if bi + 1 < len(beat_times) else end_time) - bt
            # kick: every beat (four on the floor) except intro off-beats
            _add(buf, kick, at(bt), 0.9)
            onsets["kick"].append(bt)
            if kind != "intro" and beat % 2 == 1:
                _add(buf, snare, at(bt), 0.6)
                onsets["snare"].append(bt)
            # hi-hats: 8ths in intro/verse, 16ths in chorus
            steps = 4 if kind == "chorus" else 2
            for s in range(steps):
                ht = sub_time(bi, s / steps)
                is_open = kind == "chorus" and s == 2
                _add(buf, open_hat if is_open else hat, at(ht), 0.22 if s % 2 == 0 else 0.16, pan=0.3)
                onsets["hihat"].append(ht)
            # bass on every beat (8ths in chorus)
            if kind != "intro":
                bass_steps = 2 if kind == "chorus" else 1
                for s in range(bass_steps):
                    bt2 = sub_time(bi, s / bass_steps)
                    dur = beat_len / bass_steps * 0.85
                    note = root - 12 + chord + (7 if s == 1 else 0)
                    _add(buf, _tone(_midi_to_hz(note), dur, sample_rate, 6, 0.003, 0.02, 0.25), at(bt2), 0.32)
                    onsets["bass"].append(bt2)
            # pads: one chord per bar
            if beat == 0:
                bar_len = beat_len * beats_per_bar
                for interval in (0, 3, 7):
                    _add(buf, _tone(_midi_to_hz(root + chord + interval), bar_len * 0.95, sample_rate, 2, 0.08, 0.2), at(bt), 0.05)
                onsets["pad"].append(bt)
        # lead line
        if kind == "verse":
            # sustained notes: half notes and quarters (long-note material)
            pattern = [(0, 2.0), (2, 1.0), (3, 1.0)]
        elif kind == "chorus":
            pattern = [(0, 0.5), (0.5, 0.5), (1, 0.25), (1.25, 0.25), (1.5, 0.5), (2, 1.5), (3.5, 0.25), (3.75, 0.25)]
        else:
            pattern = []
        for start_beat, length in pattern:
            bi = bar * beats_per_bar + int(start_beat)
            frac = start_beat - int(start_beat)
            st = sub_time(bi, frac)
            beat_len = (beat_times[bi + 1] if bi + 1 < len(beat_times) else end_time) - beat_times[bi]
            dur = length * beat_len * 0.92
            degree = PENTATONIC[int(rng.integers(0, len(PENTATONIC)))]
            midi = root + 12 + degree + (12 if rng.random() < 0.25 else 0)
            _add(buf, _tone(_midi_to_hz(midi), dur, sample_rate, 5, 0.004, 0.04), at(st), 0.2, pan=-0.2)
            onsets["lead"].append(st)
            sustains.append((st, st + dur, float(midi)))
        if kind == "chorus" and bar % 8 == 0:
            _add(buf, crash, at(beat_times[bar * beats_per_bar]), 0.3)
            onsets["crash"].append(beat_times[bar * beats_per_bar])

    peak = np.max(np.abs(buf))
    if peak > 0:
        buf *= 0.89 / peak
    downbeats = beat_times[::beats_per_bar]
    return SynthSong(
        pcm=buf.astype(np.float32),
        sample_rate=sample_rate,
        beats=beat_times,
        downbeats=downbeats,
        onsets={k: sorted(v) for k, v in onsets.items()},
        tempo_segments=segments,
        sustains=sustains,
        sections=sections,
    )
