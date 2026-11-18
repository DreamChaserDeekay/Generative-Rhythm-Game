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

from fakes import heard_song, onset_osu, osu, x_of


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


def test_columns_are_the_lanes_but_fx() -> None:
    assert charts.columns("8K") == list(range(8))
    assert charts.columns("6K+FX") == [1, 2, 3, 4, 5, 6]  # the model has no FX lanes: fx.py fills them
    assert charts.columns("4K") == [0, 1, 2, 3]
    objects = [f"{x_of(c, 8)},192,{1000 + 200 * c},1,0,0:0:0:0:" for c in range(8)]
    objects.append(f"{x_of(3, 8)},192,3000,128,0,3600:0:0:0:0:")
    objects.append(f"{x_of(5, 8)},192,4000,128,0,4030:0:0:0:0:")  # a 30 ms hold is a tap
    notes = charts.notes_from_osu(osu(8, objects), charts.columns("8K"))
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
    cid = charts.chart_id(a, "8K", "EXPERT", level, seed, cfg)
    chart = charts.make_chart(a, "8K", "EXPERT", level, seed, cid, cfg, {"songId": None, "title": "T"}, onset_osu(a, 8), {"seconds": 3.0, "device": "cuda"})
    meta = chart["meta"]
    assert meta["chartId"] == cid and meta["keyMode"] == "8K" and meta["noteCount"] == len(chart["notes"]) == 61
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
    later = charts.make_chart(a, "8K", "EXPERT", level, seed, cid, cfg, {"songId": None, "title": "T"}, onset_osu(a, 8), {"seconds": 3.0}, None, given)
    assert later["timing"] == given and later["meta"]["generator"]["timing"] == "song"
    assert sum(1 for n in chart["notes"] if n.get("src")) > 40  # notes on onsets follow their stems
    assert charts.chart_id(a, "8K", "EXPERT", level, seed + 1, cfg) != cid


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
    brief = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "8K", "difficulty": "EXPERT", "brief": True}).json()["meta"]
    assert brief["predicted"] is True and brief["noteCount"] == 0 and brief["level"] == charts.target_level("8K", "EXPERT", None)
    made = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "8K", "difficulty": "EXPERT"}).json()
    chart = made["chart"]
    assert made["cached"] is False and chart["meta"]["chartId"] == brief["chartId"]
    assert chart["meta"]["generator"]["name"] == "mapperatorinator" and chart["meta"]["noteCount"] == 48
    assert {n["lane"] for n in chart["notes"]} == set(range(8))
    # the song's first chart: the model found the timing, the song keeps it and shows its BPM
    assert chart["meta"]["generator"]["timing"] == "model" and chart["timing"]["tempoMap"] == [{"beat": 0, "bpm": 128.0}]
    listed = mapped.get(f"/api/songs/{sid}").json()["song"]
    assert (listed["bpm"], listed["bpmMin"], listed["bpmMax"]) == (128.0, 128.0, 128.0)
    again = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "8K", "difficulty": "EXPERT"}).json()
    assert again["cached"] is True and again["chart"]["meta"]["chartId"] == chart["meta"]["chartId"]
    brief2 = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "8K", "difficulty": "EXPERT", "brief": True}).json()["meta"]
    assert "predicted" not in brief2 and brief2["noteCount"] == 48  # the made chart's own meta now
    # the other tiers of the key mode follow in the background, one at a time, and are saved
    others = [t for t in ("NORMAL", "HARD", "ELITE", "MASTER")]
    deadline = time.time() + 30
    made: dict[str, dict] = {}
    while time.time() < deadline and len(made) < len(others):
        for tier in others:
            m = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "8K", "difficulty": tier, "brief": True}).json()["meta"]
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


def _wait_for(done, seconds: float = 5) -> None:
    deadline = time.time() + seconds
    while not done() and time.time() < deadline:
        time.sleep(0.01)


def test_the_queue_says_what_it_is_making_and_how_many_wait() -> None:
    from rhythm_server.mapper.queue import BACKGROUND, OPENED, MapperQueue

    idle = {"making": None, "waiting": 0}
    gate = threading.Event()
    q = MapperQueue(lambda name: gate.wait(5) and {"name": name})
    assert q.snapshot() == idle
    first, _ = q.submit("first", OPENED, ("first",))
    _wait_for(lambda: q.state("first") == "making")
    q.submit("bg1", BACKGROUND, ("bg1",))
    last, _ = q.submit("bg2", BACKGROUND, ("bg2",))
    assert q.snapshot() == {"making": "first", "waiting": 2}
    gate.set()
    assert first.result(5) and last.result(5)
    _wait_for(lambda: q.snapshot() == idle)
    assert q.snapshot() == idle
    q.close()


def test_the_server_tells_what_chart_is_being_made_and_whether_the_model_is_loaded(mapped: TestClient) -> None:
    # before the first chart: nothing made, and no worker holding the model
    assert mapped.get("/api/mapper/queue").json() == {"making": None, "waiting": 0, "loaded": False}
    sid = mapped.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]["id"]
    assert mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "8K", "difficulty": "EXPERT"}).status_code == 200
    # the other four tiers follow in the background: named here until the last is made
    seen = mapped.get("/api/mapper/queue").json()
    assert set(seen) == {"making", "waiting", "loaded"} and 0 <= seen["waiting"] <= 4 and seen["loaded"] is True
    # and with nothing left to make the worker stays up, the model with it
    idle = {"making": None, "waiting": 0, "loaded": True}
    _wait_for(lambda: mapped.get("/api/mapper/queue").json() == idle, 30)
    assert mapped.get("/api/mapper/queue").json() == idle


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


def test_the_worker_lets_the_model_go_when_no_chart_comes_and_starts_again_for_the_next(tmp_path) -> None:
    """The worker keeps the model on the GPU between charts; once no chart has come for its idle
    time it ends, and the game has the card's memory to itself (config: idleUnloadSeconds)."""
    from rhythm_server.mapper.service import MapperError, MapperService

    svc = MapperService(Runtime(), idle_unload_s=1.0)
    ask = lambda **extra: svc.generate({"keycount": 4, "out": str(tmp_path), **extra}, 30)  # noqa: E731
    try:
        assert ask()["ok"] and svc.loaded()
        # a timer armed before the last chart, or one that fires while a chart is made, leaves it
        svc._unload_if_idle(svc._used_at - 1.0)
        assert svc.loaded()
        with svc._lock:
            svc._unload_if_idle(svc._used_at)
        assert svc.loaded()
        _wait_for(lambda: not svc.loaded(), 15)
        assert not svc.loaded()
        # the next chart starts the worker again; a chart that fails counts as a use too
        with pytest.raises(MapperError, match="CUDA out of memory"):
            ask(seed=13)
        assert svc.loaded()
        _wait_for(lambda: not svc.loaded(), 15)
        assert not svc.loaded()
        assert ask()["ok"] and svc.loaded()
    finally:
        svc.close()
    assert not svc.loaded() and svc._idle_timer is None


