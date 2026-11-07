"""Charts made in worker processes (generator/workers.py): the same charts, each made once, and the
tiers of a song made side by side ahead of the song select's requests."""

from __future__ import annotations

import io
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import analysis_of, synth
from rhythm_server.api.app import create_app
from rhythm_server.config import CONFIG_DIR, difficulty_config, difficulty_order
from rhythm_server.generator import default_seed, generate_chart
from rhythm_server.generator.core import TierNotMade
from rhythm_server.generator.workers import AHEAD, WHOLE, ChartMaker


@pytest.fixture()
def file_song_fit(monkeypatch):
    """The workers read the config files: the charts made here to compare with use them too
    (conftest widens songFit for the other tests in this process)."""
    fit = difficulty_config()["songFit"]
    for key, value in json.loads((CONFIG_DIR / "difficulty.json").read_text(encoding="utf-8"))["songFit"].items():
        monkeypatch.setitem(fit, key, value)


def made_here(analysis: dict, key_mode: str, tier: str, meta: dict | None = None) -> dict | str:
    seed = default_seed(analysis["audioHash"], key_mode, tier, None)
    try:
        return generate_chart(analysis, key_mode, tier, None, seed, {}, meta)
    except TierNotMade as e:
        return f"not made: {e}"


def wait_idle(maker: ChartMaker, seconds: float = 120.0) -> None:
    end = time.monotonic() + seconds
    while maker.busy():
        assert time.monotonic() < end, "the chart workers did not finish"
        time.sleep(0.05)


def wav_bytes(bpm: float, bars: int, seed: int) -> bytes:
    song = synth(bpm, bars, seed)
    buf = io.BytesIO()
    sf.write(buf, song.pcm, song.sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def test_workers_make_the_charts_the_server_threads_make(file_song_fit) -> None:
    analysis = analysis_of(128.0, 24, 5)
    maker = ChartMaker(2)
    maker.start()
    try:
        jobs = {}
        for tier in difficulty_order():
            seed = default_seed(analysis["audioHash"], "7K+1S", tier, None)
            jobs[tier], new = maker.job(f"t-{tier}", AHEAD, (analysis, "7K+1S", tier, None, seed, {}, None))
            assert new
        # asked for again while it is made: the same job, moved up
        again, new = maker.job("t-MASTER", WHOLE, (analysis, "7K+1S", "MASTER", None, 1, {}, None))
        assert again is jobs["MASTER"] and not new
        for tier, job in jobs.items():
            try:
                got = job.result(timeout=120)
            except TierNotMade as e:
                got = f"not made: {e}"
            assert got == made_here(analysis, "7K+1S", tier), tier
        assert maker.started == len(jobs)
    finally:
        maker.close()


SERVER_STAND_IN = """
import os, sys, time
sys.path.insert(0, sys.argv[1])
from rhythm_server.generator.workers import ChartMaker

if __name__ == "__main__":
    maker = ChartMaker(2)
    maker.start()
    end = time.monotonic() + 60
    while len(maker._pool._processes) < 2 and time.monotonic() < end:
        time.sleep(0.05)
    # the workers are up and take jobs
    assert maker._pool.submit(os.getpid).result(timeout=60) in maker._pool._processes
    print(" ".join(str(pid) for pid in maker._pool._processes), flush=True)
    time.sleep(600)
"""


def _running(pid: int) -> bool:
    """Alive and not a zombie (a container's first process may never reap an orphan)."""
    try:
        with open(f"/proc/{pid}/status", encoding="utf-8") as f:
            return not any(line.startswith("State:") and "Z" in line.split()[1] for line in f)
    except FileNotFoundError:
        return False


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="reads /proc")
def test_workers_end_when_the_server_is_killed(tmp_path) -> None:
    """A server stopped at once (killed, a crash, os._exit after /api/shutdown) leaves no workers."""
    script = tmp_path / "server_stand_in.py"
    script.write_text(SERVER_STAND_IN, encoding="utf-8")
    server = subprocess.Popen([sys.executable, str(script), str(Path(__file__).resolve().parents[1])], stdout=subprocess.PIPE, text=True)
    pids: list[int] = []
    try:
        assert server.stdout is not None
        pids = [int(p) for p in server.stdout.readline().split()]
        time.sleep(1.0)
        assert len(pids) == 2 and all(_running(p) for p in pids)
        server.kill()
        server.wait(10)
        end = time.monotonic() + 15
        while any(_running(p) for p in pids):
            assert time.monotonic() < end, "the chart workers outlived the killed server"
            time.sleep(0.05)
    finally:
        server.kill()
        for pid in pids:
            if _running(pid):
                os.kill(pid, signal.SIGKILL)


