"""Section consistency (docs/PATTERN_DESIGN.md 13): structure analysis against a song with known
sections, and the sectioned engine's charts against the designer engine's."""

from __future__ import annotations

from functools import lru_cache

import pytest
from fastapi.testclient import TestClient

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.difficulty.patterns import pattern_profile
from rhythm_server.difficulty.consistency import chart_consistency, lane_entropy, structure_accuracy
from rhythm_server.generator.core import generate_chart
from rhythm_server.generator.sections import edited_analysis, make_units
from rhythm_server.synth import detection_noise, make_structured_song

BARS = 72
CHARTS = (("6K", "GRG", "NORMAL", None), ("6K", "DJMAX", "HD", 9), ("8K", "EZ2ON", "HD", 13))


@lru_cache(maxsize=None)
def structured(bpm: float, seed: int, humanize: bool = False):
    song = make_structured_song(bpm=bpm, seed=seed, humanize=humanize)
    return song, analyze(song.pcm, song.sample_rate, f"sha256:structured-{bpm}-{seed}-{humanize}", backends={})


@lru_cache(maxsize=None)
def chart(bpm: float, seed: int, key_mode: str, system: str, difficulty: str, level: int | None, engine: str = "sectioned", noise: bool = False) -> dict:
    _, analysis = structured(bpm, seed)
    if noise:
        analysis = detection_noise(analysis, seed)
    return generate_chart(analysis, key_mode, difficulty, level, system=system, overrides={"patternEngine": engine})


@pytest.mark.parametrize("bpm,seed,humanize", [(124.0, 1, False), (150.0, 2, True)])
def test_structure_finds_the_sections_of_the_song(bpm: float, seed: int, humanize: bool) -> None:
    song, analysis = structured(bpm, seed, humanize)
    acc = structure_accuracy(analysis["sections"], song.structure, 4, BARS)
    assert acc["boundaryF"] >= 0.9, acc
    assert acc["groupF"] >= 0.9, acc
    assert acc["labelAccuracy"] >= 0.9, acc
    labels = [s["label"] for s in analysis["sections"]]
    assert "pre-chorus" in labels and labels.count("chorus") == 4  # the doubled last chorus is two
    chorus = [s for s in analysis["sections"] if s["label"] == "chorus"]
    assert {s["group"] for s in chorus} == {chorus[0]["group"]}
    assert all(s["loopBars"] == 2 for s in chorus)
    assert all(0.0 <= s["confidence"] <= 1.0 for s in analysis["sections"])


@pytest.mark.parametrize("key_mode,system,difficulty,level", CHARTS)
def test_the_same_music_gets_the_same_notes(key_mode: str, system: str, difficulty: str, level: int | None) -> None:
    song, _ = structured(124.0, 1)
    truth = [dict(s, endBeat=int(s["startBeat"]) + 4 * int(s["bars"])) for s in song.structure]
    new = chart_consistency(chart(124.0, 1, key_mode, system, difficulty, level)["notes"], truth, key_mode)
    old = chart_consistency(chart(124.0, 1, key_mode, system, difficulty, level, "designer")["notes"], truth, key_mode)
    assert new["loopLane"] >= 0.9 and new["loopRhythm"] >= 0.85, new
    assert new["repeatSelect"] >= 0.9 and new["repeatLaneMirror"] >= 0.9, new
    assert new["barVariety"] <= 0.75, new
    assert new["loopLane"] >= old["loopLane"] + 0.3, (new, old)


def test_a_repeated_chorus_is_the_first_one_or_its_mirror() -> None:
    _, analysis = structured(124.0, 1)
    chorus = [s for s in analysis["sections"] if s["label"] == "chorus"]
    for key_mode, system, difficulty, level in CHARTS + (("6K", "DJMAX", "MX", 13),):
        notes = chart(124.0, 1, key_mode, system, difficulty, level)["notes"]

        def at(sec: dict) -> dict[float, frozenset[int]]:
            out: dict[float, set[int]] = {}
            for n in notes:
                if sec["startBeat"] <= n["beat"] < sec["endBeat"] - 4:  # the last bar may end in a fill
                    out.setdefault(round(n["beat"] - sec["startBeat"], 3), set()).add(n["lane"])
            return {k: frozenset(v) for k, v in out.items()}

        first = at(chorus[0])
        keys = max(l for n in notes for l in [n["lane"]]) + 1
        for later in chorus[1:]:
            other = at(later)
            shared = first.keys() & other.keys()
            assert len(shared) >= 0.9 * len(first), (key_mode, later["startBeat"])
            same = sum(1 for k in shared if first[k] == other[k])
            mirrored = sum(1 for k in shared if frozenset(keys - 1 - l for l in first[k]) == other[k])
            # a mirrored repeat may have to keep a note where the mirrored lane would break the jack
            # spacing against the section before it
            assert max(same, mirrored) >= (0.9 if same >= mirrored else 0.85) * len(shared), (key_mode, later["startBeat"], same, mirrored, len(shared))


