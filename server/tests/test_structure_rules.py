"""Label and boundary rules of analyzer 1.12.0 (PATTERN_DESIGN 69-10, 69-11): what 1.11.0 called a
bridge before the second chorus is a verse, a short passage heard once right before a chorus is a
pre-chorus, a chorus the grouping missed or a drop marked as two halves is still the chorus,
boundaries found on two-bar units move to the bar line where the music changes, and two
neighbouring one-off sections that sound alike are one."""

from __future__ import annotations

import numpy as np

from rhythm_server.analysis import structure
from rhythm_server.analysis.structure import find_sections, join_twins, label_sections, refine_bounds

NONE: frozenset[str] = frozenset()


def _spans(lengths: list[int]) -> list[tuple[int, int]]:
    out, a = [], 0
    for n in lengths:
        out.append((a, a + n))
        a += n
    return out


def test_a_passage_heard_once_before_the_second_chorus_is_a_verse() -> None:
    """The grouping missed that the second verse repeats the first (a third of the section pairs
    people marked as one stay under the repeat threshold): 1.11.0 called both verses bridges."""
    spans = _spans([4, 8, 8, 8, 8, 8, 8, 8, 4])
    groups = [0, 1, 2, 3, 2, 4, 2, 2, 5]  # intro, verse, chorus, verse', chorus, bridge, chorus x2, outro
    energy = np.array([0.1, 0.5, 1.0, 0.5, 1.0, 0.4, 1.0, 1.0, 0.1])
    assert label_sections(spans, groups, energy, rules=NONE) == ["intro", "bridge", "chorus", "bridge", "chorus", "bridge", "chorus", "chorus", "outro"]
    assert label_sections(spans, groups, energy, rules=frozenset({"oneoff_verse"})) == [
        "intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "chorus", "outro"]


def test_a_short_passage_heard_once_before_a_chorus_is_a_pre_chorus() -> None:
    spans = _spans([8, 8, 4, 8, 8, 8, 4])
    groups = [0, 1, 2, 3, 1, 3, 4]  # verse, ?, pre (once), chorus, ...
    energy = np.array([0.4, 0.5, 0.7, 1.0, 0.5, 1.0, 0.1])
    assert label_sections(spans, groups, energy, rules=NONE)[2] == "bridge"
    assert label_sections(spans, groups, energy, rules=frozenset({"oneoff_pre"}))[2] == "pre-chorus"
    # a repeated group leading into the chorus two times out of three is a pre-chorus too
    spans = _spans([8, 4, 8, 8, 4, 8, 8, 4, 8, 4])
    groups = [0, 1, 2, 0, 1, 2, 0, 1, 3, 4]
    energy = np.array([0.4, 0.6, 1.0, 0.4, 0.6, 1.0, 0.4, 0.6, 0.3, 0.1])
    assert label_sections(spans, groups, energy, rules=NONE)[1] == "verse"
    assert label_sections(spans, groups, energy, rules=frozenset({"oneoff_pre"}))[1] == "pre-chorus"


def test_a_chorus_the_grouping_missed_is_still_the_chorus() -> None:
    spans = _spans([8, 8, 8, 8, 8, 8])
    groups = [0, 1, 0, 1, 2, 3]  # the last chorus came out its own group
    energy = np.array([0.4, 1.0, 0.4, 0.95, 0.9, 0.1])
    sim = np.full((6, 6), 0.2)
    np.fill_diagonal(sim, 1.0)
    sim[4, 1] = sim[1, 4] = sim[4, 3] = sim[3, 4] = 0.5  # just under the threshold 0.55
    assert label_sections(spans, groups, energy, sim, 0.55, rules=NONE)[4] != "chorus"
    assert label_sections(spans, groups, energy, sim, 0.55, rules=frozenset({"chorus_kin"}))[4] == "chorus"


def test_a_drop_marked_in_two_halves_is_all_chorus_and_a_build_up_stays_out() -> None:
    """People mark an EDM drop as two groups of 8 bars; the first always comes right before the
    second, so it led in and was called a pre-chorus (Hero). It sounds like the second half and hits
    as hard; a build-up does neither."""
    spans = _spans([8, 8, 8, 8, 8, 8, 8, 8, 8])
    groups = [0, 1, 2, 3, 4, 1, 2, 3, 5]  # intro, build, drop A, drop B, break, build, drop A, drop B, outro
    energy = np.array([0.2, 0.7, 0.95, 1.0, 0.3, 0.7, 0.95, 1.0, 0.1])
    sim = np.full((9, 9), 0.2)
    np.fill_diagonal(sim, 1.0)
    for a, b in ((2, 3), (6, 7), (2, 7), (3, 6)):
        sim[a, b] = sim[b, a] = 0.5
    for a, b in ((2, 6), (3, 7), (1, 5)):
        sim[a, b] = sim[b, a] = 0.9
    old = label_sections(spans, groups, energy, sim, 0.6, rules=NONE)
    new = label_sections(spans, groups, energy, sim, 0.6, rules=frozenset({"drop_halves"}))
    assert [old[i] for i in (2, 3, 6, 7)] == ["pre-chorus", "chorus", "pre-chorus", "chorus"]
    assert [new[i] for i in (2, 3, 6, 7)] == ["chorus"] * 4 and new[1] == new[5] != "chorus"


def test_a_boundary_found_on_two_bar_units_moves_to_the_odd_bar_line() -> None:
    """A fast song (a bar of 1.2 s) is cut on two-bar units, so a section starting after a 5-bar
    intro could only be found a bar off; the bar novelty puts it on its bar line."""
    rng = np.random.default_rng(2)
    patterns = [rng.normal(size=16) for _ in range(4)]
    blocks = [(5, 0), (8, 1), (8, 2), (8, 1), (8, 2), (8, 3)]
    feat = np.array([patterns[p] + 0.3 * rng.normal(size=16) for bars, p in blocks for _ in range(bars * 4)])
    truth = [5, 13, 21, 29, 37]
    old = structure.BOUNDARY_RULES
    try:
        structure.BOUNDARY_RULES = frozenset()
        before = [s.start_beat // 4 for s in find_sections(feat, np.zeros(len(feat)), 0, 4, beat_s=0.3)[1:]]
        structure.BOUNDARY_RULES = frozenset({"bar_refine"})
        after = [s.start_beat // 4 for s in find_sections(feat, np.zeros(len(feat)), 0, 4, beat_s=0.3)[1:]]
    finally:
        structure.BOUNDARY_RULES = old
    assert len(set(before) & set(truth)) < len(set(after) & set(truth))
    assert all(b % 2 == 0 for b in before)
    # a boundary on a bar line with the change stays; one beside it moves at most `reach` bars
    ssm = np.eye(20)
    ssm[:7, :7] = ssm[7:, 7:] = 0.9
    np.fill_diagonal(ssm, 1.0)
    assert refine_bounds(ssm, [0, 7], 1) == [0, 7] and refine_bounds(ssm, [0, 8], 1) == [0, 7] and refine_bounds(ssm, [0, 10], 1) == [0, 10]


def test_two_neighbouring_one_off_sections_that_sound_alike_are_one() -> None:
    sim = np.full((4, 4), 0.2)
    np.fill_diagonal(sim, 1.0)
    sim[1, 2] = sim[2, 1] = 0.5
    assert join_twins(sim, [0, 1, 2, 0], 0.55) == [0, 1, 1, 0]
    assert join_twins(sim, [0, 1, 2, 0], 0.7) == [0, 1, 2, 0]  # not alike enough
    assert join_twins(sim, [0, 1, 1, 0], 0.55) == [0, 1, 1, 0]  # a repeated group is left alone
