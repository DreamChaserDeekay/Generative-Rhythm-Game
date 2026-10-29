"""Density control: pick which candidates become notes, then chords, long notes and special
(scratch / side) notes."""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass
from functools import cached_property
from typing import Any

import numpy as np

from ..analysis.stems import STEM_NAMES
from ..config import difficulty_config, key_modes, load_config
from .candidates import Candidate, grid_of, pad_like
from .params import SIDE_HOLD_SHARE, GenParams, skill_for_rating
from .rolls import coarser, mark_rolls, roll_level
from .tempo import TempoMap

DRUMS = STEM_NAMES.index("drums")
VOCALS = STEM_NAMES.index("vocals")
OTHER = STEM_NAMES.index("other")
MAX_GAP_S = 4.0  # silences longer than this do not count toward the target density
BUCKET_MS = 100.0
MAX_LN_BEATS = 8.0
MAX_CHORD_RATIO = 0.6
# Easy charts (levels 1-3 of the skill scale, under NORMAL) put chords on downbeats only; up to its
# level 6 (NORMAL) long notes end on beats or half beats, harder ones on quarter beats too when
# nothing coarser fits the sound.
DOWNBEAT_CHORDS_BELOW = 3.0 / 14.0
HALF_BEAT_HOLDS_BELOW = 6.0 / 14.0
# A long note lets go on the song's grid, not a fixed length after its head (an off-beat head
# would end off the beat too): the last grid point (whole beats first) at or before the sound's
# end plus HOLD_END_TOLERANCE beats (a held note fades a little before the next one starts: the
# release goes to that next beat), at most HOLD_END_SLACK of a grid step's worth of beats before
# the sound's end.
HOLD_END_TOLERANCE = 0.25
HOLD_END_SLACK = {1.0: 0.5, 0.5: 0.25, 0.25: 0.25}
HOLD_PLAIN = 0.6  # long-note weight of a sound that is no melody note (a clear melody note: 1.4)


@dataclass
class Slot:
    beat: float
    t: float
    size: int  # total notes at this instant (including the special note)
    hold_end_beat: float | None  # one note of the slot is a long note ending here
    special: str | None  # "scratch" or "side": one note goes to a special lane
    special_hold: bool  # the special note (not a key) carries the long note
    pitch: float | None
    bands: np.ndarray
    score: float
    subdivision: int
    strength: float
    sources: np.ndarray | None = None  # stem shares (drums, bass, vocals, other)
    roll: tuple[int, int, int] | None = None  # a drum roll's note: (roll, hit index, hits)
    sound_group: int | None = None  # the analysis's same-sound group (onsets alike in their attack spectrum)
    hold_count: int = 1  # long notes the slot holds: more than one over a held chord (holds.pad countMax)
    jack_scale: float = 1.0  # the section plan's scale of the same-lane cost here (plan.py)

    @cached_property
    def src(self) -> int | None:
        """Dominant stem index, or None without stem analysis (a slot's stem shares do not change
        once it is made: the lane search asks for it many times per slot)."""
        return int(np.argmax(self.sources)) if self.sources is not None else None


def melodic(slot: Slot) -> bool:
    """A slot whose pitch belongs to its sound (not a drum hit that inherits a melody pitch)."""
    if slot.pitch is None:
        return False
    return slot.sources is None or slot.src != DRUMS


def sound_of(slot: Slot) -> tuple[Any, ...]:
    """What makes two slots "the same sound": stem and pitch, or stem and loudest band."""
    if melodic(slot):
        return (slot.src, round(float(slot.pitch)))  # type: ignore[arg-type]
    return (slot.src, int(np.argmax(slot.bands)))


def home_of(slot: Slot) -> int | None:
    """The sound memory's key: the analysis's same-sound group (analyzer 1.8.0; None before). The
    planner's sound (stem and pitch) is too loose a key: keeping it on a lane cost lane patterns
    more than it gained sound homes (docs/PATTERN_DESIGN.md 46)."""
    return slot.sound_group


def hold_end(start: float, sustain: float, min_beats: float, skill: float) -> float | None:
    """Beat where a long note over a sound held `sustain` beats from `start` lets go (see
    HOLD_END_SLACK), or None when no grid point leaves it `min_beats` long."""
    if sustain < min_beats - 1e-9:
        return None
    end = start + min(MAX_LN_BEATS, sustain)
    steps = (1.0, 0.5, 0.25) if skill >= HALF_BEAT_HOLDS_BELOW else (1.0, 0.5)
    for step in steps:
        e = math.floor((end + HOLD_END_TOLERANCE) / step + 1e-9) * step
        if e - start >= min_beats - 1e-9 and end - e <= HOLD_END_SLACK[step] + 1e-9:
            return float(e)
    return None


