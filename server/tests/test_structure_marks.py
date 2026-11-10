"""Sections against songs a person marked (analyzer 1.11.0, PATTERN_DESIGN 69): phrases after an
intro of an odd number of bars keep their own grid, a song whose bars are short is cut in whole
phrases, and a song in which nothing would repeat groups its closest sections."""

from __future__ import annotations

import numpy as np

from rhythm_server.analysis import structure
from rhythm_server.analysis.structure import _group_some, find_sections, group_segments


def _song(blocks: list[tuple[int, int]], seed: int, noise: float = 0.35, mix: float = 1.0) -> np.ndarray:
    """Beat features: (bars, pattern) blocks, every pattern a vector plus noise per beat; patterns
    1 and up share a common part (mix < 1 makes them alike, their boundaries weak)."""
    rng = np.random.default_rng(seed)
    common = rng.normal(size=16)
    patterns = [rng.normal(size=16)] + [common * (mix < 1.0) + mix * rng.normal(size=16) for _ in range(7)]
    return np.array([patterns[p] + noise * rng.normal(size=16) for bars, p in blocks for _ in range(bars * 4)])


def _starts(sections) -> list[int]:
    return [s.start_beat // 4 for s in sections[1:]]


def test_phrases_after_a_ten_bar_intro_keep_their_grid() -> None:
    """Hero (Pegboard Nerds) starts every section two bars past the 8-bar grid counted from the
    first downbeat; that grid held its weaker boundaries back."""
    blocks = [(10, 0), (8, 1), (8, 2), (8, 1), (8, 2), (8, 3)]
    truth = [10, 18, 26, 34, 42]

    def right() -> int:
        return sum(_starts(find_sections(f, np.zeros(len(f)), 0, 4)) == truth for f in (_song(blocks, s, 0.6, 0.6) for s in range(8)))

    with_phase = right()
    assert with_phase >= 7
    old = structure.GRID_PHASES
    structure.GRID_PHASES = 1
    try:
        assert right() < with_phase  # 4 of 8
    finally:
        structure.GRID_PHASES = old


def test_short_bars_are_cut_in_whole_phrases() -> None:
    """A song read at twice its tempo (넬 - Sunshine, a bar 0.87 s) came out in 40 sections of 4
    bars; the marked ones are 30–60 s. A 2-bar riff that changes every 4 bars inside 16-bar parts is
    no section boundary once the bars are this short."""
    blocks = []
    for part in (0, 4, 0, 4):
        blocks += [(4, part), (4, part + 1), (4, part + 2), (4, part + 3)]
    feat = _song(blocks, seed=1, noise=0.5)
    energy = np.zeros(len(feat))
    fine = find_sections(feat, energy, 0, 4)
    coarse = find_sections(feat, energy, 0, 4, beat_s=0.2)  # a bar of 0.8 s
    assert min(s.end_beat - s.start_beat for s in coarse) >= 8 * 4
    assert len(coarse) < len(fine)


def test_a_song_that_repeats_nothing_groups_its_closest_sections() -> None:
    ssm = np.full((24, 24), 0.0)
    np.fill_diagonal(ssm, 1.0)
    for t in range(8):
        ssm[t, 16 + t] = ssm[16 + t, t] = 0.38  # under the threshold, over its retries
    spans = [(0, 8), (8, 16), (16, 24)]
    assert len(set(group_segments(ssm, spans, 0.45)[0])) == 3
    groups, _ = _group_some(ssm, spans, 0.45)
    assert groups[0] == groups[2] != groups[1]
