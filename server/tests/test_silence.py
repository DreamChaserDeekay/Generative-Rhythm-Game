"""Silences of a song (mapper/silence.py): Mapperatorinator is asked to stop at the music's end, and
notes it puts in a silence are dropped when its .osu becomes a chart."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from rhythm_server.config import load_config
from rhythm_server.mapper import charts
from rhythm_server.mapper.runtime import mapper_config
from rhythm_server.mapper.silence import music_end, quiet_spans

from conftest import analysis_of
from fakes import osu, x_of

SR = 44100
CFG = load_config("mapper")["silence"]


def _tone(seconds: float, gain: float = 0.5) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    return (gain * np.sin(2 * np.pi * 220.0 * t)).astype(np.float32)


def test_silences_are_found_in_the_audio_and_the_music_ends_before_a_silent_tail() -> None:
    quiet = np.zeros(int(SR * 3.0), dtype=np.float32)
    # 4 s of music, 3 s of silence, 2 s of music, a 0.5 s gap (too short), 1 s of music, 5 s of silence
    pcm = np.concatenate([_tone(4), quiet, _tone(2), np.zeros(SR // 2, dtype=np.float32), _tone(1), np.zeros(SR * 5, dtype=np.float32)])
    spans = quiet_spans(np.stack([pcm, pcm], axis=1), SR, CFG)
    assert len(spans) == 2
    assert abs(spans[0][0] - 4000) <= 50 and abs(spans[0][1] - 7000) <= 50
    assert abs(spans[1][0] - 10500) <= 50 and spans[1][1] == 15500.0
    assert abs(music_end(spans, 15500.0) - 10500) <= 50
    # a song that plays to its end has no end to stop at; a very quiet tail counts as silence
    assert music_end(quiet_spans(_tone(5), SR, CFG), 5000.0) is None
    faded = np.concatenate([_tone(5), _tone(3, gain=0.5 * 10 ** (-50 / 20))])
    assert abs(music_end(quiet_spans(faded, SR, CFG), 8000.0) - 5000) <= 50


def test_notes_in_a_silence_are_dropped_and_holds_end_where_it_starts() -> None:
    quiet = [(4000.0, 7000.0), (10500.0, float("inf"))]
    notes = [
        {"t": 3900.0, "lane": 0, "type": "tap"},
        {"t": 4050.0, "lane": 1, "type": "tap"},  # just into the silence: its sound began before
        {"t": 5000.0, "lane": 2, "type": "tap"},  # in the silence
        {"t": 6990.0, "lane": 3, "type": "tap"},  # still in it
        {"t": 7000.0, "lane": 0, "type": "tap"},  # the music is back
        {"t": 3000.0, "lane": 4, "type": "hold", "endT": 6000.0},  # reaches into the silence
        {"t": 4080.0, "lane": 5, "type": "hold", "endT": 4500.0},  # too short once cut: a tap
        {"t": 9000.0, "lane": 1, "type": "hold", "endT": 9500.0},  # untouched
        {"t": 11000.0, "lane": 2, "type": "tap"},  # after the music's end
        {"t": 60000.0, "lane": 3, "type": "hold", "endT": 61000.0},
    ]
    kept, dropped = charts.drop_silent(notes, quiet, 100.0)
    assert dropped == 4 and [n["t"] for n in kept] == [3900.0, 4050.0, 7000.0, 3000.0, 4080.0, 9000.0]
    assert kept[3]["endT"] == 4100.0 and kept[3]["type"] == "hold"
    assert kept[4]["type"] == "tap" and "endT" not in kept[4]
    assert kept[5]["endT"] == 9500.0
    assert charts.drop_silent(notes, [], 100.0) == (notes, 0)


def test_a_chart_has_no_notes_in_the_songs_silences_or_past_its_end() -> None:
    a = analysis_of(128.0, 16, 1)
    duration = a["durationMs"]
    times = [1000, 2000, 3000, 5000, 6000, int(duration) - 500, int(duration) + 800, int(duration) + 4000]
    text = osu(4, [f"{x_of(i % 4, 4)},192,{t},1,0,0:0:0:0:" for i, t in enumerate(times)])
    cfg = dict(mapper_config())
    cid = charts.chart_id(a, "4K", "HARD", 6, 1, cfg)
    chart = charts.make_chart(a, "4K", "HARD", 6, 1, cid, cfg, {"songId": None, "title": "T"}, text, {}, None, None, [(4500.0, 6500.0)])
    assert [n["t"] for n in chart["notes"]] == [1000.0, 2000.0, 3000.0, float(int(duration) - 500)]
    assert chart["meta"]["generator"]["silentDropped"] == 4 and chart["meta"]["noteCount"] == 4


def test_the_request_stops_the_model_at_the_musics_end() -> None:
    cfg = dict(mapper_config())
    request = charts.request_for("6K", 10, 1, cfg, Path("a.wav"), Path("out"), None, {}, 180000.0)
    assert request["endTime"] == 180000 + cfg["silence"]["endPadMs"]
    assert charts.request_for("6K", 10, 1, cfg, Path("a.wav"), Path("out"), None, {})["endTime"] is None
