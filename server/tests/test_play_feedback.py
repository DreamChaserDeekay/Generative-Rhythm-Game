"""The default system's rules from 6-key EXPERT play feedback (generator 0.9.29, PATTERN_DESIGN 60):
pad and choir long notes, held chords on both hands, the song's last notes over its reverb, lines
not chopped into sixteenths, solo sections led by the solo and fast repeats of one sound."""

from __future__ import annotations

import numpy as np
import pytest

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.config import load_config
from rhythm_server.generator.candidates import Candidate, _mark_solos, _melody_splits, pad_like
from rhythm_server.generator.ending import finish
from rhythm_server.generator.lanes import lane_infos
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.select import Slot, hold_cap, hold_count, holdable, lone_sound, mark_hold_count
from rhythm_server.generator.tempo import TempoMap
from rhythm_server.synth import make_song

TIMING = {"offsetMs": 0.0, "tempoMap": [{"beat": 0, "bpm": 120.0}]}


@pytest.fixture(scope="module")
def dense_song() -> dict:
    song = make_song(165.0, 64, seed=13, repeat_melody=True)
    return analyze(song.pcm, song.sample_rate, "sha256:patterns-165", backends={})


def _cand(beat: float, **kw) -> Candidate:
    base = dict(
        beat=beat, t=beat * 500.0, subdivision=1, strength=0.5, bands=np.ones(3), pitch=60.0, harmonic=0.7,
        sustain_beats=0.5, intensity=0.5, downbeat=False, sources=np.array([0.1, 0.2, 0.3, 0.4]), melody=0.0, attack=0.8,
    )
    base.update(kw)
    return Candidate(**base)


def _slot(beat: float, size: int = 1) -> Slot:
    return Slot(beat=beat, t=beat * 500.0, size=size, hold_end_beat=None, special=None, special_hold=False,
                pitch=None, bands=np.ones(3), score=1.0, subdivision=1, strength=0.5)


def test_pads_and_choirs_take_long_notes_however_soft_their_attack() -> None:
    """A soft pad chord under the 0.4 strength gate held no long note: 17 of 556 pad-like sounds were
    long notes on 40 songs (6K EXPERT). On the default system a tonal sound that is hardly a drum
    and sounds a beat or more is holdable whatever its attack (holds.pad)."""
    tempo = TempoMap(TIMING)
    pad = _cand(4.0, strength=0.15, sustain_beats=2.0, sources=np.array([0.05, 0.15, 0.3, 0.5]))
    assert pad_like(pad, "GRG") and holdable(pad, tempo, "GRG")
    assert not pad_like(pad, "DJMAX") and not holdable(pad, tempo, "DJMAX")
    kick = _cand(4.0, strength=0.15, sustain_beats=2.0, sources=np.array([0.7, 0.1, 0.1, 0.1]))
    assert not pad_like(kick, "GRG")


def test_held_chords_take_more_long_notes_than_held_notes() -> None:
    """A held single note (a long note of the tune) is one long note; a held chord or rich sound (a
    pad that is no melody note, or pitched instruments sounding together) takes two and more with
    each further instrument, a long sound and a loud one, up to the skill's countMax: NORMAL 1,
    HARD 2, EXPERT 3, MASTER 6 (holds.pad, RUNAWAY play feedback, PATTERN_DESIGN 61)."""
    assert [hold_cap(resolve_params("6K", t)) for t in ("NORMAL", "HARD", "EXPERT", "MASTER")] == [1, 2, 3, 6]
    assert hold_cap(resolve_params("6K", "MX", 13, system="DJMAX")) == 1
    master = resolve_params("6K", "MASTER")
    tune = _cand(4.0, melody=0.9, sustain_beats=3.0, sources=np.array([0.05, 0.1, 0.75, 0.1]))
    assert hold_count(tune, master) == 1
    pad = _cand(4.0, strength=0.3, melody=0.1, sustain_beats=1.5, sources=np.array([0.05, 0.15, 0.2, 0.6]))
    assert hold_count(pad, master) == 2
    big = _cand(4.0, strength=0.9, melody=0.1, sustain_beats=4.0, sources=np.array([0.05, 0.3, 0.3, 0.35]))
    assert hold_count(big, master) == 6 and hold_count(big, resolve_params("6K", "EXPERT")) == 3
    slot = _slot(4.0)
    slot.hold_end_beat = 8.0
    mark_hold_count(slot, big, resolve_params("6K", "EXPERT"))
    assert slot.hold_count == 3 and slot.size == 3


def test_default_charts_hold_chords_within_the_tier(dense_song: dict) -> None:
    from rhythm_server.generator import generate_chart

    for tier, most in (("NORMAL", 1), ("EXPERT", 3), ("MASTER", 6)):
        chart = generate_chart(dense_song, "6K", tier)
        at: dict[float, int] = {}
        for n in chart["notes"]:
            if n["type"] == "hold":
                at[n["beat"]] = at.get(n["beat"], 0) + 1
        assert at and max(at.values()) <= most, (tier, at)


