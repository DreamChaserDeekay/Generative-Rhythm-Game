"""A song's sections as the user edited them, in place of the analysed ones."""

from __future__ import annotations

from typing import Any

import numpy as np

from ..analysis.ml import section_stems
from .tempo import TempoMap

DEFAULT_LOOP_BARS = 2  # older analyses without loop lengths


def edited_analysis(analysis: dict[str, Any], edits: list[dict[str, Any]]) -> dict[str, Any]:
    """The analysis with the user's sections (rows of startBeat, label, group) in place of the
    analysed ones. Times, energy and stem mix are measured again; a section's loop length comes
    from the analysed section it overlaps most. The edits go into `overrides`, so charts made from
    them get their own ids."""
    if not edits:
        return analysis
    tempo = TempoMap(analysis["timing"])
    bpb = tempo.beats_per_bar
    base = sorted(analysis.get("sections", []), key=lambda r: float(r["startBeat"]))
    rows_in = sorted(edits, key=lambda e: float(e["startBeat"]))
    duration = float(analysis["durationMs"])
    end_all = tempo.ms_to_beat(duration)
    first = min(float(base[0]["startBeat"]) if base else 0.0, float(rows_in[0]["startBeat"]))
    energy = np.asarray(analysis.get("energy", {}).get("values") or [0.5], dtype=float)
    frame = float(analysis.get("energy", {}).get("frameMs", 100)) or 100.0
    rows: list[dict[str, Any]] = []
    for k, e in enumerate(rows_in):
        a = first if k == 0 else float(e["startBeat"])
        b = float(rows_in[k + 1]["startBeat"]) if k + 1 < len(rows_in) else end_all
        t, end_t = tempo.beat_to_ms(a), tempo.beat_to_ms(b) if k + 1 < len(rows_in) else duration
        overlap = [(min(b, float(r.get("endBeat", end_all))) - max(a, float(r["startBeat"])), r) for r in base]
        loop = DEFAULT_LOOP_BARS
        if overlap:
            amount, r = max(overlap, key=lambda o: o[0])
            if amount > 0 and r.get("loopBars"):
                loop = int(r["loopBars"])
        bars = max(1, int(round((b - a) / bpb)))
        span = energy[int(max(0.0, t) / frame) : max(int(max(0.0, t) / frame) + 1, int(end_t / frame))]
        rows.append(
            {
                "t": round(t, 3), "endT": round(end_t, 3), "startBeat": a, "endBeat": b,
                "label": str(e["label"]), "group": str(e["group"]),
                "energy": float(np.median(span)) if len(span) else 0.5,
                "loopBars": min(loop, bars), "confidence": 1.0,
            }
        )  # fmt: skip
    raw = np.array([r["energy"] for r in rows])
    span = float(np.ptp(raw))
    for r, v in zip(rows, raw):
        r["energy"] = round(float((v - raw.min()) / span) if span > 1e-9 else 0.5, 3)
    onsets = analysis.get("onsets", [])
    if onsets:
        section_stems(rows, np.array([o["t"] for o in onsets]), np.array([o["strength"] for o in onsets]), np.array([o.get("sources") or [0.25] * 4 for o in onsets]))
    out = dict(analysis)
    out["sections"] = rows
    out["overrides"] = {**analysis.get("overrides", {}), "sections": [{"startBeat": float(e["startBeat"]), "label": str(e["label"]), "group": str(e["group"])} for e in rows_in]}
    return out
