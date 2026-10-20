"""The song's face for the menus: drawn by the client from its analysis, never from an image."""

from __future__ import annotations

from typing import Any

PEAKS = 64


def sketch_of(analysis: dict[str, Any], peaks: int = PEAKS) -> dict[str, Any]:
    """Sections (length, energy, leading stem) and `peaks` waveform peaks: small enough to fetch for
    every row of the song list."""
    wave = [float(v) for v in analysis.get("waveform", {}).get("peaks", [])]
    bins: list[float] = []
    if wave:
        for i in range(peaks):
            a = i * len(wave) // peaks
            b = max(a + 1, (i + 1) * len(wave) // peaks)
            bins.append(max(wave[a:b]))
    top = max(bins, default=0.0) or 1.0
    meter = analysis.get("timing", {}).get("meter") or [{}]
    share = analysis.get("stems", {}).get("energyShare")
    names = analysis.get("stems", {}).get("names")
    return {
        "durationMs": float(analysis.get("durationMs") or 0.0),
        "previewMs": analysis.get("previewMs"),
        "beatsPerBar": int(meter[0].get("beatsPerMeasure", 4)),
        "sections": [
            {
                "t": round(float(s["t"])),
                "endT": round(float(s["endT"])),
                "label": s.get("label", ""),
                "group": s.get("group", ""),
                "energy": round(float(s.get("energy", 0.5)), 3),
                "leader": s.get("leader"),
            }
            for s in analysis.get("sections", [])
        ],
        "peaks": [round(v / top, 3) for v in bins],
        "stems": dict(zip(names, share)) if names and share else None,
    }
