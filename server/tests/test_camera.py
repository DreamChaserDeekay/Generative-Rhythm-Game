"""Camera cues from the song (generator 0.9.31, PATTERN_DESIGN 63): a wider view through a quiet
passage, closing in bar by bar through a build-up and let go where the chorus lands, small zooms on
the chorus's strong beats, and a lean towards the crowded hand or the climbing tune."""

from __future__ import annotations

from rhythm_server.generator.effects import camera_effects
from rhythm_server.generator.lanes import lane_infos
from rhythm_server.generator.tempo import TempoMap

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
    assert _of(fx, "view") == [(16.0, -1.0, 2), (32.0, 0.25, 4.0), (36.0, 0.5, 4.0), (40.0, 0.75, 4.0), (44.0, 1.0, 4.0), (48.0, 0.0, 0.25)]
    # where the build-up lands the hold lets go at once with a big pulse
    assert any(b == 48.0 and v >= 0.8 for b, v, _ in _of(fx, "zoom"))


def test_the_chorus_pulses_on_its_strong_beats() -> None:
    onsets = [{"t": 500.0 * b, "strength": 1.0 if b % 2 == 0 else 0.3} for b in range(0, 96)]
    fx = camera_effects(SONG, TEMPO, onsets=onsets)
    small = [b for b, v, d in _of(fx, "zoom") if d == 0.5]
    assert small and all(48 < b < 80 for b in small) and all(b % 2 == 0 for b in small)


def test_the_lean_follows_the_crowded_hand_then_the_tune() -> None:
    lanes = lane_infos("6K")
    right = [{"t": 24000.0 + 250.0 * k, "lane": 3 + k % 3} for k in range(32)]  # bars 12-15: right hand
    left = [{"t": 32000.0 + 250.0 * k, "lane": k % 3} for k in range(32)]  # bars 16-19: left hand
    fx = camera_effects(SONG, TEMPO, right + left, lanes)
    tilts = _of(fx, "tilt")
    assert tilts[0][:2] == (48.0, 1.0) and tilts[1][:2] == (64.0, -1.0) and tilts[-1][:2] == (80.0, 0.0)
    # no notes to follow: a falling tune leans left
    falling = [{"t": 24000.0 + 400.0 * k, "pitch": 84.0 - k, "melody": 1.0} for k in range(20)]
    assert _of(camera_effects(SONG, TEMPO, [], lanes, falling), "tilt")[0][:2] == (48.0, -1.0)
