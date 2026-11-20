"""Keeping a chart's level in its tier's range (docs/MAPPERATORINATOR.md, "난이도 구간에 맞추기").

Mapperatorinator is asked for an osu! star rating; the level the app shows is its own estimate of
the notes it got (difficulty/estimator.py). The star rating a level is asked at (mapper.json
starsForLevel, by key mode) is right on average, but a song and a seed move the level by about 17%
either way (the runner's 72 charts, sd 0.17 of log level), more than a tier's range. So a chart
whose level is outside its tier's range is made again, at a star rating corrected by how far it
was (`next_stars`: a secant in log stars and log rating), on the song's timing; and one still too
high after the last try loses notes, the weakest first (`thinned`), until it is in range. One
still too low cannot be: its song is too calm for the tier, which it then does not have
(`TierAbsent`).

Levels: a level L is the ratings [L, L+1) (estimator.level_for); the last level holds every rating
above it, so the top tier's range is open upward and the bottom tier's downward.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Callable

from ..config import difficulty_config

# what levelFit in mapper.json holds when it is not given
DEFAULTS: dict[str, Any] = {
    "enabled": True,  # off: a chart is the first the model makes, whatever its level (the tests' stand-in worker)
    "attempts": 4,  # charts made at most, the first included
    "slope": 0.9,  # d log(rating) / d log(stars) with neither two tries nor a table (the runner's 72 charts: 0.91)
    "minSlope": 0.3,  # (the runner's 135 charts: about 2 under 2 stars, 1 at 2.3-3.4, 0.5 over 4.5)
    "maxSlope": 3.0,
    "maxStep": 2.0,  # a correction moves the stars by this factor at most, either way
    "minStars": 0.5,
    "maxStars": 10.0,
}


class TierAbsent(Exception):
    """The song is too calm for the tier: every try came out under its range."""

    def __init__(self, message: str, detail: dict[str, Any]):
        super().__init__(message)
        self.detail = detail


@dataclass(frozen=True)
class Window:
    """The levels a chart may have: lo..hi (hi = max_level: any rating above it too)."""

    lo: int
    hi: int

    @property
    def target(self) -> float:
        """The rating aimed at: the middle of the ratings the levels cover (lo .. hi+1)."""
        return (self.lo + self.hi + 1) / 2.0

    def holds(self, level: int) -> bool:
        return self.lo <= level <= self.hi

    def side(self, level: int) -> int:
        """-1 under the range, 0 in it, 1 over it."""
        return -1 if level < self.lo else (1 if level > self.hi else 0)


def window_for(difficulty: str, target_level: int | None) -> Window:
    """The range a chart's level must be in: its tier's (a chart asked for at a level: the tier
    that level is in, as resolve_tier gives it)."""
    cfg = difficulty_config()
    if target_level is not None:
        for name in cfg["order"]:
            lo, hi = cfg["presets"][name]["levels"]
            if lo <= target_level <= hi:
                difficulty = name
                break
    lo, hi = cfg["presets"][difficulty]["levels"]
    return Window(int(lo), int(hi))


def aim(window: Window, target_level: int | None) -> float:
    """The rating a chart aims at: the level asked for (its middle), else the range's middle."""
    return target_level + 0.5 if target_level is not None else window.target


def settings(cfg: dict[str, Any]) -> dict[str, Any]:
    return {**DEFAULTS, **{k: v for k, v in (cfg.get("levelFit") or {}).items() if not k.startswith("_")}}


def _along(x: float, pts: list[tuple[float, float]]) -> float:
    """y at x on the straight lines through pts (sorted by x), carried on past either end."""
    if x <= pts[0][0]:
        (x0, y0), (x1, y1) = pts[0], pts[1]
    elif x >= pts[-1][0]:
        (x0, y0), (x1, y1) = pts[-2], pts[-1]
    else:
        k = next(i for i in range(1, len(pts)) if x <= pts[i][0])
        (x0, y0), (x1, y1) = pts[k - 1], pts[k]
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0) if x1 != x0 else y0


