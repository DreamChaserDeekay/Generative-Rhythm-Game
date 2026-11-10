"""Analyse the sample songs with the game's own server and export what the mockup shows.

Run the analysis server first (see README.md of the repo), then:
    python design-mockups/tools/export_songs.py http://127.0.0.1:8765

Reads design-mockups/_src/music/manifest.json (the freely licensed tracks and their credits),
uploads each track, waits for the analysis, asks for every key mode × difficulty (the game's own five steps) chart, and writes
    design-mockups/public/data/songs.json        the library: song, sketch, chart summaries
    design-mockups/public/data/<id>.json         onsets, beats and the charts' notes (compact)
    design-mockups/public/audio/<id>.mp3         the whole song (the play screen)
    design-mockups/public/audio/<id>.pre.mp3     24 s from the preview point (the song select)
Nothing here is made up: every number comes from the server's analysis and generator.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "_src" / "music"
OUT = ROOT / "public"
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
MODES = ["4K", "4K+FX", "5K", "6K", "6K+FX", "7K+1S", "8K"]
TIERS = ["EASY", "NORMAL", "HARD", "EXPERT", "MASTER"]
STEMS = ["drums", "bass", "vocals", "other"]
PREVIEW_S = 24


def call(path: str, body: dict | None = None, method: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method or ("POST" if data else "GET"))
    if data:
        req.add_header("content-type", "application/json")
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())


def upload(file: Path) -> dict:
    boundary = uuid.uuid4().hex
    head = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n'
    body = head.encode() + file.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(BASE + "/api/songs", data=body, method="POST")
    req.add_header("content-type", f"multipart/form-data; boundary={boundary}")
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())["song"]


def r1(v: float) -> float:
    return round(v, 1)


def main() -> None:
    manifest = json.loads((SRC / "manifest.json").read_text())
    (OUT / "data").mkdir(parents=True, exist_ok=True)
    (OUT / "audio").mkdir(parents=True, exist_ok=True)
    existing = {s["originalName"]: s for s in call("/api/songs")["songs"] if s.get("originalName")}
    library = []
    for entry in manifest:
        file = SRC / entry["file"]
        song = existing.get(file.name) or upload(file)
        while song["status"] not in ("ready", "error"):
            time.sleep(1.5)
            song = call(f"/api/songs/{song['id']}")["song"]
        if song["status"] == "error":
            print("analysis failed:", file.name, song["error"])
            continue
        sid = song["id"]
        # the credited title and artist (the file's tags may differ)
        if song["title"] != entry["title"] or song["artist"] != entry["artist"]:
            call(f"/api/songs/{sid}", {"title": entry["title"], "artist": entry["artist"]}, "PATCH")
            song = call(f"/api/songs/{sid}")["song"]
            while song["status"] not in ("ready", "error"):
                time.sleep(1.5)
                song = call(f"/api/songs/{sid}")["song"]
        sketch = call(f"/api/songs/{sid}/sketch")
        analysis = call(f"/api/songs/{sid}/analysis")
        charts: dict = {}
        summaries: dict = {}
        for mode in MODES:
            charts[mode] = {}
            summaries[mode] = {}
            for tier in TIERS:
                chart = call(f"/api/songs/{sid}/charts", {"keyMode": mode, "difficulty": tier, "system": "GRG"})["chart"]
                meta = chart["meta"]
                notes = chart["notes"]
                charts[mode][tier] = {
                    "meta": {k: meta[k] for k in ("chartId", "lanes", "level", "rating", "noteCount", "durationMs") if k in meta}
                    | ({"levelScale": meta["levelScale"]} if "levelScale" in meta else {}),
                    "timing": chart["timing"],
                    "sections": chart.get("sections", []),
                    "effects": chart.get("effects", []),
                    # beat, t, lane, endBeat, endT, stem
                    "notes": [
                        [round(n["beat"], 4), r1(n["t"]), n["lane"], round(n.get("endBeat", 0), 4), r1(n.get("endT", 0)), STEMS.index(n["src"]) if n.get("src") in STEMS else -1]
                        for n in notes
                    ],
                }
                summaries[mode][tier] = {
                    "chartId": meta["chartId"],
                    "level": meta["level"],
                    "levelScale": meta.get("levelScale"),
                    "rating": meta["rating"],
                    "noteCount": meta["noteCount"],
                    "longNotes": sum(1 for n in notes if n["type"] == "hold"),
                    "nps": meta["nps"],
                    "skillset": meta.get("skillset"),
                    "patterns": meta.get("patterns"),
                    "handLoad": meta.get("handLoad"),
                    "keysound": meta.get("keysound"),
                    "consistency": meta.get("consistency"),
                    "repeatConsistency": meta.get("repeatConsistency"),
                    "seed": (meta.get("generator") or {}).get("seed"),
                }
        onsets = {s: [] for s in STEMS}
        for o in analysis["onsets"]:
            onsets.setdefault(o.get("source") or "other", []).append([round(o["t"]), round(o["strength"], 2)])
        detail = {
            "id": sid,
            "beats": [round(b["t"]) for b in analysis["beats"]],
            "downbeats": [round(b["t"]) for b in analysis["beats"] if b["isDownbeat"]],
            "onsets": onsets,
            "waveform": {"frameMs": analysis["waveform"]["frameMs"], "peaks": [round(p, 3) for p in analysis["waveform"]["peaks"]]},
            "charts": charts,
        }
        (OUT / "data" / f"{sid}.json").write_text(json.dumps(detail, separators=(",", ":")))
        full = OUT / "audio" / f"{sid}.mp3"
        pre = OUT / "audio" / f"{sid}.pre.mp3"
        start = max(0.0, (song["previewMs"] or 0) / 1000)
        if not full.exists():
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(file), "-vn", "-map_metadata", "-1", "-ac", "2", "-ar", "44100", "-b:a", "96k", str(full)], check=True)
        if not pre.exists():
            fade = f"afade=t=in:d=0.6,afade=t=out:st={PREVIEW_S - 1.2}:d=1.2"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-t", str(PREVIEW_S), "-i", str(file), "-vn", "-map_metadata", "-1", "-af", fade, "-ac", "2", "-ar", "44100", "-b:a", "112k", str(pre)], check=True)
        library.append(
            {
                "id": sid,
                "title": song["title"],
                "artist": song["artist"],
                "durationMs": song["durationMs"],
                "bpm": song["bpm"],
                "bpmMin": song["bpmMin"],
                "bpmMax": song["bpmMax"],
                "previewMs": song["previewMs"],
                "analyzer": song.get("analyzer"),
                "sketch": sketch,
                "tempo": analysis["tempo"],
                "charts": summaries,
                "credit": {k: entry.get(k) for k in ("license", "license_url", "page_url", "attribution")},
            }
        )
        print(f"{song['title']} — {song['artist']}: {song['bpm']:.1f} BPM, {len(analysis['onsets'])} onsets")
    (OUT / "data" / "songs.json").write_text(json.dumps({"songs": library}, ensure_ascii=False, separators=(",", ":")))
    print(len(library), "songs")


if __name__ == "__main__":
    main()
