"""Rhythm of generated charts against the synthetic songs' ground truth (docs/PATTERN_DESIGN.md 15).

    python scripts/measure_rhythm.py [--quick]

Per chart:
  beat     share of the chart's hits on the beat; cBeat the same over every note candidate
  16th     share of hits on sixteenths; c16th over the candidates
  lead     share of the lead melody's notes that have a note (within 35 ms); kick the same for kicks
  roll     share of the snare roll's hits (make_groove_song) that have a note
  turns    share of consecutive single notes in a roll that change hands (좌우 연타)
  grid     share of long notes that end on a beat or half beat
  onNote   share of long notes that end where another note starts
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rhythm_server.analysis.analyzer import analyze  # noqa: E402
from rhythm_server.config import difficulty_config  # noqa: E402
from rhythm_server.generator.candidates import build_candidates  # noqa: E402
from rhythm_server.generator.core import generate_chart  # noqa: E402
from rhythm_server.generator.lanes import lane_infos  # noqa: E402
from rhythm_server.generator.params import resolve_params  # noqa: E402
from rhythm_server.generator.tempo import TempoMap  # noqa: E402
from rhythm_server.synth import make_groove_song, make_structured_song  # noqa: E402

SONGS = (
    ("groove 128", lambda: make_groove_song(128.0, 1)),
    ("groove 112 soft lead", lambda: make_groove_song(112.0, 2, lead_gain=0.1, lead_attack=0.05)),
    ("structured 124", lambda: make_structured_song(124.0, 1)),
    ("structured 150 played", lambda: make_structured_song(150.0, 2, humanize=True)),
)
CHARTS = (
    ("6K", "NORMAL", None, {}),
    ("6K", "NORMAL", 6, {}),
    ("6K", "HARD", 9, {}),
    ("6K", "HARD", 9, {"rhythmSource": "melody"}),
    ("6K", "MASTER", 13, {}),
    ("4K", "HARD", 9, {}),
    ("8K", "MASTER", 13, {}),
)
MEASURES = ("beat", "cBeat", "16th", "c16th", "lead", "kick", "roll", "turns", "grid", "onNote")


def subdivision(beat: float) -> int:
    for s in (1, 2, 4, 3, 8, 6):
        if abs(beat * s - round(beat * s)) < 1e-6:
            return s
    return 0


def covered(times: np.ndarray, at: np.ndarray, ms: float = 35.0) -> float | None:
    if not len(times):
        return None
    return float(np.mean([np.min(np.abs(at - t)) < ms for t in times])) if len(at) else 0.0


def measure(song, analysis: dict, chart: dict, cands_beats: list[float]) -> dict[str, float | None]:
    notes = chart["notes"]
    lanes = lane_infos(chart["meta"]["keyMode"])
    tempo = TempoMap(analysis["timing"])
    hits = sorted({n["beat"] for n in notes})
    times = np.array(sorted({n["t"] for n in notes}))
    out: dict[str, float | None] = {
        "beat": float(np.mean([subdivision(b) == 1 for b in hits])),
        "cBeat": float(np.mean([subdivision(b) == 1 for b in cands_beats])),
        "16th": float(np.mean([subdivision(b) == 4 for b in hits])),
        "c16th": float(np.mean([subdivision(b) == 4 for b in cands_beats])),
        "lead": covered(np.array(song.onsets["lead"]) * 1000.0, times),
        "kick": covered(np.array(song.onsets["kick"]) * 1000.0, times),
        "roll": None,
        "turns": None,
    }
    if song.rolls:
        snare = np.array(song.onsets["snare"]) * 1000.0
        got, turns, pairs = 0, 0, 0
        total = 0
        for a, b, _ in song.rolls:
            lo, hi = tempo.beat_to_ms(a) - 20, tempo.beat_to_ms(b) - 20
            prev = None
            for t in snare[(snare >= lo) & (snare < hi)]:
                total += 1
                at = [n for n in notes if abs(n["t"] - t) < 35 and lanes[n["lane"]].kind == "key"]
                if not at:
                    prev = None
                    continue
                got += 1
                if prev is not None:
                    pairs += 1
                    turns += len(at) == 1 and len(prev) == 1 and lanes[at[0]["lane"]].hand != lanes[prev[0]["lane"]].hand
                prev = at
        out["roll"] = got / max(1, total)
        out["turns"] = turns / pairs if pairs else None
    holds = [n for n in notes if n["type"] == "hold"]
    starts = {round(n["beat"], 4) for n in notes}
    out["grid"] = float(np.mean([subdivision(n["endBeat"]) in (1, 2) for n in holds])) if holds else None
    out["onNote"] = float(np.mean([round(n["endBeat"], 4) in starts for n in holds])) if holds else None
    return out


def fmt(v: float | None) -> str:
    return "    -" if v is None else f"{v:5.2f}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="first song and three charts only")
    args = ap.parse_args()
    songs = SONGS[:1] if args.quick else SONGS
    charts = CHARTS[1:4] if args.quick else CHARTS
    tolerance = float(difficulty_config()["snapToleranceMs"])
    for name, make in songs:
        song = make()
        analysis = analyze(song.pcm, song.sample_rate, f"sha256:rhythm-{name}", backends={})
        tempo = TempoMap(analysis["timing"])
        print(f"\n== {name}")
        print(f"  {'chart':28s} " + " ".join(f"{m:>6s}" for m in MEASURES) + "   level  time")
        for key_mode, difficulty, level, overrides in charts:
            t0 = time.perf_counter()
            chart = generate_chart(analysis, key_mode, difficulty, level, overrides=overrides or None)
            dt = time.perf_counter() - t0
            params = resolve_params(key_mode, difficulty, level, overrides or None)
            beats = [c.beat for c in build_candidates(analysis, tempo, params, tolerance)]
            row = measure(song, analysis, chart, beats)
            label = f"{key_mode} {difficulty}{'' if level is None else ' ' + str(level)}" + (f" {overrides['rhythmSource']}" if overrides else "")
            print(f"  {label:28s} " + " ".join(f"{fmt(row[m]):>6s}" for m in MEASURES) + f"   L{chart['meta']['level']:<3d} {dt:5.2f}s")


if __name__ == "__main__":
    main()
