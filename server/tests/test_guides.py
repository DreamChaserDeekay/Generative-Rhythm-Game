"""Community pattern guides (docs/PATTERN_DESIGN.md 14): the build-up, forced jacks and anchors, the
5B pivot chords and 재봉틀, BMS-Generator's hand rules (16-6), and the guide measures themselves."""

from __future__ import annotations

import dataclasses
from functools import lru_cache

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.difficulty.consistency import structure_accuracy
from rhythm_server.difficulty.guides import balance, guide_profile, hands, onset_pitches, pivots
from rhythm_server.generator.core import generate_chart
from rhythm_server.generator.lanes import _feedback_counts, _State, _Weights, anchor_hits, lane_infos
from rhythm_server.generator.motifs import SlotPlan, expected_keys, motif_context
from rhythm_server.generator.params import resolve_params
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


def test_hand_rules_keep_runs_short_chords_apart_and_jacks_off_streaks() -> None:
    # BMS-Generator's hand rules, adapted (PATTERN_DESIGN 16-6). Before them, on this song: 4K NM 6
    # handRuns 0.24, 6K HD 9 / 4K HD 9 adjacentChords 0.57 / 0.54, 7K+1S HARD jackStreaks 2.9.
    for key_mode, system, difficulty, level, measure, most in (
        ("4K", "DJMAX", "NM", 6, "handRuns", 0.18),
        ("6K", "DJMAX", "HD", 9, "adjacentChords", 0.35),
        ("4K", "DJMAX", "HD", 9, "adjacentChords", 0.35),
        ("6K", "DJMAX", "HD", 9, "jackStreaks", 1.0),
    ):
        g = guide_profile(chart(124.0, 1, False, key_mode, system, difficulty, level)["notes"], key_mode)
        assert g[measure] <= most, (key_mode, difficulty, measure, g[measure])
        assert g["offBars"] is None or g["offBars"] <= 0.1, (key_mode, difficulty, g["offBars"])
    # Since generator 0.9.4 the default system follows the human BMS charts' jacks instead (PATTERN_DESIGN
    # 20): about 15 jack streaks in 1000 notes at levels 10-14. Since 0.9.7 a 7K phrase keeps to a few
    # keys drawn by the seed, and this drum-loop song repeats its sounds on them: 0-29 by seed, a mean
    # of about 20 over these four (3.2 before the phrases' key sets). A phrase on one side's keys makes
    # its bars lopsided, as in human charts: 15-16% of their busy bars at levels 6-10 leave the
    # 30-70% band, and an eighth of those charts more than 40% (one seed here: 41%).
    # Generator 0.9.17 weakened the lane-usage balance (0.7), which is what brings jack streaks up:
    # over the 855 held-out charts it moves them toward the human rate, not past it (level 10 13.6
    # -> 14.2 against the human 15.2, level 14 13.8 -> 15.8 against 15.5). This song is a drum loop
    # repeating its sounds on the phrase's keys, so it stacks the same-sound bonus on top and runs
    # higher than any real chart - the limit guards runaway, it is not the human rate.
    profiles = [guide_profile(generate_chart(song(124.0, 1)[1], "7K+1S", "HARD", system="GRG", seed=seed)["notes"], "7K+1S") for seed in range(4)]
    assert sum(g["jackStreaks"] for g in profiles) / len(profiles) <= 30.0, [g["jackStreaks"] for g in profiles]
    assert sum(g["offBars"] or 0.0 for g in profiles) / len(profiles) <= 0.2, [g["offBars"] for g in profiles]


def test_bms_hand_measures() -> None:
    def notes(events: list, step: float = 0.5, dt: float = 200.0) -> list[dict]:
        return [
            {"t": dt * i, "beat": step * i, "lane": lane, "type": "tap"}
            for i, e in enumerate(events) for lane in (e if isinstance(e, tuple) else (e,))
        ]

    assert hands(notes([0, 1, 2, 3, 4, 5]), "6K")["handRuns"] == 0.333  # 1-2-3 then 4-5-6: the third of each
    assert hands(notes([0, 3, 1, 4, 2, 5]), "6K")["handRuns"] == 0.0
    assert hands(notes([1, 2, 2, 1]), "5K")["handRuns"] == 0.0  # the shared middle key ends a run
    assert hands(notes([(0, 1), (1, 2), (1, 3), 4]), "6K")["jackStreaks"] > 0  # key 2 in three instants in a row
    assert hands(notes([(0, 1), (1, 2), (2, 3), 4]), "6K")["jackStreaks"] == 0
    lopsided = balance(notes([0, 1, 2] * 4, step=0.25, dt=100.0), "6K")
    assert lopsided["offBars"] == 1.0 and balance(notes([0, 3, 1, 4, 2, 5] * 2, step=0.25, dt=100.0), "6K")["offBars"] == 0.0
    # neighbouring keys of one hand: 1+2 and 5+6 of these four chords (3+4 spans both hands, 1+6 is symmetric)
    assert balance(notes([(0, 1), (2, 3), (0, 5), (4, 5)]), "6K")["adjacentChords"] == 0.5


def test_the_hand_run_feedback_counts_like_the_bms_measure() -> None:
    # The lane search keeps a running count of the notes in fast runs of single notes and of those a
    # hand plays third or later in a row (PATTERN_DESIGN 43): it has to be the guide measure's
    # handRuns (the BMS statistics' count) of the path so far.
    lanes = lane_infos("7K+1S")
    keys = [l.index for l in lanes if l.kind == "key"]
    hand_of = [l.hand for l in lanes]
    w = _Weights.of(resolve_params("7K+1S", "HARD", system="GRG"))
    n = len(lanes)
    state = _State(0.0, (-1e9,) * n, (-1e9,) * n, (0.0,) * n, (), None, -1e9, None, None)
    # key 1-2-3 (third on the left), the middle key, 5-6-7 (third on the right), a pause, 1-1-2-3
    seq = [(0, 0.0), (1, 150.0), (2, 300.0), (3, 450.0), (4, 600.0), (5, 750.0), (6, 900.0),
           (0, 1800.0), (0, 1950.0), (1, 2100.0), (2, 2250.0)]
    notes = []
    for k, t in seq:
        lane = keys[k]
        fb = _feedback_counts(state, (lane,), (lane,), t, int(t // 2000), hand_of, w)
        state = dataclasses.replace(state, prev_t=t, bar=int(t // 2000), **fb)
        notes.append({"t": t, "beat": t / 500.0, "lane": lane, "type": "tap"})
    assert (state.fb_run, state.fb_hand3) == (11, 4)
    assert round(state.fb_hand3 / state.fb_run, 3) == hands(notes, "7K+1S")["handRuns"]


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