def test_the_other_tiers_are_made_while_one_is_asked_for(tmp_path, file_song_fit) -> None:
    with TestClient(create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True, chart_workers=2)) as c:
        song = c.post("/api/songs", files={"file": ("a.wav", wav_bytes(128.0, 24, 6), "audio/wav")}).json()["song"]
        maker: ChartMaker = c.app.state.charts
        whole = c.post(f"/api/songs/{song['id']}/charts", json={"keyMode": "6K", "difficulty": "EXPERT"})
        assert whole.status_code == 200
        wait_idle(maker)
        tiers = difficulty_order()
        assert maker.started == len(tiers)
        analysis = c.app.state.library.load_analysis(song["id"])
        meta = {"songId": song["id"], "title": song["title"], "artist": song["artist"]}
        assert whole.json()["chart"] == made_here(analysis, "6K", "EXPERT", meta)
        for tier in tiers:
            if tier == "EXPERT":
                continue
            r = c.post(f"/api/songs/{song['id']}/charts", json={"keyMode": "6K", "difficulty": tier, "brief": True})
            expected = made_here(analysis, "6K", tier, meta)
            if isinstance(expected, str):
                assert r.status_code == 404
            else:
                assert r.status_code == 200 and r.json()["cached"], tier
                assert r.json()["meta"] == expected["meta"]
        # one of them asked for whole is saved as it was made ahead
        tier = tiers[0]
        r = c.post(f"/api/songs/{song['id']}/charts", json={"keyMode": "6K", "difficulty": tier})
        assert r.json()["cached"] and r.json()["chart"] == made_here(analysis, "6K", tier, meta)
        assert c.get(f"/api/charts/{r.json()['chart']['meta']['chartId']}").status_code == 200
        assert maker.started == len(tiers)


def test_a_song_just_analyzed_has_the_last_key_modes_tiers_made(tmp_path, file_song_fit) -> None:
    with TestClient(create_app(tmp_path / "data", client_dist=None, chart_workers=2)) as c:
        def ready(song_id: str) -> dict:
            end = time.monotonic() + 120
            while (s := c.get(f"/api/songs/{song_id}").json()["song"])["status"] not in ("ready", "error"):
                assert time.monotonic() < end
                time.sleep(0.05)
            return s

        first = ready(c.post("/api/songs", files={"file": ("a.wav", wav_bytes(128.0, 16, 7), "audio/wav")}).json()["song"]["id"])
        assert c.post(f"/api/songs/{first['id']}/charts", json={"keyMode": "4K", "difficulty": "HARD"}).status_code == 200
        maker: ChartMaker = c.app.state.charts
        wait_idle(maker)
        before = maker.started
        second = ready(c.post("/api/songs", files={"file": ("b.wav", wav_bytes(140.0, 16, 8), "audio/wav")}).json()["song"]["id"])
        wait_idle(maker)
        assert maker.started == before + len(difficulty_order())
        r = c.post(f"/api/songs/{second['id']}/charts", json={"keyMode": "4K", "difficulty": "HARD", "brief": True})
        assert r.status_code == 200 and r.json()["cached"]
        assert maker.started == before + len(difficulty_order())
