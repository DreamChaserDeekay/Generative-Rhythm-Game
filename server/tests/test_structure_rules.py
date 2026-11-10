"""Label and boundary rules of analyzer 1.12.0 (PATTERN_DESIGN 69-10 – 69-12), the ones that scored
better on both the tuning and the checking songs people marked: what 1.11.0 called a bridge before
the second chorus is a verse, a drop marked as two halves is all chorus, and two neighbouring
one-off sections that sound alike are one."""

from __future__ import annotations

import numpy as np

from rhythm_server.analysis.structure import join_twins, label_sections

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


def test_two_neighbouring_one_off_sections_that_sound_alike_are_one() -> None:
    sim = np.full((4, 4), 0.2)
    np.fill_diagonal(sim, 1.0)
    sim[1, 2] = sim[2, 1] = 0.5
    assert join_twins(sim, [0, 1, 2, 0], 0.55) == [0, 1, 1, 0]
    assert join_twins(sim, [0, 1, 2, 0], 0.7) == [0, 1, 2, 0]  # not alike enough
    assert join_twins(sim, [0, 1, 1, 0], 0.55) == [0, 1, 1, 0]  # a repeated group is left alone
