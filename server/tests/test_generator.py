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
        assert all(n["lane"] != 0 for n in charts[(name, "7K+1S", "EASY")]["notes"])  # no scratch on EASY
        assert any(n["lane"] == 0 for n in charts[(name, "7K+1S", "HARD")]["notes"])
        assert all(len(charts[(name, "4K", d)]["meta"]["lanes"]) == 4 for d in ORDER)


def test_notes_follow_detected_sounds(charts: dict, analysis128: dict) -> None:
    onset_times = sorted(o["t"] for o in analysis128["onsets"])
    import bisect

    for d in ORDER:
        for n in charts[("128", "4K", d)]["notes"]:
            i = bisect.bisect_left(onset_times, n["t"])
            near = min(abs(onset_times[j] - n["t"]) for j in (i - 1, i) if 0 <= j < len(onset_times))
            assert near <= 40.0, f"{d}: note at {n['t']}ms has no sound nearby"


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
    def skills(style: str) -> dict:
        return generate_chart(analysis128, "7K+1S", "HARD", seed=42, overrides={"style": style})["meta"]["skillset"]

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
