"""Section consistency measurements of docs/PATTERN_DESIGN.md 13 on the structured synthetic songs.

    python scripts/measure_consistency.py [--engines designer,classic] [--quick]

Prints the structure analysis accuracy against the true sections, then for each chart the
consistency measures (difficulty/consistency.py) over the TRUE sections, so engines are compared on
what the music really repeats. Charts are made twice: from the analysed sections and from the true
ones (which separates structure errors from generator errors). Also prints, per chart, how
consistent the candidates (every snapped onset) already are, which bounds what note selection can
keep, and how many patterns the planner uses per section.
"""

from __future__ import annotations

import argparse
import copy
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rhythm_server.analysis.analyzer import analyze  # noqa: E402
from rhythm_server.analysis.ml import section_stems  # noqa: E402
from rhythm_server.difficulty.consistency import chart_consistency, structure_accuracy  # noqa: E402
from rhythm_server.generator.candidates import build_candidates  # noqa: E402
from rhythm_server.generator.core import generate_chart  # noqa: E402
from rhythm_server.config import difficulty_config  # noqa: E402
from rhythm_server.generator.params import resolve_params  # noqa: E402
from rhythm_server.generator.tempo import TempoMap  # noqa: E402
from rhythm_server.synth import detection_noise, make_structured_song  # noqa: E402

SONGS = ((124.0, 1), (150.0, 2))
CHARTS = (
    ("6K", "GRG", "NORMAL", None),
    ("8K", "GRG", "HARD", None),
    ("4K", "DJMAX", "NM", 6),
    ("6K", "DJMAX", "HD", 9),
    ("6K", "DJMAX", "MX", 13),
    ("8K", "EZ2ON", "HD", 13),
)
MEASURES = ("loopRhythm", "loopLane", "repeatSelect", "repeatLane", "repeatLaneMirror", "barVariety", "laneEntropy")


def truth_sections(analysis: dict, truth: list[dict]) -> list[dict]:
    """The true sections as analysis rows (time, energy and stem mix measured on the analysis)."""
    tempo = TempoMap(analysis["timing"])
    energy = np.asarray(analysis["energy"]["values"], dtype=float)
    rows = []
    for k, s in enumerate(truth):
        start = float(s["startBeat"])
        end = start + 4 * int(s["bars"])
        t, end_t = tempo.beat_to_ms(start), tempo.beat_to_ms(end)
        span = energy[int(t / 100) : max(int(t / 100) + 1, int(end_t / 100))]
        rows.append({"t": t, "endT": end_t, "startBeat": start, "endBeat": end, "label": s["label"], "group": s["group"], "loopBars": s["loopBars"], "energy": float(np.median(span))})
    e = np.array([r["energy"] for r in rows])
    e = (e - e.min()) / max(float(np.ptp(e)), 1e-9)
    for r, v in zip(rows, e):
        r["energy"] = round(float(v), 3)
    onsets = analysis["onsets"]
    section_stems(rows, np.array([o["t"] for o in onsets]), np.array([o["strength"] for o in onsets]), np.array([o["sources"] for o in onsets]))
    return rows


def candidate_consistency(analysis: dict, key_mode: str, system: str, difficulty: str, level: int | None, sections: list[dict]) -> dict:
    """Consistency of all snapped onsets (as one-lane notes): the ceiling of selection consistency."""
    params = resolve_params(key_mode, difficulty, level, None, system)
    tempo = TempoMap(analysis["timing"])
    cands = build_candidates(analysis, tempo, params, float(difficulty_config()["snapToleranceMs"]))
    notes = [{"beat": c.beat, "lane": 0} for c in cands]
    return chart_consistency(notes, sections, key_mode)


