"""A steady song's timing as one tempo (docs/MAPPERATORINATOR.md, "정박 곡의 박자를 하나로").

Mapperatorinator's timing pass puts a new red line wherever a beat it hears falls more than 20 ms
off the grid of the one before, with a tempo fitted to the beats after it alone and rounded. A song
of one tempo comes out as red lines of 127.5, 128 and 128.2 BPM, each restarting the bars: the song
list shows "127–128 BPM" and one bar in eleven is not four beats long.

steady_timing puts one grid through every stretch whose red lines one grid can follow:

- zones: from the longest red line's span outwards, a neighbour joins while one grid (a least
  squares fit of beat length and start to every joined span's own beats) stays within the
  tolerance of each span's old grid, over the whole span. A span that cannot join is stepped over
  when later ones can and the song's onsets fit the grid run on no worse (the model's 133.5 BPM
  for 17 beats of a song at 134, or 108 for five beats of one at 162). A real change of tempo
  starts a zone of its own; a tempo that wanders leaves no zone long enough to count and the
  timing stays as it was. A tempo about half or twice the song's is counted as the song's.
- tempo: a zone's BPM is the first of a whole number, a half, a tenth and a hundredth that will
  do, and its grid is moved onto its onsets (_settle). Zones in a row that come out as one grid
  are one (_joined).
- bars: every red line of a zone says where a bar starts. The place most of the zone agrees on is
  the zone's; another one holds only where it lasts STEADY_BAR_HOLD bars (a real change of meter or
  a dropped beat), and a red line between two beats says nothing.
- the song's onsets must lie as near the new grid as the old in every 20 s window
  (STEADY_MARGIN_MS, STEADY_MARGIN), or a narrower tolerance is tried (more, shorter zones for a
  tempo that sways a little), and then the timing stays as it was.

Notes made on the old grid keep their place in the beat and move with it (`Moves`); those of a span
that had lost the beat keep their time.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field
from typing import Any
import logging

from ..formats.common import measures, meter_from_lengths
from ..chart.tempo import TempoMap

log = logging.getLogger(__name__)

# what a chart's generator and a kept timing say of the form of this (a kept timing of another
# form is steadied again)
STEADY_VERSION = 1
# a zone's grid lies within this of every old grid it stands for (ms): the widest first, the next
# where the song's onsets fit that timing worse (a tempo that sways a little: more, shorter zones)
STEADY_TOLS_MS = (25.0, 12.0, 6.0)
# spans stepped over in a row, at most (ms); one whose red line lies on the zone's grid and whose
# tempo is within STEADY_NEAR of the zone's had the beat, a little off: its notes move with the grid
STEADY_NEAR = 0.02
STEADY_NEAR_MS = 30.0
# a tempo about half or twice the one held longest is the same beat counted otherwise
HALF_BAND = 0.1
STEADY_SKIP_MS = 20000.0
# a zone shorter than this is no zone; a timing whose zones cover less than STEADY_COVER of the
# song is left as it is
STEADY_ZONE_MS = 8000.0
STEADY_COVER = 0.8
# the onsets' fit is measured in windows this long: in none may they lie further from the grid's
# sixteenths than before, on average, by more than STEADY_MARGIN_MS, nor may the share of them
# within 20 ms of one fall by more than STEADY_MARGIN (that share sways by 0.05 for a grid moved
# 3 ms under loose onsets; their mean distance does not)
STEADY_WINDOW_MS = 20000.0
STEADY_MARGIN_MS = 1.0
STEADY_MARGIN = 0.06
# onsets this share of chance's distance from the grid, or further, lie as chance puts them
STEADY_CHANCE = 0.9
# a rounder tempo may put a zone's onsets this much further from its grid (ms)
STEADY_ROUND_MS = 0.3
# a stretch stepped over: the old grid may fit its onsets this much better at most
STEADY_LOCAL_MARGIN = 0.1
STEADY_MIN_ONSETS = 8
# a bar start other than the zone's holds where it lasts this many bars
STEADY_BAR_HOLD = 8
BPM_STEPS = (1.0, 0.5, 0.1, 0.01)
ONSET_TOL_MS = 20.0
# a bar shorter than this many beats before a red line is part of the bar before it
SLIVER_BEATS = 0.25
# a length this near a whole number of beats is that number (0.05 ms at 120 BPM)
WHOLE_BEATS = 1e-4


@dataclass
class Span:
    t: float
    beat_len: float
    meter: int
    end: float
    raw_len: float = 0.0  # as the timing had it (beat_len: counted as the song's main tempo is)

    @property
    def beats(self) -> float:
        return max(0.0, self.end - self.t) / self.beat_len


@dataclass
class Zone:
    members: dict[int, float]  # span -> its red line's place on the zone's grid, in beats
    absorbed: set[int] = field(default_factory=set)  # stepped over: the zone's grid runs through them
    near: dict[int, float] = field(default_factory=dict)  # those of them that had the beat, a little off

    def placed(self) -> dict[int, float]:
        return {**self.near, **self.members}
    beat_len: float = 0.0
    start: float = 0.0  # the time of place 0

    @property
    def spans(self) -> list[int]:
        return sorted([*self.members, *self.absorbed])

    def at(self, place: float) -> float:
        return self.start + place * self.beat_len

    def place(self, t: float) -> float:
        return (t - self.start) / self.beat_len


@dataclass
class Moves:
    """Where a time on the old timing lies on the new: per old red line (its time, beat length, the
    new time of that red line, the new beat length), None for a span left as it was."""

    starts: list[float]
    rows: list[tuple[float, float, float, float] | None]

    def time(self, t: float) -> float:
        row = self.rows[max(0, bisect.bisect_right(self.starts, t) - 1)]
        if row is None:
            return t
        old_t, old_len, new_t, new_len = row
        return new_t + (t - old_t) / old_len * new_len


def red_lines_of(timing: dict[str, Any], duration_ms: float) -> list[tuple[float, float, int]]:
    """A timing's red lines over the whole song: at every tempo change and wherever the bars start
    again or change their length."""
    tempo = TempoMap(timing)
    points = sorted(timing["tempoMap"], key=lambda p: p["beat"])
    last = max(tempo.ms_to_beat(float(duration_ms)), max(float(p["beat"]) for p in points)) + 1.0
    marks: dict[float, int | None] = {round(float(p["beat"]), 6): None for p in points}
    prev = None
    for start, length in measures(timing.get("meter"), last):
        whole = abs(length - round(length)) < 1e-6 and length >= 1
        if prev is None or abs(prev - length) > 1e-6 or not whole:
            marks[round(start, 6)] = max(1, int(round(length))) if whole else None
        prev = length if whole else None
    out: list[tuple[float, float, int]] = []
    meter = 4
    for beat in sorted(marks):
        if marks[beat] is not None:
            meter = int(marks[beat])
        out.append((tempo.beat_to_ms(beat), tempo.beat_ms(beat), meter))
    # red lines at one time: the last holds
    return list({round(t, 3): (t, beat_len, m) for t, beat_len, m in out}.values())


def timing_of(reds: list[tuple[float, float, int]]) -> dict[str, Any]:
    """Our timing of red lines (as formats.osu.timing_from_reds), a sliver of a bar before a red
    line being part of the bar before it."""
    tempo_map: list[dict[str, Any]] = []
    lengths: list[float] = []
    beat = 0.0
    for i, (t, beat_len, meter) in enumerate(reds):
        if i > 0:
            beat += (t - reds[i - 1][0]) / reds[i - 1][1]
            if abs(beat - round(beat)) < WHOLE_BEATS:
                beat = float(round(beat))
        bpm = round(60000.0 / beat_len, 6)
        if not tempo_map or tempo_map[-1]["bpm"] != bpm:
            tempo_map.append({"beat": round(beat, 6), "bpm": bpm})
        bar = float(max(1, meter))
        if i + 1 == len(reds):
            lengths.append(bar)
            break
        left = (reds[i + 1][0] - t) / beat_len
        if abs(left - round(left)) < WHOLE_BEATS:
            # 3.999999 beats are four (the sums of many spans are a hair off)
            left = float(round(left))
        while left > bar - 1e-6:
            lengths.append(bar)
            left -= bar
        if left > 1e-6:
            if left < SLIVER_BEATS and lengths:
                lengths[-1] += left
            else:
                lengths.append(left)
    return {"offsetMs": reds[0][0], "tempoMap": tempo_map, "meter": meter_from_lengths(lengths)}


def _fit(spans: list[Span], members: dict[int, float], beat_len: float | None = None) -> tuple[float, float]:
    """The grid (beat length, time of place 0) nearest every member span's own beats, by least
    squares over the spans' lengths; with `beat_len` given, the start alone."""
    w = su = sy = suu = suy = 0.0
    for i, g in members.items():
        s = spans[i]
        n = max(s.beats, 1e-3)
        w += n
        su += n * g + n * n / 2.0
        sy += n * s.t + s.beat_len * n * n / 2.0
        suu += n * g * g + g * n * n + n ** 3 / 3.0
        suy += g * s.t * n + (g * s.beat_len + s.t) * n * n / 2.0 + s.beat_len * n ** 3 / 3.0
    if beat_len is None:
        den = w * suu - su * su
        beat_len = (w * suy - su * sy) / den if den > 1e-9 else spans[next(iter(members))].beat_len
    return beat_len, (sy - beat_len * su) / w


