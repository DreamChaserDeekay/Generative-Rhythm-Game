"""How Mapperatorinator's charts differ by key count: the columns' shares, the hands, chords, jacks
and the pattern shapes of raw .osu files, a row per key mode and tier (docs/MAPPER_LORA.md).

    python scripts/mapper_keymode_report.py <folder> [--json out.json] [--label name] [--mmrs]

<folder> holds what .github/workflows/dpc-probe.yml keeps: `<song>.<mode>.<tier>.osu` and
`<song>.<mode>.json` (the song's seconds). The .osu files become charts the way the app makes them
(mapper/charts.notes_from_osu: overlapping notes dropped); nothing of the songs is read. The same
script on charts made with other conditions or a LoRA gives the numbers to hold against these.
With --mmrs the folder is a dataset scripts/lora/make_dataset.py made (people's charts): each chart
counts under the tier whose star rating the app asks for is nearest its own.
Needs the server package (`pip install -e ./server`). Only aggregate numbers are printed: the .osu
files and the songs stay out of the repository.
"""

from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

from rhythm_server.chart.tempo import TempoMap
from rhythm_server.config import difficulty_config, key_modes
from rhythm_server.difficulty.estimator import estimate
from rhythm_server.difficulty.patterns import pattern_profile
from rhythm_server.difficulty.tiers import resolve_tier
from rhythm_server.formats.common import normalize_notes
from rhythm_server.formats.osu import parse_osu
from rhythm_server.mapper import charts
from rhythm_server.mapper.runtime import mapper_config

TIERS = tuple(difficulty_config()["order"])
JACK_MS = 150.0  # a lane pressed again within this is a fast jack


def chart_row(text: str, mode: str, tier: str, seconds: float) -> dict:
    lanes = charts.columns(mode)
    # on the .osu's own timing (the level estimate reads the notes' beats)
    notes = normalize_notes(charts.notes_from_osu(text, lanes), TempoMap(parse_osu(text).timing))
    k = len(lanes)
    hands = [key_modes()[mode]["lanes"][i]["hand"] for i in lanes]
    per_col = Counter(lanes.index(n["lane"]) for n in notes)
    share = [per_col.get(c, 0) / len(notes) for c in range(k)]
    by_t: dict[float, list[int]] = defaultdict(list)
    for n in notes:
        by_t[round(n["t"], 1)].append(lanes.index(n["lane"]))
    sizes = Counter(min(len(v), 4) for v in by_t.values())
    # the same lane again: the gaps between a lane's notes in a row
    last: dict[int, float] = {}
    gaps = []
    for n in sorted(notes, key=lambda n: n["t"]):
        c = lanes.index(n["lane"])
        if c in last:
            gaps.append(n["t"] - last[c])
        last[c] = n.get("endT", n["t"])
    # a hand's side of each chord: chords pressed by one hand alone
    chords = [v for v in by_t.values() if len(v) >= 2]
    one_hand = sum(1 for v in chords if len({hands[c] for c in v}) == 1)
    params = resolve_tier(mode, tier, None)
    level = charts.target_level(mode, tier, None)
    est = estimate(notes, mode, len(key_modes()[mode]["lanes"]), max(seconds * 1000.0, max(n.get("endT", n["t"]) for n in notes) + 1.0),
                   params.min_jack_ms, params.level_table, params.level_factor)
    prof = pattern_profile(notes, mode)
    left = sum(s for s, h in zip(share, hands) if h == "L")
    right = sum(s for s, h in zip(share, hands) if h == "R")
    return {
        "notes": len(notes), "nps": len(notes) / seconds, "holds": sum(n["type"] == "hold" for n in notes) / len(notes),
        "cols": share, "minCol": min(share) * k, "maxCol": max(share) * k, "emptiest": share.index(min(share)),
        # 0: every column alike, 1: all notes on one column
        # a chart with a column all but unused (under half an even share): 7 keys and a scratch column
        "nearEmpty": float(min(share) * k < 0.5),
        "skew": 0.5 * sum(abs(s - 1.0 / k) for s in share) / (1.0 - 1.0 / k),
        "left": left, "right": right, "thumb": 1.0 - left - right,
        "chord1": sizes[1] / len(by_t), "chord2": sizes[2] / len(by_t), "chord3": sizes[3] / len(by_t), "chord4": sizes[4] / len(by_t),
        "oneHandChords": one_hand / len(chords) if chords else 0.0,
        "fastJacks": sum(g <= JACK_MS for g in gaps) / len(notes) * 1000.0,
        "level": est["level"], "target": level, "levelOver": est["level"] - level,
        **{key: prof[key] for key in ("stairs", "trills", "jacks", "holdTaps", "leaps", "alternation", "sameHandLeaps", "topShape")},
    }


