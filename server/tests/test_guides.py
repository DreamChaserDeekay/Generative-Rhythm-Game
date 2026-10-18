"""Community pattern guides (docs/PATTERN_DESIGN.md 14): the build-up, forced jacks and anchors, the
5B pivot chords and 재봉틀, and the guide measures themselves."""

from __future__ import annotations

from functools import lru_cache

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.difficulty.consistency import structure_accuracy
from rhythm_server.difficulty.guides import guide_profile, hands, onset_pitches, pivots
from rhythm_server.generator.core import generate_chart
from rhythm_server.generator.lanes import anchor_hits, lane_infos
from rhythm_server.generator.motifs import SlotPlan, expected_keys, motif_context
from rhythm_server.generator.sections import Unit, _cap_opening
from rhythm_server.synth import CHORUS_FIRST_FORM, make_structured_song


@lru_cache(maxsize=None)
def song(bpm: float, seed: int, chorus_first: bool = False):
    s = make_structured_song(bpm=bpm, seed=seed, **({"form": CHORUS_FIRST_FORM} if chorus_first else {}))
    return s, analyze(s.pcm, s.sample_rate, f"sha256:guides-{bpm}-{seed}-{chorus_first}", backends={})


@lru_cache(maxsize=None)
def chart(bpm: float, seed: int, chorus_first: bool, key_mode: str, system: str, difficulty: str, level: int | None) -> dict:
    return generate_chart(song(bpm, seed, chorus_first)[1], key_mode, difficulty, level, system=system)


def truth(s) -> list[dict]:
    return [dict(x, endBeat=float(x["startBeat"]) + 4 * int(x["bars"])) for x in s.structure]


def offsets(notes: list[dict], section: dict) -> set[int]:
    a, b = section["startBeat"], section["endBeat"]
    return {round((n["beat"] - a) * 48) for n in notes if a <= n["beat"] < b}


def test_structure_finds_a_chorus_that_opens_the_song() -> None:
    s, analysis = song(132.0, 3, True)
    acc = structure_accuracy(analysis["sections"], s.structure, 4, sum(int(x["bars"]) for x in s.structure))
    assert acc["boundaryF"] >= 0.95 and acc["groupF"] >= 0.95, acc
    chorus = [x for x in analysis["sections"] if x["label"] == "chorus"]
    assert len(chorus) == 3 and len({x["group"] for x in chorus}) == 1
    # the last chorus is one section (a verse fill before it used to pull its start a bar early)
    assert any(abs(x["startBeat"] - 4 * 36) < 1e-6 and abs(x["endBeat"] - 4 * 44) < 1e-6 for x in chorus)


def test_repeats_build_up_on_the_same_notes() -> None:
    s, _ = song(124.0, 1)
    choruses = [x for x in truth(s) if x["label"] == "chorus"]
    verses = [x for x in truth(s) if x["label"] == "verse"]
    # the level comes first: a chart that needs every sound of the song (HD 9 on this sparse song)
    # gives up the build-up that costs notes, so its repeats only keep and add, they do not grow much
    for system, difficulty, level, growth in (("GRG", "NORMAL", None, 1.05), ("DJMAX", "HD", 9, 1.0)):
        notes = chart(124.0, 1, False, "6K", system, difficulty, level)["notes"]
        first, last = offsets(notes, choruses[0]), offsets(notes, choruses[-1])
        assert len(last) >= growth * len(first), (difficulty, len(first), len(last))
        assert len(first & last) >= 0.95 * len(first)  # the last chorus plays what the first did, and more
        assert len(offsets(notes, verses[1])) >= len(offsets(notes, verses[0]))


def test_a_song_that_opens_on_its_chorus_still_builds_up() -> None:
    s, analysis = song(132.0, 3, True)
    sections = truth(s)
    for key_mode, system, difficulty, level in (("6K", "DJMAX", "HD", 9), ("8K", "GRG", "HARD", None)):
        notes = chart(132.0, 3, True, key_mode, system, difficulty, level)["notes"]
        g = guide_profile(notes, key_mode, sections, None, sections[-1]["endBeat"])
        assert g["repeatGrowth"] >= 1.03 and g["peakAt"] >= 0.6, g
        choruses = [x for x in sections if x["label"] == "chorus"]
        assert len(offsets(notes, choruses[0])) < len(offsets(notes, choruses[-1]))


