from __future__ import annotations

import numpy as np
import pytest

from conftest import analysis_of, synth
from rhythm_server.analysis.analyzer import analyze
from rhythm_server.generator.tempo import TempoMap
from rhythm_server.synth import make_drum_song

GRID_LIMIT_MS = 10.0


def grid_errors_ms(analysis: dict, true_beats: list[float]) -> np.ndarray:
    est = np.array([b["t"] for b in analysis["beats"]])
    return np.array([np.min(np.abs(est - t * 1000.0)) for t in true_beats])


@pytest.mark.parametrize("bpm,seed", [(128.0, 1), (174.0, 2), (97.0, 3), (140.0, 5)])
def test_constant_tempo_grid_is_within_10ms_over_the_whole_song(bpm: float, seed: int) -> None:
    song = synth(bpm, 32, seed)
    a = analysis_of(bpm, 32, seed)
    assert a["tempo"]["constant"]
    assert abs(a["tempo"]["bpm"] - bpm) < 0.01
    errors = grid_errors_ms(a, song.beats)
    assert errors.max() <= GRID_LIMIT_MS, f"max grid error {errors.max():.2f}ms"


@pytest.mark.parametrize(
    "style,bpm",
    [("pop16", 84.0), ("hiphop", 92.0), ("shuffle", 100.0), ("jcore", 175.0), ("jcore", 215.0), ("trance", 150.0), ("dotted", 170.0)],
)
def test_the_beat_is_the_backbeat_level_on_the_beat(style: str, bpm: float) -> None:
    """Sixteenth hi-hats over a slow backbeat are not read at twice the tempo, a syncopated kick
    not at 4:3 of it, a shuffle's swung eighths not as the beat; a fast song stays fast (above
    200 BPM too); an off-beat bass over a soft kick does not pull the beat onto the off-beats; a
    3+3+2 kick and bass are not read at 2/3 of the tempo (or half of it)."""
    song = make_drum_song(style, bpm)
    a = analyze(song.pcm, song.sample_rate, f"sha256:drums-{style}-{bpm}", backends={})
    assert abs(a["tempo"]["bpm"] - bpm) < 0.05, a["tempo"]
    errors = grid_errors_ms(a, song.beats)
    assert errors.max() <= GRID_LIMIT_MS, f"max grid error {errors.max():.2f}ms"


def test_a_held_chord_swelling_is_no_onset() -> None:
    """The partials of a held piano chord beat against each other and the spectral flux peaks many
    times a second; only the chords' attacks are onsets."""
    song = make_drum_song("piano", 90.0)
    a = analyze(song.pcm, song.sample_rate, "sha256:drums-piano", backends={})
    detected = np.array([o["t"] for o in a["onsets"]]) / 1000.0
    chords = np.array(song.onsets["piano"])
    assert all(np.min(np.abs(detected - t)) < 0.03 for t in chords)
    assert len(detected) <= 2 * len(chords), len(detected)


def test_attack_ranks_a_new_sound_above_a_sounding_one_changing() -> None:
    """A loud drum-like onset whose band jumps is a new sound; a weaker low-band onset 50 ms after
    it with no rise of its own (the same sound's low end arriving late) is not."""
    from rhythm_server.analysis.onsets import attack_confidence

    rate = 100.0
    levels = np.full((300, 3), -30.0)
    levels[100:, 1] = -18.0  # A: the mid band jumps at 1.00 s
    levels[200:, 2] = -20.0  # C: the high band jumps at 2.00 s
    times = np.array([1.0, 1.05, 2.0])
    strength = np.array([0.8, 0.3, 0.5])
    bands = np.array([[0.2, 0.7, 0.1], [0.8, 0.15, 0.05], [0.1, 0.2, 0.7]])
    attack = attack_confidence(times, strength, bands, np.array([0.5, 0.02, 0.1]), np.array([0.6, 0.1, 0.6]), levels, rate, 0.0)
    assert attack[1] < 0.5 < min(attack[0], attack[2]), attack


def test_attack_is_high_on_the_true_onsets_of_a_song(analysis128: dict, song128) -> None:
    detected = np.array([o["t"] for o in analysis128["onsets"]]) / 1000.0
    attack = np.array([o["attack"] for o in analysis128["onsets"]])
    assert ((attack >= 0.0) & (attack <= 1.0)).all()
    truth = np.unique(np.round(np.concatenate([np.array(v) for k, v in song128.onsets.items() if k != "pad"]), 5))
    true = np.array([np.min(np.abs(truth - d)) <= 0.03 for d in detected])
    assert attack[true].mean() >= 0.8, attack[true].mean()
    if (~true).sum() >= 5:
        assert attack[~true].mean() <= 0.5, attack[~true].mean()


