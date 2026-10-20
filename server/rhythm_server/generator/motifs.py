"""Pattern costs for the lane search: what each planned shape and chord texture expects from the next
notes, plus the hand and finger costs of the pattern engine (docs/PATTERN_DESIGN.md). Lanes here are
key indices (0 = leftmost key lane); scratch and side lanes are not part of patterns."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np

from ..config import load_config

FAST_MS = 260.0  # moves closer than this get the ergonomic costs (same threshold as the profile)
WEAK_FINGER_PAIRS = ({2, 3}, {3, 4})  # middle-ring, ring-pinky


@lru_cache(maxsize=None)
def pattern_config() -> dict[str, Any]:
    return load_config("patterns")


@dataclass(frozen=True)
class SlotPlan:
    """What the planner wants from one slot."""

    phrase: int  # phrase index; the lane search keeps a history of the current phrase
    k: int  # position in the phrase
    motif: str  # shape of the phrase's single notes (step, stair, roll, trill, ...)
    chords: str  # how its chords relate: "vary", "stair" (moving together), "jack" (repeated), "pivot" (5K)
    hold_tap: bool  # the phrase holds long notes: the other hand plays on
    direction: int  # +1 = toward the right, -1 = toward the left (from the pitch contour)
    step: int  # this note's pitch went up (+1), down (-1) or nowhere known (0) from the last one
    pedal: bool  # in an anchor pattern: this slot plays the pedal note that stays on its lane
    window: tuple[int, int] | None  # key indices the phrase stays in (easy charts)
    cell_ref: int | None  # earlier position in the phrase with the same sound: same lanes
    mirror_ref: int | None  # position this slot answers in a call and response: mirrored lanes
    wide: bool  # an accent with strong lows and highs: a wide chord
    region: tuple[int, int] | None = None  # key indices of this slot's role (rhythm / melody hand)
    home: int | None = None  # the key this drum sound keeps across the section (or the song)
    # with rhythm and melody in one phrase: this slot's role, and the earlier positions of that role
    # (the shape follows the melody's own notes; drums keep their homes)
    layer: str = "melody"
    same_layer: tuple[int, ...] | None = None
    roll: tuple[int, int, int] | None = None  # a drum roll's note: (hit index, hits, roll), motif "alternate"
    roll_spread: bool = False  # the roll is too fast for a key every other note: two keys per hand
    roll_mirrored: bool = False  # the roll is in a repeat played mirrored: it starts on the right
    palette: tuple[int, ...] | None = None  # keys the phrase keeps to (the others pay weights.palette)

    def repeats(self, size: int) -> bool:
        """Whether the pattern wants the same lanes again (jacks are its point)."""
        return self.motif in ("jack", "laser", "doubles") if size == 1 else self.chords == "jack"


@dataclass(frozen=True)
class MotifContext:
    key_index: dict[int, int]  # lane -> key index
    hand: tuple[str, ...]
    finger: tuple[int, ...]
    strength: tuple[float, ...]
    mirror: tuple[int, ...]
    center: int | None  # the shared middle key (5K, 7K+1S), else None
    skill: float
    weights: dict[str, float]
    pitch_weight: dict[str, float]
    weak_trill_skill: float
    readability_ms: float
    home_scale: float  # how firmly drum sounds keep their home keys ("instrument lanes" strength included)
    fan_skill: float = 0.6  # from this skill a roll fans out to the outermost keys (rolls.fanSkill)
    adjacent: float = 0.0  # per pair of neighbouring keys of one hand in a chord (hands.adjacentChord, by skill)
    stretch_span: int = 2  # keys apart within one hand from which a chord is a stretch (hands.stretchSpan)
    asymmetric: float = 0.4  # a two-note chord neither symmetric nor on neighbouring keys (hands.asymmetricChord)
    # a role kept to one hand pays for neighbouring keys too when the hand has a key between (1+3)
    one_hand_gaps: bool = False
    # a single note at least slow_ms after the phrase's last one pays this share of a split's
    # motif cost (a slow repeated note is easy on one key; the other hand answers fast ones)
    slow_ms: float = 260.0
    slow_split: float = 1.0


def motif_context(lanes: list[Any], skill: float, instrument_mapping: float = 0.6, system: str = "GRG", key_mode: str | None = None) -> MotifContext:
    cfg = pattern_config()
    keys = [lane for lane in lanes if lane.kind == "key"]
    strength = cfg["finger"]["strength"]
    n = len(keys)
    hands = {**cfg["hands"], **cfg["hands"]["systems"].get(system, {})}
    hand = tuple(lane.hand for lane in keys)
    return MotifContext(
        key_index={lane.index: k for k, lane in enumerate(keys)},
        hand=hand,
        finger=tuple(lane.finger for lane in keys),
        strength=tuple(float(strength.get(str(lane.finger), 1.0)) for lane in keys),
        mirror=tuple(n - 1 - k for k in range(n)),
        center=next((k for k, lane in enumerate(keys) if lane.hand == "T"), None),
        skill=skill,
        # leaps (hands.leapScale, a number or one per key mode): BMS charts leap three keys or
        # more far more often than the readability weights allow (docs/PATTERN_DESIGN.md 22)
        weights={k: float(v) * (by_key_mode(hands["leapScale"], key_mode) if k in ("leap", "sameHandLeap") else 1.0) for k, v in cfg["weights"].items()},
        pitch_weight={**{name: float(m.get("pitchWeight", 1.0)) for name, m in cfg["motifs"].items()}, "alternate": float(cfg["rolls"]["pitchWeight"])},
        weak_trill_skill=float(cfg["finger"]["weakTrillSkill"]),
        readability_ms=float(cfg["readability"]["ms"]),
        # song-home systems (EZ2ON) keep every drum on its key whatever the level; the others less
        # so as charts get harder
        home_scale=instrument_mapping
        * (float(cfg["roles"]["songHomeWeight"]) if system in cfg["roles"]["songHomes"] else 1.0 - 0.5 * skill),
        fan_skill=float(cfg["rolls"]["fanSkill"]),
        adjacent=by_skill(hands["adjacentChord"], skill),
        stretch_span=int(hands["stretchSpan"]),
        asymmetric=float(hands["asymmetricChord"]),
        one_hand_gaps=bool(hands["oneHandGaps"]) and min(hand.count("L"), hand.count("R")) >= 3,
        slow_ms=float(hands["slowRepeatMs"]),
        slow_split=float(hands["slowSplitScale"]),
    )


def by_skill(value: Any, skill: float) -> float:
    """A number, or [skill, value] pairs read off at the chart's skill (straight lines between)."""
    if isinstance(value, list):
        points = sorted((float(a), float(b)) for a, b in value)
        return float(np.interp(skill, [a for a, _ in points], [b for _, b in points]))
    return float(value)


