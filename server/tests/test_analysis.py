from __future__ import annotations

import numpy as np
import pytest

from conftest import analysis_of, synth
from rhythm_server.generator.tempo import TempoMap

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


def test_downbeats_match_bar_starts() -> None:
    song = synth(128.0, 32, 1)
    a = analysis_of(128.0, 32, 1)
    downs = np.array([b["t"] for b in a["beats"] if b["isDownbeat"]])
    hits = [np.min(np.abs(downs - d * 1000.0)) < 5.0 for d in song.downbeats]
    assert np.mean(hits) == 1.0
    assert a["timing"]["meter"][0]["beatsPerMeasure"] == 4


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
    assert set(o) >= {"t", "strength", "band", "bands", "pitch", "sustainEnd"}
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
