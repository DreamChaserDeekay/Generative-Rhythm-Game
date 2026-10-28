"""Community pattern guide measures (docs/PATTERN_DESIGN.md 14) on the structured synthetic songs.

    python scripts/measure_guides.py [--quick] [--noise]

Songs: the two structured songs of measure_consistency.py and one that opens on its chorus (most of
its keysounds come early, the case the build-up rule singles out). Every chart is measured with
difficulty/guides.py over the true sections, plus the section consistency it must keep (loopLane,
repeatLane on the true sections).
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rhythm_server.analysis.analyzer import analyze  # noqa: E402
from rhythm_server.difficulty.consistency import chart_consistency  # noqa: E402
from rhythm_server.difficulty.guides import guide_profile, onset_pitches  # noqa: E402
from rhythm_server.generator.core import generate_chart  # noqa: E402
from rhythm_server.synth import CHORUS_FIRST_FORM, detection_noise, make_structured_song  # noqa: E402

SONGS = ((124.0, 1, None), (150.0, 2, None), (132.0, 3, CHORUS_FIRST_FORM))
CHARTS = (
    ("4K", "NORMAL", 6),
    ("4K", "MASTER", 13),
    ("5K", "HARD", 9),
    ("5K", "MASTER", 13),
    ("6K", "NORMAL", None),
    ("6K", "HARD", 9),
    ("6K", "MASTER", 13),
    ("8K", "HARD", None),
    ("8K", "MASTER", 13),
)
MEASURES = (
    "repeatGrowth", "halfRatio", "peakAt",
    "contour", "pitchOrder",
    "unmotivatedJacks", "fingerLoad", "anchors", "anchorMax", "handStreaks", "doubles", "handRuns", "jackStreaks",
    "lopsided", "shapeLeft", "offBars", "adjacentChords", "pivots",
    "loopLane", "repeatLane",
)
SHORT = {
    "repeatGrowth": "growth", "halfRatio": "half", "peakAt": "peak", "contour": "contour", "pitchOrder": "pOrder",
    "unmotivatedJacks": "uJack", "fingerLoad": "finger", "anchors": "anchor", "anchorMax": "aMax", "handStreaks": "streak", "doubles": "double",
    "handRuns": "hRun", "jackStreaks": "jStreak", "offBars": "offBar", "adjacentChords": "adjChd",
    "lopsided": "lopside", "shapeLeft": "shapeL", "pivots": "pivot", "loopLane": "loopL", "repeatLane": "repL",
}


def fmt(v: object) -> str:
    return "    -" if v is None else f"{v:5.2f}" if isinstance(v, float) else f"{v:5d}" if isinstance(v, int) else str(v)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="first song and four charts only")
    ap.add_argument("--noise", action="store_true", help="add onset detection noise (synth.detection_noise)")
    args = ap.parse_args()
    songs = SONGS[:1] if args.quick else SONGS
    charts = CHARTS[::3] if args.quick else CHARTS
    rows: list[dict[str, object]] = []
    for bpm, seed, form in songs:
        song = make_structured_song(bpm=bpm, seed=seed, **({"form": form} if form else {}))
        analysis = analyze(song.pcm, song.sample_rate, f"sha256:guides-{bpm}-{seed}", backends={})
        if args.noise:
            analysis = detection_noise(analysis, seed)
        pitch_of = onset_pitches(analysis)
        truth = [{**s, "endBeat": float(s["startBeat"]) + 4 * int(s["bars"])} for s in song.structure]
        end_beat = max(s["endBeat"] for s in truth)
        name = f"{bpm:g} BPM seed {seed}" + (" (chorus first)" if form else "")
        print(f"\n== {name}")
        print(f"  {'chart':20s} " + " ".join(f"{SHORT[m]:>7s}" for m in MEASURES) + "   time")
        for key_mode, difficulty, level in charts:
            t0 = time.perf_counter()
            chart = generate_chart(analysis, key_mode, difficulty, level)
            dt = time.perf_counter() - t0
            g = guide_profile(chart["notes"], key_mode, truth, pitch_of, end_beat)
            c = chart_consistency(chart["notes"], truth, key_mode)
            row = {**g, "loopLane": c["loopLane"], "repeatLane": c["repeatLaneMirror"], "song": name}
            rows.append(row)
            label = f"{key_mode} {difficulty}{'' if level is None else ' ' + str(level)}"
            print(f"  {label:20s} " + " ".join(f"{fmt(row.get(m)):>7s}" for m in MEASURES) + f"  {dt:5.2f}s")
    print("\n== mean over all charts")
    means = []
    for m in MEASURES:
        vals = [float(r[m]) for r in rows if r.get(m) is not None]
        means.append(fmt(float(np.mean(vals))) if vals else "    -")
    print(f"  {'':20s} " + " ".join(f"{v:>7s}" for v in means))


if __name__ == "__main__":
    main()