def test_with_no_idle_time_the_worker_keeps_the_model_and_the_config_lets_go_after_two_minutes(tmp_path) -> None:
    from rhythm_server.mapper.service import MapperService

    assert MapperService(Runtime()).idle_unload_s() == 120.0  # config/mapper.json idleUnloadSeconds
    svc = MapperService(Runtime(), idle_unload_s=0)
    try:
        assert svc.generate({"keycount": 4, "out": str(tmp_path)}, 30)["ok"]
        time.sleep(0.5)
        assert svc.loaded() and svc._idle_timer is None
    finally:
        svc.close()


def _eighths(start_ms: float, end_ms: float, bpm: float) -> list[dict]:
    """Onsets on every eighth of a tempo, as the analysis gives them."""
    step = 30000.0 / bpm
    return [{"t": start_ms + i * step} for i in range(int((end_ms - start_ms) / step))]


def test_a_tempo_the_song_does_not_follow_is_taken_out_and_the_one_before_runs_on() -> None:
    from rhythm_server.formats.osu import timing_from_reds

    beat = 60000.0 / 180
    onsets = _eighths(100.0, 300_000.0, 180.0)
    # the timing pass lost the beat from 160 s: 120 BPM (the song's eighths are not on it), then 2.9 and
    # 29.5 (outside 30-400, and under 0.4 of the tempo held longest), and 67 BPM from 280 s: under 0.4
    # of 180, taken out though only a few onsets lie under it
    lost = timing_from_reds([(100.0, beat, 4), (160_000.0, 500.0, 4), (200_000.0, 60000.0 / 2.9, 4), (250_000.0, 60000.0 / 29.5, 4),
                             (280_000.0, 60000.0 / 67, 4)])
    fixed, dropped = charts.checked_timing(lost, onsets[:-100], 300_000.0)
    assert [(d["why"], round(d["bpm"], 1)) for d in dropped] == [("onsets", 120.0), ("bounds", 2.9), ("bounds", 29.5), ("bounds", 67.0)]
    assert dropped[0]["gain"] > charts.TIMING_GAIN and dropped[0]["spanMs"] == 40_000.0
    assert [p["bpm"] for p in fixed["tempoMap"]] == [180.0] and fixed["offsetMs"] == 100.0
    # a lost stretch of two seconds is left as it was: its few notes are not worth a chart made again
    short = timing_from_reds([(100.0, beat, 4), (100_000.0, 60000.0 / 2.9, 4), (102_000.0 + 100.0 / 3, beat, 4)])
    assert charts.checked_timing(short, onsets, 300_000.0) == (short, [])


def test_a_real_tempo_change_a_meter_change_and_a_tempo_with_few_onsets_stay() -> None:
    from rhythm_server.formats.osu import timing_from_reds

    # 176 -> 185 BPM at 103.6 s: the song's onsets follow the new tempo, not the old one run on, also
    # when they lie 25 ms after the model's grid (the analysis's onsets came 18-33 ms after it)
    real = timing_from_reds([(0.0, 60000.0 / 176, 4), (103_600.0, 60000.0 / 185, 4)])
    for late in (0.0, 25.0):
        onsets = [{"t": o["t"] + late} for o in _eighths(0.0, 103_600.0, 176.0) + _eighths(103_600.0, 200_000.0, 185.0)]
        assert charts.onset_lag(charts.timing_red_lines(real), onsets, 200_000.0) == pytest.approx(late, abs=0.5)
        assert charts.checked_timing(real, onsets, 200_000.0) == (real, [])
    # 4/4 then 3/4 at the same tempo
    meter = timing_from_reds([(0.0, 500.0, 4), (64_000.0, 500.0, 3)])
    assert charts.checked_timing(meter, _eighths(0.0, 128_000.0, 120.0), 128_000.0) == (meter, [])
    # an outro of five onsets at another tempo: nothing to judge it by
    outro = timing_from_reds([(0.0, 500.0, 4), (280_000.0, 60000.0 / 90, 4)])
    onsets = _eighths(0.0, 280_000.0, 120.0) + [{"t": 281_000.0 + 1000.0 * i} for i in range(5)]
    assert charts.checked_timing(outro, onsets, 300_000.0) == (outro, [])
    # a single tempo is never taken out
    one = timing_from_reds([(0.0, 500.0, 4)])
    assert charts.checked_timing(one, [], 10_000.0) == (one, [])


LOST_BEAT_WORKER = textwrap.dedent('''
    import json, sys
    from pathlib import Path
    for line in sys.stdin:
        req = json.loads(line)
        # its own timing loses the beat at 20 s (3 BPM); given a timing, it keeps it
        reds = ["100,468.75,4,1,0,60,1,0", "20000,20000,4,1,0,60,1,0"]
        if req.get("beatmap"):
            text = Path(req["beatmap"]).read_text(encoding="utf-8")
            reds = [l for l in text.split("[TimingPoints]")[1].splitlines() if l.strip() and not l.startswith("[")]
        t0, beat = float(reds[0].split(",")[0]), float(reds[0].split(",")[1])
        keys = int(req["keycount"])
        objs = [f"{int((i % keys + 0.5) * 512 / keys)},192,{int(round(t0 + i * beat))},1,0,0:0:0:0:" for i in range(48)]
        out = Path(req["out"]) / "beatmap.osu"
        head = "osu file format v14\\n[General]\\nMode: 3\\n[Difficulty]\\nCircleSize:%d\\n[TimingPoints]\\n%s\\n[HitObjects]\\n" % (keys, "\\n".join(reds))
        out.write_text(head + "\\n".join(objs) + "\\n", encoding="utf-8")
        print(json.dumps({"id": req["id"], "ok": True, "osu": str(out), "seconds": 0.1, "device": "cuda", "precision": "fp32"}), flush=True)
''')


