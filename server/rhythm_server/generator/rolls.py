"""Drum rolls (docs/PATTERN_DESIGN.md 15): an even run of hits of one drum sound, eighth notes or
faster, as in a build-up or a fill. Charts play a roll as hands taking turns, left and right (좌우
연타), at the fastest of its rates the tier reads well, ahead of the note budget: the build-up is
where the chart should rise, and a budget spread by section length would keep only its beats.

A hit qualifies when it is not a hi-hat (nearly all high band) and at least `hitStrength` times
the song's median candidate strength on the sixteenth grid; the run's off-beat hits must reach
`minStrength` times it on the median (a groove's soft hats and ghost notes stay out, one soft hit
does not cut a roll in two). A run is consecutive qualifying hits on one grid spacing (1/2 to 1/8
beat); a roll that speeds up (eighths, then sixteenths) stays one roll. It counts from `minHits`
hits over `minBeats` beats when its off-beat hits (the beats may carry a kick or the melody too)
are one drum: one band shape, not the melody (mean melody presence under `maxMelody`) and not a
pitched line such as a bass or an arpeggio between the kicks (mean harmonic share under
`maxHarmonic`; a run starts after the pitched off-beats it begins with). A roll is a passage, not
a groove: no stretch of one spacing lasts over `maxSpanBeats` (`maxSpanBeatsAtEnd` when the roll
leads into a new section, as a build-up does), and a run ends on the first beat of a section.

Rolls are the song's: `song_rolls` finds them on every grid and marks them on a tier's candidates,
so each tier plays the same rolls on its own grid.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Any

import numpy as np

from ..config import load_config
from .candidates import SNAP_ORDER, Candidate, build_candidates
from .params import GenParams
from .tempo import TempoMap

GAPS = (1 / 2, 1 / 3, 1 / 4, 1 / 6, 1 / 8)
MIN_RUN = 4  # notes a roll keeps on the chart's grid to be played as one
TYPICAL_GRID = (1, 2, 4)  # the median strength's grid: triplet and 32nd points are mostly soft ghosts


def rolls_config() -> dict[str, Any]:
    return load_config("patterns")["rolls"]


@dataclass
class Roll:
    hits: list[int]  # candidate indices in time order

    @property
    def size(self) -> int:
        return len(self.hits)


def _gap(a: float, b: float) -> float | None:
    d = b - a
    for g in GAPS:
        if abs(d - g) < 1e-6:
            return g
    return None


def _shape(c: Candidate) -> np.ndarray:
    return c.bands / (float(np.sum(c.bands)) + 1e-9)


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def _run_shape(cands: list[Candidate], run: list[int]) -> np.ndarray:
    return np.mean([_shape(cands[i]) for i in run], axis=0)


def _off_grid(d: float, gap: float) -> bool:
    """Whether a hit `d` beats after the run's last hit falls between the run's grid points."""
    k = d / gap
    return abs(k - round(k)) > 1e-6


def _pitch_scattered(hits: list[Candidate], semitones: float) -> bool:
    """Whether the hits' estimated pitches jump about (median step of `semitones` or more): a
    drum's pitch is noise, a melody moves by steps. A lead or a riser doubling a build-up lifts
    the roll's melody presence (USAO - RUNAWAY: 0.5-0.9 on its snare rolls)."""
    p = [float(c.pitch) for c in hits if c.pitch is not None]
    return len(p) >= 4 and float(np.median(np.abs(np.diff(p)))) >= semitones


def _longest_stretch(beats: list[float]) -> float:
    """Longest span (beats) of the run on a single spacing."""
    best, start = 0.0, 0
    for k in range(1, len(beats)):
        if k >= 2 and abs((beats[k] - beats[k - 1]) - (beats[k - 1] - beats[k - 2])) > 1e-6:
            start = k - 1
        best = max(best, beats[k] - beats[start])
    return best


