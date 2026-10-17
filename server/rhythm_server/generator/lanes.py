"""Lane assignment: beam search over a finger model with musical and ergonomic costs."""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Any

import numpy as np

from ..config import difficulty_config, key_modes
from .params import GenParams
from .select import Slot
from .tempo import TempoMap

BEAM_WIDTH = 5
MAX_COMBOS = 40
PITCH_WINDOW = 12

W_PITCH = 2.0
W_CONTOUR = 0.6
W_SAME_PITCH = 0.4
W_JACK = 2.2
W_ALTERNATE = 0.8
W_BALANCE = 0.5
W_NOISE = 0.35
W_DROP = 6.0
USAGE_DECAY = 0.9


@dataclass(frozen=True)
class LaneInfo:
    index: int
    kind: str
    hand: str
    finger: int
    pos: float  # 0..1 across key lanes; scratch lanes are -1


def lane_infos(key_mode: str) -> list[LaneInfo]:
    lanes = key_modes()[key_mode]["lanes"]
    keys = [i for i, l in enumerate(lanes) if l["kind"] == "key"]
    out = []
    for i, l in enumerate(lanes):
        pos = keys.index(i) / max(1, len(keys) - 1) if l["kind"] == "key" else -1.0
        out.append(LaneInfo(index=i, kind=l["kind"], hand=l["hand"], finger=int(l["finger"]), pos=pos))
    return out


def ln_gap_ms(tempo: TempoMap, beat: float) -> float:
    return max(80.0, tempo.beat_ms(beat) * float(difficulty_config()["lnTailGapBeats"]))


@dataclass
class _State:
    cost: float
    last: tuple[float, ...]
    hold_end: tuple[float, ...]
    usage: tuple[float, ...]
    prev_lanes: tuple[int, ...]
    prev_pitch: float | None
    prev_t: float
    parent: "_State | None"
    choice: tuple[int, tuple[int, ...], int | None] | None  # (slot index, lanes, long-note lane)


def _pitch_targets(slots: list[Slot]) -> list[float | None]:
    """Pitch as a 0..1 rank inside a sliding window of nearby pitched slots."""
    pitched = [(i, s.pitch) for i, s in enumerate(slots) if s.pitch is not None]
    targets: list[float | None] = [None] * len(slots)
    values = [p for _, p in pitched]
    for k, (i, p) in enumerate(pitched):
        lo, hi = max(0, k - PITCH_WINDOW), min(len(values), k + PITCH_WINDOW + 1)
        window = values[lo:hi]
        if len(window) < 3:
            targets[i] = 0.5
            continue
        below = sum(1 for v in window if v < p) + 0.5 * sum(1 for v in window if v == p)
        targets[i] = below / len(window)
    return targets


def assign_lanes(slots: list[Slot], lanes: list[LaneInfo], params: GenParams, tempo: TempoMap, rng: np.random.Generator) -> list[dict[str, Any]]:
    n_lanes = len(lanes)
    key_lanes = [l.index for l in lanes if l.kind == "key"]
    scratch_lanes = [l.index for l in lanes if l.kind == "scratch"]
    targets = _pitch_targets(slots)
    neg = -1e9
    beam = [_State(0.0, (neg,) * n_lanes, (neg,) * n_lanes, (0.0,) * n_lanes, (), None, neg, None, None)]

    for si, slot in enumerate(slots):
        t = slot.t
        gap = ln_gap_ms(tempo, slot.beat)
        hold_end_t = tempo.beat_to_ms(slot.hold_end_beat) if slot.hold_end_beat is not None else None
        target = targets[si]
        expansions: list[_State] = []
        for state in beam:
            free = [
                i for i in range(n_lanes)
                if state.hold_end[i] + gap <= t and t - state.last[i] >= params.min_jack_ms - 1e-6
            ]
            holding_hands: dict[str, int] = {}
            for i in range(n_lanes):
                if state.hold_end[i] > t:
                    holding_hands[lanes[i].hand] = holding_hands.get(lanes[i].hand, 0) + 1
            scratch_ok = any(
                i in free and (not holding_hands.get(lanes[i].hand) or params.hold_hand_limit >= 1) for i in scratch_lanes
            )
            use_scratch = slot.scratch and scratch_ok
            want_keys = slot.size - (1 if use_scratch else 0)
            free_keys = [i for i in free if i in key_lanes]
            combos: list[tuple[int, ...]] = []
            dropped = 0
            for k in range(min(want_keys, len(free_keys)), -1, -1):
                combos = _valid_combos(free_keys, k, lanes, params, holding_hands, use_scratch, scratch_lanes)
                if combos or k == 0:
                    dropped = want_keys - k
                    break
            if not combos:
                combos = [()]
            scored = []
            for combo in combos:
                lanes_used = combo + ((scratch_lanes[0],) if use_scratch else ())
                if not lanes_used:
                    scored.append((W_DROP * slot.size, lanes_used, None))
                    continue
                cost = dropped * W_DROP + _cost(state, combo, lanes, slot, target, t, params) + rng.random() * W_NOISE
                ln_lane = None
                if hold_end_t is not None and combo:
                    # a hand may only hold so many long notes at once
                    options = [i for i in combo if holding_hands.get(lanes[i].hand, 0) < params.max_holds_per_hand]
                    if options:
                        ln_lane = min(options, key=lambda i: abs(lanes[i].pos - (target if target is not None else 0.5)))
                scored.append((cost, lanes_used, ln_lane))
            scored.sort(key=lambda x: x[0])
            for cost, lanes_used, ln_lane in scored[:BEAM_WIDTH]:
                last = list(state.last)
                hold = list(state.hold_end)
                usage = [u * USAGE_DECAY for u in state.usage]
                for i in lanes_used:
                    last[i] = t if i != ln_lane else (hold_end_t or t)
                    usage[i] += 1.0
                if ln_lane is not None and hold_end_t is not None:
                    hold[ln_lane] = hold_end_t
                expansions.append(
                    _State(
                        cost=state.cost + cost,
                        last=tuple(last),
                        hold_end=tuple(hold),
                        usage=tuple(usage),
                        prev_lanes=tuple(i for i in lanes_used if lanes[i].kind == "key"),
                        prev_pitch=slot.pitch,
                        prev_t=t,
                        parent=state,
                        choice=(si, lanes_used, ln_lane),
                    )
                )
        expansions.sort(key=lambda s: s.cost)
        beam = expansions[:BEAM_WIDTH] or beam

    best = min(beam, key=lambda s: s.cost)
    choices = []
    node: _State | None = best
    while node is not None and node.choice is not None:
        choices.append(node.choice)
        node = node.parent
    choices.reverse()

    notes: list[dict[str, Any]] = []
    for si, lanes_used, ln_lane in choices:
        slot = slots[si]
        for lane in sorted(lanes_used):
            note: dict[str, Any] = {"beat": round(slot.beat, 6), "t": round(slot.t, 3), "lane": lane, "type": "tap"}
            if lane == ln_lane and slot.hold_end_beat is not None:
                note["type"] = "hold"
                note["endBeat"] = round(slot.hold_end_beat, 6)
                note["endT"] = round(tempo.beat_to_ms(slot.hold_end_beat), 3)
            notes.append(note)
    notes.sort(key=lambda n: (n["t"], n["lane"]))
    return notes


