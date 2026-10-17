"""Phase 4: chart formats (osu!mania, BMS, bmson), imports with keysounds, edited charts."""

from __future__ import annotations

import io
import json
import zipfile
from functools import lru_cache
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.api.app import create_app
from rhythm_server.formats import FormatError, export_chart, export_formats, parse_bms, parse_bmson, parse_osu
from rhythm_server.formats.bms import export_bms
from rhythm_server.formats.bmson import export_bmson
from rhythm_server.formats.osu import export_osu
from rhythm_server.generator import generate_chart
from rhythm_server.generator.tempo import TempoMap
from rhythm_server.synth import make_song

SR = 44100


@lru_cache(maxsize=None)
def analysis() -> dict:
    song = make_song(132.0, 16, seed=2, offset=0.6)
    return analyze(song.pcm, song.sample_rate, "sha256:phase4", backends={})


def _same_notes(expected: list[dict], got: list[dict], tol_ms: float) -> None:
    a = sorted(expected, key=lambda n: (round(n["t"]), n["lane"]))
    b = sorted(got, key=lambda n: (round(n["t"]), n["lane"]))
    assert len(a) == len(b)
    for x, y in zip(a, b):
        assert (x["lane"], x["type"]) == (y["lane"], y["type"])
        assert abs(x["t"] - y["t"]) <= tol_ms
        if x["type"] == "hold":
            assert abs(x["endT"] - y["endT"]) <= tol_ms


def test_tempo_map_stops_pause_the_beat_clock() -> None:
    tempo = TempoMap({"offsetMs": 0, "tempoMap": [{"beat": 0, "bpm": 120}], "stops": [{"beat": 4, "durationMs": 1000}]})
    assert tempo.beat_to_ms(4) == pytest.approx(2000)  # a note on the stop's beat is hit when it starts
    assert tempo.beat_to_ms(4.5) == pytest.approx(3250)
    assert tempo.ms_to_beat(2500) == pytest.approx(4)  # inside the stop
    assert tempo.ms_to_beat(3250) == pytest.approx(4.5)
    assert tempo.ms_to_beat(1000) == pytest.approx(2)


@pytest.mark.parametrize("mode", ["4K", "6K+FX", "7K+1S", "8K"])
def test_osu_export_round_trip(mode: str) -> None:
    chart = generate_chart(analysis(), mode, "HARD", seed=4)
    parsed = parse_osu(export_osu(chart, "song.ogg", preview_ms=1000), "x.osu")
    assert parsed.key_mode == mode and parsed.audio_file == "song.ogg"
    _same_notes(chart["notes"], parsed.notes, 0.5)  # osu! stores whole milliseconds


@pytest.mark.parametrize("mode", ["5K", "7K+1S"])
def test_bms_and_bmson_export_round_trip(mode: str) -> None:
    chart = generate_chart(analysis(), mode, "MASTER", seed=4)
    text, ext = export_bms(chart, "song.ogg")
    assert ext == (".bme" if mode == "7K+1S" else ".bms")
    bms = parse_bms(text.encode("utf-8"), "x" + ext)
    assert bms.key_mode == mode and bms.sounds == ["song.ogg"] and bms.bgm[0]["t"] == pytest.approx(0, abs=1e-6)
    _same_notes(chart["notes"], bms.notes, 0.01)
    bmson = parse_bmson(json.dumps(export_bmson(chart, "song.ogg")).encode(), "x.bmson")
    assert bmson.key_mode == mode and bmson.bgm[0]["t"] == pytest.approx(0, abs=0.5)
    _same_notes(chart["notes"], bmson.notes, 0.5)


def test_export_formats_by_key_mode() -> None:
    assert export_formats("7K+1S") == ["osu", "bms", "bmson"]
    assert export_formats("4K") == ["osu"]
    chart = generate_chart(analysis(), "4K", "NORMAL", seed=1)
    with pytest.raises(FormatError):
        export_chart(chart, "bms", "song.ogg")
    data, name, media = export_chart(chart, "osu", "노래.mp3", offset_ms=25)
    assert name.endswith(".osu") and media.startswith("text/plain")
    text = data.decode("utf-8")
    assert "AudioFilename: 노래.mp3" in text
    first = min(int(l.split(",")[2]) for l in text.split("[HitObjects]")[1].strip().splitlines())
    assert first == round(min(n["t"] for n in chart["notes"]) + 25)


