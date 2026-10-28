from __future__ import annotations

import numpy as np
import pytest

from rhythm_server.config import difficulty_config
from rhythm_server.generator import generate_chart
from rhythm_server.generator.lanes import lane_infos
from rhythm_server.generator.linter import lint
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.tempo import TempoMap

MODES = ("4K", "7K+1S")
ORDER = difficulty_config()["order"]


@pytest.fixture(scope="module")
def charts(analysis128: dict, analysis174: dict) -> dict:
    out = {}
    for name, a in (("128", analysis128), ("174", analysis174)):
        for mode in MODES:
            for d in ORDER:
                out[(name, mode, d)] = generate_chart(a, mode, d, meta={"title": name})
    return out


def test_same_input_and_seed_give_the_same_chart(analysis128: dict) -> None:
    a = generate_chart(analysis128, "7K+1S", "HARD", seed=1234)
    b = generate_chart(analysis128, "7K+1S", "HARD", seed=1234)
    assert a == b
    c = generate_chart(analysis128, "7K+1S", "HARD", seed=4321)
    assert c["notes"] != a["notes"]
    assert c["meta"]["chartId"] != a["meta"]["chartId"]


def test_default_seed_is_stable(analysis128: dict) -> None:
    a = generate_chart(analysis128, "4K", "NORMAL")
    b = generate_chart(analysis128, "4K", "NORMAL")
    assert a["meta"]["generator"]["seed"] == b["meta"]["generator"]["seed"]
    assert a["meta"]["chartId"] == b["meta"]["chartId"]


def test_every_chart_passes_the_playability_linter(charts: dict, analysis128: dict, analysis174: dict) -> None:
    analyses = {"128": analysis128, "174": analysis174}
    for (name, mode, d), chart in charts.items():
        params = resolve_params(mode, d)
        problems = lint(chart["notes"], lane_infos(mode), params, TempoMap(analyses[name]["timing"]))
        assert problems == [], f"{name} {mode} {d}: {problems[:3]}"


def test_difficulty_increases_monotonically(charts: dict) -> None:
    for name in ("128", "174"):
        for mode in MODES:
            counts = [len(charts[(name, mode, d)]["notes"]) for d in ORDER]
            levels = [charts[(name, mode, d)]["meta"]["level"] for d in ORDER]
            nps = [charts[(name, mode, d)]["meta"]["nps"]["avg"] for d in ORDER]
            assert counts == sorted(counts) and len(set(counts)) == len(counts), f"{name} {mode} counts {counts}"
            assert levels == sorted(levels), f"{name} {mode} levels {levels}"
            assert nps == sorted(nps), f"{name} {mode} nps {nps}"


def test_levels_land_in_their_preset_range_unless_density_limited(charts: dict) -> None:
    presets = difficulty_config()["presets"]
    for (name, mode, d), chart in charts.items():
        lo, hi = presets[d]["levels"]
        level = chart["meta"]["level"]
        if chart["meta"]["densityLimited"]:
            assert level <= hi
        else:
            assert lo <= level <= hi, f"{name} {mode} {d}: level {level}"


def test_a_chart_above_its_range_thins_past_the_density_floor(analysis128: dict, monkeypatch) -> None:
    """The level range comes before the density floor: on real songs GRG tiers stayed at their floor
    above their range (generator 0.9.33). A floor far above the tier's density holds them no more."""
    import rhythm_server.generator.core as core

    monkeypatch.setattr(core, "DENSITY_FLOOR", 3.0)
    presets = difficulty_config()["presets"]
    for d in ("NORMAL", "HARD"):
        lo, hi = presets[d]["levels"]
        assert lo <= generate_chart(analysis128, "6K", d)["meta"]["level"] <= hi, d


