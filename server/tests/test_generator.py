from __future__ import annotations

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


def test_target_level_is_respected(analysis128: dict) -> None:
    chart = generate_chart(analysis128, "4K", "NORMAL", target_level=8)
    assert chart["meta"]["difficulty"] == "HARD"
    assert abs(chart["meta"]["level"] - 8) <= 1


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
        # EASY has a few spaced scratches, like the BMS charts of that density (7.8% of their notes)
        easy = charts[(name, "7K+1S", "EASY")]["notes"]
        scratch = sorted(n["t"] for n in easy if n["lane"] == 0)
        assert len(scratch) <= 0.1 * len(easy)
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
        easy = charts[(name, "7K+1S", "EASY")]["notes"]
        hard = charts[(name, "7K+1S", "HARD")]["notes"]
        assert sum(n["type"] == "hold" for n in hard) > sum(n["type"] == "hold" for n in easy)
        chord_sizes_hard = {}
        for n in hard:
            chord_sizes_hard[n["t"]] = chord_sizes_hard.get(n["t"], 0) + 1
        assert max(chord_sizes_hard.values()) >= 2


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
        easy = generate_chart(analysis128, mode, "EASY", seed=7)["notes"]
        assert all(n["lane"] not in side for n in easy)
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

    params = resolve_params("7K+1S", "EASY")
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


def test_the_note_pick_model_scores_every_system_and_keeps_the_options(analysis128: dict) -> None:
    """Since generator 0.9.9 candidates are scored with a note-pick model fitted on human BMS charts
    (config/pick.json), blended in by skill. Generator 0.9.15 gave it to DJMAX and EZ2ON too, since
    which sounds of a song deserve a note does not depend on the game (PATTERN_DESIGN 32). A rhythm
    source still moves the scores as it moves the hand-made ones."""
    import math
    from dataclasses import replace

    from rhythm_server.config import load_config
    from rhythm_server.generator.candidates import _hand_scores, _melody_splits, build_candidates, pad_like, pick_features, pick_model, pick_probability

    def plain(cands: list, params) -> list:
        """The candidates no default-system rule rescales after the model (generator 0.9.29: pads,
        solos and lines split into sixteenths, PATTERN_DESIGN 60)."""
        split = {id(c) for c in _melody_splits(cands, load_config("instruments")["rhythmSource"]["melody"], params.system, params.skill)}
        return [c for c in cands if not pad_like(c, params.system) and not c.solo and id(c) not in split]

    tempo = TempoMap(analysis128["timing"])
    tolerance = float(difficulty_config()["snapToleranceMs"])
    easy, master = resolve_params("7K+1S", "EASY"), resolve_params("7K+1S", "MASTER")
    assert pick_model(easy) is not pick_model(master)
    for system, tier in (("DJMAX", "HD"), ("EZ2ON", "HD")):
        params = resolve_params("6K", tier, None, None, system)
        assert pick_model(params) is not None
        cands = build_candidates(analysis128, tempo, params, tolerance)
        assert [c.score for c in cands] != _hand_scores(cands, params)
    # the probability is the configured logistic model
    model = pick_model(master)
    cands = build_candidates(analysis128, tempo, master, tolerance)
    c = max(plain(cands, master), key=lambda c: c.score)
    x = pick_features(c)
    z = model["bias"] + sum(w * (x[n] - m) / sd for n, m, sd, w in zip(model["features"], model["mean"], model["scale"], model["weights"]))
    assert math.isclose(pick_probability(c, model), 1.0 / (1.0 + math.exp(-z)))
    # MASTER takes the model's ranking; EASY half the model, half the hand-made score
    assert math.isclose(c.score, pick_probability(c, model), rel_tol=1e-9)
    easy_cands = build_candidates(analysis128, tempo, easy, tolerance)
    hand = _hand_scores(easy_cands, easy)
    model = pick_model(easy)
    kept = {id(c) for c in plain(easy_cands, easy)}
    assert len(kept) > 0.5 * len(easy_cands)
    assert all(math.isclose(c.score, math.sqrt(h * pick_probability(c, model)), rel_tol=1e-9) for c, h in zip(easy_cands, hand) if id(c) in kept)
    # a drum rhythm source multiplies the scores as it multiplies the hand-made ones
    drum = replace(easy, rhythm_source="drum")
    drum_cands = build_candidates(analysis128, tempo, drum, tolerance)
    ratio = [d / a for d, a in zip(_hand_scores(drum_cands, drum), hand)]
    assert len(set(round(r, 6) for r in ratio)) > 1
    assert all(math.isclose(d.score, c.score * r, rel_tol=1e-9) for d, c, r in zip(drum_cands, easy_cands, ratio))


def test_the_default_system_opens_the_triplet_grid_in_the_bars_that_swing() -> None:
    """A song can swing overall and still be straight in most bars. Since generator 0.9.26 the
    default system decides bar by bar with a model fitted on human BMS charts (PATTERN_DESIGN 56):
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


def test_easy_charts_of_swung_songs_play_the_swung_eighths() -> None:
    """Human BMS charts of triplet-feel songs put 3-6% of their notes on triplet positions from
    level 2 on (PATTERN_DESIGN 23), and in the bars that swing 21% even at level 6 (56). Since
    generator 0.9.7 the default system's EASY and NORMAL read the eighth-note triplets of such a
    song (before, none), since 0.9.26 as the eighths they stand for, past the triplet caps (5% and
    7% of the notes); a straight song keeps none."""
    from rhythm_server.analysis.analyzer import analyze
    from rhythm_server.synth import make_drum_song

    def triplet_notes(style: str) -> dict[str, int]:
        song = make_drum_song(style, 100.0)
        a = analyze(song.pcm, song.sample_rate, f"sha256:grid-{style}-100", backends={})
        out = {}
        for tier in ("EASY", "NORMAL"):
            fractions = [n["beat"] % 1.0 for n in generate_chart(a, "7K+1S", tier)["notes"]]
            out[tier] = sum(1 for f in fractions if min(abs(f - 1 / 3), abs(f - 2 / 3)) < 0.02) / len(fractions)
        return out

    swung, straight = triplet_notes("shuffle"), triplet_notes("pop16")
    assert swung["EASY"] >= 0.15 and swung["NORMAL"] >= 0.25, swung
    assert straight == {"EASY": 0, "NORMAL": 0}, straight
