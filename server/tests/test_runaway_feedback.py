"""The default system's rules from the RUNAWAY play feedback (generator 0.9.30, analyzer 1.8.1,
PATTERN_DESIGN 61): build-ups go hand over hand, a delay's echoes and a reverb's swells stay off the
chart where the drums are out, a lone sound is no chord, the highlight is the densest part and a
long build-up does not take the chorus label."""

from __future__ import annotations

import numpy as np

from rhythm_server.analysis.structure import label_sections
from rhythm_server.config import load_config
from rhythm_server.generator.candidates import Candidate, _echoes, _mark_quiet, _quiet_tails
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.planner import roll_shapes
from rhythm_server.generator.rolls import find_rolls
from rhythm_server.generator.sections import Unit, _cap_below_highlight
from rhythm_server.generator.select import Slot, lone_sound


def _cand(beat: float, **kw) -> Candidate:
    base = dict(
        beat=beat, t=beat * 500.0, subdivision=1, strength=0.5, bands=np.ones(3), pitch=72.0, harmonic=0.7,
        sustain_beats=0.3, intensity=0.5, downbeat=False, sources=np.array([0.05, 0.15, 0.3, 0.5]), melody=0.0, attack=0.8,
    )
    base.update(kw)
    return Candidate(**base)


def test_a_build_up_never_turns_into_a_chord_jack() -> None:
    """A 40-hit build-up drew the chord-jack shape (5%) and played as chords all the way; the same
    fill played again kept it. Chord jacks are short fills of eighths now, never a build-up or a
    roll of sixteenths."""
    expert = resolve_params("6K", "EXPERT")
    slots = []
    for k in range(40):
        beat = 52.0 + (0.5 * k if k < 8 else 4.0 + 0.25 * (k - 8))
        slots.append(Slot(beat=beat, t=beat * 470.0, size=1, hold_end_beat=None, special=None, special_hold=False,
                          pitch=None, bands=np.ones(3), score=1.0, subdivision=4, strength=1.0, roll=(0, k, 40, False)))
    into = [{"startBeat": 64.0}]
    for seed in range(200):
        shape = roll_shapes(slots, into, expert, seed).get(0)
        assert shape is not None and shape[0] != "chordJack", seed


def test_a_fast_roll_survives_a_missed_hit() -> None:
    """At 190 BPM sixteenths are 79 ms apart and the analysis misses a hit now and then: the roll
    went on only on the same spacing, so a long build-up broke into pieces too short to be rolls."""
    beats = [48.0 + 0.25 * k for k in range(64) if k not in (13, 37)]
    cands = [_cand(b, subdivision=1 if b % 1 == 0 else 4, harmonic=0.2, melody=0.0, bands=np.array([0.2, 0.7, 0.1]),
                   sources=np.array([0.8, 0.1, 0.05, 0.05]), strength=1.0) for b in beats]
    rolls = find_rolls(cands, [48.0, 64.0])
    assert len(rolls) == 1 and rolls[0].size >= 60


def test_echoes_and_swells_stay_off_where_the_drums_are_out() -> None:
    """A softer repeat of a louder note of the same pitch with a softer attack is an echo; where the
    drums are out, echoes, splits and tonal swells with a weak attack are left out (a score cut
    alone did not keep them out: the density fit took them anyway)."""
    cfg = load_config("instruments")["rhythmSource"]["melody"]
    note = _cand(0.0, strength=0.6, attack=0.9, melody=0.9)
    echo = _cand(0.75, strength=0.3, attack=0.5, melody=0.5)
    other = _cand(1.0, strength=0.3, attack=0.5, pitch=67.0, melody=0.5)
    swell = _cand(1.5, strength=0.3, attack=0.3, pitch=60.0, melody=0.5)
    cands = [note, echo, other, swell]
    assert _echoes(cands, cfg, "GRG") == [echo] and _echoes(cands, cfg, "DJMAX") == []
    # the drums are out in a section with a small share of drums against the song's busiest
    sections = [{"t": 0.0, "endT": 4000.0, "stems": [0.08, 0.2, 0.3, 0.42]}, {"t": 4000.0, "endT": 8000.0, "stems": [0.35, 0.2, 0.2, 0.25]}]
    later = [_cand(b, strength=0.3, attack=0.3, melody=0.5) for b in (9.0, 9.5)]
    _mark_quiet(cands + later, sections, cfg, "GRG")
    assert all(c.quiet for c in cands) and not any(c.quiet for c in later)
    assert _quiet_tails(cands, [echo], cfg, "GRG") == {id(echo), id(swell)}
    assert _quiet_tails(later, later, cfg, "GRG") == set()


def test_a_lone_sound_is_no_chord() -> None:
    """A breakdown's pluck melody got two or three notes per hit (66 slots, 154 notes on 6K EXPERT):
    without drums a hit is one sound, one note (chordSounds); held chords take long notes instead."""
    assert lone_sound(_cand(0.0, quiet=True), "GRG")
    assert not lone_sound(_cand(0.0, quiet=False), "GRG")
    assert not lone_sound(_cand(0.0, quiet=True), "EZ2ON")


def test_the_highlight_stays_the_densest_part() -> None:
    """A full chorus masks its own onsets (on the groove song 2.96 onsets per beat against the
    verse's 3.28), so the verse came out denser. The other labels play at most their label's share
    of what the chorus units can play per beat (sectioned.highlightCap)."""
    units = [
        Unit(0, 0, "A", "verse", 0, 0, 0.0, 8.0, 0.9),
        Unit(1, 1, "B", "chorus", 0, 0, 8.0, 8.0, 1.0),
    ]
    per_unit = [{k: k for k in range(40)}, {k: k for k in range(22)}]  # the chorus has fewer sounds
    n = [30.0, 30.0]
    assert _cap_below_highlight(units, per_unit, n, resolve_params("6K", "EXPERT"))
    chorus_per_beat = min(30.0, 0.9 * 22) / 8.0
    assert n[1] == 30.0 and n[0] < chorus_per_beat * 8.0
    m = [30.0, 30.0]
    assert not _cap_below_highlight(units, per_unit, m, resolve_params("6K", "HD", 9, system="DJMAX")) and m == [30.0, 30.0]


def test_a_build_up_as_loud_as_the_chorus_does_not_take_its_label() -> None:
    """Every occurrence of a group that leads straight into one same group leads in: a crescendo
    build-up (energy 1.00) before a chorus (0.98) was labelled the chorus, and the chorus a verse."""
    spans = [(0, 4), (4, 12), (12, 20), (20, 28), (28, 36), (36, 44), (44, 52), (52, 60), (60, 64)]
    groups = [0, 1, 2, 3, 1, 2, 3, 3, 0]
    energy = np.array([0.0, 0.91, 1.0, 0.98, 0.91, 1.0, 0.98, 0.98, 0.25])
    labels = label_sections(spans, groups, energy)
    assert labels[3] == labels[6] == labels[7] == "chorus" and labels[2] == "pre-chorus" and labels[1] == "verse"
