"""The camera from a chart's own notes (chart/camera_notes.py): sections by note density, build-ups
by bars filling up and by streams, accents by hitsounds or chords."""

from __future__ import annotations

from rhythm_server.chart.camera_notes import accents, camera_from_notes, sections_from_notes, streams
from rhythm_server.chart.lanes import lane_infos
from rhythm_server.config import load_config
from rhythm_server.mapper.charts import hits_from_osu

TIMING = {"offsetMs": 0.0, "tempoMap": [{"beat": 0, "bpm": 120.0}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]}


def _bar(bar: int, per_beat: float, lanes: tuple[int, ...] = (0, 1, 2, 3, 4, 5)) -> list[dict]:
    """A bar of evenly spaced notes (500 ms a beat), lanes in turn."""
    n = int(round(4 * per_beat))
    out = []
    for i in range(n):
        beat = bar * 4 + i * 4 / n
        out.append({"beat": beat, "t": beat * 500.0, "lane": lanes[i % len(lanes)], "type": "tap"})
    return out


def _song() -> list[dict]:
    """8 calm bars, 4 empty bars (a break), 2 bars filling up, 8 busy bars, 4 calm bars."""
    notes: list[dict] = []
    for b in range(8):
        notes += _bar(b, 1)
    notes += _bar(12, 1.5) + _bar(13, 3)
    for b in range(14, 22):
        notes += _bar(b, 4, lanes=(3, 4, 5, 3, 4, 0))  # mostly the right hand
    for b in range(22, 26):
        notes += _bar(b, 1)
    return notes


def test_sections_follow_the_density_of_the_notes() -> None:
    rows = sections_from_notes(_song(), TIMING)
    starts = [r["startBeat"] for r in rows]
    assert 32.0 in starts and 56.0 in starts and 88.0 in starts  # the break, the busy part, the calm end
    busy = next(r for r in rows if r["startBeat"] == 56.0)
    assert busy["label"] == "chorus" and busy["energy"] == 1.0 and busy["endBeat"] == 88.0
    rest = next(r for r in rows if r["startBeat"] == 32.0)
    assert rest["energy"] <= 0.25 and rest["label"] != "chorus"
    assert all(0.0 <= r["energy"] <= 1.0 and r["endBeat"] > r["startBeat"] for r in rows)
    assert sections_from_notes([], TIMING) == []


def test_the_camera_widens_in_a_break_closes_in_on_a_build_up_and_swings_where_it_is_busy() -> None:
    cues = camera_from_notes(_song(), TIMING, lane_infos("6K"))
    assert cues == sorted(cues, key=lambda e: (e["t"], e["type"]))
    views = [(e["beat"], e["value"]) for e in cues if e["type"] == "view"]
    assert any(v < 0 and 32.0 <= b < 48.0 for b, v in views)  # wider through the break
    assert any(v > 0 and 48.0 <= b < 56.0 for b, v in views)  # closing in as the bars fill up
    assert any(b == 56.0 and v == 0.0 for b, v in views)  # let go where the busy part lands
    assert any(e["type"] == "zoom" and e["beat"] == 56.0 and e["value"] >= 0.5 for e in cues)  # the landing
    swings = [e for e in cues if e["type"] == "swing"]
    assert [e["beat"] for e in swings] == [56.0, 72.0]  # the head of each four-bar phrase of the busy part
    assert swings[0]["value"] < 0 and swings[1]["value"] < 0  # away from the crowded right hand, both phrases
    assert 0.5 < abs(swings[0]["value"]) < 1.0  # eight notes a second: a little smaller
    assert [(e["beat"], e["value"]) for e in cues if e["type"] == "dive"] == [(56.0, 1.0), (88.0, 0.0)]
    assert not [e for e in cues if e["type"] == "tilt"]
    assert all(-1.0 <= e["value"] <= 1.0 for e in cues)


def test_a_stream_into_the_next_section_is_a_build_up() -> None:
    cfg = load_config("mapper")["camera"]
    notes = []
    for b in range(8):
        notes += _bar(b, 1)
    notes += _bar(8, 4) + _bar(9, 4)  # two bars of sixteenths
    assert streams(notes, cfg) == [(32.0, 39.75)]
    assert streams(_bar(0, 4)[:8], cfg) == []  # half a bar is no roll


def test_accents_are_the_hitsounds_when_there_are_any_else_the_chords() -> None:
    notes = [{"beat": 0.0, "t": 0.0, "lane": 0, "type": "tap"}, {"beat": 0.0, "t": 0.0, "lane": 1, "type": "tap"},
             {"beat": 1.0, "t": 500.0, "lane": 0, "type": "tap"}]
    by_chord = accents(notes)
    assert [a["strength"] for a in by_chord] == [1.0, 0.5]
    osu = "\n".join(["osu file format v14", "[HitObjects]", "64,192,0,1,0,0:0:0:60:", "192,192,0,1,0,0:0:0:60:",
                     "64,192,500,1,4,0:0:0:100:", "64,192,1000,128,8,1500:0:0:0:80:", ""])
    hits = hits_from_osu(osu)
    assert hits == [(0.0, 0, 60), (0.0, 0, 60), (500.0, 4, 100), (1000.0, 8, 80)]
    by_sound = {a["t"]: a["strength"] for a in accents(notes, hits)}
    assert by_sound[500.0] == 1.0 and by_sound[500.0] > by_sound[1000.0] and 0.0 not in by_sound  # finish, clap; no plain hit
    assert accents(notes, [(0.0, 0, 60), (500.0, 2, 60)]) == by_chord  # whistles alone rank nothing
