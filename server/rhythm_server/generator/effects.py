"""SDVX-style camera cues derived from the song structure: a zoom pulse where the energy jumps
(drops, choruses) and a track tilt that alternates between high-energy sections."""

from __future__ import annotations

from typing import Any

from ..config import load_config
from .tempo import TempoMap


def camera_effects(sections: list[dict[str, Any]], tempo: TempoMap) -> list[dict[str, Any]]:
    cfg = load_config("instruments")["effects"]
    out: list[dict[str, Any]] = []
    prev: float | None = None
    tilted = False
    direction = 1
    for sec in sorted(sections, key=lambda s: s["startBeat"]):
        beat = max(0.0, float(sec["startBeat"]))
        energy = float(sec.get("energy", 0.0))
        t = round(tempo.beat_to_ms(beat), 3)
        if prev is not None and energy - prev >= cfg["energyJump"]:
            out.append({"beat": beat, "t": t, "type": "zoom", "value": round(min(1.0, 2.0 * (energy - prev)), 3), "durationBeats": cfg["zoomBeats"]})
        if energy >= cfg["highEnergy"]:
            out.append({"beat": beat, "t": t, "type": "tilt", "value": round(direction * energy, 3), "durationBeats": cfg["tiltBeats"]})
            direction = -direction
            tilted = True
        elif tilted:
            out.append({"beat": beat, "t": t, "type": "tilt", "value": 0.0, "durationBeats": cfg["tiltBeats"]})
            tilted = False
        prev = energy
    return out
