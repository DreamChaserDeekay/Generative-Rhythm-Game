"""The song's highlight and its repeats (analyzer 1.9.0, PATTERN_DESIGN 62): the chorus is the most
intense part even where nothing is found to repeat, a repeat a bar off is still a repeat, and a
build-up's rolls neither make it the loudest part nor the chorus."""

from __future__ import annotations

import numpy as np

from rhythm_server.analysis.structure import _segment_similarity, label_sections, section_intensity


def test_the_most_intense_sections_are_the_chorus_when_the_repeats_are_quiet() -> None:
    """On 2,200 BMS songs a quarter had no repeated section and the repeated group was often a
    quiet one: the chorus sat in the human charts' densest third of the song in half the songs.
    When the loudest repeated group is not near the most intense section, the most intense
    sections are the chorus, with their group's other occurrences near them."""
    spans = [(0, 4), (4, 12), (12, 20), (20, 28), (28, 36), (36, 40)]
    groups = [0, 1, 2, 1, 3, 4]
    energy = np.array([0.1, 0.5, 1.0, 0.5, 0.95, 0.2])
    assert label_sections(spans, groups, energy) == ["intro", "pre-chorus", "chorus", "pre-chorus", "chorus", "outro"]
    # a loud repeated group near the top keeps the chorus
    energy = np.array([0.1, 0.5, 1.0, 0.5, 0.92, 0.2])
    groups = [0, 1, 2, 1, 2, 4]
    assert label_sections(spans, groups, energy)[2] == label_sections(spans, groups, energy)[4] == "chorus"


def test_a_build_up_stays_out_of_the_highlight() -> None:
    """A build-up leading into the chorus every time is the chorus only if clearly the loudest:
    a chorus within HIGHLIGHT_MATE_MARGIN of it takes the label (the groove songs' 16th-note
    build-up came out the most intense part once onset strength counted)."""
    spans = [(0, 4), (4, 12), (12, 20), (20, 28), (28, 36), (36, 44), (44, 52), (52, 60), (60, 64)]
    groups = [0, 1, 2, 3, 1, 2, 3, 3, 0]
    energy = np.array([0.05, 0.75, 1.0, 0.82, 0.76, 1.0, 0.82, 0.82, 0.0])
    labels = label_sections(spans, groups, energy)
    assert [labels[i] for i in (2, 5)] == ["pre-chorus", "pre-chorus"] and [labels[i] for i in (3, 6, 7)] == ["chorus"] * 3


def test_a_repeat_a_bar_off_is_still_a_repeat() -> None:
    """Sections are compared from their starts and one bar off: a boundary a bar early (a fill, a
    pickup) no longer splits a section from its repeat."""
    rng = np.random.default_rng(3)
    bars = rng.normal(size=(9, 16))
    seq = np.concatenate([bars[:8], rng.normal(size=(1, 16)), bars[:8], bars[8:]])  # 8 bars, a fill, the 8 again
    v = seq / np.linalg.norm(seq, axis=1, keepdims=True)
    ssm = v @ v.T
    # the second section's boundary falls on the fill, a bar early
    assert _segment_similarity(ssm, (0, 8), (8, 17)) > 0.8


def test_a_roll_is_not_louder_than_a_groove() -> None:
    """A section's intensity is its loudness and its onset strength per beat, each beat counted
    up to HIT_CAP_PERCENTILE of the song's beats: sixteenth rolls hit four times a beat, a groove
    once or twice, and the roll no longer outweighs a louder groove."""
    beat_energy = np.array([0.5] * 16 + [0.8] * 8 + [1.0] * 32)  # intro, two-bar roll, chorus (loudest)
    strength = np.array([0.5] * 16 + [4.0] * 8 + [1.5] * 32)
    ranges = [(0, 16), (16, 24), (24, 56)]
    e = section_intensity(beat_energy, strength, ranges)
    assert e[2] == 1.0 and e[1] < e[2] and e[0] == 0.0
    uncapped = (np.array([0.0, 0.6, 1.0]) + np.array([0.0, 1.0, 1.0 / 3.5])) / 2
    assert uncapped[1] > uncapped[2]  # counted in full, the roll would be the most intense
    assert np.allclose(section_intensity(beat_energy, None, ranges), [0.0, 0.6, 1.0])
