from __future__ import annotations

import io
import shutil
import subprocess

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
    records = client.get(f"/api/songs/{song['id']}/scores").json()["records"]
    assert len(records) == 1
    assert records[0]["score"] == 950000 and records[0]["lamp"] == "MAX COMBO" and records[0]["plays"] == 2


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
