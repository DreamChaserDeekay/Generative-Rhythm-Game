from __future__ import annotations

import io
import shutil
import subprocess
import time

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import synth
from rhythm_server.api.app import create_app


@pytest.fixture()
def client(tmp_path):
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        yield c


def wav_bytes(seconds_bars: int = 16, bpm: float = 128.0) -> bytes:
    song = synth(bpm, seconds_bars, 3)
    buf = io.BytesIO()
    sf.write(buf, song.pcm, song.sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def test_health(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] and "4K" in body["keyModes"] and "MASTER" in body["difficulties"]


def test_upload_analyze_generate_and_score(client: TestClient) -> None:
    r = client.post("/api/songs", files={"file": ("groove.wav", wav_bytes(), "audio/wav")})
    assert r.status_code == 201, r.text
    song = r.json()["song"]
    assert song["status"] == "ready"  # synchronous jobs in tests
    assert abs(song["bpm"] - 128.0) < 0.05
    assert song["title"] == "groove"

    # same file again -> same song, not duplicated
    again = client.post("/api/songs", files={"file": ("copy.wav", wav_bytes(), "audio/wav")}).json()
    assert again["song"]["id"] == song["id"] and not again["created"]
    assert len(client.get("/api/songs").json()["songs"]) == 1

    audio = client.get(f"/api/songs/{song['id']}/audio")
    assert audio.status_code == 200 and audio.headers["content-type"] == "audio/flac"
    pcm, sr = sf.read(io.BytesIO(audio.content))
    assert sr == 44100 and abs(len(pcm) / sr * 1000 - song["durationMs"]) < 1

    analysis = client.get(f"/api/songs/{song['id']}/analysis").json()
    assert analysis["tempo"]["constant"]

    r = client.post(f"/api/songs/{song['id']}/charts", json={"keyMode": "7K+1S", "difficulty": "HARD"})
    assert r.status_code == 200, r.text
    chart = r.json()["chart"]
    assert not r.json()["cached"]
    assert chart["meta"]["songId"] == song["id"] and chart["notes"]
    cached = client.post(f"/api/songs/{song['id']}/charts", json={"keyMode": "7K+1S", "difficulty": "HARD"}).json()
    assert cached["cached"] and cached["chart"]["meta"]["chartId"] == chart["meta"]["chartId"]
    fresh = client.post(f"/api/songs/{song['id']}/charts", json={"keyMode": "7K+1S", "difficulty": "HARD", "newSeed": True}).json()
    assert fresh["chart"]["meta"]["chartId"] != chart["meta"]["chartId"]
    assert client.get(f"/api/charts/{chart['meta']['chartId']}").status_code == 200

    score = {
        "chartId": chart["meta"]["chartId"],
        "songId": song["id"],
        "score": 912345,
        "rate": 91.23,
        "maxCombo": 300,
        "lamp": "CLEAR",
        "judgementMode": "NORMAL",
        "breaks": 4,
    }
    assert client.post("/api/scores", json=score).status_code == 201
    assert client.post("/api/scores", json=dict(score, score=950000, rate=95.0, lamp="MAX COMBO")).status_code == 201
    assert client.post("/api/scores", json=dict(score, autoPlay=True)).status_code == 400
    after_best = time.time()
    assert client.post("/api/scores", json=dict(score, score=800000, rate=80.0, lamp="FAILED")).status_code == 201
    records = client.get(f"/api/songs/{song['id']}/scores").json()["records"]
    assert len(records) == 1
    assert records[0]["score"] == 950000 and records[0]["lamp"] == "MAX COMBO" and records[0]["plays"] == 3
    # the last play of the chart, not the best one (the song select's 최근 플레이순)
    assert after_best <= records[0]["lastPlayedAt"] <= time.time()


def test_brief_charts_and_the_records_of_a_chart(client: TestClient) -> None:
    song = client.post("/api/songs/demo", json={"bpm": 140, "bars": 16}).json()["song"]
    req = {"keyMode": "4K", "difficulty": "NM", "system": "DJMAX"}
    # the song select's levels: the meta alone, of the same (cached) chart
    brief = client.post(f"/api/songs/{song['id']}/charts", json={**req, "brief": True}).json()
    assert "chart" not in brief and not brief["cached"] and "notes" not in brief["meta"]
    # made for its brief only, it is not saved (looking at songs does not fill the disk)
    assert client.get(f"/api/charts/{brief['meta']['chartId']}").status_code == 404
    again = client.post(f"/api/songs/{song['id']}/charts", json={**req, "brief": True}).json()
    assert again["cached"] and again["meta"] == brief["meta"]
    # asked for whole: not made again, saved now
    full = client.post(f"/api/songs/{song['id']}/charts", json=req).json()
    assert full["cached"] and full["chart"]["meta"]["chartId"] == brief["meta"]["chartId"]
    assert client.get(f"/api/charts/{brief['meta']['chartId']}").status_code == 200
    assert full["chart"]["meta"]["level"] == brief["meta"]["level"] and full["chart"]["meta"]["noteCount"] == brief["meta"]["noteCount"]
    other = client.post(f"/api/songs/{song['id']}/charts", json={**req, "newSeed": True}).json()["chart"]

    cid = full["chart"]["meta"]["chartId"]
    play = {"chartId": cid, "songId": song["id"], "judgementMode": "NORMAL"}
    plays = [
        dict(play, score=900000, rate=90.0, maxCombo=120, lamp="CLEAR", breaks=6, detail={"ruleset": "RESPECT"}),
        dict(play, score=880000, rate=88.0, maxCombo=200, lamp="HARD CLEAR", breaks=3, detail={"ruleset": "EXSCORE", "exScore": 412}),
        dict(play, score=870000, rate=87.0, maxCombo=90, lamp="FAILED", breaks=9, detail={"ruleset": "GRADE", "weightedScore": 861234.4}),
        dict(play, score=860000, rate=86.0, maxCombo=95, lamp="FAILED", breaks=2, detail={"ruleset": "EXSCORE", "exScore": 380}),
    ]
    for p in plays:
        assert client.post("/api/scores", json=p).status_code == 201
    assert client.post("/api/scores", json=dict(play, chartId=other["meta"]["chartId"], score=1, rate=1, maxCombo=1, lamp="FAILED", breaks=50)).status_code == 201
    records = {r["chartId"]: r for r in client.get(f"/api/songs/{song['id']}/scores").json()["records"]}
    r = records[cid]
    # the best play's score and RATE; the best lamp and MAX COMBO and the fewest BREAK of any play
    assert (r["score"], r["rate"], r["lamp"], r["maxCombo"], r["minBreaks"], r["plays"]) == (900000, 90.0, "HARD CLEAR", 200, 2, 4)
    # the best of each score rule, among the plays under it
    assert r["exScore"] == 412 and r["weightedScore"] == 861234
    # the default pattern of its tier, and the other one not; the generator that made them
    assert r["defaultSeed"] is True and records[other["meta"]["chartId"]]["defaultSeed"] is False
    assert r["generatorVersion"] == full["chart"]["meta"]["generator"]["version"]
    assert records[other["meta"]["chartId"]]["exScore"] is None and records[other["meta"]["chartId"]]["weightedScore"] is None


def test_records_by_judgement_mode(client: TestClient) -> None:
    song = client.post("/api/songs/demo", json={"bpm": 140, "bars": 8}).json()["song"]
    cid = client.post(f"/api/songs/{song['id']}/charts", json={"keyMode": "4K", "difficulty": "NM", "system": "DJMAX"}).json()["chart"]["meta"]["chartId"]
    play = {"chartId": cid, "songId": song["id"]}
    plays = [
        dict(play, judgementMode="NORMAL", score=950000, rate=95.0, maxCombo=180, lamp="CLEAR", breaks=4, detail={"ruleset": "RESPECT"}),
        dict(play, judgementMode="NORMAL", score=930000, rate=93.0, maxCombo=200, lamp="HARD CLEAR", breaks=2, detail={"ruleset": "EXSCORE", "exScore": 300}),
        dict(play, judgementMode="HARD", score=800000, rate=80.0, maxCombo=90, lamp="CLEAR", breaks=7, detail={"ruleset": "EXSCORE", "exScore": 250}),
        dict(play, judgementMode="HARD", score=820000, rate=82.0, maxCombo=60, lamp="FAILED", breaks=9, detail={"ruleset": "RESPECT"}),
    ]
    ids = [client.post("/api/scores", json=p).json()["id"] for p in plays]
    r = client.get(f"/api/songs/{song['id']}/scores").json()["records"][0]
    # the chart's record is the best of every play, whatever its judgement mode
    assert (r["score"], r["lamp"], r["maxCombo"], r["minBreaks"], r["exScore"], r["plays"]) == (950000, "HARD CLEAR", 200, 2, 300, 4)
    # and the bests of each judgement mode on their own, which a play is compared with
    normal, hard = r["byMode"]["NORMAL"], r["byMode"]["HARD"]
    assert set(r["byMode"]) == {"NORMAL", "HARD"}
    assert (normal["score"], normal["rate"], normal["lamp"], normal["minBreaks"], normal["exScore"], normal["weightedScore"], normal["plays"]) == (950000, 95.0, "HARD CLEAR", 2, 300, None, 2)
    assert (hard["score"], hard["rate"], hard["lamp"], hard["minBreaks"], hard["exScore"], hard["maxCombo"], hard["plays"]) == (820000, 82.0, "CLEAR", 7, 250, 90, 2)
    assert (normal["bestScoreId"], hard["bestScoreId"]) == (ids[0], ids[3])
    # a song's own records carry them (the result screen asks for these); the library's list does not
    assert "byMode" in client.get(f"/api/songs/{song['id']}").json()["song"]["records"][0]
    assert all("byMode" not in rec for s in client.get("/api/songs").json()["songs"] for rec in s["records"])


def test_the_fewest_break_is_of_the_runs_that_reached_the_end(client: TestClient) -> None:
    song = client.post("/api/songs/demo", json={"bpm": 140, "bars": 8}).json()["song"]
    cid = client.post(f"/api/songs/{song['id']}/charts", json={"keyMode": "4K", "difficulty": "NM", "system": "DJMAX"}).json()["chart"]["meta"]["chartId"]
    play = {"chartId": cid, "songId": song["id"], "score": 500000, "rate": 50.0, "maxCombo": 40}

    def record() -> dict:
        return client.get(f"/api/songs/{song['id']}/scores").json()["records"][0]

    # a HAZARD run stopped by its first BREAK: the notes after it were never played, so its 1 is no fewest
    hazard = dict(play, judgementMode="NORMAL", lamp="FAILED", breaks=1, detail={"ruleset": "RESPECT", "gauge": "HAZARD", "failedAtMs": 9100.0})
    assert client.post("/api/scores", json=hazard).status_code == 201
    r = record()
    assert (r["minBreaks"], r["byMode"]["NORMAL"]["minBreaks"], r["plays"]) == (None, None, 1)
    assert all(rec["minBreaks"] is None for s in client.get("/api/songs").json()["songs"] if s["id"] == song["id"] for rec in s["records"])
    plays = [
        # a clear; a NORMAL gauge that ended under its clear line (it played every note), saved
        # without failedAtMs as plays from before it was kept
        dict(play, judgementMode="NORMAL", lamp="CLEAR", breaks=16, detail={"ruleset": "RESPECT", "gauge": "NORMAL", "failedAtMs": None}),
        dict(play, judgementMode="NORMAL", lamp="FAILED", breaks=12, detail={"ruleset": "RESPECT"}),
        # HARD JUDGEMENT: an EX-HARD run that failed partway, and a clear
        dict(play, judgementMode="HARD", lamp="FAILED", breaks=2, detail={"ruleset": "RESPECT", "gauge": "EX-HARD", "failedAtMs": 30000.0}),
        dict(play, judgementMode="HARD", lamp="HARD CLEAR", breaks=5, detail={"ruleset": "RESPECT", "gauge": "HARD", "failedAtMs": None}),
    ]
    for p in plays:
        assert client.post("/api/scores", json=p).status_code == 201
    r = record()
    assert (r["minBreaks"], r["byMode"]["NORMAL"]["minBreaks"], r["byMode"]["HARD"]["minBreaks"], r["plays"]) == (5, 12, 5, 5)


def png_bytes() -> bytes:
    """A 1×1 PNG."""
    import struct
    import zlib

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b"")


