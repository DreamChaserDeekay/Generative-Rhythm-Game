"""allin1's sections (analyzer 1.16.0, docs/PATTERN_DESIGN.md 92): the backend's own labels stay
beside ours, and a song it names no chorus in (allin1 can call an instrumental song's drops "inst"
and its breakdowns "break") gets one by the core analysis's highlight rule."""

from __future__ import annotations

import types
from functools import lru_cache

import numpy as np

from rhythm_server.analysis import ml
from rhythm_server.analysis.analyzer import analyze
from rhythm_server.synth import make_structured_song

BEATS = 0.5 + np.arange(192) * 0.5  # 120 BPM, 48 bars of 4/4, the first downbeat at 0.5 s


def _drops_and_breaks() -> list[tuple[float, float, str]]:
    """Three 8-bar drops, each followed by an 8-bar breakdown, as allin1 labels them."""
    return [(0.5 + 16.0 * i, 16.5 + 16.0 * i, "inst" if i % 2 == 0 else "break") for i in range(6)]


def _loud_where(labels: dict[str, float], segments: list[tuple[float, float, str]]) -> np.ndarray:
    """Per-beat loudness (dB) by the segment label each beat falls in."""
    out = np.full(len(BEATS), -30.0)
    for a, b, lab in segments:
        out[(BEATS >= a) & (BEATS < b)] = labels.get(lab, -30.0)
    return out


def test_the_backends_own_labels_are_kept() -> None:
    segments = [(0.0, 0.5, "start"), (0.5, 16.5, "intro"), (16.5, 48.5, "inst"), (48.5, 64.5, "break"), (64.5, 96.0, "end")]
    sections = ml.sections_from_segments(segments, BEATS, 0, 4, np.full(len(BEATS), -10.0))
    assert [(s.start_beat, s.label, s.ml_label) for s in sections] == [(0, "intro", "intro"), (32, "verse", "inst"), (96, "bridge", "break")]
    # the song's start before the first labelled segment: what the backend called it there
    sections = ml.sections_from_segments([(0.0, 8.5, "start"), (8.5, 96.0, "inst")], BEATS, 0, 4, np.full(len(BEATS), -10.0))
    assert [(s.label, s.ml_label) for s in sections] == [("intro", "start"), ("verse", "inst")]


def test_a_song_named_no_chorus_gets_its_most_intense_sections_as_the_chorus() -> None:
    from rhythm_server.analysis.structure import promote_highlight

    segments = _drops_and_breaks()
    loud = _loud_where({"inst": -6.0, "break": -20.0}, segments)
    sections = ml.sections_from_segments(segments, BEATS, 0, 4, loud)
    assert [s.label for s in sections] == ["verse", "bridge"] * 3  # what 1.15.0 kept
    assert promote_highlight(sections, loud, None, 4)
    assert [s.label for s in sections] == ["chorus", "bridge"] * 3
    assert [s.ml_label for s in sections] == ["inst", "break"] * 3
    assert len({s.group for s in sections}) == 2  # the groups stay as they were


def test_a_chorus_the_backend_found_is_left_alone() -> None:
    from rhythm_server.analysis.structure import promote_highlight

    segments = [(0.5, 16.5, "verse"), (16.5, 32.5, "chorus"), (32.5, 48.5, "inst"), (48.5, 64.5, "chorus"), (64.5, 96.0, "outro")]
    loud = _loud_where({"verse": -12.0, "chorus": -10.0, "inst": -3.0, "outro": -20.0}, segments)
    sections = ml.sections_from_segments(segments, BEATS, 0, 4, loud)
    before = [s.label for s in sections]
    assert not promote_highlight(sections, loud, None, 4)
    assert [s.label for s in sections] == before


def test_no_highlight_when_every_section_would_be_it() -> None:
    from rhythm_server.analysis.structure import promote_highlight

    segments = [(0.5, 48.5, "inst"), (48.5, 96.0, "inst")]
    loud = np.full(len(BEATS), -8.0)
    sections = ml.sections_from_segments(segments, BEATS, 0, 4, loud)
    assert not promote_highlight(sections, loud, None, 4)
    assert [s.label for s in sections] == ["verse", "verse"]


class _Structure:
    kind, name, version, options = "structure", "allin1", "9.9", {}

    def __init__(self, module: types.SimpleNamespace) -> None:
        self._module = module

    @property
    def label(self) -> str:
        return f"{self.name}-{self.version}"

    def module(self) -> types.SimpleNamespace:
        return self._module


@lru_cache(maxsize=None)
def _song():
    return make_structured_song(bpm=128.0, seed=3)


def test_the_analysis_keeps_allin1s_labels_and_finds_the_highlight() -> None:
    """Through analyze(): allin1 stubbed as it reads an instrumental song (the true choruses
    "inst", the rest "break"): the sections carry its labels, the analysis its segments, and the
    choruses come back as the chorus. The core analysis carries neither."""
    song = _song()
    starts = [t for t, _ in song.sections] + [len(song.pcm) / song.sample_rate]
    segments = [(a, b, "inst" if lab == "chorus" else "break") for (a, lab), b in zip(song.sections, starts[1:])]
    backend = _Structure(types.SimpleNamespace(structure=lambda pcm, sr, o: {"segments": segments, "beats": [], "downbeats": [], "bpm": None}))
    a = analyze(song.pcm, song.sample_rate, "allin1-stub", backends={"structure": backend})
    assert a["analyzer"]["backends"]["structure"] == "allin1-9.9"
    assert [(s["t"], s["label"]) for s in a["mlSegments"]] == [(round(x * 1000.0, 1), lab) for x, _, lab in segments]
    rows = a["sections"]
    assert all("mlLabel" in r for r in rows)
    chorus_ms = [t * 1000.0 for t, lab in song.sections if lab == "chorus"]
    found = [r for r in rows if r["label"] == "chorus"]
    assert found and all(r["mlLabel"] == "inst" for r in found)
    assert all(min(abs(r["t"] - c) for c in chorus_ms) < 1000.0 for r in found)
    core = analyze(song.pcm, song.sample_rate, "core", backends={})
    assert "mlSegments" not in core and not any("mlLabel" in r for r in core["sections"])
