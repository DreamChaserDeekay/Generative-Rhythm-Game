"""Synthetic songs with exact ground truth, used for tests and the built-in demo track.

No copyrighted audio is needed: drums, bass, lead and pads are synthesized and every event is
placed on an exact sample, so beat/onset accuracy can be measured precisely.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy.signal import butter, sosfilt

from .config import SAMPLE_RATE

PENTATONIC = [0, 3, 5, 7, 10]  # minor pentatonic degrees
STEM_NAMES = ("drums", "bass", "vocals", "other")
# which stem each synthesized instrument belongs to (the lead plays the "vocal" melody)
INSTRUMENT_STEM = {
    "kick": "drums", "snare": "drums", "hihat": "drums", "crash": "drums", "bass": "bass", "lead": "vocals", "pad": "other", "pluck": "other",
}


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
    stems: dict[str, np.ndarray] = field(default_factory=dict)  # ground-truth stems; sum == pcm
    # make_structured_song: the true sections (startBeat from the first downbeat, bars, label,
    # repetition group, loop length in bars)
    structure: list[dict[str, object]] = field(default_factory=list)

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


def _add(buf: np.ndarray, sig: np.ndarray, start: int, gain: float, pan: float = 0.0, stem: np.ndarray | None = None) -> None:
    if stem is not None:
        _add(stem, sig, start, gain, pan)
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
    with_stems: bool = False,
    repeat_melody: bool = False,
) -> SynthSong:
    """Build a song in 8-bar sections: intro, verse, chorus, verse, chorus, ...

    `tempo_change=(bar, new_bpm)` switches tempo at the start of that bar.
    `with_stems` also returns the drums / bass / vocals (lead) / other (pads) stems.
    `repeat_melody` makes every verse and every chorus play the same lead line, like a real song
    (the default draws new notes each time, which keeps older test fixtures unchanged).
    """
    rng = np.random.default_rng(seed)
    melody_rng = np.random.default_rng(seed + 7919)
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
    stems = {name: np.zeros((n, 2), dtype=np.float64) for name in STEM_NAMES} if with_stems else {}

    def stem_of(instrument: str) -> np.ndarray | None:
        return stems.get(INSTRUMENT_STEM[instrument])

    melodies: dict[tuple[str, int, int], int] = {}

    def melody_note(kind: str, bar_in_section: int, step: int) -> int:
        key = (kind, bar_in_section, step)
        if key not in melodies:
            degree = PENTATONIC[int(melody_rng.integers(0, len(PENTATONIC)))]
            melodies[key] = root + 12 + degree + (12 if melody_rng.random() < 0.25 else 0)
        return melodies[key]

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
            _add(buf, kick, at(bt), 0.9, stem=stem_of("kick"))
            onsets["kick"].append(bt)
            if kind != "intro" and beat % 2 == 1:
                _add(buf, snare, at(bt), 0.6, stem=stem_of("snare"))
                onsets["snare"].append(bt)
            # hi-hats: 8ths in intro/verse, 16ths in chorus
            steps = 4 if kind == "chorus" else 2
            for s in range(steps):
                ht = sub_time(bi, s / steps)
                is_open = kind == "chorus" and s == 2
                _add(buf, open_hat if is_open else hat, at(ht), 0.22 if s % 2 == 0 else 0.16, pan=0.3, stem=stem_of("hihat"))
                onsets["hihat"].append(ht)
            # bass on every beat (8ths in chorus)
            if kind != "intro":
                bass_steps = 2 if kind == "chorus" else 1
                for s in range(bass_steps):
                    bt2 = sub_time(bi, s / bass_steps)
                    dur = beat_len / bass_steps * 0.85
                    note = root - 12 + chord + (7 if s == 1 else 0)
                    _add(buf, _tone(_midi_to_hz(note), dur, sample_rate, 6, 0.003, 0.02, 0.25), at(bt2), 0.32, stem=stem_of("bass"))
                    onsets["bass"].append(bt2)
            # pads: one chord per bar
            if beat == 0:
                bar_len = beat_len * beats_per_bar
                for interval in (0, 3, 7):
                    _add(buf, _tone(_midi_to_hz(root + chord + interval), bar_len * 0.95, sample_rate, 2, 0.08, 0.2), at(bt), 0.05, stem=stem_of("pad"))
                onsets["pad"].append(bt)
        # lead line
        if kind == "verse":
            # sustained notes: half notes and quarters (long-note material)
            pattern = [(0, 2.0), (2, 1.0), (3, 1.0)]
        elif kind == "chorus":
            pattern = [(0, 0.5), (0.5, 0.5), (1, 0.25), (1.25, 0.25), (1.5, 0.5), (2, 1.5), (3.5, 0.25), (3.75, 0.25)]
        else:
            pattern = []
        for step, (start_beat, length) in enumerate(pattern):
            bi = bar * beats_per_bar + int(start_beat)
            frac = start_beat - int(start_beat)
            st = sub_time(bi, frac)
            beat_len = (beat_times[bi + 1] if bi + 1 < len(beat_times) else end_time) - beat_times[bi]
            dur = length * beat_len * 0.92
            if repeat_melody:
                midi = melody_note(kind, bar % 8, step)
            else:
                degree = PENTATONIC[int(rng.integers(0, len(PENTATONIC)))]
                midi = root + 12 + degree + (12 if rng.random() < 0.25 else 0)
            _add(buf, _tone(_midi_to_hz(midi), dur, sample_rate, 5, 0.004, 0.04), at(st), 0.2, pan=-0.2, stem=stem_of("lead"))
            onsets["lead"].append(st)
            sustains.append((st, st + dur, float(midi)))
        if kind == "chorus" and bar % 8 == 0:
            _add(buf, crash, at(beat_times[bar * beats_per_bar]), 0.3, stem=stem_of("crash"))
            onsets["crash"].append(beat_times[bar * beats_per_bar])

    peak = np.max(np.abs(buf))
    if peak > 0:
        buf *= 0.89 / peak
        for stem in stems.values():
            stem *= 0.89 / peak
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
        stems={name: s.astype(np.float32) for name, s in stems.items()},
    )


# label, repetition group, bars, loop length in bars: a pop song form with a pre-chorus, a bridge and
# a doubled last chorus
SONG_FORM = (
    ("intro", "I", 4, 2),
    ("verse", "A", 8, 4),
    ("pre-chorus", "B", 4, 2),
    ("chorus", "C", 8, 2),
    ("verse", "A", 8, 4),
    ("pre-chorus", "B", 4, 2),
    ("chorus", "C", 8, 2),
    ("bridge", "D", 8, 4),
    ("chorus", "C", 8, 2),
    ("chorus", "C", 8, 2),
    ("outro", "O", 4, 2),
)
# chord roots (semitones from A) per bar, or per half bar for the chorus
FORM_CHORDS = {
    "intro": [0, 0],
    "verse": [0, -4, -7, -2],
    "pre-chorus": [-4, -2],
    "chorus": [0, -4, -7, -2],
    "bridge": [-4, -2, 0, -5],
    "outro": [0, 0],
}


def _pluck(freq: float, dur: float, sr: int) -> np.ndarray:
    return _tone(freq, dur, sr, 4, 0.002, 0.05, 0.12)


def make_structured_song(
    bpm: float = 124.0,
    seed: int = 1,
    offset: float = 0.5,
    sample_rate: int = SAMPLE_RATE,
    tail: float = 2.0,
    form: tuple[tuple[str, str, int, int], ...] = SONG_FORM,
    humanize: bool = False,
) -> SynthSong:
    """A song whose sections each have their own drum loop, bass riff and melody motif, repeated
    exactly inside the section (loop length in `form`) and in every repeat of the section, with drum
    fills closing the verses, choruses and pre-choruses. `structure` holds the true sections, so the
    structure analysis and the section consistency of charts can be measured against it.
    `humanize` makes it less exact, like a played song: timing jitter (sd 6 ms) and velocity noise
    on every hit, a different last bar of the melody in the second verse and a harmony line over the
    last chorus."""
    rng = np.random.default_rng(seed)
    beat_len = 60.0 / bpm
    total_bars = sum(f[2] for f in form)
    end_time = offset + total_bars * 4 * beat_len
    n = int((end_time + tail) * sample_rate)
    buf = np.zeros((n, 2), dtype=np.float64)
    root = 57
    scale = [root + 12 + d for d in PENTATONIC] + [root + 24 + d for d in PENTATONIC]

    def pick(k: int) -> list[int]:
        return [scale[int(i)] for i in rng.integers(0, len(scale) - 2, k)]

    # melody motifs: (beat in bar, length in beats) per bar of the loop, pitches drawn once per song
    verse_rhythm = [[(0, 1.5), (1.5, 0.5), (2, 2)], [(0, 1), (1, 1), (2, 2)], [(0, 1.5), (1.5, 0.5), (2, 2)], [(0, 1), (1, 1), (2, 2)]]
    verse_pitch = [pick(3), pick(3)]
    verse_pitch = [verse_pitch[0], verse_pitch[1], verse_pitch[0], pick(3)]  # call, answer, call, new answer
    chorus_rhythm = [
        [(0, 0.5), (0.5, 0.5), (1, 0.25), (1.25, 0.25), (1.5, 0.5), (2, 1), (3, 0.5), (3.5, 0.5)],
        [(0, 0.75), (0.75, 0.75), (1.5, 0.5), (2, 0.5), (2.5, 0.5), (3, 1)],
    ]
    chorus_pitch = [pick(8), pick(6)]
    run_start = [int(rng.integers(0, 3)), int(rng.integers(2, 5))]  # pre-chorus runs up the scale

    kick, snare, crash = _kick(sample_rate, rng), _snare(sample_rate, rng), _crash(sample_rate, rng)
    hat = _hihat(sample_rate, rng)
    open_hat = _hihat(sample_rate, rng, length=0.25, tau=0.08)
    onsets: dict[str, list[float]] = {k: [] for k in INSTRUMENT_STEM}
    sustains: list[tuple[float, float, float]] = []
    sections: list[tuple[float, str]] = []
    structure: list[dict[str, object]] = []

    def at(time: float) -> int:
        return int(round(time * sample_rate))

    human = np.random.default_rng(seed + 104729)

    def feel(time: float, gain: float) -> tuple[float, float]:
        if not humanize:
            return time, gain
        return time + float(human.normal(0, 0.006)), gain * float(np.exp(human.normal(0, 0.15)))

    def hit(name: str, sig: np.ndarray, time: float, gain: float, pan: float = 0.0) -> None:
        time, gain = feel(time, gain)
        _add(buf, sig, at(time), gain, pan)
        onsets[name].append(time)

    def tone(name: str, midi: float, time: float, beats: float, gain: float, pan: float = 0.0) -> None:
        time, gain = feel(time, gain)
        dur = beats * beat_len * 0.92
        sig = _pluck(_midi_to_hz(midi), dur, sample_rate) if name == "pluck" else _tone(
            _midi_to_hz(midi), dur, sample_rate, 6 if name == "bass" else 5, 0.003, 0.04, 0.25 if name == "bass" else 0.0
        )
        _add(buf, sig, at(time), gain, pan)
        onsets[name].append(time)
        if name in ("lead", "pluck"):
            sustains.append((time, time + dur, float(midi)))

    seen: dict[str, int] = {}
    bar = 0
    for label, group, bars, loop in form:
        occurrence = seen.get(group, 0)
        seen[group] = occurrence + 1
        chorus_count = sum(1 for f in form if f[1] == group)
        sections.append((offset + bar * 4 * beat_len, label))
        structure.append({"startBeat": bar * 4, "bars": bars, "label": label, "group": group, "loopBars": loop})
        chords = FORM_CHORDS[label]
        for k in range(bars):
            t0 = offset + (bar + k) * 4 * beat_len
            last = k == bars - 1

            def bt(b: float) -> float:
                return t0 + b * beat_len

            # drums
            if label == "intro":
                for s in range(8):
                    hit("hihat", hat, bt(s / 2), 0.16, 0.3)
                if k % 2 == 0:
                    hit("kick", kick, bt(0), 0.8)
            elif label == "verse":
                kicks = [0, 2] + ([2.5] if k % 2 == 1 else [])
                fill_from = 2 if last else 4
                for b in kicks:
                    if b < fill_from:
                        hit("kick", kick, bt(b), 0.9)
                for b in (1, 3):
                    if b < fill_from:
                        hit("snare", snare, bt(b), 0.6)
                for s in range(8):
                    if s / 2 < fill_from:
                        hit("hihat", hat, bt(s / 2), 0.2 if s % 2 == 0 else 0.14, 0.3)
                if last:
                    for s in range(8):
                        hit("snare", snare, bt(2 + s / 4), 0.35 + 0.04 * s)
            elif label == "pre-chorus":
                for b in range(4):
                    hit("kick", kick, bt(b), 0.9)
                if last:
                    for s in range(8):
                        hit("snare", snare, bt(s / 2), 0.3 + 0.05 * s)
                else:
                    for b in (1, 3):
                        hit("snare", snare, bt(b), 0.6)
                    for s in range(8):
                        hit("hihat", hat, bt(s / 2), 0.2, 0.3)
            elif label == "chorus":
                fill_from = 3 if last else 4
                for b in range(4):
                    hit("kick", kick, bt(b), 0.95)
                for b in (1, 3):
                    if b < fill_from:
                        hit("snare", snare, bt(b), 0.65)
                for s in range(16):
                    if s / 4 < fill_from:
                        is_open = s % 4 == 2
                        hit("hihat", open_hat if is_open else hat, bt(s / 4), 0.2 if s % 2 == 0 else 0.13, 0.3)
                if last:
                    for s in range(4):
                        hit("snare", snare, bt(3 + s / 4), 0.45 + 0.08 * s)
                if k == 0:
                    hit("crash", crash, bt(0), 0.3)
            elif label == "bridge":
                for s in range(8):
                    hit("hihat", hat, bt(s / 2), 0.08, 0.3)
            elif label == "outro":
                hit("kick", kick, bt(0), 0.8)
                for b in range(4):
                    hit("hihat", hat, bt(b), 0.12, 0.3)

            # bass
            chord = chords[k % len(chords)] if label != "chorus" else None
            if label == "verse":
                for b in range(4):
                    tone("bass", root - 12 + chord, bt(b), 0.9, 0.32)
            elif label == "pre-chorus":
                for s in range(8):
                    tone("bass", root - 12 + chord, bt(s / 2), 0.45, 0.3)
            elif label == "chorus":
                for half in range(2):
                    c = chords[(k % 2) * 2 + half]
                    for s, step in enumerate((0, 0, 7, 0)):
                        tone("bass", root - 12 + c + step, bt(half * 2 + s / 2), 0.45, 0.32)
            elif label in ("bridge", "outro"):
                tone("bass", root - 12 + chord, bt(0), 3.8, 0.28)

            # pads: one chord per bar (two in the chorus)
            pad_chords = [chords[(k % 2) * 2], chords[(k % 2) * 2 + 1]] if label == "chorus" else [chord]
            for h, c in enumerate(pad_chords):
                length = 4.0 / len(pad_chords)
                for interval in (0, 3, 7):
                    _add(buf, _tone(_midi_to_hz(root + c + interval), length * beat_len * 0.95, sample_rate, 2, 0.08, 0.2), at(bt(h * length)), 0.08 if label == "bridge" else 0.05)
                onsets["pad"].append(bt(h * length))

            # melody: the lead ("vocals") in verse, pre-chorus, chorus and outro, plucks elsewhere
            if label == "verse":
                pitches = verse_pitch[k % 4]
                if humanize and occurrence == 1 and k == bars - 1:
                    pitches = [p + 2 if p + 2 in scale else p - 3 for p in pitches]  # another word, another note
                for (b, length), midi in zip(verse_rhythm[k % 4], pitches):
                    tone("lead", midi, bt(b), length, 0.2, -0.2)
            elif label == "pre-chorus":
                start = run_start[k % 2]
                for s in range(8):
                    tone("lead", scale[min(len(scale) - 1, start + s)], bt(s / 2), 0.5, 0.2, -0.2)
            elif label == "chorus":
                for (b, length), midi in zip(chorus_rhythm[k % 2], chorus_pitch[k % 2]):
                    tone("lead", midi, bt(b), length, 0.22, -0.2)
                    if humanize and occurrence == chorus_count - 1:
                        _add(buf, _tone(_midi_to_hz(midi + 12), length * beat_len * 0.9, sample_rate, 3, 0.004, 0.04), at(bt(b)), 0.06)
            elif label == "bridge":
                arp = (0, 3, 7, 12, 7, 3, 0, 3)
                for s, step in enumerate(arp):
                    tone("pluck", root + chord + step, bt(s / 2), 0.5, 0.16, 0.2)
            elif label == "intro":
                for b, step in enumerate((0, 7, 12, 7) if k % 2 == 0 else (0, 7, 12, 15)):
                    tone("pluck", root + 12 + step, bt(b), 1.0, 0.12, 0.2)
            elif label == "outro":
                if k % 2 == 0:
                    tone("lead", root + 12, bt(0), 7.5, 0.18, -0.2)
        bar += bars

    peak = np.max(np.abs(buf))
    if peak > 0:
        buf *= 0.89 / peak
    beat_times = [offset + i * beat_len for i in range(total_bars * 4)]
    return SynthSong(
        pcm=buf.astype(np.float32),
        sample_rate=sample_rate,
        beats=beat_times,
        downbeats=beat_times[::4],
        onsets={k: sorted(v) for k, v in onsets.items()},
        tempo_segments=[(offset, bpm)],
        sustains=sustains,
        sections=sections,
        structure=structure,
    )


def detection_noise(analysis: dict[str, Any], seed: int = 0) -> dict[str, Any]:
    """The analysis with the onset detection errors of a real recording: 8% of onsets lost, 4%
    doubled 30-60 ms late (a flam), timing jitter (sd 8 ms) and strength noise (sd 25%)."""
    rng = np.random.default_rng(seed)
    out = copy.deepcopy(analysis)
    onsets = []
    for o in analysis["onsets"]:
        if rng.random() < 0.08:
            continue
        o = dict(o, t=o["t"] + float(rng.normal(0, 8)), strength=max(0.01, o["strength"] * float(np.exp(rng.normal(0, 0.25)))))
        onsets.append(o)
        if rng.random() < 0.04:
            onsets.append(dict(o, t=o["t"] + float(rng.uniform(30, 60)), strength=o["strength"] * 0.5))
    out["onsets"] = sorted(onsets, key=lambda o: o["t"])
    return out
