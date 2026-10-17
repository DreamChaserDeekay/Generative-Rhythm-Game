"""Lane assignment: beam search over a finger model with musical and ergonomic costs."""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Any

import numpy as np

from ..analysis.stems import STEM_NAMES
from ..config import difficulty_config, key_modes, load_config
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
class _Weights:
    """Cost weights after the style multipliers (resolved once per chart, not per combo)."""

    pitch: float
    contour: float
    alternate: float
    jack: float
    jack_bonus: float
    source: float  # pull of drum / bass notes toward their lane regions
    drum_targets: tuple[float, float, float]  # lane position for low / mid / high drum energy
    bass_target: float
    dominance: tuple[float, float]  # dominant-stem share from which a hit counts as "clear"
    repeat: float  # bonus for reusing the reference occurrence's lanes

    @staticmethod
    def of(params: GenParams) -> "_Weights":
        cfg = load_config("instruments")
        mapping = cfg["laneMapping"]
        drums = mapping["drums"]
        return _Weights(
            pitch=W_PITCH * params.weight("pitchWeight"),
            contour=W_CONTOUR * params.weight("contourWeight"),
            alternate=W_ALTERNATE * params.weight("alternateWeight"),
            jack=W_JACK * params.weight("jackWeight"),
            jack_bonus=params.weight("jackBonus", 0.0),
            source=float(mapping["weight"]) * params.instrument_mapping,
            drum_targets=(float(drums["low"]), float(drums["mid"]), float(drums["high"])),
            bass_target=float(mapping["bass"]),
            dominance=(float(mapping["dominance"][0]), float(mapping["dominance"][1])),
            repeat=float(cfg["repeat"]["bonus"]) * params.repeat_consistency,
        )


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


Choice = tuple[int, tuple[int, ...], int | None]  # (slot index, lanes used, long-note lane)


def assign_lanes(
    slots: list[Slot],
    lanes: list[LaneInfo],
    params: GenParams,
    tempo: TempoMap,
    rng: np.random.Generator,
    targets_by_slot: list[tuple[int, ...] | None] | None = None,
) -> list[dict[str, Any]]:
    """Lane-assigned notes. `targets_by_slot` gives key lanes to prefer per slot (repeat
    consistency); see `lane_search`."""
    return notes_from_choices(slots, lane_search(slots, lanes, params, tempo, rng, targets_by_slot), tempo)


