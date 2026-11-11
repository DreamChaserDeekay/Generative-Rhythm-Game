"""The feel regression set (docs/PATTERN_DESIGN.md 95): the charts of a song library measured the way
a player's remarks are about — hits per second against the song's mean, notes per hit, the
instruments followed, drums on the strong beats, the bars' first beats — per section and in the
watched windows of `feel_windows.json` (the passages earlier remarks were about). Run it for two
generators and compare, before a merge:

    python -I server/scripts/feel_report.py run --library <data dir> --out new.json
    python -I server/scripts/feel_report.py run --library <data dir> --out old.json --repo <checkout of the old generator>
    python -I server/scripts/feel_report.py compare old.json new.json
    python -I server/scripts/feel_report.py show new.json --song "Emerald Sword"

`--saved mapperatorinator` measures the charts the app made and saved instead of generating them
(the newest of each key mode and tier whose generator starts so: the Mapperatorinator branch's
charts, made on the GPU when opened; docs/MAPPERATORINATOR.md):

    python -I server/scripts/feel_report.py run --library <data dir> --saved mapperatorinator --out ai.json

`--library` is the app's data folder (library.sqlite3 and songs/<id>/analysis.json), or several
(the editions of the app each keep their own; a song in several counts once, from the first);
`--analysis` takes analysis.json files instead. Only analyses are read (no audio), and the results stay where
`--out` puts them: they name the songs, so they are not for the repository.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sqlite3
import statistics
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve()
DEFAULT_CHARTS = "6K:HARD,6K:ELITE,7K+1S:EXPERT,7K+1S:MASTER"
LEADS = ("guitar", "piano")


def load_feel():
    """feel.py of this checkout (it imports only numpy), whichever generator is measured."""
    spec = importlib.util.spec_from_file_location("grg_feel", HERE.parents[1] / "rhythm_server" / "generator" / "feel.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_repo: str | None = None


def _init(repo: str) -> None:
    global _repo
    _repo = repo
    sys.path.insert(0, str(Path(repo) / "server"))


def songs_of(args: argparse.Namespace) -> list[dict[str, Any]]:
    out = []
    seen: set[str] = set()
    for lib in args.library or []:
        root = Path(lib)
        db = sqlite3.connect(f"file:{root / 'library.sqlite3'}?mode=ro", uri=True)
        for sid, title, artist in db.execute("SELECT id, title, artist FROM songs ORDER BY title"):
            path = root / "songs" / sid / "analysis.json"
            # a song in two libraries (two editions of the app) counts once: the first library's analysis
            if path.is_file() and title.lower() not in seen:
                seen.add(title.lower())
                out.append({"id": sid, "title": title, "artist": artist, "path": str(path), "library": str(root)})
        db.close()
    for p in args.analysis or []:
        out.append({"id": Path(p).parent.name, "title": Path(p).parent.name, "artist": "", "path": str(Path(p).resolve())})
    if args.songs:
        want = [w.strip().lower() for w in args.songs.split(",") if w.strip()]
        out = [s for s in out if any(w in s["title"].lower() for w in want)]
    return out


def watched(windows: list[dict[str, Any]], title: str) -> list[dict[str, Any]]:
    return [w for w in windows if w["song"].lower() in title.lower()]


def saved_chart(song: dict[str, Any], key_mode: str, tier: str, prefix: str) -> dict[str, Any]:
    """The newest chart of the song the app saved for this key mode and tier, by a generator whose
    version starts with `prefix`."""
    root = Path(song.get("library") or "")
    db = sqlite3.connect(f"file:{root / 'library.sqlite3'}?mode=ro", uri=True)
    try:
        row = db.execute(
            "SELECT id FROM charts WHERE song_id = ? AND key_mode = ? AND difficulty = ? AND generator_version LIKE ? ORDER BY created_at DESC LIMIT 1",
            (song["id"], key_mode, tier, prefix + "%"),
        ).fetchone()
    finally:
        db.close()
    if row is None:
        raise LookupError(f"no saved {prefix} chart (open it in the app first)")
    return json.loads((root / "charts" / f"{row[0]}.json").read_text(encoding="utf-8"))


def job(song: dict[str, Any], charts: list[tuple[str, str]], windows: list[dict[str, Any]], saved: str | None = None) -> dict[str, Any]:
    from rhythm_server.generator.core import GENERATOR_VERSION, generate_chart

    feel = load_feel()
    a = json.loads(Path(song["path"]).read_text(encoding="utf-8"))
    mine = [(float(w["from"]) * 1000.0, float(w["to"]) * 1000.0) for w in watched(windows, song["title"]) if "from" in w]
    info = a.get("analyzer", {})
    rec = {"title": song["title"], "artist": song["artist"], "analyzer": info.get("version"), "backends": info.get("backends"),
           "durationSec": round(float(a["durationMs"]) / 1000.0, 1), "bpm": a.get("tempo", {}).get("bpm"), "generator": saved or GENERATOR_VERSION, "charts": {}}
    for key_mode, tier in charts:
        try:
            chart = saved_chart(song, key_mode, tier, saved) if saved else generate_chart(a, key_mode, tier, None)
        except Exception as e:  # a tier the song does not make (TierNotMade) or a failure to report
            rec["charts"][f"{key_mode}:{tier}"] = {"error": f"{type(e).__name__}: {e}"}
            continue
        f = feel.chart_feel(chart["notes"], a, mine)
        f["level"] = chart["meta"]["level"]
        rec["charts"][f"{key_mode}:{tier}"] = f
    return rec


def run(args: argparse.Namespace) -> None:
    repo = str(Path(args.repo).resolve()) if args.repo else str(HERE.parents[2])
    windows = json.loads(Path(args.windows).read_text(encoding="utf-8"))["windows"]
    charts = [tuple(c.strip().split(":")) for c in args.charts.split(",")]
    songs = songs_of(args)
    if not songs:
        sys.exit("no analysis found")
    print(f"# {len(songs)} songs, generator from {repo}", flush=True)
    results = []
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init, initargs=(repo,)) as pool:
        futs = [pool.submit(job, s, charts, windows, args.saved) for s in songs]
        for k, fut in enumerate(futs, 1):
            results.append(fut.result())
            if k % 10 == 0 or k == len(futs):
                print(f"  {k}/{len(futs)}", flush=True)
    out = {"repo": repo, "generator": results[0]["generator"], "charts": [f"{k}:{t}" for k, t in charts], "windows": windows, "songs": results}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print_summary(out)


# ---------- reading results ----------


def med(values: list[float | None]) -> float | None:
    v = [x for x in values if x is not None]
    return statistics.median(v) if v else None


def fmt(x: float | None, pct: bool = False, digits: int = 2) -> str:
    if x is None:
        return "-"
    return f"{100 * x:.0f}%" if pct else f"{x:.{digits}f}"


def summary(res: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Per chart, the medians over the songs: the numbers to watch across a change."""
    out: dict[str, dict[str, Any]] = {}
    for spec in res["charts"]:
        cs = [s["charts"].get(spec) for s in res["songs"]]
        cs = [c for c in cs if c and "error" not in c and c.get("hits")]
        secs = [r for c in cs for r in c["sections"]]
        leads = [r for r in secs if r.get("lead") in LEADS]
        row: dict[str, Any] = {
            "songs": len(cs),
            "level": med([c["level"] for c in cs]),
            "hitsPerSec": med([c["hitsPerSec"] for c in cs]),
            "notesPerHit": med([c["notesPerHit"] for c in cs]),
            "peak4": med([c["peak4"] for c in cs]),
            "highlight": med([c["highlight"] for c in cs]),
            "highlightUnder1": sum(1 for c in cs if c["highlight"] is not None and c["highlight"] < 1.0),
            "sixteenths": med([r["sixteenths"] for r in secs]),
            "switches": med([r["switches"] for r in secs]),
            "run4": med([r["run4"] for r in secs]),
            "strongDrums": med([r["strongDrums"] for r in secs]),
            "downbeats": med([r["downbeats"] for r in secs]),
            "drums": med([r["src"]["drums"] for r in secs]),
            "leadSections": len(leads),
            "leadHitsRatio": med([r["hitsRatio"] for r in leads]),
            "leadNotesPerHit": med([r["notesPerHit"] for r in leads]),
            "leadSixteenths": med([r["sixteenths"] for r in leads]),
            "leadDrums": med([r["src"]["drums"] for r in leads]),
            "leadOnLead": med([r["onLead"] for r in leads]),
        }
        for label in ("intro", "verse", "chorus", "bridge", "outro"):
            rs = [r for r in secs if r["label"] == label]
            row[f"{label}HitsRatio"] = med([r["hitsRatio"] for r in rs])
            row[f"{label}NotesPerHit"] = med([r["notesPerHit"] for r in rs])
        out[spec] = row
    return out