def test_a_song_takes_a_picture_as_its_cover(client: TestClient) -> None:
    song = client.post("/api/songs/demo", json={"bpm": 140, "bars": 8}).json()["song"]
    assert not song["hasCover"] and song["coverAt"] is None
    assert client.get(f"/api/songs/{song['id']}/cover").status_code == 404
    # its content decides what it is, whatever it is called
    r = client.post(f"/api/songs/{song['id']}/cover", files={"file": ("jacket.jpg", png_bytes(), "image/jpeg")})
    assert r.status_code == 201, r.text
    covered = r.json()["song"]
    assert covered["hasCover"] and covered["coverAt"] is not None
    got = client.get(f"/api/songs/{song['id']}/cover")
    assert got.status_code == 200 and got.headers["content-type"] == "image/png" and got.content == png_bytes()
    assert client.post(f"/api/songs/{song['id']}/cover", files={"file": ("notes.png", b"not a picture", "image/png")}).status_code == 415
    assert client.delete(f"/api/songs/{song['id']}/cover").status_code == 204
    after = client.get(f"/api/songs/{song['id']}").json()["song"]
    assert not after["hasCover"] and after["coverAt"] >= covered["coverAt"]
    assert client.get(f"/api/songs/{song['id']}/cover").status_code == 404


