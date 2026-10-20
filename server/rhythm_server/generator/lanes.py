"""Lane assignment: beam search over a finger model with musical and ergonomic costs."""

from __future__ import annotations

import dataclasses
import itertools
from dataclasses import dataclass
from typing import Any

import numpy as np

from ..analysis.stems import STEM_NAMES
from ..config import difficulty_config, key_modes, load_config
from .motifs import MotifContext, SlotPlan, by_key_mode, by_skill, motif_context, motif_costs, one_hand_region
from .params import GenParams
from .select import Slot, sound_of
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
ANCHOR_MS = 260.0  # notes closer than this keep an anchor going (same as the guide measure's fast moves)
USAGE_DECAY = 0.9
TIME_EPS = 1e-3
# from this repeat weight on, a slot whose target lanes are a valid combo only considers that combo
# (the weight would pick it anyway; skipping the rest keeps copied sections cheap)
EXACT_COPY_WEIGHT = 20.0
# share of the copy bonus a note of its own pays per lane that a copied note right after it needs
# (within that lane's jack spacing): the note added in a repeat must not take the copy's lane
RESERVE_SHARE = 0.5
# Chord notes over several instruments, left to right when the rhythm side is on the left (low
# instruments first), and the instruments a long note prefers (the ones that sustain).
STEM_POSITION = {"bass": 0, "drums": 1, "other": 2, "vocals": 3}
STEM_SUSTAIN = {"vocals": 0, "other": 1, "bass": 2, "drums": 3}
# Pattern shapes that stay on one hand for a while (a 6K stair 1-2-3, a one-hand trill, a jack):
# their fast runs are not held to the same-hand limit (patterns.json "hands").
ONE_HAND_MOTIFS = frozenset({"stair", "roll", "trill", "anchor", "brokenStair", "jack", "doubles"})


@dataclass(frozen=True)
class _Weights:
    """Cost weights after the style multipliers (resolved once per chart, not per combo)."""

    pitch: float
    contour: float
    alternate: float
    jack: float
    jack_bonus: float
    bonus_ms: float  # how close a repeat of the same sound must follow to get jack_bonus
    # a repeat at least slow_ms after the last note is slow: its own same-sound bonus, and that
    # share of the jack cost
    slow_ms: float
    slow_bonus: float
    slow_jack: float
    usage: float  # weight of the lane-usage balance (W_BALANCE scaled per system)
    slow_usage: float  # the same for a slow note
    key_bias: tuple[float, ...]  # per lane: a standing cost (negative: a pull) of using the key
    source: float  # pull of drum / bass notes toward their lane regions
    drum_targets: tuple[float, float, float]  # lane position for low / mid / high drum energy
    bass_target: float
    dominance: tuple[float, float]  # dominant-stem share from which a hit counts as "clear"
    repeat: float  # bonus for reusing the reference occurrence's lanes
    anchor: float  # per hit an anchor runs past the chart's cap
    # hand rules (patterns.json "hands"): fast singles in a row on one hand, slots in a row on one
    # lane (within jack_span ms of each other), and each hand's share of a busy bar
    same_hand: float
    same_hand_free: int
    jack_streak: float
    jack_free: int
    jack_span: float
    balance_bar: float
    balance_min: float
    balance_band: tuple[float, float]
    # sound memory (hands.soundMemory): a sound coming back after other notes pays this for leaving
    # the lane it last had (BMS charts keep 70-86% of a keysound's notes on one lane)
    memory: float = 0.0
    memory_size: int = 0

    @staticmethod
    def of(params: GenParams) -> "_Weights":
        cfg = load_config("instruments")
        mapping = cfg["laneMapping"]
        drums = mapping["drums"]
        base_hands = load_config("patterns")["hands"]
        hands = {**base_hands, **base_hands["systems"].get(params.system, {})}
        return _Weights(
            pitch=W_PITCH * params.weight("pitchWeight"),
            contour=W_CONTOUR * params.weight("contourWeight"),
            alternate=W_ALTERNATE * params.weight("alternateWeight") * by_key_mode(hands["alternateScale"], params.key_mode),
            jack=W_JACK * params.weight("jackWeight") * float(hands["jackScale"]),
            # a repeat of the same sound keeps its lane: the jack style's bonus, or the system's own
            jack_bonus=max(params.weight("jackBonus", 0.0), by_skill(hands["sameSoundBonus"], params.skill)),
            bonus_ms=float(hands["sameSoundWithinMs"]),
            slow_ms=float(hands["slowRepeatMs"]),
            slow_bonus=max(params.weight("jackBonus", 0.0), by_skill(hands["slowSameSoundBonus"], params.skill)),
            slow_jack=float(hands["slowJackScale"]),
            usage=W_BALANCE * float(hands["usageBalance"]),
            slow_usage=W_BALANCE * float(hands["usageBalance"]) * float(hands["slowUsageScale"]),
            key_bias=_key_bias(hands["keyBias"].get(params.key_mode), params.key_mode, by_skill(hands["keyBiasScale"], params.skill)),
            source=float(mapping["weight"]) * params.instrument_mapping,
            drum_targets=(float(drums["low"]), float(drums["mid"]), float(drums["high"])),
            bass_target=float(mapping["bass"]),
            dominance=(float(mapping["dominance"][0]), float(mapping["dominance"][1])),
            repeat=float(cfg["repeat"]["bonus"]) * params.repeat_consistency,
            anchor=float(load_config("patterns")["weights"]["anchorOver"]),
            # the styles that ask for hand alternation (stream) or jacks (jack) move these with it
            same_hand=float(hands["sameHand"]) * (1.0 - float(hands["sameHandEase"]) * params.skill) * params.weight("alternateWeight"),
            same_hand_free=int(hands["sameHandFree"]),
            jack_streak=float(hands["jackStreak"]) * params.weight("jackWeight"),
            jack_free=int(hands["jackFree"]),
            jack_span=max(float(hands["jackStreakSpan"]) * params.min_jack_ms, float(hands["jackStreakMinMs"])),
            balance_bar=float(hands["balance"]),
            balance_min=float(hands["balanceMinNotes"]),
            balance_band=(float(hands["balanceBand"][0]), float(hands["balanceBand"][1])),
            memory=by_skill(hands.get("soundMemory", 0.0), params.skill),
            memory_size=int(hands.get("soundMemorySize", 24)),
        )