def _off(spans: list[Span], members: dict[int, float], beat_len: float, start: float) -> float:
    """How far the grid lies from the members' old grids at most (ms)."""
    worst = 0.0
    for i, g in members.items():
        s = spans[i]
        a = s.t - (start + g * beat_len)
        worst = max(worst, abs(a), abs(a + (s.beat_len - beat_len) * s.beats))
    return worst


def _on_grid(t: float, start: float, beat_len: float) -> bool:
    sub = beat_len / 4.0
    return abs((t - start) / sub - round((t - start) / sub)) * sub <= min(ONSET_TOL_MS, sub / 6.0)


def _share_old(times: list[float], spans: list[Span], which: list[int]) -> tuple[int, int]:
    on = n = 0
    for i in which:
        s = spans[i]
        for t in times[bisect.bisect_left(times, s.t):bisect.bisect_left(times, s.end)]:
            n += 1
            on += _on_grid(t, s.t, s.beat_len)
    return on, n


def _stepped_ok(times: list[float], spans: list[Span], which: list[int], beat_len: float, start: float) -> bool:
    """Spans stepped over: the grid run on fits their onsets about as well as their own did. One
    whose tempo is the zone's (within STEADY_NEAR) had not lost the beat: where the zone's grid
    leaves its own by more than STEADY_NEAR_MS it followed a tempo that sways, and the zone ends
    there (the share of onsets within 20 ms of a sixteenth cannot tell a grid of the right tempo a
    little off from one of a wrong tempo, which passes every phase)."""
    if not which:
        return True
    for i in which:
        s = spans[i]
        if abs(s.beat_len / beat_len - 1.0) <= STEADY_NEAR:
            g = round((s.t - start) / beat_len * 4.0) / 4.0
            a = s.t - (start + g * beat_len)
            if max(abs(a), abs(a + (s.beat_len - beat_len) * s.beats)) > STEADY_NEAR_MS:
                return False
    on, n = _share_old(times, spans, which)
    if n < STEADY_MIN_ONSETS:
        return True
    new = sum(1 for i in which for t in times[bisect.bisect_left(times, spans[i].t):bisect.bisect_left(times, spans[i].end)] if _on_grid(t, start, beat_len))
    return new / n >= on / n - STEADY_LOCAL_MARGIN


