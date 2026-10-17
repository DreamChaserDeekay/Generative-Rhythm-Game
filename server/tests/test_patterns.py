"""Lane patterns: pad-playable DJMAX chords, the skill value, and (later phases) the pattern engine."""

from __future__ import annotations

import pytest

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.formats import export_chart
from rhythm_server.generator import generate_chart
from rhythm_server.generator.lanes import lane_infos
from rhythm_server.generator.linter import lint
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.tempo import TempoMap
from rhythm_server.synth import make_song


@pytest.fixture(scope="module")
def dense_song() -> dict:
    song = make_song(165.0, 64, seed=13, repeat_melody=True)
    return analyze(song.pcm, song.sample_rate, "sha256:patterns-165", backends={})


def chords_of(chart: dict) -> list[set[int]]:
    by_t: dict[float, set[int]] = {}
    for n in chart["notes"]:
        by_t.setdefault(round(n["t"], 3), set()).add(n["lane"])
    return [lanes for lanes in by_t.values() if len(lanes) >= 2]


def test_djmax_below_sc_never_asks_for_chords_a_pad_cannot_press(dense_song: dict) -> None:
    for mode, tier, level in (("6K", "HD", 10), ("6K", "MX", 14), ("6K+FX", "MX", 13), ("5K", "MX", 14)):
        params = resolve_params(mode, tier, level, system="DJMAX")
        assert params.pad_forbidden, (mode, tier)
        chart = generate_chart(dense_song, mode, tier, level, system="DJMAX")
        bad = [c for c in chords_of(chart) if any(c.issuperset(f) for f in params.pad_forbidden)]
        assert bad == [], (mode, tier, bad[:3])
    # SC is keyboard-only: the same shapes are allowed there
    assert resolve_params("6K", "SC", system="DJMAX").pad_forbidden == ()
    sc = generate_chart(dense_song, "6K", "SC", 8, system="DJMAX")
    assert any({0, 2} <= c or {3, 5} <= c for c in chords_of(sc))
    # EZ2ON and the five steps have no pad rule
    assert resolve_params("6K", "HD", system="EZ2ON").pad_forbidden == ()
    assert resolve_params("6K", "MASTER").pad_forbidden == ()


def test_the_linter_rejects_pad_impossible_chords() -> None:
    lanes = lane_infos("6K")
    tempo = TempoMap({"offsetMs": 0.0, "tempoMap": [{"beat": 0, "bpm": 120.0}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]})
    notes = [{"t": 1000.0, "beat": 2.0, "lane": 0, "type": "tap"}, {"t": 1000.0, "beat": 2.0, "lane": 2, "type": "tap"}]
    assert any("pad" in p for p in lint(notes, lanes, resolve_params("6K", "MX", system="DJMAX"), tempo))
    assert not any("pad" in p for p in lint(notes, lanes, resolve_params("6K", "SC", system="DJMAX"), tempo))


def test_skill_is_the_level_on_one_scale_for_every_system() -> None:
    def skill(mode: str, tier: str, level: int | None = None, system: str | None = None) -> float:
        return resolve_params(mode, tier, level, system=system).skill

    # the same level is the same skill on every system and key mode
    assert skill("4K", "NM", 5, "DJMAX") == skill("8K", "NM", 5, "DJMAX") == skill("6K", "NORMAL", 5) == skill("6K", "EZ", 5, "EZ2ON")
    grg = [skill("4K", d) for d in ("EASY", "NORMAL", "HARD", "EXPERT", "MASTER")]
    assert grg == sorted(grg) and grg[0] < 0.2 and grg[-1] > 0.9
    # SC levels sit above normal levels: SC 2 / 8 are level 12 / 15
    assert skill("6K", "SC", 2, "DJMAX") == pytest.approx(skill("6K", "MX", 12, "DJMAX"), abs=0.04)
    assert skill("6K", "SC", 8, "DJMAX") == 1.0 and skill("6K", "SHD", 20, "EZ2ON") == 1.0


def test_easy_rules_follow_skill_not_tier_names(dense_song: dict) -> None:
    # EZ2ON EZ Lv.2 is as easy as GRG EASY: chords only on downbeats, long notes end on half beats
    for chart in (generate_chart(dense_song, "6K", "EZ", 2, system="EZ2ON"), generate_chart(dense_song, "6K", "EASY", 3)):
        by_t: dict[float, list[dict]] = {}
        for n in chart["notes"]:
            by_t.setdefault(round(n["t"], 3), []).append(n)
        for ns in by_t.values():
            if len(ns) >= 2:
                assert abs(ns[0]["beat"] - round(ns[0]["beat"])) < 1e-6 and round(ns[0]["beat"]) % 4 == 0, ns[0]["beat"]
    nm = generate_chart(dense_song, "6K", "NM", 5, system="DJMAX")
    holds = [n for n in nm["notes"] if n["type"] == "hold"]
    assert holds and all(abs(n["endBeat"] * 2 - round(n["endBeat"] * 2)) < 1e-6 for n in holds)