def hold_value(c: Candidate, tempo: TempoMap | None = None) -> float:
    """How much a sound wants a long note: how long it sounds, how tonal it is, and most of all
    whether it is a note of the melody (a long sung note rather than a kick over a pad); with a
    ranking hold model (holds.model.rank), times how likely the sound really lasts; a pad times
    holds.pad valueBoost."""
    value = c.sustain_beats * (0.5 + c.harmonic) * (1.2 if c.pitch is not None else 1.0) * (HOLD_PLAIN + (1.0 - HOLD_PLAIN) * 2.0 * (c.melody or 0.0))
    if pad_like(c):
        value *= float(difficulty_config()["holds"]["pad"]["valueBoost"])
    model = difficulty_config()["holds"].get("model")
    if tempo is not None and model and model.get("rank"):
        value *= hold_probability(c, tempo, model)
    return value


def hold_probability(c: Candidate, tempo: TempoMap, model: dict[str, Any]) -> float:
    """How likely the sound under a candidate really lasts 350 ms or more: a logistic model over
    what the analysis says (difficulty.json holds.model, fitted on BMS keysound lengths)."""
    src = c.sources if c.sources is not None else np.full(len(STEM_NAMES), 1.0 / len(STEM_NAMES))
    x = (
        min(4.0, c.sustain_beats * tempo.beat_ms(c.beat) / 1000.0), c.harmonic, c.melody or 0.0, c.strength,
        float(src[DRUMS]), float(src[VOCALS]), float(src[OTHER]), float(int(np.argmax(c.bands)) == 0),
    )
    z = float(model["bias"]) + sum(float(w) * (v - float(m)) / float(sd) for v, m, sd, w in zip(x, model["mean"], model["scale"], model["weights"]))
    return 1.0 / (1.0 + math.exp(-z))


def lone_sound(c: Candidate) -> bool:
    """A hit where the drums are out (`Candidate.quiet`), where chords keep to the sounds
    (patterns.json chordSounds): a melody, a pluck or their echoes over a quiet passage are
    one sound, not a chord (a held chord gets its long notes from holds.pad instead)."""
    rule = load_config("patterns").get("chordSounds")
    return bool(rule) and c.quiet


def hold_cap(params: GenParams, table: list | None = None) -> int:
    """The most long notes one held chord takes at the chart's skill (holds.pad countMax, or the
    [skill, count] `table` given), 1 without it."""
    pad = difficulty_config()["holds"].get("pad")
    if table is None and not pad:
        return 1
    points = sorted((float(a), float(b)) for a, b in (table if table is not None else pad["countMax"]))
    return max(1, int(np.floor(np.interp(params.skill, [a for a, _ in points], [b for _, b in points]) + 1e-9)))


def hold_count(c: Candidate, params: GenParams) -> int:
    """How many long notes a held sound takes (holds.pad): one for a single held note (a long
    note of the tune); a chord or a rich sound (a pad, a choir or strings that is no note of the
    melody, or two or more pitched instruments sounding together) takes two and one more for
    each further pitched instrument, for lasting `longBeats` or more and for a strength of
    `strongAtLeast` or more, up to the skill's countMax."""
    pad = difficulty_config()["holds"]["pad"]
    cap = hold_cap(params)
    if cap <= 1 or c.sources is None:
        return 1
    share = float(pad["stemShare"])
    pitched = sum(1 for name in ("bass", "vocals", "other") if float(c.sources[STEM_NAMES.index(name)]) >= share)
    melody = (c.melody or 0.0) >= float(load_config("instruments")["rhythmSource"]["melody"]["note"])
    rich = pitched >= 2 or (pad_like(c) and not melody)
    if not rich:
        return 1
    n = 2 + max(0, pitched - 1) + (1 if c.sustain_beats >= float(pad["longBeats"]) else 0) + (1 if c.strength >= float(pad["strongAtLeast"]) else 0)
    return min(cap, n)


def mark_hold_count(slot: Slot, c: Candidate, params: GenParams) -> None:
    """The long notes of a slot that holds (`hold_count`): a held chord's slot becomes a chord
    of at least that many notes (within the tier's chord size and the keys)."""
    if slot.hold_end_beat is None or slot.special is not None or slot.roll is not None:
        return
    n = hold_count(c, params)
    if n <= 1:
        return
    keys = sum(1 for lane in key_modes()[params.key_mode]["lanes"] if lane["kind"] == "key")
    n = min(n, params.max_chord, keys)
    slot.hold_count = n
    slot.size = max(slot.size, n)


