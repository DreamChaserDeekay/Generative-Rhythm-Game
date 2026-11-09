"""What a song's analysis and the generator do in one stretch of time (a passage a player finds too
sparse or too drum-heavy, a guitar solo ...): the analysis's sections and onsets there, and per
chart the notes with the generator as it is and with one rule off at a time (the split penalty,
the attack weight, the instrument voices), so the rule that thins the passage shows. Reads the
song's analysis.json only (no audio) and prints text.

    python -I server/scripts/diagnose_window.py <analysis.json> --from 130 --to 179 [--charts 6K:ELITE,7K+1S:EXPERT]

(docs/PATTERN_DESIGN.md 93-4)
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402

from rhythm_server.analysis.stems import STEM_NAMES  # noqa: E402
from rhythm_server.config import difficulty_config, load_config  # noqa: E402
from rhythm_server.generator import core, sections as sectioned  # noqa: E402
from rhythm_server.generator.candidates import build_candidates, snap, swing_bars  # noqa: E402
from rhythm_server.generator.params import resolve_params  # noqa: E402
from rhythm_server.generator.tempo import TempoMap  # noqa: E402


def q(values: list[float], ps: tuple[int, ...] = (10, 50, 90)) -> str:
    if not values:
        return "-"
    return " / ".join(f"{np.percentile(values, p):.2f}" for p in ps)


def guitarish(o: dict[str, Any]) -> bool:
    inst = o.get("instruments")
    if inst:
        return float(inst.get("guitar", 0.0)) >= 0.5
    return o.get("source") == "other"


def onset_report(a: dict[str, Any], lo: float, hi: float, tempo: TempoMap) -> None:
    ons = a["onsets"]
    win = [o for o in ons if lo <= o["t"] < hi]
    dur = float(a["durationMs"])
    print(f"\n## onsets {lo / 1000:.1f}-{hi / 1000:.1f}s: {len(win)} ({len(win) / ((hi - lo) / 1000):.1f}/s; song {len(ons) / (dur / 1000):.1f}/s)")
    by = {s: sum(1 for o in win if o.get("source") == s) for s in STEM_NAMES}
    print("  main stem:", ", ".join(f"{s} {n}" for s, n in by.items()))
    has_inst = any(o.get("instruments") for o in win)
    g = [o for o in win if guitarish(o)]
    print(f"  guitar-ish ({'instruments.guitar >= 0.5' if has_inst else 'main stem other'}): {len(g)}"
          + (f"; piano >= 0.5: {sum(1 for o in win if (o.get('instruments') or {}).get('piano', 0) >= 0.5)}" if has_inst else ""))
    print("  attack p10/p50/p90  all:", q([o.get("attack", 1.0) for o in win]), "| guitar-ish:", q([o.get("attack", 1.0) for o in g]),
          "| drums:", q([o.get("attack", 1.0) for o in win if o.get("source") == "drums"]))
    print("  melody p10/p50/p90  guitar-ish:", q([o.get("melody", 0.0) for o in g]))
    gt = sorted(o["t"] for o in g)
    iois = [b - a_ for a_, b in zip(gt, gt[1:]) if b - a_ < 1000]
    beat_ms = 60000.0 / float(a["tempo"]["bpm"])
    if iois:
        print(f"  guitar-ish gaps (ms) p10/p50/p90: {q(iois)} | a 16th is {beat_ms / 4:.0f} ms, a 32nd {beat_ms / 8:.0f}, a 16th triplet {beat_ms / 6:.0f}")
    # where the onsets sit: on which grid (within 35 ms)
    tol = float(difficulty_config()["snapToleranceMs"])
    grids = {"4": 1, "8": 2, "16": 4, "8T": 3, "16T": 6, "32": 8}
    sits = {k: 0 for k in grids}
    none = 0
    for o in win:
        hit = snap(o["t"], tempo, tuple(grids.values()), tol)
        if hit is None:
            none += 1
            continue
        sits[next(k for k, v in grids.items() if v == hit[1])] += 1
    print("  coarsest grid within 35 ms:", ", ".join(f"{k} {n}" for k, n in sits.items()), f", none {none}")


def section_report(a: dict[str, Any], lo: float, hi: float) -> None:
    print("\n## sections there")
    for s in a.get("sections", []):
        if s["endT"] <= lo or s["t"] >= hi:
            continue
        stems = s.get("stems")
        mix = ", ".join(f"{n} {v:.2f}" for n, v in zip(STEM_NAMES, stems)) if stems else "-"
        lead = f" lead {s.get('lead')} {json.dumps(s.get('leadShares'))}" if s.get("lead") or s.get("leadShares") else ""
        ml = f" (backend: {s['mlLabel']})" if s.get("mlLabel") else ""
        print(f"  {s['t'] / 1000:6.1f}-{s['endT'] / 1000:6.1f}s {s['label']}{ml} group {s['group']} energy {s['energy']:.2f} loop {s.get('loopBars')} | stems {mix} | leader {s.get('leader')}{lead}")


def nearest_onset(ts: np.ndarray, ons: list[dict[str, Any]], t: float) -> dict[str, Any] | None:
    i = int(np.searchsorted(ts, t))
    best = None
    for j in (i - 1, i):
        if 0 <= j < len(ts) and abs(ts[j] - t) <= 40.0 and (best is None or abs(ts[j] - t) < abs(ts[best] - t)):
            best = j
    return ons[best] if best is not None else None


class Patch:
    """Sets config values for one run and puts them back."""

    def __init__(self, edits: list[tuple[dict[str, Any], str, Any]]):
        self.edits = edits
        self.saved: list[tuple[dict[str, Any], str, Any, bool]] = []

    def __enter__(self) -> None:
        for d, k, v in self.edits:
            self.saved.append((d, k, d.get(k), k in d))
            d[k] = v
        core._plan_cache.clear()

    def __exit__(self, *_: Any) -> None:
        for d, k, v, had in reversed(self.saved):
            if had:
                d[k] = v
            else:
                d.pop(k, None)
        core._plan_cache.clear()


def chart_report(a: dict[str, Any], key_mode: str, tier: str, lo: float, hi: float) -> None:
    ons = sorted(a["onsets"], key=lambda o: o["t"])
    ts = np.array([o["t"] for o in ons])
    inst = load_config("instruments")["rhythmSource"]
    variants = {
        "as is": [],
        "split penalty off": [(inst["melody"]["split"], "scale", 1.0)],
        "attack weight off": [(inst["attack"], "power", 0.0)],
        "voices off": [(sectioned.sectioned_config(), "voices", None)],
        "all three off": [(inst["melody"]["split"], "scale", 1.0), (inst["attack"], "power", 0.0), (sectioned.sectioned_config(), "voices", None)],
    }
    print(f"\n## {key_mode} {tier}")
    voices: list[Any] = []
    real_mark = sectioned._mark_voices

    def spy(units, *args, **kwargs):  # the units' voices of the last round
        on = real_mark(units, *args, **kwargs)
        voices[:] = [(u.start, u.length, u.voice) for u in units]
        return on

    for name, edits in variants.items():
        sectioned._mark_voices = spy
        try:
            with Patch(edits):
                chart = core.generate_chart(a, key_mode, tier, None)
        except Exception as e:  # a tier the song does not make
            print(f"  {name}: {type(e).__name__}: {e}")
            continue
        finally:
            sectioned._mark_voices = real_mark
        notes = chart["notes"]
        win = [n for n in notes if lo <= n["t"] < hi]
        dur = float(a["durationMs"]) / 1000
        by = {s: sum(1 for n in win if n.get("src") == s) for s in STEM_NAMES}
        g = sum(1 for n in win if (o := nearest_onset(ts, ons, n["t"])) is not None and guitarish(o))
        times = len({round(n["t"]) for n in win})
        print(f"  {name:18s} level {chart['meta']['level']:2d} | notes here {len(win):4d} ({len(win) / ((hi - lo) / 1000):.1f}/s; song {len(notes) / dur:.1f}/s), times {times}"
              f" | src {', '.join(f'{s} {n}' for s, n in by.items())} | on guitar-ish onsets {g}")
        if name == "as is":
            tempo = TempoMap(a["timing"])
            b_lo, b_hi = tempo.ms_to_beat(lo), tempo.ms_to_beat(hi)
            names = {i: n for i, n in enumerate(STEM_NAMES)}
            shown = [(s, l, v) for s, l, v in voices if s + l > b_lo and s < b_hi]
            if shown:
                print("    unit voices:", "; ".join(f"beat {s:.0f}+{l:.0f} {'/'.join(names[i] for i in v) if v else 'none'}" for s, l, v in shown))
            # the candidates there and which became notes
            params = resolve_params(key_mode, tier, None, None)
            cands = build_candidates(a, tempo, params, float(difficulty_config()["snapToleranceMs"]), swing_bars(a, tempo))
            cw = [c for c in cands if lo <= c.t < hi]
            note_t = {round(n["t"]) for n in win}
            gc = [c for c in cw if c.sources is not None and (c.instruments or {}).get("guitar", 0.0) >= 0.5] if any(c.instruments for c in cw) else \
                 [c for c in cw if c.sources is not None and int(np.argmax(c.sources)) == STEM_NAMES.index("other")]
            dc = [c for c in cw if c.sources is not None and int(np.argmax(c.sources)) == STEM_NAMES.index("drums")]
            taken = lambda cs: sum(1 for c in cs if round(c.t) in note_t)  # noqa: E731
            print(f"    candidates here {len(cw)} (of {sum(1 for o in ons if lo <= o['t'] < hi)} onsets; tier subdivisions {params.subdivisions})"
                  f" | guitar-ish {len(gc)} -> notes {taken(gc)} | drums {len(dc)} -> notes {taken(dc)}")
            print(f"    score p50  guitar-ish {statistics.median([c.score for c in gc]) if gc else 0:.3f} | drums {statistics.median([c.score for c in dc]) if dc else 0:.3f}"
                  f" | solo flag {sum(1 for c in cw if c.solo)}/{len(cw)} | lead notes {sum(1 for c in cw if c.lead_note)} | quiet {sum(1 for c in cw if c.quiet)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("analysis")
    ap.add_argument("--from", dest="lo", type=float, required=True, help="seconds")
    ap.add_argument("--to", dest="hi", type=float, required=True, help="seconds")
    ap.add_argument("--charts", default="6K:ELITE,6K:HARD,7K+1S:EXPERT")
    args = ap.parse_args()
    a = json.loads(Path(args.analysis).read_text(encoding="utf-8"))
    lo, hi = args.lo * 1000.0, args.hi * 1000.0
    tempo = TempoMap(a["timing"])
    info = a.get("analyzer", {})
    print(f"# analyzer {info.get('version')} backends {json.dumps(info.get('backends'))} errors {json.dumps(info.get('errors', {}))}")
    print(f"# generator {core.GENERATOR_VERSION} | song {float(a['durationMs']) / 1000:.1f}s | BPM {a['tempo']['bpm']} ({a['tempo']['bpmMin']}-{a['tempo']['bpmMax']})"
          f" | meter {a['timing']['meter'][0]['beatsPerMeasure']}/4")
    section_report(a, lo, hi)
    onset_report(a, lo, hi, tempo)
    for spec in args.charts.split(","):
        key_mode, tier = spec.split(":")
        chart_report(a, key_mode.strip(), tier.strip().upper(), lo, hi)


if __name__ == "__main__":
    main()