def test_a_first_chart_whose_timing_lost_the_beat_is_made_again_without_it(tmp_path, fake_mapper_runtime, monkeypatch) -> None:
    import soundfile as sf

    from rhythm_server.formats.osu import timing_from_reds

    (fake_mapper_runtime / "fake_worker.py").write_text(LOST_BEAT_WORKER, encoding="utf-8")
    s = make_structured_song(bpm=128.0, seed=2)
    wav = tmp_path / "song.wav"
    sf.write(wav, s.pcm, s.sample_rate)
    meta = {"songId": None, "title": "T", "artist": "A"}
    mapper = Mapper()
    try:
        # with mapper.json timingCheck off the model's timing is kept as it came
        assert mapper.config()["timingCheck"] is True
        config = Mapper.config
        monkeypatch.setattr(Mapper, "config", lambda self: {**config(self), "timingCheck": False})
        kept = mapper.generate(_analysis(), "4K", "HARD", None, 1, meta, wav)
        assert "timingFixed" not in kept["meta"]["generator"] and [p["bpm"] for p in kept["timing"]["tempoMap"]] == [128.0, 3.0]
        monkeypatch.setattr(Mapper, "config", config)
        chart = mapper.generate(_analysis(), "4K", "HARD", None, 1, meta, wav)
        gen = chart["meta"]["generator"]
        assert gen["timing"] == "model" and [(d["why"], d["ms"]) for d in gen["timingFixed"]] == [("bounds", 20000.0)]
        assert [p["bpm"] for p in chart["timing"]["tempoMap"]] == [128.0]
        assert gen["seconds"] == pytest.approx(0.2)  # made twice: again on the timing without the lost beat
        # a song's timing kept from before this check, with the lost beat, is checked as its next chart is made
        lost = timing_from_reds([(100.0, 468.75, 4), (20000.0, 20000.0, 4)])
        again = mapper.generate(_analysis(), "4K", "NORMAL", None, 1, meta, wav, lambda: lost)
        assert again["meta"]["generator"]["timing"] == "song" and again["meta"]["generator"]["timingFixed"]
        assert [p["bpm"] for p in again["timing"]["tempoMap"]] == [128.0] and again["meta"]["generator"]["seconds"] == pytest.approx(0.1)
    finally:
        mapper.close()


# ---------- a steady song's timing as one tempo (mapper/steady.py) ----------


def _grid(start_ms: float, bpm: float, beats: float) -> float:
    return start_ms + beats * 60000.0 / bpm


def _model_reds(start_ms: float, bpm: float, lines: list[tuple[float, float, float]], meter: int = 4) -> list[tuple[float, float, int]]:
    """Red lines as the model puts them on a song of one tempo: (beat of the true grid, ms off it,
    the BPM it says from there)."""
    return [(_grid(start_ms, bpm, beat) + off, 60000.0 / said, meter) for beat, off, said in lines]


def test_a_steady_song_gets_one_tempo_and_whole_bars() -> None:
    from rhythm_server.formats.osu import timing_from_reds
    from rhythm_server.mapper import steady

    onsets = _eighths(100.0, 200_000.0, 128.0)
    # the model's red lines on a song at 128: a tempo a little off for four beats, 128.1 for a while (the
    # next line takes the drift back), a line moved 8 ms, one between two beats, one a beat late for a bar
    reds = _model_reds(100.0, 128.0, [
        (0, 0, 128), (64, 6, 127.5), (68, 3, 128.1), (128, -4, 128), (192, 8, 128), (254.5, 0, 128), (300, -5, 128), (333, 2, 128),
        (336, 0, 128.1),
    ])
    old = timing_from_reds(reds)
    assert len(old["tempoMap"]) > 3 and len(old["meter"]) > 5
    new, report, moves = steady.steady_timing(old, onsets, 200_000.0)
    assert new["tempoMap"] == [{"beat": 0.0, "bpm": 128.0}] and new["meter"] == [{"measure": 0, "beatsPerMeasure": 4}]
    assert new["offsetMs"] == pytest.approx(100.0, abs=3.0)
    assert report["tempos"] == [5, 1] and report["zones"] == [{"ms": 100.0, "bpm": 128.0}]
    assert charts.song_bpm(new, 200_000.0) == {"bpm": 128.0, "bpmMin": 128.0, "bpmMax": 128.0}
    # a note on the third beat after the 128.1 line was 3 ms off the song's grid and more by the span's
    # end; it keeps its place in the beat on the one grid
    for beat_in_span in (3.0, 40.5, 59.75):
        was = reds[2][0] + beat_in_span * reds[2][1]
        assert moves.time(was) == pytest.approx(_grid(new["offsetMs"], 128.0, 68 + beat_in_span), abs=1e-6)
        assert abs(moves.time(was) - was) < 25.0
    # steadied once, it stays to the millisecond
    again, report2, _ = steady.steady_timing(new, onsets, 200_000.0)
    assert again is new and report2 is None
    # a timing of one whole tempo has nothing to steady
    one = timing_from_reds([(100.0, 468.75, 4)])
    assert steady.steady_timing(one, onsets, 200_000.0) == (one, None, None)


def test_a_real_tempo_change_keeps_its_place_and_each_side_is_one_tempo() -> None:
    from rhythm_server.formats.osu import timing_from_reds
    from rhythm_server.mapper import steady

    # 176 -> 185 at beat 304 (103.6 s), the model's lines on each side a little off
    change = _grid(5.0, 176.0, 304)
    onsets = _eighths(5.0, change, 176.0) + _eighths(change, 180_000.0, 185.0)
    reds = _model_reds(5.0, 176.0, [(0, 0, 176), (58, 0, 174), (60, 2, 176.2), (116, -3, 176), (162, 4, 180), (164, 0, 175.99)])
    reds += _model_reds(change, 185.0, [(0, 0, 185), (23, 5, 187), (29, 0, 185), (64, -6, 184.5), (81, 0, 185)])
    new, report, _ = steady.steady_timing(timing_from_reds(reds), onsets, 180_000.0)
    assert [p["bpm"] for p in new["tempoMap"]] == [176.0, 185.0]
    assert new["tempoMap"][1]["beat"] == pytest.approx(304.0, abs=0.03)
    assert TempoMap(new).beat_to_ms(new["tempoMap"][1]["beat"]) == pytest.approx(change, abs=5.0)
    assert charts.song_bpm(new, 180_000.0) == {"bpm": 176.0, "bpmMin": 176.0, "bpmMax": 185.0}
    # half the tempo is the same beat counted otherwise: 92.5 after 185 stays 185
    half = reds[:6] + [(change, 60000.0 / 185, 4), (_grid(change, 185.0, 64), 60000.0 / 92.5, 4)]
    new, _, moves = steady.steady_timing(timing_from_reds(half), onsets, 180_000.0)
    assert [p["bpm"] for p in new["tempoMap"]] == [176.0, 185.0]
    was = half[-1][0] + 3 * half[-1][1]  # its third beat: the sixth of 185
    assert moves.time(was) == pytest.approx(was, abs=5.0)