def test_the_peak_density_thins_with_a_grg_chart(analysis128: dict, monkeypatch) -> None:
    """GRG lowers the 1-second peak by the square root of a note budget under the preset's (the
    density setting times the level loop's scale), so a roll does not stay a burst over a thinned
    chart. Both engines take the peak from it."""
    from rhythm_server.generator.params import GenParams

    grg = resolve_params("6K", "HARD")
    assert grg.peak_at(0.25) == pytest.approx(0.5 * grg.peak_nps)
    assert grg.peak_at(1.5) == grg.peak_nps
    sparse = resolve_params("6K", "HARD", overrides={"density": 0.5})
    assert sparse.peak_at(1.0) == pytest.approx(0.5 ** 0.5 * sparse.peak_nps)
    assert sparse.peak_at(2.0) == sparse.peak_nps
    scales = []
    real = GenParams.peak_at
    monkeypatch.setattr(GenParams, "peak_at", lambda self, s: scales.append(s) or real(self, s))
    for engine in ("sectioned", "classic"):
        scales.clear()
        generate_chart(analysis128, "6K", "HARD", overrides={"patternEngine": engine})
        assert scales and min(scales) < 1.0, engine  # the level loop thinned this one


def test_target_level_is_respected(analysis128: dict) -> None:
    chart = generate_chart(analysis128, "4K", "NORMAL", target_level=7)
    assert chart["meta"]["difficulty"] == "HARD"
    assert abs(chart["meta"]["level"] - 7) <= 1


def test_the_five_tiers_and_no_other() -> None:
    """The game's own five tiers only (DJMAX, EZ2ON and EASY were taken out, 2026-10-27; ELITE came
    in between EXPERT and MASTER with the 1-20 level scale, generator 0.9.39), four levels each; a
    target level outside the scale is made at its nearest end."""
    cfg = difficulty_config()
    assert cfg["order"] == ["NORMAL", "HARD", "EXPERT", "ELITE", "MASTER"]
    assert [tuple(cfg["presets"][t]["levels"]) for t in cfg["order"]] == [(1, 4), (5, 8), (9, 12), (13, 16), (17, 20)]
    assert len(cfg["levelEffectiveNps"]) == 20
    for gone in ("EASY", "NM", "SC"):
        with pytest.raises(ValueError):
            resolve_params("4K", gone)
    low = resolve_params("4K", "NORMAL", 0)
    assert (low.difficulty, low.target_level) == ("NORMAL", 1)
    assert resolve_params("4K", "HARD", 2).difficulty == "NORMAL"
    top = resolve_params("4K", "ELITE", 25)
    assert (top.difficulty, top.target_level) == ("MASTER", 20)
    # the same long notes on every key mode (no per-game key mode habits)
    assert len({resolve_params(m, "HARD").long_note_ratio for m in ("4K", "6K", "8K")}) == 1


def test_higher_target_levels_keep_more_notes(analysis128: dict) -> None:
    """A chart above its target level thins past the density floor (generator 0.9.33), so only the
    estimator keeps the note count rising with the target level."""
    counts = [len(generate_chart(analysis128, "6K", "NORMAL", target_level=t)["notes"]) for t in range(1, 21, 2)]
    assert counts == sorted(counts), counts


def test_notes_are_on_the_audio_timeline_and_lanes_are_valid(charts: dict) -> None:
    for (name, mode, d), chart in charts.items():
        n_lanes = len(chart["meta"]["lanes"])
        for n in chart["notes"]:
            assert n["t"] >= 0
            assert 0 <= n["lane"] < n_lanes
            if n["type"] == "hold":
                assert n["endT"] > n["t"]


def test_scratch_notes_only_where_allowed(charts: dict) -> None:
    for name in ("128", "174"):
        # NORMAL has a few spaced scratches, like the BMS charts of that density (7.2% of their notes)
        normal = charts[(name, "7K+1S", "NORMAL")]["notes"]
        scratch = sorted(n["t"] for n in normal if n["lane"] == 0)
        assert len(scratch) <= 0.1 * len(normal)
        assert all(b - a >= 250.0 for a, b in zip(scratch, scratch[1:]))
        assert any(n["lane"] == 0 for n in charts[(name, "7K+1S", "HARD")]["notes"])
        assert all(len(charts[(name, "4K", d)]["meta"]["lanes"]) == 4 for d in ORDER)


def test_notes_follow_detected_sounds(charts: dict, analysis128: dict, song128) -> None:
    """Every note is on a sound of the song: a detected onset, or (the sectioned engine's consensus
    fill, where a loop's other repeats have the sound) a real sound the detector missed, checked
    against the synthetic song's true onsets."""
    import bisect

    detected = sorted(o["t"] for o in analysis128["onsets"])
    true = sorted(t * 1000.0 for times in song128.onsets.values() for t in times)

    def near(times: list[float], t: float) -> float:
        i = bisect.bisect_left(times, t)
        return min(abs(times[j] - t) for j in (i - 1, i) if 0 <= j < len(times))

    for d in ORDER:
        for n in charts[("128", "4K", d)]["notes"]:
            assert near(detected, n["t"]) <= 40.0 or near(true, n["t"]) <= 30.0, f"{d}: note at {n['t']}ms has no sound nearby"