def test_tempo_map_reproduces_beat_times() -> None:
    song = synth(128.0, 32, 1)
    a = analysis_of(128.0, 32, 1)
    tempo = TempoMap(a["timing"])
    first_down = song.downbeats[0] * 1000.0
    assert abs(a["timing"]["offsetMs"] - first_down) < 2.0
    for k in (0, 4, 37, 100):
        assert abs(tempo.beat_to_ms(k) - song.beats[k] * 1000.0) < GRID_LIMIT_MS


def test_tempo_change_is_split_into_segments() -> None:
    song = synth(120.0, 32, 8, tempo_change=(16, 150.0))
    a = analysis_of(120.0, 32, 8, tempo_change=(16, 150.0))
    assert not a["tempo"]["constant"]
    assert abs(a["tempo"]["bpmMin"] - 120.0) < 0.05
    assert abs(a["tempo"]["bpmMax"] - 150.0) < 0.05
    errors = grid_errors_ms(a, song.beats)
    assert errors.max() <= GRID_LIMIT_MS
    tempo = TempoMap(a["timing"])
    for k in range(len(song.beats)):
        b = tempo.ms_to_beat(song.beats[k] * 1000.0)
        assert abs(b - round(b)) * tempo.beat_ms(b) < GRID_LIMIT_MS


def _grid_onsets(bpm: float, duration: float, offset: float = 0.5) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, float]:
    """Onsets on every beat (strong, low) and half-beat (weaker, high) of one tempo, with an onset
    function at 100 frames a second: (times, strengths, low fractions, onset function, frame rate)."""
    period = 60.0 / bpm
    beats = np.arange(offset, duration - 1.0, period)
    times = np.concatenate([beats, beats + period / 2])
    order = np.argsort(times)
    strengths = np.concatenate([np.ones(len(beats)), 0.5 * np.ones(len(beats))])[order]
    low = np.concatenate([0.7 * np.ones(len(beats)), 0.2 * np.ones(len(beats))])[order]
    odf = np.zeros(int(duration * 100.0))
    odf[np.round(times[order] * 100.0).astype(int)] = strengths
    return times[order], strengths, low, odf, 100.0


def test_a_tempo_split_that_explains_the_onsets_no_better_is_dropped(monkeypatch: pytest.MonkeyPatch) -> None:
    """Two windows whose local fit wanders to another tempo split a third of the one-BPM BMS songs
    into segments, most of them off the chart's beats; a split stands only when its beats explain
    the onsets clearly better than the one grid."""
    from rhythm_server.analysis import tempo

    times, strengths, low, odf, rate = _grid_onsets(128.0, 120.0)
    real = tempo._local_tempos
    monkeypatch.setattr(tempo, "_local_tempos", lambda *a: [(c, b * (1.02 if 40.0 < c < 70.0 else 1.0)) for c, b in real(*a)])
    kept = tempo.estimate_tempo(times, strengths, low, odf, rate, 120.0)
    assert kept.constant and abs(kept.bpm - 128.0) < 0.01
    on_beats = times[strengths == 1.0]
    assert max(np.min(np.abs(kept.beats - t)) for t in on_beats) < 0.005
    monkeypatch.setattr(tempo, "PIECEWISE_WINDOW_SHARE", -1.0)  # without the check the same song splits
    assert not tempo.estimate_tempo(times, strengths, low, odf, rate, 120.0).constant


@pytest.mark.parametrize("gain,picked", [(2.0, 120.0), (3.0, 240.0)])
def test_the_tempo_octave_moves_only_on_a_clear_margin(monkeypatch: pytest.MonkeyPatch, gain: float, picked: float) -> None:
    """Half or twice the level found wins only when it scores OCTAVE_MARGIN more: fitted on fast
    BMS songs, the model alone read slow pop and hip-hop at twice their tempo."""
    from rhythm_server.analysis import tempo

    def score(*args: object) -> tuple[tempo.GridFit, float]:
        bpm = float(args[5])  # (times, weights, drums, odf, frame_rate, bpm, duration)
        return tempo.GridFit(bpm=bpm, phase=0.0, score=0.5), gain if abs(bpm - 240.0) < 1.0 else 0.0

    monkeypatch.setattr(tempo, "_octave_score", score)
    fit = tempo.GridFit(bpm=120.0, phase=0.1, score=0.5)
    assert tempo._choose_octave(np.zeros(1), np.zeros(1), None, np.zeros(1), 100.0, fit, 60.0).bpm == picked