def test_a_tempo_that_sways_is_left_as_the_model_heard_it() -> None:
    from rhythm_server.formats.osu import timing_from_reds
    from rhythm_server.mapper import steady

    # a band without a click: a new tempo every four bars, 2 % around 120, and the onsets on those beats
    reds, onsets, t = [], [], 200.0
    for k in range(24):
        bpm = 120.0 * (1.0 + 0.02 * ((k * 7) % 5 - 2) / 2.0)
        reds.append((t, 60000.0 / bpm, 4))
        onsets += [{"t": t + i * 30000.0 / bpm} for i in range(32)]
        t += 16 * 60000.0 / bpm
    live = timing_from_reds(reds)
    assert steady.steady_timing(live, onsets, t) == (live, None, None)
    # red lines the song's onsets do follow, a sixteenth apart from one grid: one grid would fit the
    # sounds worse, so they stay
    lurch = timing_from_reds([(100.0, 500.0, 4), (30_100.0 + 18.0, 500.0, 4), (60_100.0 - 18.0, 500.0, 4), (90_100.0 + 18.0, 500.0, 4)])
    sounds = [{"t": r + i * 250.0} for r in (100.0, 30_118.0, 60_082.0, 90_118.0) for i in range(119)]
    new, _, _ = steady.steady_timing(lurch, sounds, 120_000.0)
    assert [p["bpm"] for p in new["tempoMap"]] == [120.0]
    fits = steady.window_fits(steady.red_lines_of(new, 120_000.0), sorted(o["t"] for o in sounds), 120_000.0)
    assert all(off < 1.0 for _, off, _, _ in fits)


def test_bars_keep_a_change_of_meter_that_lasts_and_drop_one_that_does_not() -> None:
    from rhythm_server.formats.common import measures
    from rhythm_server.formats.osu import timing_from_reds
    from rhythm_server.mapper import steady

    onsets = _eighths(0.0, 200_000.0, 120.0)
    # 4/4, a line two beats into a bar (the bars after it start there: for two bars, then the old place
    # again), and 3/4 from beat 128 on, the model's lines a few ms off
    reds = [(0.0, 500.0, 4), (_grid(0, 120, 34) + 5, 60000.0 / 119.5, 4), (_grid(0, 120, 44) - 4, 500.0, 4),
            (_grid(0, 120, 128) + 3, 500.0, 3), (_grid(0, 120, 200) - 6, 60000.0 / 120.2, 3), (_grid(0, 120, 212), 500.0, 3)]
    new, report, _ = steady.steady_timing(timing_from_reds(reds), onsets, 200_000.0)
    assert new["tempoMap"] == [{"beat": 0.0, "bpm": 120.0}]
    assert new["meter"] == [{"measure": 0, "beatsPerMeasure": 4}, {"measure": 32, "beatsPerMeasure": 3}]
    # a beat dropped for good (the bars start a beat early from beat 63 to the end) is a bar cut short there
    drop = [(0.0, 500.0, 4), (_grid(0, 120, 32) + 4, 500.0, 4), (_grid(0, 120, 63) - 3, 500.0, 4), (_grid(0, 120, 127) + 4, 500.0, 4)]
    new, _, _ = steady.steady_timing(timing_from_reds(drop), onsets, 200_000.0)
    assert new["tempoMap"] == [{"beat": 0.0, "bpm": 120.0}]
    bars = measures(new["meter"], 80.0)
    assert [length for _, length in bars[14:17]] == [4.0, 3.0, 4.0] and bars[16][0] == 63.0


def test_the_song_list_bpm_is_not_a_range_for_a_tempo_held_a_moment() -> None:
    from rhythm_server.formats.osu import timing_from_reds

    # 180 with two beats of 171 and of 182 (a song left as the model heard it): 180, not 171-182
    timing = timing_from_reds([(0.0, 60000 / 180, 4), (60_000.0, 60000 / 171, 4), (60_700.0, 60000 / 180, 4), (90_000.0, 60000 / 182, 4), (90_660.0, 60000 / 180, 4)])
    assert charts.song_bpm(timing, 200_000.0) == {"bpm": 180.0, "bpmMin": 180.0, "bpmMax": 180.0}
    # a tempo that sways a little is one tempo to the player (161-162); a real change is not (176 -> 185)
    sway = timing_from_reds([(0.0, 60000 / 162, 4), (60_000.0, 60000 / 161, 4), (100_000.0, 60000 / 162, 4)])
    assert charts.song_bpm(sway, 200_000.0) == {"bpm": 162.0, "bpmMin": 162.0, "bpmMax": 162.0}
    # a bar that starts at a tempo change is one red line, with that tempo
    cut = timing_from_reds([(0.0, 500.0, 4), (10_100.0, 400.0, 3)])
    assert [(round(t), round(b)) for t, b, _ in charts.timing_red_lines(cut)] == [(0, 500), (10000, 500), (10100, 400)]


