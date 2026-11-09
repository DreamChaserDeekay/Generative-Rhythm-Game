"""Mapperatorinator as the chart generator (docs/MAPPERATORINATOR.md): the request a chart makes,
the .osu it gives back as one of our charts, and the server's flow with a stand-in worker (the real
model needs its own Python and a GPU; it is not run here)."""

from __future__ import annotations

import hashlib
import io
import json
import sys
import textwrap
import threading
import time
import zipfile
from functools import lru_cache
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.api.app import create_app
from rhythm_server.formats.osu import parse_osu
from rhythm_server.generator.tempo import TempoMap
from rhythm_server.mapper import Mapper, charts, runtime as rt
from rhythm_server.mapper.runtime import Runtime, mapper_config
from rhythm_server.synth import make_structured_song


@lru_cache(maxsize=None)
def _analysis() -> dict:
    s = make_structured_song(bpm=128.0, seed=2)
    return analyze(s.pcm, s.sample_rate, "sha256:mapper", backends={})


def _osu(keys: int, objects: list[str]) -> str:
    return "\n".join(["osu file format v14", "[General]", "Mode: 3", "[Difficulty]", f"CircleSize:{keys}", "[TimingPoints]",
                      "100,500,4,1,0,60,1,0", "[HitObjects]", *objects, ""])


def _x(column: int, keys: int) -> int:
    return int((column + 0.5) * 512 / keys)


def test_the_song_timing_goes_to_mapperatorinator_as_red_lines() -> None:
    timing = {"offsetMs": 250.0, "tempoMap": [{"beat": 0, "bpm": 120.0}, {"beat": 16, "bpm": 150.0}],
              "meter": [{"measure": 0, "beatsPerMeasure": 4}, {"measure": 4, "beatsPerMeasure": 3}]}
    text = charts.timing_osu(timing, 8, "song.wav", "Title", "Artist")
    parsed = parse_osu(text)
    assert parsed.key_mode == "8K" and parsed.notes == []
    back = TempoMap(parsed.timing)
    ours = TempoMap(timing)
    for beat in (0.0, 8.0, 16.0, 20.0, 30.0):
        assert abs(back.beat_to_ms(beat) - ours.beat_to_ms(beat)) < 0.01
    assert [p["bpm"] for p in parsed.timing["tempoMap"]] == [120.0, 150.0]
    assert "Mode: 3" in text and "CircleSize:8" in text


def test_columns_are_the_lanes_but_fx_and_7k1s_takes_the_first_as_scratch() -> None:
    assert charts.columns("7K+1S") == list(range(8))  # column 0 is the scratch lane
    assert charts.columns("6K+FX") == [1, 2, 3, 4, 5, 6]  # FX lanes stay empty
    assert charts.columns("4K") == [0, 1, 2, 3]
    objects = [f"{_x(c, 8)},192,{1000 + 200 * c},1,0,0:0:0:0:" for c in range(8)]
    objects.append(f"{_x(3, 8)},192,3000,128,0,3600:0:0:0:0:")
    objects.append(f"{_x(5, 8)},192,4000,128,0,4030:0:0:0:0:")  # a 30 ms hold is a tap
    notes = charts.notes_from_osu(_osu(8, objects), charts.columns("7K+1S"))
    assert [n["lane"] for n in notes[:8]] == list(range(8))
    holds = [n for n in notes if n["type"] == "hold"]
    assert len(holds) == 1 and holds[0]["lane"] == 3 and holds[0]["endT"] == 3600
    six = charts.notes_from_osu(_osu(6, [f"{_x(c, 6)},192,{1000 + 100 * c},1,0,0:0:0:0:" for c in range(6)]), charts.columns("6K+FX"))
    assert sorted(n["lane"] for n in six) == [1, 2, 3, 4, 5, 6]


def test_tiers_aim_at_the_middle_of_their_levels_in_stars() -> None:
    table = mapper_config()["starsForLevel"]
    levels = [charts.target_level("6K", t, None) for t in ("NORMAL", "HARD", "EXPERT", "ELITE", "MASTER")]
    assert levels == sorted(levels) and levels[0] < levels[-1]
    stars = [charts.stars_for(lv, table) for lv in levels]
    assert stars == sorted(stars) and 0.5 < stars[0] < stars[-1] <= 8.0
    assert charts.target_level("6K", "HARD", 9) == 9


def _onset_osu(analysis: dict, keys: int) -> str:
    """An .osu with a note on each of the song's first onsets, columns in turn, and a hold."""
    objects = []
    for i, o in enumerate([o for o in analysis["onsets"] if o["t"] > analysis["timing"]["offsetMs"]][:60]):
        objects.append(f"{_x(i % keys, keys)},192,{int(round(o['t']))},1,0,0:0:0:0:")
    t0 = int(analysis["timing"]["offsetMs"]) + 20000
    objects.append(f"{_x(0, keys)},192,{t0},128,0,{t0 + 900}:0:0:0:0:")
    return _osu(keys, objects)


