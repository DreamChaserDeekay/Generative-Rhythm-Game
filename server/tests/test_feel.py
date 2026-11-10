"""The feel measures of the regression set (generator/feel.py, docs/PATTERN_DESIGN.md 95)."""

from __future__ import annotations

from functools import lru_cache

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.generator.core import generate_chart
from rhythm_server.generator.feel import chart_feel, hits_of, main_src
from rhythm_server.synth import make_structured_song

BEAT = 500.0  # 120 BPM


def _analysis(bars: int = 8) -> dict:
    beats = [{"t": i * BEAT, "isDownbeat": i % 4 == 0} for i in range(bars * 4 + 1)]
    onsets = [{"t": i * BEAT / 4, "strength": 0.8 if i % 4 == 0 else 0.3, "source": "drums" if i % 8 == 0 else "other"} for i in range(bars * 16)]
    sections = [
        {"t": 0.0, "endT": 4 * 4 * BEAT, "label": "verse", "group": "A", "energy": 0.5},
        {"t": 4 * 4 * BEAT, "endT": bars * 4 * BEAT, "label": "chorus", "group": "B", "energy": 1.0},
    ]
    return {"beats": beats, "onsets": onsets, "sections": sections, "durationMs": bars * 4 * BEAT}


def _note(t: float, src: str, lane: int = 1) -> dict:
    return {"t": t, "lane": lane, "type": "tap", "src": src}


def test_hits_are_the_charts_distinct_times() -> None:
    notes = [_note(0.0, "drums", 0), _note(2.0, "other", 3), _note(500.0, "other"), _note(1000.0, "drums"), _note(1000.0, "drums", 2)]
    hits = hits_of(notes)
    assert [t for t, _ in hits] == [0.0, 500.0, 1000.0]
    assert main_src(hits[0][1]) == "other"  # a drum + guitar chord plays the guitar
    assert main_src(hits[2][1]) == "drums"


def test_a_passage_counts_hits_chords_strong_beats_and_streams() -> None:
    a = _analysis()
    verse = [_note(i * BEAT, "drums") for i in range(16)]  # quarter notes, drums on every beat
    chorus = []
    for i in range(64):  # sixteenths of the guitar, with a drum under beats one and three
        t = 16 * BEAT + i * BEAT / 4
        chorus.append(_note(t, "other", 3))
        if i % 8 == 0:
            chorus.append(_note(t, "drums", 0))
    f = chart_feel(verse + chorus, a)
    v, c = f["sections"]
    assert v["hits"] == 16 and c["hits"] == 64
    assert c["hitsRatio"] > 1.5 > v["hitsRatio"]
    assert f["highlight"] > 1.0
    assert c["notesPerHit"] == 72 / 64
    assert v["strongDrums"] == 0.5  # beats one and three of every bar
    assert c["strongDrums"] == 1.0
    assert c["sixteenths"] == 1.0 and v["sixteenths"] == 0.0
    assert v["switches"] == 0.0 and c["switches"] == 0.0  # the chorus hits play the guitar throughout
    assert v["downbeats"] == 1.0
    assert abs(c["src"]["other"] - 64 / 72) < 1e-3  # shares are rounded to 0.001


def test_a_human_chart_without_sources_is_measured_by_its_times() -> None:
    a = _analysis()
    notes = [{"t": i * BEAT / 4, "lane": i % 7 + 1, "type": "tap"} for i in range(128)]
    f = chart_feel(notes, a, [(0.0, 8 * BEAT)])
    w = f["windows"][0]
    assert w["hits"] == 32 and w["switches"] is None and w["strongDrums"] is None
    assert w["onTune"] == 28 / 32  # the hits on the tune's onsets against those on the drums'
    assert w["src"]["none"] == 1.0


@lru_cache(maxsize=None)
def _song() -> dict:
    s = make_structured_song(bpm=128.0, seed=2)
    return analyze(s.pcm, s.sample_rate, "sha256:feel", backends={})


def test_a_generated_chart_has_a_row_per_section() -> None:
    a = _song()
    chart = generate_chart(a, "6K", "EXPERT", None)
    chorus = next(s for s in a["sections"] if s["label"] == "chorus")
    f = chart_feel(chart["notes"], a, [(float(chorus["t"]), float(chorus["endT"]))])
    assert len(f["sections"]) == len(a["sections"])
    assert f["highlight"] is not None and f["highlight"] > 1.0  # the chorus is the densest
    assert all(0.0 <= (r["src"]["drums"] or 0.0) <= 1.0 for r in f["sections"])
    assert f["windows"][0]["hits"] == next(r for r in f["sections"] if r["label"] == "chorus")["hits"]