SWAYING_LINES_WORKER = textwrap.dedent('''
    import json, sys
    from pathlib import Path
    for line in sys.stdin:
        req = json.loads(line)
        # its own timing on a song at 128: red lines a little off, as the model puts them; given a timing, it keeps it
        beat = 468.75
        reds = [(100.0, beat), (100 + 16 * beat + 6, 60000 / 127.5), (100 + 20 * beat + 3, 60000 / 128.2), (100 + 36 * beat - 4, beat)]
        if req.get("beatmap"):
            text = Path(req["beatmap"]).read_text(encoding="utf-8")
            rows = [l.split(",") for l in text.split("[TimingPoints]")[1].splitlines() if l.strip() and not l.startswith("[")]
            reds = [(float(r[0]), float(r[1])) for r in rows]
        keys = int(req["keycount"])
        times = []
        for k, (t, length) in enumerate(reds):
            end = reds[k + 1][0] if k + 1 < len(reds) else t + 16 * length
            n = 0
            while t + n * length < end - length / 2 and len(times) < 48:
                times.append(int(round(t + n * length)))
                n += 1
        objs = [f"{int((i % keys + 0.5) * 512 / keys)},192,{t},1,0,0:0:0:0:" for i, t in enumerate(times)]
        out = Path(req["out"]) / "beatmap.osu"
        lines = "\\n".join(f"{t:.3f},{length:.9f},4,1,0,60,1,0" for t, length in reds)
        head = "osu file format v14\\n[General]\\nMode: 3\\n[Difficulty]\\nCircleSize:%d\\n[TimingPoints]\\n%s\\n[HitObjects]\\n" % (keys, lines)
        out.write_text(head + "\\n".join(objs) + "\\n", encoding="utf-8")
        print(json.dumps({"id": req["id"], "ok": True, "osu": str(out), "seconds": 0.1, "device": "cuda", "precision": "fp32"}), flush=True)
''')


def test_a_first_chart_moves_onto_the_steady_timing_and_the_song_keeps_it(tmp_path, fake_mapper_runtime, monkeypatch) -> None:
    from rhythm_server.formats.osu import timing_from_reds
    from rhythm_server.mapper import steady

    (fake_mapper_runtime / "fake_worker.py").write_text(SWAYING_LINES_WORKER, encoding="utf-8")
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        sid = c.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]["id"]
        chart = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "HARD"}).json()["chart"]
        gen = chart["meta"]["generator"]
        assert gen["timing"] == "model" and gen["timingSteady"]["tempos"] == [4, 1] and gen["timingSteady"]["notesMoved"] is True
        assert chart["timing"]["tempoMap"] == [{"beat": 0.0, "bpm": 128.0}] and chart["timing"]["meter"] == [{"measure": 0, "beatsPerMeasure": 4}]
        # every note was on a beat of the model's grid, and is on a beat of the one grid
        assert len(chart["notes"]) == 48 and all(abs(n["beat"] - round(n["beat"])) < 0.01 for n in chart["notes"])
        song = c.get(f"/api/songs/{sid}").json()["song"]
        assert (song["bpm"], song["bpmMin"], song["bpmMax"]) == (128.0, 128.0, 128.0)
        kept = app.state.library.mapper_timing_kept(sid)
        assert kept["timing"] == chart["timing"] and kept["steady"] == steady.STEADY_VERSION
        # the model's own timing is kept beside it: to settle it anew from, or to go back to
        assert len(kept["raw"]["tempoMap"]) == 4
        # the next chart is made on that timing as it is
        other = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "NORMAL"}).json()["chart"]
        assert other["timing"] == chart["timing"] and "timingSteady" not in other["meta"]["generator"]
        # a timing kept from before (the model's red lines as they came), and the BPM the list showed for it
        library = app.state.library
        beat = 468.75
        old = timing_from_reds([(100.0, beat, 4), (100 + 16 * beat + 6, 60000 / 127.5, 4), (100 + 20 * beat + 3, 60000 / 128.2, 4), (100 + 36 * beat - 4, beat, 4)])
        library.save_mapper_timing(sid, kept["model"], old)
        library.update_song(sid, bpm=128.0, bpm_min=127.5, bpm_max=128.2)
        made = library.load_chart(chart["meta"]["chartId"])
    # the next start steadies it: the list's BPM is one number at once; the chart made before is as it was
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        song = c.get(f"/api/songs/{sid}").json()["song"]
        assert (song["bpm"], song["bpmMin"], song["bpmMax"]) == (128.0, 128.0, 128.0)
        kept = app.state.library.mapper_timing_kept(sid)
        assert kept["steady"] == steady.STEADY_VERSION and kept["timing"]["tempoMap"] == [{"beat": 0.0, "bpm": 128.0}]
        assert kept["raw"] == old  # what was there is what it was settled from
        assert app.state.library.load_chart(chart["meta"]["chartId"]) == made
    # with mapper.json timingSteady off the model's red lines are kept as they came
    config = Mapper.config
    monkeypatch.setattr(Mapper, "config", lambda self: {**config(self), "timingSteady": False})
    app = create_app(tmp_path / "off", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        sid = c.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]["id"]
        chart = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "HARD"}).json()["chart"]
        assert "timingSteady" not in chart["meta"]["generator"] and len(chart["timing"]["tempoMap"]) == 4