def mean(rows: list[dict], key: str) -> float:
    return statistics.fmean(r[key] for r in rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path)
    ap.add_argument("--json", type=Path)
    ap.add_argument("--label", default="")
    ap.add_argument("--mmrs", action="store_true")
    a = ap.parse_args()
    rows: dict[tuple[str, str], list[dict]] = defaultdict(list)
    if a.mmrs:
        import pandas as pd

        cfg = mapper_config()
        for _, m in pd.read_parquet(a.folder / "metadata.parquet").iterrows():
            mode = f"{int(m['KeyCount'])}K"
            text = (a.folder / "data" / m["BeatmapSetFolder"] / m["BeatmapFile"]).read_text(encoding="utf-8-sig")
            tier = min(TIERS, key=lambda t: abs(charts.stars_of(charts.target_level(mode, t, None), cfg) - float(m["DifficultyRating"])))
            seconds = max(float(line.split(",")[2]) for line in text.split("[HitObjects]")[1].strip().splitlines()) / 1000.0
            try:
                rows[(mode, tier)].append(chart_row(text, mode, tier, seconds))
            except Exception as e:  # noqa: BLE001  (a chart the app's parser does not take)
                print(f"skipped {m['BeatmapFile']}: {e}")
    for osu in [] if a.mmrs else sorted(a.folder.glob("*.osu")):
        song, mode, tier = osu.name[: -len(".osu")].rsplit(".", 2)
        report = a.folder / f"{song}.{mode}.json"
        seconds = float(json.loads(report.read_text(encoding="utf-8"))["seconds"]) if report.exists() else None
        text = osu.read_text(encoding="utf-8-sig")
        if seconds is None:
            seconds = max(float(line.split(",")[2]) for line in text.split("[HitObjects]")[1].strip().splitlines()) / 1000.0
        rows[(mode, tier)].append(chart_row(text, mode, tier, seconds))
    modes = sorted({m for m, _ in rows}, key=lambda m: int(m[:-1]))
    tiers = [t for t in TIERS if any(t == x for _, x in rows)]
    out: dict[str, dict] = {}

    def table(title: str, cols: list[tuple[str, str, str]]) -> None:
        print(f"\n### {title}\n\n| 키 · 티어 | 채보 | " + " | ".join(c[0] for c in cols) + " |\n|---|---|" + "---|" * len(cols))
        for m in modes:
            for t in tiers + ["전체"]:
                rs = [r for (mm, tt), v in rows.items() if mm == m and (t == "전체" or tt == t) for r in v]
                if rs:
                    print(f"| {m} {t} | {len(rs)} | " + " | ".join(format(mean(rs, key), fmt) for _, key, fmt in cols) + " |")

    table("열의 쏠림 (minCol · maxCol: 가장 적은 · 많은 열의 몫 × 키 수, 고르면 1.00)", [
        ("가장 적은 열", "minCol", ".2f"), ("가장 많은 열", "maxCol", ".2f"), ("쏠림(0–1)", "skew", ".3f"), ("한 열이 빈 채보", "nearEmpty", ".2f"),
        ("왼손", "left", ".3f"), ("오른손", "right", ".3f"), ("엄지", "thumb", ".3f")])
    table("동시치기 (치는 순간 가운데 몫)", [
        ("1개", "chord1", ".3f"), ("2개", "chord2", ".3f"), ("3개", "chord3", ".3f"), ("4개 이상", "chord4", ".3f"),
        ("한 손만 쓴 동시치기", "oneHandChords", ".3f")])
    table("패턴 (pattern_profile, 건반 노트 가운데 몫)", [
        ("계단", "stairs", ".3f"), ("트릴", "trills", ".3f"), ("잭", "jacks", ".3f"), (f"{JACK_MS:.0f}ms 안 잭/1000", "fastJacks", ".1f"),
        ("롱노트 아래", "holdTaps", ".3f"), ("도약", "leaps", ".3f"), ("손 교대", "alternation", ".3f"), ("가장 흔한 모양", "topShape", ".3f")])
    table("밀도와 레벨", [
        ("초당 노트", "nps", ".2f"), ("롱노트 몫", "holds", ".3f"), ("목표 레벨", "target", ".1f"), ("잰 레벨", "level", ".1f"),
        ("차이", "levelOver", "+.1f")])
    print("\n### 열별 몫 (%, 키 모드의 모든 채보 평균) 과 가장 적게 쓴 열\n")
    for m in modes:
        rs = [r for (mm, _), v in rows.items() if mm == m for r in v]
        k = len(rs[0]["cols"])
        cols = [statistics.fmean(r["cols"][c] for r in rs) * 100 for c in range(k)]
        emptiest = Counter(r["emptiest"] + 1 for r in rs)
        print(f"- {m} ({len(rs)}개, 고르면 {100 / k:.1f}): " + " · ".join(f"{c:.1f}" for c in cols)
              + " / 가장 적은 열: " + ", ".join(f"{c}번 {n}개" for c, n in sorted(emptiest.items())))
        out[m] = {"charts": len(rs), "cols": [round(c, 2) for c in cols], "emptiest": dict(emptiest),
                  **{key: round(mean(rs, key), 4) for key in rs[0] if key not in ("cols", "emptiest")},
                  "tiers": {t: {key: round(mean(v, key), 4) for key in v[0] if key not in ("cols", "emptiest")}
                            for (mm, t), v in rows.items() if mm == m}}
    if a.json:
        a.json.write_text(json.dumps({"label": a.label, "modes": out}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
