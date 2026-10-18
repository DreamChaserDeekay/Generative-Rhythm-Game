"""Density control: pick which candidates become notes, then chords, long notes and special
(scratch / side) notes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from ..analysis.stems import STEM_NAMES
from .candidates import Candidate
from .params import GenParams, skill_for_rating
from .tempo import TempoMap

DRUMS = STEM_NAMES.index("drums")
MAX_GAP_S = 4.0  # silences longer than this do not count toward the target density
BUCKET_MS = 100.0
MAX_LN_BEATS = 8.0
MAX_CHORD_RATIO = 0.6
# Easy charts (five-step levels 1-3) put chords on downbeats only; up to level 6 long notes end on
# half beats.
DOWNBEAT_CHORDS_BELOW = skill_for_rating(4.0)
HALF_BEAT_HOLDS_BELOW = skill_for_rating(7.0)


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

    @property
    def src(self) -> int | None:
        """Dominant stem index, or None without stem analysis."""
        return int(np.argmax(self.sources)) if self.sources is not None else None


def melodic(slot: Slot) -> bool:
    """A slot whose pitch belongs to its sound (not a drum hit that inherits a melody pitch)."""
    if slot.pitch is None:
        return False
    return slot.sources is None or int(np.argmax(slot.sources)) != DRUMS


def sound_of(slot: Slot) -> tuple[Any, ...]:
    """What makes two slots "the same sound": stem and pitch, or stem and loudest band."""
    if melodic(slot):
        return (slot.src, round(float(slot.pitch)))  # type: ignore[arg-type]
    return (slot.src, int(np.argmax(slot.bands)))


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
    peak_cap = params.peak_nps / expected_chord_notes
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
        limit = params.partial.get(c.subdivision)
        if limit is None:
            return True
        return (sub_counts.get(c.subdivision, 0) + 1) <= max(1.0, limit * max(count, target_slots * 0.5))

    def accept(i: int) -> None:
        nonlocal count
        accepted[i] = True
        buckets[bucket(cands[i])] += 1
        sub_counts[cands[i].subdivision] = sub_counts.get(cands[i].subdivision, 0) + 1
        count += 1

    for i in sorted(range(len(cands)), key=lambda k: -cands[k].score):
        if count >= target_slots:
            break
        c = cands[i]
        if partial_ok(c) and window_ok(bucket(c)):
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
            pool = sorted((i for i in idxs if not accepted[i] and cands[i].intensity > 0.15), key=lambda k: -cands[k].score)
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
        )
        for c in chosen
    ]
    _assign_chords(slots, chosen, params, key_count, chord_scale)
    _assign_long_notes(slots, chosen, params, tempo)
    if special_kind == "scratch":
        _assign_scratch(slots, params)
    elif special_kind == "side":
        _assign_side(slots, chosen, params)
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
        if params.skill < DOWNBEAT_CHORDS_BELOW and not c.downbeat:
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
    step = 0.5 if params.skill < HALF_BEAT_HOLDS_BELOW else 0.25
    picks = []
    for i, c in enumerate(chosen):
        if c.sustain_beats >= params.min_ln_beats:
            picks.append((c.sustain_beats * (0.5 + c.harmonic) * (1.2 if c.pitch is not None else 1.0), i))
    picks.sort(reverse=True)
    limit = int(round(params.long_note_ratio * len(slots)))
    for _, i in picks[:limit]:
        c = chosen[i]
        length = min(MAX_LN_BEATS, np.floor(c.sustain_beats / step) * step)
        if length >= params.min_ln_beats:
            slots[i].hold_end_beat = c.beat + float(length)


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


def _assign_side(slots: list[Slot], chosen: list[Candidate], params: GenParams) -> None:
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
        if c.sustain_beats >= min_hold and slots[i].subdivision <= 2
    ]
    hold_score = [0.0] * len(slots)
    for value, i in holds:
        hold_score[i] = value
    picked = _spaced_picks(slots, hold_score, int(round(n * params.side_hold_share)), gap, positive_only=True)
    for i in picked:
        # the sustained sound becomes the side hold; a key long note on the same slot turns into a tap
        slot, c = slots[i], chosen[i]
        slot.special = "side"
        slot.special_hold = True
        slot.hold_end_beat = c.beat + float(min(MAX_LN_BEATS, np.floor(c.sustain_beats * 2) / 2))
    impact = [s.strength * (1.3 if s.subdivision == 1 else 0.8) * (0.7 + 0.6 * c.intensity) for s, c in zip(slots, chosen)]
    taken = [slots[i].t for i in picked]
    taps = n - len(picked) if params.side_hold_share < 1.0 else 0
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
        if slots[i].special is not None or any(abs(slots[i].t - u) < min_gap_ms for u in taken):
            continue
        picks.append(i)
        taken.append(slots[i].t)
    return picks