def test_a_chart_made_before_goes_onto_the_settled_timing_with_its_notes_and_ticks_where_they_were() -> None:
    from rhythm_server.formats.common import normalize_notes
    from rhythm_server.formats.osu import timing_from_reds
    from rhythm_server.mapper import steady

    # a chart on the model's red lines (128 BPM, lines a few ms off, one tempo a little off), its notes
    # at whole ms on those grids: taps on the beats, a hold of two beats and one of a beat and a half
    reds = _model_reds(100.0, 128.0, [(0, 0, 128), (64, 6, 127.5), (68, 3, 128.1), (128, -4, 128), (192, 8, 128)])
    old = timing_from_reds(reds)
    tempo, raw = TempoMap(old), []
    for k, (t, beat_len, _) in enumerate(reds):
        for b in range(0, 56, 4):
            raw.append({"t": float(round(t + b * beat_len)), "lane": 0, "type": "tap"})
            raw.append({"t": float(round(t + (b + 1) * beat_len)), "lane": 1, "type": "hold", "endT": float(round(t + (b + 3) * beat_len))})
            raw.append({"t": float(round(t + (b + 1.5) * beat_len)), "lane": 2, "type": "hold", "endT": float(round(t + (b + 3) * beat_len))})
    notes = normalize_notes(raw, tempo)
    chart = {
        "formatVersion": 1, "meta": {"chartId": "c" + "0" * 20, "level": 7, "noteCount": len(notes), "generator": {"name": "mapperatorinator", "model": "v32"}},
        "timing": old, "notes": notes,
        "sections": [{"label": "verse", "startBeat": 64.0, "endBeat": 128.0}],
        "effects": [{"beat": 68.0, "t": round(tempo.beat_to_ms(68.0), 3), "type": "zoom", "value": 0.2, "durationBeats": 4.0}],
    }
    new, _, _ = steady.steady_timing(old, _eighths(100.0, 150_000.0, 128.0), 150_000.0)
    assert new["tempoMap"] == [{"beat": 0.0, "bpm": 128.0}]
    made = steady.retimed_chart(chart, new)
    assert made["timing"] == new and made["meta"]["generator"]["retimed"] == {"version": steady.STEADY_VERSION, "tempos": [len(old["tempoMap"]), 1]}
    assert {k: v for k, v in made["meta"].items() if k != "generator"} == {k: v for k, v in chart["meta"].items() if k != "generator"}
    # every note where it was in time, its beat the new timing's
    after = TempoMap(new)
    assert [(n["t"], n.get("endT"), n["lane"], n["type"]) for n in made["notes"]] == [(n["t"], n.get("endT"), n["lane"], n["type"]) for n in notes]
    assert all(abs(after.beat_to_ms(n["beat"]) - n["t"]) <= steady.RETIME_SNAP_MS + 1 for n in made["notes"])
    assert all(abs(after.beat_to_ms(n["beat"]) - n["t"]) < 0.01 for n in made["notes"] if n["type"] == "tap")
    # every hold has the ticks it had (the client counts them on beat and endBeat): the max combo stays;
    # written as they fall, heads a few ms before a tick's place would each get one more
    ticks = lambda ns: [steady.hold_ticks(n["beat"], n["endBeat"]) for n in ns if n["type"] == "hold"]
    assert sum(ticks(notes)) > 400
    plain = [steady.hold_ticks(after.ms_to_beat(n["t"]), after.ms_to_beat(n["endT"])) for n in notes if n["type"] == "hold"]
    changed = lambda counts: sum(abs(a - b) for a, b in zip(counts, ticks(notes)))
    assert changed(plain) >= 10 and changed(ticks(made["notes"])) <= changed(plain) / 2, (changed(plain), changed(ticks(made["notes"])))
    # and every tick falls while the hold is held: one before the head or after the end would count for
    # the max combo and never be got (an autoplay of such a chart ended 88 / 90)
    for n in made["notes"]:
        if n["type"] == "hold":
            k = int(n["beat"] / steady.RETIME_TICK_BEATS + 1e-6) + 1
            while k * steady.RETIME_TICK_BEATS < n["endBeat"] - 1e-6:
                assert n["t"] < after.beat_to_ms(k * steady.RETIME_TICK_BEATS) < n["endT"]
                k += 1
    # what else is written in beats is at the time it was
    assert after.beat_to_ms(made["sections"][0]["startBeat"]) == pytest.approx(tempo.beat_to_ms(64.0), abs=0.5)
    effect = made["effects"][0]
    assert effect["t"] == chart["effects"][0]["t"] and after.beat_to_ms(effect["beat"]) == pytest.approx(effect["t"], abs=0.01)
    assert after.beat_to_ms(effect["beat"] + effect["durationBeats"]) == pytest.approx(tempo.beat_to_ms(72.0), abs=0.01)
    # done twice, nothing more changes
    again = steady.retimed_chart(made, new)
    assert again["notes"] == made["notes"] and again["sections"] == made["sections"] and again["effects"] == made["effects"]


def test_the_charts_made_before_are_put_on_the_settled_timing_when_the_server_starts(tmp_path, fake_mapper_runtime, monkeypatch) -> None:
    from rhythm_server.mapper import steady

    (fake_mapper_runtime / "fake_worker.py").write_text(SWAYING_LINES_WORKER, encoding="utf-8")
    config = Mapper.config
    # a build from before: the model's red lines as they came, in the song's timing and in its charts
    monkeypatch.setattr(Mapper, "config", lambda self: {**config(self), "timingSteady": False})
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        sid = c.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]["id"]
        chart = c.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "HARD"}).json()["chart"]
        cid = chart["meta"]["chartId"]
        assert len(chart["timing"]["tempoMap"]) == 4
        library = app.state.library
        # a chart edited from it, and one of another model: neither is the song's kept timing's to change
        edited = {**chart, "meta": {**chart["meta"], "chartId": "c" + "e" * 20, "source": {"kind": "edited"}}}
        other = {**chart, "meta": {**chart["meta"], "chartId": "c" + "f" * 20, "generator": {**chart["meta"]["generator"], "model": "v30"}}}
        library.save_chart(edited, sid)
        library.save_chart(other, sid)
        was = library.chart_path(cid).read_bytes()
    # with mapper.json timingRetime off the charts stay (the song's timing is settled all the same)
    monkeypatch.setattr(Mapper, "config", lambda self: {**config(self), "timingRetime": False})
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app):
        assert app.state.library.chart_path(cid).read_bytes() == was
        assert app.state.library.mapper_timing_kept(sid)["timing"]["tempoMap"] == [{"beat": 0.0, "bpm": 128.0}]
    monkeypatch.setattr(Mapper, "config", config)
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        library = app.state.library
        made = c.get(f"/api/charts/{cid}").json()["chart"]
        assert made["timing"] == library.mapper_timing_kept(sid)["timing"] and made["timing"]["tempoMap"] == [{"beat": 0.0, "bpm": 128.0}]
        assert made["meta"]["generator"]["retimed"]["version"] == steady.STEADY_VERSION
        assert [(n["t"], n["lane"]) for n in made["notes"]] == [(n["t"], n["lane"]) for n in chart["notes"]]
        assert made["meta"]["level"] == chart["meta"]["level"] and made["meta"]["noteCount"] == chart["meta"]["noteCount"]
        # the file as it was is kept; the edited chart and the other model's are as they were
        assert library.chart_backup_path(cid).read_bytes() == was
        assert library.load_chart(edited["meta"]["chartId"])["timing"] == chart["timing"]
        assert library.load_chart(other["meta"]["chartId"])["timing"] == chart["timing"]
        now = library.chart_path(cid).read_bytes()
    # the next start finds nothing to do, and the first file kept stays the original
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app):
        assert app.state.library.chart_path(cid).read_bytes() == now and app.state.library.chart_backup_path(cid).read_bytes() == was


def _beats_off(timing: dict, beats: list[float]) -> float:
    """How far the true beats lie from the timing's beats at most (ms)."""
    tempo = TempoMap(timing)
    return max(abs(tempo.ms_to_beat(b) - round(tempo.ms_to_beat(b))) * tempo.beat_ms(tempo.ms_to_beat(b)) for b in beats)