def _grow(spans: list[Span], seed: int, taken: set[int], times: list[float], tol: float) -> Zone:
    members = {seed: 0.0}
    absorbed: set[int] = set()
    beat_len, start = spans[seed].beat_len, spans[seed].t
    for step in (1, -1):
        j = seed + step
        pending: list[int] = []
        skipped = 0.0
        while 0 <= j < len(spans) and j not in taken:
            g = round((spans[j].t - start) / beat_len * 4.0) / 4.0
            trial = {**members, j: g}
            length, at = _fit(spans, trial)
            if _off(spans, trial, length, at) <= tol and _stepped_ok(times, spans, pending, length, at):
                members, beat_len, start = trial, length, at
                absorbed.update(pending)
                pending, skipped = [], 0.0
            else:
                pending.append(j)
                skipped += spans[j].end - spans[j].t
                if skipped > STEADY_SKIP_MS:
                    break
            j += step
    return Zone(members, absorbed, beat_len=beat_len, start=start)


def _zone_times(spans: list[Span], zone: Zone, times: list[float]) -> list[float]:
    return [t for i in zone.members for t in times[bisect.bisect_left(times, spans[i].t):bisect.bisect_left(times, spans[i].end)]]


def _centred(under: list[float], beat_len: float, start: float) -> tuple[float, float]:
    """A grid moved onto the onsets under it (where they fall in its sixteenths, as a circular
    mean), and how far they then lie from its sixteenths on average (ms)."""
    sub = beat_len / 4.0
    if len(under) < 2 * STEADY_MIN_ONSETS:
        return start, 0.0
    c = sum(math.cos(2.0 * math.pi * (t - start) / sub) for t in under)
    s = sum(math.sin(2.0 * math.pi * (t - start) / sub) for t in under)
    if math.hypot(c, s) / len(under) >= 0.3:
        start += math.atan2(s, c) / (2.0 * math.pi) * sub
    return start, sum(abs((t - start) / sub - round((t - start) / sub)) for t in under) * sub / len(under)


