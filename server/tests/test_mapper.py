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
from rhythm_server.chart.tempo import TempoMap
from rhythm_server.mapper import Mapper, charts, runtime as rt
from rhythm_server.mapper.runtime import Runtime, mapper_config
from rhythm_server.synth import make_structured_song

from fakes import onset_osu, osu, x_of


@lru_cache(maxsize=None)
def _analysis() -> dict:
    s = make_structured_song(bpm=128.0, seed=2)
    return analyze(s.pcm, s.sample_rate, "sha256:mapper", backends={})


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
    objects = [f"{x_of(c, 8)},192,{1000 + 200 * c},1,0,0:0:0:0:" for c in range(8)]
    objects.append(f"{x_of(3, 8)},192,3000,128,0,3600:0:0:0:0:")
    objects.append(f"{x_of(5, 8)},192,4000,128,0,4030:0:0:0:0:")  # a 30 ms hold is a tap
    notes = charts.notes_from_osu(osu(8, objects), charts.columns("7K+1S"))
    assert [n["lane"] for n in notes[:8]] == list(range(8))
    holds = [n for n in notes if n["type"] == "hold"]
    assert len(holds) == 1 and holds[0]["lane"] == 3 and holds[0]["endT"] == 3600
    six = charts.notes_from_osu(osu(6, [f"{x_of(c, 6)},192,{1000 + 100 * c},1,0,0:0:0:0:" for c in range(6)]), charts.columns("6K+FX"))
    assert sorted(n["lane"] for n in six) == [1, 2, 3, 4, 5, 6]


def test_tiers_aim_at_the_middle_of_their_levels_in_stars() -> None:
    table = mapper_config()["starsForLevel"]
    levels = [charts.target_level("6K", t, None) for t in ("NORMAL", "HARD", "EXPERT", "ELITE", "MASTER")]
    assert levels == sorted(levels) and levels[0] < levels[-1]
    stars = [charts.stars_for(lv, table) for lv in levels]
    assert stars == sorted(stars) and 0.5 < stars[0] < stars[-1] <= 8.0
    assert charts.target_level("6K", "HARD", 9) == 9


def test_the_osu_it_makes_becomes_a_chart_rated_by_our_estimate() -> None:
    a = _analysis()
    cfg = dict(mapper_config())
    level, seed = 12, 1234
    cid = charts.chart_id(a, "7K+1S", "EXPERT", level, seed, cfg)
    chart = charts.make_chart(a, "7K+1S", "EXPERT", level, seed, cid, cfg, {"songId": None, "title": "T"}, onset_osu(a, 8), {"seconds": 3.0, "device": "cuda"})
    meta = chart["meta"]
    assert meta["chartId"] == cid and meta["keyMode"] == "7K+1S" and meta["noteCount"] == len(chart["notes"]) == 61
    assert meta["generator"]["name"] == "mapperatorinator" and meta["generator"]["keycount"] == 8 and meta["generator"]["timing"] == "model"
    assert 1 <= meta["level"] <= 20 and meta["generator"]["stars"] == charts.stars_for(level, cfg["starsForLevel"])
    assert {n["lane"] for n in chart["notes"]} == set(range(8))
    # the timing is the .osu's own (the model's), and the analysed sections sit on its beats
    assert chart["timing"] == parse_osu(onset_osu(a, 8)).timing and all("beat" in n for n in chart["notes"])
    tempo = TempoMap(chart["timing"])
    kept = [s for s in a["sections"] if s["endT"] > chart["timing"]["offsetMs"]]
    assert len(chart["sections"]) == len(kept) and all(abs(tempo.beat_to_ms(c["startBeat"]) - s["t"]) < 1.0 for c, s in zip(chart["sections"], kept))
    # given the song's timing (a later tier), the chart carries exactly that
    given = {"offsetMs": 250.0, "tempoMap": [{"beat": 0, "bpm": 100.0}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]}
    later = charts.make_chart(a, "7K+1S", "EXPERT", level, seed, cid, cfg, {"songId": None, "title": "T"}, onset_osu(a, 8), {"seconds": 3.0}, None, given)
    assert later["timing"] == given and later["meta"]["generator"]["timing"] == "song"
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
    monkeypatch.undo()  # the real runtime's paths, not the stand-in's
    monkeypatch.setattr(rt, "nvidia_gpus", lambda: [])
    r = Runtime(tmp_path)
    assert r.status()["state"] == "unsupported" and "NVIDIA" in r.status()["reason"]
    monkeypatch.setattr(rt, "nvidia_gpus", lambda: [{"name": "NVIDIA GeForce RTX 2060", "memoryMB": 6144}])
    r = Runtime(tmp_path)
    assert r.status()["state"] == "missing" and not r.ready()


@pytest.fixture()
def mapped(tmp_path):
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        yield c


