"""Instrument solos (generator 0.9.52, docs/PATTERN_DESIGN.md 94): a section a guitar or piano leads
(6-stem analysis: the section's `lead` and `leadShares`) takes more of the chart's notes than its
plan, follows the tune under the voices' tiers too, and keeps its drums on beats one and three, as
chords with the tune where both sound. A song without one keeps its charts."""

from __future__ import annotations

import copy
from contextlib import contextmanager
from functools import lru_cache

import numpy as np

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.generator import core
from rhythm_server.generator import sections as sectioned
from rhythm_server.generator.candidates import Candidate
from rhythm_server.generator.core import generate_chart
from rhythm_server.generator.sections import Unit, _companion
from rhythm_server.synth import make_structured_song

SOLO = 5  # the bridge of the structured song (group D, played once)


@lru_cache(maxsize=None)
def _analysis() -> dict:
    s = make_structured_song(bpm=128.0, seed=2)
    return analyze(s.pcm, s.sample_rate, "sha256:lead-solo", backends={})


def _with_guitar_solo(a: dict) -> dict:
    """The analysis as the 6-stem backend would give it with a guitar leading the bridge."""
    a = copy.deepcopy(a)
    sec = a["sections"][SOLO]
    sec["lead"] = "guitar"
    sec["leadShares"] = {"vocals": 0.1, "guitar": 0.62, "piano": 0.08, "other": 0.2}
    for o in a["onsets"]:
        inside = sec["t"] <= o["t"] < sec["endT"]
        o["instruments"] = {"guitar": (0.8 if o.get("source") == "other" else 0.2) if inside else 0.1, "piano": 0.05}
    return a


@contextmanager
def _no_lead_rules():
    cfg = sectioned.sectioned_config()
    saved = cfg.pop("leadSolo")
    core._plan_cache.clear()
    try:
        yield
    finally:
        cfg["leadSolo"] = saved
        core._plan_cache.clear()


def _solo_notes(chart: dict, a: dict) -> list[dict]:
    sec = a["sections"][SOLO]
    return [n for n in chart["notes"] if sec["t"] <= n["t"] < sec["endT"]]


def _strong(n: dict, a: dict) -> bool:
    beat_in_bar = (n["beat"] - a["sections"][SOLO]["startBeat"]) % 4
    return min(beat_in_bar, 4 - beat_in_bar) < 1e-3 or abs(beat_in_bar - 2) < 1e-3


def test_songs_without_an_instrument_solo_keep_their_charts() -> None:
    a = _analysis()
    for key_mode, tier in (("6K", "HARD"), ("6K", "ELITE")):
        on = generate_chart(a, key_mode, tier, None)["notes"]
        with _no_lead_rules():
            off = generate_chart(a, key_mode, tier, None)["notes"]
        assert on == off


def test_an_instrument_solo_takes_more_notes() -> None:
    a = _with_guitar_solo(_analysis())
    on = len(_solo_notes(generate_chart(a, "6K", "EXPERT", None), a))
    with _no_lead_rules():
        off = len(_solo_notes(generate_chart(a, "6K", "EXPERT", None), a))
    assert on >= 1.15 * off


def test_an_instrument_solo_keeps_its_drums_on_beats_one_and_three() -> None:
    a = _with_guitar_solo(_analysis())
    for key_mode, tier in (("6K", "HARD"), ("7K+1S", "EXPERT")):
        notes = _solo_notes(generate_chart(a, key_mode, tier, None), a)
        drums = [n for n in notes if n.get("src") == "drums"]
        tune = [n for n in notes if n.get("src") in ("vocals", "other")]
        assert drums and all(_strong(n, a) for n in drums)
        # the drums there play with the tune: chords of the two
        at: dict[float, set] = {}
        for n in notes:
            at.setdefault(n["t"], set()).add(n.get("src"))
        assert sum(1 for v in at.values() if "drums" in v and v & {"vocals", "other"}) >= 3
        assert len(drums) <= 0.25 * len(notes) and len(tune) >= 0.5 * len(notes)
        with _no_lead_rules():
            before = _solo_notes(generate_chart(a, key_mode, tier, None), a)
        assert len(tune) / len(notes) > sum(1 for n in before if n.get("src") in ("vocals", "other")) / len(before)


def test_an_instrument_solos_companion_drums_are_on_beat_three_only() -> None:
    def cand(beat: float, strength: float) -> Candidate:
        return Candidate(beat=beat, t=beat * 500.0, subdivision=1, strength=strength, bands=np.ones(3), pitch=None, harmonic=0.2,
                         sustain_beats=0.5, intensity=0.5, downbeat=False, sources=np.array([0.8, 0.1, 0.05, 0.05]), attack=0.9, score=strength)

    u = Unit(index=0, section=0, group="D", label="bridge", occurrence=0, pos=0, start=8.0, length=16.0, energy=0.5)
    u.voice = (2, 3)  # vocals, other
    assert _companion(cand(9.0, 0.9), u, 4, 0.35, 0.5)  # a strong hit on beat two goes with a tune voice
    u.lead_solo = True
    assert not _companion(cand(9.0, 0.9), u, 4, 0.35, 0.5)  # but not under a solo
    assert _companion(cand(10.0, 0.3), u, 4, 0.35, 0.5)  # beat three does
