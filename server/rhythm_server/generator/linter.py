"""Playability linter: rules every generated chart must satisfy."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from .lanes import LaneInfo, ln_gap_ms
from .params import GenParams
from .tempo import TempoMap

TIME_EPS = 1e-3


def lint(notes: list[dict[str, Any]], lanes: list[LaneInfo], params: GenParams, tempo: TempoMap) -> list[str]:
    problems: list[str] = []
    n_lanes = len(lanes)
    by_lane: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for n in notes:
        if not 0 <= n["lane"] < n_lanes:
            problems.append(f"lane out of range at {n['t']}ms: {n['lane']}")
            continue
        if n["t"] < 0:
            problems.append(f"note before audio start: {n['t']}ms")
        if n["type"] == "hold" and not n.get("endT", 0) > n["t"]:
            problems.append(f"hold without positive length at {n['t']}ms")
        by_lane[n["lane"]].append(n)

    for lane, ns in by_lane.items():
        ns.sort(key=lambda n: n["t"])
        for a, b in zip(ns, ns[1:]):
            if abs(a["t"] - b["t"]) < TIME_EPS:
                problems.append(f"duplicate note lane {lane} at {a['t']}ms")
            elif a["type"] == "hold":
                if b["t"] < a["endT"] + ln_gap_ms(tempo, a["endBeat"]) - TIME_EPS:
                    problems.append(f"note too close after hold end lane {lane} at {b['t']}ms")
            elif b["t"] - a["t"] < params.min_jack_ms - TIME_EPS:
                problems.append(f"jack faster than {params.min_jack_ms}ms lane {lane} at {b['t']}ms")

    chords: dict[float, list[dict[str, Any]]] = defaultdict(list)
    for n in notes:
        chords[round(n["t"], 3)].append(n)
    holds = [n for n in notes if n["type"] == "hold"]
    for t, ns in chords.items():
        if len(ns) > max(1, params.max_chord):
            problems.append(f"chord of {len(ns)} at {t}ms exceeds {params.max_chord}")
        per_hand: dict[str, int] = defaultdict(int)
        for n in ns:
            per_hand[lanes[n["lane"]].hand] += 1
        held_hands = {lanes[h["lane"]].hand for h in holds if h["t"] < t - TIME_EPS and h["endT"] > t + TIME_EPS}
        for hand, count in per_hand.items():
            limit = 1 if hand == "T" else params.hand_chord_limit
            if hand in held_hands:
                limit = min(limit, params.hold_hand_limit)
            if count > limit:
                problems.append(f"{count} presses on hand {hand} at {t}ms (limit {limit})")
    for h in holds:
        overlapping = [
            o for o in holds
            if o is not h and lanes[o["lane"]].hand == lanes[h["lane"]].hand and o["t"] <= h["t"] < o["endT"]
        ]
        if len(overlapping) + 1 > params.max_holds_per_hand:
            problems.append(f"{len(overlapping) + 1} long notes held on hand {lanes[h['lane']].hand} at {h['t']}ms")
    return problems