def planner_stats(analysis: dict, key_mode: str, system: str, difficulty: str, level: int | None, sections: list[dict]) -> tuple[float, float]:
    """(patterns per section, pattern changes per section) the planner picks at the starting density."""
    from rhythm_server.generator.lanes import lane_infos
    from rhythm_server.generator.planner import phrases_of, plan_patterns
    from rhythm_server.generator.select import select_slots

    params = resolve_params(key_mode, difficulty, level, None, system)
    tempo = TempoMap(analysis["timing"])
    lanes = lane_infos(key_mode)
    cands = build_candidates(analysis, tempo, params, float(difficulty_config()["snapToleranceMs"]))
    special = next((l.kind for l in lanes if l.kind != "key"), None)
    slots = select_slots(cands, params, tempo, 1.0, special, sum(1 for l in lanes if l.kind == "key"))
    plan = plan_patterns(slots, sections, params, tuple(l.hand for l in lanes if l.kind == "key"), tempo)
    phrases = phrases_of(slots, sections, tempo)
    per: dict[int, list[str]] = {}
    for n, p in enumerate(phrases):
        per.setdefault(p.section, []).append(plan[p.slots[0]].motif)
    kinds = [len(set(v)) for v in per.values()]
    changes = [sum(1 for a, b in zip(v, v[1:]) if a != b) for v in per.values()]
    return float(np.mean(kinds)), float(np.mean(changes))


def fmt(v: object) -> str:
    return "  -  " if v is None else f"{v:5.2f}" if isinstance(v, float) else str(v)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engines", default="designer,classic")
    ap.add_argument("--quick", action="store_true", help="first song and first three charts only")
    ap.add_argument("--noise", action="store_true", help="add onset detection noise (synth.detection_noise)")
    args = ap.parse_args()
    engines = args.engines.split(",")
    songs = SONGS[:1] if args.quick else SONGS
    charts = CHARTS[:3] if args.quick else CHARTS
    for bpm, seed in songs:
        song = make_structured_song(bpm=bpm, seed=seed)
        t0 = time.perf_counter()
        analysis = analyze(song.pcm, song.sample_rate, f"sha256:structured-{bpm}-{seed}", backends={})
        if args.noise:
            analysis = detection_noise(analysis, seed)
        print(f"\n== song {bpm:g} BPM seed {seed}: {song.duration:.0f}s, analysis {time.perf_counter() - t0:.1f}s, offset {analysis['timing']['offsetMs']:.0f}ms")
        found = analysis["sections"]
        print("  found:", " ".join(f"{s['startBeat'] // 4}:{s['label']}/{s['group']}/{s.get('loopBars', '-')}" for s in found))
        print("  truth:", " ".join(f"{s['startBeat'] // 4}:{s['label']}/{s['group']}/{s['loopBars']}" for s in song.structure))
        print("  structure:", structure_accuracy(found, song.structure, 4, sum(int(s["bars"]) for s in song.structure)))
        truth = truth_sections(analysis, song.structure)
        truth_analysis = copy.deepcopy(analysis)
        truth_analysis["sections"] = truth
        print(f"  {'chart':22s} {'engine':9s} {'sections':8s} " + " ".join(f"{m[:10]:>10s}" for m in MEASURES) + "  level  time")
        for key_mode, system, difficulty, level in charts:
            name = f"{key_mode} {system} {difficulty}{'' if level is None else ' ' + str(level)}"
            cc = candidate_consistency(analysis, key_mode, system, difficulty, level, truth)
            kinds, changes = planner_stats(truth_analysis, key_mode, system, difficulty, level, truth)
            print(f"  {name:22s} {'(onsets)':9s} {'truth':8s} {fmt(cc['loopRhythm']):>10s} {'':>10s} {fmt(cc['repeatSelect']):>10s}   planner: {kinds:.1f} patterns, {changes:.1f} changes per section")
            for engine in engines:
                for label, source in (("found", analysis), ("truth", truth_analysis)):
                    t1 = time.perf_counter()
                    chart = generate_chart(source, key_mode, difficulty, level, overrides={"patternEngine": engine}, system=system)
                    dt = time.perf_counter() - t1
                    c = chart_consistency(chart["notes"], truth, key_mode)
                    print(f"  {name:22s} {engine:9s} {label:8s} " + " ".join(f"{fmt(c[m]):>10s}" for m in MEASURES) + f"  {chart['meta']['level']:5d} {dt:5.2f}s")


if __name__ == "__main__":
    main()