def find_rolls(cands: list[Candidate], section_starts: list[float] | None = None) -> list[Roll]:
    """Rolls among the candidates (time-ordered); marks every hit's `roll` (id, index).
    `section_starts` are the analysed sections' first beats.

    Runs are formed over all qualifying hits and again over each band's hits alone (a snare roll
    whose hits a bass line or stabs interleave on other grid points is still one drum's run); of
    overlapping runs that qualify, the one with the most hits is the roll."""
    cfg = rolls_config()
    for c in cands:
        c.roll = None
    if len(cands) < 2:
        return []
    typical = [c.strength for c in cands if c.subdivision in TYPICAL_GRID]
    median = float(np.median(typical or [c.strength for c in cands]))
    ok = [i for i, c in enumerate(cands) if float(_shape(c)[2]) < float(cfg["maxHighShare"]) and c.strength >= float(cfg["hitStrength"]) * median]
    voices = [ok] + [[i for i in ok if int(np.argmax(cands[i].bands)) == band] for band in range(3)]
    found = []
    for order in voices:
        for run in _runs(cands, order, section_starts or [], cfg):
            # a build-up is a run's end: a run that is no roll as a whole is tried again from each
            # of its bar lines on (its first bars may be other sounds'), unless it is a groove
            while len(run) >= int(cfg["minHits"]):
                roll = _qualify(cands, run, section_starts or [], median, cfg)
                if roll:
                    found.append(roll)
                    break
                if _groove(cands, run, section_starts or [], cfg):
                    break  # a steady groove's last bars are no build-up
                bar = next((k for k in range(1, len(run)) if cands[run[k]].downbeat), None)
                if bar is None:
                    break
                run = run[bar:]
    taken: list[list[int]] = []
    for run in sorted(found, key=len, reverse=True):
        lo, hi = cands[run[0]].beat, cands[run[-1]].beat
        if not any(lo <= cands[t[-1]].beat and cands[t[0]].beat <= hi for t in taken):
            taken.append(run)
    out: list[Roll] = []
    for run in sorted(taken, key=lambda r: cands[r[0]].beat):
        rid = len(out)
        for k, i in enumerate(run):
            cands[i].roll = (rid, k)
        out.append(Roll(hits=run))
    return out


def _runs(cands: list[Candidate], order: list[int], section_starts: list[float], cfg: dict[str, Any]) -> list[list[int]]:
    """Consecutive hits of `order` (candidate indices, time order) on one spacing."""
    starts = {round(float(b), 6) for b in section_starts}
    similarity = float(cfg["shapeSimilarity"])
    runs: list[list[int]] = []
    cur: list[int] = []
    gap: float | None = None
    prev: int | None = None
    for i in order:
        c = cands[i]
        if prev is not None and len(cur) >= 2 and round(cands[prev].beat, 6) in starts:
            # a roll lands on the next section's first beat: the run ends there
            runs.append(cur)
            cur, gap = [], None
        g = _gap(cands[prev].beat, c.beat) if prev is not None else None
        # one hit the analysis missed inside a fast roll leaves twice the spacing: the roll goes on
        skipped = prev is not None and gap is not None and gap <= 0.25 + 1e-6 and len(cur) >= 4 and abs((c.beat - cands[prev].beat) - 2 * gap) < 1e-6
        if skipped:
            g = gap
        # the same spacing goes on; a roll may speed up (8ths -> 16ths, 8th triplets -> 16th triplets)
        if prev is not None and g is not None and (gap is None or abs(g - gap) < 1e-6 or abs(g - gap / 2) < 1e-6):
            if not cur:
                cur = [prev]
            cur.append(i)
            gap = g
        elif len(cur) >= 2 and gap is not None and _off_grid(c.beat - cands[prev].beat, gap) and _cosine(_shape(c), _run_shape(cands, cur)) < similarity:
            # another sound between the roll's hits (a bass note, a stab) does not cut the roll
            continue
        else:
            if len(cur) >= 2:
                runs.append(cur)
            cur, gap = [], None
        prev = i
    if len(cur) >= 2:
        runs.append(cur)
    return runs


def _groove(cands: list[Candidate], run: list[int], section_starts: list[float], cfg: dict[str, Any]) -> bool:
    """Whether a stretch of the run on one spacing lasts too long for a roll (`maxSpanBeats`,
    `maxSpanBeatsAtEnd` when the run leads into a new section): a groove. A landing on the next
    bar line counts as no part of it."""
    beats = [cands[i].beat for i in run]
    while len(beats) > 1 and cands[run[len(beats) - 1]].downbeat:
        beats.pop()
    into_section = any(0.0 < b - beats[-1] <= 1.0 + 1e-6 for b in section_starts)
    return _longest_stretch(beats) > float(cfg["maxSpanBeatsAtEnd" if into_section else "maxSpanBeats"]) + 1e-6


