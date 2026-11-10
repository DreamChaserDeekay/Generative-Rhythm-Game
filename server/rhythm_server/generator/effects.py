"""SDVX-style camera cues from the song structure (instruments.json `effects`, docs/PATTERN_DESIGN.md 63):

- `zoom`: a pulse where the energy jumps (a chorus, a drop) and, smaller, on the strong beats of a
  chorus or drop;
- `view`: a held zoom level: wider (negative) through a breakdown or a quiet passage, closing in bar
  by bar through a build-up (positive: a pre-chorus before a chorus or drop, or a roll of a bar or
  more ending within two bars of the next section) and let go at once where the next section lands;
- `tilt`: the track leans in high-energy sections towards the hand the notes crowd on, else the
  way the tune climbs (right) or falls (left), and levels where the energy drops.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ..config import load_config
from .tempo import TempoMap

HIGHLIGHT = ("chorus", "drop")


def _cue(tempo: TempoMap, beat: float, kind: str, value: float, duration: float) -> dict[str, Any]:
    beat = max(0.0, float(beat))
    return {"beat": round(beat, 6), "t": round(tempo.beat_to_ms(beat), 3), "type": kind, "value": round(float(value), 3), "durationBeats": duration}


def _quiet(secs: list[dict[str, Any]], cfg: dict[str, Any]) -> list[bool]:
    """Breakdowns and quiet passages: low energy, or the drums out (their share of the section's
    onsets well under the song's busiest section, in a song with drums)."""
    drums = [float((s.get("stems") or [0.0])[0]) for s in secs]
    top = max(drums) if drums else 0.0
    out = []
    for s, d in zip(secs, drums):
        out.append(float(s.get("energy", 0.5)) <= cfg["quietEnergy"] or (top >= cfg["songDrumsAtLeast"] and d < cfg["quietDrumShare"] * top))
    return out


def _direction(lo_ms: float, hi_ms: float, notes: list[dict[str, Any]], lane_pos: dict[int, float], melody: list[tuple[float, float]], cfg: dict[str, Any], bar_ms: float) -> int:
    """+1 (right, clockwise) / -1 (left) / 0 (no lean): the hand the key notes crowd on, else the
    way the melody climbs or falls over the span (semitones per bar)."""
    left = right = 0
    for n in notes:
        if lo_ms <= n["t"] < hi_ms:
            p = lane_pos.get(n["lane"], -1.0)
            if 0.0 <= p < 0.5:
                left += 1
            elif p > 0.5:
                right += 1
    if left + right >= cfg["minNotes"]:
        share = right / (left + right)
        if share >= cfg["handShare"]:
            return 1
        if share <= 1.0 - cfg["handShare"]:
            return -1
    pts = [(t, p) for t, p in melody if lo_ms <= t < hi_ms]
    if len(pts) >= cfg["minMelodyNotes"]:
        ts = np.array([t for t, _ in pts])
        ps = np.array([p for _, p in pts])
        if np.ptp(ts) > 0:
            slope = float(np.polyfit(ts, ps, 1)[0]) * bar_ms  # semitones per bar
            if slope >= cfg["melodySlope"]:
                return 1
            if slope <= -cfg["melodySlope"]:
                return -1
    return 0


def camera_effects(
    sections: list[dict[str, Any]],
    tempo: TempoMap,
    notes: list[dict[str, Any]] | None = None,
    lanes: list[Any] | None = None,
    onsets: list[dict[str, Any]] | None = None,
    rolls: list[tuple[float, float]] | None = None,
) -> list[dict[str, Any]]:
    """`rolls` are the song's drum rolls as (first hit, last hit) beats."""
    cfg = load_config("instruments")["effects"]
    vcfg, pcfg, tcfg = cfg["view"], cfg["beatPulse"], cfg["tiltFollow"]
    secs = sorted(sections, key=lambda s: s["startBeat"])
    notes = notes or []
    onsets = onsets or []
    lane_pos = {l.index: l.pos for l in (lanes or []) if l.kind == "key"}
    melody = [(float(o["t"]), float(o["pitch"])) for o in onsets if o.get("pitch") is not None and float(o.get("melody") or 0.0) >= tcfg["melodyAtLeast"]]
    bpb = tempo.beats_per_bar
    bar_ms = tempo.beat_to_ms(bpb) - tempo.beat_to_ms(0)
    quiet = _quiet(secs, vcfg)
    out: list[dict[str, Any]] = []
    prev: float | None = None
    tilted = False
    direction = -1  # with nothing to follow the first lean goes right, then the leans alternate
    view = 0.0
    for i, sec in enumerate(secs):
        start = max(0.0, float(sec["startBeat"]))
        end = float(secs[i + 1]["startBeat"]) if i + 1 < len(secs) else float(sec.get("endBeat", start + bpb))
        energy = float(sec.get("energy", 0.0))
        label = sec.get("label")
        jump = prev is not None and energy - prev >= cfg["energyJump"]
        landing = i > 0 and view > 0.0
        if jump or landing:
            out.append(_cue(tempo, start, "zoom", min(1.0, max(2.0 * (energy - (prev or 0.0)), vcfg["releasePulse"] if landing else 0.0)), cfg["zoomBeats"]))
        # the held zoom: a build-up closes in bar by bar, a quiet passage opens out, the rest lets go
        nxt = secs[i + 1].get("label") if i + 1 < len(secs) else None
        ramp = start if label == "pre-chorus" and nxt in HIGHLIGHT else None
        if ramp is None and i + 1 < len(secs):
            ends = [lo for lo, hi in rolls or () if hi - lo >= vcfg["buildUpRollBeats"] and 0.0 < end - hi <= vcfg["buildUpLandingBeats"] and lo < end]
            if ends:
                ramp = max(start, start + bpb * int((min(ends) - start) // bpb))  # from the bar the roll starts in
        if ramp is not None and end - ramp >= bpb:
            if quiet[i] and i > 0 and ramp > start and view != vcfg["quiet"]:
                view = vcfg["quiet"]
                out.append(_cue(tempo, start, "view", view, vcfg["easeBeats"]))
            bars = max(1, int(round((end - ramp) / bpb)))
            for k in range(bars):
                view = vcfg["buildUp"] * (k + 1) / bars
                out.append(_cue(tempo, ramp + k * bpb, "view", view, float(bpb)))
        elif quiet[i] and i > 0:
            if view != vcfg["quiet"]:
                view = vcfg["quiet"]
                out.append(_cue(tempo, start, "view", view, vcfg["easeBeats"]))
        elif view != 0.0:
            out.append(_cue(tempo, start, "view", 0.0, vcfg["releaseBeats"] if view > 0 else vcfg["easeBeats"]))
            view = 0.0
        # small zooms on the strong beats of a chorus or drop
        if label in HIGHLIGHT and onsets:
            lo, hi = tempo.beat_to_ms(start), tempo.beat_to_ms(end)
            on_beat = []
            for o in onsets:
                if lo <= o["t"] < hi:
                    b = tempo.ms_to_beat(float(o["t"]))
                    if abs(b - round(b)) <= pcfg["onBeat"] and round(b) > start:
                        on_beat.append((round(b), float(o.get("strength", 0.0))))
            if on_beat:
                floor = float(np.percentile([s for _, s in on_beat], pcfg["strongPercentile"]))
                last = -1e9
                for b, s in sorted(on_beat):
                    if s >= floor and b - last >= pcfg["minGapBeats"]:
                        out.append(_cue(tempo, b, "zoom", pcfg["value"] * min(1.0, 0.5 + 0.5 * energy), pcfg["durationBeats"]))
                        last = b
        # the lean: towards the crowded hand or the climbing tune, held at least spanBars bars
        if energy >= cfg["highEnergy"]:
            span = tcfg["spanBars"] * bpb
            b = start
            first = True
            while b < end - 1e-6:
                d = _direction(tempo.beat_to_ms(b), tempo.beat_to_ms(min(end, b + span)), notes, lane_pos, melody, tcfg, bar_ms)
                if first:
                    direction = d or -direction  # nothing to follow: the other way from the last lean
                    out.append(_cue(tempo, b, "tilt", direction * energy, cfg["tiltBeats"]))
                elif d and d != direction:
                    direction = d
                    out.append(_cue(tempo, b, "tilt", direction * energy, cfg["tiltBeats"]))
                first = False
                b += span
            tilted = True
        elif tilted:
            out.append(_cue(tempo, start, "tilt", 0.0, cfg["tiltBeats"]))
            tilted = False
        prev = energy
    out.sort(key=lambda e: (e["t"], e["type"]))
    return out