def test_long_notes_and_chords_scale_with_difficulty(charts: dict) -> None:
    for name in ("128", "174"):
        normal = charts[(name, "7K+1S", "NORMAL")]["notes"]
        hard = charts[(name, "7K+1S", "HARD")]["notes"]
        assert sum(n["type"] == "hold" for n in hard) > sum(n["type"] == "hold" for n in normal)
        chord_sizes_hard = {}
        for n in hard:
            chord_sizes_hard[n["t"]] = chord_sizes_hard.get(n["t"], 0) + 1
        assert max(chord_sizes_hard.values()) >= 2


def test_normal_long_notes_let_go_before_a_close_hit() -> None:
    """NORMAL keeps the hits under a key long note a beat apart and from its head (holds.clear): a
    long note over a closer hit lets go at the last whole or half beat at or before it, or becomes a
    tap when that is under the tier's shortest."""
    from rhythm_server.generator.select import Slot, clear_holds

    def slots(*spec):
        return [Slot(beat=b, t=b * 500.0, size=1, hold_end_beat=e, special=None, special_hold=False, pitch=None,
                     bands=np.ones(3), score=1.0, subdivision=1, strength=1.0) for b, e in spec]

    normal, hard = (resolve_params("7K+1S", d) for d in ("NORMAL", "HARD"))
    s = slots((0.0, 4.0), (1.0, None), (2.0, None), (2.75, None))
    clear_holds(s, normal)
    assert s[0].hold_end_beat == 2.5  # 2.0 -> 2.75 is under a beat
    s = slots((0.0, 4.0), (0.25, None))
    clear_holds(s, normal)
    assert s[0].hold_end_beat is None  # the first close hit comes before the shortest long note (1 beat)
    s = slots((0.0, 4.0), (0.25, None), (0.5, None))
    clear_holds(s, hard)
    assert s[0].hold_end_beat == 4.0
    s = slots((0.0, 4.0), (1.0, None), (1.5, None))
    s[0].special = "side"  # a side tap on the slot: its key long note still clears
    clear_holds(s, normal)
    assert s[0].hold_end_beat == 1.5
    s[0].special_hold, s[0].hold_end_beat = True, 4.0  # the side lane's own long note stays
    clear_holds(s, normal)
    assert s[0].hold_end_beat == 4.0


def test_isolated_near_pairs_become_chords() -> None:
    """Two hits a 32nd or a twelfth of a beat apart with room around them are one hit split by the
    grid ("zure"): the finer one joins the coarser as a chord, or goes when the chord does not fit;
    a 16th triplet apart, or inside a run, they stay (generator 0.9.36)."""
    from rhythm_server.generator.near import merge_near

    tempo = TempoMap({"offsetMs": 0, "tempoMap": [{"beat": 0, "bpm": 150}]})
    lanes = lane_infos("7K+1S")

    def tap(beat, lane):
        return {"beat": beat, "t": beat * 400.0, "lane": lane, "type": "tap"}

    master = resolve_params("7K+1S", "MASTER")
    notes = [tap(10.0, 2), tap(10.125, 5), tap(12.25, 2), tap(12.0 + 1 / 3, 6), tap(14.0, 1), tap(14.0 + 1 / 6, 6), tap(16.5, 3), tap(16.5 + 1 / 6, 6)]
    notes += [tap(20.0 + i / 8, 1 + i % 2 * 5) for i in range(4)]
    out = merge_near(notes, lanes, master, tempo)
    assert sorted((n["beat"], n["lane"]) for n in out if n["beat"] < 11) == [(10.0, 2), (10.0, 5)]  # a 32nd: onto the beat
    assert sorted((n["beat"], n["lane"]) for n in out if 12 <= n["beat"] < 13) == [(12.0 + 1 / 3, 2), (12.0 + 1 / 3, 6)]  # a 1/12: onto the triplet
    assert all(n["t"] == n["beat"] * 400.0 for n in out)
    assert sorted(n["beat"] for n in out if 14 <= n["beat"] < 15) == [14.0, 14.0 + 1 / 6]  # a triplet figure stays
    assert sorted((n["beat"], n["lane"]) for n in out if 16 <= n["beat"] < 17) == [(16.5, 3), (16.5, 6)]  # an 8th met by a triplet
    assert len([n for n in out if n["beat"] >= 20]) == 4  # a run stays
    normal = resolve_params("7K+1S", "NORMAL")  # two notes at most: the finer note goes
    out = merge_near([tap(10.0, 1), tap(10.0, 7), tap(10.125, 3)], lanes, normal, tempo)
    assert sorted(n["lane"] for n in out) == [1, 7] and lint(out, lanes, normal, tempo) == []