SUMMARY_ROWS = [
    ("songs", "songs", None), ("level", "level (median)", 1), ("hitsPerSec", "hits/s", 2), ("notesPerHit", "notes/hit", 2),
    ("peak4", "densest 4 bars / median", 2), ("highlight", "highlight / densest other section", 2), ("highlightUnder1", "songs where another section is denser", None),
    ("chorusHitsRatio", "chorus hits / song", 2), ("verseHitsRatio", "verse hits / song", 2), ("bridgeHitsRatio", "bridge hits / song", 2),
    ("introHitsRatio", "intro hits / song", 2), ("outroHitsRatio", "outro hits / song", 2), ("chorusNotesPerHit", "chorus notes/hit", 2), ("verseNotesPerHit", "verse notes/hit", 2),
    ("sixteenths", "gaps of a 16th or less (16th runs)", "%"), ("switches", "instrument changes per hit", 2), ("run4", "main instrument share per 4 bars", 2), ("drums", "drum notes", "%"),
    ("strongDrums", "drum notes on beats 1/3", "%"), ("downbeats", "struck first beats with a note", "%"),
    ("leadSections", "guitar/piano lead sections", None), ("leadHitsRatio", "  their hits / song", 2), ("leadNotesPerHit", "  their notes/hit", 2),
    ("leadSixteenths", "  their gaps of a 16th or less", "%"), ("leadDrums", "  their drum notes", "%"), ("leadOnLead", "  their hits on the lead's notes", "%"),
]


