"""Tempo level, beat phase, soundless notes and long notes against the synthetic songs' ground
truth (docs/PATTERN_DESIGN.md 16).

    python scripts/measure_tempo.py [--quick] [--jobs N]

tempo: every synth.DRUM_STYLES loop and the pop / groove / structured songs over a range of tempos
  right  the analysed tempo is the song's (trap counts at twice its tempo too, as it is often written)
  grid   every true beat is within 25 ms of an analysed beat
  down   at least 90% of the analysed downbeats are true downbeats
notes: pop 100 and 128, groove 112, structured 124, six charts each
  soundless  share of notes with no true onset within 30 ms
  holds      what each long note starts on: a held sung note (0.9 beat or longer) or a tonal sound
             without kick or snare ("held"), a drum hit, nothing, a shorter sung note; and the long
             notes that run over 0.5 beat past their sung note ("too long")
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rhythm_server.analysis.analyzer import analyze  # noqa: E402
from rhythm_server.generator.core import generate_chart  # noqa: E402
from rhythm_server.synth import DRUM_STYLES, make_drum_song, make_groove_song, make_pop_song, make_structured_song  # noqa: E402

SLOW = (72.0, 84.0, 92.0, 100.0, 112.0)
FAST = (150.0, 165.0, 175.0, 190.0, 200.0)
TEMPOS = {
    "pop8": SLOW, "pop16": SLOW, "hiphop": SLOW, "ballad": SLOW, "rock8bass": SLOW, "trap": (70.0, 75.0),
    "shuffle": (72.0, 88.0, 100.0, 120.0, 140.0), "triplet": (72.0, 88.0, 100.0, 120.0, 140.0),
    "4otf": FAST, "jcore": FAST, "punk": FAST, "eurobeat": FAST, "dnb": (170.0, 174.0, 178.0),
}
SONG_TEMPOS = (76.0, 86.0, 96.0, 100.0, 108.0, 128.0, 156.0, 172.0, 188.0)
MAKERS = {"pop": make_pop_song, "groove": make_groove_song, "structured": make_structured_song}
NOTE_SONGS = (("pop 100", lambda: make_pop_song(100.0, 1)), ("pop 128", lambda: make_pop_song(128.0, 2)),
              ("groove 112", lambda: make_groove_song(112.0, 2)), ("structured 124", lambda: make_structured_song(124.0, 1)))
CHARTS = (("6K", "GRG", "NORMAL", None), ("4K", "DJMAX", "NM", 6), ("6K", "DJMAX", "HD", 9), ("6K", "DJMAX", "MX", 13),
          ("4K+FX", "DJMAX", "HD", 9), ("8K", "EZ2ON", "HD", 13))
TONAL = ("bass", "pad", "pluck", "piano", "guitar")


def tempo_case(job: tuple[str, float, int]) -> tuple[str, float, float, bool, bool]:
    name, bpm, bars = job
    song = MAKERS[name](bpm, 3) if name in MAKERS else make_drum_song(name, bpm, bars)
    a = analyze(song.pcm, song.sample_rate, f"sha256:tempo-{name}-{bpm}", backends={})
    beats = np.array([b["t"] for b in a["beats"]]) / 1000.0
    marks = np.array([b["t"] for b in a["beats"] if b["isDownbeat"]]) / 1000.0
    downs = np.array(song.downbeats)
    grid = all(np.min(np.abs(beats - t)) < 0.025 for t in song.beats)
    inside = [m for m in marks if downs[0] - 0.05 <= m <= downs[-1] + 0.05]
    down = bool(inside) and float(np.mean([np.min(np.abs(downs - m)) < 0.03 for m in inside])) >= 0.9
    return name, bpm, float(a["tempo"]["bpm"]), grid, down


def note_case(job: tuple[str, int]) -> tuple[str, list[tuple[str, int, int, Counter]]]:
    name, k = job
    song = NOTE_SONGS[k][1]()
    a = analyze(song.pcm, song.sample_rate, f"sha256:notes-{name}", backends={})
    beat = song.beats[1] - song.beats[0]
    onsets = {kind: np.asarray(v) for kind, v in song.onsets.items() if v}
    every = np.sort(np.concatenate(list(onsets.values())))
    sung = [(st, en, (en - st) / beat) for st, en, _ in song.sustains]
    starts = np.array([st for st, _, _ in sung])

    def near(kind: str, t: float) -> bool:
        return kind in onsets and float(np.min(np.abs(onsets[kind] - t))) < 0.03

    rows = []
    for km, system, difficulty, level in CHARTS:
        notes = generate_chart(a, km, difficulty, level, system=system)["notes"]
        soundless = sum(1 for n in notes if float(np.min(np.abs(every - n["t"] / 1000.0))) >= 0.03)
        kinds: Counter = Counter()
        for n in notes:
            if n["type"] != "hold":
                continue
            t = n["t"] / 1000.0
            j = int(np.argmin(np.abs(starts - t))) if len(starts) else -1
            if j >= 0 and abs(starts[j] - t) < 0.03:
                kinds["held" if sung[j][2] >= 0.9 else "short sung"] += 1
                kinds["too long"] += int(n["endT"] / 1000.0 - sung[j][1] > 0.5 * beat)
            elif not near("kick", t) and not near("snare", t) and any(near(kind, t) for kind in TONAL):
                kinds["held"] += 1
            elif any(near(kind, t) for kind in ("kick", "snare", "hihat", "crash")):
                kinds["drum hit"] += 1
            else:
                kinds["nothing"] += 1
        rows.append((f"{km} {system} {difficulty} {level or ''}".strip(), len(notes), soundless, kinds))
    return name, rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="one tempo per style, no songs")
    ap.add_argument("--jobs", type=int, default=3)
    args = ap.parse_args()
    jobs = [(style, bpm, 48) for style in DRUM_STYLES if style in TEMPOS for bpm in (TEMPOS[style][:1] if args.quick else TEMPOS[style])]
    if not args.quick:
        jobs += [(name, bpm, 0) for name in MAKERS for bpm in SONG_TEMPOS]
    with Pool(args.jobs) as pool:
        results = sorted(pool.map(tempo_case, jobs))
        notes = pool.map(note_case, [(name, k) for k, (name, _) in enumerate(NOTE_SONGS)]) if not args.quick else []
    right = grid = down = 0
    for name, bpm, got, on_grid, on_down in results:
        ok = abs(got / bpm - 1) < 0.02 or (name == "trap" and abs(got / bpm - 2) < 0.04)
        right, grid, down = right + ok, grid + on_grid, down + on_down
        print(f"{name:10s} {bpm:5.0f} -> {got:7.2f} {'ok ' if ok else 'BAD'} grid {'ok' if on_grid else '--'} down {'ok' if on_down else '--'}")
    print(f"tempo right {right}/{len(results)}, every beat on the grid {grid}/{len(results)}, downbeats {down}/{len(results)}")
    total: Counter = Counter()
    for name, rows in notes:
        for chart, n, soundless, kinds in rows:
            total.update(kinds)
            print(f"{name:15s} {chart:18s} notes {n:4d} soundless {soundless / max(1, n):5.1%} holds {dict(sorted(kinds.items()))}")
    holds = sum(v for k, v in total.items() if k != "too long")
    if holds:
        print("holds:", {k: f"{v / holds:.1%}" if k != "too long" else v for k, v in sorted(total.items())}, f"of {holds}")


if __name__ == "__main__":
    main()