def clear_holds(slots: list[Slot], params: GenParams) -> None:
    """Easy charts keep a held key to itself (difficulty.json holds.clear): below `allBelow` no hit
    starts while a key long note is held, below `gapBelow` the hits under it keep `gapBeats` from
    each other and from its head. A long note over a closer hit lets go at the last whole or half
    beat at or before that hit, or becomes a tap when that leaves it shorter than the tier allows."""
    cfg = difficulty_config()["holds"].get("clear")
    if not cfg or params.skill >= float(cfg["gapBelow"]):
        return
    gap = math.inf if params.skill < float(cfg["allBelow"]) else float(cfg["gapBeats"])
    beats = sorted({s.beat for s in slots})
    for s in slots:
        if s.hold_end_beat is None or s.special_hold:
            continue
        prev, limit = s.beat, s.hold_end_beat
        for b in beats[bisect.bisect_right(beats, s.beat + 1e-6):]:
            if b >= s.hold_end_beat - 1e-6:
                break
            if b - prev < gap - 1e-6:
                limit = b
                break
            prev = b
        if limit >= s.hold_end_beat - 1e-6:
            continue
        end = math.floor(limit * 2.0 + 1e-6) / 2.0
        if end - s.beat >= params.min_ln_beats - 1e-6:
            s.hold_end_beat = end
        else:
            s.hold_end_beat = None
            s.hold_count = 1


def holdable(c: Candidate, tempo: TempoMap) -> bool:
    """Whether a long note may go on this sound (difficulty.json `holds`): the sound is held
    itself, a note of the melody or a tonal sound with its own attack on the eighths, not a drum
    hit over a bass or a pad that goes on sounding. A pad, choir or string sound (holds.pad)
    qualifies however soft its attack (`pad_like`)."""
    cfg = difficulty_config()["holds"]
    if c.sustain_beats * tempo.beat_ms(c.beat) >= float(cfg["minSoundMs"]) and pad_like(c):
        return True
    if c.sustain_beats * tempo.beat_ms(c.beat) < float(cfg["minSoundMs"]):
        return False
    if c.strength < float(cfg["strengthAtLeast"]):
        return False  # a faint sound over another one: the length is mostly the other sound's
    if (c.melody or 0.0) >= float(load_config("instruments")["rhythmSource"]["melody"]["note"]):
        ok = True
    elif c.sources is None:
        ok = c.harmonic >= float(cfg["harmonicAtLeast"])
    else:
        ok = float(c.sources[DRUMS]) < float(cfg["drumsBelow"]) and c.subdivision <= int(cfg["maxSubdivision"])
    model = cfg.get("model")
    if ok and model and float(model.get("atLeast", 0.0)) > 0:
        # the analysed length says little alone (a pad under a short hit lends it its own)
        return hold_probability(c, tempo, model) >= float(model["atLeast"])
    return ok


def active_seconds(cands: list[Candidate]) -> float:
    if len(cands) < 2:
        return 1.0
    gaps = np.diff([c.t for c in cands]) / 1000.0
    return float(np.sum(np.minimum(gaps, MAX_GAP_S))) + 1.0


