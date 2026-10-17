"""Difficulty systems modelled on DJMAX RESPECT V and EZ2ON REBOOT : R (config/difficulty.json)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.api.app import create_app
from rhythm_server.config import difficulty_config
from rhythm_server.generator import generate_chart
from rhythm_server.generator.lanes import lane_infos
from rhythm_server.generator.linter import lint
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.tempo import TempoMap
from rhythm_server.synth import make_song

SYSTEMS = difficulty_config()["systems"]


@pytest.fixture(scope="module")
def dense_song() -> dict:
    song = make_song(150.0, 56, seed=21, repeat_melody=True)
    return analyze(song.pcm, song.sample_rate, "sha256:systems-150", backends={})


def raw_nps(chart: dict, analysis: dict) -> float:
    return len(chart["notes"]) / (analysis["durationMs"] / 1000.0)


def test_tiers_aliases_and_level_scales() -> None:
    assert resolve_params("4K", "NM", system="DJMAX").difficulty == "NM"
    assert resolve_params("4K", "NORMAL", system="DJMAX").difficulty == "NM"
    assert resolve_params("4K", "EXPERT", system="DJMAX").difficulty == "MX"
    assert resolve_params("4K", "maximum", system="DJMAX").difficulty == "MX"
    assert resolve_params("4K", "EXPERT", system="EZ2ON").difficulty == "SHD"
    # a level outside the tier moves to a tier covering it; SC keeps its own scale
    assert resolve_params("4K", "NM", 14, system="DJMAX").difficulty == "MX"
    sc = resolve_params("4K", "SC", 3, system="DJMAX")
    assert sc.difficulty == "SC" and sc.level_scale == "SC" and sc.levels == (3, 3)
    ez = resolve_params("8K", "HD", 25, system="EZ2ON")
    assert ez.target_level == 20 and ez.difficulty == "SHD" and len(ez.level_table) == 20
    assert resolve_params("4K", "MX", system="DJMAX").public()["system"] == "DJMAX"
    assert "system" not in resolve_params("4K", "NORMAL").public()
    with pytest.raises(ValueError):
        resolve_params("4K", "NM", system="ITG")
    with pytest.raises(ValueError):
        resolve_params("4K", "XX", system="EZ2ON")
    assert resolve_params("4K", "SC", system="EZ2ON").difficulty == "SHD"  # the nearest EZ2ON tier
    # tiers sit higher and higher on their scale; character values run low -> high
    for system in ("DJMAX", "EZ2ON"):
        mids = [sum(SYSTEMS[system]["tiers"][t]["levels"]) / 2 for t in SYSTEMS[system]["order"] if "levelScale" not in SYSTEMS[system]["tiers"][t]]
        assert mids == sorted(mids)
    nm_low, nm_high = resolve_params("4K", "NM", 2, system="DJMAX"), resolve_params("4K", "NM", 8, system="DJMAX")
    assert nm_low.chord_ratio < nm_high.chord_ratio and nm_low.side_rate == 0.0 < nm_high.side_rate


def test_djmax_charts_match_the_published_density_at_their_level(dense_song: dict) -> None:
    counts = []
    for tier, level in (("NM", 4), ("HD", 8), ("MX", 12)):
        chart = generate_chart(dense_song, "4K", tier, level, system="DJMAX")
        m = chart["meta"]
        assert m["difficultySystem"] == "DJMAX" and m["difficulty"] == tier
        assert abs(m["level"] - level) <= 1
        reference = SYSTEMS["DJMAX"]["levelRawNps"]["4B"][level - 1]
        assert 0.7 * reference <= raw_nps(chart, dense_song) <= 1.3 * reference, (tier, level, raw_nps(chart, dense_song), reference)
        assert not lint(chart["notes"], lane_infos("4K"), resolve_params("4K", tier, level, system="DJMAX"), TempoMap(chart["timing"]))
        counts.append(m["noteCount"])
    assert counts == sorted(counts)


def test_sc_charts_use_their_own_scale(dense_song: dict) -> None:
    chart = generate_chart(dense_song, "6K", "SC", 7, system="DJMAX")
    m = chart["meta"]
    assert m["levelScale"] == "SC" and abs(m["level"] - 7) <= 1
    mx = generate_chart(dense_song, "6K", "MX", 11, system="DJMAX")
    # SC levels start around normal level 10-11: SC 7 (6B ≈ 9.0 NPS) is denser than MX 11 (≈ 6.4)
    assert m["noteCount"] > 1.2 * mx["meta"]["noteCount"]


def test_djmax_side_notes_are_long_notes(dense_song: dict) -> None:
    chart = generate_chart(dense_song, "6K+FX", "MX", 13, system="DJMAX")
    side = [i for i, lane in enumerate(lane_infos("6K+FX")) if lane.kind == "side"]
    side_notes = [n for n in chart["notes"] if n["lane"] in side]
    assert side_notes and all(n["type"] == "hold" for n in side_notes)


def test_normal_follows_the_melody_and_maximum_every_instrument(dense_song: dict) -> None:
    def melody_share(chart: dict) -> float:
        tagged = [n for n in chart["notes"] if "src" in n]
        return sum(1 for n in tagged if n["src"] in ("vocals", "other")) / max(1, len(tagged))

    nm = generate_chart(dense_song, "4K", "NM", 6, system="DJMAX")
    mx = generate_chart(dense_song, "4K", "MX", 11, system="DJMAX")
    assert melody_share(nm) > melody_share(mx)


def test_ez2on_levels_go_up_to_twenty(dense_song: dict) -> None:
    chart = generate_chart(dense_song, "4K", "HD", 13, system="EZ2ON")
    m = chart["meta"]
    assert m["difficultySystem"] == "EZ2ON" and m["difficulty"] == "HD" and abs(m["level"] - 13) <= 1
    reference = SYSTEMS["EZ2ON"]["levelRawNps"]["4K"][12]
    assert 0.7 * reference <= raw_nps(chart, dense_song) <= 1.3 * reference


def test_api_systems_and_edited_charts(tmp_path) -> None:
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        sid = c.post("/api/songs/demo", json={"bpm": 140, "bars": 16, "seed": 3}).json()["song"]["id"]
        dj = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "NM", "system": "DJMAX"}).json()["chart"]
        ez = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "NM", "system": "EZ2ON"}).json()["chart"]
        assert dj["meta"]["difficultySystem"] == "DJMAX" and ez["meta"]["difficultySystem"] == "EZ2ON"
        assert dj["meta"]["chartId"] != ez["meta"]["chartId"]
        assert c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "NM", "system": "PUMP"}).status_code == 400
        # EZ2ON levels go past 15; other systems clamp a high target to their own top level
        shd = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "SHD", "system": "EZ2ON", "targetLevel": 18})
        assert shd.status_code == 200 and shd.json()["chart"]["meta"]["generator"]["params"]["targetLevel"] == 18
        grg = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "HARD", "targetLevel": 18})
        assert grg.status_code == 200 and grg.json()["chart"]["meta"]["generator"]["params"]["targetLevel"] == 15
        assert c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "SHD", "system": "EZ2ON", "targetLevel": 21}).status_code == 422
        edited = c.post(
            f"/api/songs/{sid}/charts/custom",
            json={"baseChartId": dj["meta"]["chartId"], "notes": dj["notes"][:-1], "name": "edit"},
        ).json()["chart"]
        assert edited["meta"]["difficultySystem"] == "DJMAX" and edited["meta"]["difficulty"] == "NM"
        assert "DJMAX" in c.get("/api/health").json()["difficultySystems"]
