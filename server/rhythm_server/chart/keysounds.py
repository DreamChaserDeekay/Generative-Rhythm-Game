"""Stem keysounds of a chart's notes: where each note's own sound ends in its stem, and the stem
the chart mostly follows (docs/PATTERN_DESIGN.md 93)."""

from __future__ import annotations

import hashlib
from typing import Any

import numpy as np

from ..analysis.stems import STEM_NAMES
from ..config import difficulty_config, load_config

SOUND_END_MARGIN_MS = 5.0  # past the snap tolerance: a note's own onset is never its sound's end


def default_seed(audio_hash: str, key_mode: str, difficulty: str, target_level: int | None) -> int:
    """Stable per song/mode/difficulty, so the default chart of a song never changes."""
    digest = hashlib.sha256(f"{audio_hash}|{key_mode}|{difficulty}|{target_level}".encode()).hexdigest()
    return int(digest[:8], 16)


def mark_sound_ends(notes: list[dict[str, Any]], analysis: dict[str, Any]) -> None:
    """`srcEnd` of every note that follows a stem: where its own sound in that stem ends, at the
    stem's next sound after the note's onset (an onset with keysound.soundShare of that stem at
    least, or mostly that stem, and an attack of keysound.soundAttack at least, later than the snap
    tolerance after the note), at most keysound.maxSliceMs after it and never before a long note's
    end. A keysound plays its note's slice up to here, so one press plays one sound; the stem's
    sounds that no note took stay in the background (docs/PATTERN_DESIGN.md 93). In place; nothing
    without stem shares in the analysis."""
    cfg = load_config("instruments")["keysound"]
    share = float(cfg.get("soundShare", 0.0))
    onsets = analysis.get("onsets") or []
    if share <= 0 or not onsets or not any(o.get("sources") for o in onsets):
        return
    min_attack = float(cfg.get("soundAttack", 0.0))
    after = float(difficulty_config()["snapToleranceMs"]) + SOUND_END_MARGIN_MS
    cap = float(cfg["maxSliceMs"])
    duration = float(analysis.get("durationMs") or 0.0)
    starts: dict[str, np.ndarray] = {}
    for k, name in enumerate(STEM_NAMES):
        starts[name] = np.array(sorted(
            float(o["t"]) for o in onsets
            if float(o.get("attack", 1.0)) >= min_attack
            and (o.get("source") == name or (len(o.get("sources") or ()) == len(STEM_NAMES) and float(o["sources"][k]) >= share))
        ))
    for n in notes:
        times = starts.get(n.get("src") or "")
        if times is None:
            continue
        i = int(np.searchsorted(times, float(n["t"]) + after, side="right"))
        end = min(float(times[i]) if i < len(times) else float("inf"), float(n["t"]) + cap)
        if duration > 0:
            end = min(end, duration)
        if n.get("type") == "hold" and n.get("endT") is not None:
            end = max(end, float(n["endT"]))
        n["srcEnd"] = round(end, 3)


def keysound_meta(notes: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The main keysound stem shown in the chart info, and the share of notes following each stem:
    the pitched stem (vocals, other, bass) most notes follow, or the drums when the notes hardly
    follow any of those."""
    counts = {name: 0 for name in STEM_NAMES}
    for n in notes:
        if n.get("src") in counts:
            counts[n["src"]] += 1
    total = sum(counts.values())
    if total == 0:
        return None
    pitched = max(("vocals", "other", "bass"), key=lambda k: counts[k])
    min_share = load_config("instruments")["keysound"]["minShare"]
    stem = pitched if counts[pitched] >= min_share * total else "drums"
    return {"stem": stem, "share": round(counts[stem] / total, 3), "shares": {k: round(v / total, 3) for k, v in counts.items()}}
