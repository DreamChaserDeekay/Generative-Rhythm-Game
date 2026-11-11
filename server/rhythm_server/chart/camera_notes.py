"""Camera cues from a chart's own notes: what Mapperatorinator gives, with no analysis of the song
(docs/MAPPERATORINATOR.md, "카메라").

The cues are the ones chart/effects.py makes of the analysed sections (zoom pulses, held views,
leans); here the song's shape is read off the chart instead:

- sections: the notes per beat of every bar, cut where the density of the next bars differs from
  the last ones'. A section's energy is its density among the song's sections (0 the sparsest,
  1 the densest), so a break widens the view, a busy section leans and a jump lands with a pulse;
- build-ups: bars that fill up one after another before a busy section, and streams (runs of
  fast notes of a bar or more) that end just before the next section;
- accents: the model's hitsounds where the chart has them (a finish is a crash cymbal: the
  strongest; a clap is a snare), else the chords (more notes at once, a stronger hit). The strong
  ones on the beat of a busy section pulse.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ..config import load_config
from ..formats.common import measures
from .effects import camera_effects
from .tempo import TempoMap

# osu! hitsound bits
WHISTLE, FINISH, CLAP = 2, 4, 8


def bar_density(notes: list[dict[str, Any]], bars: list[tuple[float, float]]) -> np.ndarray:
    """Notes per beat of every bar."""
    starts = np.array([b for b, _ in bars])
    counts = np.zeros(len(bars))
    for n in notes:
        k = int(np.searchsorted(starts, float(n["beat"]) + 1e-6, side="right")) - 1
        if 0 <= k < len(bars):
            counts[k] += 1.0
    return counts / np.array([length for _, length in bars])


def boundaries(level: np.ndarray, cfg: dict[str, Any]) -> list[int]:
    """Bars where a section starts: where the mean level of the next `window` bars differs from the
    last ones' by `change` at least, the largest such difference within `window` bars."""
    w, n = int(cfg["windowBars"]), len(level)
    diff = np.zeros(n)
    for b in range(1, n):
        diff[b] = abs(float(np.mean(level[b : min(n, b + w)])) - float(np.mean(level[max(0, b - w) : b])))
    cuts = [0]
    for b in range(1, n):
        if diff[b] >= cfg["change"] and diff[b] >= np.max(diff[max(1, b - w) : min(n, b + w + 1)]) - 1e-12 and b - cuts[-1] >= int(cfg["minBars"]):
            cuts.append(b)
    # a busier section starts where its level is reached: the bars filling up towards it belong
    # to what came before (they are its build-up)
    for i in range(1, len(cuts)):
        c, nxt = cuts[i], cuts[i + 1] if i + 1 < len(cuts) else n
        plateau = float(np.median(level[c:nxt]))
        if plateau > float(np.mean(level[cuts[i - 1] : c])):
            while c + 1 < nxt and level[c] < plateau - cfg["plateauSlack"]:
                c += 1
            cuts[i] = c
    return cuts