def _settle(spans: list[Span], zone: Zone, times: list[float], tol: float) -> None:
    """The zone's tempo as a whole number, a half or a tenth (the first that will do), and its grid
    on its onsets. A rounder tempo will do where the grid still stands for the old ones, or lies
    within twice the tolerance of them with the onsets as near it as they are to the fitted one:
    the model's own spans are rounded too, 92.6 BPM for 38 beats of a song at 92.5."""
    under = _zone_times(spans, zone, times)
    best = _centred(under, zone.beat_len, zone.start)[1]
    for step in BPM_STEPS:
        rounded = round(60000.0 / zone.beat_len / step) * step
        if rounded <= 0:
            continue
        length = 60000.0 / rounded
        _, at = _fit(spans, zone.members, length)
        off = _off(spans, zone.members, length, at)
        centred, dist = _centred(under, length, at)
        if off <= tol or (off <= 2.0 * tol and len(under) >= 2 * STEADY_MIN_ONSETS and dist <= best + STEADY_ROUND_MS):
            zone.beat_len, zone.start = length, at
            break
    centred, _ = _centred(under, zone.beat_len, zone.start)
    if _off(spans, zone.members, zone.beat_len, centred) <= 2.0 * tol:
        zone.start = centred


def _joined(spans: list[Span], zones: list[Zone], times: list[float], tol: float) -> list[Zone]:
    """Zones in a row of one tempo whose grids are one grid (the next starts within half the
    tolerance of a quarter beat of the one before), as one."""
    out = [zones[0]]
    for zone in zones[1:]:
        last = out[-1]
        g = round(last.place(zone.start) * 4.0) / 4.0
        if zone.spans[0] != last.spans[-1] + 1 or abs(zone.beat_len - last.beat_len) > 1e-9 or abs(zone.start - last.at(g)) > tol / 2.0:
            out.append(zone)
            continue
        last.members.update({i: g + place for i, place in zone.members.items()})
        last.absorbed.update(zone.absorbed)
        _, last.start = _fit(spans, last.members, last.beat_len)
        last.start, _ = _centred(_zone_times(spans, last, times), last.beat_len, last.start)
    return out


def _bar_starts(spans: list[Span], zone: Zone) -> list[tuple[float, int]]:
    """Where the zone's bars start anew: (place, beats a bar), the first for the zone's start."""
    placed = zone.placed()
    order = sorted(placed)
    claims: list[list[float]] = []  # [place, meter, phase, beats it holds]
    for k, i in enumerate(order):
        g = placed[i]
        until = placed[order[k + 1]] if k + 1 < len(order) else zone.place(spans[zone.spans[-1]].end)
        m = spans[i].meter
        if abs(g - round(g)) > 1e-6 or m < 2:
            # between two beats: no word on the bars
            if claims:
                claims[-1][3] += until - g
                continue
            g, m = float(math.ceil(g)), max(2, m) if m >= 2 else 4
        phase = round(g) % m
        if claims and claims[-1][1] == m and claims[-1][2] == phase:
            claims[-1][3] += until - g
        else:
            claims.append([g, m, phase, until - g])
    while len(claims) > 1:
        k = min(range(len(claims)), key=lambda q: claims[q][3] / claims[q][1])
        if claims[k][3] >= STEADY_BAR_HOLD * claims[k][1]:
            break
        if k == 0:
            claims[1][0], claims[1][3] = claims[0][0], claims[1][3] + claims[0][3]
        else:
            claims[k - 1][3] += claims[k][3]
        del claims[k]
        for q in range(len(claims) - 1, 0, -1):
            if claims[q][1] == claims[q - 1][1] and claims[q][2] == claims[q - 1][2]:
                claims[q - 1][3] += claims[q][3]
                del claims[q]
    return [(c[0], int(c[1]), int(c[2])) for c in claims]  # type: ignore[misc]


