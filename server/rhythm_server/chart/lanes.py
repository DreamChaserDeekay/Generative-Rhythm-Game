"""The lanes of a key mode (config/keymodes.json)."""

from __future__ import annotations

from dataclasses import dataclass

from ..config import key_modes


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
