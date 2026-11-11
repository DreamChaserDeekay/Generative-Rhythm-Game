"""Beat <-> ms conversion for a chart tempo map (mirror of the client's TempoMap).

`timing.stops` (imported BMS/bmson charts) pause the beat clock: a stop at beat b lasts
`durationMs`, notes at b are hit when it starts and everything after b moves later by its length.
"""

from __future__ import annotations

import bisect
from typing import Any

BEAT_EPS = 1e-9


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
        stops = sorted((s for s in timing.get("stops") or [] if float(s["durationMs"]) > 0), key=lambda s: s["beat"])
        self.stop_beat = [float(s["beat"]) for s in stops]
        self.stop_ms = [float(s["durationMs"]) for s in stops]
        # stop i starts at its beat's unstopped time plus every earlier stop
        self.stop_before: list[float] = []
        total = 0.0
        for d in self.stop_ms:
            self.stop_before.append(total)
            total += d
        self.stop_start = [self._plain_ms(b) + before for b, before in zip(self.stop_beat, self.stop_before)]

    def _seg_beat(self, beat: float) -> int:
        return max(0, bisect.bisect_right(self.start_beat, beat) - 1)

    def _plain_ms(self, beat: float) -> float:
        i = self._seg_beat(beat)
        return self.start_ms[i] + (beat - self.start_beat[i]) * self.ms_per_beat[i]

    def _plain_beat(self, ms: float) -> float:
        i = max(0, bisect.bisect_right(self.start_ms, ms) - 1)
        return self.start_beat[i] + (ms - self.start_ms[i]) / self.ms_per_beat[i]

    def beat_to_ms(self, beat: float) -> float:
        k = bisect.bisect_left(self.stop_beat, beat - BEAT_EPS)  # stops strictly before `beat`
        return self._plain_ms(beat) + (self.stop_before[k - 1] + self.stop_ms[k - 1] if k > 0 else 0.0)

    def ms_to_beat(self, ms: float) -> float:
        k = bisect.bisect_right(self.stop_start, ms) - 1
        if k < 0:
            return self._plain_beat(ms)
        if ms < self.stop_start[k] + self.stop_ms[k]:
            return self.stop_beat[k]
        return self._plain_beat(ms - self.stop_before[k] - self.stop_ms[k])

    def beat_ms(self, beat: float) -> float:
        """Length of one beat (ms) at a beat position."""
        return self.ms_per_beat[self._seg_beat(beat)]

    def bpm_at(self, beat: float) -> float:
        return 60000.0 / self.beat_ms(beat)