@pytest.mark.parametrize("key_mode,system,difficulty,level", CHARTS)
def test_consistency_survives_onset_detection_noise(key_mode: str, system: str, difficulty: str, level: int | None) -> None:
    song, _ = structured(124.0, 1)
    truth = [dict(s, endBeat=int(s["startBeat"]) + 4 * int(s["bars"])) for s in song.structure]
    new = chart_consistency(chart(124.0, 1, key_mode, system, difficulty, level, noise=True)["notes"], truth, key_mode)
    old = chart_consistency(chart(124.0, 1, key_mode, system, difficulty, level, "designer", noise=True)["notes"], truth, key_mode)
    assert new["loopLane"] >= 0.8 and new["repeatLaneMirror"] >= 0.85, new
    # the loops' shared sounds bring back notes the detector lost in one repeat
    assert new["loopRhythm"] >= old["loopRhythm"] + 0.05, (new, old)


def test_sectioned_charts_keep_levels_rules_and_determinism() -> None:
    song, analysis = structured(124.0, 1)
    true_onsets = sorted(t * 1000.0 for times in song.onsets.values() for t in times)
    detected = sorted(o["t"] for o in analysis["onsets"])
    import bisect

    def near(times: list[float], t: float) -> float:
        i = bisect.bisect_left(times, t)
        return min(abs(times[j] - t) for j in (i - 1, i) if 0 <= j < len(times))

    for key_mode, system, difficulty, level in CHARTS + (("4K", "DJMAX", "NM", 6), ("6K", "DJMAX", "MX", 13)):
        c = chart(124.0, 1, key_mode, system, difficulty, level)
        if level is not None:
            assert abs(c["meta"]["level"] - level) <= 1, (key_mode, difficulty, c["meta"]["level"])
        assert system != "DJMAX" or pattern_profile(c["notes"], key_mode)["padImpossible"] == 0
        for n in c["notes"]:
            # on a detected onset, or on a real sound the detector missed (consensus fill)
            assert near(detected, n["t"]) <= 40.0 or near(true_onsets, n["t"]) <= 30.0, f"{key_mode} {difficulty}: note at {n['t']}ms has no sound"
        assert c["meta"]["consistency"]["loopLane"] is not None
        assert c["sections"] and all("group" in s and "loopBars" in s for s in c["sections"])
    again = generate_chart(analysis, "6K", "HD", 9, system="DJMAX")
    assert again["notes"] == chart(124.0, 1, "6K", "DJMAX", "HD", 9)["notes"]
    assert again["meta"]["generator"]["params"].get("patternEngine") is None  # the default engine
    designer = chart(124.0, 1, "6K", "DJMAX", "HD", 9, "designer")
    assert designer["meta"]["generator"]["params"]["patternEngine"] == "designer"
    assert designer["meta"]["chartId"] != again["meta"]["chartId"]


def test_sections_contrast_by_label() -> None:
    _, analysis = structured(124.0, 1)
    notes = chart(124.0, 1, "6K", "DJMAX", "HD", 9)["notes"]

    def per_bar(label: str) -> float:
        secs = [s for s in analysis["sections"] if s["label"] == label]
        bars = sum((s["endBeat"] - s["startBeat"]) / 4 for s in secs)
        return sum(1 for n in notes for s in secs if s["startBeat"] <= n["beat"] < s["endBeat"]) / bars

    assert per_bar("chorus") > per_bar("pre-chorus") > per_bar("verse") > per_bar("intro")
    assert per_bar("chorus") > per_bar("bridge")


