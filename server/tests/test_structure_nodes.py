"""Learned nodes of the structure step (docs/PATTERN_DESIGN.md 84): boundary refinement, the chorus
node and the song preview."""

from __future__ import annotations

import numpy as np

from rhythm_server.analysis import structure
from rhythm_server.analysis.analyzer import preview_section
from rhythm_server.analysis.structure import (
    LINE_FEATURES,
    Section,
    chorus_node,
    label_sections,
    refine_bounds,
    section_cues,
)


def _lines(n: int, change: dict[int, float]) -> np.ndarray:
    """Bar-line features of a song whose bars all sound alike except at the lines in `change`."""
    col = {f: i for i, f in enumerate(LINE_FEATURES)}
    base = np.zeros((n, len(LINE_FEATURES)))
    base[:, col["simPrev"]] = base[:, col["simPrev2"]] = 0.95
    for k, v in change.items():
        base[k, col["nov"]] = base[k, col["nov2"]] = base[k, col["cue"]] = v
        base[k, col["simPrev"]] = base[k, col["simPrev2"]] = 0.95 - v
        base[k, col["loudRise"]] = base[k, col["loudRise2"]] = v / 2
    return base


def test_a_section_start_a_bar_off_moves_onto_the_change_and_a_right_one_stays() -> None:
    # the music changes at bars 8 and 16; the structure step put the second start a bar early
    base = _lines(24, {8: 1.0, 16: 1.0})
    assert refine_bounds([0, 8, 15], 24, base) == [0, 8, 16]
    assert refine_bounds([0, 8, 16], 24, base) == [0, 8, 16]
    # with no change near it a start keeps its place on the 4-bar grid
    assert refine_bounds([0, 12], 24, _lines(24, {})) == [0, 12]


def _cues(pitch: list[float], loud: list[float]) -> list[dict[str, float]]:
    return [{"pitch": p, "loud": v, "t0": 0.0, "t1": 1.0} for p, v in zip(pitch, loud)]


def test_the_chorus_node_adds_a_loud_high_repeated_group_and_keeps_the_rules_pick() -> None:
    # A verse-chorus song: B is the loudest repeated group (the rule's chorus); D, after it each
    # time, is nearly as intense, louder and higher than the song and repeats - a second chorus part.
    spans = [(0, 8), (8, 16), (16, 24), (24, 32), (32, 40), (40, 48), (48, 56), (56, 64), (64, 72)]
    groups = [0, 1, 2, 3, 1, 2, 3, 2, 3]
    energy = np.array([0.2, 0.5, 1.0, 0.9, 0.5, 1.0, 0.9, 0.95, 0.9])
    cues = _cues([-2, -1, 1, 1.5, -1, 1, 1.5, 1, 1.5], [-6, -2, 3, 3, -2, 3, 3, 3, 3])
    rule = {2, 5, 7}
    hot = chorus_node(rule, spans, groups, energy, cues)
    assert rule <= hot
    assert {3, 6, 8} <= hot
    assert not hot & {0, 1, 4}


def test_the_chorus_node_is_off_without_weights_or_cues() -> None:
    spans = [(0, 8), (8, 16), (16, 24), (24, 32)]
    groups = [0, 1, 0, 1]
    energy = np.array([0.4, 1.0, 0.4, 1.0])
    with_cues = label_sections(spans, groups, energy, group_cues=_cues([0, 1, 0, 1], [0, 3, 0, 3]))
    without = label_sections(spans, groups, energy)
    saved = structure.CHORUS_WEIGHTS
    try:
        structure.CHORUS_WEIGHTS = None
        off = label_sections(spans, groups, energy, group_cues=_cues([0, 1, 0, 1], [0, 3, 0, 3]))
    finally:
        structure.CHORUS_WEIGHTS = saved
    assert without == off
    assert with_cues[1] == with_cues[3] == "chorus"


def test_the_preview_starts_at_the_chorus_group_heard_most() -> None:
    def sec(start: int, group: str, label: str, energy: float) -> Section:
        return Section(start, start + 32, energy, group, label)

    sections = [sec(0, "A", "intro", 0.1), sec(32, "B", "chorus", 0.9), sec(64, "C", "chorus", 0.8), sec(96, "D", "verse", 0.4),
                sec(128, "C", "chorus", 0.8), sec(160, "C", "chorus", 0.8)]
    assert preview_section(sections) is sections[2]
    assert preview_section([sec(0, "A", "verse", 0.5)]) is None


def test_section_cues_are_against_the_song() -> None:
    cues = {"time": np.arange(8.0), "loud": np.array([-20.0] * 4 + [-10.0] * 4), "pitch": np.array([60.0] * 4 + [64.0, 64.0, np.nan, np.nan])}
    rows = section_cues(cues, [(0, 4), (4, 8)])
    assert rows[0]["loud"] == -5.0 and rows[1]["loud"] == 5.0
    assert rows[1]["pitch"] > 0 > rows[0]["pitch"]
    assert rows[1]["t0"] == 4.0
