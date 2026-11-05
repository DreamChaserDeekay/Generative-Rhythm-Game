"""Rules from 6-key ELITE play feedback (generator 0.9.46, PATTERN_DESIGN 81): no roll the length
of a groove, a roll's shape from its sound, lanes that go the way the melody goes, chords that do
not pile into a few bars and repeated sections that follow the drums and the melody in turn."""

from __future__ import annotations

from types import SimpleNamespace

import numpy as np

from rhythm_server.analysis.stems import STEM_NAMES
from rhythm_server.config import load_config
from rhythm_server.generator.lanes import _Weights, lane_infos
from rhythm_server.generator.motifs import alternate_key, motif_context
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.planner import roll_shapes, sound_shape
from rhythm_server.generator.rolls import mark_rolls
from rhythm_server.generator.sections import GRID, _assign_chords, _groove_classes, _mark_focus, make_units

ROLLS = load_config("patterns")["rolls"]


def _unit(index: int, section: int, start: float, length: float = 4.0, cls: int = 0, pos: int = 0) -> SimpleNamespace:
    return SimpleNamespace(index=index, section=section, start=start, length=length, cls=cls, pos=pos)


def _roll_hit() -> SimpleNamespace:
    return SimpleNamespace(roll=(0, 0))


def test_a_roll_bar_after_bar_is_a_groove_not_a_roll() -> None:
    # a one-bar loop with a sixteenth roll in every bar: 8 bars of one section, then a new section
    units = [_unit(i, 0, 4.0 * i, pos=i) for i in range(8)] + [_unit(8, 1, 32.0, cls=1)]
    cands = [_roll_hit() for _ in range(16)]
    per_unit = [{int(k * GRID / 4): k for k in range(16)} for _ in range(8)] + [{}]
    members = [list(range(8)), [8]]
    # the roll runs 32 beats into the next section: a build-up as long as maxRunBeatsAtEnd allows
    assert 31.75 <= float(ROLLS["maxRunBeatsAtEnd"]) and _groove_classes(units, members, per_unit, cands) == set()
    # the same loop in the middle of its section runs past maxRunBeats: a groove
    units[8].start = 40.0
    assert _groove_classes(units, members, per_unit, cands) == {0}
    # a roll in two bars of the loop only is a passage
    for m in range(2, 8):
        per_unit[m] = {}
    assert _groove_classes(units, members, per_unit, cands) == set()


def test_a_run_of_roll_notes_past_its_length_is_no_roll() -> None:
    slots = [SimpleNamespace(beat=0.25 * k, roll=None) for k in range(80)]
    mark_rolls(slots, [True] * 80, max_beats=16.0)
    assert all(s.roll is None for s in slots)
    mark_rolls(slots, [True] * 40, max_beats=16.0)  # 9.75 beats
    assert slots[0].roll == (0, 0, 40) and slots[39].roll == (0, 39, 40)


def _hits(pitches: list[float | None]) -> list[SimpleNamespace]:
    return [SimpleNamespace(pitch=p, beat=0.25 * k, t=125.0 * k, roll=(0, k, len(pitches))) for k, p in enumerate(pitches)]


def test_a_roll_takes_its_shape_from_its_sound() -> None:
    cfg = ROLLS["bySound"]
    rng = np.random.default_rng(3)
    # the same drum again and again: its estimated pitch only wobbles
    assert sound_shape(_hits(list(48.0 + rng.normal(0, 0.8, 12))), cfg) == "trill"
    # a tom fill falling from high to low, and one climbing
    assert sound_shape(_hits([62, 61, 59, 58, 55, 54, 52, 50]), cfg) == "shiftDown"
    assert sound_shape(_hits([50, 52, 53, 55, 58, 59, 61, 62]), cfg) == "shift"
    # too few pitched hits to tell
    assert sound_shape(_hits([62, None, None, 55, None, 50]), cfg) == "trill"
    # 6K takes the roll's sound; 7K+1S keeps its drawn shapes (fitted to human BMS charts)
    slots = _hits([48.0] * 16)
    six = roll_shapes(slots, [], resolve_params("6K", "ELITE"), seed=7)
    assert six[0][0] == "trill"
    seven = {roll_shapes(slots, [], resolve_params("7K+1S", "ELITE"), seed=s)[0][0] for s in range(40)}
    assert len(seven) >= 3


