"""Lane patterns: pad-playable DJMAX chords, the skill value, and (later phases) the pattern engine."""

from __future__ import annotations

import itertools

import numpy as np
import pytest

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.config import load_config
from rhythm_server.formats import export_chart
from rhythm_server.generator import generate_chart
from rhythm_server.generator.lanes import lane_infos, note_sources
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


# ---------- P2/P3: planner and pattern-guided placement ----------

from rhythm_server.analysis.analyzer import ANALYZER_VERSION  # noqa: E402
from rhythm_server.generator.candidates import build_candidates  # noqa: E402
from rhythm_server.generator.planner import phrases_of  # noqa: E402
from rhythm_server.generator.select import select_slots  # noqa: E402
from rhythm_server.config import difficulty_config  # noqa: E402

SCALE = [60, 62, 64, 65, 67, 69, 71, 72]
GESTURE_BARS = {
    "run": [SCALE, SCALE[::-1]],
    "oscillate": [[60, 64] * 4, [62, 67] * 4],
    "repeat": [[67] * 8, [65] * 8],
    "pedal": [[60, 62, 60, 64, 60, 65, 60, 67], [60, 67, 60, 65, 60, 64, 60, 62]],
    "arpeggio": [[60, 64, 67, 72, 67, 64, 60, 64], [62, 65, 69, 74, 69, 65, 62, 65]],
    "rhythm": [["kick", "hat", "snare", "hat"] * 2, ["kick", "hat", "snare", "hat"] * 2],
}


def gesture_analysis(bpm: float = 120.0, repeats: int = 2) -> tuple[dict, dict[str, list[int]]]:
    """Eighth notes, one gesture per pair of bars (melody on 'other', drums on 'drums'); also the
    bars of each gesture."""
    beat = 60000.0 / bpm
    offset = 500.0
    onsets, bars, bar = [], {}, 0
    for _ in range(repeats):
        for name, pair in GESTURE_BARS.items():
            for notes in pair:
                bars.setdefault(name, []).append(bar)
                for i, n in enumerate(notes):
                    t = offset + (bar * 4 + i / 2) * beat
                    if isinstance(n, str):
                        bands = {"kick": [0.85, 0.1, 0.05], "hat": [0.05, 0.1, 0.85], "snare": [0.2, 0.6, 0.2]}[n]
                        onsets.append({"t": t, "strength": 1.0 if n == "kick" else 0.8, "band": "mid", "bands": bands, "pitch": None,
                                       "harmonic": 0.1, "sustainEnd": None, "source": "drums", "sources": [0.9, 0.04, 0.03, 0.03]})
                    else:
                        onsets.append({"t": t, "strength": 0.8, "band": "mid", "bands": [0.2, 0.6, 0.2], "pitch": float(n),
                                       "harmonic": 0.8, "sustainEnd": None, "source": "other", "sources": [0.05, 0.05, 0.1, 0.8]})
                bar += 1
    duration = offset + bar * 4 * beat + 2000.0
    analysis = {
        "audioHash": f"sha256:gestures-{bpm}",
        "analyzer": {"name": "core", "version": ANALYZER_VERSION},
        "durationMs": duration,
        "timing": {"offsetMs": offset, "tempoMap": [{"beat": 0, "bpm": bpm}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]},
        "onsets": onsets,
        "sections": [],
        "energy": {"frameMs": 100, "values": [0.8] * int(duration / 100)},
        "overrides": {},
    }
    return analysis, bars


def place(analysis: dict, mode: str, tier: str, level: int | None = None, system: str | None = None, engine: str = "designer") -> dict:
    """Every sound of the song as a note (no level loop), placed by the pattern engine."""
    import numpy as np

    from rhythm_server.generator.lanes import lane_search, notes_from_choices
    from rhythm_server.generator.planner import plan_patterns

    params = resolve_params(mode, tier, level, system=system)
    tempo = TempoMap(analysis["timing"])
    lanes = lane_infos(mode)
    n_keys = sum(1 for l in lanes if l.kind == "key")
    cands = build_candidates(analysis, tempo, params, float(difficulty_config()["snapToleranceMs"]))
    slots = select_slots(cands, params, tempo, 4.0, None, n_keys)
    hands = tuple(l.hand for l in lanes if l.kind == "key")
    plan = plan_patterns(slots, analysis["sections"], params, hands, tempo) if engine == "designer" else None
    notes = notes_from_choices(slots, lane_search(slots, lanes, params, tempo, np.random.default_rng(5), plan=plan), tempo)
    return {"meta": {"keyMode": mode}, "notes": notes}