def _key_bias(bias: list[float] | None, key_mode: str, scale: float = 1.0) -> tuple[float, ...]:
    """Per lane the key's standing cost (× `scale`) from a list over the key lanes, left to right."""
    lanes = lane_infos(key_mode)
    out = [0.0] * len(lanes)
    if bias:
        for k, lane in enumerate(l for l in lanes if l.kind == "key"):
            out[lane.index] = float(bias[k]) * scale
    return tuple(out)


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


@dataclass(slots=True)
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
    phrase: int = -1  # phrase of the pattern plan the history belongs to
    hist: tuple[tuple[int, ...], ...] = ()  # key indices chosen for the earlier slots of the phrase
    single_t: float = -1e9  # time of the phrase's latest single note
    head: tuple[float, ...] = ()  # latest press per lane (the head of a long note, unlike `last`)
    prev_sound: tuple[Any, ...] | None = None  # the previous slot's sound (planner sound key)
    run: tuple[int, ...] = ()  # key lanes of the fast run of single notes this slot ends (recent part)
    streak: tuple[int, ...] = ()  # per lane: slots in a row (each close to the last) that hit the key, ending here
    bar: int = -1  # bar of this slot
    bar_hands: tuple[float, float] = (0.0, 0.0)  # left / right key notes of that bar so far (a middle key: half each)
    memory: tuple[tuple[Any, int], ...] = ()  # (sound, lane) of the latest single key notes, one per sound, oldest first


def _remember(memory: tuple[tuple[Any, int], ...], sound: Any, keys_used: tuple[int, ...], size: int) -> tuple[tuple[Any, int], ...]:
    """The sound memory after a slot: a single key note's sound moves to the end with its lane."""
    if sound is None or len(keys_used) != 1:
        return memory
    kept = tuple(m for m in memory if m[0] != sound)
    return (kept + ((sound, keys_used[0]),))[-size:]


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
    plan: list[SlotPlan] | None = None,
) -> list[dict[str, Any]]:
    """Lane-assigned notes. `targets_by_slot` gives key lanes to prefer per slot (repeat
    consistency), `plan` the pattern of every slot; see `lane_search`."""
    return notes_from_choices(slots, lane_search(slots, lanes, params, tempo, rng, targets_by_slot, plan), tempo, lanes, plan)


def lane_search(
    slots: list[Slot],
    lanes: list[LaneInfo],
    params: GenParams,
    tempo: TempoMap,
    rng: np.random.Generator,
    targets_by_slot: list[tuple[int, ...] | None] | None = None,
    plan: list[SlotPlan] | None = None,
    *,
    start: "_State | None" = None,
    pitch_targets: list[float | None] | None = None,
    repeat_weight: float | None = None,
    cache: dict[str, Any] | None = None,
) -> list[Choice]:
    """Beam search over lane choices; returns the best path's (slot, lanes, long-note lane).
    With a pattern `plan` (planner.py) every slot also pays for leaving its pattern's shape.

    For placing a chart piece by piece (the sectioned engine): `start` continues from the state a
    previous call ended in (`search_state`), `pitch_targets` are the pitch ranks taken over the
    whole chart, `repeat_weight` replaces the bonus for `targets_by_slot` (a large one copies the
    targets wherever the hard rules allow), and `cache` keeps the per-chart setup between calls."""
    choices, _ = search(slots, lanes, params, tempo, rng, targets_by_slot, plan, start=start, pitch_targets=pitch_targets, repeat_weight=repeat_weight, cache=cache)
    return choices


