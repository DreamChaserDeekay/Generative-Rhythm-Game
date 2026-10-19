"""Our generated charts against human-made BMS charts, measured the same way (scripts/bms_stats.py).

    python scripts/compare_bms.py BMS_STATS_JSON [--out ours.json] [--quick]

Generates 7K+1S and 5K charts on the synthetic songs, measures them with `bms_stats.chart_features`
and prints, for every density bin both sides have, the measures side by side and how far apart the
distributions are (half the L1 distance: 0 = the same, 1 = nothing in common). Charts of the same
density are compared because our levels and BMS #PLAYLEVEL are different scales.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rhythm_server.analysis.analyzer import analyze  # noqa: E402
from rhythm_server.generator.core import generate_chart  # noqa: E402
from rhythm_server.synth import make_groove_song, make_pop_song, make_structured_song  # noqa: E402

_spec = importlib.util.spec_from_file_location("bms_stats", Path(__file__).with_name("bms_stats.py"))
bms_stats = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bms_stats)  # type: ignore[union-attr]

SONGS = (
    ("structured 124", lambda: make_structured_song(bpm=124.0, seed=1)),
    ("structured 150", lambda: make_structured_song(bpm=150.0, seed=2)),
    ("pop 128", lambda: make_pop_song(128.0, 2)),
    ("groove 112", lambda: make_groove_song(112.0, 2)),
)
CHARTS = tuple(("7K+1S", "GRG", d, None) for d in ("EASY", "NORMAL", "HARD", "EXPERT", "MASTER"))
MEASURES = (
    "nps", "chord", "ln", "scratchShare", "onBeat", "eighth", "sixteenth", "triplet", "jack", "jackStreaks",
    "runNotes", "stairs", "trills", "handRuns", "handRunsNoStair", "anchors", "adjacent2", "symmetric2",
    "oneHandGap2", "offBars", "densityCv",
)
HISTS = ("chordSize", "grid", "pair", "shape", "lane", "handMove", "move:<=150", "move:<=200", "move:<=260", "move:<=400")


def our_notes(chart: dict, key_mode: str) -> tuple[list[tuple], str]:
    """Our chart's notes as bms_stats tuples (lane 0 = scratch, keys from 1)."""
    shift = 0 if key_mode == "7K+1S" else 1  # 5K has no scratch: its keys 0..4 become 1..5
    mode = "7K+1S" if key_mode == "7K+1S" else "5K+1S"
    notes = []
    for n in chart["notes"]:
        end = n.get("endBeat") if n["type"] == "hold" else None
        notes.append((float(n["beat"]), float(n["t"]), int(n["lane"]) + shift, end, n.get("endT") if end is not None else None, n.get("src") or ""))
    return notes, mode


def measure_ours(quick: bool) -> dict:
    agg = bms_stats.Aggregate()
    songs = SONGS[:2] if quick else SONGS
    charts = list(CHARTS) + [("5K", "DJMAX", d, lv) for d, lv in (("NM", 6), ("HD", 9), ("MX", 13))]
    for name, make in songs:
        song = make()
        analysis = analyze(song.pcm, song.sample_rate, f"sha256:compare-{name}", backends={})
        for key_mode, system, difficulty, level in charts:
            chart = generate_chart(analysis, key_mode, difficulty, level, system=system)
            notes, mode = our_notes(chart, key_mode)
            beats = chart["timing"]["meter"][0]["beatsPerMeasure"] if chart["timing"].get("meter") else 4
            row, hist = bms_stats.chart_features(notes, mode, None if beats == 4 else [float(beats)] * 1000)
            for group in bms_stats.groups_of(mode, int(chart["meta"]["level"]), row["nps"]):
                agg.add(group, row, hist)
            print(f"  {name:15s} {key_mode:6s} {system} {difficulty:6s} Lv.{chart['meta']['level']:<2} nps {row['nps']:.1f}", flush=True)
    return {"groups": agg.summary()}


def distance(a: dict, b: dict) -> float | None:
    """Half the L1 distance of two histograms as shares (0 = the same, 1 = disjoint)."""
    ta, tb = sum(a.values()), sum(b.values())
    if not ta or not tb:
        return None
    return 0.5 * sum(abs(a.get(k, 0) / ta - b.get(k, 0) / tb) for k in set(a) | set(b))


def report(bms: dict, ours: dict) -> None:
    shared = sorted(g for g in ours["groups"] if g in bms["groups"] and "|nps " in g)
    if not shared:
        print("no density bin in common")
        return
    for g in shared:
        b, o = bms["groups"][g], ours["groups"][g]
        print(f"\n== {g}: BMS {b['charts']} charts, ours {o['charts']}")
        for m in MEASURES:
            if m in b["mean"] and m in o["mean"]:
                print(f"  {m:16s} BMS {b['mean'][m]:8.3f} (sd {b['sd'][m]:.3f})   ours {o['mean'][m]:8.3f}")
        for h in HISTS:
            d = distance(b["hist"].get(h, {}), o["hist"].get(h, {}))
            if d is not None:
                top_b = sorted(b["hist"][h].items(), key=lambda kv: -kv[1])[:5]
                top_o = sorted(o["hist"][h].items(), key=lambda kv: -kv[1])[:5]
                tb, to = sum(b["hist"][h].values()), sum(o["hist"][h].values())
                fmt = lambda top, t: ", ".join(f"{k} {v / t:.0%}" for k, v in top)  # noqa: E731
                print(f"  {h:16s} apart {d:.2f} | BMS {fmt(top_b, tb)} | ours {fmt(top_o, to)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("bms_stats", help="bms_stats.json written by scripts/bms_stats.py")
    ap.add_argument("--out", help="also save our measures here")
    ap.add_argument("--quick", action="store_true", help="two songs only")
    args = ap.parse_args()
    bms = json.load(open(args.bms_stats, encoding="utf-8"))
    ours = measure_ours(args.quick)
    if args.out:
        json.dump(ours, open(args.out, "w", encoding="utf-8"), ensure_ascii=False)
    report(bms, ours)


if __name__ == "__main__":
    main()