def test_tiers_follow_the_songs_motion(analysis128: dict, monkeypatch) -> None:
    """The tiers move the way the top tier's first round does between the same
    two single notes (sectioned.tierPlan), and MASTER keeps to that round harder (ownWeight):
    EXPERT goes MASTER's way more often than with the plan off (0.44 -> 0.72 on this song with the
    sections of analyzer 1.10.0, 0.46 -> 0.54 with those of 1.11.0; HARD has only 14 such pairs). MASTER starts from its own first round and builds no other, whatever its
    options; with another seed it builds the default one for the song's strength (songFit)."""
    import rhythm_server.generator.core as core
    from rhythm_server.config import load_config

    calls = []
    real = core.lane_plan
    monkeypatch.setattr(core, "lane_plan", lambda *a: calls.append(a[2]) or real(*a))

    def singles(chart):
        rows: dict[float, list[int]] = {}
        for n in chart["notes"]:
            if n["lane"] != 0:
                rows.setdefault(round(n["beat"], 4), []).append(n["lane"])
        return {b: ls[0] for b, ls in rows.items() if len(ls) == 1}

    def agreement(easy, hard):
        a, b = singles(easy), singles(hard)
        beats = sorted(a)
        pairs = [(x, y) for x, y in zip(beats, beats[1:]) if x in b and y in b]
        sign = lambda d: (d > 0) - (d < 0)  # noqa: E731
        return sum(sign(a[y] - a[x]) == sign(b[y] - b[x]) for x, y in pairs) / len(pairs)

    master = generate_chart(analysis128, "7K+1S", "MASTER")
    app = generate_chart(analysis128, "7K+1S", "MASTER", overrides={"style": "balanced", "rhythmSource": "auto"})
    assert calls == [] and app["notes"] == master["notes"]
    generate_chart(analysis128, "7K+1S", "MASTER", seed=99)
    assert calls == ["MASTER"]
    with_plan = agreement(generate_chart(analysis128, "7K+1S", "EXPERT"), master)
    assert calls == ["MASTER", "MASTER"]
    plan = load_config("patterns")["sectioned"]["tierPlan"]
    monkeypatch.setitem(plan, "weight", 0.0)
    monkeypatch.setitem(plan, "ownWeight", 0.0)
    master = generate_chart(analysis128, "7K+1S", "MASTER")
    assert with_plan > agreement(generate_chart(analysis128, "7K+1S", "EXPERT"), master) + 0.05


def test_a_songs_strength_places_its_charts_and_a_calm_song_has_no_top_tier(analysis128: dict, monkeypatch) -> None:
    """difficulty.json songFit: a default chart aims at the part of its tier's level range the
    song's strength (the top tier's first-round rating) calls for, and a song under `from` has no
    top tier. A chart asked for at a level is made all the same."""
    import rhythm_server.generator.core as core

    fit = difficulty_config()["songFit"]
    strength = core.lane_plan(analysis128, "7K+1S", "MASTER")[1]
    assert strength is not None
    monkeypatch.setitem(fit, "floorAtBottom", 0.7)
    monkeypatch.setitem(fit, "from", strength + 1.0)
    monkeypatch.setitem(fit, "to", strength + 2.0)
    with pytest.raises(core.TierNotMade):
        generate_chart(analysis128, "7K+1S", "MASTER")
    with pytest.raises(core.TierNotMade):
        generate_chart(analysis128, "7K+1S", "MASTER", seed=99)
    assert generate_chart(analysis128, "7K+1S", "MASTER", target_level=18)["meta"]["difficulty"] == "MASTER"
    bottom = generate_chart(analysis128, "7K+1S", "EXPERT")["meta"]
    monkeypatch.setitem(fit, "from", strength - 2.0)
    monkeypatch.setitem(fit, "to", strength - 1.0)
    top = generate_chart(analysis128, "7K+1S", "EXPERT")["meta"]
    assert bottom["rating"] < top["rating"] and bottom["noteCount"] < top["noteCount"]
    assert core.song_place(15.0, {"from": 14.0, "to": 20.0}) == pytest.approx(1 / 6)
    assert core.song_place(10.0, {"from": 14.0, "to": 20.0}) == 0.0 and core.song_place(25.0, {"from": 14.0, "to": 20.0}) == 1.0