def _bms(lines: list[str]) -> bytes:
    return ("\n".join(lines) + "\n").encode("utf-8")


def test_bms_timing_long_notes_and_random() -> None:
    head = ["#BPM 120", "#WAV01 a.wav", "#WAV02 b.wav", "#BPM01 150", "#STOP01 96", "#LNTYPE 1", "#LNOBJ ZZ"]
    data = _bms(
        head
        + [
            "#00002:0.75",  # measure 0 is 3 beats
            "#00111:01",  # beat 3
            "#00108:0001",  # 150 BPM from beat 5
            "#00109:01",  # 1s stop at beat 3 (2 beats at 120 BPM)
            "#00212:01ZZ",  # LNOBJ long note: beats 7 -> 9
            "#00351:0101",  # LNTYPE 1 long note: beats 11 -> 13
            "#00401:02",  # background sound
            "#RANDOM 2",
            "#IF 1",
            "#00413:01",
            "#ELSE",
            "#00414:01",
            "#ENDIF",
            "#ENDRANDOM",
        ]
    )
    a = parse_bms(data, "x.bms", seed=1)
    assert a.timing["meter"][:2] == [{"measure": 0, "beatsPerMeasure": 3}, {"measure": 1, "beatsPerMeasure": 4}]
    assert a.timing["stops"] == [{"beat": 3.0, "durationMs": pytest.approx(1000.0)}]
    assert a.timing["tempoMap"] == [{"beat": 0.0, "bpm": 120.0}, {"beat": 5.0, "bpm": 150.0}]
    taps = {round(n["beat"], 6): n for n in a.notes if n["type"] == "tap"}
    assert taps[3.0]["t"] == pytest.approx(1500)  # on the stop's beat: at its start
    holds = sorted((n for n in a.notes if n["type"] == "hold"), key=lambda n: n["beat"])
    assert [(h["beat"], h["endBeat"], h["lane"]) for h in holds] == [(7.0, 9.0, 1), (11.0, 13.0, 0)]  # 5K: key n -> lane n-1
    # 1500 + 1000 (stop) + 2 beats at 120 + 2 beats at 150 to beat 7
    assert holds[0]["t"] == pytest.approx(2500 + 1000 + 800)
    assert a.bgm and a.sounds[a.bgm[0]["snd"]] == "b.wav"
    # #RANDOM picks one branch, the same one for the same seed
    random_lanes = {n["lane"] for n in a.notes if n["beat"] >= 15}
    assert len(random_lanes) == 1
    assert {n["lane"] for n in parse_bms(data, "x.bms", seed=1).notes if n["beat"] >= 15} == random_lanes
    assert a.key_mode == "5K"


def test_bms_modes_encodings_and_rejections() -> None:
    seven = parse_bms(_bms(["#BPM 140", "#00119:01", "#00116:01"]), "x.bme")
    assert seven.key_mode == "7K+1S" and {n["lane"] for n in seven.notes} == {0, 7}
    five_scratch = parse_bms(_bms(["#BPM 140", "#00111:01", "#00116:01"]), "x.bms")
    assert five_scratch.key_mode == "7K+1S" and {n["lane"] for n in five_scratch.notes} == {0, 1}
    with pytest.raises(FormatError, match="DP"):
        parse_bms(_bms(["#BPM 140", "#00111:01", "#00121:01"]), "x.bme")
    with pytest.raises(FormatError, match="PMS"):
        parse_bms(_bms(["#BPM 140", "#00111:01"]), "x.pms")
    sjis = "#TITLE テスト曲\n#BPM 140\n#00111:01\n".encode("cp932")
    assert parse_bms(sjis, "x.bms").title == "テスト曲"
    euckr = "#TITLE 테스트 곡\n#BPM 140\n#00111:01\n".encode("cp949")
    assert parse_bms(euckr, "x.bms").title == "테스트 곡"


