"""FX notes for 4K+FX and 6K+FX (docs/MAPPERATORINATOR.md, "FX 레인").

Mapperatorinator makes osu!mania charts, which have no FX lanes: these modes are made as 4K and 6K.
fx_notes then moves some of the key notes the model placed onto the FX lanes, by the rules the old
rule-based generator had (generator/sections.py and lanes.py before ee98a2d):

- how many: the tier's sideRate (config/difficulty.json) of the chart's note instants; holdShare of
  them holds, the rest taps. A note is moved, none is added: the chart keeps its note count.
- holds: holds the model made, a beat long at least, starting on a beat or an eighth, the longest
  first. Taps: the strongest hits (the nearest analysed onset's strength, the model's finish and
  clap hitsounds), those on a beat first.
- where: the song is cut into stretches of as many note instants, each with its share (the
  strongest hits of a song lie in its loudest part); what a stretch cannot take goes to the others.
- side: a low sound goes left, a bright one right (the nearest onset's bands against the middle of
  the likely picks), the other side when that one is not free.
- never: two FX notes within minGapMs (so never both at once), a key note of the same hand within
  the tier's minJackMs of an FX note's head (at the same instant is fine), a key note of the same
  hand while an FX hold is held, an FX hold while its hand holds a key.
"""

from __future__ import annotations

import bisect
from typing import Any

from ..chart.lanes import lane_infos
from ..config import difficulty_config

ONSET_MS = 45.0
FINISH, CLAP = 4, 8