@pytest.mark.parametrize("half_beats,picked", [(1.0, 240.0), (0.0, 120.0)])
def test_drums_on_the_half_beats_take_a_kept_tempo_up(monkeypatch: pytest.MonkeyPatch, half_beats: float, picked: float) -> None:
    """Twice the level found wins below the margin when the kicks and snares hit its half-beats
    about as hard as its beats (a fast song read at half its tempo), not when they keep to its beats."""
    from rhythm_server.analysis import tempo

    def score(*args: object) -> tuple[tempo.GridFit, float]:
        bpm = float(args[5])
        return tempo.GridFit(bpm=bpm, phase=0.0, score=0.5), 1.5 if abs(bpm - 240.0) < 1.0 else 0.0

    monkeypatch.setattr(tempo, "_octave_score", score)
    rate, duration = 100.0, 60.0
    env = np.full(int(duration * rate), 0.01)
    beats = np.round(np.arange(0.0, duration, 0.5) * rate).astype(int)
    env[beats] = 1.0
    env[beats + 25] = max(half_beats, 0.01)  # the half-beats
    drums = tempo.DrumFlux(high=env.copy(), full=2 * env, frame_rate=rate)
    fit = tempo.GridFit(bpm=120.0, phase=0.0, score=0.5)
    assert tempo._choose_octave(np.zeros(1), np.zeros(1), drums, np.zeros(1), 100.0, fit, duration).bpm == picked


