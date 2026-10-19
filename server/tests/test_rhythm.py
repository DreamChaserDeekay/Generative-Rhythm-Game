"""Rolls, the melody and long notes (docs/PATTERN_DESIGN.md 15, 16) on the synthetic songs:
build-ups played hand over hand, notes off the beat where the song is, the melody option
following the melody, long notes only on held sounds and letting go on the grid."""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.config import difficulty_config
from rhythm_server.generator.candidates import Candidate, build_candidates
from rhythm_server.generator.core import generate_chart
from rhythm_server.generator.lanes import lane_infos
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.rolls import find_rolls
from rhythm_server.generator.select import hold_end, holdable
from rhythm_server.generator.tempo import TempoMap
from rhythm_server.synth import make_groove_song, make_structured_song


SONGS = {
    "groove": lambda: make_groove_song(128.0, 1),
    "soft": lambda: make_groove_song(112.0, 2, lead_gain=0.1, lead_attack=0.05),  # a softer build-up
    "structured": lambda: make_structured_song(124.0, 1),
}


@lru_cache(maxsize=None)
def song(kind: str):
    s = SONGS[kind]()
    return s, analyze(s.pcm, s.sample_rate, f"sha256:rhythm-{kind}", backends={})


@lru_cache(maxsize=None)
def chart(kind: str, key_mode: str, system: str, difficulty: str, level: int | None, source: str | None = None, style: str | None = None) -> dict:
    overrides = {k: v for k, v in (("rhythmSource", source), ("style", style)) if v}
    return generate_chart(song(kind)[1], key_mode, difficulty, level, system=system, overrides=overrides or None)


def covered(true_s: list[float], notes: list[dict]) -> float:
    times = np.array(sorted({n["t"] for n in notes}))
    return float(np.mean([np.min(np.abs(times - t * 1000.0)) < 35 for t in true_s]))


