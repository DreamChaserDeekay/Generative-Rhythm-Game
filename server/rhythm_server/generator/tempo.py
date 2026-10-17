"""Beat <-> ms conversion for a chart tempo map (mirror of the client's TempoMap)."""

from __future__ import annotations

import bisect
from typing import Any


class TempoMap:
    def __init__(self, timing: dict[str, Any]):
        points = sorted(timing["tempoMap"], key=lambda p: p["beat"])
        if not points or points[0]["beat"] > 0:
            raise ValueError("tempoMap must start at beat 0")
        self.start_beat: list[float] = []
        self.start_ms: list[float] = []
        self.ms_per_beat: list[float] = []
        ms = float(timing["offsetMs"])
        for i, p in enumerate(points):
            if i > 0:
                prev = points[i - 1]
                ms += (p["beat"] - prev["beat"]) * 60000.0 / prev["bpm"]
            self.start_beat.append(float(p["beat"]))
            self.start_ms.append(ms)
            self.ms_per_beat.append(60000.0 / float(p["bpm"]))
        meter = timing.get("meter") or [{"measure": 0, "beatsPerMeasure": 4}]
        self.beats_per_bar = int(meter[0]["beatsPerMeasure"])

    def _seg_beat(self, beat: float) -> int:
        return max(0, bisect.bisect_right(self.start_beat, beat) - 1)

    def _seg_ms(self, ms: float) -> int:
        return max(0, bisect.bisect_right(self.start_ms, ms) - 1)

    def beat_to_ms(self, beat: float) -> float:
        i = self._seg_beat(beat)
        return self.start_ms[i] + (beat - self.start_beat[i]) * self.ms_per_beat[i]

    def ms_to_beat(self, ms: float) -> float:
        i = self._seg_ms(ms)
        return self.start_beat[i] + (ms - self.start_ms[i]) / self.ms_per_beat[i]

    def beat_ms(self, beat: float) -> float:
        """Length of one beat (ms) at a beat position."""
        return self.ms_per_beat[self._seg_beat(beat)]