def test_repeats_keep_the_same_long_note_after_clearing() -> None:
    """The sectioned engine decides a long note once per class position; after clearing, every repeat
    keeps the shortest one left, or none when one repeat lost it."""
    from types import SimpleNamespace

    from rhythm_server.generator.sections import _same_holds

    def slot(beat, end):
        return SimpleNamespace(beat=beat, hold_end_beat=end, hold_count=2)

    s = [slot(0.0, 4.0), slot(16.0, 18.5), slot(32.0, 36.0), slot(48.0, None), slot(64.0, None)]
    _same_holds(s, {"a": [0, 1, 2], "b": [3, 4]}, [4.0, 20.0, 36.0, None, None])
    assert [x.hold_end_beat for x in s[:3]] == [2.5, 18.5, 34.5]
    s = [slot(0.0, 4.0), slot(16.0, None)]
    _same_holds(s, {"a": [0, 1]}, [4.0, 20.0])
    assert [(x.hold_end_beat, x.hold_count) for x in s] == [(None, 1), (None, 1)]


def test_generated_normal_charts_keep_long_notes_clear(charts: dict, analysis128: dict) -> None:
    """Both engines, and a side-lane mode: a side tap on a key long note's slot does not exempt the
    key, and a side hold that loses its side lane does not move to a key."""
    gap = float(difficulty_config()["holds"]["clear"]["gapBeats"])
    more = {("128", mode, d, engine): generate_chart(analysis128, mode, d, overrides={"patternEngine": engine, "sideRate": 0.2})
            for mode, engine in (("6K+FX", "sectioned"), ("6K+FX", "classic"), ("7K+1S", "classic")) for d in ("NORMAL",)}
    for (name, mode, d, *_), chart in [*charts.items(), *more.items()]:
        if d != "NORMAL":
            continue
        keys = {l.index for l in lane_infos(mode) if l.kind != "side"}
        heads = sorted({n["beat"] for n in chart["notes"]})
        for h in (n for n in chart["notes"] if n["type"] == "hold" and n["lane"] in keys):
            inside = [b for b in heads if h["beat"] + 1e-6 < b < h["endBeat"] - 1e-6]
            gaps = np.diff([h["beat"], *inside]) if inside else []
            assert all(g >= gap - 1e-6 for g in gaps), (name, mode, h["beat"], inside)


def test_no_scratch_under_a_left_hand_long_note_below_expert(analysis128: dict) -> None:
    """The turntable takes the whole hand: a hand holding a long note scratches only on tiers that let
    it press two more keys (EXPERT up), and the linter says so."""
    lanes = lane_infos("7K+1S")
    left = {l.index for l in lanes if l.hand == "L" and l.kind == "key"}
    over = {"longNoteRatio": 0.5, "scratchRate": 0.2}
    for d in ("NORMAL", "HARD"):
        notes = generate_chart(analysis128, "7K+1S", d, seed=7, overrides=over)["notes"]
        holds = [n for n in notes if n["type"] == "hold" and n["lane"] in left]
        assert holds, d
        for s in (n for n in notes if n["lane"] == 0):
            assert not any(h["t"] < s["t"] < h["endT"] for h in holds), (d, s["t"])
    hold = {"beat": 0.0, "t": 0.0, "lane": 1, "type": "hold", "endBeat": 2.0, "endT": 1000.0}
    scratch = {"beat": 1.0, "t": 500.0, "lane": 0, "type": "tap"}
    tempo = TempoMap(analysis128["timing"])
    assert lint([hold, scratch], lanes, resolve_params("7K+1S", "HARD"), tempo) == ["scratch under a held long note at 500.0ms"]
    assert lint([hold, scratch], lanes, resolve_params("7K+1S", "EXPERT"), tempo) == []


