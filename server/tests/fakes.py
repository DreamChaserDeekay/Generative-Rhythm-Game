"""Stand-ins for Mapperatorinator in the tests (the real model needs its own Python and a GPU; it is
not run here): a worker that answers each request with an .osu, a runtime that counts as set up,
and a chart made straight from an .osu of the song's onsets."""

from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path

from rhythm_server.mapper import charts, runtime as rt
from rhythm_server.mapper.runtime import Runtime, mapper_config

# answers each request with an .osu of 48 notes on the beats: of the timing it was given (the
# song's, as red lines), else of its own (128 BPM from 100 ms: the "timing pass"). Seed 13 fails.
FAKE_WORKER = textwrap.dedent('''
    import json, sys
    from pathlib import Path
    for line in sys.stdin:
        req = json.loads(line)
        if req.get("seed") == 13:
            print(json.dumps({"id": req["id"], "ok": False, "error": "CUDA out of memory"}), flush=True)
            continue
        red = "100,468.75,4,1,0,60,1,0"
        if req.get("beatmap"):
            text = Path(req["beatmap"]).read_text(encoding="utf-8")
            red = [l for l in text.split("[TimingPoints]")[1].splitlines() if l.strip() and not l.startswith("[")][0]
        t0, beat = float(red.split(",")[0]), float(red.split(",")[1])
        keys = int(req["keycount"])
        objs = [f"{int((i % keys + 0.5) * 512 / keys)},192,{int(round(t0 + i * beat))},1,0,0:0:0:0:" for i in range(48)]
        out = Path(req["out"]) / "beatmap.osu"
        head = "osu file format v14\\n[General]\\nMode: 3\\n[Difficulty]\\nCircleSize:%d\\n[TimingPoints]\\n%s\\n[HitObjects]\\n" % (keys, red)
        out.write_text(head + "\\n".join(objs) + "\\n", encoding="utf-8")
        print(json.dumps({"id": req["id"], "ok": True, "osu": str(out), "seconds": 0.1, "device": "cuda", "precision": "fp32",
                          "timingGiven": bool(req.get("beatmap"))}), flush=True)
''')


class FakeRuntime(Runtime):
    @property
    def venv_python(self) -> Path:
        return Path(sys.executable)


def set_up(home: Path) -> None:
    """Makes the runtime folder count as set up."""
    (home / "src").mkdir(parents=True, exist_ok=True)
    (home / "state.json").write_text(json.dumps({"tag": rt.RUNTIME_TAG, "device": "cuda"}), encoding="utf-8")


def osu(keys: int, objects: list[str], red: str = "100,500,4,1,0,60,1,0") -> str:
    return "\n".join(["osu file format v14", "[General]", "Mode: 3", "[Difficulty]", f"CircleSize:{keys}", "[TimingPoints]",
                      red, "[HitObjects]", *objects, ""])


def x_of(column: int, keys: int) -> int:
    return int((column + 0.5) * 512 / keys)


def onset_osu(analysis: dict, keys: int, count: int = 60) -> str:
    """An .osu with a note on each of the song's first onsets, columns in turn, and a hold; its
    timing is the analysis's first tempo."""
    timing = analysis["timing"]
    objects = []
    for i, o in enumerate([o for o in analysis["onsets"] if o["t"] > timing["offsetMs"]][:count]):
        objects.append(f"{x_of(i % keys, keys)},192,{int(round(o['t']))},1,0,0:0:0:0:")
    t0 = int(timing["offsetMs"]) + 20000
    objects.append(f"{x_of(0, keys)},192,{t0},128,0,{t0 + 900}:0:0:0:0:")
    return osu(keys, objects, f"{timing['offsetMs']},{60000.0 / timing['tempoMap'][0]['bpm']},4,1,0,60,1,0")


def made_chart(analysis: dict, key_mode: str = "4K", difficulty: str = "HARD", seed: int = 1, count: int = 60) -> dict:
    """A chart as Mapperatorinator's .osu becomes one (notes on the song's onsets)."""
    cfg = dict(mapper_config())
    level = charts.target_level(key_mode, difficulty, None)
    cid = charts.chart_id(analysis, key_mode, difficulty, level, seed, cfg)
    text = onset_osu(analysis, len(charts.columns(key_mode)), count)
    return charts.make_chart(analysis, key_mode, difficulty, level, seed, cid, cfg, {"songId": None, "title": "T", "artist": "A"}, text, {"seconds": 1.0, "device": "cuda"})


def on_grid(chart: dict, per_beat: int = 4) -> dict:
    """The chart with its notes moved onto the grid (the stand-in's notes sit on whole milliseconds;
    BMS and bmson hold grid positions only)."""
    from rhythm_server.chart.tempo import TempoMap

    tempo = TempoMap(chart["timing"])
    seen: set[tuple[float, int]] = set()
    notes = []
    for n in chart["notes"]:
        beat = round(n["beat"] * per_beat) / per_beat
        if (beat, n["lane"]) in seen:
            continue
        seen.add((beat, n["lane"]))
        note = {**n, "beat": beat, "t": round(tempo.beat_to_ms(beat), 3)}
        if n["type"] == "hold":
            end = max(beat + 1.0, round(n["endBeat"] * per_beat) / per_beat)
            note.update(endBeat=end, endT=round(tempo.beat_to_ms(end), 3))
        notes.append(note)
    return {**chart, "notes": notes, "meta": {**chart["meta"], "noteCount": len(notes)}}