def test_a_falling_roll_walks_from_the_right_to_the_left() -> None:
    ctx = motif_context(lane_infos("6K"), resolve_params("6K", "ELITE").skill, key_mode="6K")
    up, down, prev_up, prev_down = [], [], None, None
    for k in range(6):
        prev_up = alternate_key(ctx, (k, 6, 0), prev=prev_up, shape=("shift", 0))
        prev_down = alternate_key(ctx, (k, 6, 0), prev=prev_down, shape=("shiftDown", 0))
        up.append(prev_up)
        down.append(prev_down)
    assert up == [0, 3, 1, 4, 2, 5]  # 1-4-2-5-3-6
    assert down == [5, 2, 4, 1, 3, 0]  # 6-3-5-2-4-1


def test_6k_lanes_follow_the_melody_harder_than_7k() -> None:
    six, seven = _Weights.of(resolve_params("6K", "ELITE")), _Weights.of(resolve_params("7K+1S", "ELITE"))
    assert six.tune_contour >= 4.0 and seven.tune_contour == 1.0


def _chord_slots(beats: list[float]) -> list[SimpleNamespace]:
    return [SimpleNamespace(beat=b, roll=None, size=1) for b in beats]


def test_chords_do_not_pile_into_a_few_bars() -> None:
    params = resolve_params("6K", "ELITE")
    # bars 1-4 have loud hits, bars 5-16 soft ones: by worth every chord would go to the first stretch
    beats = [0.5 * k for k in range(128)]
    loud = [SimpleNamespace(quiet=False, bands=np.ones(3), strength=1.5 if b < 16 else 0.3, intensity=0.5, downbeat=False) for b in beats]
    units = [SimpleNamespace(label="chorus", chord=None)]

    def stretch_notes(cap):
        slots = _chord_slots(beats)
        positions = {(0, k, False): [k] for k in range(len(slots))}
        _assign_chords(slots, list(range(len(slots))), positions, units, [0] * len(slots), loud, params, 6, 1.0, 4.0, cap)
        per = [sum(s.size for s in slots if 16 * w <= s.beat < 16 * w + 16) for w in range(4)]
        return per, sum(1 for s in slots if s.size >= 2)

    piled, n_piled = stretch_notes(None)
    spread, n_spread = stretch_notes(1.0)
    assert piled[0] >= 2.5 * float(np.median(piled[1:]))
    # the first stretch keeps under the cap (the biggest chords give way first) and the chart its chords
    assert spread[0] < piled[0] and n_spread >= 0.9 * n_piled


def test_a_repeat_follows_the_drums_then_the_melody() -> None:
    mix = [0.4, 0.15, 0.3, 0.15]  # drums, bass, vocals, other
    sections = [
        {"startBeat": 0, "endBeat": 32, "label": "verse", "group": "A", "loopBars": 4, "stems": mix},
        {"startBeat": 32, "endBeat": 64, "label": "chorus", "group": "B", "loopBars": 4, "stems": mix},
        {"startBeat": 64, "endBeat": 96, "label": "verse", "group": "A", "loopBars": 4, "stems": mix},
        {"startBeat": 96, "endBeat": 128, "label": "chorus", "group": "B", "loopBars": 4, "stems": [0.4, 0.15, 0.1, 0.35]},
        {"startBeat": 128, "endBeat": 160, "label": "chorus", "group": "B", "loopBars": 4, "stems": mix},
        {"startBeat": 160, "endBeat": 176, "label": "bridge", "group": "C", "loopBars": 4, "stems": mix},
    ]
    units = make_units(sections, 0.0, 175.0, 4)
    _mark_focus(units, sections, resolve_params("6K", "ELITE"))
    focus = {(u.group, u.occurrence): u.focus for u in units}
    drums, vocals, other = (STEM_NAMES.index(n) for n in ("drums", "vocals", "other"))
    assert focus[("A", 0)] == drums and focus[("A", 1)] == vocals
    assert focus[("B", 0)] == drums and focus[("B", 1)] == other and focus[("B", 2)] == drums
    assert focus[("C", 0)] is None  # heard once
    off = make_units(sections, 0.0, 175.0, 4)
    _mark_focus(off, sections, resolve_params("6K", "ELITE", overrides={"repeatFocus": False}))
    assert all(u.focus is None for u in off)
