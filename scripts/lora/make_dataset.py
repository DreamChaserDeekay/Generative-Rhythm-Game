"""Makes the dataset a Mapperatorinator LoRA is trained on: the osu!mania charts of one key count,
in the "mmrs" form its training reads (docs/MAPPER_LORA.md).

    <out>/metadata.parquet                 a row per chart
    <out>/data/<set>/audio.wav             the song (mono, 16 bit)
    <out>/data/<set>/<beatmap id>.osu      its charts of that key count

From the Hugging Face dataset the model was trained on (project-riz/osu-beatmaps: 74 tar files of
about 1 GB; every one has to be read through, but only the songs with a chart of the key count are
kept, a few GB):

    python make_dataset.py --keys 8 --out D:\\grg-lora\\8K

or from folders of your own, each holding a song and its .osu files (an osu! Songs folder):

    python make_dataset.py --keys 6 --out D:\\grg-lora\\6K --local "C:\\osu!\\Songs"

Stopped part way, the same command goes on from the last finished tar file. Runs in
Mapperatorinator's Python (the app's runtime folder) with soundfile added; nothing here loads the
model. What it downloads keeps the dataset's own terms (its card: "provided for research purposes
only"); nothing of it belongs in a public repository.

--min-column-share 0.5 leaves out charts whose emptiest column has less than half an even share of
the notes (8-key charts written as 7 keys and a scratch column), --statuses the ranked statuses kept
(1 ranked, 2 approved, 4 loved), --shards a part of the tar files (0-73), --osu-only no audio (to
count and measure the charts only).
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import tarfile
import urllib.request
from collections import Counter
from datetime import datetime
from pathlib import Path

REPO = "https://huggingface.co/datasets/project-riz/osu-beatmaps/resolve/main/compressed/data-{:06d}.tar"
SHARDS = 74
SPEEDS = (0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0)  # the clock rates of the StarRating column
AUDIO_TYPES = (".opus", ".mp3", ".ogg", ".wav", ".flac")


def osu_info(text: str) -> dict:
    """What a .osu file says of itself: mode, key count, ids, and the notes' share by column."""
    def field(name: str, default: str = "") -> str:
        m = re.search(rf"^{name}\s*:(.*)$", text, re.M)
        return m.group(1).strip() if m else default

    keys = int(round(float(field("CircleSize", "0") or 0)))
    cols: Counter[int] = Counter()
    body = text.split("[HitObjects]", 1)[1] if "[HitObjects]" in text else ""
    for line in body.splitlines():
        f = line.split(",")
        if len(f) >= 4 and keys:
            try:
                cols[min(keys - 1, max(0, int(float(f[0]) * keys / 512)))] += 1
            except ValueError:
                pass
    notes = sum(cols.values())
    return {
        "mode": int(field("Mode", "0") or 0), "keys": keys, "notes": notes, "special": field("SpecialStyle", "0") == "1",
        "beatmap_id": int(field("BeatmapID", "0") or 0), "beatmapset_id": int(field("BeatmapSetID", "0") or 0),
        "audio": field("AudioFilename"), "title": field("Title"), "version": field("Version"),
        "min_share": min((cols.get(c, 0) / notes * keys for c in range(keys)), default=0.0) if notes else 0.0,
    }


def stars(text: str) -> list[float]:
    import rosu_pp_py as rosu

    beatmap = rosu.Beatmap(content=text)
    out = []
    for speed in SPEEDS:
        difficulty = rosu.Difficulty()
        difficulty.set_clock_rate(clock_rate=speed)
        out.append(round(float(difficulty.calculate(beatmap).stars), 2))
    return out


def write_wav(data: bytes, path: Path) -> float:
    """The song as mono 16-bit WAV (Mapperatorinator reads it without ffmpeg); its seconds."""
    import soundfile as sf

    pcm, rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    sf.write(path, pcm.mean(axis=1), rate, subtype="PCM_16")
    return len(pcm) / rate


def keep(info: dict, a: argparse.Namespace) -> bool:
    return info["mode"] == 3 and info["keys"] == a.keys and info["notes"] >= a.min_notes and info["min_share"] >= a.min_column_share


def add_set(a: argparse.Namespace, set_id: int, audio: bytes | None, charts: list[tuple[dict, str, dict]]) -> list[dict]:
    """One song's folder and its metadata rows; `charts`: (osu_info, .osu text, more columns)."""
    folder = a.out / "data" / str(set_id)
    folder.mkdir(parents=True, exist_ok=True)
    if audio is not None:
        try:
            write_wav(audio, folder / "audio.wav")
        except Exception as e:  # noqa: BLE001  (an audio file soundfile cannot read: the song is left out)
            print(f"  set {set_id}: audio not read ({e})", file=sys.stderr)
            return []
    rows = []
    for info, text, more in charts:
        try:
            rating = stars(text)
        except Exception as e:  # noqa: BLE001
            print(f"  beatmap {info['beatmap_id']}: no star rating ({e})", file=sys.stderr)
            continue
        (folder / f"{info['beatmap_id']}.osu").write_text(text, encoding="utf-8", newline="\n")
        rows.append({
            "BeatmapSetId": set_id, "Id": info["beatmap_id"], "BeatmapSetFolder": str(set_id), "BeatmapFile": f"{info['beatmap_id']}.osu",
            "AudioFile": "audio.wav", "ModeInt": 3, "KeyCount": info["keys"], "StarRating": rating, "DifficultyRating": rating[2],
            "Ranked": 1, "RankedDate": "2020-01-01 00:00:00", "SubmittedDate": "2020-01-01 00:00:00", "UserId": 0,
            "Title": info["title"], "Version": info["version"], "Notes": info["notes"], "MinColumnShare": round(info["min_share"], 3),
            "SpecialStyle": info["special"], **more,
        })
    return rows


