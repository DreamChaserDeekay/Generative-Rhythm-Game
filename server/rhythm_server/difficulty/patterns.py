"""Lane-pattern profile of a chart: which shapes it is made of (stairs, trills, jacks, chords, notes
under held long notes, leaps), how varied they are and how they sit on the hands. Shown in the chart
info, checked by the tests and used by the pattern engine (docs/PATTERN_DESIGN.md)."""

from __future__ import annotations

from collections import Counter
from typing import Any

from ..config import difficulty_config, key_modes

FAST_MS = 260.0  # consecutive single notes closer than this form a run
ALTERNATE_MS = 200.0  # moves at least this fast count toward hand alternation
SHAPE_MOVES = 3  # moves in one shape of the variety measure
WEAK_FINGER_PAIRS = ({2, 3}, {3, 4})  # middle-ring and ring-pinky trills
SUMMARY_KEYS = ("stairs", "trills", "chords", "jacks", "holdTaps", "leaps")


def _runs(events: list[tuple[float, tuple[int, ...]]]) -> list[list[tuple[float, int]]]:
    """Stretches of single notes in a row, each closer than FAST_MS to the previous one."""
    runs: list[list[tuple[float, int]]] = []
    current: list[tuple[float, int]] = []
    prev_t: float | None = None
    for t, lanes in events:
        fast = prev_t is not None and t - prev_t <= FAST_MS
        if len(lanes) == 1 and current and fast:
            current.append((t, lanes[0]))
        else:
            if len(current) >= 2:
                runs.append(current)
            current = [(t, lanes[0])] if len(lanes) == 1 else []
        prev_t = t
    if len(current) >= 2:
        runs.append(current)
    return runs


def _stair_notes(lanes: list[int]) -> int:
    """Notes in monotone one-lane steps of at least three notes."""
    count = i = 0
    while i < len(lanes) - 2:
        step = lanes[i + 1] - lanes[i]
        if abs(step) == 1:
            j = i + 1
            while j + 1 < len(lanes) and lanes[j + 1] - lanes[j] == step:
                j += 1
            if j - i + 1 >= 3:
                count += j - i + 1
                i = j
                continue
        i += 1
    return count


def _trills(lanes: list[int]) -> list[tuple[int, int, int]]:
    """(first lane, second lane, notes) of every two-lane alternation of at least four notes."""
    out = []
    i = 0
    while i < len(lanes) - 3:
        a, b = lanes[i], lanes[i + 1]
        if a != b:
            j = i + 1
            while j + 1 < len(lanes) and lanes[j + 1] == lanes[j - 1]:
                j += 1
            if j - i + 1 >= 4:
                out.append((a, b, j - i + 1))
                i = j
                continue
        i += 1
    return out


def pad_forbidden_keys(key_mode: str) -> list[set[int]]:
    """Chords a pad cannot press (DJMAX), as key indices of this key mode."""
    lanes = key_modes()[key_mode]["lanes"]
    keys = [lane["id"] for lane in lanes if lane["kind"] == "key"]
    chords = difficulty_config().get("systems", {}).get("DJMAX", {}).get("padForbiddenChords", {}).get(key_mode, [])
    return [{keys.index(x) for x in chord} for chord in chords]