def _cell(v: Any, how: Any) -> str:
    if how == "%":
        return fmt(v, pct=True)
    if how is None:
        return "-" if v is None else str(v)
    return fmt(v, digits=how)


def print_summary(res: dict[str, Any], other: dict[str, Any] | None = None) -> None:
    now = summary(res)
    old = summary(other) if other else None
    specs = res["charts"]
    print(f"\n## summary over songs (median) — generator {res['generator']}" + (f" against {other['generator']} (old → new)" if other else ""))
    print(f"  {'':40s}" + "".join(f"{s:>22s}" for s in specs))
    for key, name, how in SUMMARY_ROWS:
        cells = []
        for s in specs:
            v = _cell(now[s].get(key), how)
            cells.append(f"{_cell(old[s].get(key), how) + ' → ' + v if old and s in old else v:>22s}")
        print(f"  {name:40s}" + "".join(cells))
    print_windows(res, other)


WINDOW_KEYS = [("hitsPerSec", "hits/s", 1), ("hitsRatio", "x song", 2), ("notesPerHit", "notes/hit", 2), ("sixteenths", "16th gaps", "%"),
               ("drums", "drums", "%"), ("tune", "tune", "%"), ("strongDrums", "drums on 1/3", "%"), ("onLead", "on lead", "%"),
               ("switches", "changes", 2), ("downbeats", "1st beats", "%")]


def _wval(w: dict[str, Any], key: str) -> Any:
    if key == "drums":
        return w["src"]["drums"]
    if key == "tune":
        return (w["src"]["vocals"] or 0.0) + (w["src"]["other"] or 0.0) if w["src"]["vocals"] is not None else None
    return w.get(key)


def print_windows(res: dict[str, Any], other: dict[str, Any] | None = None) -> None:
    olds = {s["title"]: s for s in other["songs"]} if other else {}
    for wdef in res["windows"]:
        songs = [s for s in res["songs"] if wdef["song"].lower() in s["title"].lower()]
        if not songs:
            print(f"\n## watched: {wdef['song']} — not in this library")
            continue
        for s in songs:
            span = f" {wdef['from']}-{wdef['to']}s" if "from" in wdef else " (sections)"
            print(f"\n## watched: {s['title']}{span} — {wdef.get('what', '')}")
            for spec in res["charts"]:
                c = s["charts"].get(spec, {})
                o = olds.get(s["title"], {}).get("charts", {}).get(spec) if other else None
                if "error" in c:
                    print(f"  {spec:14s} {c['error']}")
                    continue
                if "from" not in wdef:
                    print_sections(spec, c, o)
                    continue
                mine = [w for w in c["windows"] if abs(w["t"] - float(wdef["from"])) < 0.05 and abs(w["endT"] - float(wdef["to"])) < 0.05]
                theirs = [w for w in (o or {}).get("windows", []) if abs(w["t"] - float(wdef["from"])) < 0.05 and abs(w["endT"] - float(wdef["to"])) < 0.05]
                if not mine:
                    continue
                w, wo = mine[0], (theirs[0] if theirs else None)
                cells = []
                for key, name, how in WINDOW_KEYS:
                    v = _cell(_wval(w, key), how)
                    cells.append(f"{name} {_cell(_wval(wo, key), how) + '→' + v if wo else v}")
                lv = f"lv {o['level']}→{c['level']}" if o and "level" in o else f"lv {c['level']}"
                print(f"  {spec:14s} {lv:9s} | " + " | ".join(cells))