def search(
    slots: list[Slot],
    lanes: list[LaneInfo],
    params: GenParams,
    tempo: TempoMap,
    rng: np.random.Generator,
    targets_by_slot: list[tuple[int, ...] | None] | None = None,
    plan: list[SlotPlan] | None = None,
    *,
    start: "_State | None" = None,
    pitch_targets: list[float | None] | None = None,
    repeat_weight: float | None = None,
    cache: dict[str, Any] | None = None,
) -> tuple[list[Choice], "_State"]:
    """`lane_search` that also returns the state the best path ends in."""
    n_lanes = len(lanes)
    key_lanes = [l.index for l in lanes if l.kind == "key"]
    special_lanes = [l.index for l in lanes if l.kind in ("scratch", "side")]
    targets = pitch_targets if pitch_targets is not None else _pitch_targets(slots)
    shared = cache if cache is not None else {}
    if "weights" not in shared:
        shared["weights"] = _Weights.of(params)
    weights = shared["weights"]
    if repeat_weight is not None:
        weights = dataclasses.replace(weights, repeat=repeat_weight)
    exact = repeat_weight is not None and repeat_weight >= EXACT_COPY_WEIGHT
    repeat_targets = targets_by_slot or [None] * len(slots)
    pos = [l.pos for l in lanes]
    hands = [l.hand for l in lanes]
    # each key's part of the left / right count of a bar (a shared middle key: half to each hand)
    sides = [
        ((1.0 if l.hand == "L" else 0.5 if l.hand == "T" else 0.0), (1.0 if l.hand == "R" else 0.5 if l.hand == "T" else 0.0))
        if l.kind == "key" else (0.0, 0.0)
        for l in lanes
    ]
    bpb = tempo.beats_per_bar
    # a shared middle key can be hit by either thumb, so it may repeat faster (DJMAX 5K "laser")
    min_gap = [params.thumb_jack_ms if l.hand == "T" and params.thumb_jack_ms else params.min_jack_ms for l in lanes]
    # A side note is a bar over its hand's keys: around its head that hand keeps the jack spacing
    # (DPC judges mark notes squeezed against side notes). Key lanes watch their hand's side lanes
    # and side lanes their hand's keys.
    side_watch = [
        [j for j in range(n_lanes) if lanes[j].hand == l.hand and {l.kind, lanes[j].kind} == {"key", "side"}]
        for l in lanes
    ]
    ctx: MotifContext | None = None
    if plan:
        if "ctx" not in shared:
            shared["ctx"] = motif_context(lanes, params.skill, params.instrument_mapping, params.system, params.key_mode)
        ctx = shared["ctx"]
    # lanes a copied slot right after needs: a slot of its own (no reference: a note a later repeat
    # adds) keeps out of them, or the copy would find its lane still inside the jack spacing (a
    # roll's notes keep the hands' turns instead)
    reserved: list[frozenset[int]] = [frozenset()] * len(slots)
    if repeat_weight is not None and any(repeat_targets):
        reach = max(min_gap)
        for si, slot in enumerate(slots):
            if repeat_targets[si] or slot.roll is not None:
                continue
            need: set[int] = set()
            for sj in range(si + 1, len(slots)):
                dt = slots[sj].t - slot.t
                if dt >= reach:
                    break
                if repeat_targets[sj]:
                    need.update(i for i in repeat_targets[sj] if dt < min_gap[i] - 1e-6)  # type: ignore[union-attr]
            reserved[si] = frozenset(need)
    combo_cache: dict[tuple[Any, ...], list[tuple[int, ...]]] = shared.setdefault("combo", {})
    shape_cache: dict[tuple[bool, bool, bool, tuple[int, ...]], float] = shared.setdefault("shape", {})
    keys_cache: dict[tuple[int, ...], tuple[int, ...]] = shared.setdefault("keys", {})
    mean_cache: dict[tuple[int, ...], float] = shared.setdefault("mean", {})
    per_key_cache: dict[tuple[Any, ...], list[float]] = shared.setdefault("perKey", {})
    neg = -1e9
    if start is not None:
        # continue from where the previous piece ended (its path is not part of this one)
        beam = [dataclasses.replace(start, cost=0.0, parent=None, choice=None)]
    else:
        beam = [_State(0.0, (neg,) * n_lanes, (neg,) * n_lanes, (0.0,) * n_lanes, (), None, neg, None, None, head=(neg,) * n_lanes, streak=(0,) * n_lanes)]

    for si, slot in enumerate(slots):
        t = slot.t
        gap = ln_gap_ms(tempo, slot.beat)
        hold_end_t = tempo.beat_to_ms(slot.hold_end_beat) if slot.hold_end_beat is not None else None
        target = targets[si]
        # per-slot terms of the instrument-region cost: (drum share, drum position, bass share)
        src_terms = None
        sp = plan[si] if plan else None
        if weights.source > 0 and slot.sources is not None and not (sp is not None and sp.motif == "alternate"):
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
        pitch_scale = ctx.pitch_weight.get(sp.motif, 1.0) if ctx and sp else 1.0
        repeats = sp is not None and sp.repeats(slot.size - (1 if slot.special else 0))
        laser = sp is not None and sp.motif == "laser"
        sound = sound_of(slot)
        bar = int(slot.beat // bpb + 1e-9)
        # The same-hand and balance rules leave alone what the plan puts on one hand on purpose: a
        # shape that stays on a hand, and a role kept to one hand (rhythm one hand, melody the other).
        split = ctx is not None and sp is not None and one_hand_region(ctx, sp)
        one_hand = split or (sp is not None and sp.motif in ONE_HAND_MOTIFS)
        # (total cost, state, lanes, long-note lane, keys, hist, single_t): states are only built
        # for the candidates that make the beam
        candidates: list[tuple[float, _State, tuple[int, ...], int | None, tuple[int, ...], tuple[tuple[int, ...], ...], float]] = []
        for state in beam:
            free = [
                i for i in range(n_lanes)
                if state.hold_end[i] + gap <= t and t - state.last[i] >= min_gap[i] - 1e-6
                and not (side_watch[i] and any(TIME_EPS < t - state.head[j] < params.min_jack_ms - TIME_EPS for j in side_watch[i]))
            ]
            same_phrase = sp is not None and state.phrase == sp.phrase
            hist = state.hist if same_phrase else ()
            single_t = state.single_t if same_phrase else state.prev_t
            # the previous phrase's last note, when it was a single key, for leaps across phrases
            carry = None
            if ctx is not None and not same_phrase and len(state.prev_lanes) == 1:
                carry = ctx.key_index.get(state.prev_lanes[0])
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
            # A pattern of repeats repeats a sound: a different sound on the same lane is a forced
            # jack (the 5K laser alternates thumbs on the middle key, so it is not one).
            same_sound = state.prev_sound == sound
            planned_repeat = repeats and (same_sound or laser)
            jack_scale = 0.1 if planned_repeat else 1.0
            if not combos:
                combos = [()]
            elif exact and repeat_set is not None:
                # a copy whose lanes are playable here takes them as they are
                hit = [c for c in combos if len(c) == len(repeat_set) and repeat_set.issuperset(c)]
                if params.anchor_cap and len(repeat_set) == 1:
                    # nor is an anchor past the tier's cap (a run the first time a chord broke)
                    over = [c for c in hit if anchor_hits(_next_run(state, c, t)) > params.anchor_cap]
                    if over:
                        combos = [c for c in combos if c not in over] or combos
                        hit = []
                if start is not None and si < weights.jack_free and not planned_repeat and any(_streak_over(state, c, t, weights) for c in hit):
                    # nor, at the start of a piece, a key in more slots in a row than the hand rules
                    # allow: the notes before it are another unit's, not the reference's
                    combos = [c for c in combos if not _streak_over(state, c, t, weights)] or combos
                    hit = []
                if hit:
                    combos = hit
            noise = rng.random(len(combos)) * W_NOISE
            combo_keys: list[tuple[int, ...]] = []
            mcosts: list[float] = []
            if ctx is not None and sp is not None:
                for combo in combos:
                    if combo not in keys_cache:
                        keys_cache[combo] = tuple(sorted(ctx.key_index[i] for i in combo))
                    combo_keys.append(keys_cache[combo])
                mcosts = motif_costs(ctx, sp, hist, combo_keys, t - state.prev_t, holding_hands, t - single_t, carry, shape_cache, per_key_cache)
            costs = _costs(
                state, combos, pos, hands, slot, target, t, weights, mean_use, src_terms, repeat_set, pitch_scale, jack_scale,
                mean_cache, same_sound, params.anchor_cap, sides, bar,
                # a hand holding a long note leaves the notes to the other hand: no run or balance rule then
                hand_rule=not (one_hand or holding_hands), balance_rule=not (split or holding_hands), planned_repeat=planned_repeat,
            )
            if reserved[si]:
                pen = RESERVE_SHARE * weights.repeat
                costs = [c + pen * sum(1 for i in combo if i in reserved[si]) for c, combo in zip(costs, combos)]
            if weights.memory > 0 and sound is not None and not same_sound and state.memory:
                home = next((lane for s, lane in reversed(state.memory) if s == sound), None)
                if home is not None:
                    costs = [c + weights.memory if len(combo) == 1 and combo[0] != home else c for c, combo in zip(costs, combos)]
            scored = []
            for ci, combo in enumerate(combos):
                lanes_used = combo + ((special,) if special is not None else ())
                if not lanes_used:
                    scored.append((W_DROP * slot.size, lanes_used, None, ()))
                    continue
                cost = dropped * W_DROP + costs[ci] + noise[ci]
                keys = ()
                if mcosts:
                    keys = combo_keys[ci]
                    cost += mcosts[ci]
                ln_lane = None
                if hold_end_t is not None and slot.special_hold and special is not None:
                    ln_lane = special
                elif hold_end_t is not None and combo:
                    # a hand may only hold so many long notes at once
                    options = [i for i in combo if holding_hands.get(lanes[i].hand, 0) < params.max_holds_per_hand]
                    if options and sp is not None and sp.motif == "holdTap":
                        # the hold goes to the outside, leaving the other lanes to the melody
                        ln_lane = max(options, key=lambda i: abs(lanes[i].pos - 0.5))
                    elif options:
                        ln_lane = min(options, key=lambda i: abs(lanes[i].pos - (target if target is not None else 0.5)))
                scored.append((cost, lanes_used, ln_lane, keys))
            scored.sort(key=lambda x: x[0])
            for cost, lanes_used, ln_lane, keys in scored[:BEAM_WIDTH]:
                candidates.append((state.cost + cost, state, lanes_used, ln_lane, keys, hist, single_t))
        candidates.sort(key=lambda c: c[0])
        expansions: list[_State] = []
        for total, state, lanes_used, ln_lane, keys, hist, single_t in candidates[:BEAM_WIDTH]:
            last = list(state.last)
            head = list(state.head)
            hold = list(state.hold_end)
            usage = [u * USAGE_DECAY for u in state.usage]
            keys_used = tuple(i for i in lanes_used if lanes[i].kind == "key")
            for i in lanes_used:
                # a long note's lane waits for its tail gap after the release (hold_end), not for the
                # jack spacing: letting go is not a hit (the linter's rule)
                last[i] = t
                head[i] = t
                usage[i] += 1.0
            if ln_lane is not None and hold_end_t is not None:
                hold[ln_lane] = hold_end_t
            close = t - state.prev_t <= weights.jack_span
            streak = [0] * n_lanes
            left, right = state.bar_hands if state.bar == bar else (0.0, 0.0)
            for i in keys_used:
                # (a shared middle key is hit by either thumb in turn: no jack streak, like the laser)
                streak[i] = 0 if hands[i] == "T" else state.streak[i] + 1 if close else 1
                left += sides[i][0]
                right += sides[i][1]
            expansions.append(
                _State(
                    cost=total,
                    last=tuple(last),
                    hold_end=tuple(hold),
                    usage=tuple(usage),
                    prev_lanes=keys_used,
                    prev_pitch=slot.pitch,
                    prev_t=t,
                    parent=state,
                    choice=(si, lanes_used, ln_lane),
                    phrase=sp.phrase if sp else -1,
                    hist=hist + (keys,) if sp else (),
                    single_t=t if sp and len(keys) == 1 else single_t,
                    head=tuple(head),
                    prev_sound=sound,
                    run=_next_run(state, keys_used, t),
                    streak=tuple(streak),
                    bar=bar,
                    bar_hands=(left, right),
                    memory=_remember(state.memory, sound, keys_used, weights.memory_size) if weights.memory > 0 else (),
                )
            )
        beam = expansions or beam

    best = min(beam, key=lambda s: s.cost)
    choices: list[Choice] = []
    node: _State | None = best
    while node is not None and node.choice is not None:
        choices.append(node.choice)
        node = node.parent
    choices.reverse()
    return choices, best


def key_lanes_of(choices: list[Choice], n_slots: int, lanes: list[LaneInfo]) -> list[tuple[int, ...] | None]:
    """Key lanes chosen for every slot (None for slots that got no note)."""
    out: list[tuple[int, ...] | None] = [None] * n_slots
    for si, lanes_used, _ in choices:
        out[si] = tuple(sorted(i for i in lanes_used if lanes[i].kind == "key"))
    return out


def notes_from_choices(
    slots: list[Slot],
    choices: list[Choice],
    tempo: TempoMap,
    lanes: list[LaneInfo] | None = None,
    plan: list[SlotPlan] | None = None,
) -> list[dict[str, Any]]:
    """Notes of the chosen lanes. With `lanes`, the notes of a chord take the instruments sounding
    at the hit (`note_sources`), placed by the role layout of `plan`; without, every note of a slot
    follows its dominant instrument."""
    share = float(load_config("instruments")["keysound"]["chordShare"])
    n_keys = sum(1 for l in lanes if l.kind == "key") if lanes else 0
    notes: list[dict[str, Any]] = []
    for si, lanes_used, ln_lane in choices:
        slot = slots[si]
        stems = None
        if lanes is not None and slot.sources is not None:
            rhythm_left = _rhythm_left(plan[si] if plan else None, n_keys)
            stems = note_sources(slot.sources, lanes_used, ln_lane, lanes, rhythm_left, share)
        for lane in sorted(lanes_used):
            note: dict[str, Any] = {"beat": round(slot.beat, 6), "t": round(slot.t, 3), "lane": lane, "type": "tap"}
            if slot.src is not None:
                note["src"] = STEM_NAMES[stems[lane] if stems else slot.src]
            if lane == ln_lane and slot.hold_end_beat is not None:
                note["type"] = "hold"
                note["endBeat"] = round(slot.hold_end_beat, 6)
                note["endT"] = round(tempo.beat_to_ms(slot.hold_end_beat), 3)
            notes.append(note)
    notes.sort(key=lambda n: (n["t"], n["lane"]))
    return notes


def note_sources(
    sources: np.ndarray,
    lanes_used: tuple[int, ...],
    ln_lane: int | None,
    lanes: list[LaneInfo],
    rhythm_left: bool,
    min_share: float,
) -> dict[int, int]:
    """Instrument (stem index) of every note of one hit. Every instrument sounding at the hit (at
    least `min_share` of it) gets a note of its own where the chord has room, so each note plays a
    sound of the song (DPC: notes are the song's keysounds; notes without one cost points when they
    do not fit the music). A side long note takes the instrument that sustains best, the keys take
    the rest from the rhythm side to the melody side (low instruments on the rhythm side), the
    loudest of them takes any notes left over, and a key long note gets the one that sustains."""
    dominant = int(np.argmax(sources))
    pool = [int(i) for i in np.argsort(-sources, kind="stable") if sources[i] >= min_share] or [dominant]
    out: dict[int, int] = {}
    keys = sorted(i for i in lanes_used if lanes[i].kind == "key")
    for i in lanes_used:
        if lanes[i].kind == "key":
            continue
        if i == ln_lane and len(pool) > 1:
            out[i] = min(pool, key=lambda s: STEM_SUSTAIN[STEM_NAMES[s]])
            pool.remove(out[i])
        else:
            out[i] = dominant
    if not keys:
        return out
    picked = pool[: len(keys)]
    order = sorted(picked, key=lambda s: STEM_POSITION[STEM_NAMES[s]], reverse=not rhythm_left)
    counts = {s: 1 for s in picked}
    counts[picked[0]] += len(keys) - len(picked)
    out.update(zip(keys, [s for s in order for _ in range(counts[s])]))
    if ln_lane in out and len(picked) > 1 and lanes[ln_lane].kind == "key":
        best = min(picked, key=lambda s: STEM_SUSTAIN[STEM_NAMES[s]])
        if out[ln_lane] != best:
            other = min((k for k in keys if out[k] == best), key=lambda k: abs(k - ln_lane))
            out[ln_lane], out[other] = out[other], out[ln_lane]
    return out


def _rhythm_left(sp: SlotPlan | None, n_keys: int) -> bool:
    """Whether the rhythm side of the slot's phrase is on the left (the default without roles)."""
    if sp is None or sp.region is None:
        return True
    lo, hi = sp.region
    mid = (n_keys - 1) / 2
    if (lo + hi) / 2 == mid:
        return True
    left = (lo + hi) / 2 < mid
    return left if sp.layer == "rhythm" else not left


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
    pitch_scale: float = 1.0,
    jack_scale: float = 1.0,
    same_sound: bool = False,
    anchor_cap: int = 0,
) -> float:
    return _costs(state, [combo], pos, hands, slot, target, t, w, mean_use, src_terms, repeat_set, pitch_scale, jack_scale, None, same_sound, anchor_cap)[0]


