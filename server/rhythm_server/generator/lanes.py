"""Lane assignment: beam search over a finger model with musical and ergonomic costs."""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Any

import numpy as np

from ..analysis.stems import STEM_NAMES
from ..config import difficulty_config, key_modes, load_config
from .motifs import MotifContext, SlotPlan, motif_context, motif_costs
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
TIME_EPS = 1e-3
# Chord notes over several instruments, left to right when the rhythm side is on the left (low
# instruments first), and the instruments a long note prefers (the ones that sustain).
STEM_POSITION = {"bass": 0, "drums": 1, "other": 2, "vocals": 3}
STEM_SUSTAIN = {"vocals": 0, "other": 1, "bass": 2, "drums": 3}


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
    phrase: int = -1  # phrase of the pattern plan the history belongs to
    hist: tuple[tuple[int, ...], ...] = ()  # key indices chosen for the earlier slots of the phrase
    single_t: float = -1e9  # time of the phrase's latest single note
    head: tuple[float, ...] = ()  # latest press per lane (the head of a long note, unlike `last`)


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
) -> list[Choice]:
    """Beam search over lane choices; returns the best path's (slot, lanes, long-note lane).
    With a pattern `plan` (planner.py) every slot also pays for leaving its pattern's shape."""
    n_lanes = len(lanes)
    key_lanes = [l.index for l in lanes if l.kind == "key"]
    special_lanes = [l.index for l in lanes if l.kind in ("scratch", "side")]
    targets = _pitch_targets(slots)
    weights = _Weights.of(params)
    repeat_targets = targets_by_slot or [None] * len(slots)
    pos = [l.pos for l in lanes]
    hands = [l.hand for l in lanes]
    # a shared middle key can be hit by either thumb, so it may repeat faster (DJMAX 5K "laser")
    min_gap = [params.thumb_jack_ms if l.hand == "T" and params.thumb_jack_ms else params.min_jack_ms for l in lanes]
    # A side note is a bar over its hand's keys: around its head that hand keeps the jack spacing
    # (DPC judges mark notes squeezed against side notes). Key lanes watch their hand's side lanes
    # and side lanes their hand's keys.
    side_watch = [
        [j for j in range(n_lanes) if lanes[j].hand == l.hand and {l.kind, lanes[j].kind} == {"key", "side"}]
        for l in lanes
    ]
    ctx: MotifContext | None = motif_context(lanes, params.skill, params.instrument_mapping, params.system) if plan else None
    combo_cache: dict[tuple[Any, ...], list[tuple[int, ...]]] = {}
    shape_cache: dict[tuple[bool, tuple[int, ...]], float] = {}
    keys_cache: dict[tuple[int, ...], tuple[int, ...]] = {}
    mean_cache: dict[tuple[int, ...], float] = {}
    per_key_cache: dict[tuple[Any, ...], list[float]] = {}
    neg = -1e9
    beam = [_State(0.0, (neg,) * n_lanes, (neg,) * n_lanes, (0.0,) * n_lanes, (), None, neg, None, None, head=(neg,) * n_lanes)]

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
        sp = plan[si] if plan else None
        pitch_scale = ctx.pitch_weight.get(sp.motif, 1.0) if ctx and sp else 1.0
        jack_scale = 0.1 if sp and sp.repeats(slot.size - (1 if slot.special else 0)) else 1.0
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
            if not combos:
                combos = [()]
            noise = rng.random(len(combos)) * W_NOISE
            combo_keys: list[tuple[int, ...]] = []
            mcosts: list[float] = []
            if ctx is not None and sp is not None:
                for combo in combos:
                    if combo not in keys_cache:
                        keys_cache[combo] = tuple(sorted(ctx.key_index[i] for i in combo))
                    combo_keys.append(keys_cache[combo])
                mcosts = motif_costs(ctx, sp, hist, combo_keys, t - state.prev_t, holding_hands, t - single_t, carry, shape_cache, per_key_cache)
            costs = _costs(state, combos, pos, hands, slot, target, t, weights, mean_use, src_terms, repeat_set, pitch_scale, jack_scale, mean_cache)
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
            for i in lanes_used:
                last[i] = t if i != ln_lane else (hold_end_t or t)
                head[i] = t
                usage[i] += 1.0
            if ln_lane is not None and hold_end_t is not None:
                hold[ln_lane] = hold_end_t
            expansions.append(
                _State(
                    cost=total,
                    last=tuple(last),
                    hold_end=tuple(hold),
                    usage=tuple(usage),
                    prev_lanes=tuple(i for i in lanes_used if lanes[i].kind == "key"),
                    prev_pitch=slot.pitch,
                    prev_t=t,
                    parent=state,
                    choice=(si, lanes_used, ln_lane),
                    phrase=sp.phrase if sp else -1,
                    hist=hist + (keys,) if sp else (),
                    single_t=t if sp and len(keys) == 1 else single_t,
                    head=tuple(head),
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
    return choices


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
) -> float:
    return _costs(state, [combo], pos, hands, slot, target, t, w, mean_use, src_terms, repeat_set, pitch_scale, jack_scale)[0]


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
) -> list[float]:
    """Musical and ergonomic cost of each combo for one state: pitch and instrument placement,
    contour, hand alternation, jacks and lane balance (what depends only on the state is done once)."""
    dt = t - state.prev_t
    prev = state.prev_lanes
    same_pitch = slot.pitch is not None and state.prev_pitch is not None and abs(slot.pitch - state.prev_pitch) < 0.5
    direction = 0
    if not same_pitch and slot.pitch is not None and state.prev_pitch is not None:
        step = slot.pitch - state.prev_pitch
        direction = (step > 0) - (step < 0)
    alternate = w.alternate * (200 - dt) / 200 if dt < 200 else 0.0
    jack = 0.0
    if not same_pitch:
        speed = min(1.0, max(0.0, (400.0 - dt) / 300.0))
        jack = jack_scale * w.jack * (0.6 + speed)
    bonus = w.jack_bonus if dt < 400.0 else 0.0
    balance = [W_BALANCE * (u - mean_use) / (mean_use + 1.0) for u in state.usage]
    single_prev = prev[0] if len(prev) == 1 else None
    use_repeat = bool(repeat_set) and w.repeat > 0
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
            if same_pitch:
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
            if not same_pitch:
                cost += jack * repeated
            if dt < 400.0:
                cost -= bonus * repeated  # jack style: repeats stay on their lane
        for i in combo:
            cost += balance[i]
        out.append(cost)
    return out
