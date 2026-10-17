"""Chart file formats: osu!mania, BMS and bmson export and import.

Exports reference the audio by file name only; the audio itself is never written into them.
"""

from __future__ import annotations

import json
from typing import Any

from .bms import LANE_COLUMNS, export_bms, parse_bms
from .bmson import export_bmson, parse_bmson
from .common import FormatError, ParsedChart, assemble_chart, difficulty_label, safe_filename
from .osu import export_osu, parse_osu

EXPORT_FORMATS = ("osu", "bms", "bmson")
MEDIA_TYPES = {"osu": "text/plain; charset=utf-8", "bms": "text/plain; charset=utf-8", "bmson": "application/json"}

__all__ = [
    "EXPORT_FORMATS",
    "FormatError",
    "ParsedChart",
    "assemble_chart",
    "export_chart",
    "export_formats",
    "parse_bms",
    "parse_bmson",
    "parse_osu",
]


def export_formats(key_mode: str) -> list[str]:
    """Formats a chart of this key mode can be written in (BMS/bmson know only 5K and 7K+1S)."""
    return ["osu", "bms", "bmson"] if key_mode in LANE_COLUMNS else ["osu"]


def export_chart(chart: dict[str, Any], fmt: str, audio_name: str, preview_ms: float | None = None, offset_ms: float = 0.0) -> tuple[bytes, str, str]:
    """(file bytes, file name, media type) of a chart in `fmt`."""
    meta = chart["meta"]
    label = meta.get("chartName") or f"{meta['keyMode']} {difficulty_label(meta, with_level=False)}"
    stem = safe_filename(f"{meta['title']} [{label}]")
    if fmt == "osu":
        text = export_osu(chart, audio_name, preview_ms, offset_ms)
        return text.encode("utf-8"), f"{stem}.osu", MEDIA_TYPES["osu"]
    if offset_ms:
        chart = _shifted(chart, offset_ms)
    if fmt == "bms":
        text, ext = export_bms(chart, audio_name)
        return text.encode("utf-8"), f"{stem}{ext}", MEDIA_TYPES["bms"]
    if fmt == "bmson":
        doc = export_bmson(chart, audio_name)
        return json.dumps(doc, ensure_ascii=False, indent=1).encode("utf-8"), f"{stem}.bmson", MEDIA_TYPES["bmson"]
    raise FormatError(f"알 수 없는 형식입니다: {fmt}")


def _shifted(chart: dict[str, Any], offset_ms: float) -> dict[str, Any]:
    """The chart moved later (or earlier) on the audio timeline by `offset_ms`."""
    timing = dict(chart["timing"], offsetMs=float(chart["timing"]["offsetMs"]) + offset_ms)
    move = lambda n: {**n, "t": n["t"] + offset_ms, **({"endT": n["endT"] + offset_ms} if "endT" in n else {})}  # noqa: E731
    out = dict(chart, timing=timing, notes=[move(n) for n in chart["notes"]])
    if chart.get("bgm"):
        out["bgm"] = [move(e) for e in chart["bgm"]]
    return out