def _costs(
    state: _State,
    combos: list[tuple[int, ...]],
    pos: list[float],
    hands: list[str],
    slot: Slot,
    target: float | None,
    t: float,
    w: _Weights,
    mean_use: float,
    src_terms: tuple[float, float, float] | None = None,
    repeat_set: frozenset[int] | None = None,
    pitch_scale: float = 1.0,
    jack_scale: float = 1.0,
    mean_cache: dict[tuple[int, ...], float] | None = None,
    same_sound: bool = False,
    anchor_cap: int = 0,
    sides: list[tuple[float, float]] | None = None,
    bar: int = -1,
    hand_rule: bool = True,
    balance_rule: bool = True,
    planned_repeat: bool = False,
) -> list[float]:
    """Musical and ergonomic cost of each combo for one state: pitch and instrument placement,
    contour, hand alternation, jacks, anchors past `anchor_cap` hits (0 = no cap) and lane balance
    (what depends only on the state is done once). The jack style's bonus and a system's
    same-sound bonus (patterns.json "hands") only keep a repeated sound on its lane.

    The hand rules (patterns.json "hands", after BMS-Generator): a fast single past the same-hand
    run limit (with `hand_rule`), a key in more slots in a row than the jack-streak limit (not for
    a `planned_repeat`: a jack, laser or 재봉틀 of the same sound), and notes that push a busy bar out
    of the hands' share band (with `balance_rule`; `sides` gives each lane's left / right part)."""
    dt = t - state.prev_t
    prev = state.prev_lanes
    same_pitch = slot.pitch is not None and state.prev_pitch is not None and abs(slot.pitch - state.prev_pitch) < 0.5
    direction = 0
    if not same_pitch and slot.pitch is not None and state.prev_pitch is not None:
        step = slot.pitch - state.prev_pitch
        direction = (step > 0) - (step < 0)
    alternate = w.alternate * (200 - dt) / 200 if dt < 200 else 0.0
    # A repeated pitch may stay on its lane (same sound, same lane) where the lanes follow the music
    # or the pattern repeats; a shape that moves (a split answers repeated notes with the other hand,
    # a stair walks on) treats it like any other jack.
    keep_pitch = same_pitch and (planned_repeat or pitch_scale >= 1.0)
    # The same sound again soon: with a same-sound bonus (the jack style, GRG) it keeps its lane
    # instead of paying for the jack (BMS: about half the jacks repeat their keysound). A slow
    # repeat (slow_ms or more apart, easy on one key) has its own bonus, jack share and lane-usage
    # weight (BMS: 87% of slow same-keysound repeats keep their lane). A roll keeps its own
    # hand-over-hand plan.
    slow = dt >= w.slow_ms
    bonus = (w.slow_bonus if slow else w.jack_bonus) if dt < w.bonus_ms and same_sound and slot.roll is None else 0.0
    jack = 0.0
    if not keep_pitch and not bonus:
        speed = min(1.0, max(0.0, (400.0 - dt) / 300.0))
        jack = jack_scale * w.jack * (0.6 + speed) * (w.slow_jack if slow else 1.0)
    usage = w.slow_usage if slow else w.usage
    balance = [usage * (u - mean_use) / (mean_use + 1.0) for u in state.usage]
    single_prev = prev[0] if len(prev) == 1 else None
    use_repeat = bool(repeat_set) and w.repeat > 0
    # hand rules: the fast run's hand and its notes in a row, each key's slots in a row, the bar so far
    run_hand, run_len, stair_next = None, 0, None
    if w.same_hand > 0 and hand_rule and state.run and dt <= ANCHOR_MS:
        run_hand, run_len = _hand_run(state.run, hands)
        run = state.run
        if len(run) >= 2 and abs(run[-1] - run[-2]) == 1:
            # a stair (one key at a time, the same way: 1-2-3) may stay on a hand; a trill or a
            # zigzag on one hand pays
            stair_next = 2 * run[-1] - run[-2]
    # keys whose next hit would run past the jack-streak limit, and what that hit costs
    streak_cost: dict[int, float] = {}
    if w.jack_streak > 0 and not planned_repeat and state.streak and dt <= w.jack_span:
        for i, n in enumerate(state.streak):
            if n >= w.jack_free:
                streak_cost[i] = w.jack_streak * (n + 1 - w.jack_free)
    left = right = 0.0
    use_balance = sides is not None and balance_rule and w.balance_bar > 0
    if use_balance:
        left, right = state.bar_hands if state.bar == bar else (0.0, 0.0)
        # nothing to check when no combo (`most` keys at most) can fill the bar or leave the band
        most = max((len(c) for c in combos), default=0)
        busy = left + right + most >= w.balance_min
        use_balance = busy and ((left + most) / (left + right + most) > w.balance_band[1] or left / (left + right + most) < w.balance_band[0])
    out: list[float] = []
    for combo in combos:
        if not combo:
            out.append(0.0)
            continue
        cost = 0.0
        mean_pos = mean_cache.get(combo) if mean_cache is not None else None
        if mean_pos is None:
            total_pos = 0.0
            for i in combo:
                total_pos += pos[i]
            mean_pos = total_pos / len(combo)
            if mean_cache is not None:
                mean_cache[combo] = mean_pos
        if target is not None:
            cost += pitch_scale * w.pitch * (mean_pos - target) ** 2
        if src_terms is not None:
            # drums: kick-heavy hits lean left, hat-heavy hits right; bass leans left
            drum_share, drum_pos, bass_share = src_terms
            cost += w.source * (drum_share * (mean_pos - drum_pos) ** 2 + bass_share * (mean_pos - w.bass_target) ** 2)
        if use_repeat:
            overlap = sum(1 for i in combo if i in repeat_set)  # type: ignore[operator]
            cost -= w.repeat * overlap / max(len(combo), len(repeat_set))  # type: ignore[arg-type]
        if single_prev is not None and len(combo) == 1:
            lane = combo[0]
            if keep_pitch:
                cost += 0.0 if lane == single_prev else W_SAME_PITCH
            elif direction != 0:
                move = pos[lane] - pos[single_prev]
                if ((move > 0) - (move < 0)) != direction:
                    cost += pitch_scale * w.contour
            if alternate and hands[lane] == hands[single_prev]:
                cost += alternate
        repeated = 0
        for i in combo:
            if i in prev:
                repeated += 1
        if repeated:
            if not keep_pitch:
                cost += jack * repeated
            if bonus:
                # up to the jack-streak limit: past it a lane pays its streak cost like any other
                cost -= bonus * sum(1 for i in combo if i in prev and i not in streak_cost)
        if not planned_repeat:
            # (a planned repeat keeps its lane however much it is used: the laser's middle key)
            for i in combo:
                cost += balance[i]
        for i in combo:
            cost += w.key_bias[i]
        if anchor_cap and len(combo) == 1:
            hits = anchor_hits(_next_run(state, combo, t))
            if hits > anchor_cap:
                cost += w.anchor * (hits - anchor_cap)
        if run_hand is not None and len(combo) == 1 and hands[combo[0]] == run_hand and run_len >= w.same_hand_free and combo[0] != stair_next:
            cost += w.same_hand * (run_len + 1 - w.same_hand_free)
        if streak_cost:
            for i in combo:
                cost += streak_cost.get(i, 0.0)
        if use_balance:
            add_l = add_r = 0.0
            for i in combo:
                add_l += sides[i][0]
                add_r += sides[i][1]
            total = left + right + add_l + add_r
            if total >= w.balance_min:
                share = (left + add_l) / total
                if share > w.balance_band[1]:
                    cost += w.balance_bar * add_l  # notes for the hand that already has too many
                elif share < w.balance_band[0]:
                    cost += w.balance_bar * add_r
        out.append(cost)
    return out