ALL_MODES = ("4K", "4K+FX", "5K", "6K", "6K+FX", "7K+1S", "8K")


def test_every_key_mode_generates_playable_charts(analysis128: dict) -> None:
    for mode in ALL_MODES:
        lanes = lane_infos(mode)
        levels = []
        for d in ORDER:
            chart = generate_chart(analysis128, mode, d, seed=7)
            params = resolve_params(mode, d)
            assert lint(chart["notes"], lanes, params, TempoMap(chart["timing"])) == [], (mode, d)
            assert len(chart["meta"]["lanes"]) == len(lanes)
            levels.append(chart["meta"]["level"])
        assert levels == sorted(levels), (mode, levels)


def test_side_lanes_get_taps_and_long_notes_from_hard_up(analysis128: dict) -> None:
    for mode in ("4K+FX", "6K+FX"):
        side = [l.index for l in lane_infos(mode) if l.kind == "side"]
        notes = generate_chart(analysis128, mode, "EXPERT", seed=7)["notes"]
        on_side = [n for n in notes if n["lane"] in side]
        assert on_side, mode
        assert any(n["type"] == "hold" for n in on_side), mode
        assert {n["lane"] for n in on_side} == set(side), mode


def test_styles_move_the_skillset_in_their_direction(analysis128: dict) -> None:
    # a mean over seeds: one seed's balanced chart can be as jacky as the jack style's (generator
    # 0.9.12: seed 42 gave 0.564 against 0.566, seeds 0-5 0.46 against 0.60 on average)
    def skills(style: str) -> dict:
        charts = [generate_chart(analysis128, "7K+1S", "HARD", seed=seed, overrides={"style": style})["meta"]["skillset"] for seed in range(4)]
        return {k: sum(c[k] for c in charts) / len(charts) for k in charts[0]}

    base = skills("balanced")
    assert skills("stream")["stream"] > base["stream"]
    assert skills("chord")["chord"] > base["chord"]
    assert skills("jack")["jack"] > base["jack"]
    assert skills("longnote")["longNote"] > base["longNote"]


def test_overrides_are_clamped_to_the_configured_limits() -> None:
    p = resolve_params("6K+FX", "HARD", overrides={"density": 9, "longNoteRatio": -1, "sideRate": 0.9, "maxChord": 99})
    assert p.density == 1.5
    assert p.long_note_ratio == 0.0
    assert p.side_rate == 0.2
    assert p.max_chord == resolve_params("6K+FX", "HARD").max_chord + 1
    assert resolve_params("4K", "HARD", overrides={"style": "nonsense"}).style == "balanced"


def test_onsets_unlikely_to_start_a_sound_score_lower(analysis128: dict) -> None:
    """The analysis says how surely each onset starts a new sound (`attack`); a doubtful one (a
    sounding note's late low end, a swell) scores below a sure one, a clear melody note too, and
    an analysis made before the field existed scores as if every onset were sure."""
    import copy

    from rhythm_server.config import load_config
    from rhythm_server.generator.candidates import build_candidates

    tempo = TempoMap(analysis128["timing"])
    params = resolve_params("7K+1S", "HARD")
    tolerance = float(difficulty_config()["snapToleranceMs"])

    def scores(attack: float | None, melody: float) -> dict[float, float]:
        a = copy.deepcopy(analysis128)
        for o in a["onsets"]:
            o.pop("attack", None)
            o["melody"] = melody
            if attack is not None:
                o["attack"] = attack
        return {c.beat: c.score for c in build_candidates(a, tempo, params, tolerance)}

    old, sure, doubtful = scores(None, 0.0), scores(1.0, 0.0), scores(0.1, 0.0)
    assert old == sure
    floor = float(load_config("instruments")["rhythmSource"]["attack"]["floor"])
    assert floor < 1.0
    assert all(doubtful[b] < sure[b] for b in sure if sure[b] > 0)
    sung_doubtful, sung_sure = scores(0.1, 1.0), scores(1.0, 1.0)
    assert all(sung_doubtful[b] < sung_sure[b] for b in sung_sure if sung_sure[b] > 0)


