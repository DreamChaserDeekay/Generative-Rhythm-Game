"""Repeated-section consistency: slots of a repeated section (same repetition group as an
earlier one) are matched to the slot at the same beat offset in the group's first occurrence,
so the lane search can reuse that occurrence's pattern (or its mirror image)."""

from __future__ import annotations

from typing import Any

from .lanes import LaneInfo
from .select import Slot

BEAT_DECIMALS = 4


def repeat_references(slots: list[Slot], sections: list[dict[str, Any]]) -> tuple[list[int | None], list[int]]:
    """For each slot the index of its reference slot (None when it has none) and the occurrence
    number of its section within its group (0 for first occurrences)."""
    refs: list[int | None] = [None] * len(slots)
    occurrence = [0] * len(slots)
    ordered = sorted((s for s in sections if s.get("group")), key=lambda s: s["startBeat"])
    if len(ordered) < 2:
        return refs, occurrence
    by_beat = {round(s.beat, BEAT_DECIMALS): i for i, s in enumerate(slots)}
    first: dict[str, tuple[float, float]] = {}
    seen: dict[str, int] = {}
    for k, sec in enumerate(ordered):
        start = float(sec["startBeat"])
        end = float(ordered[k + 1]["startBeat"]) if k + 1 < len(ordered) else float("inf")
        group = sec["group"]
        if group not in first:
            first[group] = (start, end)
            seen[group] = 0
            continue
        seen[group] += 1
        ref_start, ref_end = first[group]
        for i, slot in enumerate(slots):
            if not start <= slot.beat < end:
                continue
            ref_beat = ref_start + (slot.beat - start)
            j = by_beat.get(round(ref_beat, BEAT_DECIMALS))
            if j is not None and ref_beat < ref_end and slots[j].size == slot.size and slots[j].special == slot.special:
                refs[i] = j
                occurrence[i] = seen[group]
    return refs, occurrence


def repeat_targets(
    refs: list[int | None],
    occurrence: list[int],
    chosen: list[tuple[int, ...] | None],
    lanes: list[LaneInfo],
    mirror_alternate: bool,
) -> list[tuple[int, ...] | None]:
    """Key lanes each slot should prefer: its reference's lanes, mirrored on every other repeat
    when `mirror_alternate` is set."""
    keys = [l.index for l in lanes if l.kind == "key"]
    mirror = {lane: keys[len(keys) - 1 - n] for n, lane in enumerate(keys)}
    out: list[tuple[int, ...] | None] = [None] * len(refs)
    for i, j in enumerate(refs):
        if j is None or chosen[j] is None:
            continue
        target = chosen[j]
        if mirror_alternate and occurrence[i] % 2 == 1:
            target = tuple(sorted(mirror[l] for l in target))
        out[i] = target
    return out


def consistency(refs: list[int | None], occurrence: list[int], chosen: list[tuple[int, ...] | None], lanes: list[LaneInfo], mirror_alternate: bool) -> float | None:
    """Share of slots with a reference whose key lanes equal the (possibly mirrored) reference."""
    targets = repeat_targets(refs, occurrence, chosen, lanes, mirror_alternate)
    pairs = [(chosen[i], t) for i, t in enumerate(targets) if t is not None]
    if not pairs:
        return None
    return sum(1 for got, want in pairs if got == want) / len(pairs)