def by_key_mode(value: Any, key_mode: str | None) -> float:
    """A number, or {key mode: number} with "*" for the key modes it leaves out (else 1)."""
    if isinstance(value, dict):
        return float(value.get(key_mode, value.get("*", 1.0))) if key_mode else float(value.get("*", 1.0))
    return float(value)


def _mismatch(keys: tuple[int, ...], want: tuple[int, ...]) -> float:
    """0 when the lanes are the expected ones, 0.5 per lane off by one, 1 per lane further away."""
    if keys == want:
        return 0.0
    if len(keys) != len(want):
        return 1.0
    total = 0.0
    for a, b in zip(sorted(keys), sorted(want)):
        d = abs(a - b)
        total += 0.0 if d == 0 else (0.5 if d == 1 else 1.0)
    return total / len(keys)


def one_hand_region(ctx: MotifContext, sp: SlotPlan) -> bool:
    """Whether the slot's role is kept to one hand's keys (the hand split: rhythm one hand, melody
    the other)."""
    if sp.region is None:
        return False
    return len({ctx.hand[k] for k in range(sp.region[0], sp.region[1] + 1)} - {"T"}) == 1


def _bounds(ctx: MotifContext, sp: SlotPlan) -> tuple[int, int]:
    """Keys a shape may use: the phrase's window and this slot's role region."""
    lo, hi = sp.window if sp.window is not None else (0, len(ctx.hand) - 1)
    if sp.region is not None and max(lo, sp.region[0]) <= min(hi, sp.region[1]):
        lo, hi = max(lo, sp.region[0]), min(hi, sp.region[1])
    return lo, hi


def _step(ctx: MotifContext, sp: SlotPlan, prev: int, d: int, wrap: bool) -> int:
    """`prev` moved by `d`, turned back (or wrapped for rolls) at the edge of the phrase's lanes."""
    lo, hi = _bounds(ctx, sp)
    nxt = prev + d
    if lo <= nxt <= hi:
        return nxt
    if wrap:
        return lo if d > 0 else hi
    back = prev - d
    return back if lo <= back <= hi else prev