def lane_search(
    slots: list[Slot],
    lanes: list[LaneInfo],
    params: GenParams,
    tempo: TempoMap,
    rng: np.random.Generator,
    targets_by_slot: list[tuple[int, ...] | None] | None = None,
) -> list[Choice]:
    """Beam search over lane choices; returns the best path's (slot, lanes, long-note lane)."""
    n_lanes = len(lanes)
    key_lanes = [l.index for l in lanes if l.kind == "key"]
    special_lanes = [l.index for l in lanes if l.kind in ("scratch", "side")]
    targets = _pitch_targets(slots)
    weights = _Weights.of(params)
    repeat_targets = targets_by_slot or [None] * len(slots)
    pos = [l.pos for l in lanes]
    hands = [l.hand for l in lanes]
    combo_cache: dict[tuple[Any, ...], list[tuple[int, ...]]] = {}
    neg = -1e9
    beam = [_State(0.0, (neg,) * n_lanes, (neg,) * n_lanes, (0.0,) * n_lanes, (), None, neg, None, None)]

    for si, slot in enumerate(slots):
        t = slot.t
        gap = ln_gap_ms(tempo, slot.beat)
        hold_end_t = tempo.beat_to_ms(slot.hold_end_beat) if slot.hold_end_beat is not None else None
        target = targets[si]
        # per-slot terms of the instrument-region cost: (drum share, drum position, bass share)
        src_terms = None
        if weights.source > 0 and slot.sources is not None:
            # Only clear drum or bass hits are pulled (a slot shared with the melody keeps its
            # pitch placement); shares are taken relative to the dominant stem.
            top = float(np.max(slot.sources)) + 1e-9
            lo, hi = weights.dominance
            clear = min(1.0, max(0.0, (top - lo) / (hi - lo)))
            if clear > 0:
                band_total = float(np.sum(slot.bands)) + 1e-9
                src_terms = (
                    clear * float(slot.sources[0]) / top,
                    float(np.dot(slot.bands, weights.drum_targets)) / band_total,
                    clear * float(slot.sources[1]) / top,
                )
        repeat_set = frozenset(repeat_targets[si]) if repeat_targets[si] else None
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
            special = _special_lane(slot, state, free, special_lanes, lanes, holding_hands, params, hold_end_t)
            mean_use = sum(state.usage[i] for i in key_lanes) / max(1, len(key_lanes))
            want_keys = slot.size - (1 if special is not None else 0)
            free_keys = [i for i in free if i in key_lanes]
            combos: list[tuple[int, ...]] = []
            dropped = 0
            holding_key = tuple(sorted(holding_hands.items()))
            for k in range(min(want_keys, len(free_keys)), -1, -1):
                key = (tuple(free_keys), k, holding_key, special)
                combos = combo_cache.get(key)  # type: ignore[assignment]
                if combos is None:
                    combos = combo_cache[key] = _valid_combos(free_keys, k, lanes, params, holding_hands, special)
                if combos or k == 0:
                    dropped = want_keys - k
                    break
            if not combos:
                combos = [()]
            noise = rng.random(len(combos)) * W_NOISE
            scored = []
            for ci, combo in enumerate(combos):
                lanes_used = combo + ((special,) if special is not None else ())
                if not lanes_used:
                    scored.append((W_DROP * slot.size, lanes_used, None))
                    continue
                cost = dropped * W_DROP + _cost(state, combo, pos, hands, slot, target, t, weights, mean_use, src_terms, repeat_set) + noise[ci]
                ln_lane = None
                if hold_end_t is not None and slot.special_hold and special is not None:
                    ln_lane = special
                elif hold_end_t is not None and combo:
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
    choices: list[Choice] = []
    node: _State | None = best
    while node is not None and node.choice is not None:
        choices.append(node.choice)
        node = node.parent
    choices.reverse()
    return choices


def key_lanes_of(choices: list[Choice], n_slots: int, lanes: list[LaneInfo]) -> list[tuple[int, ...] | None]:
    """Key lanes chosen for every slot (None for slots that got no note)."""
    out: list[tuple[int, ...] | None] = [None] * n_slots
    for si, lanes_used, _ in choices:
        out[si] = tuple(sorted(i for i in lanes_used if lanes[i].kind == "key"))
    return out


def notes_from_choices(slots: list[Slot], choices: list[Choice], tempo: TempoMap) -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    for si, lanes_used, ln_lane in choices:
        slot = slots[si]
        for lane in sorted(lanes_used):
            note: dict[str, Any] = {"beat": round(slot.beat, 6), "t": round(slot.t, 3), "lane": lane, "type": "tap"}
            if slot.src is not None:
                note["src"] = STEM_NAMES[slot.src]
            if lane == ln_lane and slot.hold_end_beat is not None:
                note["type"] = "hold"
                note["endBeat"] = round(slot.hold_end_beat, 6)
                note["endT"] = round(tempo.beat_to_ms(slot.hold_end_beat), 3)
            notes.append(note)
    notes.sort(key=lambda n: (n["t"], n["lane"]))
    return notes


def _special_lane(
    slot: Slot,
    state: _State,
    free: list[int],
    special_lanes: list[int],
    lanes: list[LaneInfo],
    holding_hands: dict[str, int],
    params: GenParams,
    hold_end_t: float | None,
) -> int | None:
    """Pick the scratch/side lane for a slot that wants one (None when none is playable now)."""
    if slot.special is None:
        return None
    options = []
    for i in special_lanes:
        if i not in free:
            continue
        hand = lanes[i].hand
        if holding_hands.get(hand) and params.hold_hand_limit < 1:
            continue
        if slot.special_hold and hold_end_t is not None and holding_hands.get(hand, 0) >= params.max_holds_per_hand:
            continue
        options.append(i)
    if not options:
        return None
    if len(options) == 1:
        return options[0]
    # Two side lanes: low-heavy sounds go left, bright ones right; then prefer the less recent one.
    total = float(np.sum(slot.bands)) + 1e-9
    brightness = (slot.bands[2] - slot.bands[0]) / total
    def cost(i: int) -> float:
        side = -1.0 if lanes[i].hand == "L" else 1.0
        return -side * brightness + 0.3 * (state.last[i] > state.prev_t - 1e-6)
    return min(options, key=cost)


