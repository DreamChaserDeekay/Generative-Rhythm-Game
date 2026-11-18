"""Why the app's measures do not finish on a chart: where they are after some seconds (the stack,
by faulthandler) and what the chart is like, in aggregate numbers only (docs/MAPPER_LORA.md).

    python scripts/mapper_chart_diagnose.py <dataset folder of scripts/lora/make_dataset.py> <beatmap id>...
"""

from __future__ import annotations

import faulthandler
import json
import sys
import traceback
from collections import Counter
from pathlib import Path

import pandas as pd

from mapper_keymode_report import chart_row, time_limit


def features(text: str) -> dict:
    """What a .osu is like, without its notes: counts, spans and the extremes of its timing."""
    def section(name: str) -> list[str]:
        body = text.split(f"[{name}]", 1)[1] if f"[{name}]" in text else ""
        return [l for l in body.split("\n[", 1)[0].splitlines() if l.strip() and not l.startswith("//")]

    objects = [l.split(",") for l in section("HitObjects")]
    times = sorted(float(f[2]) for f in objects if len(f) > 2)
    ends = [float(f[5].split(":")[0]) for f in objects if len(f) > 5 and int(f[3]) & 128]
    points = [l.split(",") for l in section("TimingPoints")]
    reds = [(float(f[0]), float(f[1])) for f in points if len(f) > 1 and (len(f) < 7 or f[6].strip() == "1")]
    lengths = [b for _, b in reds]
    gaps = [b - a for a, b in zip(times, times[1:]) if b > a]
    red_times = sorted(t for t, _ in reds)
    return {
        "objects": len(objects), "holds": len(ends), "firstMs": times[0] if times else None, "lastMs": times[-1] if times else None,
        "lastHoldEndMs": max(ends) if ends else None, "mostAtOneTime": max(Counter(times).values()) if times else 0,
        "shortestGapMs": min(gaps) if gaps else None, "timingPoints": len(points), "redLines": len(reds),
        "greenLines": len(points) - len(reds), "shortestBeatMs": min(lengths) if lengths else None,
        "longestBeatMs": max(lengths) if lengths else None, "beatsNotPositive": sum(b <= 0 for b in lengths),
        "firstRedMs": red_times[0] if red_times else None, "lastRedMs": red_times[-1] if red_times else None,
        "redsAtOneTime": max(Counter(red_times).values()) if red_times else 0,
        "shortestRedGapMs": min((b - a for a, b in zip(red_times, red_times[1:])), default=None),
        "metersSeen": sorted({f[2] for f in points if len(f) > 2})[:8],
        # how many beats the chart is long on its fastest tempo: what a per-beat loop would walk
        "beatsAtFastest": (times[-1] - times[0]) / min(b for b in lengths if b > 0) if times and any(b > 0 for b in lengths) else None,
    }


def main() -> None:
    folder, ids = Path(sys.argv[1]), {int(x) for x in sys.argv[2:]}
    try:  # a measure that takes all the memory fails here, not the machine
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (6 << 30, 6 << 30))
    except (ImportError, ValueError, OSError):
        pass
    meta = pd.read_parquet(folder / "metadata.parquet")
    for _, m in meta[meta["Id"].isin(ids)].iterrows():
        text = (folder / "data" / m["BeatmapSetFolder"] / m["BeatmapFile"]).read_text(encoding="utf-8-sig")
        mode = f"{int(m['KeyCount'])}K"
        print(f"\n== beatmap {m['Id']} ({mode}, {m['DifficultyRating']} stars)\n{json.dumps(features(text), ensure_ascii=False)}", flush=True)
        seconds = max(float(l.split(",")[2]) for l in text.split("[HitObjects]")[1].strip().splitlines()) / 1000.0
        # the stack after 6 s, and again after 12 s: the same frames twice are where it does not end
        faulthandler.dump_traceback_later(6, repeat=True, file=sys.stdout)
        try:
            with time_limit(14):
                chart_row(text, mode, "HARD", seconds)
            print("measured")
        except BaseException:  # noqa: BLE001
            traceback.print_exc(file=sys.stdout)
        finally:
            faulthandler.cancel_dump_traceback_later()
        sys.stdout.flush()


if __name__ == "__main__":
    main()