def window_fits(reds: list[tuple[float, float, int]], times: list[float], duration_ms: float) -> list[tuple[float, float, int, float]]:
    """Per STEADY_WINDOW_MS of the song: the share of `times` on a sixteenth of the timing's grid
    (counted from the red line in force), how far they lie from the nearest sixteenth on average
    (ms), how many there are, and how far chance would put them (a quarter of a sixteenth)."""
    starts = [r[0] for r in reds]
    out: list[tuple[float, float, int, float]] = []
    w = 0.0
    while w < duration_ms:
        on = n = 0
        off = chance = 0.0
        for t in times[bisect.bisect_left(times, w):bisect.bisect_left(times, w + STEADY_WINDOW_MS)]:
            r = reds[max(0, bisect.bisect_right(starts, t) - 1)]
            sub = r[1] / 4.0
            n += 1
            on += _on_grid(t, r[0], r[1])
            off += abs((t - r[0]) / sub - round((t - r[0]) / sub)) * sub
            chance += sub / 4.0
        out.append((on / n if n else 0.0, off / n if n else 0.0, n, chance / n if n else 0.0))
        w += STEADY_WINDOW_MS
    return out


def worse_windows(before: list[tuple[float, float, int, float]], after: list[tuple[float, float, int, float]]) -> list[str]:
    """The windows whose onsets fit the timing after worse than the one before: further from its
    sixteenths by more than STEADY_MARGIN_MS (not where they lay as chance puts them before: there
    is nothing to lose, at a change of tempo or in a wash of sound), or fewer within 20 ms of one by
    more than STEADY_MARGIN."""
    return [
        f"{k * STEADY_WINDOW_MS / 1000:.0f}s:{off0:.1f}>{off1:.1f}ms,{on0:.2f}>{on1:.2f}"
        for k, ((on0, off0, n, chance), (on1, off1, _, _)) in enumerate(zip(before, after))
        if n >= STEADY_MIN_ONSETS and ((off1 > off0 + STEADY_MARGIN_MS and off0 < STEADY_CHANCE * chance) or on1 < on0 - STEADY_MARGIN)
    ]