def fx_notes(
    notes: list[dict[str, Any]], key_mode: str, difficulty: str, onsets: list[dict[str, Any]], hits: list[tuple[float, int, int]],
    cfg: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """The notes with some moved to the FX lanes, and what was moved (None: the key mode has no FX
    lanes, or mapper.json fx.enabled is off). `notes` are normalized (beats and times)."""
    lanes = lane_infos(key_mode)
    sides = {l.hand: l.index for l in lanes if l.kind == "side"}
    fx = cfg.get("fx") or {}
    if len(sides) < 2 or not fx.get("enabled", True) or not notes:
        return notes, None
    preset = difficulty_config()["presets"][difficulty]
    rate = float(preset.get("sideRate", 0.0)) * float(fx.get("rateScale", 1.0))
    min_jack = float(preset.get("minJackMs", 95.0))
    gap = max(min_jack, float(fx.get("minGapMs", 450.0)))
    min_hold = float(fx.get("minHoldBeats", 1.0))
    hand_of = {l.index: l.hand for l in lanes}
    instants = sorted({n["t"] for n in notes})
    want = rate * len(instants)
    if want < 0.5:
        return notes, None
    want_holds = want * float(fx.get("holdShare", 0.6))

    marks = sorted((float(o["t"]), o) for o in onsets if "t" in o)
    mark_times = [t for t, _ in marks]

    def onset_at(t: float) -> dict[str, Any] | None:
        k = bisect.bisect_left(mark_times, t)
        near = [j for j in (k - 1, k) if 0 <= j < len(marks) and abs(mark_times[j] - t) <= ONSET_MS]
        return marks[min(near, key=lambda j: abs(mark_times[j] - t))][1] if near else None

    def brightness(o: dict[str, Any] | None) -> float | None:
        bands = (o or {}).get("bands")
        if not bands or len(bands) < 3 or sum(bands) <= 0:
            return None
        return (float(bands[-1]) - float(bands[0])) / sum(float(b) for b in bands)

    accents: dict[float, int] = {}
    for t, bits, _ in hits:
        accents[round(t)] = accents.get(round(t), 0) | bits

    def on_grid(beat: float, parts: int) -> bool:
        return abs(beat * parts - round(beat * parts)) < 0.05 * parts

    holds: list[tuple[float, int]] = []
    taps: list[tuple[float, int]] = []
    bright: dict[int, float | None] = {}
    for i, n in enumerate(notes):
        onset = onset_at(n["t"])
        bright[i] = brightness(onset)
        if n["type"] == "hold":
            if n["endBeat"] - n["beat"] >= min_hold and on_grid(n["beat"], 2):
                holds.append((min(n["endBeat"] - n["beat"], 8.0) * (0.5 + float((onset or {}).get("harmonic") or 0.0)), i))
            continue
        strength = float((onset or {}).get("strength") or 0.2)
        bits = accents.get(round(n["t"]), 0)
        weight = 1.3 if on_grid(n["beat"], 1) else 0.8 if on_grid(n["beat"], 2) else 0.4
        taps.append((strength * weight * (1.5 if bits & FINISH else 1.2 if bits & CLAP else 1.0), i))
    holds.sort(key=lambda c: (-c[0], c[1]))
    taps.sort(key=lambda c: (-c[0], c[1]))
    # low and bright among the notes likely to be picked: the two sides get about as many
    likely = [i for _, i in holds[: int(want_holds) + 1]] + [i for _, i in taps[: int(2 * want) + 1]]
    known = sorted(b for b in (bright[i] for i in likely) if b is not None)
    middle = known[len(known) // 2] if known else 0.0

    by_hand: dict[str, list[int]] = {}
    for i, n in enumerate(notes):
        by_hand.setdefault(hand_of[n["lane"]], []).append(i)
    moved: dict[int, int] = {}  # note -> its FX lane
    heads: list[float] = []  # FX heads, by time

    def end_of(n: dict[str, Any]) -> float:
        return float(n.get("endT", n["t"]))

    def free(i: int, hand: str) -> bool:
        n, t, end = notes[i], notes[i]["t"], end_of(notes[i])
        k = bisect.bisect_left(heads, t - gap + 1e-6)
        if k < len(heads) and heads[k] < t + gap - 1e-6:
            return False
        for j, lane in moved.items():
            # the FX lane itself: clear of its other notes, heads and holds
            if lane == sides[hand] and notes[j]["t"] - min_jack < end and t < end_of(notes[j]) + min_jack:
                return False
        for j in by_hand.get(hand, []):
            if j == i or j in moved:
                continue
            o = notes[j]
            if 0 < abs(o["t"] - t) < min_jack:
                return False
            if n["type"] == "hold" and (t < o["t"] < end + min_jack or (o["type"] == "hold" and o["t"] < t < end_of(o))):
                # a key of the hand under the FX hold, or the hand holding a key already
                return False
        return True

    def place(i: int) -> bool:
        b = bright[i]
        first = hand_of[notes[i]["lane"]] if b is None else ("R" if b > middle else "L")
        first = first if first in sides else "L"
        for hand in (first, "R" if first == "L" else "L"):
            if free(i, hand):
                moved[i] = sides[hand]
                bisect.insort(heads, notes[i]["t"])
                return True
        return False

    # the song in stretches of as many note instants each, every one with its share of the FX notes
    # (the strongest hits of a song lie in its loudest part: picked over the whole song they crowd there)
    parts = max(1, int(round(want / float(fx.get("perStretch", 4.0)))))
    bounds = [instants[min(len(instants) - 1, (k * len(instants)) // parts)] for k in range(1, parts)]

    def part_of(i: int) -> int:
        return bisect.bisect_right(bounds, notes[i]["t"])

    counts = {"holds": 0, "taps": 0}
    in_part = [0] * parts

    def fill(pool: list[tuple[float, int]], kind: str, total: float, spread: bool) -> None:
        for _, i in pool:
            if counts[kind] >= total - 0.5:
                return
            if i in moved or (spread and in_part[part_of(i)] >= (want if kind == "taps" else want_holds) / parts - 0.5):
                continue
            if place(i):
                counts[kind] += 1
                in_part[part_of(i)] += 1

    fill(holds, "holds", want_holds, True)
    fill(holds, "holds", want_holds, False)
    in_part = [0] * parts
    for i in moved:
        in_part[part_of(i)] += 1
    fill(taps, "taps", want - counts["holds"], True)
    fill(taps, "taps", want - counts["holds"], False)
    if not moved:
        return notes, None
    out = [{**n, "lane": moved[i]} if i in moved else n for i, n in enumerate(notes)]
    out.sort(key=lambda n: (n["t"], n["lane"]))
    left = sum(1 for lane in moved.values() if lane == sides["L"])
    return out, {
        "rate": round(len(moved) / len(instants), 4), "target": round(rate, 4), "taps": counts["taps"], "holds": counts["holds"],
        "left": left, "right": len(moved) - left,
    }