def test_a_fast_steady_song_is_steadied_before_the_check_can_take_a_right_tempo_out() -> None:
    from rhythm_server.formats.osu import timing_from_reds
    from rhythm_server.mapper import steady

    # 222 BPM: a sixteenth is 68 ms, the check's tolerance 11. On the model's red lines the check took
    # the right tempo of a span 12 ms off for a lost one (10 of 30 such songs came out worse than the
    # model's timing, checked first); steadied first there is one tempo and nothing to take
    exact = again = 0
    for seed in range(200, 208):
        beats, reds, onsets = heard_song(lambda t: 222.0, 200_000.0, seed, wander=2.2, noise=6.0)
        model = timing_from_reds(reds)
        assert len(model["tempoMap"]) > 10
        timing, fixed, report, moves = steady.settled_timing(model, onsets, 200_000.0)
        assert _beats_off(timing, beats) <= max(30.0, _beats_off(model, beats) + 10.0)
        assert (moves is None) == bool(fixed) and steady.no_worse(model, timing, onsets, 200_000.0)
        exact += [p["bpm"] for p in timing["tempoMap"]] == [222.0]
        again += bool(fixed)
    # one of the eight has a start one grid cannot follow (there the check goes first after all), and
    # under this much noise a span or two the model put can be too far off to step over
    assert exact >= 6 and again <= 1
    # a tempo off the round numbers, and a real change
    beats, reds, onsets = heard_song(lambda t: 127.96, 200_000.0, 3)
    timing, _, _, _ = steady.settled_timing(timing_from_reds(reds), onsets, 200_000.0)
    assert [p["bpm"] for p in timing["tempoMap"]] == [127.96] and _beats_off(timing, beats) < 15.0
    beats, reds, onsets = heard_song(lambda t: 120.0 if t < 100_000 else 150.0, 200_000.0, 4)
    timing, _, _, _ = steady.settled_timing(timing_from_reds(reds), onsets, 200_000.0)
    assert [p["bpm"] for p in timing["tempoMap"]] == [120.0, 150.0] and _beats_off(timing, beats) < 20.0
    # the long tail of a lost beat leaves no zone: the check takes it out, then the rest is one tempo
    beats, reds, onsets = heard_song(lambda t: 120.0, 200_000.0, 5)
    lost = [r for r in reds if r[0] < 130_000] + [(130_000.0, 60000.0 / 2.9, 4), (170_000.0, 60000.0 / 29.5, 4)]
    timing, fixed, report, moves = steady.settled_timing(timing_from_reds(lost), onsets, 200_000.0)
    assert [p["bpm"] for p in timing["tempoMap"]] == [120.0] and [d["why"] for d in fixed] == ["bounds", "bounds"] and moves is None
    assert _beats_off(timing, beats) < 20.0
    # bars of a timing left as the model heard it are whole (3.999999 beats are four)
    beats, reds, onsets = heard_song(lambda t: 100.0 * (1.0 + 0.01 * ((int(t / 4800) * 7) % 5 - 2) / 2.0), 150_000.0, 6)
    left, _, _, _ = steady.settled_timing(timing_from_reds(reds), onsets, 150_000.0)
    assert all(abs(m["beatsPerMeasure"] - round(m["beatsPerMeasure"])) > 5e-5 or m["beatsPerMeasure"] == round(m["beatsPerMeasure"]) for m in left["meter"])


# ---------- FX notes of 4K+FX and 6K+FX (mapper/fx.py) ----------


def _fx_chart(key_mode: str, difficulty: str, cfg: dict | None = None) -> dict:
    """A chart of 400 beats at 120 BPM: a note on every beat (columns in turn), an eighth after every
    other, a chord on every eighth beat, and a hold of two beats alone every sixteen."""
    keys = len(charts.columns(key_mode))
    objects = []
    for b in range(400):
        t = 1000 + 500 * b
        if b % 16 == 8:
            objects.append(f"{x_of(b % keys, keys)},192,{t},128,0,{t + 1000}:0:0:0:0:")
        elif b % 16 == 9:
            continue  # nothing else while the hold is held
        else:
            objects.append(f"{x_of(b % keys, keys)},192,{t},1,{8 if b % 4 == 2 else 0},0:0:0:0:")
        if b % 8 == 0:
            objects.append(f"{x_of((b + 2) % keys, keys)},192,{t},1,0,0:0:0:0:")
        if b % 2 == 1:
            objects.append(f"{x_of((b + 3) % keys, keys)},192,{t + 250},1,0,0:0:0:0:")
    a = {**_analysis(), "durationMs": 210_000.0, "onsets": [], "sections": []}
    cfg = cfg or dict(mapper_config())
    level = charts.target_level(key_mode, difficulty, None)
    return charts.make_chart(a, key_mode, difficulty, level, 1, "cfx", cfg, {"songId": None, "title": "T"}, osu(keys, objects, "1000,500,4,1,0,60,1,0"), {})


@pytest.mark.parametrize("key_mode", ["4K+FX", "6K+FX"])
def test_some_key_notes_go_to_the_fx_lanes_by_the_tiers_rate(key_mode: str) -> None:
    from rhythm_server.chart.lanes import lane_infos
    from rhythm_server.config import difficulty_config

    lanes = lane_infos(key_mode)
    side = {l.index: l.hand for l in lanes if l.kind == "side"}
    hand = {l.index: l.hand for l in lanes}
    off = {**mapper_config(), "fx": {**mapper_config()["fx"], "enabled": False}}
    shares = []
    for tier in ("NORMAL", "HARD", "EXPERT", "MASTER"):
        plain, chart = _fx_chart(key_mode, tier, off), _fx_chart(key_mode, tier)
        assert all(n["lane"] not in side for n in plain["notes"]) and "fx" not in plain["meta"]["generator"]
        notes, fx = chart["notes"], [n for n in chart["notes"] if n["lane"] in side]
        report = chart["meta"]["generator"]["fx"]
        preset = difficulty_config()["presets"][tier]
        instants = len({n["t"] for n in notes})
        # moved, not added: the same notes at the same times, the tier's share of the instants on FX
        assert len(notes) == len(plain["notes"]) and sorted(n["t"] for n in notes) == sorted(n["t"] for n in plain["notes"])
        assert len(fx) == report["taps"] + report["holds"] == report["left"] + report["right"]
        assert len(fx) == pytest.approx(preset["sideRate"] * instants, abs=1.0) and report["holds"] > 0
        assert abs(chart["meta"]["level"] - plain["meta"]["level"]) <= 1
        shares.append(len(fx) / instants)
        # both sides are used, never within 450 ms of one another (so never at once)
        assert report["left"] > 0 and report["right"] > 0
        assert all(b["t"] - a["t"] >= 450 for a, b in zip(fx, fx[1:]))
        for n in fx:
            same_hand = [m for m in notes if m["lane"] not in side and hand[m["lane"]] == side[n["lane"]]]
            # no key of the FX note's hand right before or after it, none while an FX hold is held
            assert not any(0 < abs(m["t"] - n["t"]) < preset["minJackMs"] for m in same_hand)
            assert not any(n["type"] == "hold" and n["t"] < m["t"] < n["endT"] for m in same_hand)
        # over the whole song: every quarter of it has some
        assert all(sum(1 for n in fx if q * 50_000 <= n["t"] - 1000 < (q + 1) * 50_000) >= 2 for q in range(4))
    assert shares == sorted(shares)
    # a key mode without FX lanes is as the model made it
    assert "fx" not in _fx_chart("4K", "EXPERT")["meta"]["generator"]