def _valid_combos(
    free_keys: list[int],
    k: int,
    lanes: list[LaneInfo],
    params: GenParams,
    holding_hands: dict[str, int],
    use_scratch: bool,
    scratch_lanes: list[int],
) -> list[tuple[int, ...]]:
    if k == 0:
        return [()]
    out = []
    base: dict[str, int] = {}
    if use_scratch:
        for i in scratch_lanes[:1]:
            base[lanes[i].hand] = base.get(lanes[i].hand, 0) + 1
    for combo in itertools.combinations(free_keys, k):
        per_hand = dict(base)
        for i in combo:
            per_hand[lanes[i].hand] = per_hand.get(lanes[i].hand, 0) + 1
        ok = True
        for hand, count in per_hand.items():
            limit = 1 if hand == "T" else params.hand_chord_limit
            if holding_hands.get(hand):
                limit = min(limit, params.hold_hand_limit)
            if count > limit:
                ok = False
                break
        if ok:
            out.append(combo)
        if len(out) >= MAX_COMBOS * 4:
            break
    if len(out) > MAX_COMBOS:
        # keep combos spread across both hands first (more playable chords)
        out.sort(key=lambda c: -len({lanes[i].hand for i in c}))
        out = out[:MAX_COMBOS]
    return out


def _cost(state: _State, combo: tuple[int, ...], lanes: list[LaneInfo], slot: Slot, target: float | None, t: float, params: GenParams) -> float:
    if not combo:
        return 0.0
    cost = 0.0
    mean_pos = sum(lanes[i].pos for i in combo) / len(combo)
    if target is not None:
        cost += W_PITCH * (mean_pos - target) ** 2
    dt = t - state.prev_t
    prev = state.prev_lanes
    if len(combo) == 1 and len(prev) == 1:
        lane, prev_lane = combo[0], prev[0]
        same_pitch = slot.pitch is not None and state.prev_pitch is not None and abs(slot.pitch - state.prev_pitch) < 0.5
        if same_pitch:
            cost += 0.0 if lane == prev_lane else W_SAME_PITCH
        elif slot.pitch is not None and state.prev_pitch is not None:
            direction = np.sign(slot.pitch - state.prev_pitch)
            move = np.sign(lanes[lane].pos - lanes[prev_lane].pos)
            if direction != 0 and move != direction:
                cost += W_CONTOUR
        if dt < 200 and lanes[lane].hand == lanes[prev_lane].hand:
            cost += W_ALTERNATE * (200 - dt) / 200
    repeated = sum(1 for i in combo if i in prev)
    if repeated and not (slot.pitch is not None and state.prev_pitch is not None and abs(slot.pitch - state.prev_pitch) < 0.5):
        speed = min(1.0, max(0.0, (400.0 - dt) / 300.0))
        cost += W_JACK * repeated * (0.6 + speed)
    usage = state.usage
    mean_use = sum(usage[l.index] for l in lanes if l.kind == "key") / max(1, sum(1 for l in lanes if l.kind == "key"))
    for i in combo:
        cost += W_BALANCE * (usage[i] - mean_use) / (mean_use + 1.0)
    return cost