def select_slots(
    cands: list[Candidate],
    params: GenParams,
    tempo: TempoMap,
    density_scale: float,
    special_kind: str | None,
    key_count: int,
    chord_scale: float = 1.0,
) -> list[Slot]:
    if not cands:
        return []
    expected_chord_notes = 1.0 + params.chord_ratio * (0.6 + 0.2 * max(0, params.max_chord - 2))
    target_notes = params.avg_nps * params.density * density_scale * active_seconds(cands)
    target_slots = max(1, int(round(target_notes / expected_chord_notes)))

    end_ms = cands[-1].t + 1000.0
    buckets = np.zeros(int(end_ms / BUCKET_MS) + 12)
    window = int(round(1000.0 / BUCKET_MS))
    peak_cap = params.peak_at(density_scale) / expected_chord_notes
    sub_counts: dict[int, int] = {}
    accepted = np.zeros(len(cands), dtype=bool)
    count = 0

    def bucket(c: Candidate) -> int:
        return int(max(0.0, c.t) / BUCKET_MS)

    def window_ok(b: int) -> bool:
        lo = max(0, b - window + 1)
        for start in range(lo, b + 1):
            if buckets[start : start + window].sum() + 1 > peak_cap:
                return False
        return True

    def partial_ok(c: Candidate) -> bool:
        limit = params.partial.get(grid_of(c))
        if limit is None:
            return True
        return (sub_counts.get(grid_of(c), 0) + 1) <= max(1.0, limit * max(count, target_slots * 0.5))

    def accept(i: int) -> None:
        nonlocal count
        accepted[i] = True
        buckets[bucket(cands[i])] += 1
        sub_counts[grid_of(cands[i])] = sub_counts.get(grid_of(cands[i]), 0) + 1
        count += 1

    # drum rolls first, on the grid the tier reads (rolls.py), all of a roll's hits or a coarser grid
    rolls: dict[int, list[int]] = {}
    for i, c in enumerate(cands):
        if c.roll is not None:
            rolls.setdefault(c.roll[0], []).append(i)
    blocked = np.zeros(len(cands), dtype=bool)  # between a roll's hits: no other note
    for hits in rolls.values():
        level = roll_level([cands[i].subdivision for i in hits], params)
        while level > 1:
            keep = [i for i in hits if level % cands[i].subdivision == 0]
            taken = []
            for i in keep:
                if not window_ok(bucket(cands[i])):
                    break
                accept(i)
                taken.append(i)
            if len(taken) == len(keep):
                blocked[hits[0] : hits[-1] + 1] = True
                break
            for i in taken:  # all of the roll or a coarser grid
                accepted[i] = False
                buckets[bucket(cands[i])] -= 1
                sub_counts[grid_of(cands[i])] -= 1
                count -= 1
            level = coarser(level)

    for i in sorted(range(len(cands)), key=lambda k: -cands[k].score):
        if count >= target_slots:
            break
        c = cands[i]
        if not accepted[i] and not blocked[i] and partial_ok(c) and window_ok(bucket(c)):
            accept(i)

    # Floor: active bars should not go silent just because their candidates score low.
    bpb = tempo.beats_per_bar
    per_bar_avg = target_slots / max(1.0, (cands[-1].beat - cands[0].beat) / bpb)
    floor = min(bpb / 2.0, 0.35 * per_bar_avg)
    if floor >= 1.0:
        bars: dict[int, list[int]] = {}
        for i, c in enumerate(cands):
            bars.setdefault(int(np.floor(c.beat / bpb)), []).append(i)
        for idxs in bars.values():
            have = sum(accepted[i] for i in idxs)
            pool = sorted((i for i in idxs if not accepted[i] and not blocked[i] and cands[i].intensity > 0.15), key=lambda k: -cands[k].score)
            for i in pool:
                if have >= floor:
                    break
                if window_ok(bucket(cands[i])):
                    accept(i)
                    have += 1

    chosen = [cands[i] for i in range(len(cands)) if accepted[i]]
    slots = [
        Slot(
            beat=c.beat,
            t=c.t,
            size=1,
            hold_end_beat=None,
            special=None,
            special_hold=False,
            pitch=c.pitch,
            bands=c.bands,
            score=c.score,
            subdivision=c.subdivision,
            strength=c.strength,
            sources=c.sources,
            sound_group=c.sound_group,
        )
        for c in chosen
    ]
    mark_rolls(slots, [c.roll is not None for c in chosen])
    _assign_chords(slots, chosen, params, key_count, chord_scale)
    _assign_long_notes(slots, chosen, params, tempo)
    if special_kind == "scratch":
        _assign_scratch(slots, params)
    elif special_kind == "side":
        _assign_side(slots, chosen, params, tempo)
    clear_holds(slots, params)
    return slots


def _assign_chords(slots: list[Slot], chosen: list[Candidate], params: GenParams, key_count: int, chord_scale: float) -> None:
    # Full-hand chords on few keys (quads on 4K) are rare accents, not a texture.
    max_chord = min(params.max_chord, max(2, int(np.ceil(key_count * 0.6))))
    if max_chord < 2 or not slots:
        return
    worth = []
    for s, c in zip(slots, chosen):
        total = float(np.sum(c.bands)) + 1e-9
        spread = int(np.sum(c.bands / total > 0.22))
        w = c.strength * (0.6 + 0.4 * spread) * (0.6 + 0.6 * c.intensity) * (1.4 if c.downbeat else 1.0)
        if params.skill < DOWNBEAT_CHORDS_BELOW and not c.downbeat or s.roll is not None or lone_sound(c):
            w = 0.0
        worth.append(w)
    # On few keys every chord eats a large share of the lanes; keep them rarer.
    ratio = min(MAX_CHORD_RATIO, params.chord_ratio * chord_scale * (0.75 if key_count <= 4 else 1.0))
    n_chords = int(round(ratio * len(slots)))
    if n_chords == 0:
        return
    order = sorted(range(len(slots)), key=lambda i: -worth[i])[:n_chords]
    order = [i for i in order if worth[i] > 0]
    for rank, i in enumerate(order):
        top = rank / max(1, len(order))
        extra = max_chord - 2
        size = 2 + (int(round(extra * (1.0 - top) ** params.chord_size_power)) if extra > 0 else 0)
        slots[i].size = max(2, min(max_chord, size))


