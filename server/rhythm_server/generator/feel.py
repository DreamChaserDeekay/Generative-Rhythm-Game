"""How a chart feels in a passage, in the numbers a player's remark is about (docs/PATTERN_DESIGN.md
95): how often the player hits (distinct times, not notes) against the chart's own mean, how many
notes a hit takes (chords), which instruments the notes play and how often that changes, whether the
drums keep to the bar's strong beats, and whether the bars the music strikes get a note on their
first beat.

It reads times only (the beats come from the analysis), so it measures imported human charts as well
as generated ones, and it imports nothing but numpy: `scripts/feel_report.py` loads this file from
its own checkout while the generator it measures may come from another (`--repo`)."""

from __future__ import annotations

import bisect
from collections import Counter
from typing import Any

import numpy as np

STEMS = ("drums", "bass", "vocals", "other")
TUNE = ("vocals", "other")
HIT_MS = 5.0  # notes this close are one hit (a chord)
MATCH_MS = 40.0  # a note on an onset or on a beat
SPAN_BARS = 4  # the stretch of the peak and the instrument-run measures
# a hit's instrument when its notes tie: the tune first (a drum + guitar chord plays the guitar)
MAIN_ORDER = ("other", "vocals", "bass", "drums")


def hits_of(notes: list[dict[str, Any]]) -> list[tuple[float, list[dict[str, Any]]]]:
    """The chart's hits: its notes grouped by time (within HIT_MS of a hit's first note)."""
    out: list[tuple[float, list[dict[str, Any]]]] = []
    for n in sorted(notes, key=lambda n: float(n["t"])):
        t = float(n["t"])
        if out and t - out[-1][0] <= HIT_MS:
            out[-1][1].append(n)
        else:
            out.append((t, [n]))
    return out


def main_src(group: list[dict[str, Any]]) -> str | None:
    srcs = Counter(n.get("src") for n in group if n.get("src"))
    if not srcs:
        return None
    top = max(srcs.values())
    return next(s for s in MAIN_ORDER if srcs.get(s) == top)