def _streak_over(state: _State, combo: tuple[int, ...], t: float, w: _Weights) -> bool:
    """Whether a slot on `combo` hits a key in more slots in a row than the jack-streak limit."""
    if not state.streak or t - state.prev_t > w.jack_span:
        return False
    return any(state.streak[i] >= w.jack_free for i in combo)


def _hand_run(run: tuple[int, ...], hands: list[str]) -> tuple[str | None, int]:
    """The hand of a fast run's last note and how many notes in a row that hand played (a shared
    middle key belongs to either hand, so it ends the count)."""
    hand = hands[run[-1]]
    if hand == "T":
        return None, 0
    count = 0
    for lane in reversed(run):
        if hands[lane] != hand:
            break
        count += 1
    return hand, count


RUN_MEMORY = 20  # notes of a fast run kept for the anchor count (longer than any anchor cap)


def _next_run(state: _State, keys: tuple[int, ...], t: float) -> tuple[int, ...]:
    """The fast run of single notes after a slot on `keys` (a chord or a slow note starts over)."""
    if len(keys) != 1:
        return ()
    if state.run and len(state.prev_lanes) == 1 and t - state.prev_t <= ANCHOR_MS:
        return (state.run + keys)[-RUN_MEMORY:]
    return keys


def anchor_hits(run: tuple[int, ...]) -> int:
    """Hits of the anchor the run's last note plays (축연타): its lane on every other note back while
    the notes between keep moving (two between notes in a row on one lane make a trill, or two
    trills sharing a lane, not an anchor)."""
    if len(run) < 3:
        return 0
    lane = run[-1]
    hits, last_between = 1, None
    k = len(run) - 3
    while k >= 0 and run[k] == lane and run[k + 1] != lane and run[k + 1] != last_between:
        hits += 1
        last_between = run[k + 1]
        k -= 2
    return hits