def auc(pos: np.ndarray, neg: np.ndarray) -> float:
    values = np.concatenate([pos, neg])
    ranks = values.argsort(kind="stable").argsort() + 1
    return float((ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def test_melody_presence_tells_sung_notes_from_drums() -> None:
    for kind in ("groove", "structured"):
        s, a = song(kind)
        lead = np.array(s.onsets["lead"]) * 1000.0
        presence = np.array([o["melody"] for o in a["onsets"]])
        is_lead = np.array([np.min(np.abs(lead - o["t"])) < 35 for o in a["onsets"]])
        assert auc(presence[is_lead], presence[~is_lead]) >= 0.8, kind
    s, a = song("groove")
    tempo = TempoMap(a["timing"])
    lead = np.array(s.onsets["lead"]) * 1000.0
    # a snare roll under a held note is no melody
    hits = [o["melody"] for o in a["onsets"] for b0, b1, _ in s.rolls
            if tempo.beat_to_ms(b0) - 20 <= o["t"] < tempo.beat_to_ms(b1) - 20 and np.min(np.abs(lead - o["t"])) > 35]
    assert hits and float(np.mean(hits)) < 0.2


def test_build_up_rolls_go_hand_over_hand() -> None:
    for kind, key_mode, system, difficulty, level, per_beat in (
        ("groove", "6K", "DJMAX", "HD", 9, 4), ("groove", "4K", "DJMAX", "MX", 13, 4), ("groove", "8K", "EZ2ON", "HD", 13, 4),
        ("groove", "6K", "DJMAX", "NM", 6, 2), ("groove", "6K", "GRG", "NORMAL", None, 2),
        # every tier plays the song's rolls: NORMAL's grid alone, without the soft sixteenths, misses this one
        ("soft", "6K", "GRG", "NORMAL", None, 2), ("soft", "6K", "DJMAX", "HD", 9, 4),
    ):
        s, a = song(kind)
        tempo = TempoMap(a["timing"])
        notes = chart(kind, key_mode, system, difficulty, level)["notes"]
        lanes = lane_infos(key_mode)
        keys = [n for n in notes if lanes[n["lane"]].kind == "key"]
        for b0, b1, rate in s.rolls:
            step = 1.0 / min(rate, per_beat)  # DJMAX NM plays a sixteenth roll as eighths
            want = [b0 + k * step for k in range(int(round((b1 - b0) / step)))]
            at = {round(n["beat"], 4): [] for n in keys}
            for n in keys:
                at[round(n["beat"], 4)].append(n)
            got = [at.get(round(b, 4)) for b in want]
            assert all(got), (kind, key_mode, difficulty, b0, [b for b, g in zip(want, got) if not g])
            assert all(len(g) == 1 for g in got), (kind, key_mode, difficulty, b0)  # no chords inside a roll
            hands = [lanes[g[0]["lane"]].hand for g in got]
            assert all(x != y for x, y in zip(hands, hands[1:])), (kind, key_mode, difficulty, b0, hands)
            assert tempo.beat_to_ms(b0) >= 0


def test_a_fill_rolls_only_in_its_own_bar() -> None:
    s, _ = song("structured")
    notes = chart("structured", "6K", "DJMAX", "HD", 9)["notes"]
    lanes = lane_infos("6K")
    verses = [x for x in s.structure if x["label"] == "verse"]
    for v in verses:
        end = v["startBeat"] + 4 * v["bars"]
        # the verse ends on a sixteenth snare fill over its last two beats: one note each, hands taking turns
        fill = [n for n in notes if end - 2 <= n["beat"] < end and lanes[n["lane"]].kind == "key"]
        beats = sorted({n["beat"] for n in fill})
        assert len(beats) >= 7 and len(fill) == len(beats), (v["startBeat"], beats)
        hands = [lanes[n["lane"]].hand for n in sorted(fill, key=lambda n: n["beat"])]
        assert sum(x != y for x, y in zip(hands, hands[1:])) >= len(hands) - 2, hands
    # the same bars of the verse's plain loop keep the loop's notes (no roll there)
    first, second = verses[0]["startBeat"], verses[1]["startBeat"]
    plain = lambda start: sorted((round(n["beat"] - start, 4), n["lane"]) for n in notes if start + 14 <= n["beat"] < start + 16)  # noqa: E731
    assert plain(first) == plain(second)


def cand(beat: float, strength: float = 0.6, bands: tuple[float, float, float] = (0.1, 0.45, 0.45), harmonic: float = 0.4, melody: float = 0.0) -> Candidate:
    sub = 1 if beat == int(beat) else 2 if beat * 2 == int(beat * 2) else 4
    return Candidate(beat=beat, t=beat * 500.0, subdivision=sub, strength=strength, bands=np.array(bands), pitch=None,
                     harmonic=harmonic, sustain_beats=0.0, intensity=0.5, downbeat=sub == 1 and int(beat) % 4 == 0, melody=melody)


def test_steady_grooves_are_no_rolls() -> None:
    soft = [cand(b, 0.3) for b in np.arange(40, 104, 1.0)]  # beats elsewhere that set the median strength
    # a snare that speeds up into the next section is one roll, without its landing on the bar line
    build = [cand(b) for b in np.arange(16, 20, 0.5)] + [cand(b) for b in np.arange(20, 24, 0.25)] + [cand(24.0)]
    cands = sorted(soft + build, key=lambda c: c.beat)
    rolls = find_rolls(cands, [0.0, 24.0, 40.0])
    assert len(rolls) == 1 and cands[rolls[0].hits[0]].beat == 16.0 and cands[rolls[0].hits[-1]].beat == 23.75
    # sixteenth hi-hats (high band), eighths of a bass between kicks (tonal) and a snare that keeps
    # going for eight bars (a groove) are no rolls
    for groove in (
        [cand(b, bands=(0.0, 0.05, 0.95)) for b in np.arange(0, 8, 0.25)],
        [cand(b, harmonic=0.9) for b in np.arange(0, 8, 0.5)],
        [cand(b) for b in np.arange(0, 32, 0.5)],
        [cand(b, melody=0.8) for b in np.arange(0, 4, 0.25)],
    ):
        assert find_rolls(sorted(soft + groove, key=lambda c: c.beat), [0.0, 33.0]) == []


def test_the_melody_option_follows_the_melody() -> None:
    s, _ = song("groove")
    # NM's budget leaves out much of the song, so the source decides what it plays; HD's covers
    # most of the song's sounds whichever source leads (0.84 · 0.83 of the lead)
    for difficulty, level, margin in (("NM", 6, 0.05), ("HD", 9, 0.0)):
        melody = chart("groove", "6K", "DJMAX", difficulty, level, "melody")["notes"]
        drum = chart("groove", "6K", "DJMAX", difficulty, level, "drum")["notes"]
        assert covered(s.onsets["lead"], melody) >= 0.8
        assert covered(s.onsets["lead"], melody) > covered(s.onsets["lead"], drum) + margin
        assert covered(s.onsets["kick"], melody) <= covered(s.onsets["kick"], drum)
        # the melody style follows the melody too, unless the player picks another rhythm source
        styled = chart("groove", "6K", "DJMAX", difficulty, level, "auto", "melody")
        assert styled["meta"]["generator"]["params"]["rhythmSource"] == "melody"
        assert covered(s.onsets["lead"], styled["notes"]) > covered(s.onsets["lead"], drum) + margin
        assert chart("groove", "6K", "DJMAX", difficulty, level, "drum", "melody")["meta"]["generator"]["params"]["rhythmSource"] == "drum"


def test_harder_charts_follow_the_song_off_the_beat() -> None:
    _, a = song("groove")
    tempo = TempoMap(a["timing"])
    tolerance = float(difficulty_config()["snapToleranceMs"])

    def share(beats: list[float], sub: int) -> float:
        return float(np.mean([abs(b * sub - round(b * sub)) < 1e-6 and (sub == 1 or abs(b * sub / 2 - round(b * sub / 2)) > 1e-6) for b in beats]))

    for key_mode, system, difficulty, level in (("6K", "DJMAX", "HD", 9), ("6K", "DJMAX", "MX", 13), ("8K", "EZ2ON", "HD", 13)):
        hits = sorted({n["beat"] for n in chart("groove", key_mode, system, difficulty, level)["notes"]})
        params = resolve_params(key_mode, difficulty, level, None, system)
        beats = [c.beat for c in build_candidates(a, tempo, params, tolerance)]
        assert share(hits, 1) <= share(beats, 1) + 0.15, (difficulty, share(hits, 1), share(beats, 1))
        assert share(hits, 4) >= 0.6 * share(beats, 4), (difficulty, share(hits, 4), share(beats, 4))


def test_long_notes_go_on_held_sounds_only() -> None:
    tempo = TempoMap({"offsetMs": 0.0, "tempoMap": [{"beat": 0, "bpm": 120.0}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]})

    def cand(**changes: object) -> Candidate:
        fields: dict = dict(beat=4.0, t=2000.0, subdivision=1, strength=0.8, bands=np.ones(3), pitch=None, harmonic=0.8, sustain_beats=2.0,
                            intensity=0.5, downbeat=True, sources=np.array([0.1, 0.1, 0.6, 0.2]), melody=0.0)
        fields.update(changes)
        return Candidate(**fields)

    assert holdable(cand(melody=1.0, beat=4.25, subdivision=4), tempo)  # a sung note, off the beat too
    assert holdable(cand(sources=np.array([0.05, 0.1, 0.1, 0.75])), tempo)  # a pad chord on the beat
    assert not holdable(cand(sources=np.array([0.6, 0.3, 0.05, 0.05])), tempo)  # a kick over a held bass
    assert not holdable(cand(beat=4.333333, subdivision=3), tempo)  # a slow attack caught late
    assert not holdable(cand(melody=1.0, sustain_beats=0.6), tempo)  # 300 ms: too short a sound
    assert holdable(cand(sources=None, harmonic=0.7), tempo)  # an analysis without stems
    assert not holdable(cand(sources=None, harmonic=0.3), tempo)


def test_long_notes_let_go_on_the_grid() -> None:
    assert hold_end(18.0, 1.889, 0.5, 0.9) == 20.0  # a held note that fades just before the next beat
    assert hold_end(0.25, 0.85, 0.5, 0.9) == 1.0  # an off-beat head still lets go on the beat
    assert hold_end(0.0, 1.38, 0.5, 0.2) == 1.0  # the beat before the end, not a quarter-beat length
    assert hold_end(0.0, 0.7, 0.5, 0.9) == 0.5
    assert hold_end(0.0, 0.3, 0.5, 0.9) is None
    for kind, key_mode, system, difficulty, level in (
        ("groove", "6K", "DJMAX", "HD", 9), ("groove", "8K", "EZ2ON", "HD", 13), ("structured", "6K", "DJMAX", "MX", 13), ("structured", "6K", "GRG", "NORMAL", None),
    ):
        notes = chart(kind, key_mode, system, difficulty, level)["notes"]
        holds = [n for n in notes if n["type"] == "hold"]
        starts = {round(n["beat"], 4) for n in notes}
        assert holds and all(abs(2 * n["endBeat"] - round(2 * n["endBeat"])) < 1e-6 for n in holds), (kind, difficulty)
        # most let go where another note comes in (the next note of the tune) or where the sung
        # note ends (within 0.3 beat)
        s, _ = song(kind)
        beat_ms = 60000.0 / (128.0 if kind == "groove" else 124.0)
        sung = {round(st * 1000.0): en * 1000.0 for st, en, _ in s.sustains}

        def at_sound_end(n: dict) -> bool:
            ends = [e for st, e in sung.items() if abs(st - n["t"]) < 35]
            return bool(ends) and abs(n["endT"] - ends[0]) <= 0.3 * beat_ms

        assert np.mean([round(n["endBeat"], 4) in starts or at_sound_end(n) for n in holds]) >= 0.75, (kind, difficulty)
