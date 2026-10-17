"""The real ML backends, run only where they are installed (pip install demucs beat-this basic-pitch).

Skipped in the default environment. The first run downloads model weights.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
import pytest

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.analysis.backends import detect
from rhythm_server.analysis.stems import STEM_NAMES
from rhythm_server.synth import make_song

pytestmark = pytest.mark.slow


@lru_cache(maxsize=None)
def song():
    return make_song(128.0, 12, seed=3, with_stems=True, repeat_melody=True)


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a.astype(np.float64).ravel(), b.astype(np.float64).ravel()
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


def test_beat_this_beats_and_downbeats() -> None:
    pytest.importorskip("torch")
    pytest.importorskip("beat_this")
    from rhythm_server.analysis.backends import beat_this_backend

    s = song()
    beats, downbeats = beat_this_backend.track(s.pcm, s.sample_rate, {"checkpoint": "final0", "device": "cpu"})
    truth = np.array(s.beats)
    inside = beats[(beats >= truth[0] - 0.1) & (beats <= truth[-1] + 0.1)]
    assert np.median([np.min(np.abs(truth - b)) for b in inside]) < 0.02
    downs = np.array(s.downbeats)
    assert np.median([np.min(np.abs(downs - d)) for d in downbeats]) < 0.03


def test_demucs_stems() -> None:
    pytest.importorskip("torch")
    pytest.importorskip("demucs")
    from rhythm_server.analysis.backends import demucs_backend

    s = song()
    stems = demucs_backend.separate(s.pcm, s.sample_rate, {"model": "htdemucs", "device": "cpu", "shifts": 1, "overlap": 0.25})
    assert set(stems) == set(STEM_NAMES)
    assert float(np.max(np.abs(sum(stems.values()) - s.pcm))) < 1e-4
    assert _corr(stems["drums"], s.stems["drums"]) > 0.9
    assert _corr(stems["bass"], s.stems["bass"]) > 0.8


def test_basic_pitch_notes_follow_the_lead() -> None:
    pytest.importorskip("basic_pitch")
    from rhythm_server.analysis.backends import basic_pitch_backend

    s = song()
    notes = basic_pitch_backend.notes(s.pcm, s.sample_rate, {"minNoteMs": 120})
    assert notes
    found = 0
    for start, _end, midi in s.sustains:
        found += any(abs(n[0] - start) <= 0.06 and abs(n[2] - midi) <= 0.5 for n in notes)
    assert found / len(s.sustains) >= 0.7


def test_full_analysis_uses_every_installed_backend() -> None:
    backends = detect()
    if not backends:
        pytest.skip("no ML backend installed")
    s = song()
    a = analyze(s.pcm, s.sample_rate, "ml-integration")
    used = a["analyzer"]["backends"]
    assert not a["analyzer"].get("errors"), a["analyzer"].get("errors")
    for kind, backend in backends.items():
        assert used[kind] == backend.label