def test_the_osu_it_makes_becomes_a_chart_rated_by_our_estimate() -> None:
    a = _analysis()
    cfg = dict(mapper_config())
    level, seed = 12, 1234
    cid = charts.chart_id(a, "7K+1S", "EXPERT", level, seed, cfg)
    chart = charts.make_chart(a, "7K+1S", "EXPERT", level, seed, cid, cfg, {"songId": None, "title": "T"}, _onset_osu(a, 8), {"seconds": 3.0, "device": "cuda"})
    meta = chart["meta"]
    assert meta["chartId"] == cid and meta["keyMode"] == "7K+1S" and meta["noteCount"] == len(chart["notes"]) == 61
    assert meta["generator"]["name"] == "mapperatorinator" and meta["generator"]["keycount"] == 8 and meta["generator"]["timing"] == "app"
    assert 1 <= meta["level"] <= 20 and meta["generator"]["stars"] == charts.stars_for(level, cfg["starsForLevel"])
    assert {n["lane"] for n in chart["notes"]} == set(range(8))
    assert chart["timing"] == a["timing"] and all("beat" in n for n in chart["notes"])
    assert sum(1 for n in chart["notes"] if n.get("src")) > 40  # notes on onsets follow their stems
    assert charts.chart_id(a, "7K+1S", "EXPERT", level, seed + 1, cfg) != cid


def test_uv_comes_from_its_wheel_checked(tmp_path) -> None:
    name = "uv.exe" if sys.platform == "win32" else "uv"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(f"uv-9.9.data/scripts/{name}", b"#!/bin/sh\necho uv\n")
    wheel = tmp_path / "uv.whl"
    wheel.write_bytes(buf.getvalue())
    r = Runtime(tmp_path / "home")
    key = "win32" if sys.platform == "win32" else "linux"
    r._fetch_uv({"wheels": {key: {"url": wheel.as_uri(), "sha256": hashlib.sha256(buf.getvalue()).hexdigest()}}})
    assert r.uv.read_bytes().startswith(b"#!/bin/sh")
    with pytest.raises(ValueError, match="sha256"):
        Runtime(tmp_path / "other")._fetch_uv({"wheels": {key: {"url": wheel.as_uri(), "sha256": "0" * 64}}})


def test_without_an_nvidia_gpu_mapperatorinator_is_not_offered(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(rt, "nvidia_gpus", lambda: [])
    r = Runtime(tmp_path)
    assert r.status()["state"] == "unsupported" and "NVIDIA" in r.status()["reason"]
    monkeypatch.setattr(rt, "nvidia_gpus", lambda: [{"name": "NVIDIA GeForce RTX 2060", "memoryMB": 6144}])
    r = Runtime(tmp_path)
    assert r.status()["state"] == "missing" and not r.ready()


# a stand-in for worker.py: answers each request with an .osu of notes on the timing's beats
FAKE_WORKER = textwrap.dedent('''
    import json, sys
    from pathlib import Path
    for line in sys.stdin:
        req = json.loads(line)
        if req.get("seed") == 13:
            print(json.dumps({"id": req["id"], "ok": False, "error": "CUDA out of memory"}), flush=True)
            continue
        text = Path(req["beatmap"]).read_text(encoding="utf-8")
        red = [l for l in text.split("[TimingPoints]")[1].splitlines() if l.strip() and not l.startswith("[")][0].split(",")
        t0, beat = float(red[0]), float(red[1])
        keys = int(req["keycount"])
        objs = [f"{int((i % keys + 0.5) * 512 / keys)},192,{int(round(t0 + i * beat))},1,0,0:0:0:0:" for i in range(48)]
        out = Path(req["out"]) / "beatmap.osu"
        head = "osu file format v14\\n[General]\\nMode: 3\\n[Difficulty]\\nCircleSize:%d\\n[HitObjects]\\n" % keys
        out.write_text(head + "\\n".join(objs) + "\\n", encoding="utf-8")
        print(json.dumps({"id": req["id"], "ok": True, "osu": str(out), "seconds": 0.1, "device": "cuda", "precision": "fp32"}), flush=True)
''')


class FakeRuntime(Runtime):
    @property
    def venv_python(self) -> Path:
        return Path(sys.executable)


@pytest.fixture()
def mapped(tmp_path, monkeypatch):
    home = tmp_path / "mapper"
    (home / "src").mkdir(parents=True)
    (home / "state.json").write_text(json.dumps({"tag": rt.RUNTIME_TAG, "device": "cuda"}), encoding="utf-8")
    script = tmp_path / "fake_worker.py"
    script.write_text(FAKE_WORKER, encoding="utf-8")
    monkeypatch.setattr("rhythm_server.mapper.service.worker_script", lambda: script)
    mapper = Mapper(FakeRuntime(home))
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True, mapper=mapper)
    with TestClient(app) as c:
        yield c


