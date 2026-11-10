"""What a song's analysis and the generator do in one stretch of time (a passage a player finds too
sparse or too drum-heavy, a guitar solo ...): the analysis's sections and onsets there, and per
chart the notes with the generator as it is and with one rule off at a time (the split penalty,
the attack weight, the instrument voices, the instrument-solo rules), so the rule that thins the
passage shows. Reads the song's analysis.json only (no audio) and prints text.

    python -I server/scripts/diagnose_window.py <analysis.json> --from 130 --to 179 [--charts 6K:ELITE,7K+1S:EXPERT]

(docs/PATTERN_DESIGN.md 93-4, 94)
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


def lead_instrument(a: dict[str, Any], lo: float, hi: float) -> str:
    """The instrument a section in the window leads with (6-stem analysis), else the guitar."""
    leads = load_config("instruments")["rhythmSource"]["melody"].get("solo", {}).get("instrumentLeads", ())
    for s in a.get("sections", []):
        if s["endT"] > lo and s["t"] < hi and s.get("lead") in leads:
            return str(s["lead"])
    return "guitar"


class Guitarish:
    """Whether an onset is the lead instrument's: with 6-stem shares (onsets[].instruments, a share
    of the onset's attack, small for most onsets), as the generator's lead notes, a share of the
    lead at least the window's melody.solo leadQuantile; else the main stem "other"."""

    def __init__(self, win: list[dict[str, Any]], lead: str):
        self.lead = lead
        shares = [float(o["instruments"].get(lead, 0.0)) for o in win if o.get("instruments")]
        q_ = float(load_config("instruments")["rhythmSource"]["melody"].get("solo", {}).get("leadQuantile", 0.5))
        self.cut = float(np.quantile(shares, q_)) if shares else None

    def __call__(self, o: dict[str, Any]) -> bool:
        inst = o.get("instruments")
        if inst and self.cut is not None:
            return o.get("source") not in ("drums", "bass") and float(inst.get(self.lead, 0.0)) >= self.cut
        return o.get("source") == "other"

    def rule(self) -> str:
        return f"{self.lead} share >= {self.cut:.3f} (the window's leadQuantile), main stem not drums/bass" if self.cut is not None else "main stem other"


def onset_report(a: dict[str, Any], lo: float, hi: float, tempo: TempoMap, guitarish: Guitarish) -> None:
    ons = a["onsets"]
    win = [o for o in ons if lo <= o["t"] < hi]
    dur = float(a["durationMs"])
    print(f"\n## onsets {lo / 1000:.1f}-{hi / 1000:.1f}s: {len(win)} ({len(win) / ((hi - lo) / 1000):.1f}/s; song {len(ons) / (dur / 1000):.1f}/s)")
    by = {s: sum(1 for o in win if o.get("source") == s) for s in STEM_NAMES}
    print("  main stem:", ", ".join(f"{s} {n}" for s, n in by.items()))
    g = [o for o in win if guitarish(o)]
    print(f"  guitar-ish ({guitarish.rule()}): {len(g)}")
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


def strong_beat(n: dict[str, Any], a: dict[str, Any], bpb: int) -> bool:
    """Whether a note is on beat one or three of its bar (beat two of a 3/4 bar is not)."""
    starts = sorted(float(s["startBeat"]) for s in a.get("sections", []) if "startBeat" in s) or [0.0]
    start = max((b for b in starts if b <= float(n["beat"]) + 1e-6), default=0.0)
    beat_in_bar = (float(n["beat"]) - start) % bpb
    return min(beat_in_bar, bpb - beat_in_bar) < 1e-3 or (bpb % 2 == 0 and abs(beat_in_bar - bpb / 2) < 1e-3)