def test_no_forced_jacks_and_short_anchors() -> None:
    _, analysis = song(124.0, 1)
    pitch_of = onset_pitches(analysis)
    for key_mode, system, difficulty, level, cap in (("4K", "DJMAX", "NM", 6, 3), ("4K", "DJMAX", "MX", 13, 8), ("6K", "EZ2ON", "HD", 13, 8)):
        h = hands(chart(124.0, 1, False, key_mode, system, difficulty, level)["notes"], key_mode, pitch_of)
        assert h["unmotivatedJacks"] <= 0.5, (key_mode, difficulty, h)
        assert h["anchorMax"] <= cap, (key_mode, difficulty, h)


def test_opening_sections_stay_under_the_later_peak() -> None:
    units = [
        Unit(0, 0, "A", "chorus", 0, 0, 0.0, 32.0, 1.0),
        Unit(1, 1, "B", "verse", 0, 0, 32.0, 32.0, 0.5),
        Unit(2, 2, "C", "chorus", 0, 0, 64.0, 32.0, 1.0),
    ]
    # notes per beat 1.25 / 0.47 / 0.63: the opening chorus comes down to 0.9 of the late one
    weight = [40.0, 15.0, 20.0]
    assert _cap_opening(units, weight, [40.0, 15.0, 20.0])
    assert abs(weight[0] - 40.0 * 0.9 * (20.0 / 32.0) / (40.0 / 32.0)) < 1e-9 and weight[1:] == [15.0, 20.0]
    assert not _cap_opening(units, [10.0, 15.0, 20.0], [10.0, 15.0, 20.0])


def test_anchor_counts_keep_trills_apart() -> None:
    assert anchor_hits((1, 2, 1, 3, 1, 2, 1, 3, 1)) == 5  # a pedal key while the others move
    assert anchor_hits((1, 0, 1, 0, 1)) == 2  # a trill
    assert anchor_hits((3, 2, 1, 2, 1, 2, 1, 0, 1, 0, 1)) == 2  # two trills sharing a key

    def notes(lanes: list[int], src: str = "other") -> list[dict]:
        return [{"t": 200.0 * i, "beat": i / 2, "lane": lane, "type": "tap", "src": src} for i, lane in enumerate(lanes)]

    h = hands(notes([1, 2, 1, 3, 1, 2, 1, 3, 1, 4]), "6K")
    assert h["anchorMax"] == 5 and h["anchors"] > 0
    assert hands(notes([1, 2, 1, 2, 1, 2, 1, 2]), "6K")["anchorMax"] == 0
    assert hands(notes([0, 0, 5, 5, 0, 0, 5, 5]), "6K")["doubles"] > 0
    jacked = notes([1, 1, 2])
    jacked[1]["src"] = "vocals"
    assert hands(jacked, "6K")["unmotivatedJacks"] > 0
    assert hands(notes([1, 1, 2]), "6K")["unmotivatedJacks"] == 0


def test_pivot_chords_and_doubles_ask_for_their_keys() -> None:
    def plan(motif: str, chords: str = "vary") -> SlotPlan:
        return SlotPlan(phrase=0, k=0, motif=motif, chords=chords, hold_tap=False, direction=1, step=0, pedal=False, window=None, cell_ref=None, mirror_ref=None, wide=False)

    five = motif_context(lane_infos("5K"), 0.8, system="DJMAX")
    assert expected_keys(five, plan("step", "pivot"), [], 2) == (0, 2)  # 1+3 ...
    assert expected_keys(five, plan("step", "pivot"), [(0, 2)], 2) == (2, 4)  # ... then 3+5
    assert expected_keys(five, plan("step", "pivot"), [(0, 2), (2, 4)], 2) == (0, 2)
    six = motif_context(lane_infos("6K"), 0.8, system="DJMAX")
    assert expected_keys(six, plan("doubles"), [(1,)], 1) == (1,)  # 재봉틀: twice on a key ...
    assert expected_keys(six, plan("doubles"), [(1,), (1,)], 1) == (4,)  # ... then the other hand
    assert expected_keys(six, plan("doubles"), [(1,), (1,), (4,)], 1) == (4,)
    chords = [{"t": 300.0 * i, "beat": float(i), "lane": lane, "type": "tap"} for i, pair in enumerate([(0, 2), (2, 4), (0, 2)]) for lane in pair]
    assert pivots(chords, "5K") == 1.0