class Music:
    """The analysis as this module reads it: beats with their place in the bar, onsets by time."""

    def __init__(self, analysis: dict[str, Any], lead_quantile: float = 0.5):
        beats = analysis.get("beats") or []
        self.beat_t = np.array([float(b["t"]) for b in beats])
        pos, k = [], -1
        for b in beats:
            k = 0 if b.get("isDownbeat") else (k + 1 if k >= 0 else -1)
            pos.append(k)
        self.beat_pos = np.array(pos)
        lengths = [p + 1 for p, q in zip(pos, pos[1:] + [0]) if q == 0 and p >= 0]
        self.bpb = Counter(lengths).most_common(1)[0][0] if lengths else 4
        self.downbeats = [float(t) for t, p in zip(self.beat_t, pos) if p == 0]
        self.onsets = sorted(analysis.get("onsets") or [], key=lambda o: float(o["t"]))
        self.onset_t = np.array([float(o["t"]) for o in self.onsets])
        strengths = [float(o.get("strength", 0.0)) for o in self.onsets]
        self.loud = float(np.median(strengths)) if strengths else 0.0
        self.sections = sorted(analysis.get("sections") or [], key=lambda s: float(s["t"]))
        self.lead_quantile = lead_quantile

    def _nearest(self, times: np.ndarray, t: float) -> int | None:
        i = int(np.searchsorted(times, t))
        best = None
        for j in (i - 1, i):
            if 0 <= j < len(times) and abs(times[j] - t) <= MATCH_MS and (best is None or abs(times[j] - t) < abs(times[best] - t)):
                best = j
        return best

    def onset_at(self, t: float) -> dict[str, Any] | None:
        j = self._nearest(self.onset_t, t)
        return self.onsets[j] if j is not None else None

    def beat_ms(self, lo: float, hi: float) -> float | None:
        """The median beat length (ms) over a passage."""
        i, j = int(np.searchsorted(self.beat_t, lo)), int(np.searchsorted(self.beat_t, hi))
        d = np.diff(self.beat_t[max(0, i - 1) : j + 1])
        return float(np.median(d)) if len(d) else None

    def strong(self, t: float) -> bool | None:
        """Whether a time is on beat one or three of its bar (beat one of an odd bar); None off the beats."""
        j = self._nearest(self.beat_t, t)
        if j is None or self.beat_pos[j] < 0:
            return None
        p = int(self.beat_pos[j])
        return p == 0 or (self.bpb % 2 == 0 and p == self.bpb // 2)

    def struck(self, t: float) -> bool:
        """Whether the music strikes at a time: an onset at least the song's median strength."""
        j = self._nearest(self.onset_t, t)
        return j is not None and float(self.onsets[j].get("strength", 0.0)) >= self.loud

    def lead_of(self, lo: float, hi: float) -> tuple[str, float] | None:
        """The instrument a 6-stem section over the passage leads with, and the cut of its share
        above which an onset is its note (the passage's lead quantile, as the generator's lead notes)."""
        for s in self.sections:
            if float(s["endT"]) > lo and float(s["t"]) < hi and s.get("lead") in ("guitar", "piano"):
                lead = str(s["lead"])
                inside = [float(o["instruments"].get(lead, 0.0)) for o in self.onsets if lo <= float(o["t"]) < hi and o.get("instruments")]
                if inside:
                    return lead, float(np.quantile(inside, self.lead_quantile))
        return None


def _share(n: int, d: int) -> float | None:
    return round(n / d, 3) if d else None


def passage(hits: list[tuple[float, list[dict[str, Any]]]], music: Music, lo: float, hi: float, song_rate: float) -> dict[str, Any]:
    """The feel of the hits in [lo, hi) ms (`song_rate`: the chart's hits per second)."""
    times = [t for t, _ in hits]
    a, b = bisect.bisect_left(times, lo), bisect.bisect_left(times, hi)
    win = hits[a:b]
    notes = [n for _, g in win for n in g]
    sec = max(1e-6, (hi - lo) / 1000.0)
    rate = len(win) / sec
    src = Counter(n.get("src") or "none" for n in notes)
    mains = [main_src(g) for _, g in win]
    seq = [m for m in mains if m is not None]
    switches = sum(1 for p, q in zip(seq, seq[1:]) if p != q)
    drums = [t for t, g in win for n in g if n.get("src") == "drums"]
    strong_drums = sum(1 for t in drums if music.strong(t))
    # the music's notes the hits sit on: the tune or the drums (human charts have no src)
    on = [music.onset_at(t) for t in times[a:b]]
    tune_on = sum(1 for o in on if o is not None and o.get("source") in TUNE)
    drum_on = sum(1 for o in on if o is not None and o.get("source") == "drums")
    # streams: the share of the gaps between hits a sixteenth or shorter (the beat where they are)
    beat = music.beat_ms(lo, hi)
    gaps = np.diff(times[a:b]) if b - a > 1 else np.array([])
    lead = music.lead_of(lo, hi)
    lead_on = None
    if lead is not None:
        name, cut = lead
        lead_on = _share(sum(1 for o in on if o is not None and o.get("source") not in ("drums", "bass") and float((o.get("instruments") or {}).get(name, 0.0)) >= cut), len(win))
    downs = [d for d in music.downbeats if lo <= d < hi and music.struck(d)]
    down_hit = sum(1 for d in downs if _hit_near(times, d))
    # the instrument runs: the share of the most common instrument in each 4-bar stretch
    runs, run_n = 0.0, 0
    bars = [d for d in music.downbeats if lo <= d < hi]
    for k in range(0, len(bars), SPAN_BARS):
        s0, s1 = bars[k], bars[k + SPAN_BARS] if k + SPAN_BARS < len(bars) else hi
        c = Counter(n.get("src") for t, g in win if s0 <= t < s1 for n in g if n.get("src"))
        if c:
            runs += max(c.values())
            run_n += sum(c.values())
    return {
        "seconds": round(sec, 2),
        "hits": len(win),
        "notes": len(notes),
        "hitsPerSec": round(rate, 2),
        "hitsRatio": round(rate / song_rate, 3) if song_rate > 0 else None,
        "notesPerHit": round(len(notes) / len(win), 3) if win else None,
        "src": {k: _share(src.get(k, 0), len(notes)) for k in (*STEMS, "none")},
        "switches": _share(switches, len(seq) - 1) if len(seq) > 1 else None,
        "run4": round(runs / run_n, 3) if run_n else None,
        "strongDrums": _share(strong_drums, len(drums)),
        "downbeats": _share(down_hit, len(downs)),
        "onTune": _share(tune_on, tune_on + drum_on),
        "onLead": lead_on,
        "sixteenths": _share(int(np.count_nonzero(gaps <= beat / 4.0 * 1.15)), len(gaps)) if beat else None,
        "holds": _share(sum(1 for n in notes if n.get("type") == "hold"), len(notes)),
    }


def _hit_near(times: list[float], t: float) -> bool:
    i = bisect.bisect_left(times, t - MATCH_MS)
    return i < len(times) and times[i] <= t + MATCH_MS


def chart_feel(notes: list[dict[str, Any]], analysis: dict[str, Any], windows: list[tuple[float, float]] = (), lead_quantile: float = 0.5) -> dict[str, Any]:
    """A chart's feel: the song (its hits per second over its playing span and the peak of its
    4-bar stretches), every section of the analysis, and the given windows (ms)."""
    music = Music(analysis, lead_quantile)
    hits = hits_of(notes)
    if not hits:
        return {"hits": 0, "sections": [], "windows": []}
    first, last = hits[0][0], hits[-1][0]
    song_rate = len(hits) / max(1e-6, (last - first) / 1000.0)
    times = [t for t, _ in hits]
    counts = []
    bars = [d for d in music.downbeats if first <= d <= last]
    for k in range(0, len(bars) - SPAN_BARS, SPAN_BARS):
        counts.append(bisect.bisect_left(times, bars[k + SPAN_BARS]) - bisect.bisect_left(times, bars[k]))
    sections = []
    for s in music.sections:
        lo, hi = float(s["t"]), float(s["endT"])
        if hi <= first or lo >= last:
            continue
        ons = [o for o in music.onsets if lo <= float(o["t"]) < hi]
        sec = max(1e-6, (hi - lo) / 1000.0)
        row = {
            "t": round(lo / 1000.0, 1),
            "endT": round(hi / 1000.0, 1),
            "label": s.get("label"),
            "mlLabel": s.get("mlLabel"),
            "group": s.get("group"),
            "energy": s.get("energy"),
            "lead": s.get("lead"),
            "music": {
                "onsetsPerSec": round(len(ons) / sec, 2),
                "tunePerSec": round(sum(1 for o in ons if o.get("source") in TUNE) / sec, 2),
                "drumsPerSec": round(sum(1 for o in ons if o.get("source") == "drums") / sec, 2),
            },
        }
        row.update(passage(hits, music, lo, hi, song_rate))
        sections.append(row)
    top = [r["hitsRatio"] for r in sections if r["label"] in ("chorus", "drop") and r["hitsRatio"] is not None]
    rest = [r["hitsRatio"] for r in sections if r["label"] not in ("chorus", "drop") and r["hitsRatio"] is not None]
    return {
        "hits": len(hits),
        "notes": len(notes),
        "hitsPerSec": round(song_rate, 2),
        "notesPerHit": round(len(notes) / len(hits), 3),
        "peak4": round(max(counts) / float(np.median(counts)), 3) if counts and np.median(counts) > 0 else None,
        # the highlight against the densest other section (under 1: something else is denser)
        "highlight": round(min(top) / max(rest), 3) if top and rest and max(rest) > 0 else None,
        "sections": sections,
        "windows": [dict(passage(hits, music, lo, hi, song_rate), t=round(lo / 1000.0, 1), endT=round(hi / 1000.0, 1)) for lo, hi in windows],
    }