def test_a_sixteenth_that_pushes_the_next_beat_scores_above_one_before_a_stronger_beat() -> None:
    """Human BMS easy charts pick a 16th-position sound twice as often when the grid point a 16th
    later has no sound or a weaker one - a push that anticipates the beat or the off-beat - as when
    a stronger sound follows (0.24 against 0.12; PATTERN_DESIGN 39). Since generator 0.9.20 the hand
    score multiplies such a candidate by metrical.push; a 16th before a stronger sound scores as
    before."""
    import numpy as np

    from rhythm_server.generator.candidates import Candidate, _hand_scores

    params = resolve_params("7K+1S", "NORMAL")
    push = float(difficulty_config()["metrical"]["push"])
    assert push > 1.0

    def cand(beat: float, subdivision: int, strength: float) -> Candidate:
        return Candidate(beat=beat, t=beat * 500.0, subdivision=subdivision, strength=strength, bands=np.ones(3), pitch=None,
                         harmonic=0.0, sustain_beats=0.0, intensity=0.5, downbeat=subdivision == 1 and beat % 4 == 0)

    # 16ths before nothing (beat 1), before a stronger beat (5) and before a weaker one (9)
    cands = [cand(0.0, 1, 1.0), cand(0.75, 4, 0.5), cand(4.0, 1, 1.0), cand(4.75, 4, 0.5), cand(5.0, 1, 0.8), cand(8.75, 4, 0.5), cand(9.0, 1, 0.3)]
    score = dict(zip((c.beat for c in cands), _hand_scores(cands, params)))
    assert score[0.75] == pytest.approx(push * score[4.75])
    assert score[8.75] == pytest.approx(push * score[4.75])


def test_the_note_pick_model_scores_every_tier_and_keeps_the_options(analysis128: dict) -> None:
    """Since generator 0.9.9 candidates are scored with a note-pick model fitted on human BMS charts
    (config/pick.json), blended in by skill. A rhythm source still moves the scores as it moves the
    hand-made ones."""
    import math
    from dataclasses import replace

    from rhythm_server.config import load_config
    from rhythm_server.generator.candidates import _echoes, _hand_scores, _melody_splits, build_candidates, pad_like, pick_features, pick_model, pick_probability

    def plain(cands: list, params) -> list:
        """The candidates no rule rescales after the model (generator 0.9.29: pads,
        solos and lines split into sixteenths, PATTERN_DESIGN 60; 0.9.30: echoes, 61)."""
        melody = load_config("instruments")["rhythmSource"]["melody"]
        split = {id(c) for c in _melody_splits(cands, melody, params.skill) + _echoes(cands, melody)}
        return [c for c in cands if not pad_like(c) and not c.solo and id(c) not in split]

    tempo = TempoMap(analysis128["timing"])
    tolerance = float(difficulty_config()["snapToleranceMs"])
    normal, master = resolve_params("7K+1S", "NORMAL"), resolve_params("7K+1S", "MASTER")
    assert pick_model(normal) is not pick_model(master)
    # the probability is the configured logistic model
    model = pick_model(master)
    cands = build_candidates(analysis128, tempo, master, tolerance)
    c = max(plain(cands, master), key=lambda c: c.score)
    x = pick_features(c)
    z = model["bias"] + sum(w * (x[n] - m) / sd for n, m, sd, w in zip(model["features"], model["mean"], model["scale"], model["weights"]))
    assert math.isclose(pick_probability(c, model), 1.0 / (1.0 + math.exp(-z)))
    # MASTER takes the model's ranking; NORMAL half the model, half the hand-made score
    assert math.isclose(c.score, pick_probability(c, model), rel_tol=1e-9)
    normal_cands = build_candidates(analysis128, tempo, normal, tolerance)
    hand = _hand_scores(normal_cands, normal)
    model = pick_model(normal)
    kept = {id(c) for c in plain(normal_cands, normal)}
    assert len(kept) > 0.5 * len(normal_cands)
    assert all(math.isclose(c.score, math.sqrt(h * pick_probability(c, model)), rel_tol=1e-9) for c, h in zip(normal_cands, hand) if id(c) in kept)
    # a drum rhythm source multiplies the scores as it multiplies the hand-made ones
    drum = replace(normal, rhythm_source="drum")
    drum_cands = build_candidates(analysis128, tempo, drum, tolerance)
    ratio = [d / a for d, a in zip(_hand_scores(drum_cands, drum), hand)]
    assert len(set(round(r, 6) for r in ratio)) > 1
    assert all(math.isclose(d.score, c.score * r, rel_tol=1e-9) for d, c, r in zip(drum_cands, normal_cands, ratio))