def test_exports_name_djmax_and_ez2on_difficulties(dense_song: dict) -> None:
    mx = generate_chart(dense_song, "5K", "MX", 12, system="DJMAX", meta={"title": "Song"})
    ez = generate_chart(dense_song, "5K", "EZ", 3, system="EZ2ON", meta={"title": "Song"})
    hard = generate_chart(dense_song, "5K", "HARD", meta={"title": "Song"})
    sc = generate_chart(dense_song, "5K", "SC", 5, system="DJMAX", meta={"title": "Song"})

    def bms_difficulty(chart: dict) -> str:
        text = export_chart(chart, "bms", "song.ogg")[0].decode()
        return next(line for line in text.splitlines() if line.startswith("#DIFFICULTY")).split()[1]

    assert [bms_difficulty(c) for c in (ez, hard, mx, sc)] == ["1", "3", "4", "5"]
    osu_text, name, _ = export_chart(mx, "osu", "song.ogg")
    assert f"Version:5K DJMAX MX Lv.{mx['meta']['level']}" in osu_text.decode() and name == "Song [5K DJMAX MX].osu"
    assert f"Version:5K DJMAX SC {sc['meta']['level']}" in export_chart(sc, "osu", "song.ogg")[0].decode()
    assert f"Version:5K HARD Lv.{hard['meta']['level']}" in export_chart(hard, "osu", "song.ogg")[0].decode()
    import json

    assert json.loads(export_chart(mx, "bmson", "song.ogg")[0])["info"]["chart_name"] == "DJMAX MX"


# ---------- P1: pattern profile ----------

from rhythm_server.difficulty.patterns import pattern_profile, pattern_summary  # noqa: E402


def _taps(seq: list[tuple[float, int | tuple[int, ...]]], key_mode: str = "6K") -> list[dict]:
    """Notes from (time, key index or chord) pairs; key indices are 0-based key lanes."""
    keys = [l.index for l in lane_infos(key_mode) if l.kind == "key"]
    out = []
    for t, k in seq:
        for x in k if isinstance(k, tuple) else (k,):
            out.append({"t": float(t), "beat": t / 500.0, "lane": keys[x], "type": "tap"})
    return out


def test_pattern_profile_finds_stairs_trills_jacks_chords_and_leaps() -> None:
    stairs = _taps([(i * 150, k) for i, k in enumerate([0, 1, 2, 3, 4, 5])])
    p = pattern_profile(stairs, "6K")
    assert p["stairs"] == 1.0 and p["trills"] == 0.0 and p["leaps"] == 0.0 and p["alternation"] == 0.2
    trill = pattern_profile(_taps([(i * 150, (1, 2)[i % 2]) for i in range(8)]), "6K")  # middle + index
    assert trill["trills"] == 1.0 and trill["stairs"] == 0.0 and trill["weakTrills"] == 0
    assert pattern_profile(_taps([(i * 150, (0, 1)[i % 2]) for i in range(8)]), "6K")["weakTrills"] == 1  # ring + middle
    jacks = pattern_profile(_taps([(0, 3), (200, 3), (400, 3), (2000, (0, 5)), (2200, (0, 5))]), "6K")
    assert jacks["jacks"] == round(4 / 7, 3) and jacks["chords"] == round(4 / 7, 3)
    assert jacks["chordShapes"] == {"adjacent": 0.0, "symmetric": 1.0, "other": 0.0}
    leaps = pattern_profile(_taps([(i * 150, (0, 5)[i % 2]) for i in range(6)]), "6K")
    assert leaps["leaps"] == 1.0 and leaps["alternation"] == 1.0 and leaps["sameHandLeaps"] == 0.0
    pad = pattern_profile(_taps([(0, (0, 2)), (500, (3, 5)), (1000, (2, 3))]), "6K")
    assert pad["padImpossible"] == 2
    held = [{"t": 0.0, "beat": 0.0, "lane": 1, "type": "hold", "endT": 1000.0, "endBeat": 2.0}] + _taps([(200, 3), (400, 4), (1200, 5)])
    assert pattern_profile(held, "6K")["holdTaps"] == 0.5
    assert pattern_summary([], "6K") == {k: 0.0 for k in ("stairs", "trills", "chords", "jacks", "holdTaps", "leaps")}


def test_charts_carry_their_pattern_summary(dense_song: dict) -> None:
    chart = generate_chart(dense_song, "6K", "MX", 12, system="DJMAX")
    patterns = chart["meta"]["patterns"]
    assert set(patterns) == {"stairs", "trills", "chords", "jacks", "holdTaps", "leaps"}
    assert all(0.0 <= v <= 1.0 for v in patterns.values()) and patterns["chords"] > 0