def chart_report(a: dict[str, Any], key_mode: str, tier: str, lo: float, hi: float, guitarish: Guitarish) -> None:
    ons = sorted(a["onsets"], key=lambda o: o["t"])
    ts = np.array([o["t"] for o in ons])
    inst = load_config("instruments")["rhythmSource"]
    variants = {
        "as is": [],
        "split penalty off": [(inst["melody"]["split"], "scale", 1.0)],
        "attack weight off": [(inst["attack"], "power", 0.0)],
        "voices off": [(sectioned.sectioned_config(), "voices", None)],
        "all three off": [(inst["melody"]["split"], "scale", 1.0), (inst["attack"], "power", 0.0), (sectioned.sectioned_config(), "voices", None)],
        "lead solo rules off": [(sectioned.sectioned_config(), "leadSolo", None)],
    }
    bpb = int(a["timing"]["meter"][0]["beatsPerMeasure"])
    print(f"\n## {key_mode} {tier}")
    voices: list[Any] = []
    real_mark, real_lead = sectioned._mark_voices, sectioned._mark_lead_voices

    def spy(real):  # the units' voices of the last round (sectioned.voices, then leadSolo)
        def mark(units, *args, **kwargs):
            on = real(units, *args, **kwargs)
            voices[:] = [(u.start, u.length, u.voice, u.lead_solo) for u in units]
            return on
        return mark

    for name, edits in variants.items():
        sectioned._mark_voices, sectioned._mark_lead_voices = spy(real_mark), spy(real_lead)
        try:
            with Patch(edits):
                chart = core.generate_chart(a, key_mode, tier, None)
        except Exception as e:  # a tier the song does not make
            print(f"  {name}: {type(e).__name__}: {e}")
            continue
        finally:
            sectioned._mark_voices, sectioned._mark_lead_voices = real_mark, real_lead
        notes = chart["notes"]
        win = [n for n in notes if lo <= n["t"] < hi]
        dur = float(a["durationMs"]) / 1000
        by = {s: sum(1 for n in win if n.get("src") == s) for s in STEM_NAMES}
        g = sum(1 for n in win if (o := nearest_onset(ts, ons, n["t"])) is not None and guitarish(o))
        times = len({round(n["t"]) for n in win})
        drums = [n for n in win if n.get("src") == "drums"]
        at = {}
        for n in win:
            at.setdefault(round(n["t"]), set()).add(n.get("src"))
        drum_chords = sum(1 for v in at.values() if "drums" in v and len(v) > 1)
        here, song = len(win) / ((hi - lo) / 1000), len(notes) / dur
        print(f"  {name:19s} level {chart['meta']['level']:2d} | notes here {len(win):4d} ({here:.1f}/s = {here / max(song, 1e-9):.2f}x the song's {song:.1f}/s), times {times}"
              f" | src {', '.join(f'{s} {n}' for s, n in by.items())} | on guitar-ish onsets {g}"
              f" | drums on beats 1/3 {sum(1 for n in drums if strong_beat(n, a, bpb))}/{len(drums)}, drum chords {drum_chords}")
        if name == "as is":
            tempo = TempoMap(a["timing"])
            b_lo, b_hi = tempo.ms_to_beat(lo), tempo.ms_to_beat(hi)
            names = {i: n for i, n in enumerate(STEM_NAMES)}
            shown = [(s, l, v, solo) for s, l, v, solo in voices if s + l > b_lo and s < b_hi]
            if shown:
                print("    unit voices:", "; ".join(f"beat {s:.0f}+{l:.0f} {'/'.join(names[i] for i in v) if v else 'none'}{' (lead solo)' if solo else ''}" for s, l, v, solo in shown))
            # the candidates there and which became notes
            params = resolve_params(key_mode, tier, None, None)
            cands = build_candidates(a, tempo, params, float(difficulty_config()["snapToleranceMs"]), swing_bars(a, tempo))
            cw = [c for c in cands if lo <= c.t < hi]
            note_t = {round(n["t"]) for n in win}
            gc = [c for c in cw if c.lead_note] if any(c.lead_note is not None for c in cw) else \
                 [c for c in cw if c.sources is not None and int(np.argmax(c.sources)) == STEM_NAMES.index("other")]
            dc = [c for c in cw if c.sources is not None and int(np.argmax(c.sources)) == STEM_NAMES.index("drums")]
            taken = lambda cs: sum(1 for c in cs if round(c.t) in note_t)  # noqa: E731
            print(f"    candidates here {len(cw)} (of {sum(1 for o in ons if lo <= o['t'] < hi)} onsets; tier subdivisions {params.subdivisions})"
                  f" | guitar-ish ({'lead notes' if any(c.lead_note is not None for c in cw) else 'main stem other'}) {len(gc)} -> notes {taken(gc)} | drums {len(dc)} -> notes {taken(dc)}")
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
    guitarish = Guitarish([o for o in a["onsets"] if lo <= o["t"] < hi], lead_instrument(a, lo, hi))
    onset_report(a, lo, hi, tempo, guitarish)
    for spec in args.charts.split(","):
        key_mode, tier = spec.split(":")
        chart_report(a, key_mode.strip(), tier.strip().upper(), lo, hi, guitarish)


if __name__ == "__main__":
    main()