def test_charts_come_from_mapperatorinator_once_its_runtime_is_set_up(mapped: TestClient) -> None:
    health = mapped.get("/api/health").json()
    assert health["mapper"]["state"] == "ready" and "+mapper-" in health["generator"]
    assert mapped.get("/api/songs").json()["songs"] == []
    song = mapped.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]
    sid = song["id"]
    assert song["bpm"] is None  # no beat analysis: the BPM comes with the song's first chart
    brief = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "7K+1S", "difficulty": "EXPERT", "brief": True}).json()["meta"]
    assert brief["predicted"] is True and brief["noteCount"] == 0 and brief["level"] == charts.target_level("7K+1S", "EXPERT", None)
    made = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "7K+1S", "difficulty": "EXPERT"}).json()
    chart = made["chart"]
    assert made["cached"] is False and chart["meta"]["chartId"] == brief["chartId"]
    assert chart["meta"]["generator"]["name"] == "mapperatorinator" and chart["meta"]["noteCount"] == 48
    assert {n["lane"] for n in chart["notes"]} == set(range(8))
    # the song's first chart: the model found the timing, the song keeps it and shows its BPM
    assert chart["meta"]["generator"]["timing"] == "model" and chart["timing"]["tempoMap"] == [{"beat": 0, "bpm": 128.0}]
    listed = mapped.get(f"/api/songs/{sid}").json()["song"]
    assert (listed["bpm"], listed["bpmMin"], listed["bpmMax"]) == (128.0, 128.0, 128.0)
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
    # every other tier was made on the song's timing: the same beats and bar lines, no timing pass
    for tier in others:
        other = mapped.get(f"/api/charts/{made[tier]['chartId']}").json()["chart"]
        assert other["timing"] == chart["timing"] and other["meta"]["generator"]["timing"] == "song"


def test_a_chart_it_cannot_make_is_an_error_to_try_again_on(mapped: TestClient, fake_mapper_runtime, monkeypatch) -> None:
    sid = mapped.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]["id"]
    req = {"keyMode": "6K", "difficulty": "HARD", "seed": 13}
    failed = mapped.post(f"/api/songs/{sid}/charts", json=req)
    assert failed.status_code == 502 and "CUDA out of memory" in failed.json()["detail"] and "다시 시도" in failed.json()["detail"]
    assert "CUDA out of memory" in mapped.get("/api/mapper").json()["lastError"]["error"]
    # nothing was saved, and the same request is simply made again
    assert mapped.post(f"/api/songs/{sid}/charts", json=req).status_code == 502
    assert mapped.post(f"/api/songs/{sid}/charts", json={**req, "seed": 14}).status_code == 200
    # before the runtime is set up there is no chart either: an error that says what to do
    (fake_mapper_runtime / "state.json").unlink()
    missing = mapped.post(f"/api/songs/{sid}/charts", json={**req, "seed": 15})
    assert missing.status_code == 503 and "설치" in missing.json()["detail"]
    # the song select's brief still answers (the level the tier aims at)
    brief = mapped.post(f"/api/songs/{sid}/charts", json={**req, "seed": 15, "brief": True})
    assert brief.status_code == 200 and brief.json()["meta"]["predicted"] is True
    # and without an NVIDIA GPU: the error says so
    monkeypatch.setattr(rt, "nvidia_gpus", lambda: [])
    mapped.app.state.mapper.runtime._gpus = None
    no_gpu = mapped.post(f"/api/songs/{sid}/charts", json={**req, "seed": 15})
    assert no_gpu.status_code == 503 and "NVIDIA" in no_gpu.json()["detail"]


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