def key_sequence(chart: dict, bars: list[int]) -> list[list[int]]:
    """Key indices of the single notes in each of these bars, in time order."""
    keys = [l.index for l in lane_infos(chart["meta"]["keyMode"]) if l.kind == "key"]
    by_t: dict[float, list[dict]] = {}
    for n in chart["notes"]:
        by_t.setdefault(round(n["t"], 3), []).append(n)
    out = []
    for b in bars:
        seq = [ns[0]["lane"] for t, ns in sorted(by_t.items()) if len(ns) == 1 and b * 4 <= ns[0]["beat"] < b * 4 + 4 and ns[0]["lane"] in keys]
        out.append([keys.index(x) for x in seq])
    return out


def test_phrases_read_the_gesture_of_the_melody() -> None:
    analysis, bars = gesture_analysis()
    params = resolve_params("6K", "HARD")
    tempo = TempoMap(analysis["timing"])
    cands = build_candidates(analysis, tempo, params, float(difficulty_config()["snapToleranceMs"]))
    slots = select_slots(cands, params, tempo, 4.0, None, 6)
    phrases = phrases_of(slots, [], tempo)
    by_bar = {int(slots[p.slots[0]].beat // 4): p for p in phrases}
    for name, bs in bars.items():
        for b in bs:
            assert by_bar[b].gesture == name, (name, b, by_bar[b].gesture)
    assert by_bar[bars["run"][0]].direction == 1 and by_bar[bars["run"][1]].direction == -1


def test_scales_become_stairs_and_two_note_figures_trills() -> None:
    analysis, bars = gesture_analysis()
    designer = place(analysis, "6K", "HARD")
    classic = place(analysis, "6K", "HARD", engine="classic")

    # scales walk one lane at a time (turning at the edge of the keys)
    moves = [b - a for seq in key_sequence(designer, bars["run"]) for a, b in zip(seq, seq[1:])]
    assert sum(abs(m) == 1 for m in moves) / len(moves) >= 0.85, moves
    # two-note figures become a trill (or split) on two lanes; note by note they scattered. (A
    # figure's last note may already take the lane of the same sound right after it.)
    def trill_share(seqs: list[list[int]]) -> float:
        hits = [seq[i] == seq[i - 2] != seq[i - 1] for seq in seqs for i in range(2, len(seq))]
        return sum(hits) / len(hits)

    assert trill_share(key_sequence(designer, bars["oscillate"])) >= 0.8
    assert trill_share(key_sequence(classic, bars["oscillate"])) < 0.5
    # a repeated note may stay on its lane (BMS: about half the jacks repeat their keysound), but it
    # does not pile up past the jack-streak limit; note by note nearly every repeat was a jack
    free = int(load_config("patterns")["hands"]["systems"]["GRG"]["jackFree"])
    for seq in key_sequence(designer, bars["repeat"]):
        assert max(len(list(run)) for _, run in itertools.groupby(seq)) <= free, seq
        assert len(set(seq)) >= 2, seq
    assert any(a == b for seq in key_sequence(classic, bars["repeat"]) for a, b in zip(seq, seq[1:]))


def test_slow_repeated_notes_stay_on_their_lane() -> None:
    # Eighths 500 ms apart: a repeat this slow is easy on one key, and human BMS charts keep 86-88%
    # of slow same-keysound repeats on their lane. Fast ones (250 ms) keep it more on easy charts
    # than on MASTER (BMS: 37-39% at levels 2-6, 16% at 14). Generator 0.9.15 gives the slow rules
    # to DJMAX and EZ2ON as well (reaching a key again half a second later is easy on a pad too, and
    # test_guides checks the DPC limit on real jacks), but the fast bonus stays with the default
    # system: carrying it over pushes DJMAX 4K MX past that limit (PATTERN_DESIGN 32).
    slow, bars = gesture_analysis(60.0)
    fast, _ = gesture_analysis(120.0)

    def stay_share(chart: dict) -> float:
        stays = [a == b for seq in key_sequence(chart, bars["repeat"]) for a, b in zip(seq, seq[1:])]
        return sum(stays) / len(stays)

    for tier in ("EASY", "NORMAL", "MASTER"):
        assert stay_share(place(slow, "7K+1S", tier)) >= 0.8, tier
    master = stay_share(place(fast, "7K+1S", "MASTER"))
    assert stay_share(place(fast, "7K+1S", "EASY")) > master and stay_share(place(fast, "7K+1S", "NORMAL")) > master
    for system in ("DJMAX", "EZ2ON"):
        assert stay_share(place(slow, "6K", "NM", system=system)) >= 0.4, system


def test_pedals_anchor_and_drums_keep_one_lane_per_sound() -> None:
    analysis, bars = gesture_analysis()
    chart = place(analysis, "6K", "EXPERT")
    for seq in key_sequence(chart, bars["pedal"]):
        # the downbeat is a chord, so the pedal (C) falls on the odd single notes
        pedal, others = seq[1::2], seq[0::2]
        assert len(set(pedal)) == 1 and pedal[0] not in others, seq
    keys = [l.index for l in lane_infos("6K") if l.kind == "key"]
    at: dict[float, tuple[int, ...]] = {}
    for n in chart["notes"]:
        at[n["beat"]] = tuple(sorted(at.get(n["beat"], ()) + (keys.index(n["lane"]),)))
    for b in bars["rhythm"]:
        # within a bar every drum sound keeps its lanes (hats may alternate between two)
        sounds: dict[tuple[str, int], set[tuple[int, ...]]] = {}
        for i, name in enumerate(GESTURE_BARS["rhythm"][0]):
            lanes = at[b * 4 + i / 2]
            sounds.setdefault((name, len(lanes)), set()).add(lanes)
        for (name, _), used in sounds.items():
            assert len(used) <= (2 if name == "hat" else 1), (b, name, used)


def test_djmax_5k_repeated_notes_become_a_laser() -> None:
    analysis, bars = gesture_analysis(150.0)  # eighths 200 ms apart: faster than an HD jack (250 ms)
    params = resolve_params("5K", "HD", 10, system="DJMAX")
    assert params.thumb_jack_ms == 150.0 and resolve_params("5K", "HD", 10, system="EZ2ON").thumb_jack_ms == 0.0
    chart = place(analysis, "5K", "HD", 10, system="DJMAX")
    def longest_center_run(seq: list[int]) -> int:
        best = run = 0
        for k in seq:
            run = run + 1 if k == 2 else 0
            best = max(best, run)
        return best

    runs = [longest_center_run(seq) for seq in key_sequence(chart, bars["repeat"])]
    assert min(runs) >= 5, runs  # the middle key repeated by both thumbs
    ez = place(analysis, "5K", "HD", 10, system="EZ2ON")
    # EZ2ON has no laser: the same repeated notes alternate between two keys
    assert all(a != b for seq in key_sequence(ez, bars["repeat"]) for a, b in zip(seq, seq[1:]))


def test_the_default_system_plays_doubles_and_longer_anchors_from_normal() -> None:
    """Human BMS charts play 6.4 doubles (재봉틀) and 2.2 anchors of four hits or more in 1000 notes
    at level 6 (PATTERN_DESIGN 26). Since generator 0.9.10 the default system's repeated-note and
    drum phrases prefer doubles to the hand-alternating split, and its anchors may run six hits from
    NORMAL on. DJMAX keeps the short anchors of the DPC guidelines below its hardest tiers."""
    from types import SimpleNamespace

    from rhythm_server.generator.planner import _fit, vocabulary

    assert resolve_params("7K+1S", "EASY").anchor_cap == 3
    assert resolve_params("7K+1S", "NORMAL").anchor_cap == 6
    assert resolve_params("6K", "NM", 6, system="DJMAX").anchor_cap == 3
    grg, dj = resolve_params("7K+1S", "NORMAL"), resolve_params("6K", "MX", 13, system="DJMAX")
    for gesture in ("repeat", "rhythm"):
        p = SimpleNamespace(gesture=gesture, halves=None)
        v = vocabulary(grg)
        assert _fit("doubles", p, "GRG") * v["doubles"]["weight"] > _fit("split", p, "GRG") * v["split"]["weight"], gesture
        v = vocabulary(dj)
        assert _fit("doubles", p, "DJMAX") * v["doubles"]["weight"] < _fit("split", p, "DJMAX") * v["split"]["weight"], gesture


def test_default_7k_two_note_chords_keep_off_the_middle_key_and_its_neighbours() -> None:
    """Human BMS charts almost never put a two-note chord on the middle key and its neighbour (3+4,
    4+5: 0.2-3.7% of their two-note chords from level 2 to 14), which no chord shape cost covered
    before generator 0.9.13 (11-13% of ours). They play one hand with a key between (1+3) more than
    we did on normal charts and half as often on MASTER (PATTERN_DESIGN 29). The default system's
    7K chords pay hands.chordShapes by skill; other systems and key modes have none. Since 0.9.19
    the default system has no soft role regions at levels 6 and 10 and its own refitted table, in
    which symmetric pairs pay a cost too (without the regions they ran to 34-36% against the human
    22-26%), so 3+4 stays above 3+5 by a smaller margin while landing on the human share (level 10
    1.4% against 1.5%; PATTERN_DESIGN 38)."""
    from rhythm_server.generator.motifs import SlotPlan, _shape_cost, motif_context, pair_shape

    lanes = lane_infos("7K+1S")
    sp = SlotPlan(phrase=0, k=0, motif="step", chords="vary", hold_tap=False, direction=1, step=0, pedal=False, window=None, cell_ref=None, mirror_ref=None, wide=False)
    ctx = motif_context(lanes, 0.1, system="GRG", key_mode="7K+1S")
    shapes = [pair_shape(ctx, a, b) for a, b in ((0, 6), (2, 3), (1, 3), (0, 1), (0, 2), (1, 4))]
    assert shapes == ["symmetric", "middleAdjacent", "middle", "adjacent", "oneHandGap", "lopsided"]
    for skill in (0.1, 0.4, 0.7, 0.96):
        grg = motif_context(lanes, skill, system="GRG", key_mode="7K+1S")
        assert _shape_cost(grg, sp, (2, 3)) > _shape_cost(grg, sp, (2, 4)) + 0.05, skill  # 3+4 above 3+5
    normal, master = (motif_context(lanes, s, system="GRG", key_mode="7K+1S") for s in (0.4, 0.96))
    assert _shape_cost(normal, sp, (0, 2)) < _shape_cost(normal, sp, (1, 4))  # 1+3 below 2+5 on NORMAL ...
    assert _shape_cost(master, sp, (0, 2)) > _shape_cost(master, sp, (1, 4))  # ... above it on MASTER
    assert motif_context(lane_infos("6K"), 0.96, system="DJMAX", key_mode="6K").pair_shapes is None
    assert motif_context(lane_infos("5K"), 0.5, system="GRG", key_mode="5K").pair_shapes is None


def test_hard_default_rolls_zigzag_instead_of_trilling() -> None:
    """A roll fanning out slowly from the middle keys plays its first part as a trill (3-5-3-5). Human
    7-key BMS charts play rolls with few trills on hard charts (level 14: 16% of three-note shapes
    inside rolls against our 55%), so since generator 0.9.23 the default system's MASTER rolls reach
    one key further out every turn and back in (rolls.waveShare); NORMAL charts and the other
    systems keep the fan (PATTERN_DESIGN 45)."""
    from rhythm_server.generator.motifs import alternate_key, motif_context

    lanes = lane_infos("7K+1S")

    def roll(ctx, hits: int = 10) -> list[int]:
        keys: list[int] = []
        for pos in range(hits):
            key = alternate_key(ctx, (pos, hits, 3), prev=keys[-1] if keys else None)
            assert key is not None
            keys.append(key)
        return [k + 1 for k in keys]  # keys 1-7

    assert roll(motif_context(lanes, 0.96, system="GRG", key_mode="7K+1S")) == [3, 5, 2, 6, 1, 7, 2, 6, 3, 5]
    for ctx in (motif_context(lanes, 0.96, system="DJMAX", key_mode="7K+1S"), motif_context(lanes, 0.4, system="GRG", key_mode="7K+1S")):
        assert roll(ctx)[:4] == [3, 5, 3, 5]


def test_every_system_balances_lane_use_over_the_same_many_notes() -> None:
    """The lane-usage balance charges a lane for use above the others' mean in its memory, which
    fades by hands.usageDecay each slot. Remembering only the last ten or so notes (0.9) spreads every
    run over both hands: human BMS charts play more jack streaks, doubles and trills and keep more
    bars on one side (PATTERN_DESIGN 30). The default system remembered about 33 notes (0.97) from
    generator 0.9.14; 0.9.15 moved that to the base, so DJMAX and EZ2ON remember as many (32장)."""
    from rhythm_server.generator.lanes import _Weights

    assert _Weights.of(resolve_params("7K+1S", "NORMAL")).usage_decay == 0.97
    assert _Weights.of(resolve_params("6K", "NM", 6, system="DJMAX")).usage_decay == 0.97
    assert _Weights.of(resolve_params("6K", "NM", 6, system="EZ2ON")).usage_decay == 0.97


def test_default_7k_charts_use_the_whole_keyboard(dense_song: dict) -> None:
    # Human BMS charts use key 1 most (19-21% of the notes from level 2 to 10) and leap three keys
    # or more in a quarter of their moves even on easy charts; before generator 0.9.6 our 7K charts
    # left keys 1 and 7 nearly empty below HARD and piled up on the middle key. Since 0.9.7 each
    # phrase keeps to a few keys drawn by the seed, so one chart may lean on a side (as a quarter of
    # the human charts below level 10 leave key 1 or 7 under 8%): the shares are a mean over seeds.
    # The floor is a "not abandoned" guard, well under what human charts give an outer key (key 7
    # holds 12.6% of their notes against our 9.3% over the 855 held-out charts). Generator 0.9.17
    # dropped it to 7% for the weaker lane-usage balance; refitting keyBias to close the key-share
    # gap instead moves every key the right way and still loses 3.1pp overall (PATTERN_DESIGN 34).
    for tier in ("EASY", "NORMAL", "HARD"):
        per_seed = []
        for seed in range(4):
            keys = [n["lane"] for n in generate_chart(dense_song, "7K+1S", tier, seed=seed)["notes"] if n["lane"] != 0]
            per_seed.append([keys.count(k) / len(keys) for k in range(1, 8)])
        shares = np.mean(per_seed, axis=0)
        assert min(shares[0], shares[6]) >= 0.07 and max(shares) <= 0.3, (tier, [round(float(s), 3) for s in shares])
    notes = sorted((n["t"], n["lane"]) for n in generate_chart(dense_song, "7K+1S", "EASY")["notes"] if n["lane"] != 0)
    moves = [abs(b - a) for (ta, a), (tb, b) in zip(notes, notes[1:]) if 0 < tb - ta <= 450]
    assert sum(m >= 3 for m in moves) / len(moves) >= 0.2


def test_default_7k_phrases_keep_to_a_few_keys_and_easy_chords_use_one_hand(dense_song: dict) -> None:
    # Human BMS 7K charts keep a 4-bar window on a few keys (80% of its notes on 3.8 keys below 4
    # notes a second, 4.2 up to 8, PATTERN_DESIGN 23) and play a sixth of the two-note chords of
    # levels 2 and 6 with one hand, a key between (1+3), rarely on neighbouring keys of one hand.
    # Generator 0.9.6 spread 4-bar windows over 4.4 keys here and had no one-hand chords below HARD.
    hand = {1: "L", 2: "L", 3: "L", 4: "T", 5: "R", 6: "R", 7: "R"}
    sizes, shapes = [], {"gap": 0, "adjacent": 0, "all": 0}
    for tier in ("EASY", "NORMAL"):
        for seed in range(4):
            notes = [n for n in generate_chart(dense_song, "7K+1S", tier, seed=seed)["notes"] if n["lane"] != 0]
            windows: dict[int, dict[int, int]] = {}
            for n in notes:
                w = windows.setdefault(int(n["beat"] // 16), {})
                w[n["lane"]] = w.get(n["lane"], 0) + 1
            for counts in windows.values():
                total = sum(counts.values())
                if total >= 12:
                    held = list(itertools.accumulate(sorted(counts.values(), reverse=True)))
                    sizes.append(next(i + 1 for i, h in enumerate(held) if h >= 0.8 * total))
            for lanes in chords_of({"notes": notes}):
                if len(lanes) == 2:
                    a, b = sorted(lanes)
                    same = hand[a] == hand[b] != "T"
                    shapes["all"] += 1
                    shapes["gap"] += same and b - a > 1
                    shapes["adjacent"] += same and b - a == 1
    assert np.mean(sizes) <= 4.2, np.mean(sizes)
    assert shapes["gap"] >= 0.03 * shapes["all"] and shapes["adjacent"] <= 0.03 * shapes["all"], shapes


def test_easy_charts_read_without_leaps_and_hard_ones_vary(dense_song: dict) -> None:
    for mode, limit in (("6K", 0.12), ("8K", 0.15)):
        for tier, system, level in (("NORMAL", None, None), ("EZ", "EZ2ON", 4)):
            # the share of stairs swings a lot from one seed to the next (8K NORMAL: 0.03-0.25, a
            # mean of 0.09-0.11 over 24 seeds)
            profiles = [pattern_profile(generate_chart(dense_song, mode, tier, level, system=system, seed=seed)["notes"], mode) for seed in range(8)]
            assert max(p["leaps"] for p in profiles) <= limit, (mode, tier, [p["leaps"] for p in profiles])
            assert np.mean([p["stairs"] for p in profiles]) >= 0.08, (mode, tier, [p["stairs"] for p in profiles])
    # Hard charts vary. The shape count only sees single-note runs: since chords follow the music in
    # every section like human charts (generator 0.9.2) instead of gathering in the choruses, this
    # song's verses have chords too and shorter runs. From MX 12 on the song runs out of sounds and
    # the level is reached with chords, so MX is checked where it still has sounds to place. One
    # seed swings by a few kinds either way, so the count is a mean over seeds (since generator
    # 0.9.3 the weak and false onsets that filled some of HD's runs come last: about 31 kinds, 34
    # before).
    for tier, level in (("HD", 9), ("MX", 11)):
        profiles = [pattern_profile(generate_chart(dense_song, "6K", tier, level, system="DJMAX", seed=seed)["notes"], "6K") for seed in range(4)]
        tops, kinds = [p["topShape"] for p in profiles], [p["shapeKinds"] for p in profiles]
        assert max(tops) <= 0.25 and np.mean(kinds) >= 30, (tier, tops, kinds)


def test_the_classic_engine_stays_available(dense_song: dict) -> None:
    designer = generate_chart(dense_song, "6K", "HARD")
    classic = generate_chart(dense_song, "6K", "HARD", overrides={"patternEngine": "classic"})
    assert "patternEngine" not in designer["meta"]["generator"]["params"]
    assert classic["meta"]["generator"]["params"]["patternEngine"] == "classic"
    assert classic["meta"]["chartId"] != designer["meta"]["chartId"] and classic["notes"] != designer["notes"]


# ---------- P4: roles, sound homes, styles ----------

from rhythm_server.generator.planner import vocabulary  # noqa: E402


def groove_analysis(bpm: float = 120.0) -> dict:
    """Drums on the beats (kick, snare) and a melody on the off-beats, two repetition groups of
    eight bars each (A, B, A, B)."""
    beat = 60000.0 / bpm
    offset = 500.0
    onsets = []
    melody = [72, 74, 76, 77, 79, 77, 76, 74]
    for bar in range(32):
        for i in range(8):
            t = offset + (bar * 4 + i / 2) * beat
            if i % 2 == 0:
                kick = i % 4 == 0
                onsets.append({"t": t, "strength": 1.0 if kick else 0.85, "band": "low" if kick else "mid",
                               "bands": [0.85, 0.1, 0.05] if kick else [0.2, 0.6, 0.2], "pitch": None, "harmonic": 0.1,
                               "sustainEnd": None, "source": "drums", "sources": [0.9, 0.04, 0.03, 0.03]})
            else:
                pitch = melody[(bar * 4 + i // 2) % len(melody)] + (0 if bar % 16 < 8 else 5)
                onsets.append({"t": t, "strength": 0.8, "band": "mid", "bands": [0.15, 0.6, 0.25], "pitch": float(pitch),
                               "harmonic": 0.8, "sustainEnd": None, "source": "other", "sources": [0.05, 0.05, 0.1, 0.8]})
    duration = offset + 32 * 4 * beat + 2000.0
    sections = []
    for k in range(4):
        sections.append({"t": offset + k * 32 * beat, "endT": offset + (k + 1) * 32 * beat, "startBeat": k * 32,
                         "label": "verse" if k % 2 == 0 else "chorus", "group": "AB"[k % 2], "energy": 0.8, "leader": "drums"})
    return {
        "audioHash": f"sha256:groove-{bpm}",
        "analyzer": {"name": "core", "version": ANALYZER_VERSION},
        "durationMs": duration,
        "timing": {"offsetMs": offset, "tempoMap": [{"beat": 0, "bpm": bpm}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]},
        "onsets": onsets,
        "sections": sections,
        "energy": {"frameMs": 100, "values": [0.8] * int(duration / 100)},
        "overrides": {},
    }


def hand_sides(chart: dict, mode: str) -> dict[tuple[str, str], list[str]]:
    """Hands of the single notes by (section group, role)."""
    lanes = lane_infos(mode)
    by_t: dict[float, list[dict]] = {}
    for n in chart["notes"]:
        by_t.setdefault(round(n["t"], 3), []).append(n)
    out: dict[tuple[str, str], list[str]] = {}
    for ns in by_t.values():
        if len(ns) != 1 or lanes[ns[0]["lane"]].kind != "key":
            continue
        n = ns[0]
        group = "AB"[int(n["beat"] // 32) % 2]
        role = "drums" if abs(n["beat"] - round(n["beat"])) < 1e-6 else "melody"
        out.setdefault((group, role), []).append(lanes[n["lane"]].hand)
    return out


def test_default_system_draws_each_charts_drum_keys() -> None:
    """Human 7-key BMS charts keep each drum on a key, but every chart picks its own: the snare's
    home is on keys 3-5 in 59-67% of the charts at levels 6-14 and on the other keys in the rest, so
    over many charts the drums spread over all keys. Ours put the snare on key 4 in nearly half the
    charts at levels 2-10 (kick low, snare in the middle, hats high every time). Since generator 0.9.23 the default system draws each
    chart's kick, snare and hat keys from the human spread (roles.drawnHomes, PATTERN_DESIGN 45),
    each on a key of its own (a kick and a snare sharing a key could not keep their lanes when they
    alternate fast); a chart keeps its draw. EASY and NORMAL (below skill 0.35, whose phrases stay
    in narrow windows) and the other systems keep the fixed places."""
    from rhythm_server.generator.planner import _own_keys, drum_places

    grg = resolve_params("7K+1S", "EXPERT", None, None, "GRG")
    assert drum_places(grg, 7) == drum_places(grg, 7)
    draws = [drum_places(grg, seed) for seed in range(400)]
    assert all(p is not None and len(set(p)) == 3 for p in draws)
    snare = [round(p[1] * 6) + 1 for p in draws if p is not None]
    assert set(snare) == set(range(1, 8))
    assert max(snare.count(k) for k in range(1, 8)) / len(snare) < 0.35
    assert _own_keys((2 / 6, 3 / 6, 1.0), 0, 5) == (2, 3, 5)  # 7-key places that round to one 6-key lane
    assert drum_places(resolve_params("6K", "HD", 9, None, "DJMAX"), 7) is None
    assert drum_places(resolve_params("7K+1S", "NORMAL", None, None, "GRG"), 7) is None


def test_hard_charts_split_rhythm_and_melody_between_the_hands() -> None:
    a = groove_analysis()

    def side(hands: list[str]) -> tuple[str, float]:
        main = max(set(hands), key=hands.count)
        return main, hands.count(main) / len(hands)

    # DJMAX swaps sides per repetition group; EZ2ON keeps them, and so does the default system since
    # generator 0.9.8 (human BMS charts keep 71-72% of a drum keysound's notes on one lane)
    for system, tier, level, flips in (("DJMAX", "MX", 13, True), ("EZ2ON", "HD", 14, False), ("GRG", "MASTER", None, False)):
        sides = hand_sides(place(a, "6K", tier, level, system=system), "6K")
        drums_a, share_da = side(sides[("A", "drums")])
        melody_a, share_ma = side(sides[("A", "melody")])
        drums_b, _ = side(sides[("B", "drums")])
        assert drums_a != melody_a and share_da >= 0.85 and share_ma >= 0.85, (system, sides)
        assert (drums_b != drums_a) == flips, system
    # easy charts do not split the hands
    assert all(len(set(h)) == 2 for h in hand_sides(place(a, "6K", "NM", 4, system="DJMAX"), "6K").values() if len(h) > 8)


def test_ez2on_drums_keep_their_keys_for_the_whole_song() -> None:
    a = groove_analysis()
    chart = place(a, "6K", "HD", 14, system="EZ2ON")
    by_beat: dict[float, list[int]] = {}
    for n in chart["notes"]:
        by_beat.setdefault(n["beat"], []).append(n["lane"])
    kicks: dict[str, list[int]] = {}
    for beat, lanes in by_beat.items():
        if abs(beat % 2) < 1e-6 and len(lanes) == 1:  # single-note kicks (beats 1 and 3; downbeats are often chords)
            kicks.setdefault("AB"[int(beat // 32) % 2], []).append(lanes[0])
    main = {g: max(set(v), key=v.count) for g, v in kicks.items()}
    assert main["A"] == main["B"]
    assert all(v.count(main[g]) / len(v) >= 0.8 for g, v in kicks.items())


def test_key_mode_habits_of_each_game(dense_song: dict) -> None:
    def weight(mode: str, system: str, tier: str) -> float:
        return vocabulary(resolve_params(mode, tier, system=system)).get("jack", {}).get("weight", 0.0)

    assert weight("4K", "DJMAX", "MX") > weight("6K", "DJMAX", "MX") and weight("4K", "DJMAX", "MX") > weight("4K", "EZ2ON", "HD")
    assert resolve_params("8K", "HD", system="EZ2ON").chord_size_power < resolve_params("8K", "MX", system="DJMAX").chord_size_power

    def big_chords(chart: dict) -> float:
        sizes = [len(c) for c in chords_of(chart)]
        return sum(1 for x in sizes if x >= 3) / max(1, len(sizes))

    designer = generate_chart(dense_song, "8K", "HD", 14, system="EZ2ON")
    classic = generate_chart(dense_song, "8K", "HD", 14, system="EZ2ON", overrides={"patternEngine": "classic"})
    assert big_chords(designer) > big_chords(classic) + 0.05


# DPC (DJMAX PATTERN-DESIGN CHALLENGE) guidelines, docs/PATTERN_DESIGN.md 12


def test_side_notes_keep_their_hand_clear(dense_song: dict) -> None:
    for mode, tier, level in (("6K+FX", "HD", 9), ("4K+FX", "MX", 13), ("6K+FX", "SC", 6)):
        params = resolve_params(mode, tier, level, system="DJMAX")
        lanes = lane_infos(mode)
        chart = generate_chart(dense_song, mode, tier, level, system="DJMAX")
        side = [n for n in chart["notes"] if lanes[n["lane"]].kind == "side"]
        keys = [n for n in chart["notes"] if lanes[n["lane"]].kind == "key"]
        assert side and all(n["type"] == "hold" for n in side), (mode, tier)
        squeezed = [
            (s["t"], k["t"]) for s in side for k in keys
            if lanes[k["lane"]].hand == lanes[s["lane"]].hand and 1e-3 < abs(k["t"] - s["t"]) < params.min_jack_ms
        ]
        assert squeezed == [], (mode, tier, squeezed[:3])
        # never three keys plus the side note on one hand (6B 1+2+3+L)
        per_hand: dict[tuple[float, str], int] = {}
        for n in chart["notes"]:
            key = (n["t"], lanes[n["lane"]].hand)
            per_hand[key] = per_hand.get(key, 0) + 1
        assert max(per_hand.values()) <= 3, (mode, tier)


def test_the_linter_keeps_key_notes_off_a_side_note() -> None:
    lanes = lane_infos("6K+FX")  # FXL, keys 1-3 (left hand), keys 4-6 (right hand), FXR
    tempo = TempoMap({"offsetMs": 0.0, "tempoMap": [{"beat": 0, "bpm": 120.0}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]})
    params = resolve_params("6K+FX", "MX", 13, system="DJMAX")  # jacks from 180 ms
    side = {"t": 1000.0, "beat": 2.0, "lane": 0, "type": "hold", "endT": 2000.0, "endBeat": 4.0}

    def squeezed(lane: int, t: float) -> bool:
        key = {"t": t, "beat": t / 500.0, "lane": lane, "type": "tap"}
        return any("side note" in p for p in lint([side, key], lanes, params, tempo))

    assert squeezed(1, 900.0)  # the left hand, 100 ms before the side note
    assert not squeezed(1, 1000.0)  # hit together with it
    assert not squeezed(6, 1100.0)  # the other hand
    assert not squeezed(1, 1200.0)  # far enough


def test_chord_notes_take_the_instruments_of_the_hit(dense_song: dict) -> None:
    lanes = lane_infos("6K+FX")
    hit = np.array([0.45, 0.3, 0.05, 0.2])  # drums, bass, vocals, other
    drums, bass, other = 0, 1, 3
    # each sounding instrument gets a key, from the rhythm side (bass, drums) to the melody side
    assert note_sources(hit, (1, 2, 5), None, lanes, True, 0.2) == {1: bass, 2: drums, 5: other}
    # rhythm on the right (a swapped repetition group): the order turns round
    assert note_sources(hit, (1, 2, 5), None, lanes, False, 0.2) == {1: other, 2: drums, 5: bass}
    # notes left over share the loudest instrument; a single note follows it
    assert note_sources(hit, (1, 2, 3, 5), None, lanes, True, 0.2) == {1: bass, 2: drums, 3: drums, 5: other}
    assert note_sources(hit, (3,), None, lanes, True, 0.2) == {3: drums}
    # a side long note takes the sound that sustains, the keys the rest
    assert note_sources(hit, (0, 2, 3), 0, lanes, True, 0.2) == {0: other, 2: bass, 3: drums}
    # a key long note gets the more sustained of the chord's sounds
    assert note_sources(hit, (1, 5), 5, lanes, True, 0.2) == {1: drums, 5: bass}
    # one instrument only: the whole chord follows it
    assert note_sources(np.array([0.7, 0.1, 0.1, 0.1]), (1, 5), None, lanes, True, 0.2) == {1: drums, 5: drums}

    chart = generate_chart(dense_song, "6K", "MX", 13, system="DJMAX")
    by_t: dict[float, set[str]] = {}
    sizes: dict[float, int] = {}
    for n in chart["notes"]:
        by_t.setdefault(n["t"], set()).add(n["src"])
        sizes[n["t"]] = sizes.get(n["t"], 0) + 1
    chords = [t for t, size in sizes.items() if size >= 2]
    assert chords and sum(1 for t in chords if len(by_t[t]) >= 2) / len(chords) > 0.5