def test_the_last_notes_hold_over_the_closing_reverb() -> None:
    """A song ending on a chord that rings on: the last notes hold over the reverb, as a chord of the
    skill's long-note count when it rings two beats or more (more keys join: EXPERT 3, MASTER 6);
    a clear sound after them or a song going quiet at once keeps the tap."""
    tempo = TempoMap(TIMING)
    lanes = lane_infos("6K")
    values = [0.6] * 200 + [0.55, 0.5, 0.45, 0.42, 0.4, 0.38, 0.36, 0.35, 0.34, 0.33, 0.32, 0.3, 0.29, 0.28] + [0.0] * 20
    analysis = {"energy": {"frameMs": 100, "values": values}, "durationMs": 23400.0,
                "onsets": [{"t": 500.0 * b, "strength": 0.5} for b in range(41)]}

    def last_chord() -> list[dict]:
        return [{"beat": 39.0, "t": 19500.0, "lane": 1, "type": "tap"}, {"beat": 40.0, "t": 20000.0, "lane": 1, "type": "tap"},
                {"beat": 40.0, "t": 20000.0, "lane": 4, "type": "tap"}]

    notes = last_chord()
    assert finish(notes, analysis, tempo, resolve_params("6K", "EXPERT"), lanes, 0.15)
    held = [n for n in notes if n["type"] == "hold"]
    assert len(held) == 3 and all(n["endBeat"] > 41.0 and n["beat"] == 40.0 for n in held)
    notes = last_chord()
    assert finish(notes, analysis, tempo, resolve_params("6K", "MASTER"), lanes, 0.15)
    assert sorted(n["lane"] for n in notes if n["type"] == "hold") == [0, 1, 2, 3, 4, 5]
    notes = last_chord()
    assert finish(notes, analysis, tempo, resolve_params("6K", "NORMAL"), lanes, 0.15)
    assert sum(n["type"] == "hold" for n in notes) == 1
    going_on = dict(analysis, onsets=analysis["onsets"] + [{"t": 21000.0, "strength": 0.6}])
    assert not finish(last_chord(), going_on, tempo, resolve_params("6K", "EXPERT"), lanes, 0.15)
    quiet = dict(analysis, energy={"frameMs": 100, "values": [0.6] * 200 + [0.0] * 30})
    assert not finish(last_chord(), quiet, tempo, resolve_params("6K", "EXPERT"), lanes, 0.15)
    assert not finish(last_chord(), analysis, tempo, resolve_params("6K", "MX", 13, system="DJMAX"), lanes, 0.15)


def test_lines_are_not_chopped_into_sixteenths() -> None:
    """A tonal sound a sixteenth after the last tonal note without a sure attack (a strum, a slide,
    an ornament), or inside the last note's own sound at its pitch with a weak attack, splits a
    note: its score is scaled down (melody.split). On 6K EXPERT tonal notes a sixteenth apart went
    from 29% to 20% of the gaps on 10 songs (PATTERN_DESIGN 60)."""
    cfg = load_config("instruments")["rhythmSource"]["melody"]
    line = [_cand(0.0, melody=0.9), _cand(0.25, melody=0.9, attack=0.5), _cand(0.5, melody=0.9, attack=0.95),
            _cand(0.75, melody=0.9, attack=0.95), _cand(1.0, melody=0.9, sustain_beats=2.0, attack=0.95), _cand(1.5, melody=0.9, attack=0.3)]
    split = _melody_splits(line, cfg, "GRG", 0.75)
    assert [c.beat for c in split] == [0.25, 1.5]
    assert _melody_splits(line, cfg, "DJMAX", 0.75) == []
    drums = [_cand(b / 4, sources=np.array([0.8, 0.1, 0.05, 0.05]), harmonic=0.1, attack=0.3) for b in range(8)]
    assert _melody_splits(drums, cfg, "GRG", 0.75) == []


def test_solo_sections_are_led_by_the_solo() -> None:
    """A section a melody instrument leads with most of its onsets notes of the melody is a solo
    (melody.solo): its melody notes score higher and the drums keep their beats only."""
    cfg = load_config("instruments")["rhythmSource"]["melody"]
    sections = [{"t": 0.0, "endT": 8000.0, "leader": "other"}, {"t": 8000.0, "endT": 16000.0, "leader": "drums"}]
    onsets = [{"t": 250.0 * k, "melody": 0.9 if k % 4 else 0.1} for k in range(64)]
    cands = [_cand(k / 2, t=250.0 * k) for k in range(64)]
    _mark_solos(cands, {"onsets": onsets}, sections, cfg, "GRG")
    assert all(c.solo for c in cands[:32]) and not any(c.solo for c in cands[32:])
    fresh = [_cand(k / 2, t=250.0 * k) for k in range(64)]
    _mark_solos(fresh, {"onsets": onsets}, sections, cfg, "EZ2ON")
    assert not any(c.solo for c in fresh)


def test_fast_drum_repeats_take_turns_between_the_hands() -> None:
    """The same drum sound repeated fast goes hand over hand (hands.fastDrumAlternate, no same-sound
    bonus to keep its lane); a tune repeated fast follows its pitch harder (fastContourScale)."""
    from rhythm_server.generator.lanes import _Weights

    w = _Weights.of(resolve_params("6K", "EXPERT"))
    assert w.fast_ms > 0 and w.drum_alternate > 0 and w.fast_contour > 1
    dj = _Weights.of(resolve_params("6K", "MX", 13, system="DJMAX"))
    assert dj.drum_alternate == 0 and dj.fast_contour == 1
