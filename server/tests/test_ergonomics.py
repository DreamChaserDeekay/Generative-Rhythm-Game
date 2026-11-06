"""Generator 0.9.47 (PATTERN_DESIGN 82-83): no notes on the reverb of a song's final hit, and a
hand that holds a long note leaves the taps to the other hand, most of all the fingers next to the
held one."""

from __future__ import annotations

from rhythm_server.generator.candidates import final_tail, in_tail
from rhythm_server.generator.lanes import _State, _under_hold_cost, _Weights, lane_infos
from rhythm_server.generator.params import resolve_params

NEG = -1e9


def _onset(t: float, strength: float) -> dict:
    return {"t": t, "strength": strength}


def test_the_final_hit_rings_out_without_notes() -> None:
    body = [_onset(500.0 * k, 1.0 + 0.2 * (k % 3)) for k in range(200)]  # median strength 1.2
    final = _onset(100_000.0, 1.6)
    ring = [_onset(100_400.0, 0.9), _onset(100_900.0, 0.6), _onset(101_500.0, 1.15)]
    analysis = {"durationMs": 104_000.0, "onsets": body + [final] + ring}
    tail = final_tail(analysis)
    assert tail is not None and tail[0] == 100_000.0
    # under 0.7 times the final hit: its reverb; a sound nearly as loud is still played
    assert in_tail(100_400.0, 0.9, tail) and in_tail(100_900.0, 0.6, tail)
    assert not in_tail(101_500.0, 1.15, tail)
    # a flam right on the final hit belongs to it
    assert not in_tail(100_030.0, 0.5, tail)
    # a song that fades out for long after its last strong hit has no such ending
    assert final_tail({"durationMs": 140_000.0, "onsets": analysis["onsets"]}) is None


def _state(n: int, hold_lane: int, head: float, hold_end: float, last: dict[int, float] | None = None) -> _State:
    lasts = [NEG] * n
    for i, t in (last or {}).items():
        lasts[i] = t
    lasts[hold_lane] = head
    heads = list(lasts)
    hold = [NEG] * n
    hold[hold_lane] = hold_end
    return _State(0.0, tuple(lasts), tuple(hold), (0.0,) * n, (), None, head, None, None, head=tuple(heads), streak=(0,) * n)


def test_a_holding_hand_leaves_the_taps_to_the_other_hand() -> None:
    lanes = lane_infos("6K")  # L3 L2 L1 | R1 R2 R3
    hand_keys = {"L": [0, 1, 2], "R": [3, 4, 5]}
    w = _Weights.of(resolve_params("6K", "HARD"))
    assert w.under_hold > 0 and w.under_adjacent > 0
    state = _state(6, hold_lane=0, head=1000.0, hold_end=3000.0)  # the left ring finger holds
    cost = {i: _under_hold_cost(state, (i,), [0], lanes, hand_keys, 1500.0, w) for i in range(1, 6)}
    # the other hand is free; on the holding hand the middle finger (next to the ring finger, the
    # least independent pair) pays most, the index finger less
    assert cost[3] == cost[4] == cost[5] == 0.0
    assert cost[1] > cost[2] > 0.0
    assert abs(cost[1] - cost[2] - w.under_adjacent * w.under_ring) < 1e-9
    # a second quick tap under the same hold pays more
    tapped = _state(6, hold_lane=0, head=1000.0, hold_end=3000.0, last={2: 1400.0})
    assert _under_hold_cost(tapped, (2,), [0], lanes, hand_keys, 1500.0, w) == cost[2] + w.under_fast
    # ...but not a tap before the hold began
    before = _state(6, hold_lane=0, head=1000.0, hold_end=3000.0, last={2: 950.0})
    assert _under_hold_cost(before, (2,), [0], lanes, hand_keys, 1100.0, w) == cost[2]


def test_harder_tiers_allow_more_under_a_hold() -> None:
    hard, master = (_Weights.of(resolve_params("7K+1S", t)) for t in ("HARD", "MASTER"))
    assert hard.under_hold > master.under_hold > 0
    assert hard.under_adjacent > master.under_adjacent > 0