def _qualify(cands: list[Candidate], run: list[int], section_starts: list[float], median: float, cfg: dict[str, Any]) -> list[int] | None:
    """The run trimmed to its roll (landing and leading pitched off-beats left out), or None when
    it is no roll."""
    max_harmonic = float(cfg["maxHarmonic"])
    run = list(run)
    while run and cands[run[-1]].downbeat:
        run.pop()  # the landing on the next bar line is the next phrase's accent, not the roll
    # a roll starts at its first drum hit: the groove's pitched off-beats before a fill (a bass
    # line, an open hat between the kicks) are no part of it
    while run:
        first = next((k for k, i in enumerate(run) if cands[i].subdivision > 1), None)
        if first is None or cands[run[first]].harmonic < max_harmonic:
            break
        run = run[first + 1 :]
    if not run:
        return None
    beats = [cands[i].beat for i in run]
    if len(run) < int(cfg["minHits"]) or beats[-1] - beats[0] < float(cfg["minBeats"]) - 1e-6:
        return None
    if _groove(cands, run, section_starts, cfg):
        return None
    off = [cands[i] for i in run if cands[i].subdivision > 1]
    if len(off) < 2 or float(np.median([c.strength for c in off])) < float(cfg["minStrength"]) * median:
        return None
    # scattered pitches excuse the melody presence of drum-like hits in a build-up only (the run
    # ends within `scatterLandingBeats` of a new section): strings and an orchestra's runs scatter
    # too, with more of their sound pitched (0.68-0.78 in a film score), and inside a section a
    # figure that comes back every bar became a roll a bar (52 songs: 223 of the 280 it let in)
    drum_like = float(np.mean([c.harmonic for c in off])) < float(cfg["scatterMaxHarmonic"])
    build_up = any(0.0 < s - beats[-1] <= float(cfg["scatterLandingBeats"]) + 1e-6 for s in section_starts)
    if float(np.mean([c.melody or 0.0 for c in off])) >= float(cfg["maxMelody"]) and not (build_up and drum_like and _pitch_scattered(off, float(cfg["melodyPitchScatter"]))):
        return None
    if float(np.mean([c.harmonic for c in off])) >= max_harmonic:
        return None
    shapes = np.array([_shape(c) for c in off])
    mean = shapes.mean(axis=0)
    sims = shapes @ mean / (np.linalg.norm(shapes, axis=1) * np.linalg.norm(mean) + 1e-9)
    if float(np.mean(sims >= float(cfg["shapeSimilarity"]))) < float(cfg["shapeShare"]):
        return None
    return run


def song_rolls(analysis: dict[str, Any], tempo: TempoMap, params: GenParams, tolerance_ms: float, cands: list[Candidate]) -> list[Roll]:
    """The song's rolls marked on a tier's candidates `cands` (`roll` of each hit on them): found
    among the candidates on every grid, whatever grid the tier has. On an easy tier's grid alone a
    soft build-up would miss: without the soft sixteenths its median strength is higher (a roll
    DJMAX NM plays, NORMAL would not)."""
    full = build_candidates(analysis, tempo, replace(params, subdivisions=SNAP_ORDER), tolerance_ms)
    starts = [float(s["startBeat"]) for s in analysis.get("sections", [])]
    found = [[round(full[i].beat, 6) for i in r.hits] for r in find_rolls(full, starts)]
    at = {round(c.beat, 6): i for i, c in enumerate(cands)}  # a tier's candidates are those on its grid
    for c in cands:
        c.roll = None
    out: list[Roll] = []
    for beats in found:
        hits = [at[b] for b in beats if b in at]
        if len(hits) < 2:
            continue
        for k, i in enumerate(hits):
            cands[i].roll = (len(out), k)
        out.append(Roll(hits=hits))
    return out


def readable(sub: int, params: GenParams) -> bool:
    """Whether a roll's hits on this subdivision suit the tier: allowed, and not rationed below
    `partialMin` of the chart's notes (DJMAX NM plays a sixteenth roll as eighths)."""
    if sub not in params.subdivisions:
        return False
    return params.partial.get(sub, 1.0) >= float(rolls_config()["partialMin"])


def coarser(sub: int) -> int:
    """The next coarser grid a thinned roll keeps (sixteenths -> eighths -> beats)."""
    return {8: 4, 6: 3, 4: 2, 3: 1, 2: 1}.get(sub, 1)


def roll_level(subs: list[int], params: GenParams) -> int:
    """The finest grid of a roll (hits on these subdivisions) that the tier reads; 1 leaves only
    its beats, which is no roll."""
    level = 1
    for s in subs:
        level = math.lcm(level, int(s))
    while level > 1 and not readable(level, params):
        level = coarser(level)
    return level


def mark_rolls(slots: list[Any], flags: list[bool]) -> None:
    """`roll` (run, hit index, hits) of the slots that play a roll: flagged slots in a row
    (time order, at most a beat apart) are one run; runs of fewer than MIN_RUN notes are no roll.
    `mirrored` marks the slots of repeats played mirrored (the sectioned engine)."""
    runs: list[list[int]] = []
    for i, (s, flag) in enumerate(zip(slots, flags)):
        s.roll = None
        if not flag:
            continue
        if runs and runs[-1][-1] == i - 1 and s.beat - slots[i - 1].beat <= 1.0 + 1e-6:
            runs[-1].append(i)
        else:
            runs.append([i])
    n = 0
    for run in runs:
        if len(run) < MIN_RUN:
            continue
        for k, i in enumerate(run):
            slots[i].roll = (n, k, len(run))
        n += 1