@pytest.mark.parametrize("cue", ["harmony", "drums over mid", "sound"])
def test_the_half_beat_cues_move_the_phase_onto_the_beat(cue: str) -> None:
    """With a grid fitted on the off-beats, chords changing on the beats move it onto them; so do
    drums clearly on the beats, though the mid-band onsets (an off-beat bass's partials) sit on the
    off-beats, and onsets on the beats and half-beats whose sound changes with every bar."""
    from rhythm_server.analysis.tempo import DrumFlux, _half_phase

    bpm, duration, rate = 120.0, 60.0, 100.0
    period = 60.0 / bpm
    beats = np.arange(0.0, duration, period)
    frames = int(duration * rate)
    flux = np.full(frames, 0.01)
    times = beats + period / 2
    mid = np.zeros(len(times))
    chroma = strengths = spectra = None
    if cue == "harmony":
        chord = np.random.default_rng(0).integers(0, 12, len(beats))
        chroma = np.zeros((frames, 12))
        for i, b in enumerate(beats):
            chroma[int(b * rate) : int((b + period) * rate), chord[i]] = 1.0
    elif cue == "sound":
        times = np.sort(np.concatenate([beats, beats + period / 2]))
        mid = np.zeros(len(times))
        strengths = np.ones(len(times))
        spectra = np.repeat(np.random.default_rng(1).random((len(beats) // 4 + 1, 20)), 8, axis=0)[: len(times)]  # one sound a bar
    else:
        mid[:] = 1.0  # every mid-band onset on the off-beats
        flux = flux.copy()
        flux[np.round(beats * rate).astype(int)] = 1.0
    drums = DrumFlux(high=flux.copy(), full=flux.copy(), frame_rate=rate)
    phase = _half_phase(times, mid, drums, bpm, period / 2, duration, chroma, rate, strengths, spectra)
    assert min(phase, period - phase) < 1e-6
    if cue == "sound":  # and a grid on the beats stays, which the bias alone would move
        assert _half_phase(times, mid, drums, bpm, 0.0, duration, chroma, rate, strengths, spectra) == 0.0
        assert _half_phase(times, mid, drums, bpm, 0.0, duration, chroma, rate) != 0.0


def test_downbeats_match_bar_starts() -> None:
    song = synth(128.0, 32, 1)
    a = analysis_of(128.0, 32, 1)
    downs = np.array([b["t"] for b in a["beats"] if b["isDownbeat"]])
    hits = [np.min(np.abs(downs - d * 1000.0)) < 5.0 for d in song.downbeats]
    assert np.mean(hits) == 1.0
    assert a["timing"]["meter"][0]["beatsPerMeasure"] == 4


def test_bar_harmony_places_the_downbeat_between_like_accents() -> None:
    """Kicks on beats 1 and 3 accent both about alike (here beat 3 a little more); the chord that
    changes every bar settles which of them starts the bar."""
    from rhythm_server.analysis.meter import estimate_meter

    n, first = 64, 1  # a pickup beat before the first bar
    cues = np.array([(1.05 if (i - first) % 4 == 2 else 1.0) if (i - first) % 2 == 0 else 0.2 for i in range(n)])
    chords = np.random.default_rng(0).random((n // 4 + 2, 12))
    chroma = np.array([chords[(i - first) // 4 + 1] for i in range(n)])
    assert estimate_meter(cues).first_downbeat_index == first + 2
    meter = estimate_meter(cues, chroma)
    assert meter.beats_per_bar == 4 and meter.first_downbeat_index == first


@pytest.mark.parametrize("song", ["kick on one", "four on the floor"])
def test_the_drums_place_the_downbeat_with_the_harmony(song: str) -> None:
    """Over one held chord the kick on beat 1 and the snares on 2 and 4 place the downbeat. Under
    four-on-the-floor, whose claps on 2 and 4 put a little more into the kicks' band there, the
    chord changing every bar still does."""
    from rhythm_server.analysis.meter import BeatAccents, estimate_meter

    n, first = 64, 1
    beat = [(i - first) % 4 for i in range(n)]
    cues = np.zeros(n)  # the per-beat cues say nothing
    snares = np.array([1.0 if b in (1, 3) else 0.1 for b in beat])
    if song == "kick on one":
        kicks = np.array([1.0 if b == 0 else 0.3 for b in beat])
        chroma = np.ones((n, 12))
    else:
        kicks = np.array([1.05 if b in (1, 3) else 1.0 for b in beat])
        chords = np.random.default_rng(2).random((n // 4 + 2, 12))
        chroma = np.array([chords[(i - first) // 4 + 1] for i in range(n)])
    accents = BeatAccents(kicks=kicks, snares=snares, onsets=np.full(n, 0.5))
    meter = estimate_meter(cues, chroma, accents)
    assert meter.beats_per_bar == 4 and meter.first_downbeat_index == first


def test_the_loudness_changing_bar_by_bar_places_the_downbeat() -> None:
    """With even drums and one held chord, bars that alternate loud and soft place the downbeat:
    bars shifted off it straddle the changes."""
    from rhythm_server.analysis.meter import BeatAccents, estimate_meter

    n, first = 64, 1
    onsets = np.array([1.0 if ((i - first) // 4) % 2 == 0 else 0.4 for i in range(n)])
    accents = BeatAccents(kicks=np.ones(n), snares=np.ones(n), onsets=onsets)
    meter = estimate_meter(np.zeros(n), np.ones((n, 12)), accents)
    assert meter.beats_per_bar == 4 and meter.first_downbeat_index == first


def test_the_sound_changing_bar_by_bar_places_the_downbeat() -> None:
    """With even drums, even onsets and one held chord, onsets that sound different in every bar
    place the downbeat: bars shifted off it straddle the changes."""
    from rhythm_server.analysis.meter import BeatAccents, estimate_meter

    n, first = 64, 2
    sounds = np.random.default_rng(3).random((n // 4 + 2, 20))
    timbre = np.array([sounds[(i - first) // 4 + 1] for i in range(n)])
    accents = BeatAccents(kicks=np.ones(n), snares=np.ones(n), onsets=np.ones(n))
    assert estimate_meter(np.zeros(n), np.ones((n, 12)), accents).first_downbeat_index != first  # nothing to go by
    accents.timbre = timbre
    meter = estimate_meter(np.zeros(n), np.ones((n, 12)), accents)
    assert meter.beats_per_bar == 4 and meter.first_downbeat_index == first


@pytest.mark.parametrize("beats_per_bar", [3, 4])
def test_the_drums_and_the_harmony_settle_three_against_four(beats_per_bar: int) -> None:
    """A kick on the first beat of each bar, snares on the others and chords that change with every
    bar and come back two bars on: bars of three read as 3/4, bars of four as 4/4."""
    from rhythm_server.analysis.meter import BeatAccents, estimate_meter

    n, m = 96, beats_per_bar
    beat = np.arange(n) % m
    chords = np.random.default_rng(4).random((2, 12))
    chroma = np.array([chords[(i // m) % 2] for i in range(n)])
    accents = BeatAccents(kicks=np.where(beat == 0, 1.0, 0.3), snares=np.where(beat == 0, 0.2, 1.0), onsets=np.where(beat == 0, 1.0, 0.6))
    meter = estimate_meter(np.where(beat == 0, 1.0, 0.1), chroma, accents)
    assert meter.beats_per_bar == m and meter.first_downbeat_index == 0


@pytest.mark.parametrize("chord_beats,meter", [(4, 4), (3, 3)])
def test_bar_harmony_settles_three_against_four(chord_beats: int, meter: int) -> None:
    """Accents every third beat read as 3/4; the chords say whether the bars hold three beats or four."""
    from rhythm_server.analysis.meter import estimate_meter

    n = 72
    cues = np.array([1.0 if i % 3 == 0 else 0.1 for i in range(n)])
    chords = np.random.default_rng(1).random((n // chord_beats + 1, 12))
    chroma = np.array([chords[i // chord_beats] for i in range(n)])
    assert estimate_meter(cues).beats_per_bar == 3
    assert estimate_meter(cues, chroma).beats_per_bar == meter


def test_onsets_match_ground_truth() -> None:
    song = synth(128.0, 32, 1)
    a = analysis_of(128.0, 32, 1)
    detected = np.array([o["t"] for o in a["onsets"]]) / 1000.0
    truth = np.unique(np.round(np.concatenate([np.array(v) for k, v in song.onsets.items() if k != "pad"]), 5))
    matched_truth = np.array([np.min(np.abs(detected - t)) <= 0.03 for t in truth])
    matched_det = np.array([np.min(np.abs(truth - d)) <= 0.03 for d in detected])
    recall, precision = matched_truth.mean(), matched_det.mean()
    f1 = 2 * recall * precision / (recall + precision)
    assert f1 >= 0.85, f"recall={recall:.2f} precision={precision:.2f}"
    errors = [detected[np.argmin(np.abs(detected - t))] - t for t in truth[matched_truth]]
    assert abs(np.median(errors)) * 1000.0 < 3.0  # no timing bias


def test_sustains_follow_long_lead_notes() -> None:
    song = synth(128.0, 32, 1)
    a = analysis_of(128.0, 32, 1)
    long_notes = [(s, e) for s, e, _ in song.sustains if e - s >= 0.5]
    found = []
    for s, e in long_notes:
        cand = [x for x in a["sustains"] if abs(x["t"] - s * 1000.0) < 30]
        if cand:
            found.append(abs(cand[0]["endT"] - e * 1000.0))
    assert len(found) >= 0.6 * len(long_notes)
    assert np.median(found) < 60.0


def test_sections_find_repeated_groups() -> None:
    a = analysis_of(128.0, 64, 4)
    groups = [s["group"] for s in a["sections"]]
    assert len(a["sections"]) >= 3
    assert len(set(groups)) < len(groups)  # some section repeats
    assert any(s["label"] == "chorus" for s in a["sections"])


def test_result_shape(analysis128: dict) -> None:
    a = analysis128
    for key in ("audioHash", "durationMs", "tempo", "timing", "beats", "onsets", "sustains", "sections", "energy", "waveform", "previewMs"):
        assert key in a
    assert a["timing"]["tempoMap"][0]["beat"] == 0
    o = a["onsets"][0]
    assert set(o) >= {"t", "strength", "band", "bands", "pitch", "sustainEnd", "attack"}
    assert o["band"] in ("low", "mid", "high")


def test_bpm_override_keeps_phase_and_uses_given_tempo() -> None:
    from rhythm_server.analysis.analyzer import analyze

    song = synth(128.0, 16, 1)
    a = analyze(song.pcm, song.sample_rate, "x", overrides={"bpm": 64.0})
    assert abs(a["tempo"]["bpm"] - 64.0) < 1e-6
    shifted = analyze(song.pcm, song.sample_rate, "x", overrides={"offsetShiftMs": 25.0})
    base = analysis_of(128.0, 16, 1)
    assert abs((shifted["timing"]["offsetMs"] - base["timing"]["offsetMs"]) - 25.0) < 1.0


@pytest.mark.parametrize(
    "name,pcm",
    [
        ("silence", np.zeros((44100 * 3, 2), np.float32)),
        ("half-second", np.random.default_rng(0).uniform(-0.1, 0.1, (22050, 2)).astype(np.float32)),
        ("steady tone", np.stack([np.sin(2 * np.pi * 440 * np.arange(44100 * 3) / 44100)] * 2, 1).astype(np.float32) * 0.5),
    ],
)
def test_degenerate_audio_does_not_crash_or_invent_onsets(name: str, pcm: np.ndarray) -> None:
    from rhythm_server.analysis.analyzer import analyze

    a = analyze(pcm, 44100, name)
    assert a["timing"]["tempoMap"][0]["beat"] == 0
    if name != "half-second":
        assert len(a["onsets"]) <= 2  # at most the tone's attack