def test_the_settings_screen_settings_are_kept_and_make_other_charts(mapped: TestClient) -> None:
    before = mapped.get("/api/mapper").json()
    assert before["settings"]["starsScale"] == 1.0 and before["settings"]["model"] == "v32"
    tag = mapped.get("/api/health").json()["generator"]
    sid = mapped.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]["id"]
    req = {"keyMode": "6K", "difficulty": "EXPERT", "brief": True}
    old = mapped.post(f"/api/songs/{sid}/charts", json=req).json()["meta"]
    r = mapped.put("/api/mapper/settings", json={"starsScale": 1.25, "holdNoteRatio": 0.3, "precision": "fp16"})
    assert r.status_code == 200 and r.json()["settings"] == {**before["settings"], "starsScale": 1.25, "holdNoteRatio": 0.3, "precision": "fp16"}
    assert json.loads(rt.settings_path().read_text(encoding="utf-8"))["starsScale"] == 1.25  # kept in the runtime folder
    new = mapped.post(f"/api/songs/{sid}/charts", json=req).json()["meta"]
    assert new["chartId"] != old["chartId"] and new["generator"]["stars"] == round(old["generator"]["stars"] * 1.25, 2)
    assert mapped.get("/api/health").json()["generator"] != tag  # the song select drops its old briefs
    for bad in ({"model": "v99"}, {"starsScale": 9}, {"nope": 1}, {"lookback": 0.6, "lookahead": 0.4}):
        assert mapped.put("/api/mapper/settings", json=bad).status_code == 400
    # settings of earlier builds (the old generator's switch, the app's beats) are taken and ignored
    retired = mapped.put("/api/mapper/settings", json={"enabled": False, "useAppTiming": True})
    assert retired.status_code == 200 and (retired.json()["settings"]["enabled"], retired.json()["settings"]["useAppTiming"]) == (True, False)
    assert "enabled" not in json.loads(rt.settings_path().read_text(encoding="utf-8")) and mapped.get("/api/mapper").json()["state"] == "ready"
    assert mapped.put("/api/mapper/settings", json={"holdNoteRatio": None}).json()["settings"]["holdNoteRatio"] is None
    # the speed settings reach the worker's request and make other charts
    s = mapped.put("/api/mapper/settings", json={"hitsounds": False, "lookback": 0.4, "lookahead": 0.2, "parallel": True}).json()["settings"]
    assert (s["hitsounds"], s["lookback"], s["lookahead"], s["parallel"]) == (False, 0.4, 0.2, True)
    faster = mapped.post(f"/api/songs/{sid}/charts", json=req).json()["meta"]
    assert faster["chartId"] not in (old["chartId"], new["chartId"])
    cfg = mapped.app.state.mapper.config()
    request = charts.request_for("6K", 10, 1, cfg, Path("a.wav"), Path("out"), None, {})
    assert (request["hitsounds"], request["lookback"], request["lookahead"], request["parallel"]) == (False, 0.4, 0.2, True)


def test_fp16_encoder_stand_in_routes_the_encoder_precompute(monkeypatch):
    """worker.encoder_fp32 (fp16 models: the encoder side in fp32) runs only in Mapperatorinator's
    Python; what can be checked here is its plumbing: the stand-in exposes every name osuT5's
    server.precompute_encoder_outputs reads of a model, and the patched precompute routes a fp16
    model through its stand-in (hidden states cast to fp16) and other models through untouched."""
    import types

    from rhythm_server.mapper import worker

    class Tensor:
        def __init__(self, tag):
            self.tag = tag

        def to(self, dtype):
            return Tensor((self.tag, dtype))

    class Module:
        def float(self):
            return self

        def eval(self):
            return self

    model = types.SimpleNamespace(
        device="cuda:0", spectrogram="mel", num_classes=7, do_style_embed=True, do_difficulty_embed=True, do_mapper_embed=False,
        do_song_position_embed=True, project_encoder_input=True,
    )
    encoder32 = Module()
    parts = {name: Module() for name in ("style_embedder", "difficulty_embedder", "song_pos_embedder", "encoder_embedder")}
    shadow = worker.encoder_shadow(model, encoder32, parts, "fp32")
    read_by_precompute = (
        "device", "eval", "spectrogram", "num_classes", "do_style_embed", "do_difficulty_embed", "do_mapper_embed",
        "do_song_position_embed", "project_encoder_input", "style_embedder", "difficulty_embedder", "song_pos_embedder", "encoder_embedder",
    )
    assert all(hasattr(shadow, name) for name in read_by_precompute)
    assert shadow.transformer.dtype == "fp32" and shadow.transformer.model.encoder is encoder32
    assert shadow.style_embedder is parts["style_embedder"] and shadow.eval() is None

    calls = []

    def original(m, frames, cond_kwargs, song_positions=None, batch_size=16):
        calls.append((m, frames, song_positions, batch_size))
        return Tensor("hidden")

    server = types.SimpleNamespace(precompute_encoder_outputs=original)
    processor = types.SimpleNamespace(precompute_encoder_outputs=original)
    monkeypatch.setattr(worker, "_PRECOMPUTE_PATCHED", False)
    monkeypatch.setattr(worker, "_ENCODERS32", {id(model): shadow})
    worker._patch_precompute(server, processor, "fp16")
    assert processor.precompute_encoder_outputs is server.precompute_encoder_outputs is not original
    other = object()
    assert processor.precompute_encoder_outputs(model, "frames", {}, "positions", batch_size=4).tag == ("hidden", "fp16")
    assert server.precompute_encoder_outputs(other, "frames", {}).tag == "hidden"
    assert calls == [(shadow, "frames", "positions", 4), (other, "frames", None, 16)]
    # patched once: a second call keeps the first wrapper
    worker._patch_precompute(server, processor, "fp16")
    assert len(calls) == 2 and processor.precompute_encoder_outputs(other, "f", {}).tag == "hidden"