def _valid_combos(
    free_keys: list[int],
    k: int,
    lanes: list[LaneInfo],
    params: GenParams,
    holding_hands: dict[str, int],
    special: int | None,
) -> list[tuple[int, ...]]:
    if k == 0:
        return [()]
    out = []
    base: dict[str, int] = {}
    if special is not None:
        base[lanes[special].hand] = 1
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
        if ok and params.pad_forbidden:
            pressed = set(combo)
            ok = not any(pressed.issuperset(chord) for chord in params.pad_forbidden)
        if ok:
            out.append(combo)
        if len(out) >= MAX_COMBOS * 4:
            break
    if len(out) > MAX_COMBOS:
        # keep combos spread across both hands first (more playable chords)
        out.sort(key=lambda c: -len({lanes[i].hand for i in c}))
        out = out[:MAX_COMBOS]
    return out


def _cost(
    state: _State,
    combo: tuple[int, ...],
    pos: list[float],
    hands: list[str],
    slot: Slot,
    target: float | None,
    t: float,
    w: _Weights,
    mean_use: float,
    src_terms: tuple[float, float, float] | None = None,
    repeat_set: frozenset[int] | None = None,
) -> float:
    if not combo:
        return 0.0
    cost = 0.0
    total_pos = 0.0
    for i in combo:
        total_pos += pos[i]
    mean_pos = total_pos / len(combo)
    if target is not None:
        cost += w.pitch * (mean_pos - target) ** 2
    if src_terms is not None:
        # drums: kick-heavy hits lean left, hat-heavy hits right; bass leans left
        drum_share, drum_pos, bass_share = src_terms
        cost += w.source * (drum_share * (mean_pos - drum_pos) ** 2 + bass_share * (mean_pos - w.bass_target) ** 2)
    if repeat_set and w.repeat > 0:
        overlap = sum(1 for i in combo if i in repeat_set)
        cost -= w.repeat * overlap / max(len(combo), len(repeat_set))
    dt = t - state.prev_t
    prev = state.prev_lanes
    if len(combo) == 1 and len(prev) == 1:
        lane, prev_lane = combo[0], prev[0]
        same_pitch = slot.pitch is not None and state.prev_pitch is not None and abs(slot.pitch - state.prev_pitch) < 0.5
        if same_pitch:
            cost += 0.0 if lane == prev_lane else W_SAME_PITCH
        elif slot.pitch is not None and state.prev_pitch is not None:
            step = slot.pitch - state.prev_pitch
            move = pos[lane] - pos[prev_lane]
            direction = (step > 0) - (step < 0)
            if direction != 0 and ((move > 0) - (move < 0)) != direction:
                cost += w.contour
        if dt < 200 and hands[lane] == hands[prev_lane]:
            cost += w.alternate * (200 - dt) / 200
    repeated = 0
    for i in combo:
        if i in prev:
            repeated += 1
    same_sound = slot.pitch is not None and state.prev_pitch is not None and abs(slot.pitch - state.prev_pitch) < 0.5
    if repeated and not same_sound:
        speed = min(1.0, max(0.0, (400.0 - dt) / 300.0))
        cost += w.jack * repeated * (0.6 + speed)
    if repeated and dt < 400.0:
        cost -= w.jack_bonus * repeated  # jack style: repeats stay on their lane
    usage = state.usage
    for i in combo:
        cost += W_BALANCE * (usage[i] - mean_use) / (mean_use + 1.0)
    return cost