def test_bmson_slices_and_layout() -> None:
    doc = {
        "version": "1.0.0",
        "info": {"title": "S", "artist": "A", "mode_hint": "beat-7k", "init_bpm": 120, "resolution": 240},
        "lines": [{"y": 0}, {"y": 960}],
        "bpm_events": [],
        "stop_events": [{"y": 1920, "duration": 240}],
        "sound_channels": [
            {"name": "stem.ogg", "notes": [{"x": 1, "y": 0, "l": 0, "c": False}, {"x": 2, "y": 480, "l": 0, "c": True}, {"x": 0, "y": 960, "l": 0, "c": True}]},
            {"name": "bass.wav", "notes": [{"x": 8, "y": 0, "l": 960, "c": False}, {"x": 1, "y": 0, "l": 0, "c": False}]},
        ],
    }
    p = parse_bmson(json.dumps(doc).encode(), "s.bmson")
    assert p.key_mode == "7K+1S" and p.sounds == ["stem.ogg", "bass.wav"]
    by_lane = {n["lane"]: n for n in p.notes}
    assert by_lane[2]["so"] == pytest.approx(1000) and by_lane[2]["sl"] == pytest.approx(1000)  # continues the stem
    assert by_lane[1]["sl"] == pytest.approx(1000) and "so" not in by_lane[1]
    assert by_lane[0]["type"] == "hold" and by_lane[0]["endT"] == pytest.approx(2000)
    assert [(e["t"], p.sounds[e["snd"]], e.get("so")) for e in p.bgm] == [(0.0, "bass.wav", None), (2000.0, "stem.ogg", 2000.0)]
    assert p.timing["stops"][0]["durationMs"] == pytest.approx(500)
    with pytest.raises(FormatError):
        parse_bmson(json.dumps({**doc, "info": {**doc["info"], "mode_hint": "popn-9k"}}).encode(), "s.bmson")


def test_osu_import_layouts_and_timing_points() -> None:
    text = "\n".join(
        [
            "osu file format v14",
            "[General]",
            "AudioFilename: a.mp3",
            "Mode: 3",
            "[Metadata]",
            "Title:Song",
            "TitleUnicode:노래",
            "Version:Hard",
            "[Difficulty]",
            "CircleSize:7",
            "[TimingPoints]",
            "1000,500,4,2,0,60,1,0",
            "1000,-50,4,2,0,60,0,0",  # inherited (scroll speed): ignored
            "4250,400,4,2,0,60,1,0",  # new tempo 6.5 beats later: the bar before it is cut short
            "[HitObjects]",
            "36,192,1000,1,0,0:0:0:0:",
            "475,192,1500,128,0,2000:0:0:0:0:",
            "475,192,1500,1,0,0:0:0:0:",  # stacked on the long note: dropped
        ]
    )
    p = parse_osu(text, "a.osu")
    assert p.key_mode == "7K+1S" and p.title == "노래" and p.chart_name == "Hard" and p.dropped == 1
    assert {(n["lane"], n["type"]) for n in p.notes} == {(1, "tap"), (7, "hold")}
    assert p.timing["offsetMs"] == 1000 and p.timing["tempoMap"] == [{"beat": 0.0, "bpm": 120.0}, {"beat": 6.5, "bpm": 150.0}]
    assert p.timing["meter"][:3] == [{"measure": 0, "beatsPerMeasure": 4}, {"measure": 1, "beatsPerMeasure": 2.5}, {"measure": 2, "beatsPerMeasure": 4}]
    special = parse_osu(text.replace("CircleSize:7", "CircleSize:8").replace("Mode: 3", "Mode: 3\nSpecialStyle: 1"), "a.osu")
    assert special.key_mode == "7K+1S"
    assert parse_osu(text.replace("CircleSize:7", "CircleSize:8"), "a.osu").key_mode == "8K"
    with pytest.raises(FormatError):
        parse_osu(text.replace("Mode: 3", "Mode: 0"), "a.osu")