def test_units_follow_the_loops_and_keep_a_pickup_apart() -> None:
    sections = [
        {"startBeat": -1, "label": "intro", "group": "A", "energy": 0.2, "loopBars": 1},
        {"startBeat": 8, "label": "chorus", "group": "B", "energy": 1.0, "loopBars": 2},
        {"startBeat": 24, "label": "chorus", "group": "B", "energy": 1.0, "loopBars": 2},
    ]
    units = make_units(sections, -1.0, 39.5, 4)
    assert [(u.start, u.length) for u in units[:3]] == [(-1.0, 1.0), (0.0, 4.0), (4.0, 4.0)]
    chorus = [u for u in units if u.label == "chorus"]
    assert [u.length for u in chorus[:3]] == [8.0] * 3 and 7 < chorus[3].length <= 8  # the song ends inside the last loop
    assert [u.occurrence for u in chorus] == [0, 0, 1, 1]
    assert chorus[0].accent and not chorus[2].accent  # a chorus right after a chorus is not a new start


def test_lane_entropy_tells_a_pattern_from_scattered_notes() -> None:
    stairs = [{"beat": i * 0.5, "lane": i % 6} for i in range(64)]
    import random

    rng = random.Random(3)
    scattered = [{"beat": i * 0.5, "lane": rng.randrange(6)} for i in range(64)]
    assert lane_entropy(stairs, "6K") < 0.1 < 0.7 < lane_entropy(scattered, "6K")


def test_edited_sections_replace_the_analysed_ones() -> None:
    _, analysis = structured(124.0, 1)
    edits = [{"startBeat": -1, "label": "intro", "group": "A"}, {"startBeat": 16, "label": "verse", "group": "B"}, {"startBeat": 64, "label": "chorus", "group": "C"}]
    out = edited_analysis(analysis, edits)
    assert [s["label"] for s in out["sections"]] == ["intro", "verse", "chorus"]
    assert out["sections"][1]["endBeat"] == 64 and out["sections"][2]["loopBars"] == 2  # from the analysed chorus
    assert out["overrides"]["sections"][1]["group"] == "B"
    assert analysis["sections"] != out["sections"]  # the cached analysis is untouched
    c = generate_chart(out, "4K", "NORMAL")
    assert [s["label"] for s in c["sections"]] == ["intro", "verse", "chorus"]
    assert c["meta"]["chartId"] != generate_chart(analysis, "4K", "NORMAL")["meta"]["chartId"]


@pytest.fixture()
def client(tmp_path):
    from rhythm_server.api.app import create_app

    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        yield c


def test_section_edit_api(client: TestClient) -> None:
    song = client.post("/api/songs/demo", json={"bpm": 128, "bars": 24}).json()["song"]
    sid = song["id"]
    got = client.get(f"/api/songs/{sid}/sections").json()
    assert got["edited"] is False and got["beatsPerBar"] == 4 and len(got["sections"]) >= 2
    before = client.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "NORMAL"}).json()["chart"]
    edits = [{"startBeat": got["sections"][0]["startBeat"], "label": "intro", "group": "A"}, {"startBeat": 32, "label": "chorus", "group": "B"}]
    r = client.patch(f"/api/songs/{sid}", json={"sections": edits})
    assert r.status_code == 200 and r.json()["reanalyzing"] is False
    assert r.json()["song"]["sections"][1]["label"] == "chorus"
    got = client.get(f"/api/songs/{sid}/sections").json()
    assert got["edited"] is True and [s["label"] for s in got["sections"]] == ["intro", "chorus"]
    after = client.post(f"/api/songs/{sid}/charts", json={"keyMode": "4K", "difficulty": "NORMAL"}).json()["chart"]
    assert after["meta"]["chartId"] != before["meta"]["chartId"]
    assert [s["label"] for s in after["sections"]] == ["intro", "chorus"]
    # bad edits
    assert client.patch(f"/api/songs/{sid}", json={"sections": [edits[1], edits[1]]}).status_code == 400
    assert client.patch(f"/api/songs/{sid}", json={"sections": [{"startBeat": 0, "label": "solo", "group": "A"}]}).status_code == 422
    # back to the analysis
    assert client.patch(f"/api/songs/{sid}", json={"sections": []}).json()["song"]["sections"] is None
    assert client.get(f"/api/songs/{sid}/sections").json()["edited"] is False