def test_bpm_correction_triggers_reanalysis(client: TestClient) -> None:
    song = client.post("/api/songs", files={"file": ("g.wav", wav_bytes(), "audio/wav")}).json()["song"]
    r = client.patch(f"/api/songs/{song['id']}", json={"bpm": 64.0, "title": "새 제목"})
    body = r.json()
    assert body["reanalyzing"] and body["song"]["title"] == "새 제목"
    assert abs(body["song"]["bpm"] - 64.0) < 1e-6
    r = client.patch(f"/api/songs/{song['id']}", json={"clearBpm": True})
    assert abs(r.json()["song"]["bpm"] - 128.0) < 0.05


def test_demo_song_and_errors(client: TestClient) -> None:
    demo = client.post("/api/songs/demo", json={"bpm": 140, "bars": 16}).json()["song"]
    assert demo["status"] == "ready" and abs(demo["bpm"] - 140) < 0.05
    assert client.post("/api/songs", files={"file": ("x.txt", b"nope", "text/plain")}).status_code == 415
    assert client.post("/api/songs", files={"file": ("bad.mp3", b"not audio", "audio/mpeg")}).status_code == 422
    assert client.get("/api/songs/does-not-exist").status_code == 404
    assert client.post(f"/api/songs/{demo['id']}/charts", json={"keyMode": "9K"}).status_code == 400
    assert client.delete(f"/api/songs/{demo['id']}").status_code == 204
    assert client.get("/api/songs").json()["songs"] == []