# ---------------------------------------------------------------- import API


def _tone(freq: float, dur: float, decay: float, amp: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = (amp * np.sin(2 * np.pi * freq * t) * np.exp(-t / decay)).astype(np.float32)
    return np.stack([x, x], axis=1)


def bms_package() -> dict[str, bytes]:
    """A small keysounded BMS (synthesized samples); `kick.wav` ships as `kick.ogg`."""
    files: dict[str, bytes] = {}

    def wav(name: str, x: np.ndarray, fmt: str) -> None:
        buf = io.BytesIO()
        sf.write(buf, x, SR, format=fmt)
        files[name] = buf.getvalue()

    wav("kick.ogg", _tone(55, 0.3, 0.08, 0.9), "OGG")
    for i, f in enumerate([261.6, 329.6, 392.0]):
        wav(f"lead{i}.wav", _tone(f, 0.4, 0.2, 0.4), "WAV")
    lines = ["#TITLE Test Song [ANOTHER]", "#ARTIST Synth", "#BPM 120", "#PLAYLEVEL 7", "#WAV01 kick.wav"]
    lines += [f"#WAV1{i} lead{i}.wav" for i in range(3)]
    for m in range(1, 9):
        lines += [f"#{m:03d}01:01010101", f"#{m:03d}12:10001100", f"#{m:03d}19:00120012"]
    files["song_another.bme"] = ("\n".join(lines) + "\n").encode("utf-8")
    return files


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(tmp_path, client_dist=None, synchronous_jobs=True))


def test_import_bms_folder_renders_keysounds(client: TestClient) -> None:
    pkg = bms_package()
    files = [("files", (name, data, "application/octet-stream")) for name, data in pkg.items()]
    r = client.post("/api/import", files=files, data={"paths": [f"Test/{n}" for n in pkg]})
    assert r.status_code == 201, r.text
    body = r.json()
    song = body["songs"][0]
    assert song["title"] == "Test Song" and song["status"] == "ready" and body["warnings"] == []
    charts = client.get(f"/api/songs/{song['id']}/charts").json()["charts"]
    assert [c["kind"] for c in charts] == ["imported"] and charts[0]["keyMode"] == "7K+1S"
    chart = client.get(f"/api/charts/{charts[0]['chartId']}").json()["chart"]
    assert "kick.wav" in chart["sounds"] and len(chart["bgm"]) == 32 and 0 < chart["meta"]["keysoundGain"] <= 1
    index = client.get(f"/api/songs/{song['id']}/keysounds.json").json()
    assert set(index["sounds"]) == {"kick.wav", "lead0.wav", "lead1.wav", "lead2.wav"}
    sprite, sr = sf.read(io.BytesIO(client.get(f"/api/songs/{song['id']}/keysounds.flac").content), always_2d=True)
    start, length = index["sounds"]["kick.wav"]
    assert sr == SR and np.max(np.abs(sprite[start : start + length])) > 0.4
    # the rendered song has the kick exactly on the BMS beats (measure 1 starts at 2000ms)
    mix, _ = sf.read(io.BytesIO(client.get(f"/api/songs/{song['id']}/audio").content), always_2d=True)
    level = lambda ms: float(np.max(np.abs(mix[int(ms * SR / 1000) : int((ms + 10) * SR / 1000)])))  # noqa: E731
    assert level(1900) < 1e-3 and level(2000) > 0.05 and level(2500) > 0.05
    analysis_bpm = client.get(f"/api/songs/{song['id']}").json()["song"]["bpm"]
    assert abs(analysis_bpm - 120) < 0.5
    # importing the same package again finds the same song and chart
    again = client.post("/api/import", files=files, data={"paths": [f"Test/{n}" for n in pkg]}).json()
    assert again["songs"][0]["id"] == song["id"] and again["charts"][0]["chartId"] == charts[0]["chartId"]
    # an imported keysound chart exports back with its sounds
    bms = client.get(f"/api/charts/{charts[0]['chartId']}/export", params={"format": "bms"})
    assert bms.status_code == 200 and "kick.wav" in bms.text and "#SUBTITLE Lv.7" in bms.text


