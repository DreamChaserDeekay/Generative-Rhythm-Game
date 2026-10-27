"""Near chords ("zure", docs/PATTERN_DESIGN.md 68): two hits a hair apart with room around them read as
one hit played sloppily. Human 7K BMS charts put such a pair a 16th triplet apart (84% of them) or a
hair apart (1/16-1/48 beat); a 32nd or a twelfth of a beat apart, where grid snapping split one hit
into two points, they have 0.7 per chart against our 3.6 (MASTER 10.6), and a 16th triplet apart
with one note on the straight grid and one on the triplet grid 4.3 against MASTER's 13 (EZ2ON SHD
50). Such a pair becomes a chord on the coarser grid point, or loses its finer note where the hand
rules do not allow the chord; a triplet figure (beat, triplet, beat) stays."""

from __future__ import annotations

from fractions import Fraction
from typing import Any

from .lanes import LaneInfo
from .linter import lint
from .params import GenParams
from .tempo import TempoMap

GAP_BEATS = 1.0 / 6.0  # pairs closer than a 16th triplet
MAX_MS = 80.0
ROOM_BEATS = 0.25  # a 16th or more of nothing on both sides: not a stream, a roll or a fill
WINDOW_MS = 2000.0  # the notes the linter looks at around a change (jacks, hands, held notes)
EPS = 1e-6


def _grid(beat: float) -> int:
    """Denominator of the beat's place in its beat (1 = on the beat, 2 = an 8th, 3 = a triplet...)."""
    return Fraction(beat - int(beat)).limit_denominator(48).denominator


def _mixed(a: float, b: float) -> bool:
    """One point on the straight grid off the beat, the other on the triplet grid: two grids met
    (an 8th and a triplet a 16th triplet apart), not a swung figure."""
    da, db = _grid(a), _grid(b)
    return da != 1 and db != 1 and (da % 3 == 0) != (db % 3 == 0)


def _problems(notes: list[dict[str, Any]], t0: float, t1: float, lanes: list[LaneInfo], params: GenParams, tempo: TempoMap) -> int:
    near = [n for n in notes if t0 - WINDOW_MS <= n["t"] <= t1 + WINDOW_MS or (n["type"] == "hold" and n["t"] <= t1 and n["endT"] >= t0 - WINDOW_MS)]
    return len(lint(near, lanes, params, tempo))


def merge_near(notes: list[dict[str, Any]], lanes: list[LaneInfo], params: GenParams, tempo: TempoMap) -> list[dict[str, Any]]:
    """The chart with its isolated near pairs made chords (or thinned); `notes` sorted by time."""
    times = sorted({n["t"] for n in notes})
    beat_of = {n["t"]: n["beat"] for n in notes}
    out = notes
    i = 0
    while i + 1 < len(times):
        ta, tb = times[i], times[i + 1]
        ba, bb = beat_of[ta], beat_of[tb]
        before = ba - beat_of[times[i - 1]] if i > 0 else 9.0
        after = beat_of[times[i + 2]] - bb if i + 2 < len(times) else 9.0
        near = bb - ba < GAP_BEATS - EPS or (abs(bb - ba - GAP_BEATS) < EPS and _mixed(ba, bb))
        if not (near and tb - ta <= MAX_MS and before >= ROOM_BEATS - EPS and after >= ROOM_BEATS - EPS):
            i += 1
            continue
        # the note on the finer grid point joins the other (the earlier one when both are alike)
        target, mover = (ta, tb) if _grid(ba) <= _grid(bb) else (tb, ta)
        moving = [n for n in out if n["t"] == mover]
        if any(n["type"] == "hold" for n in moving) or any(lanes[n["lane"]].kind != "key" for n in out if n["t"] in (ta, tb)):
            i += 2  # a long note keeps its time; a scratch or a side bar keeps its spacing (no linter rule)
            continue
        rest = [n for n in out if n["t"] != mover]
        base = _problems(out, ta, tb, lanes, params, tempo)
        taken = {n["lane"] for n in rest if n["t"] == target}
        joined = rest + [dict(n, t=target, beat=beat_of[target]) for n in moving if n["lane"] not in taken]
        joined.sort(key=lambda n: (n["t"], n["lane"]))
        if len(joined) - len(rest) == len(moving) and _problems(joined, ta, tb, lanes, params, tempo) <= base:
            out = joined
        else:
            out = rest  # no room for the chord: the finer note goes
        times.remove(mover)
        i += 1
    return out
