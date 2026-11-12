"""Camera cues from the song's sections (chart/effects.py): a wider view through a quiet passage,
closing in bar by bar through a build-up and let go where the chorus lands; pulses in three sizes
(the landing, the head of each phrase, the strongest beats); a swing at each phrase head away from
the crowded hand; the camera lower through the busy part; all smaller where the notes are dense."""

from __future__ import annotations

from rhythm_server.chart.effects import camera_effects
from rhythm_server.chart.lanes import lane_infos
from rhythm_server.chart.tempo import TempoMap

TEMPO = TempoMap({"offsetMs": 0.0, "tempoMap": [{"beat": 0, "bpm": 120.0}]})  # 500 ms a beat, 4 beats a bar


def _sec(start: int, end: int, label: str, energy: float, drums: float = 0.3) -> dict:
    return {"startBeat": start, "endBeat": end, "label": label, "energy": energy, "stems": [drums, 0.2, 0.25, 0.25]}


SONG = [
    _sec(0, 16, "intro", 0.3),
    _sec(16, 32, "bridge", 0.1, drums=0.05),  # a breakdown: the drums are out
    _sec(32, 48, "pre-chorus", 0.6),  # a four-bar build-up
    _sec(48, 80, "chorus", 1.0),
    _sec(80, 96, "outro", 0.4),
]


def _of(effects: list[dict], kind: str) -> list[tuple[float, float, float]]:
    return [(e["beat"], e["value"], e["durationBeats"]) for e in effects if e["type"] == kind]


def test_a_quiet_passage_opens_out_and_a_build_up_closes_in() -> None:
    fx = camera_effects(SONG, TEMPO)
    assert _of(fx, "view") == [(16.0, -1.0, 8), (32.0, 0.25, 4.0), (36.0, 0.5, 4.0), (40.0, 0.75, 4.0), (44.0, 1.0, 4.0), (48.0, 0.0, 0.25)]
    # where the build-up lands the hold lets go at once with a big pulse
    assert any(b == 48.0 and v >= 0.8 for b, v, _ in _of(fx, "zoom"))


def test_pulses_come_in_three_sizes() -> None:
    onsets = [{"t": 500.0 * b, "strength": 1.0 if b % 2 == 0 else 0.3} for b in range(0, 96)]
    zooms = _of(camera_effects(SONG, TEMPO, onsets=onsets), "zoom")
    landing = [v for b, v, _ in zooms if b == 48.0]
    heads = {b: v for b, v, d in zooms if d == 2 and b > 48.0}
    small = {b: v for b, v, d in zooms if d == 0.5}
    assert len(landing) == 1 and landing[0] >= 0.8  # one pulse where the chorus lands, the largest
    assert sorted(heads) == [64.0] and heads[64.0] == 0.5  # the head of its second phrase (16 beats on)
    assert small and all(48 < b < 80 and b % 2 == 0 and b not in heads for b in small)  # strong beats, never a head
    assert max(small.values()) < 0.5 < landing[0]
    # a chorus that is not the busiest keeps its phrase pulses and drops the beat ones
    calmer = [dict(s, energy=0.8) if s["label"] == "chorus" else s for s in SONG]
    assert not [1 for _, _, d in _of(camera_effects(calmer, TEMPO, onsets=onsets), "zoom") if d == 0.5]


def test_the_track_swings_at_each_phrase_head_away_from_the_crowded_hand() -> None:
    lanes = lane_infos("6K")
    right = [{"t": 24000.0 + 250.0 * k, "lane": 3 + k % 3} for k in range(32)]  # bars 12-15: right hand
    left = [{"t": 32000.0 + 250.0 * k, "lane": k % 3} for k in range(32)]  # bars 16-19: left hand
    fx = camera_effects(SONG, TEMPO, right + left, lanes)
    assert not _of(fx, "tilt")  # no lean is held
    swings = _of(fx, "swing")
    assert [(b, v) for b, v, _ in swings] == [(48.0, -1.0), (64.0, 1.0)] and all(d == 4 for _, _, d in swings)
    # nothing to follow: the swings alternate
    plain = [v for _, v, _ in _of(camera_effects(SONG, TEMPO, [], lanes), "swing")]
    assert plain == [1.0, -1.0]
    # the camera is lower through the busy part and back up after it
    assert _of(fx, "dive") == [(48.0, 1.0, 4), (80.0, 0.0, 4)]


def test_swings_and_small_pulses_shrink_where_the_notes_are_dense() -> None:
    lanes = lane_infos("6K")
    onsets = [{"t": 500.0 * b, "strength": 1.0 if b % 2 == 0 else 0.3} for b in range(0, 96)]
    dense = [{"t": 24000.0 + 1000.0 / 16 * k, "lane": k % 6} for k in range(16 * 8)]  # 16 notes a second from beat 48, 8 s
    easy = camera_effects(SONG, TEMPO, [], lanes, onsets)
    hard = camera_effects(SONG, TEMPO, dense, lanes, onsets)
    assert abs(_of(hard, "swing")[0][1]) == 0.4 and abs(_of(easy, "swing")[0][1]) == 1.0  # 1 - dense.reduce
    assert abs(_of(hard, "swing")[1][1]) == 1.0  # the second phrase has no notes: full again
    small = lambda fx: {b: v for b, v, d in _of(fx, "zoom") if d == 0.5}  # noqa: E731
    assert small(hard)[50] < small(easy)[50] and small(hard)[70] == small(easy)[70]
    landing = lambda fx: next(v for b, v, _ in _of(fx, "zoom") if b == 48.0)  # noqa: E731
    assert landing(hard) == landing(easy)  # the landing is the moment itself: never smaller