def print_sections(spec: str, c: dict[str, Any], o: dict[str, Any] | None) -> None:
    lv = f"lv {o['level']}→{c['level']}" if o and "level" in o else f"lv {c['level']}"
    print(f"  {spec} {lv} | {c['hitsPerSec']} hits/s, {c['notesPerHit']} notes/hit, peak4 {c['peak4']}, highlight {c['highlight']}"
          + (f" (old {o['hitsPerSec']} hits/s, {o['notesPerHit']} notes/hit, peak4 {o['peak4']}, highlight {o['highlight']})" if o and "hits" in o else ""))
    old_rows = {(r["t"], r["label"]): r for r in (o or {}).get("sections", [])}
    for r in c["sections"]:
        ro = old_rows.get((r["t"], r["label"]))
        ml = f"/{r['mlLabel']}" if r.get("mlLabel") else ""
        lead = f" lead {r['lead']}" if r.get("lead") in LEADS else ""
        was = f" (old {fmt(ro['hitsRatio'])}x {fmt(ro['notesPerHit'])}n)" if ro else ""
        print(f"    {r['t']:6.1f}-{r['endT']:6.1f}s {r['label']}{ml} {r['group']} e{r['energy']}{lead}: {fmt(r['hitsRatio'])}x {fmt(r['notesPerHit'])}n/h{was}"
              f" | drums {fmt(r['src']['drums'], True)} on 1/3 {fmt(r['strongDrums'], True)} | changes {fmt(r['switches'])} | 16ths {fmt(r['sixteenths'], True)} | music {r['music']['onsetsPerSec']}/s")


def compare(args: argparse.Namespace) -> None:
    old = json.loads(Path(args.old).read_text(encoding="utf-8"))
    new = json.loads(Path(args.new).read_text(encoding="utf-8"))
    print_summary(new, old)
    # the songs that moved most: the highlight order and the densest stretch
    olds = {s["title"]: s for s in old["songs"]}
    moves = []
    for s in new["songs"]:
        o = olds.get(s["title"])
        if not o:
            continue
        for spec in new["charts"]:
            c, co = s["charts"].get(spec, {}), o["charts"].get(spec, {})
            if "hits" not in c or "hits" not in co:
                continue
            for key in ("highlight", "peak4", "notesPerHit"):
                if c.get(key) is not None and co.get(key) is not None:
                    moves.append((abs(c[key] - co[key]), s["title"], spec, key, co[key], c[key]))
            if c.get("level") != co.get("level"):
                moves.append((0.5, s["title"], spec, "level", co.get("level"), c.get("level")))
    moves.sort(reverse=True)
    print("\n## biggest changes per song")
    for _, title, spec, key, a, b in moves[: args.top]:
        print(f"  {title[:40]:40s} {spec:14s} {key:12s} {a} → {b}")


def show(args: argparse.Namespace) -> None:
    res = json.loads(Path(args.results).read_text(encoding="utf-8"))
    for s in res["songs"]:
        if args.song.lower() in s["title"].lower():
            print(f"\n## {s['title']} — {s['artist']} | analyzer {s['analyzer']} {json.dumps(s['backends'])} | {s['durationSec']}s BPM {s['bpm']} | generator {s['generator']}")
            for spec in res["charts"]:
                c = s["charts"].get(spec, {})
                if "error" in c:
                    print(f"  {spec} {c['error']}")
                else:
                    print_sections(spec, c, None)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--library", nargs="*", help="the app's data folders (library.sqlite3, songs/); a song in several counts once, from the first")
    r.add_argument("--analysis", nargs="*", help="analysis.json files instead of a library")
    r.add_argument("--songs", help="only titles containing one of these (comma-separated)")
    r.add_argument("--windows", default=str(HERE.with_name("feel_windows.json")))
    r.add_argument("--charts", default=DEFAULT_CHARTS)
    r.add_argument("--repo", help="the checkout whose generator to measure (default: this one)")
    r.add_argument("--workers", type=int, default=max(1, min(6, (os.cpu_count() or 2) - 1)))
    r.add_argument("--saved", help="measure the saved charts whose generator version starts so (e.g. mapperatorinator) instead of generating")
    r.add_argument("--out", required=True)
    c = sub.add_parser("compare")
    c.add_argument("old")
    c.add_argument("new")
    c.add_argument("--top", type=int, default=15)
    s = sub.add_parser("show")
    s.add_argument("results")
    s.add_argument("--song", required=True)
    args = ap.parse_args()
    {"run": run, "compare": compare, "show": show}[args.cmd](args)


if __name__ == "__main__":
    main()