def _assign_long_notes(slots: list[Slot], chosen: list[Candidate], params: GenParams, tempo: TempoMap) -> None:
    if params.long_note_ratio <= 0 or not slots:
        return
    picks = []
    for i, c in enumerate(chosen):
        if c.sustain_beats >= params.min_ln_beats and slots[i].roll is None and holdable(c, tempo):
            picks.append((hold_value(c, tempo), i))
    picks.sort(reverse=True)
    limit = int(round(params.long_note_ratio * len(slots)))
    for _, i in picks[:limit]:
        c = chosen[i]
        end = hold_end(c.beat, c.sustain_beats, params.min_ln_beats, params.skill)
        if end is not None:
            slots[i].hold_end_beat = end
            mark_hold_count(slots[i], c, params)


def _assign_scratch(slots: list[Slot], params: GenParams) -> None:
    """Scratches go on hard-hitting low+high impacts (kick + crash), kept short and spaced."""
    n = int(round(params.scratch_rate * len(slots)))
    if n == 0:
        return
    impact = []
    for s in slots:
        total = float(np.sum(s.bands)) + 1e-9
        low, high = s.bands[0] / total, s.bands[2] / total
        impact.append(s.strength * (0.5 + low + high) * (1.3 if s.subdivision == 1 else 1.0))
    for i in _spaced_picks(slots, impact, n, max(params.min_jack_ms, 250.0)):
        slots[i].special = "scratch"
        if slots[i].size == 1 and slots[i].hold_end_beat is not None:
            slots[i].hold_end_beat = None  # keep scratch notes short


def _assign_side(slots: list[Slot], chosen: list[Candidate], params: GenParams, tempo: TempoMap) -> None:
    """DJMAX-style side notes: mostly long holds over sustained sounds (pads, strings, long vocals,
    whose attacks are soft) plus a few big accents as taps (none when the tier wants only holds,
    like DJMAX's own side tracks)."""
    n = int(round(params.side_rate * len(slots)))
    if n == 0:
        return
    min_hold = max(1.0, params.min_ln_beats)
    gap = max(params.min_jack_ms, 450.0)
    holds = [
        (c.sustain_beats * (0.5 + c.harmonic), i)
        for i, c in enumerate(chosen)
        if c.sustain_beats >= min_hold and slots[i].subdivision <= 2 and slots[i].roll is None
        and hold_end(c.beat, c.sustain_beats, min_hold, 0.0) is not None and holdable(c, tempo)
    ]
    hold_score = [0.0] * len(slots)
    for value, i in holds:
        hold_score[i] = value
    picked = _spaced_picks(slots, hold_score, int(round(n * SIDE_HOLD_SHARE)), gap, positive_only=True)
    for i in picked:
        # the sustained sound becomes the side hold; a key long note on the same slot turns into a tap
        slot, c = slots[i], chosen[i]
        slot.special = "side"
        slot.special_hold = True
        slot.hold_end_beat = hold_end(c.beat, c.sustain_beats, min_hold, 0.0)
    impact = [s.strength * (1.3 if s.subdivision == 1 else 0.8) * (0.7 + 0.6 * c.intensity) for s, c in zip(slots, chosen)]
    taken = [slots[i].t for i in picked]
    taps = n - len(picked)
    for i in _spaced_picks(slots, impact, taps, gap, avoid=taken):
        slots[i].special = "side"


def _spaced_picks(
    slots: list[Slot],
    score: list[float],
    n: int,
    min_gap_ms: float,
    avoid: list[float] | None = None,
    positive_only: bool = False,
) -> list[int]:
    """Highest-scoring slots, at least `min_gap_ms` apart from each other and from `avoid`."""
    picks: list[int] = []
    taken: list[float] = list(avoid or [])
    for i in sorted(range(len(slots)), key=lambda k: -score[k]):
        if len(picks) >= n:
            break
        if positive_only and score[i] <= 0:
            break
        if slots[i].special is not None or slots[i].roll is not None or any(abs(slots[i].t - u) < min_gap_ms for u in taken):
            continue
        picks.append(i)
        taken.append(slots[i].t)
    return picks