def sections_from_notes(notes: list[dict[str, Any]], timing: dict[str, Any], cfg: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Sections of the chart by note density, as camera_effects reads sections: startBeat, endBeat,
    energy (0..1 among the sections), label ("chorus" for a busy one, "pre-chorus" for bars filling
    up before one, else "verse")."""
    cfg = cfg or load_config("mapper")["camera"]
    if not notes:
        return []
    last = max(float(n.get("endBeat", n["beat"])) for n in notes)
    bars = [(b, length) for b, length in measures(timing.get("meter"), last) if b <= last]
    density = bar_density(notes, bars)
    busy = density[density > 0]
    top = float(np.percentile(busy, cfg["topPercentile"])) if len(busy) else 1.0
    level = np.minimum(1.0, density / max(top, 1e-9))
    cuts = boundaries(level, cfg)
    spans = [(a, b) for a, b in zip(cuts, cuts[1:] + [len(bars)]) if b > a]
    raw = np.array([float(np.mean(level[a:b])) for a, b in spans])
    lo, span = float(raw.min()), float(np.ptp(raw))
    energy = [(v - lo) / span if span > 1e-9 else 0.5 for v in raw]
    rows: list[dict[str, Any]] = []
    for (a, b), e in zip(spans, energy):
        end = bars[b][0] if b < len(bars) else bars[-1][0] + bars[-1][1]
        rows.append({"startBeat": bars[a][0], "endBeat": end, "energy": round(float(e), 3), "label": "chorus" if e >= cfg["busyEnergy"] else "verse", "_bars": (a, b)})
    # bars that fill up before a busy section become a build-up of their own
    out: list[dict[str, Any]] = []
    for i, row in enumerate(rows):
        a, b = row.pop("_bars")
        nxt = rows[i + 1] if i + 1 < len(rows) else None
        ramp = b
        if nxt is not None and nxt["label"] == "chorus" and row["label"] != "chorus":
            while ramp - 1 > a and b - (ramp - 1) <= int(cfg["rampBars"]) and level[ramp - 1] > level[ramp - 2] + cfg["rampStep"]:
                ramp -= 1
            if b - ramp < 2:  # one fuller bar is no build-up
                ramp = b
        if ramp < b:
            out.append({**row, "endBeat": bars[ramp][0]})
            out.append({"startBeat": bars[ramp][0], "endBeat": row["endBeat"], "energy": row["energy"], "label": "pre-chorus"})
        else:
            out.append(row)
    return out


def streams(notes: list[dict[str, Any]], cfg: dict[str, Any] | None = None) -> list[tuple[float, float]]:
    """Runs of fast notes as (first, last) beats: successive hits no further apart than
    `streamGapBeats`, over `streamBeats` at least. A drum roll or a stream into the next section is
    a build-up (camera_effects' `rolls`)."""
    cfg = cfg or load_config("mapper")["camera"]
    beats = sorted({round(float(n["beat"]), 4) for n in notes})
    out: list[tuple[float, float]] = []
    start = None
    for prev, cur in zip(beats, beats[1:] + [float("inf")]):
        if start is None:
            start = prev
        if cur - prev > cfg["streamGapBeats"] + 1e-6:
            if prev - start >= cfg["streamBeats"]:
                out.append((start, prev))
            start = None
    return out


def accents(notes: list[dict[str, Any]], hits: list[tuple[float, int, int]] | None = None) -> list[dict[str, Any]]:
    """The chart's hits by strength (0..1), as camera_effects reads onsets ({"t", "strength"}).
    `hits`: the model's hitsounds as (time ms, osu! hitsound bits, volume 0..100) per object; with
    any finish or clap among them those are the accents (a finish over a clap, by volume; in two
    real charts of the small model a clap sat on 8 to 13% of the hits, a finish on 0.2 to 2%), else
    every hit is one, by the number of notes hit at once."""
    chord: dict[float, int] = {}
    for n in notes:
        t = round(float(n["t"]), 3)
        chord[t] = chord.get(t, 0) + 1
    largest = max(chord.values(), default=1)
    if hits and any(bits & (FINISH | CLAP) for _, bits, _ in hits):
        best: dict[float, float] = {}
        for t, bits, volume in hits:
            if not bits & (FINISH | CLAP):
                continue  # a plain hit is no accent beside a snare or a cymbal
            kind = 1.0 if bits & FINISH else 0.6
            loud = 0.6 + 0.4 * min(100, volume) / 100.0 if volume > 0 else 1.0
            best[round(t, 3)] = max(best.get(round(t, 3), 0.0), kind * loud)
        return [{"t": t, "strength": round(s, 3)} for t, s in sorted(best.items())]
    return [{"t": t, "strength": round(c / largest, 3)} for t, c in sorted(chord.items())]


def camera_from_notes(
    notes: list[dict[str, Any]], timing: dict[str, Any], lanes: list[Any], hits: list[tuple[float, int, int]] | None = None
) -> list[dict[str, Any]]:
    """The chart's camera cues from its notes, its timing and (when it has them) its hitsounds."""
    cfg = load_config("mapper")["camera"]
    return camera_effects(sections_from_notes(notes, timing, cfg), TempoMap(timing), notes, lanes, accents(notes, hits), streams(notes, cfg))