def alternate_key(ctx: MotifContext, roll: tuple[int, int, int], spread: bool = False, mirrored: bool = False, prev: int | None = None) -> int | None:
    """Key of a drum roll's note (좌우 연타): the hands take turns, from the middle keys outward as
    the roll goes on (easy charts stay nearer the middle). A roll starts on the left (the right in
    a repeat played mirrored), so a repeat of the build-up plays it the same way; after that each
    note takes the other hand from the roll's previous note `prev` (a key), so a note a held note
    pushed aside does not leave two in a row on one hand. A roll too fast for one key every other
    note (`spread`: the jack spacing) turns between two keys of each hand (2-3-1-4). None on a key
    mode without two hands of keys."""
    pos, hits, _ = roll
    left = [k for k, h in enumerate(ctx.hand) if h == "L"][::-1]  # inner key first
    right = [k for k, h in enumerate(ctx.hand) if h == "R"]
    levels = min(len(left), len(right))
    if levels == 0:
        return None
    width = 2 if spread and levels >= 2 else 1
    reach = 1 + int(round((levels - width) * min(1.0, ctx.skill / ctx.fan_skill)))
    level = min(reach - 1, pos * reach // max(1, hits)) + (pos // 2) % width
    if prev is not None and pos > 0 and ctx.hand[prev] in ("L", "R"):
        on_left = ctx.hand[prev] == "R"
    else:
        on_left = (pos % 2 == 0) != mirrored
    return left[level] if on_left else right[level]


def expected_keys(ctx: MotifContext, sp: SlotPlan, hist: list[tuple[int, ...]], size: int, carry: int | None = None) -> tuple[int, ...] | None:
    """Lanes the slot's pattern asks for, or None when it leaves them to the music. Shapes follow
    the phrase's single notes (chords in between do not break a stair); chord textures follow its
    chords. `carry` is the previous phrase's last single note (a roll goes on across bar lines)."""
    if size >= 2:
        chords = [h for h in hist if len(h) >= 2]
        prev_chord = chords[-1] if chords and len(chords[-1]) == size else None
        if sp.chords == "pivot" and ctx.center is not None and size == 2:
            # 5B: two-note chords swing around the middle key, 1+3 then 3+5 (both thumbs move)
            c = ctx.center
            if prev_chord is not None and c in prev_chord:
                other = prev_chord[0] if prev_chord[1] == c else prev_chord[1]
                return tuple(sorted((c, ctx.mirror[other])))
            return (max(0, c - 2), c)
        if prev_chord is None or sp.chords in ("vary", "pivot"):
            return None
        if sp.chords == "jack":
            return prev_chord
        lo, hi = _bounds(ctx, sp)
        d = sp.direction if lo <= min(prev_chord) + sp.direction and max(prev_chord) + sp.direction <= hi else -sp.direction
        moved = tuple(x + d for x in prev_chord)
        return moved if lo <= min(moved) and max(moved) <= hi else None
    if sp.same_layer is not None:
        if sp.layer == "rhythm":
            return None  # drums under a melody keep their homes
        singles = [hist[j][0] for j in sp.same_layer if j < len(hist) and len(hist[j]) == 1]
    else:
        singles = [h[0] for h in hist if len(h) == 1]
    m = sp.motif
    if m == "laser" and ctx.center is not None:
        return (ctx.center,)
    if m == "alternate" and sp.roll is not None:
        key = alternate_key(ctx, sp.roll, sp.roll_spread, sp.roll_mirrored, singles[-1] if singles else carry)
        return None if key is None else (key,)
    if not singles:
        return None
    prev = singles[-1]
    if m in ("stair", "roll"):
        # the melody decides where a stair goes; without a pitch it keeps its last direction
        d = sp.step or (singles[-1] - singles[-2] if len(singles) >= 2 and abs(singles[-1] - singles[-2]) == 1 else sp.direction)
        return (_step(ctx, sp, prev, d, wrap=m == "roll"),)
    if m == "trill":
        if len(singles) >= 2 and singles[-2] != prev:
            return (singles[-2],)
        return (_step(ctx, sp, prev, sp.direction, wrap=False),)
    if m == "split":
        if len(singles) >= 2 and singles[-2] != prev and ctx.hand[singles[-2]] != ctx.hand[prev]:
            return (singles[-2],)
        partner = ctx.mirror[prev]
        # the middle key mirrors onto itself: answer it from a neighbouring key instead
        return (partner if partner != prev else _step(ctx, sp, prev, sp.direction, wrap=False),)
    if m == "jack":
        return (prev,)
    if m == "doubles":
        # 재봉틀: two hits on a key, then two on the other hand's key (RR LL)
        if len(singles) >= 2 and singles[-2] == prev:
            partner = ctx.mirror[prev]
            return (partner if ctx.hand[partner] != ctx.hand[prev] else _step(ctx, sp, prev, sp.direction, wrap=False),)
        return (prev,)
    if m == "anchor":
        # the pedal notes share a lane (same sound, same lane); the other notes walk around it
        if sp.pedal:
            return None
        anchor = singles[-1]
        others = [x for x in singles if x != anchor]
        start = others[-1] if others else anchor
        d = sp.step or sp.direction
        nxt = _step(ctx, sp, start, d, wrap=True)
        return (nxt if nxt != anchor else _step(ctx, sp, nxt, d, wrap=True),)
    if m == "brokenStair":
        d = sp.direction
        return (_step(ctx, sp, prev, 2 * d if len(singles) % 2 == 1 else -d, wrap=False),)
    return None


def _shape_cost(ctx: MotifContext, sp: SlotPlan, keys: tuple[int, ...]) -> float:
    w = ctx.weights
    n = len(ctx.hand)
    cost = 0.0
    pairs = [(a, b) for i, a in enumerate(keys) for b in keys[i + 1 :]]
    if any(ctx.hand[a] == ctx.hand[b] != "T" and abs(a - b) >= ctx.stretch_span for a, b in pairs):
        cost += w["stretch"] * (1.0 - ctx.skill)  # one hand spread wide
    if ctx.one_hand_gaps or not one_hand_region(ctx, sp):
        # chord mates on neighbouring keys of one hand (BMS-Generator keeps them two keys apart);
        # a role kept to a two-key hand plays its chords there, where neighbouring keys are the only
        # shape (human BMS charts play 1+3 rather than 1+2 even with one hand)
        cost += ctx.adjacent * sum(1 for a, b in pairs if b - a == 1 and ctx.hand[a] == ctx.hand[b] != "T")
    if len(keys) == 2:
        a, b = keys
        span = b - a
        symmetric = a + b == n - 1
        if sp.chords == "pivot" and ctx.center in keys:
            return cost  # the 5B pivot is lopsided on purpose
        if sp.wide:
            cost += w["shape"] * (0.0 if span >= n / 2 else 0.6)
        elif span > n / 2 and not symmetric:
            cost += w["shape"] * 0.4  # a narrow sound on a wide, lopsided chord
        if not symmetric and span != 1:
            cost += ctx.asymmetric * (1.0 - 0.6 * ctx.skill)
    return cost


def _move_cost(ctx: MotifContext, singles: list[int], k: int, dt: float) -> float:
    """Leaps and weak-finger trills from the previous single note. Easy charts pay for leaps at
    any speed (reading), every chart pays more the faster the move (hands)."""
    w = ctx.weights
    prev_k = singles[-1]
    d = abs(k - prev_k)
    speed = max(0.0, (FAST_MS - dt) / FAST_MS)
    reading = max(0.0, (ctx.readability_ms - dt) / ctx.readability_ms) * (1.0 - ctx.skill) ** 2
    cost = 0.0
    if d >= 2 and ctx.hand[k] == ctx.hand[prev_k]:
        cost += w["sameHandLeap"] * (d - 1) * ((1.0 - ctx.skill) * speed + reading)
    if d >= 3:
        cost += w["leap"] * (d - 2) * ((1.0 - ctx.skill) ** 2 * speed + reading)
    if (
        ctx.skill < ctx.weak_trill_skill
        and dt < FAST_MS
        and len(singles) >= 2
        and singles[-2] == k
        and k != prev_k
        and ctx.hand[k] == ctx.hand[prev_k]
        and {ctx.finger[k], ctx.finger[prev_k]} in WEAK_FINGER_PAIRS
    ):
        cost += w["weakTrill"]
    return cost


def _per_key_costs(ctx: MotifContext, sp: SlotPlan, fast: bool, held: tuple[str, ...]) -> list[float]:
    """Per key: outside the phrase's window or the role's region, a weak finger on a fast note, the
    held hand in a hold+tap phrase."""
    w = ctx.weights
    finger_w = w["finger"] * (1.0 - 0.5 * ctx.skill)
    out = []
    for k in range(len(ctx.hand)):
        c = 0.0
        if sp.window is not None:
            c += w["window"] * max(0, sp.window[0] - k, k - sp.window[1])
        if sp.region is not None:
            c += w["region"] * max(0, sp.region[0] - k, k - sp.region[1])
        if fast:
            c += finger_w * (1.0 - ctx.strength[k])
        if ctx.hand[k] in held:
            c += w["holdHand"]
        if sp.palette is not None and k not in sp.palette:
            c += w["palette"]
        out.append(c)
    return out


def motif_cost(
    ctx: MotifContext,
    sp: SlotPlan,
    hist: list[tuple[int, ...]],
    keys: tuple[int, ...],
    dt: float,
    holding_hands: dict[str, int],
    single_dt: float,
    carry: int | None = None,
) -> float:
    """Cost of putting a slot's key notes on `keys` given its plan and the phrase so far.
    `dt` is the time since the previous slot, `single_dt` since the phrase's previous single note;
    `carry` is the previous phrase's last single note when this phrase has none yet (leaps across
    phrase boundaries are read the same way)."""
    return motif_costs(ctx, sp, hist, [keys], dt, holding_hands, single_dt, carry)[0]


def motif_costs(
    ctx: MotifContext,
    sp: SlotPlan,
    hist: list[tuple[int, ...]] | tuple[tuple[int, ...], ...],
    key_sets: list[tuple[int, ...]],
    dt: float,
    holding_hands: dict[str, int],
    single_dt: float,
    carry: int | None = None,
    shape_cache: dict[tuple[bool, bool, bool, tuple[int, ...]], float] | None = None,
    key_cache: dict[tuple[Any, ...], list[float]] | None = None,
) -> list[float]:
    """`motif_cost` of several key sets for one slot and one history: what depends only on the
    history (expected lanes, the previous notes, per-key costs) is worked out once. The caches
    keep shape costs and per-key costs across calls of one search."""
    w = ctx.weights
    fast = dt < FAST_MS
    held = tuple(sorted(h for h, c in holding_hands.items() if c)) if sp.hold_tap and holding_hands else ()
    cache_key = (sp.window, sp.region, fast, held, sp.palette)
    per_key = key_cache.get(cache_key) if key_cache is not None else None
    if per_key is None:
        per_key = _per_key_costs(ctx, sp, fast, held)
        if key_cache is not None:
            key_cache[cache_key] = per_key
    ref: tuple[int, ...] | None = None
    ref_w = 0.0
    if sp.cell_ref is not None and sp.cell_ref < len(hist) and hist[sp.cell_ref]:
        ref, ref_w = hist[sp.cell_ref], w["cell"] * (1.0 - 0.3 * ctx.skill)
    elif sp.mirror_ref is not None and sp.mirror_ref < len(hist) and hist[sp.mirror_ref]:
        ref, ref_w = tuple(sorted(ctx.mirror[k] for k in hist[sp.mirror_ref])), w["cell"]
    wants: dict[int, tuple[int, ...] | None] = {}
    chords = [h for h in hist if len(h) >= 2]
    last_chord = chords[-1] if chords else None
    singles = [h[0] for h in hist if len(h) == 1]
    if not singles and carry is not None:
        singles = [carry]
    moves: dict[int, float] = {}
    home_w = w["home"] * ctx.home_scale
    shape_key = (sp.wide, sp.chords == "pivot", one_hand_region(ctx, sp))
    out: list[float] = []
    for keys in key_sets:
        if not keys:
            out.append(0.0)
            continue
        cost = 0.0
        for k in keys:
            cost += per_key[k]
        size = len(keys)
        if sp.home is not None and size == 1:
            cost += home_w * _mismatch(keys, (sp.home,))
        if ref is not None:
            cost += ref_w * _mismatch(keys, ref)
        else:
            if size not in wants:
                wants[size] = expected_keys(ctx, sp, list(hist), size, carry)
            want = wants[size]
            if want is not None:
                if sp.motif == "alternate":
                    # a roll goes hand over hand: the other hand's neighbouring key is as wrong as any
                    same_hand = size == 1 and len(want) == 1 and ctx.hand[keys[0]] == ctx.hand[want[0]]
                    cost += w["alternate"] * (0.0 if keys == want else 0.5 if same_hand else 1.0)
                else:
                    scale = ctx.slow_split if sp.motif == "split" and single_dt >= ctx.slow_ms else 1.0
                    cost += w["motif"] * scale * _mismatch(keys, want)
        if size >= 2:
            if shape_cache is None:
                cost += _shape_cost(ctx, sp, keys)
            else:
                key = shape_key + (keys,)
                if key not in shape_cache:
                    shape_cache[key] = _shape_cost(ctx, sp, keys)
                cost += shape_cache[key]
            if sp.chords == "vary" and last_chord == keys:
                cost += w["chordRepeat"]
        elif singles:
            k = keys[0]
            if k not in moves:
                moves[k] = _move_cost(ctx, singles, k, single_dt)
            cost += moves[k]
        out.append(cost)
    return out
