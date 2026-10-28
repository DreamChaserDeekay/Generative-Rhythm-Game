"""Community pattern guides (docs/PATTERN_DESIGN.md 14): the build-up, forced jacks and anchors, the
5B pivot chords and 재봉틀, BMS-Generator's hand rules (16-6), and the guide measures themselves."""

from __future__ import annotations

import dataclasses
import math
from functools import lru_cache

import numpy as np

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.config import load_config
from rhythm_server.difficulty.consistency import structure_accuracy
from rhythm_server.difficulty.guides import balance, guide_profile, hands, onset_pitches, pivots
from rhythm_server.generator.core import generate_chart
from rhythm_server.generator.lanes import (
    _costs,
    _feedback_counts,
    _State,
    _Weights,
    anchor_hits,
    lane_infos,
    lane_move_class,
    lane_move_logp,
    lane_move_phase,
)
from rhythm_server.generator.motifs import SlotPlan, expected_keys, motif_context
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.sections import Unit, _cap_opening
from rhythm_server.generator.select import Slot
from rhythm_server.synth import CHORUS_FIRST_FORM, make_structured_song


@lru_cache(maxsize=None)
def song(bpm: float, seed: int, chorus_first: bool = False):
    s = make_structured_song(bpm=bpm, seed=seed, **({"form": CHORUS_FIRST_FORM} if chorus_first else {}))
    return s, analyze(s.pcm, s.sample_rate, f"sha256:guides-{bpm}-{seed}-{chorus_first}", backends={})


@lru_cache(maxsize=None)
def chart(bpm: float, seed: int, chorus_first: bool, key_mode: str, difficulty: str, level: int | None) -> dict:
    return generate_chart(song(bpm, seed, chorus_first)[1], key_mode, difficulty, level)


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
    for difficulty, level, growth in (("NORMAL", None, 1.05), ("HARD", 9, 1.0)):
        notes = chart(124.0, 1, False, "6K", difficulty, level)["notes"]
        first, last = offsets(notes, choruses[0]), offsets(notes, choruses[-1])
        assert len(last) >= growth * len(first), (difficulty, len(first), len(last))
        assert len(first & last) >= 0.95 * len(first)  # the last chorus plays what the first did, and more
        assert len(offsets(notes, verses[1])) >= len(offsets(notes, verses[0]))


def test_a_song_that_opens_on_its_chorus_still_builds_up() -> None:
    s, analysis = song(132.0, 3, True)
    sections = truth(s)
    for key_mode, difficulty, level in (("6K", "HARD", 9), ("8K", "HARD", None)):
        notes = chart(132.0, 3, True, key_mode, difficulty, level)["notes"]
        g = guide_profile(notes, key_mode, sections, None, sections[-1]["endBeat"])
        assert g["repeatGrowth"] >= 1.03 and g["peakAt"] >= 0.6, g
        choruses = [x for x in sections if x["label"] == "chorus"]
        assert len(offsets(notes, choruses[0])) < len(offsets(notes, choruses[-1]))


def test_anchors_stay_within_the_tiers_cap() -> None:
    # (the DPC limit on forced jacks, unmotivatedJacks <= 0.5, was DJMAX's: doubles from NORMAL on
    # (generator 0.9.10) repeat a key over two sounds, 4K NORMAL 6 10.9 per 100 key notes on this song)
    _, analysis = song(124.0, 1)
    pitch_of = onset_pitches(analysis)
    for key_mode, difficulty, level in (("4K", "NORMAL", 6), ("4K", "MASTER", 13), ("6K", "MASTER", 13)):
        h = hands(chart(124.0, 1, False, key_mode, difficulty, level)["notes"], key_mode, pitch_of)
        assert h["anchorMax"] <= resolve_params(key_mode, difficulty, level).anchor_cap, (key_mode, difficulty, h)