def strong_onsets(onsets: list[dict[str, Any]], lag: float) -> list[float]:
    """The stronger half of the onsets, their lag behind the grid taken out, by time."""
    strengths = sorted(float(o.get("strength", 1.0)) for o in onsets if "t" in o)
    floor = strengths[len(strengths) // 2] if strengths else 0.0
    return sorted(float(o["t"]) - lag for o in onsets if "t" in o and float(o.get("strength", 1.0)) >= floor)


def folded_spans(reds: list[tuple[float, float, int]], end: float) -> list[Span]:
    """The red lines' spans, a tempo about half or twice the one held longest counted as that one
    is (the same beat: 92.5 BPM after 185)."""
    spans = [Span(t, beat_len, m, reds[i + 1][0] if i + 1 < len(reds) else end, beat_len) for i, (t, beat_len, m) in enumerate(reds)]
    # the song's main tempo: the middle one by the time each is held (the model says 176, 175.99 and
    # 176.2 for one tempo: the one value held longest may be another's)
    order = sorted(spans, key=lambda sp: sp.beat_len)
    half, run, main = sum(sp.end - sp.t for sp in spans) / 2.0, 0.0, order[-1].beat_len
    for sp in order:
        run += sp.end - sp.t
        if run >= half:
            main = sp.beat_len
            break
    for sp in spans:
        if abs(main / sp.beat_len - 0.5) <= 0.5 * HALF_BAND:
            sp.beat_len /= 2.0
        elif abs(main / sp.beat_len - 2.0) <= 2.0 * HALF_BAND:
            sp.beat_len *= 2.0
    return spans


def same_timing(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Two timings a listener could not tell apart: the same tempos at the same beats, the same
    bars, starts within a millisecond."""
    def bars(t: dict[str, Any]) -> list[tuple[int, float]]:
        return [(int(m["measure"]), round(float(m["beatsPerMeasure"]), 2)) for m in t.get("meter") or [{"measure": 0, "beatsPerMeasure": 4}]]

    pa, pb = a["tempoMap"], b["tempoMap"]
    return (
        abs(float(a["offsetMs"]) - float(b["offsetMs"])) <= 1.0 and len(pa) == len(pb) and bars(a) == bars(b)
        and all(abs(float(x["bpm"]) - float(y["bpm"])) < 1e-6 and abs(float(x["beat"]) - float(y["beat"])) < 0.01 for x, y in zip(pa, pb))
    )


def _why(text: str) -> None:
    log.debug("timing left as it is: %s", text)


def steady_timing(
    timing: dict[str, Any], onsets: list[dict[str, Any]], duration_ms: float,
) -> tuple[dict[str, Any], dict[str, Any] | None, Moves | None]:
    """The timing with one tempo through every stretch one grid can follow; what was done (None:
    nothing, the timing is the same object) and where the old timing's times lie on it."""
    from .charts import onset_lag

    reds = red_lines_of(timing, duration_ms)
    if len(reds) < 2 and abs(60000.0 / reds[0][1] - round(60000.0 / reds[0][1], 1)) < 1e-6:
        return timing, None, None
    end = max(float(duration_ms), reds[-1][0] + reds[-1][1])
    spans = folded_spans(reds, end)
    raw, reds = reds, [(sp.t, sp.beat_len, sp.meter) for sp in spans]
    times = strong_onsets(onsets, onset_lag(reds, onsets, duration_ms))

    before = window_fits(reds, times, duration_ms)

    def attempt(tol: float) -> tuple[list[tuple[float, float, int]], list[Zone], list[Any]] | None:
        taken: set[int] = set()
        zone_of: dict[int, Zone] = {}
        for seed in sorted(range(len(spans)), key=lambda i: spans[i].t - spans[i].end):
            if seed in taken:
                continue
            zone = _grow(spans, seed, taken, times, tol)
            taken.update(zone.spans)
            which = zone.spans
            if spans[which[-1]].end - spans[which[0]].t >= STEADY_ZONE_MS:
                for i in which:
                    zone_of[i] = zone
        zones = sorted({id(z): z for z in zone_of.values()}.values(), key=lambda z: z.spans[0])
        covered = sum(spans[z.spans[-1]].end - spans[z.spans[0]].t for z in zones)
        if not zones or covered < STEADY_COVER * (end - spans[0].t):
            _why("cover")
            return None
        for zone in zones:
            _settle(spans, zone, times, tol)
        zones = _joined(spans, zones, times, tol)
        for zone in zones:
            for i in zone.spans:
                zone_of[i] = zone

        # the spans between the zones: part of the zone before (or after) where its grid, run on, fits
        # their onsets no worse; as they were otherwise
        i = 0
        while i < len(spans):
            if i in zone_of:
                i += 1
                continue
            j = i
            while j < len(spans) and j not in zone_of:
                j += 1
            run = list(range(i, j))
            for near in ([zone_of[i - 1]] if i > 0 else []) + ([zone_of[j]] if j < len(spans) else []):
                if _stepped_ok(times, spans, run, near.beat_len, near.start):
                    near.absorbed.update(run)
                    for k in run:
                        zone_of[k] = near
                    break
            i = j

        out: list[tuple[float, float, int]] = []
        rows: list[tuple[float, float, float, float] | None] = []
        done: set[int] = set()
        for i, s in enumerate(spans):
            zone = zone_of.get(i)
            if zone is None:
                out.append((s.t, s.raw_len, s.meter))
                rows.append(None)
                continue
            if id(zone) not in done:
                for k in zone.absorbed:
                    # stepped over: with the grid where it had the beat, a little off
                    near = round(zone.place(spans[k].t) * 4.0) / 4.0
                    if abs(spans[k].beat_len / zone.beat_len - 1.0) <= STEADY_NEAR and abs(spans[k].t - zone.at(near)) <= tol:
                        zone.near[k] = near
            g = zone.placed().get(i)
            rows.append((s.t, s.beat_len, zone.at(g), zone.beat_len) if g is not None else None)
            if id(zone) in done:
                continue
            done.add(id(zone))
            bars = _bar_starts(spans, zone)
            first = zone.spans[0]
            place = zone.placed().get(first)
            if place is None:
                # the zone's grid runs on from a span that lost the beat: from its first beat there
                at = zone.place(s.t)
                place = float(round(at)) if abs(at - round(at)) * zone.beat_len <= tol else float(math.ceil(at))
            _, meter, phase = bars[0]
            back = (place - phase) % meter
            if back < 1e-6:
                out.append((zone.at(place), zone.beat_len, meter))
            elif not out and zone.at(place - back) >= 0.0:
                out.append((zone.at(place - back), zone.beat_len, meter))
            else:
                # a bar cut short before the zone's first whole one
                out.append((zone.at(place), zone.beat_len, meter))
                out.append((zone.at(place - back + meter), zone.beat_len, meter))
            for g, m, _ in bars[1:]:
                if zone.at(g) > out[-1][0] + 1e-6:
                    out.append((zone.at(g), zone.beat_len, m))
                else:
                    out[-1] = (out[-1][0], zone.beat_len, m)
        if any(b[0] <= a[0] for a, b in zip(out, out[1:])):
            _why("order")
            return None
        same = len(out) == len(reds) and all(abs(a[0] - b[0]) < 1e-3 and abs(a[1] - b[1]) < 1e-9 and a[2] == b[2] for a, b in zip(out, reds))
        if same:
            return None
        after = window_fits(out, times, duration_ms)
        worse = worse_windows(before, after)
        if worse:
            _why(f"onsets (±{tol:g} ms) " + " ".join(worse))
            return None
        return out, zones, rows

    for tol in STEADY_TOLS_MS:
        got = attempt(tol)
        if got is not None:
            break
    else:
        # the model's red lines stay; a sliver of a bar before one is still part of the bar before it
        tidy = timing_of(raw)
        if same_timing(tidy, timing):
            return timing, None, None
        return tidy, {"version": STEADY_VERSION, "tolMs": None, "tempos": [len(timing["tempoMap"])] * 2, "zones": [], "absorbed": 0}, None
    out, zones, rows = got
    made = timing_of(out)
    if same_timing(made, timing):
        # steadied before: it stays as it is, to the millisecond (a song's charts share it)
        return timing, None, None
    report = {
        "version": STEADY_VERSION,
        "tolMs": tol,
        # the timing's tempo points before and after
        "tempos": [len(timing["tempoMap"]), len(made["tempoMap"])],
        "zones": [{"ms": round(spans[z.spans[0]].t, 1), "bpm": round(60000.0 / z.beat_len, 4)} for z in zones],
        "absorbed": sum(len(z.absorbed) for z in zones),
    }
    return made, report, Moves([s.t for s in spans], rows)


def no_worse(base: dict[str, Any], timing: dict[str, Any], onsets: list[dict[str, Any]], duration_ms: float) -> bool:
    """The song's onsets lie as near `timing`'s grid as `base`'s in every window (the margins of
    steady_timing; nearer is as good)."""
    from .charts import onset_lag

    def reds_of(t: dict[str, Any]) -> list[tuple[float, float, int]]:
        reds = red_lines_of(t, duration_ms)
        return [(sp.t, sp.beat_len, sp.meter) for sp in folded_spans(reds, max(float(duration_ms), reds[-1][0] + reds[-1][1]))]

    was, now = reds_of(base), reds_of(timing)
    times = strong_onsets(onsets, onset_lag(was, onsets, duration_ms))
    return not worse_windows(window_fits(was, times, duration_ms), window_fits(now, times, duration_ms))


def settled_timing(
    model: dict[str, Any], onsets: list[dict[str, Any]], duration_ms: float, check: bool = True, steady: bool = True,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any] | None, Moves | None]:
    """The timing a song keeps, of the one the model found (or one kept from before): steadied, then
    checked for tempos the song does not follow (charts.checked_timing: the long tail of a lost
    beat, which leaves no zone), then steadied again without them. Returns the timing, the tempos
    the check took out (a first chart is made again when there are some: its notes followed them),
    what steadying did, and where the model's times lie on it (None when the check changed it).

    Steadying comes first: on the model's red lines the check can take a right tempo for a lost one
    (a fast song's sixteenth leaves it 11 ms: a grid of the right tempo 12 ms off fits worse than
    chance, a wrong tempo run on fits as chance does), and a zone built on what is left stands for
    the wrong grid. One tempo has nothing for the check to take. Whatever comes out must fit the
    song's onsets no worse than the model's own timing in any window, or the check's part is dropped."""
    from .charts import checked_timing

    first, report, moves = steady_timing(model, onsets, duration_ms) if steady else (model, None, None)
    if not check:
        return first, [], report, moves
    checked, fixed = checked_timing(first, onsets, duration_ms)
    if not fixed:
        return first, [], report, moves
    final, again, _ = steady_timing(checked, onsets, duration_ms) if steady else (checked, None, None)
    if not no_worse(model, final, onsets, duration_ms):
        log.info("the timing check's result fits the song worse than the model's timing: left out (%s)", fixed)
        return first, [], report, moves
    return final, fixed, again or report, None


# ---------- charts made before their song's timing was settled ----------

# The client counts a hold's ticks on its beat and endBeat: those on multiples of RETIME_TICK_BEATS
# strictly between them (engine/session.ts holdTicks, config/judgement.json hold.tickBeats). On the
# new timing a head may lie a few ms before a tick's place where it lay on it before, and get one
# tick more. A head or an end with a tick's place within RETIME_SNAP_MS inside the hold is written
# on that place where that gives the hold the ticks it had: a chart's max combo stays.
RETIME_SNAP_MS = 15.0
RETIME_TICK_BEATS = 0.25


def hold_ticks(beat: float, end_beat: float) -> int:
    """A hold's ticks, as the client counts them."""
    first = math.floor(beat / RETIME_TICK_BEATS + 1e-6) + 1
    last = math.ceil((end_beat - 1e-6) / RETIME_TICK_BEATS) - 1
    return max(0, last - first + 1)


def retimed_chart(chart: dict[str, Any], timing: dict[str, Any], steady_version: int = STEADY_VERSION) -> dict[str, Any]:
    """A chart on another timing: the notes where they were in time (t, endT untouched: scores and
    replays hold to them), their beats on the new timing, and whatever else is written in beats
    (sections, camera effects) at the times it had on the old one. The chart's level and summaries
    stay as they are. `generator.retimed` says it was done."""
    old, new = TempoMap(chart["timing"]), TempoMap(timing)

    def beat_at(ms: float) -> float:
        return round(new.ms_to_beat(ms), 6)

    def places(ms: float, side: float) -> list[float]:
        """Where a hold's head (side -1) or end (+1) may be written: where it is, or on the place
        of a tick that falls just inside the hold there, which is then not the hold's. A tick's
        place outside the hold in time is never made its tick: it would come before the key is down
        or after it is up, and count for the max combo without ever being got."""
        beat = new.ms_to_beat(ms)
        place = round(beat / RETIME_TICK_BEATS) * RETIME_TICK_BEATS
        inside = (place - beat) * -side > 1e-9
        return [beat, place] if inside and abs(new.beat_to_ms(place) - ms) <= RETIME_SNAP_MS else [beat]

    notes = []
    for n in chart["notes"]:
        if n.get("type") != "hold":
            notes.append({**n, "beat": beat_at(float(n["t"]))})
            continue
        had = hold_ticks(float(n["beat"]), float(n["endBeat"]))
        head, end = min(
            ((a, b) for a in places(float(n["t"]), -1.0) for b in places(float(n["endT"]), 1.0) if b > a),
            key=lambda ab: abs(hold_ticks(*ab) - had),
            default=(new.ms_to_beat(float(n["t"])), new.ms_to_beat(float(n["endT"]))),
        )
        notes.append({**n, "beat": round(head, 6), "endBeat": round(end, 6)})
    sections = [
        {**s, "startBeat": round(new.ms_to_beat(old.beat_to_ms(float(s["startBeat"]))), 3), "endBeat": round(new.ms_to_beat(old.beat_to_ms(float(s["endBeat"]))), 3)}
        if "startBeat" in s and "endBeat" in s else s
        for s in chart.get("sections") or []
    ]
    effects = []
    for e in chart.get("effects") or []:
        if "beat" not in e:
            effects.append(e)
            continue
        at = float(e["t"]) if "t" in e else old.beat_to_ms(float(e["beat"]))
        row = {**e, "beat": beat_at(at)}
        if e.get("durationBeats") is not None:
            until = old.beat_to_ms(float(e["beat"]) + float(e["durationBeats"]))
            row["durationBeats"] = round(new.ms_to_beat(until) - new.ms_to_beat(at), 6)
        effects.append(row)
    meta = chart["meta"]
    generator = {**(meta.get("generator") or {}), "retimed": {"version": steady_version, "tempos": [len(chart["timing"]["tempoMap"]), len(timing["tempoMap"])]}}
    return {**chart, "meta": {**meta, "generator": generator}, "timing": timing, "sections": sections, "effects": effects, "notes": notes}