def test_charts_come_from_mapperatorinator_once_its_runtime_is_set_up(mapped: TestClient) -> None:
    health = mapped.get("/api/health").json()
    assert health["mapper"]["state"] == "ready" and "+mapper-" in health["generator"]
    song = mapped.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]
    sid = song["id"]
    brief = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "7K+1S", "difficulty": "EXPERT", "brief": True}).json()["meta"]
    assert brief["predicted"] is True and brief["noteCount"] == 0 and brief["level"] == charts.target_level("7K+1S", "EXPERT", None)
    made = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "7K+1S", "difficulty": "EXPERT"}).json()
    chart = made["chart"]
    assert made["cached"] is False and chart["meta"]["chartId"] == brief["chartId"]
    assert chart["meta"]["generator"]["name"] == "mapperatorinator" and chart["meta"]["noteCount"] == 48
    assert {n["lane"] for n in chart["notes"]} == set(range(8))
    again = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "7K+1S", "difficulty": "EXPERT"}).json()
    assert again["cached"] is True and again["chart"]["meta"]["chartId"] == chart["meta"]["chartId"]
    brief2 = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "7K+1S", "difficulty": "EXPERT", "brief": True}).json()["meta"]
    assert "predicted" not in brief2 and brief2["noteCount"] == 48  # the made chart's own meta now
    # the other tiers of the key mode follow in the background, one at a time, and are saved
    others = [t for t in ("NORMAL", "HARD", "ELITE", "MASTER")]
    deadline = time.time() + 30
    made: dict[str, dict] = {}
    while time.time() < deadline and len(made) < len(others):
        for tier in others:
            m = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "7K+1S", "difficulty": tier, "brief": True}).json()["meta"]
            if m.get("predicted"):
                assert m["queued"] or m["making"]  # waiting its turn, or being made
            else:
                made[tier] = m
        time.sleep(0.2)
    assert set(made) == set(others) and all(m["generator"]["name"] == "mapperatorinator" for m in made.values())
    assert mapped.get(f"/api/charts/{made['ELITE']['chartId']}").status_code == 200


def test_a_failed_mapperatorinator_chart_comes_from_our_generator_with_a_notice(mapped: TestClient) -> None:
    sid = mapped.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]["id"]
    made = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "6K", "difficulty": "HARD", "seed": 13}).json()
    assert "CUDA out of memory" in made["notice"]
    assert made["chart"]["meta"]["generator"].get("name") != "mapperatorinator" and made["chart"]["notes"]


def test_the_feel_report_measures_the_saved_mapperatorinator_charts(mapped: TestClient, tmp_path) -> None:
    import importlib.util

    spec = importlib.util.spec_from_file_location("feel_report", Path(__file__).parents[1] / "scripts" / "feel_report.py")
    fr = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fr)
    sid = mapped.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]["id"]
    mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "6K", "difficulty": "ELITE"})
    root = Path(mapped.app.state.library.root)
    song = {"id": sid, "title": "demo", "artist": "", "path": str(root / "songs" / sid / "analysis.json"), "library": str(root)}
    rec = fr.job(song, [("6K", "ELITE"), ("6K", "HARD")], [], "mapperatorinator")
    assert rec["generator"] == "mapperatorinator" and rec["charts"]["6K:ELITE"]["hits"] > 0
    assert "open it in the app first" in rec["charts"]["6K:HARD"]["error"]


def test_the_queue_makes_the_opened_chart_first_then_the_background_ones() -> None:
    from rhythm_server.mapper.queue import BACKGROUND, OPENED, MapperQueue

    gate = threading.Event()
    order: list[str] = []

    def run(name: str) -> dict:
        if name == "first":
            gate.wait(5)
        order.append(name)
        return {"name": name}

    q = MapperQueue(run)
    first, _ = q.submit("first", OPENED, ("first",))
    deadline = time.time() + 5
    while q.state("first") != "making" and time.time() < deadline:
        time.sleep(0.01)
    bg1, _ = q.submit("bg1", BACKGROUND, ("bg1",))
    bg2, _ = q.submit("bg2", BACKGROUND, ("bg2",))
    again, new = q.submit("bg2", OPENED, ("bg2",))  # opened while it waited: it moves up, same job
    assert again is bg2 and not new and q.state("bg1") == "queued"
    gate.set()
    assert first.result(5)["name"] == "first" and bg1.result(5) and bg2.result(5)
    assert order == ["first", "bg2", "bg1"]
    q.close()