def test_decoding_other_formats(tmp_path) -> None:
    from rhythm_server import audio_io

    song = synth(128.0, 4, 3)
    for fmt, ext in (("FLAC", ".flac"), ("OGG", ".ogg")):
        path = tmp_path / f"s{ext}"
        sf.write(path, song.pcm, song.sample_rate, format=fmt)
        pcm = audio_io.decode_audio(path)
        assert pcm.shape[1] == 2
        assert abs(len(pcm) - len(song.pcm)) < song.sample_rate * 0.05
    mono = tmp_path / "mono48k.wav"
    sf.write(mono, np.mean(song.pcm, axis=1), 48000)
    pcm = audio_io.decode_audio(mono)
    assert pcm.shape[1] == 2  # resampled to 44.1k stereo


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs the ffmpeg CLI to build a tagged file")
def test_tags_and_cover_are_imported(client: TestClient, tmp_path) -> None:
    song = synth(128.0, 4, 3)
    wav = tmp_path / "in.wav"
    sf.write(wav, song.pcm, song.sample_rate)
    cover = tmp_path / "cover.png"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-frames:v", "1", str(cover)], check=True)
    mp3 = tmp_path / "tagged.mp3"
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-i", str(cover), "-map", "0", "-map", "1", "-c:a", "libmp3lame",
         "-c:v", "png", "-disposition:v", "attached_pic", "-id3v2_version", "3", "-metadata", "title=태그 제목", "-metadata", "artist=태그 아티스트", str(mp3)],
        check=True,
    )
    body = client.post("/api/songs", files={"file": ("tagged.mp3", mp3.read_bytes(), "audio/mpeg")}).json()["song"]
    assert body["title"] == "태그 제목" and body["artist"] == "태그 아티스트" and body["hasCover"]
    r = client.get(f"/api/songs/{body['id']}/cover")
    assert r.status_code == 200 and r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert abs(body["durationMs"] - len(song.pcm) / song.sample_rate * 1000) < 30  # encoder delay/padding trimmed


def test_ids_are_validated_before_touching_files(client: TestClient) -> None:
    assert client.get("/api/charts/..%2F..%2Flibrary").status_code == 404
    assert client.get("/api/charts/not-a-chart").status_code == 404
    assert client.get("/api/songs/..%2Fcharts/analysis").status_code == 404
    assert client.get("/api/songs/ABCDEF0123456789").status_code == 404


def test_sketch_is_the_songs_sections_and_peaks(client: TestClient) -> None:
    song = client.post("/api/songs", files={"file": ("groove.wav", wav_bytes(), "audio/wav")}).json()["song"]
    sketch = client.get(f"/api/songs/{song['id']}/sketch").json()
    analysis = client.get(f"/api/songs/{song['id']}/analysis").json()
    assert len(sketch["peaks"]) == 64 and max(sketch["peaks"]) == 1.0 and min(sketch["peaks"]) >= 0.0
    assert [s["label"] for s in sketch["sections"]] == [s["label"] for s in analysis["sections"]]
    assert sketch["beatsPerBar"] == 4 and sketch["previewMs"] == analysis["previewMs"]
    assert set(sketch["stems"]) == {"drums", "bass", "vocals", "other"}
    assert client.get("/api/songs/0000000000000000/sketch").status_code == 404