def test_hand_rules_keep_runs_short_chords_apart_and_jacks_off_streaks() -> None:
    # BMS-Generator's hand rules, adapted (PATTERN_DESIGN 16-6). Before them, on this song: 4K NM 6
    # handRuns 0.24, 6K HD 9 / 4K HD 9 adjacentChords 0.57 / 0.54, 7K+1S HARD jackStreaks 2.9.
    for key_mode, difficulty, level, measure, most in (
        ("4K", "NORMAL", 6, "handRuns", 0.18),
        ("6K", "HARD", 9, "adjacentChords", 0.35),
        ("4K", "HARD", 9, "adjacentChords", 0.35),
    ):
        g = guide_profile(chart(124.0, 1, False, key_mode, difficulty, level)["notes"], key_mode)
        assert g[measure] <= most, (key_mode, difficulty, measure, g[measure])
        assert g["offBars"] is None or g["offBars"] <= 0.1, (key_mode, difficulty, g["offBars"])
    # Since generator 0.9.4 the generator follows the human BMS charts' jacks instead (PATTERN_DESIGN
    # 20): about 15 jack streaks in 1000 notes at levels 10-14. Since 0.9.7 a 7K phrase keeps to a few
    # keys drawn by the seed, and this drum-loop song repeats its sounds on them: 0-29 by seed, a mean
    # of about 20 over these four (3.2 before the phrases' key sets). A phrase on one side's keys makes
    # its bars lopsided, as in human charts: 15-16% of their busy bars at levels 6-10 leave the
    # 30-70% band, and an eighth of those charts more than 40% (one seed here: 41%).
    # Generator 0.9.17 weakened the lane-usage balance (0.7), which is what brings jack streaks up:
    # over the 855 held-out charts it moves them toward the human rate, not past it (level 10 13.6
    # -> 14.2 against the human 15.2, level 14 13.8 -> 15.8 against 15.5). This song is a drum loop
    # repeating its sounds on the phrase's keys, so it stacks the same-sound bonus on top and runs
    # higher than any real chart - the limit guards runaway, it is not the human rate. Generator 0.9.23
    # keeps the drum keys more firmly (1.5) and 0.9.24 adds the middle-key feedback: on this loop the
    # mean goes 26.5 -> 35.0 (one seed 56.8, on key 3), while over the held-out charts jack streaks
    # stay where they were (level 14 15.0 -> 15.2 per 1000 notes, human 16.6; PATTERN_DESIGN 46-3).
    # Generator 0.9.28 keeps each sound group on its lane (hands.soundMemory): this loop's mean goes
    # 23.2 -> 38.0 (one seed 52.5), while the held-out charts' level 10 / 14 go 14.6 / 15.3 -> 14.8 /
    # 16.0 (human 14.0 / 17.4; PATTERN_DESIGN 58), so the runaway guard is 45.
    profiles = [guide_profile(generate_chart(song(124.0, 1)[1], "7K+1S", "HARD", seed=seed)["notes"], "7K+1S") for seed in range(4)]
    assert sum(g["jackStreaks"] for g in profiles) / len(profiles) <= 45.0, [g["jackStreaks"] for g in profiles]
    # Lopsided bars: 0.9.25 steers their share up toward the human one (hands.barTarget, PATTERN_DESIGN
    # 47); on this loop the mean of these seeds goes 0.09 -> 0.23 (one seed 0.42, as an eighth of the
    # human charts at levels 6-10 lean in more than 40% of their bars) - the limit guards runaway.
    # Generator 0.9.30 holds a rich held sound with two long notes on HARD and steers chords to the
    # choruses: this loop's mean goes to 0.43 (one seed 0.74), while over the held-out charts the
    # lopsided-bar closeness at levels 6 / 10 goes 95 / 91% -> 82 / 86% (PATTERN_DESIGN 61), so the
    # runaway guard is 0.5.
    assert sum(g["offBars"] or 0.0 for g in profiles) / len(profiles) <= 0.5, [g["offBars"] for g in profiles]


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
    w = _Weights.of(resolve_params("7K+1S", "HARD"))
    n = len(lanes)
    state = _State(0.0, (-1e9,) * n, (-1e9,) * n, (0.0,) * n, (), None, -1e9, None, None)
    # key 1-2-3 (third on the left), the middle key, 5-6-7 (third on the right), a pause, 1-1-2-3
    seq = [(0, 0.0), (1, 150.0), (2, 300.0), (3, 450.0), (4, 600.0), (5, 750.0), (6, 900.0),
           (0, 1800.0), (0, 1950.0), (1, 2100.0), (2, 2250.0)]
    notes = []
    for k, t in seq:
        lane = keys[k]
        fb = _feedback_counts(state, (lane,), (lane,), t, int(t // 2000), hand_of, w)
        state = dataclasses.replace(state, prev_t=t, prev_lanes=(lane,), bar=int(t // 2000), **fb)
        notes.append({"t": t, "beat": t / 500.0, "lane": lane, "type": "tap"})
    assert (state.fb_run, state.fb_hand3) == (11, 4)
    assert round(state.fb_hand3 / state.fb_run, 3) == hands(notes, "7K+1S")["handRuns"]
    # the middle-key feedback (PATTERN_DESIGN 46) counts the moves of single notes at most 260 ms
    # apart (not across the pause; the jack 1-1 is a move but a stay) and those through key 4: 3-4, 4-5
    assert (state.fb_moves, state.fb_mid) == (9, 2)


def test_the_middle_key_feedback_brings_back_moves_through_the_middle_key(monkeypatch) -> None:
    # The hand-run feedback counts the middle key as ending a run, so since generator 0.9.21 our 7K
    # charts moved through it less than human charts at levels 6-10 (PATTERN_DESIGN 45-3). Since
    # 0.9.24 the lane search also steers the share of fast moves that enter or leave the middle key
    # toward the level's human value (hands.middleTarget / middleFeedback, PATTERN_DESIGN 46). Since
    # 0.9.37's fewer HARD chords the share starts near the target at HARD; at EXPERT it starts above
    # it (0.336 against 0.309), so the feedback brings it down to the target (0.296) (the lopsided-bar
    # feedback of 0.9.25 is left out: it moves single notes between the hands too; so is the sound
    # memory of 0.9.28, which holds each sound group on its key).
    grg = load_config("patterns")["hands"]
    monkeypatch.setitem(grg, "barFeedback", {"7K+1S": 0.0, "*": 0.0})
    monkeypatch.setitem(grg, "soundMemory", 0.0)

    def middle_share(notes: list[dict]) -> float:
        by_t: dict[float, list[int]] = {}
        for n in notes:
            if 1 <= int(n["lane"]) <= 7:
                by_t.setdefault(round(float(n["t"]), 1), []).append(int(n["lane"]))
        times = sorted(by_t)
        moves = middle = 0
        for t0, t1 in zip(times, times[1:]):
            if len(by_t[t0]) == 1 and len(by_t[t1]) == 1 and t1 - t0 <= 260.0:
                a, b = by_t[t0][0], by_t[t1][0]
                moves += 1
                middle += a != b and 4 in (a, b)
        return middle / moves

    songs = [song(124.0, 1)[1], song(140.0, 2)[1]]

    def mean_share() -> float:
        shares = [middle_share(generate_chart(a, "7K+1S", "EXPERT", seed=seed)["notes"]) for a in songs for seed in range(3)]
        return sum(shares) / len(shares)

    target = float(np.interp(resolve_params("7K+1S", "EXPERT").skill, *zip(*grg["middleTarget"])))
    with_feedback = mean_share()
    monkeypatch.setitem(grg, "middleFeedback", {"7K+1S": 0.0, "*": 0.0})
    without = mean_share()
    assert abs(with_feedback - target) < abs(without - target) - 0.01, (with_feedback, without, target)


def _bms_stairs(notes: list[dict]) -> tuple[int, int]:
    """(run notes, run notes in stairs) the way scripts/bms_stats.py counts them: runs of single key
    notes at most 400 ms apart, stairs of three notes or more one key at a time the same way."""
    by_t: dict[float, list[int]] = {}
    for n in notes:
        if 1 <= int(n["lane"]) <= 7:
            by_t.setdefault(round(float(n["t"]), 1), []).append(int(n["lane"]))
    runs, run = [], []
    for t in sorted(by_t):
        if len(by_t[t]) == 1 and run and t - run[-1][0] <= 400.0:
            run.append((t, by_t[t][0]))
        else:
            if len(run) >= 2:
                runs.append(run)
            run = [(t, by_t[t][0])] if len(by_t[t]) == 1 else []
    if len(run) >= 2:
        runs.append(run)
    fast = stairs = 0
    for r in runs:
        lanes = [k for _, k in r]
        fast += len(lanes)
        i = 0
        while i < len(lanes) - 2:
            step = lanes[i + 1] - lanes[i]
            j = i + 1
            while abs(step) == 1 and j + 1 < len(lanes) and lanes[j + 1] - lanes[j] == step:
                j += 1
            if abs(step) == 1 and j - i + 1 >= 3:
                stairs += j - i + 1
                i = j
            else:
                i += 1
    return fast, stairs


def test_the_stair_feedback_counts_stairs_like_the_bms_measure() -> None:
    # Since generator 0.9.27 the lane search keeps a running count of the run notes in stairs (three
    # notes or more one key at a time the same way, PATTERN_DESIGN 57): it has to be the BMS
    # statistics' count of the path so far, a turning note counted in both of its stairs.
    lanes = lane_infos("7K+1S")
    keys = [l.index for l in lanes if l.kind == "key"]
    hand_of = [l.hand for l in lanes]
    w = _Weights.of(resolve_params("7K+1S", "EXPERT"))
    assert w.stair_feedback > 0
    n = len(lanes)
    state = _State(0.0, (-1e9,) * n, (-1e9,) * n, (0.0,) * n, (), None, -1e9, None, None)
    # 1-2-3-4-5 then back 4-3 (5-4-3 is a stair too), a jack, a leap to 5, then 6-7 (5-6-7); a pause, 2-3
    seq = [1, 2, 3, 4, 5, 4, 3, 3, 5, 6, 7]
    notes = []
    for i, k in enumerate(seq):
        t = 150.0 * i
        lane = keys[k - 1]
        fb = _feedback_counts(state, (lane,), (lane,), t, int(t // 2000), hand_of, w)
        state = dataclasses.replace(state, prev_t=t, prev_lanes=(lane,), bar=int(t // 2000), **fb)
        notes.append({"t": t, "beat": t / 500.0, "lane": lane, "type": "tap"})
    for k, t in ((2, 3000.0), (3, 3150.0)):
        fb = _feedback_counts(state, (keys[k - 1],), (keys[k - 1],), t, int(t // 2000), hand_of, w)
        state = dataclasses.replace(state, prev_t=t, prev_lanes=(keys[k - 1],), bar=int(t // 2000), **fb)
        notes.append({"t": t, "beat": t / 500.0, "lane": keys[k - 1], "type": "tap"})
    assert (state.fb_run, state.fb_stairs) == _bms_stairs(notes) == (13, 11)


def test_the_stair_feedback_rewards_going_on_one_key_the_same_way() -> None:
    # Human 7-key BMS charts put 11-24% of their fast-run notes in stairs (levels 2-14, the fitting
    # songs); 0.9.26 put 9-13% (level 14 0.128 against 0.238, PATTERN_DESIGN 57). While the path has
    # too few stair notes, the key that goes on with a one-key move costs stairFeedback x (target -
    # share) less, for the notes no shape plans; other keys and chords cost the same.
    lanes = lane_infos("7K+1S")
    keys = [l.index for l in lanes if l.kind == "key"]
    n = len(lanes)
    pos = [l.pos for l in lanes]
    hand_of = [l.hand for l in lanes]
    w = _Weights.of(resolve_params("7K+1S", "MASTER"))
    start = _State(0.0, (-1e9,) * n, (-1e9,) * n, (0.0,) * n, (), None, -1e9, None, None)
    # key 2 then key 3 (a one-key move up) 150 ms apart; 40 run notes so far, none in stairs
    state = dataclasses.replace(start, prev_t=1000.0, prev_lanes=(keys[2],), fb_single=True, fb_in_run=True, fb_run=40, fb_stairs=0,
                                fb_stair=2, fb_step=1)
    slot = Slot(beat=2.3, t=1150.0, size=1, hold_end_beat=None, special=None, special_hold=False, pitch=None,
                bands=np.array([0.2, 0.3, 0.5]), score=1.0, subdivision=4, strength=1.0)
    combos = [(keys[3],), (keys[1],), (keys[3], keys[5])]

    def costs(weights: _Weights) -> list[float]:
        return _costs(state, combos, pos, hand_of, slot, None, 1150.0, weights, 0.0)

    on, off = costs(w), costs(dataclasses.replace(w, stair_feedback=0.0))
    assert on[0] < off[0] - 1.0 and on[1] == off[1] and on[2] == off[2], (on, off)


def test_the_sound_memory_keeps_each_sound_group_on_its_lane(monkeypatch) -> None:
    # Human BMS charts keep 50-73% of a keysound's notes on its commonest lane (levels 2-14). Since
    # analyzer 1.8.0 every onset carries a same-sound group (onsets alike at their attack), and the
    # sound memory (hands.soundMemory) keys on it: a group coming back pays for
    # leaving the lane it last had. Four groups take turns over three changing bands (stem + band,
    # the planner's sound) here; with the memory each group mostly keeps one lane, without it not.
    from collections import Counter, defaultdict

    from rhythm_server.generator.lanes import lane_search, notes_from_choices
    from rhythm_server.generator.tempo import TempoMap

    grg = load_config("patterns")["hands"]
    shipped = grg["soundMemory"]
    assert shipped > 0
    tempo = TempoMap({"offsetMs": 0.0, "tempoMap": [{"beat": 0, "bpm": 120.0}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]})
    lanes = lane_infos("7K+1S")
    bands = [np.array([0.6, 0.3, 0.1]), np.array([0.1, 0.6, 0.3]), np.array([0.1, 0.3, 0.6])]

    def home_share(groups: bool, memory: float) -> float:
        monkeypatch.setitem(grg, "soundMemory", memory)
        slots = [Slot(beat=0.5 * i, t=tempo.beat_to_ms(0.5 * i), size=1, hold_end_beat=None, special=None, special_hold=False, pitch=None,
                      bands=bands[i % 3], score=1.0, subdivision=2, strength=1.0, sound_group=i % 4 if groups else None) for i in range(64)]
        params = resolve_params("7K+1S", "NORMAL")
        notes = notes_from_choices(slots, lane_search(slots, lanes, params, tempo, np.random.default_rng(3)), tempo)
        group_at = {round(s.t, 3): i % 4 for i, s in enumerate(slots)}
        lanes_of: dict[int, Counter] = defaultdict(Counter)
        for n in notes:
            lanes_of[group_at[round(float(n["t"]), 3)]][n["lane"]] += 1
        return float(np.mean([max(c.values()) / sum(c.values()) for c in lanes_of.values()]))

    kept = home_share(True, shipped)
    assert kept >= 0.5 and kept > home_share(True, 0.0) + 0.2 and kept > home_share(False, shipped) + 0.2


def test_the_lopsided_bar_feedback_rewards_single_notes_for_the_leaning_hand() -> None:
    # Human 7-key BMS charts leave 30-70% for one hand in 16% of their busy bars at level 6 and 9% at
    # level 10; 0.9.24 did in 11% and 6% (PATTERN_DESIGN 47). Since 0.9.25 the lane search steers that
    # share toward hands.barTarget like the hand-run share: while the path has too few such bars, a
    # single note for the hand its bar already leans to costs barFeedback x (target - share) less and
    # one for the other hand as much more. Chords are left alone (a bonus per key of a chord made
    # one-hand adjacent chords, PATTERN_DESIGN 43), and so are NORMAL charts up to level 5 (below
    # barMinSkill 0.35).
    lanes = lane_infos("7K+1S")
    keys = [l.index for l in lanes if l.kind == "key"]
    n = len(lanes)
    pos = [l.pos for l in lanes]
    hand_of = [l.hand for l in lanes]
    sides = [
        ((1.0 if l.hand == "L" else 0.5 if l.hand == "T" else 0.0), (1.0 if l.hand == "R" else 0.5 if l.hand == "T" else 0.0)) if l.kind == "key" else (0.0, 0.0)
        for l in lanes
    ]
    w = _Weights.of(resolve_params("7K+1S", "HARD"))
    assert w.bar_feedback > 0 and _Weights.of(resolve_params("7K+1S", "NORMAL", 5)).bar_feedback == 0
    # bar 3 leans left so far (four left notes, one right), and none of the 20 full bars before did
    start = _State(0.0, (-1e9,) * n, (-1e9,) * n, (0.0,) * n, (), None, -1e9, None, None)
    state = dataclasses.replace(start, bar=3, bar_hands=(4.0, 1.0), fb_bars=20, fb_off=0)
    slot = Slot(beat=12.0, t=6000.0, size=1, hold_end_beat=None, special=None, special_hold=False, pitch=None,
                bands=np.array([0.2, 0.3, 0.5]), score=1.0, subdivision=2, strength=1.0)
    combos = [(keys[0],), (keys[6],), (keys[0], keys[1])]

    def costs(weights: _Weights) -> list[float]:
        return _costs(state, combos, pos, hand_of, slot, None, 6000.0, weights, 0.0, sides=sides, bar=3)

    on, off = costs(w), costs(dataclasses.replace(w, bar_feedback=0.0))
    assert on[0] < off[0] - 0.5 and on[1] > off[1] + 0.5 and on[2] == off[2], (on, off)



def test_lane_move_contexts_are_counted_like_the_bms_table() -> None:
    # config/lane_moves.json (PATTERN_DESIGN 44): the move into a key instant, its beat phase
    assert lane_move_class(0, -1e9, (3,), 0.0) == 16  # the start
    assert lane_move_class(2, 0.0, (5,), 500.0) == 9  # two keys up: step +3 -> 3 + 6
    assert lane_move_class(2, 0.0, (2,), 500.0) == 6  # a jack
    assert lane_move_class(2, 0.0, (3, 4), 500.0) == 13  # single -> chord
    assert lane_move_class(0, 0.0, (3,), 500.0) == 14  # chord -> single
    assert lane_move_class(0, 0.0, (3, 5), 500.0) == 15  # chord -> chord
    assert lane_move_class(2, 0.0, (5,), 1500.0) == 16  # after a rest
    assert [lane_move_phase(b) for b in (0.0, 0.5, 0.25, 0.75, 1 / 3, 2.0, 3.995)] == [0, 1, 2, 2, 3, 0, 0]
    table = lane_move_logp()
    assert len(table) == 7 * 17 * 4 * 4
    assert all(abs(sum(math.exp(x) for x in row) - 1.0) < 1e-9 for row in table.values())


def test_lane_moves_make_the_moves_more_like_peoples(monkeypatch) -> None:
    # Human 7-key charts go on in a line (1-2-3, 1-3-5) and repeat jacks far more than our charts
    # did, which zigzag (PATTERN_DESIGN 44). With the lane-move cost the 7K moves are likelier under
    # the human counts.
    grg = load_config("patterns")["hands"]

    def mean_logp(notes: list[dict]) -> float:
        table = lane_move_logp()
        by_t: dict[float, list[dict]] = {}
        for n in notes:
            if 1 <= int(n["lane"]) <= 7:
                by_t.setdefault(round(float(n["t"]), 1), []).append(n)
        times = sorted(by_t)
        total, count, prev_key, prev_t, prev_cls = 0.0, 0, 0, -1e9, 16
        for t in times:
            keys = tuple(sorted(int(n["lane"]) for n in by_t[t]))
            near = sum(len(by_t[u]) for u in times if abs(u - t) <= 2000.0)
            band = sum(1 for e in (4.0, 8.0, 12.0) if near / 4.0 >= e)
            cls = lane_move_class(prev_key, prev_t, keys, t)
            if 0 <= cls <= 12:
                total += table[(prev_key, prev_cls, lane_move_phase(float(by_t[t][0]["beat"])), band)][keys[0] - 1]
                count += 1
            prev_key, prev_t, prev_cls = (keys[0] if len(keys) == 1 else 0), t, cls
        return total / count

    a = song(124.0, 1)[1]
    for key, value in (("laneMoves", 1.0), ("laneMovesDraw", True), ("laneMovesFree", True)):
        monkeypatch.setitem(grg, key, value)
    with_moves = [mean_logp(generate_chart(a, "7K+1S", "EXPERT", seed=seed)["notes"]) for seed in range(3)]
    monkeypatch.setitem(grg, "laneMoves", 0.0)
    without = [mean_logp(generate_chart(a, "7K+1S", "EXPERT", seed=seed)["notes"]) for seed in range(3)]
    # (0.9.30's chorus chords and held chords move the charts both ways: the gap on this song went
    # from about 0.06 to 0.043, so the margin is 0.03. Since 0.9.37 HARD repeats jacks like human
    # charts with or without the cost, which leaves it little to add there: EXPERT is measured)
    assert sum(with_moves) / 3 > sum(without) / 3 + 0.03, (with_moves, without)


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

    five = motif_context(lane_infos("5K"), 0.8)
    assert expected_keys(five, plan("step", "pivot"), [], 2) == (0, 2)  # 1+3 ...
    assert expected_keys(five, plan("step", "pivot"), [(0, 2)], 2) == (2, 4)  # ... then 3+5
    assert expected_keys(five, plan("step", "pivot"), [(0, 2), (2, 4)], 2) == (0, 2)
    six = motif_context(lane_infos("6K"), 0.8)
    assert expected_keys(six, plan("doubles"), [(1,)], 1) == (1,)  # 재봉틀: twice on a key ...
    assert expected_keys(six, plan("doubles"), [(1,), (1,)], 1) == (4,)  # ... then the other hand
    assert expected_keys(six, plan("doubles"), [(1,), (1,), (4,)], 1) == (4,)
    chords = [{"t": 300.0 * i, "beat": float(i), "lane": lane, "type": "tap"} for i, pair in enumerate([(0, 2), (2, 4), (0, 2)]) for lane in pair]
    assert pivots(chords, "5K") == 1.0