def next_stars(tries: list[tuple[float, float]], goal: float, fit: dict[str, Any], table: list[list[float]] | None = None) -> float:
    """The star rating to try next for a rating `goal`, from the tries so far ((stars, rating)).
    Tries on both sides of the goal: between the nearest of each. Else two tries or more: log rating is taken as linear in log stars, with the slope of the two nearest
    the goal when it is within minSlope..maxSlope. Else, with the key mode's table ([rating, stars]):
    the song's charts are taken to land as far off the table everywhere as the last did (in log
    rating), and the stars are the table's for the goal moved by that; without one, the given slope.
    One step moves the stars by maxStep at most; they stay within minStars..maxStars."""
    stars, rating = tries[-1]
    rating = max(rating, 0.5)
    out = None
    lg = math.log(goal)
    below = [p for p in tries if math.log(max(p[1], 0.5)) < lg]
    above = [p for p in tries if math.log(max(p[1], 0.5)) > lg]
    if below and above:
        # tries on both sides of the goal: between the nearest of each (log stars against log
        # rating), which a noisy secant or the table may leave
        (s0, r0) = max(below, key=lambda p: p[1])
        (s1, r1) = min(above, key=lambda p: p[1])
        y0, y1 = math.log(max(r0, 0.5)), math.log(max(r1, 0.5))
        x0, x1 = math.log(s0), math.log(s1)
        if s0 < s1:
            out = math.exp(x0 + (lg - y0) * (x1 - x0) / (y1 - y0))
        else:
            # more stars came out lower (the seed's noise): halfway
            out = math.exp((x0 + x1) / 2.0)
        return round(max(float(fit["minStars"]), min(float(fit["maxStars"]), out)), 2)
    if len(tries) >= 2:
        # the two tries nearest the goal (log rating)
        near = sorted(tries, key=lambda p: abs(math.log(max(p[1], 0.5)) - math.log(goal)))[:2]
        (s0, r0), (s1, r1) = near
        if abs(math.log(s1) - math.log(s0)) > 1e-3:
            k = (math.log(max(r1, 0.5)) - math.log(max(r0, 0.5))) / (math.log(s1) - math.log(s0))
            if fit["minSlope"] <= k <= fit["maxSlope"]:
                stars, rating = s0, max(r0, 0.5)
                out = stars * math.exp((math.log(goal) - math.log(rating)) / k)
    if out is None and table:
        by_stars = sorted((float(st), float(r)) for r, st in table)
        by_rating = sorted((float(r), float(st)) for r, st in table)
        expected = max(0.5, _along(stars, by_stars))
        out = max(0.01, _along(goal * expected / rating, by_rating))
    if out is None:
        out = stars * math.exp((math.log(goal) - math.log(rating)) / float(fit["slope"]))
    step = max(-math.log(fit["maxStep"]), min(math.log(fit["maxStep"]), math.log(out / stars)))
    out = stars * math.exp(step)
    return round(max(float(fit["minStars"]), min(float(fit["maxStars"]), out)), 2)


def first_stars(prior: list[tuple[float, float]], goal: float, table_stars: float, fit: dict[str, Any], table: list[list[float]] | None = None) -> float:
    """The star rating a chart is first asked at: the table's, or where the song's charts made
    before (`prior`: their (stars, rating), of the same model and key mode) put the rating aimed at
    (next_stars on them: a song's charts land higher or lower than the table's alike)."""
    if not prior:
        return table_stars
    return next_stars(list(prior), goal, fit, table)


# ---------- taking notes out ----------

def _beat_weight(beat: float) -> float:
    """How strong a note's place in the beat is: on a half note 3.5, a beat 3, an eighth 2, a
    sixteenth 1, anything else (triplets, 32nds) 0."""
    frac = beat % 1.0
    near = lambda x: abs(frac - x) < 0.02 or abs(frac - x - 1.0) < 0.02  # noqa: E731
    if near(0.0):
        return 3.5 if abs((beat % 2.0)) < 0.02 or abs(beat % 2.0 - 2.0) < 0.02 else 3.0
    if near(0.5):
        return 2.0
    if near(0.25) or near(0.75):
        return 1.0
    return 0.0


def removal_order(notes: list[dict[str, Any]]) -> list[int]:
    """The notes' indices, the first to go first: of a chord, the notes past its first (a chord
    gets smaller before an instant goes), on weak places before strong ones, taps before holds;
    among equals spread through the song (an even split of each run, by a bit-reversed count),
    so that a pattern thins evenly and not from its start. The order is the notes' alone."""
    by_t: dict[float, list[int]] = {}
    for i, n in enumerate(notes):
        by_t.setdefault(round(float(n["t"]), 1), []).append(i)
    keys: list[tuple[float, int]] = []
    for idx in by_t.values():
        # a chord keeps the note of the lowest lane longest (a hold before a tap)
        idx = sorted(idx, key=lambda i: (notes[i].get("type") != "hold", notes[i]["lane"]))
        for rank, i in enumerate(idx):
            n = notes[i]
            score = _beat_weight(float(n.get("beat", 0.0)))
            if rank > 0:
                score -= 4.0
            if n.get("type") == "hold":
                score += 6.0
            keys.append((score, i))
    keys.sort()
    # within one score, spread the order through the song: bit-reversed positions
    out: list[int] = []
    j = 0
    while j < len(keys):
        k = j
        while k < len(keys) and keys[k][0] == keys[j][0]:
            k += 1
        run = [keys[m][1] for m in range(j, k)]
        bits = max(1, (len(run) - 1).bit_length())
        spread = sorted(range(len(run)), key=lambda p: int(format(p, f"0{bits}b")[::-1], 2))
        out.extend(run[p] for p in spread)
        j = k
    return out


def thinned(notes: list[dict[str, Any]], level_of: Callable[[list[dict[str, Any]]], int], hi: int) -> tuple[list[dict[str, Any]], int]:
    """The notes with the fewest taken out (removal_order) that bring the level to `hi` at most,
    and how many were: a binary search on the count (the level falls as notes go)."""
    if level_of(notes) <= hi:
        return notes, 0
    order = removal_order(notes)

    def without(count: int) -> list[dict[str, Any]]:
        gone = set(order[:count])
        return [n for i, n in enumerate(notes) if i not in gone]

    lo_c, hi_c = 0, len(notes) - 1
    while lo_c < hi_c:
        mid = (lo_c + hi_c) // 2
        if level_of(without(mid)) <= hi:
            hi_c = mid
        else:
            lo_c = mid + 1
    return without(lo_c), lo_c
