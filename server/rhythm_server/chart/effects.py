"""SDVX-style camera cues from the song's sections (instruments.json `effects`, docs/MAPPERATORINATOR.md
"카메라 워크"):

- `zoom`: a pulse. The largest where the energy jumps or a build-up lands (a chorus, a drop); a
  middle one at the head of every phrase (phraseBars) of a busy section; small ones on the
  strongest beats of the busiest sections only. So not every beat is an accent;
- `view`: a held zoom level: wider (negative), slowly, through a breakdown or a quiet passage;
  closing in bar by bar through a build-up (positive) and let go at once where the next section lands;
- `swing`: the track leans at the head of every phrase of a high-energy section and comes back
  level within the bar, away from the hand the notes crowd on (the crowded side is the one being
  read), else the other way from the last swing. It is a move, not a state: a lean that was held
  through a section stopped being seen after two seconds and only made the lanes harder to read;
- `dive`: the camera held lower through a high-energy section (the notes come in faster);
- the phrase and beat pulses and the swings are smaller where the notes are dense (`dense`): the
  camera moves most where there is the least to read.

`tilt` (a lean held through a section) is what charts made before had; the client still plays it.
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
    vcfg, pcfg, tcfg, mcfg = cfg["view"], cfg["beatPulse"], cfg["tiltFollow"], cfg["motion"]
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
    diving = False
    direction = -1  # with nothing to follow the first swing goes right, then the swings alternate
    view = 0.0
    phrase = float(mcfg["phraseBars"] * bpb)
    times = np.array(sorted(float(n["t"]) for n in notes))

    def calm(beat: float) -> float:
        """What a swing or a small pulse at `beat` is scaled by: 1 where the bar from there is
        easy to read, down to 1 - dense.reduce where it holds dense.to notes a second or more."""
        dense = mcfg["dense"]
        lo, hi = tempo.beat_to_ms(beat), tempo.beat_to_ms(beat + bpb)
        nps = float(np.searchsorted(times, hi) - np.searchsorted(times, lo)) / max(1e-3, (hi - lo) / 1000.0)
        return 1.0 - dense["reduce"] * min(1.0, max(0.0, (nps - dense["from"]) / (dense["to"] - dense["from"])))

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
                out.append(_cue(tempo, start, "view", view, vcfg["quietEaseBeats"]))
            bars = max(1, int(round((end - ramp) / bpb)))
            for k in range(bars):
                view = vcfg["buildUp"] * (k + 1) / bars
                out.append(_cue(tempo, ramp + k * bpb, "view", view, float(bpb)))
        elif quiet[i] and i > 0:
            if view != vcfg["quiet"]:
                view = vcfg["quiet"]
                out.append(_cue(tempo, start, "view", view, vcfg["quietEaseBeats"]))
        elif view != 0.0:
            out.append(_cue(tempo, start, "view", 0.0, vcfg["releaseBeats"] if view > 0 else vcfg["easeBeats"]))
            view = 0.0
        high = energy >= cfg["highEnergy"]
        # the heads of the section's phrases (the section's own start has its landing, if any)
        heads = []
        b = start
        while b < end - 1e-6:
            heads.append(b)
            b += phrase
        if label in HIGHLIGHT or high:
            for b in heads:
                if b > start or not (jump or landing):
                    out.append(_cue(tempo, b, "zoom", mcfg["phrasePulse"] * calm(b), cfg["zoomBeats"]))
        # small zooms on the strongest beats of the busiest sections
        if label in HIGHLIGHT and onsets and energy >= pcfg["minEnergy"]:
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
                    if s >= floor and b - last >= pcfg["minGapBeats"] and all(abs(b - h) > 0.5 for h in heads):
                        out.append(_cue(tempo, b, "zoom", pcfg["value"] * min(1.0, 0.5 + 0.5 * energy) * calm(b), pcfg["durationBeats"]))
                        last = b
        # the swing at every phrase head: away from the crowded hand, else the other way from the last
        if high:
            for b in heads:
                d = _direction(tempo.beat_to_ms(b), tempo.beat_to_ms(min(end, b + phrase)), notes, lane_pos, melody, tcfg, bar_ms)
                direction = -d if d else -direction
                out.append(_cue(tempo, b, "swing", direction * energy * calm(b), mcfg["swingBeats"]))
            if not diving:
                out.append(_cue(tempo, start, "dive", 1.0, mcfg["diveBeats"]))
                diving = True
        elif diving:
            out.append(_cue(tempo, start, "dive", 0.0, mcfg["diveBeats"]))
            diving = False
        prev = energy
    out.sort(key=lambda e: (e["t"], e["type"]))
    return out