def test_the_triplet_grid_opens_in_the_bars_that_swing() -> None:
    """A song can swing overall and still be straight in most bars. Since generator 0.9.26 the
    generator decides bar by bar with a model fitted on human BMS charts (PATTERN_DESIGN 56):
    the triplet grid opens only in bars that swing, a triplet-like onset in a straight bar takes the
    straight grid, and a triplet in a swinging bar is scored and capped as the eighth it plays the
    part of (the swung eighth of a shuffle)."""
    from rhythm_server.generator.candidates import build_candidates, grid_of, swing_bars

    beat_ms = 500.0  # 120 BPM, 4/4: bars of 2000 ms

    def onset(beat: float) -> dict:
        return {"t": 1000.0 + beat * beat_ms, "strength": 0.8, "bands": [0.2, 0.5, 0.3], "harmonic": 0.4, "pitch": None}

    # bars 0-7 straight sixteenths, bars 8-15 eighth-note triplets; one stray onset near a triplet in bar 3
    beats = [b + f for b in range(32) for f in (0.0, 0.25, 0.5, 0.75)] + [b + f for b in range(32, 64) for f in (0.0, 1 / 3, 2 / 3)]
    onsets = [onset(b) for b in sorted(beats + [12.0 + 0.36])]
    analysis = {
        "durationMs": 1000.0 + 64 * beat_ms + 1000.0,
        "timing": {"offsetMs": 1000.0, "tempoMap": [{"beat": 0, "bpm": 120.0}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]},
        "onsets": onsets,
        "energy": {"frameMs": 100.0, "values": [0.5] * 400},
        "sections": [],
    }
    tempo = TempoMap(analysis["timing"])
    swinging = swing_bars(analysis, tempo)
    assert set(range(9, 16)) <= swinging and not swinging & set(range(0, 7)), swinging
    hard = resolve_params("7K+1S", "HARD")
    tolerance = float(difficulty_config()["snapToleranceMs"])

    def triplets(bars: set[int] | None) -> list:
        return [c for c in build_candidates(analysis, tempo, hard, tolerance, bars) if c.subdivision in (3, 6)]

    assert 3 in {int(c.beat // 4) for c in triplets(None)}  # song-wide grid: the stray onset snaps to a triplet in a straight bar
    local = triplets(swinging)
    assert 3 not in {int(c.beat // 4) for c in local} and set(range(9, 16)) <= {int(c.beat // 4) for c in local}
    assert all(grid_of(c) == 2 for c in local) and all(c.grid is None for c in triplets(None))


def test_normal_charts_of_swung_songs_play_the_swung_eighths() -> None:
    """Human BMS charts of triplet-feel songs put 3-6% of their notes on triplet positions from
    level 2 on (PATTERN_DESIGN 23), and in the bars that swing 21% even at level 6 (56). Since
    generator 0.9.7 NORMAL reads the eighth-note triplets of such a song (before, none), since
    0.9.26 as the eighths they stand for, past the triplet cap (7% of the notes); a straight song
    keeps none."""
    from rhythm_server.analysis.analyzer import analyze
    from rhythm_server.synth import make_drum_song

    def triplet_notes(style: str) -> dict[str, int]:
        song = make_drum_song(style, 100.0)
        a = analyze(song.pcm, song.sample_rate, f"sha256:grid-{style}-100", backends={})
        out = {}
        for tier in ("NORMAL",):
            fractions = [n["beat"] % 1.0 for n in generate_chart(a, "7K+1S", tier)["notes"]]
            out[tier] = sum(1 for f in fractions if min(abs(f - 1 / 3), abs(f - 2 / 3)) < 0.02) / len(fractions)
        return out

    swung, straight = triplet_notes("shuffle"), triplet_notes("pop16")
    assert swung["NORMAL"] >= 0.25, swung
    assert straight == {"NORMAL": 0}, straight