def _adapter(folder: Path, weights: bytes = b"weights", rank: int = 64) -> Path:
    """A LoRA adapter's folder as a Mapperatorinator LoRA training leaves it (the files only)."""
    folder.mkdir(parents=True)
    (folder / "adapter_config.json").write_text(json.dumps({"r": rank, "peft_type": "LORA"}), encoding="utf-8")
    (folder / "adapter_model.safetensors").write_bytes(weights)
    return folder


def test_a_key_counts_lora_adapter_makes_other_charts_that_say_so(mapped: TestClient, fake_mapper_runtime, monkeypatch) -> None:
    from rhythm_server.mapper import lora

    installed: list[bool] = []
    monkeypatch.setattr(Runtime, "ensure_lora", lambda self: installed.append(True))
    mapper = mapped.app.state.mapper
    sid = mapped.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 2}).json()["song"]["id"]
    tag = mapped.get("/api/health").json()["generator"]
    base = {m: mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": m, "difficulty": "HARD", "brief": True}).json()["meta"]["chartId"]
            for m in ("4K", "6K", "6K+FX", "8K")}
    assert mapper.config()["_lora"] == {}
    # an adapter for 6K in the runtime folder: 6K and 6K+FX (made as 6K) are other charts, 4K and 8K are not
    folder = _adapter(fake_mapper_runtime / "lora" / "6K")
    assert lora.adapter(folder) == {"path": str(folder), "tag": hashlib.sha256(b"weights").hexdigest()[:12], "r": 64}
    with_lora = {m: mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": m, "difficulty": "HARD", "brief": True}).json()["meta"]["chartId"] for m in base}
    assert {m for m in base if with_lora[m] != base[m]} == {"6K", "6K+FX"}
    assert mapped.get("/api/health").json()["generator"] != tag  # the song select drops its old briefs
    cfg = mapper.config()
    assert charts.request_for("6K", 6, 1, cfg, Path("a.wav"), Path("out"), None, {})["lora"] == str(folder)
    assert "lora" not in charts.request_for("8K", 6, 1, cfg, Path("a.wav"), Path("out"), None, {})
    chart = mapped.post(f"/api/songs/{sid}/charts", json={"keyMode": "6K", "difficulty": "HARD"}).json()["chart"]
    assert chart["meta"]["chartId"] == with_lora["6K"] and chart["meta"]["generator"]["lora"] == {"tag": lora.adapter(folder)["tag"], "r": 64}
    assert installed  # PEFT was asked for before the worker
    # other weights are another adapter: other charts again
    (folder / "adapter_model.safetensors").write_bytes(b"trained longer")
    assert charts.chart_id(_analysis(), "6K", "HARD", 6, 1, mapper.config()) != charts.chart_id(_analysis(), "6K", "HARD", 6, 1, cfg)
    # a pickled adapter is none (PEFT would unpickle it), and lora.enabled false is the base model
    _adapter(fake_mapper_runtime / "lora" / "8K")
    (fake_mapper_runtime / "lora" / "8K" / "adapter_model.safetensors").rename(fake_mapper_runtime / "lora" / "8K" / "adapter_model.bin")
    assert set(mapper.config()["_lora"]) == {6}
    assert lora.adapters({"lora": {"enabled": False}}, fake_mapper_runtime) == {}
    # mapper.json lora.adapters names another folder for a key count
    other = _adapter(fake_mapper_runtime / "lora" / "8K-v2", b"v2")
    assert lora.adapters({"lora": {"adapters": {"8K": "8K-v2"}}}, fake_mapper_runtime)[8]["path"] == str(other)


def test_the_models_other_conditions_reach_the_worker_and_make_other_charts() -> None:
    cfg = dict(mapper_config())
    plain = charts.request_for("8K", 6, 1, cfg, Path("a.wav"), Path("out"), None, {})
    assert not {"descriptors", "negativeDescriptors", "cfgScale", "lora"} & set(plain) and charts.conditions_of("8K", cfg) == {}
    cond = {**cfg, "conditions": {"_comment": "…", "8K": {"negativeDescriptors": ["style/N+1"], "cfgScale": 2.0}}}
    request = charts.request_for("8K", 6, 1, cond, Path("a.wav"), Path("out"), None, {})
    assert (request["negativeDescriptors"], request["cfgScale"]) == (["style/N+1"], 2.0)
    assert charts.request_for("6K", 6, 1, cond, Path("a.wav"), Path("out"), None, {}) == charts.request_for("6K", 6, 1, cfg, Path("a.wav"), Path("out"), None, {})
    assert charts.chart_id(_analysis(), "8K", "HARD", 6, 1, cond) != charts.chart_id(_analysis(), "8K", "HARD", 6, 1, cfg)
    assert charts.chart_id(_analysis(), "6K", "HARD", 6, 1, cond) == charts.chart_id(_analysis(), "6K", "HARD", 6, 1, cfg)
    assert charts.settings_tag(cond) != charts.settings_tag(cfg)
    # with neither an adapter nor a condition the ids are what they were before there were any
    assert charts.settings_tag(cfg) == charts.settings_tag({k: v for k, v in cfg.items() if k not in ("lora", "conditions")})