def pattern_profile(notes: list[dict[str, Any]], key_mode: str) -> dict[str, Any]:
    """Shares are of the chart's key notes unless named otherwise; moves are within runs."""
    lane_cfg = key_modes()[key_mode]["lanes"]
    keys = [i for i, lane in enumerate(lane_cfg) if lane["kind"] == "key"]
    index = {lane: k for k, lane in enumerate(keys)}
    hand = [lane_cfg[i]["hand"] for i in keys]
    finger = [int(lane_cfg[i]["finger"]) for i in keys]
    n_keys = len(keys)
    key_notes = sorted((n for n in notes if n["lane"] in index), key=lambda n: (n["t"], n["lane"]))
    total = len(key_notes)
    profile: dict[str, Any] = {k: 0.0 for k in SUMMARY_KEYS}
    profile.update(
        {
            "alternation": 0.0,
            "sameHandLeaps": 0.0,
            "topShape": 0.0,
            "shapeKinds": 0,
            "chordShapes": {"adjacent": 0.0, "symmetric": 0.0, "other": 0.0},
            "padImpossible": 0,
            "weakTrills": 0,
            "fingers": {},
        }
    )
    if total == 0:
        return profile
    by_t: dict[float, list[int]] = {}
    for n in key_notes:
        by_t.setdefault(round(n["t"], 1), []).append(index[n["lane"]])
    events = [(t, tuple(sorted(v))) for t, v in sorted(by_t.items())]

    # jacks: a lane pressed again right after the previous instant pressed it (singles and chords)
    jacks = 0
    for (ta, la), (tb, lb) in zip(events, events[1:]):
        if tb - ta <= FAST_MS:
            jacks += len(set(la) & set(lb))

    # notes under a long note held on another lane
    holds = sorted((n["t"], n["endT"], n["lane"]) for n in key_notes if n["type"] == "hold")
    under = 0
    active: list[tuple[float, float, int]] = []
    h = 0
    for n in key_notes:
        while h < len(holds) and holds[h][0] < n["t"]:
            active.append(holds[h])
            h += 1
        active = [x for x in active if x[1] > n["t"]]
        if any(lane != n["lane"] and start < n["t"] for start, _, lane in active):
            under += 1

    stairs = trill_notes = weak = moves = leaps = same_hand_leaps = alt = alt_moves = 0
    shapes: Counter[tuple[int, ...]] = Counter()
    for run in _runs(events):
        lanes = [x for _, x in run]
        stairs += _stair_notes(lanes)
        for a, b, count in _trills(lanes):
            trill_notes += count
            if hand[a] == hand[b] and {finger[a], finger[b]} in WEAK_FINGER_PAIRS:
                weak += 1
        steps = [b - a for a, b in zip(lanes, lanes[1:])]
        for (ta, a), (tb, b) in zip(run, run[1:]):
            moves += 1
            d = abs(b - a)
            leaps += d >= 3
            same_hand_leaps += d >= 2 and hand[a] == hand[b]
            if tb - ta <= ALTERNATE_MS:
                alt_moves += 1
                alt += hand[a] != hand[b]
        for k in range(len(steps) - SHAPE_MOVES + 1):
            shapes[tuple(steps[k : k + SHAPE_MOVES])] += 1

    chord_events = [lanes for _, lanes in events if len(lanes) >= 2]
    pairs = [lanes for lanes in chord_events if len(lanes) == 2]
    adjacent = sum(1 for a, b in pairs if b - a == 1)
    symmetric = sum(1 for a, b in pairs if a + b == n_keys - 1 and b - a != 1)
    forbidden = pad_forbidden_keys(key_mode)
    fingers = Counter(finger[k] for _, lanes in events for k in lanes)
    shape_total = sum(shapes.values())

    def share(x: float, of: float) -> float:
        return round(x / of, 3) if of else 0.0

    profile.update(
        {
            "stairs": share(stairs, total),
            "trills": share(trill_notes, total),
            "chords": share(sum(len(c) for c in chord_events), total),
            "jacks": share(jacks, total),
            "holdTaps": share(under, total),
            "leaps": share(leaps, moves),
            "alternation": share(alt, alt_moves),
            "sameHandLeaps": share(same_hand_leaps, moves),
            "topShape": share(shapes.most_common(1)[0][1], shape_total) if shapes else 0.0,
            "shapeKinds": len(shapes),
            "chordShapes": {
                "adjacent": share(adjacent, len(pairs)),
                "symmetric": share(symmetric, len(pairs)),
                "other": share(len(pairs) - adjacent - symmetric, len(pairs)),
            },
            "padImpossible": sum(1 for c in chord_events if any(f <= set(c) for f in forbidden)),
            "weakTrills": weak,
            "fingers": {str(f): share(v, total) for f, v in sorted(fingers.items())},
        }
    )
    return profile


def pattern_summary(notes: list[dict[str, Any]], key_mode: str) -> dict[str, float]:
    """The chart-info part of the profile (meta.patterns)."""
    profile = pattern_profile(notes, key_mode)
    return {k: profile[k] for k in SUMMARY_KEYS}
