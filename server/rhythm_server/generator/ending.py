"""The end of a song (difficulty.json `ending`): while the song still plays clear sounds the chart
plays them as taps; when only the reverb of the last hit is left, the last notes hold over it; a
song that goes quiet just stops. Without it a chart ends on a tap with seconds of the last chord
ringing on (docs/PATTERN_DESIGN.md 60)."""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from ..config import difficulty_config
from .lanes import ln_gap_ms
from .params import GenParams
from .select import hold_cap
from .tempo import TempoMap


def _tail_end(analysis: dict[str, Any], t: float, drop: float, silence: float) -> float | None:
    """When the sound after `t` (ms) has died away: `drop` below its level at `t` or under the
    silence level. None without an energy curve."""
    energy = analysis.get("energy") or {}
    values = energy.get("values") or []
    if not values:
        return None
    frame = float(energy.get("frameMs", 100)) or 100.0
    i = max(0, int(t / frame))
    if i >= len(values):
        return t
    start = max(values[i : i + 2])
    floor = max(silence, start - drop)
    for j in range(i + 1, len(values)):
        if values[j] < floor:
            return j * frame
    return len(values) * frame


def finish(notes: list[dict[str, Any]], analysis: dict[str, Any], tempo: TempoMap, params: GenParams, lanes: list[Any], silence: float) -> bool:
    """Hold the chart's last notes over the reverb that ends the song (in place); whether it did."""
    cfg = difficulty_config().get("ending")
    if not cfg or not notes:
        return False
    last_t = max(n["t"] for n in notes)
    last = [n for n in notes if n["t"] == last_t and lanes[n["lane"]].kind == "key"]
    if not last or any(n["type"] == "hold" for n in last) or any(n.get("endT", 0) > last_t for n in notes):
        return False
    # a clear sound after the last note is the music going on, not its reverb
    strengths = [float(o["strength"]) for o in analysis.get("onsets", [])]
    if strengths:
        clear = float(cfg["clearStrength"]) * float(np.median(strengths))
        if any(o["t"] > last_t + 50 and float(o["strength"]) >= clear for o in analysis["onsets"]):
            return False
    end_t = _tail_end(analysis, last_t, float(cfg["dropLevel"]), silence)
    if end_t is None:
        return False
    start = last[0]["beat"]
    end = min(tempo.ms_to_beat(min(end_t, float(analysis["durationMs"]))), start + float(cfg["maxBeats"]))
    end = math.floor(end * 2 + 1e-9) / 2  # on a half beat
    if end - start < max(float(cfg["minBeats"]), params.min_ln_beats) - 1e-9:
        return False
    # the last chord rings on: its notes hold, and a chord takes the skill's count of long notes
    # (ending.countMax: up to six on MASTER, more than a held chord inside the song), more keys
    # joining it where the hands have room
    want = min(hold_cap(params, cfg.get("countMax")), params.max_chord) if end - start >= 2.0 - 1e-9 else 1
    keys = [l for l in lanes if l.kind == "key"]
    # every press at the last instant counts against its hand and the chord size, a scratch or a
    # key that stays a tap too (a 7K EXPERT chart ending on scratch + key 1 grew three presses on
    # the left hand, MASTER a chord of seven, and the linter refused both)
    chord = [n for n in notes if n["t"] == last_t]
    pressed: dict[str, int] = {}
    for n in chord:
        pressed[lanes[n["lane"]].hand] = pressed.get(lanes[n["lane"]].hand, 0) + 1
    holding: dict[str, int] = {}
    held: list[dict[str, Any]] = []

    def can_hold(hand: str) -> bool:
        return holding.get(hand, 0) < (1 if hand == "T" else min(params.hand_chord_limit, params.max_holds_per_hand))

    def can_press(hand: str) -> bool:
        return pressed.get(hand, 0) < (1 if hand == "T" else params.hand_chord_limit)

    for n in sorted(last, key=lambda n: -abs(lanes[n["lane"]].pos - 0.5)):
        hand = lanes[n["lane"]].hand
        if len(held) < max(1, want) and can_hold(hand):
            held.append(n)
            holding[hand] = holding.get(hand, 0) + 1
    taken = {n["lane"] for n in chord}
    # a lane played just before is no free lane: the chord's new note would be a jack the linter
    # refuses (a MASTER chart of six held notes failed on a tap 69 ms earlier)
    for n in notes:
        if n["t"] < last_t and (last_t - n["t"] < params.min_jack_ms or ("endT" in n and last_t < n["endT"] + ln_gap_ms(tempo, n["endBeat"]))):
            taken.add(n["lane"])
    # a side note is a bar over its hand's keys: they keep the jack spacing from its head (linter)
    side_hands = {lanes[n["lane"]].hand for n in notes if lanes[n["lane"]].kind == "side" and 1e-3 < last_t - n["t"] < params.min_jack_ms}
    taken.update(l.index for l in keys if l.hand in side_hands)
    for lane in sorted(keys, key=lambda l: (-abs(l.pos - 0.5), l.index)):
        if len(held) >= want or len(chord) >= params.max_chord:
            break
        if lane.index in taken or not (can_hold(lane.hand) and can_press(lane.hand)):
            continue
        extra = {k: v for k, v in last[0].items() if k not in ("type", "endBeat", "endT")}
        extra["lane"] = lane.index
        notes.append(extra)
        chord.append(extra)
        held.append(extra)
        taken.add(lane.index)
        holding[lane.hand] = holding.get(lane.hand, 0) + 1
        pressed[lane.hand] = pressed.get(lane.hand, 0) + 1
    for n in held:
        n["type"] = "hold"
        n["endBeat"] = round(end, 6)
        n["endT"] = round(tempo.beat_to_ms(end), 3)
    notes.sort(key=lambda n: (n["t"], n["lane"]))
    return True