def from_shard(a: argparse.Namespace, index: int) -> list[dict]:
    """The wanted charts of one tar file of the Hugging Face dataset, read as it downloads."""
    rows: list[dict] = []
    audio: dict[str, bytes] = {}  # songs whose json has not come yet (the last few)
    wanted: dict[str, list] = {}  # picked charts whose song has not come yet
    nothing: set[str] = set()  # samples with no chart to keep

    def done(key: str) -> None:
        song, picked = audio.pop(key, None), wanted.pop(key)
        for set_id in sorted({info["beatmapset_id"] for info, _, _ in picked}):
            rows.extend(add_set(a, set_id, song, [c for c in picked if c[0]["beatmapset_id"] == set_id]))

    request = urllib.request.Request(REPO.format(index), headers={"User-Agent": "make_dataset.py"})
    with urllib.request.urlopen(request, timeout=120) as resp, tarfile.open(fileobj=resp, mode="r|") as tar:
        for member in tar:
            if not member.isfile():
                continue
            key, _, ext = member.name.rpartition(".")
            if ext == "json":
                picked = []
                for b in json.loads(tar.extractfile(member).read())["beatmaps"]:
                    if int(b.get("mode", 0)) != 3 or int(round(float(b.get("diff_size") or 0))) != a.keys or int(b.get("approved", 1)) not in a.statuses:
                        continue
                    info = osu_info(b["content"])
                    info.update(beatmap_id=int(b["beatmap_id"]), beatmapset_id=int(b["beatmapset_id"]))
                    if keep(info, a):
                        picked.append((info, b["content"], {
                            "Ranked": int(b["approved"]), "RankedDate": b.get("approved_date") or b.get("submit_date"),
                            "SubmittedDate": b.get("submit_date"), "UserId": int(b.get("creator_id") or 0),
                        }))
                if not picked:
                    nothing.add(key)
                    audio.pop(key, None)
                    continue
                wanted[key] = picked
                if a.osu_only or key in audio:
                    done(key)
            elif "." + ext in AUDIO_TYPES and not a.osu_only and key not in nothing:
                audio[key] = tar.extractfile(member).read()
                if key in wanted:
                    done(key)
                while len(audio) > 3:  # its json came long ago or never will
                    del audio[next(iter(audio))]
    return rows


def from_local(a: argparse.Namespace) -> list[dict]:
    """Folders of a song and its .osu files (an osu! Songs folder): the charts of the key count."""
    rows: list[dict] = []
    for n, folder in enumerate(sorted(p for p in a.local.iterdir() if p.is_dir())):
        picked = []
        for osu in sorted(folder.glob("*.osu")):
            text = osu.read_text(encoding="utf-8-sig", errors="replace")
            info = osu_info(text)
            if keep(info, a):
                info["beatmap_id"] = info["beatmap_id"] or 900_000_000 + len(rows) + len(picked) + n * 100
                picked.append((info, text, {}))
        if not picked:
            continue
        song = folder / picked[0][0]["audio"]
        if not a.osu_only and not song.is_file():
            print(f"  {folder.name}: no audio file {picked[0][0]['audio']}", file=sys.stderr)
            continue
        set_id = picked[0][0]["beatmapset_id"] if picked[0][0]["beatmapset_id"] > 0 else 900_000_000 + n
        rows += add_set(a, set_id, None if a.osu_only else song.read_bytes(), picked)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--keys", type=int, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--local", type=Path)
    ap.add_argument("--shards", default=f"0-{SHARDS - 1}")
    ap.add_argument("--statuses", type=int, nargs="+", default=[1, 2, 4])
    ap.add_argument("--min-column-share", type=float, default=0.0)
    ap.add_argument("--min-notes", type=int, default=50)
    ap.add_argument("--osu-only", action="store_true")
    a = ap.parse_args()
    parts = a.out / "parts"
    parts.mkdir(parents=True, exist_ok=True)
    if a.local:
        (parts / "local.json").write_text(json.dumps(from_local(a)), encoding="utf-8")
    else:
        first, _, last = a.shards.partition("-")
        for index in range(int(first), int(last or first) + 1):
            part = parts / f"shard-{index:03d}.json"
            if part.exists():
                continue
            rows = from_shard(a, index)
            part.write_text(json.dumps(rows), encoding="utf-8")
            print(f"tar {index}: {len(rows)} charts of {len({r['BeatmapSetId'] for r in rows})} songs", flush=True)
    import pandas as pd

    rows = [r for part in sorted(parts.glob("*.json")) for r in json.loads(part.read_text(encoding="utf-8"))]
    if not rows:
        sys.exit("no chart of that key count was found")
    df = pd.DataFrame(rows).drop_duplicates("Id")
    for column in ("RankedDate", "SubmittedDate"):
        df[column] = pd.to_datetime(df[column], errors="coerce").fillna(datetime(2020, 1, 1))
    df.to_parquet(a.out / "metadata.parquet", index=False)
    sets = df["BeatmapSetId"].nunique()
    print(json.dumps({"charts": len(df), "songs": sets, "keys": a.keys, "medianStars": round(float(df["DifficultyRating"].median()), 2),
                      "specialStyle": int(df["SpecialStyle"].sum()), "out": str(a.out)}))
    print(f"train with: train_dataset_end={sets}")


if __name__ == "__main__":
    main()
