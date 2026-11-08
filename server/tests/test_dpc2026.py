"""The DPC2026 review rules (docs/PATTERN_DESIGN.md 91, generator 0.9.50): a key is hit again quickly
only by the sound it just played, a tune's pitch comes back on its lane, and the drum beats of a busy
bar take both hands. 7K+1S keeps its values fitted to human BMS charts (the rules are off there)."""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.config import load_config
from rhythm_server.difficulty.guides import dpc, hands, onset_pitches
from rhythm_server.generator.core import generate_chart
from rhythm_server.synth import make_structured_song

SONGS = ((124.0, 1), (140.0, 2))
CHARTS = (("6K", "EXPERT"), ("4K+FX", "HARD"), ("8K", "EXPERT"))


@lru_cache(maxsize=None)
def analysis_of(bpm: float, seed: int) -> dict:
    s = make_structured_song(bpm=bpm, seed=seed)
    return analyze(s.pcm, s.sample_rate, f"sha256:dpc2026-{bpm}-{seed}", backends={})


def measures() -> dict[str, float]:
    """Each measure's mean over the songs and charts (None-free)."""
    got: dict[str, list[float]] = {}
    for bpm, seed in SONGS:
        a = analysis_of(bpm, seed)
        pitch_of = onset_pitches(a)
        for key_mode, tier in CHARTS:
            notes = generate_chart(a, key_mode, tier, None)["notes"]
            row = dict(dpc(notes, key_mode, pitch_of))
            row["unmotivatedJacks"] = hands(notes, key_mode, pitch_of)["unmotivatedJacks"]
            for k, v in row.items():
                if v is not None:
                    got.setdefault(k, []).append(float(v))
    return {k: float(np.mean(v)) for k, v in got.items()}


def test_the_dpc_measures_count_what_they_say() -> None:
    # 6K: keys 1-3 left hand, 4-6 right
    notes = [
        # a dense bar (12 key notes): beats 1 and 3 struck by both hands, then by one
        *({"t": 1000.0 + 125 * i, "beat": 0.25 * i, "lane": i % 6, "src": "other"} for i in range(12)),
        {"t": 1000.0, "beat": 0.0, "lane": 3, "src": "drums"},
    ]
    got = dpc(notes, "6K")
    # beat 1 (lanes 0 + 3) has both hands; beat 3 (lane 2 alone: 8 % 6) has one
    assert got["strongBothHands"] == 0.5
    pitches = {round(1000.0 + 300 * i, 1): p for i, p in enumerate((60, 62, 64, 60, 60))}
    tune = [{"t": 1000.0 + 300 * i, "beat": 0.6 * i, "lane": lane, "src": "other"} for i, lane in enumerate((0, 0, 0, 2, 2))]
    got = dpc(tune, "6K", lambda t: pitches.get(round(t, 1)))
    # 60 comes back at the 4th note on lane 2 (it was on lane 0) and again on lane 2: one of two kept;
    # lane 0 struck three times in a row by 60-62-64 is one arpeggio jack in 5 key notes
    assert got["samePitchStay"] == 0.5
    assert got["arpeggioJacks"] == 200.0


def test_the_review_rules_move_the_charts_their_way(monkeypatch) -> None:
    on = measures()
    grg = load_config("patterns")["hands"]
    monkeypatch.setitem(grg, "otherSoundJack", 0.0)
    monkeypatch.setitem(grg, "samePitchStay", 0.0)
    monkeypatch.setitem(grg, "strongTwoHands", {**grg["strongTwoHands"], "cost": 0.0})
    off = measures()
    # another sound on a key just hit (억지 연타), and an arpeggio forced into one key (a disqualifying pattern)
    assert on["unmotivatedJacks"] < off["unmotivatedJacks"], (on, off)
    assert on["arpeggioJacks"] <= off["arpeggioJacks"], (on, off)
    # the same pitch back on its lane, both hands on the busy bars' drum beats
    assert on["samePitchStay"] > off["samePitchStay"], (on, off)
    assert on["strongBothHands"] > off["strongBothHands"], (on, off)


def test_7k_charts_do_not_take_the_review_rules(monkeypatch) -> None:
    a = analysis_of(*SONGS[0])
    before = generate_chart(a, "7K+1S", "EXPERT", None)["notes"]
    grg = load_config("patterns")["hands"]
    # the rules' values for the other key modes, much stronger: 7K+1S must not see them
    monkeypatch.setitem(grg, "otherSoundJack", {"7K+1S": 0.0, "*": 30.0})
    monkeypatch.setitem(grg, "samePitchStay", {"7K+1S": 0.0, "*": 30.0})
    monkeypatch.setitem(grg, "strongTwoHands", {**grg["strongTwoHands"], "cost": {"7K+1S": 0.0, "*": 30.0}})
    assert generate_chart(a, "7K+1S", "EXPERT", None)["notes"] == before
