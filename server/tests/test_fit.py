"""A chart's level is kept in its tier's range (rhythm_server/mapper/fit.py, docs/MAPPERATORINATOR.md
"난이도 구간에 맞추기"): made again at corrected stars, thinned when still too high, and the tier
absent for a song too calm for it. The stand-in worker (fakes.py) follows the stars for seed 21,
makes too many notes for 22 and too few for 23."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from rhythm_server.api.app import create_app
from rhythm_server.difficulty.estimator import effective_nps, lane_hands, level_for
from rhythm_server.mapper import fit


@pytest.fixture()
def fitting(tmp_path, monkeypatch):
    monkeypatch.setitem(fit.DEFAULTS, "enabled", True)
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        sid = c.post("/api/songs/demo", json={"bpm": 128, "bars": 28, "seed": 2}).json()["song"]["id"]
        yield c, sid


def test_the_window_is_the_tiers_range_and_the_aim_its_middle() -> None:
    assert [(w.lo, w.hi) for w in (fit.window_for(t, None) for t in ("EASY", "NORMAL", "HARD", "EXPERT", "ELITE"))] == [
        (1, 5), (6, 10), (11, 14), (15, 18), (19, 20)]
    assert fit.aim(fit.window_for("HARD", None), None) == 13.0 and fit.aim(fit.window_for("ELITE", None), None) == 20.0
    # a chart asked for at a level: the tier that level is in
    assert fit.window_for("EASY", 12) == fit.Window(11, 14) and fit.aim(fit.window_for("EASY", 12), 12) == 12.5


def test_the_next_stars_follow_the_tries() -> None:
    rule = dict(fit.DEFAULTS)
    # one try and no table: up by the given slope, at most maxStep
    assert fit.next_stars([(3.0, 10.0)], 13.0, rule) == pytest.approx(3.0 * (1.3 ** (1 / 0.9)), abs=0.01)
    assert fit.next_stars([(3.0, 4.0)], 13.0, rule) == 6.0
    assert fit.next_stars([(3.0, 20.0)], 8.5, rule) == 1.5
    # one try with the table: as far off the table at the goal as it was where it landed
    table = [[1.0, 1.0], [10.0, 2.0], [20.0, 4.0]]
    assert fit.next_stars([(2.0, 8.0)], 15.0, rule, table) == pytest.approx(3.75, abs=0.01)  # 8 where 10 was due: the table's stars for 15 / 0.8
        # two tries: their own slope (here 1.0: the rating follows the stars)
    assert fit.next_stars([(2.0, 8.0), (4.0, 16.0)], 12.0, rule) == pytest.approx(3.0, abs=0.01)
    # within the bounds
    assert fit.next_stars([(9.0, 10.0)], 20.0, rule) == 10.0 and fit.next_stars([(0.6, 9.0)], 3.5, rule) == 0.5


def test_thinning_takes_the_weakest_notes_out_until_the_level_is_in_range() -> None:
    hands = lane_hands("4K")
    notes = []
    for i in range(1200):  # sixteenths at 150 BPM for 120 s, a chord on every beat
        beat = i / 4
        notes.append({"t": 500 + beat * 400.0, "beat": beat, "lane": i % 4, "type": "tap"})
        if i % 4 == 0:
            notes.append({"t": 500 + beat * 400.0, "beat": beat, "lane": (i + 2) % 4, "type": "tap"})
    level_of = lambda ns: level_for(effective_nps(ns, hands)[0], "4K")[0]  # noqa: E731
    assert level_of(notes) > 14
    kept, removed = fit.thinned(notes, level_of, 14)
    assert level_of(kept) == 14 and removed == len(notes) - len(kept) > 0
    assert level_of(fit.thinned(notes, level_of, 14)[0]) == level_of(kept)  # the same every time
    gone = [n for n in notes if n not in kept]
    # the chords go first, then the sixteenths off the eighths; no note on a beat goes before them
    assert all(n["beat"] % 0.5 != 0 or n["beat"] % 1 == 0 for n in gone)
    assert not any(n["beat"] % 1 == 0 and n["lane"] == (int(n["beat"] * 4)) % 4 for n in gone)


def test_a_chart_outside_its_range_is_made_again_at_corrected_stars(fitting) -> None:
    c, sid = fitting
    r = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "HARD", "seed": 21})
    assert r.status_code == 200
    meta = r.json()["chart"]["meta"]
    assert 11 <= meta["level"] <= 14
    tries = meta["generator"]["fit"]["tries"]
    assert len(tries) >= 2 and tries[0]["level"] < 11 and tries[-1]["stars"] == meta["generator"]["stars"] > tries[0]["stars"]
    assert meta["generator"]["fit"]["window"] == [11, 14] and "thinned" not in meta["generator"]
    # the first try found the song's timing: the chart made again keeps it as the song's
    assert meta["generator"]["timing"] == "model" and c.get(f"/api/songs/{sid}").json()["song"]["bpm"] == 128.0


def test_one_still_too_high_is_thinned_into_range(fitting) -> None:
    c, sid = fitting
    meta = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "EASY", "seed": 22}).json()["chart"]["meta"]
    assert meta["level"] <= 5
    gen = meta["generator"]
    # every try too high, each at fewer stars, until the next would be the same chart or the last allowed
    tries = gen["fit"]["tries"]
    assert 2 <= len(tries) <= fit.DEFAULTS["attempts"] and all(t["level"] > 5 for t in tries)
    assert [t["stars"] for t in tries] == sorted((t["stars"] for t in tries), reverse=True)
    assert gen["thinned"]["removed"] > 0 and meta["noteCount"] == gen["thinned"]["notes"] - gen["thinned"]["removed"]


def test_a_song_too_calm_for_a_tier_has_none(fitting) -> None:
    c, sid = fitting
    req = {"keyMode": "4K", "difficulty": "ELITE", "seed": 23}
    r = c.post(f"/api/songs/{sid}/charts", json=req)
    assert r.status_code == 404 and "조용" in r.json()["detail"]
    # kept: asked again (whole or brief), it is not made again
    t = time.time()
    assert c.post(f"/api/songs/{sid}/charts", json=req).status_code == 404
    assert c.post(f"/api/songs/{sid}/charts", json={**req, "brief": True}).status_code == 404
    assert time.time() - t < 2.0


def test_a_songs_later_chart_starts_where_its_earlier_ones_landed(fitting) -> None:
    from rhythm_server.mapper import charts
    from rhythm_server.mapper.runtime import mapper_config

    c, sid = fitting
    first = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "HARD", "seed": 21}).json()["chart"]["meta"]
    assert len(first["generator"]["fit"]["tries"]) >= 2
    later = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "EXPERT", "seed": 21}).json()["chart"]["meta"]
    fit_info = later["generator"]["fit"]
    # the HARD tries told where this song lands: EXPERT is asked at more than the table's stars, and lands at once
    assert fit_info["prior"] >= 2 and len(fit_info["tries"]) == 1 and 15 <= later["level"] <= 18
    assert fit_info["tries"][0]["stars"] > charts.stars_of(17.0, mapper_config(), "4K")


def test_tries_on_both_sides_of_the_goal_are_interpolated_between() -> None:
    rule = dict(fit.DEFAULTS)
    table = [[1.0, 0.8], [13.0, 3.13], [21.0, 7.0]]
    # the runner's 4K HARD of one song: 3.0 stars gave 16, 2.46 gave 8; the next is between them
    nxt = fit.next_stars([(3.0, 16.0), (2.46, 8.0)], 13.0, rule, table)
    assert 2.46 < nxt < 3.0
    # more stars that came out lower (noise): halfway between
    assert fit.next_stars([(3.0, 8.0), (2.5, 16.0)], 13.0, rule, table) == pytest.approx((3.0 * 2.5) ** 0.5, abs=0.01)