def test_import_osz_uses_its_audio(client: TestClient, tmp_path: Path) -> None:
    song = make_song(128.0, 12, seed=8, offset=0.4)
    buf = io.BytesIO()
    sf.write(buf, song.pcm, SR, format="WAV")
    a = analyze(song.pcm, SR, "sha256:osz", backends={})
    chart = generate_chart(a, "4K", "HARD", seed=2)
    osz = io.BytesIO()
    with zipfile.ZipFile(osz, "w") as zf:
        zf.writestr("audio.wav", buf.getvalue())
        zf.writestr("Song (grg) [HARD].osu", export_osu(chart, "audio.wav"))
        zf.writestr("bg.jpg", b"not imported")
    r = client.post("/api/import", files=[("files", ("song.osz", osz.getvalue(), "application/octet-stream"))])
    assert r.status_code == 201, r.text
    body = r.json()
    imported = client.get(f"/api/charts/{body['charts'][0]['chartId']}").json()["chart"]
    assert imported["meta"]["source"] == {"kind": "imported", "format": "osu", "file": "Song (grg) [HARD].osu"}
    _same_notes(chart["notes"], imported["notes"], 0.5)
    assert body["songs"][0]["originalName"] == "audio.wav"


def test_import_reports_unusable_packages(client: TestClient) -> None:
    r = client.post("/api/import", files=[("files", ("readme.txt", b"hello", "text/plain"))])
    assert r.status_code == 422
    r = client.post("/api/import", files=[("files", ("x.bms", b"#BPM 120\n#00121:01\n", "text/plain"))])
    assert r.status_code == 422 and "DP" in r.json()["detail"]


def test_edited_charts_are_saved_validated_and_deleted(client: TestClient) -> None:
    sid = client.post("/api/songs/demo", json={"bpm": 128, "bars": 12, "seed": 3}).json()["song"]["id"]
    base = client.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "NORMAL"}).json()["chart"]
    notes = [dict(n) for n in base["notes"][1:]]  # delete the first note
    notes.append({"t": base["notes"][-1]["t"] + 1000, "lane": 0, "type": "hold", "endT": base["notes"][-1]["t"] + 1500})
    r = client.post(f"/api/songs/{sid}/charts/custom", json={"baseChartId": base["meta"]["chartId"], "notes": notes, "name": "내 편집"})
    assert r.status_code == 201, r.text
    edited = r.json()["chart"]
    assert edited["meta"]["chartId"] != base["meta"]["chartId"] and edited["meta"]["chartName"] == "내 편집"
    assert edited["meta"]["source"] == {"kind": "edited", "from": base["meta"]["chartId"]}
    assert edited["meta"]["noteCount"] == len(base["notes"]) and edited["timing"] == base["timing"]
    assert edited["notes"][-1]["beat"] == pytest.approx(TempoMap(base["timing"]).ms_to_beat(edited["notes"][-1]["t"]), abs=1e-6)
    saved = client.get(f"/api/songs/{sid}/charts").json()["charts"]
    assert [c["chartId"] for c in saved] == [edited["meta"]["chartId"]] and saved[0]["kind"] == "edited"
    # the same notes again: the same chart
    again = client.post(f"/api/songs/{sid}/charts/custom", json={"baseChartId": base["meta"]["chartId"], "notes": notes, "name": "내 편집"}).json()
    assert again["chart"]["meta"]["chartId"] == edited["meta"]["chartId"]
    bad = notes + [dict(notes[0])]
    r = client.post(f"/api/songs/{sid}/charts/custom", json={"baseChartId": base["meta"]["chartId"], "notes": bad})
    assert r.status_code == 422 and "같은 레인" in r.json()["detail"]
    assert client.get(f"/api/charts/{edited['meta']['chartId']}/export", params={"format": "bms"}).status_code == 400
    assert client.delete(f"/api/charts/{edited['meta']['chartId']}").status_code == 204
    assert client.get(f"/api/songs/{sid}/charts").json()["charts"] == []
