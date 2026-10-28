"""Song structure against the sections a person marked on real songs (docs/PATTERN_DESIGN.md 69).

    python scripts/measure_structure.py capture TRUTH.json CACHE --music DIR [--music DIR ...]
    python scripts/measure_structure.py score TRUTH.json CACHE [--split SPLIT.json] [--songs] [--rules R,R…] [--parts P,P…]
    python scripts/measure_structure.py score TRUTH.json CACHE --split SPLIT.json --sweep [--parts P,P…]

TRUTH.json is what the marking page exports: {"songs": [{"file", "size", "durationS", "sections":
[{"t", "label", "group"}]}]}, t in seconds from the start of the file and group "" for "by label".
capture finds each song under the --music folders (file name and size), analyses it once and stores
the structure step's inputs in CACHE (no audio); score replays the current structure step on them
and prints numbers only (per-song lines with --songs):

  HR.5F HR3F  boundary hit rate F within 0.5 s / 3 s (song start excluded, one-to-one matching)
  label       share of time with the marked label (drop counts as chorus, "unknown" is left out)
  groupF      pairwise F of the repetition groups (two moments in one group in both)
  So Su       over- / under-segmentation (normalised conditional entropy of the groups, 1 = none)
  chP chR     share of the found chorus inside a marked chorus / of the marked chorus found
  preview     the first found chorus starts inside a marked chorus

and the kinds of error: boundaries within 3 s but not 0.5 s (how many bars off), marked boundaries
missed, found boundaries with nothing marked near, and time per (marked, found) label.
SPLIT.json ({"dev": ["file|size" …], "test": […]}) prints the songs the rules were tuned on apart
from the ones kept for checking; --parts keeps only those parts (also out of "all"), so songs kept
for a last check stay unseen.

--rules turns on exactly the named label and boundary rules of the structure step (structure.
LABEL_RULES, BOUNDARY_RULES; "none" is analyzer 1.11.0, "default" what the analyzer uses). --sweep
scores "none", "default", each rule alone and the default without each rule, one line per rule set
and part (docs/PATTERN_DESIGN.md 69-12).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rhythm_server.analysis import analyzer as A  # noqa: E402
from rhythm_server.analysis import structure as S  # noqa: E402
from rhythm_server.config import SAMPLE_RATE  # noqa: E402

FRAME_S = 0.5
CHORUS = {"chorus", "drop"}
LABELS = ("intro", "verse", "pre-chorus", "chorus", "bridge", "outro")


def song_key(song: dict) -> str:
    return hashlib.sha1(f"{song['file']}|{song.get('size', '')}".encode("utf-8")).hexdigest()[:12]


def find_audio(songs: list[dict], roots: list[str]) -> dict[str, Path]:
    wanted = {s["file"] for s in songs}
    found: dict[str, Path] = {}
    for root in roots:
        for d, _, files in os.walk(root):
            for f in files:
                if f in wanted:
                    p = Path(d) / f
                    for s in songs:
                        if s["file"] == f and (not s.get("size") or p.stat().st_size == s["size"]):
                            found.setdefault(song_key(s), p)
    return found


def decode(path: Path) -> np.ndarray:
    try:
        from rhythm_server.audio_io import decode_audio
    except ImportError:  # no PyAV on this Python: libsndfile reads FLAC, MP3, OGG and WAV
        import soundfile as sf
        from scipy.signal import resample_poly

        pcm, sr = sf.read(str(path), dtype="float32", always_2d=True)
        g = np.gcd(SAMPLE_RATE, sr)
        return pcm if sr == SAMPLE_RATE else resample_poly(pcm, SAMPLE_RATE // g, sr // g, axis=0).astype(np.float32)
    return decode_audio(path)


def capture(truth: dict, cache: Path, roots: list[str], force: bool) -> None:
    if sys.platform == "win32":  # the PC also runs the user's other work
        import ctypes

        k = ctypes.windll.kernel32
        k.GetCurrentProcess.restype = ctypes.c_void_p  # a 64-bit pseudo handle; the int default truncates it
        k.SetPriorityClass(ctypes.c_void_p(k.GetCurrentProcess()), 0x4000)  # BELOW_NORMAL_PRIORITY_CLASS
    cache.mkdir(parents=True, exist_ok=True)
    todo = [s for s in truth["songs"] if force or not (cache / f"{song_key(s)}.npz").exists()]
    paths = find_audio(todo, roots)
    grabbed: dict = {}
    original = A.song_sections

    def grab(x, ml_struct=None):
        grabbed["x"] = x
        return original(x, ml_struct)

    A.song_sections = grab
    for s in todo:
        key = song_key(s)
        if key not in paths:
            print(f"not found: {s['file']}")
            continue
        pcm = decode(paths[key])
        A.analyze(pcm, SAMPLE_RATE, backends={})
        x = grabbed.pop("x")
        np.savez_compressed(
            cache / f"{key}.npz", log_mel=x.log_mel.astype(np.float32), chroma=x.chroma.astype(np.float32), frame_rate=x.frame_rate,
            rms_db=x.rms_db.astype(np.float32), beats=x.beats, beat0=x.beat0, beats_per_bar=x.beats_per_bar, times=x.times,
            strength=x.strength, bands=x.bands, duration=len(pcm) / SAMPLE_RATE,
        )
        print(f"{key} {len(pcm) / SAMPLE_RATE:6.1f}s {len(x.beats)} beats", flush=True)


def replay(z) -> tuple[list[float], list[str], list[str], float]:
    """Section starts (s), labels and groups of the current structure step, and the bar length (s)."""
    x = A.StructureInputs(
        z["log_mel"].astype(np.float64), z["chroma"].astype(np.float64), float(z["frame_rate"]), z["rms_db"].astype(np.float64),
        z["beats"], int(z["beat0"]), int(z["beats_per_bar"]), z["times"], z["strength"], z["bands"],
    )
    secs = A.song_sections(x)
    beats = x.beats
    starts = [0.0] + [float(beats[s.start_beat]) for s in secs[1:]]
    bar = float(np.median(np.diff(beats))) * x.beats_per_bar if len(beats) > 1 else 2.0
    return starts, [s.label for s in secs], [s.group for s in secs], bar


def matches(ref: list[float], est: list[float], window: float) -> list[tuple[int, int]]:
    """One-to-one pairs (ref index, est index) within the window, closest first."""
    pairs = sorted((abs(r - e), i, j) for i, r in enumerate(ref) for j, e in enumerate(est) if abs(r - e) <= window)
    used_r: set[int] = set()
    used_e: set[int] = set()
    out = []
    for _, i, j in pairs:
        if i not in used_r and j not in used_e:
            used_r.add(i)
            used_e.add(j)
            out.append((i, j))
    return out


def f_measure(hits: int, n_ref: int, n_est: int) -> float:
    p = hits / n_est if n_est else 0.0
    r = hits / n_ref if n_ref else 0.0
    return 2 * p * r / (p + r) if p + r else 0.0


def frames(starts: list[float], values: list[str], n: int) -> list[str]:
    idx = np.searchsorted(np.array(starts), (np.arange(n) + 0.5) * FRAME_S, side="right") - 1
    return [values[max(int(i), 0)] for i in idx]


def pair_f(ref: list[str], est: list[str]) -> float:
    r, e = np.array(ref), np.array(est)
    iu = np.triu_indices(len(r), 1)
    same_r, same_e = (r[:, None] == r[None, :])[iu], (e[:, None] == e[None, :])[iu]
    return f_measure(int(np.sum(same_r & same_e)), int(np.sum(same_r)), int(np.sum(same_e)))


def nce(ref: list[str], est: list[str]) -> tuple[float, float]:
    """(over-, under-segmentation) scores: 1 - H(est | ref) / log |est|, 1 - H(ref | est) / log |ref|."""
    table = Counter(zip(ref, est))
    n = len(ref)
    rc, ec = Counter(ref), Counter(est)

    def cond(of_first: bool) -> float:  # H(second | first)
        h = 0.0
        for (a, b), c in table.items():
            given = rc[a] if of_first else ec[b]
            h -= c / n * np.log2(c / given)
        return h

    so = 1.0 - cond(True) / np.log2(len(ec)) if len(ec) > 1 else 1.0
    su = 1.0 - cond(False) / np.log2(len(rc)) if len(rc) > 1 else 1.0
    return float(so), float(su)


def score_song(song: dict, z) -> dict:
    est_t, est_l, est_g, bar = replay(z)
    ref = sorted(song["sections"], key=lambda r: r["t"])
    ref_t = [0.0] + [float(r["t"]) for r in ref[1:]]
    ref_l = [r["label"] for r in ref]
    # an unmarked group follows the label; "unknown" sections are each their own
    ref_g = [r.get("group") or (f"~{i}" if r["label"] == "unknown" else f"~{r['label']}") for i, r in enumerate(ref)]
    dur = min(float(song.get("durationS") or z["duration"]), float(z["duration"]))
    n = max(int(dur / FRAME_S), 1)
    ri, ei = [t for t in ref_t[1:] if t < dur], [t for t in est_t[1:] if t < dur]
    near = matches(ri, ei, 3.0)
    exact = {i for i, _ in matches(ri, ei, 0.5)}
    rl, el = frames(ref_t, ref_l, n), frames(est_t, est_l, n)
    rl = ["chorus" if x == "drop" else x for x in rl]
    rg, eg = frames(ref_t, ref_g, n), frames(est_t, est_g, n)
    so, su = nce(rg, eg)
    rc, ec = np.array([x == "chorus" for x in rl]), np.array([x == "chorus" for x in el])
    first = next((t for t, lab in zip(est_t, est_l) if lab == "chorus"), None)
    return {
        "HR.5F": f_measure(len(matches(ri, ei, 0.5)), len(ri), len(ei)),
        "HR3F": f_measure(len(near), len(ri), len(ei)),
        "label": float(np.mean([a == b for a, b in zip(rl, el) if a != "unknown"] or [1.0])),
        "groupF": pair_f(rg, eg),
        "So": so,
        "Su": su,
        "chP": float(np.sum(rc & ec) / np.sum(ec)) if ec.any() else 0.0,
        "chR": float(np.sum(rc & ec) / np.sum(rc)) if rc.any() else 1.0,
        "preview": float(first is not None and frames(ref_t, ref_l, n)[min(int((first + 1.0) / FRAME_S), n - 1)] in CHORUS),
        "nRef": len(ri) + 1,
        "nEst": len(ei) + 1,
        "offBars": [(ei[j] - ri[i]) / bar for i, j in near if i not in exact],
        "missed": len(ri) - len(near),
        "extra": len(ei) - len(near),
        "confusion": Counter(zip(rl, el)),
    }


def summary(rows: list[dict], title: str) -> None:
    if not rows:
        return
    keys = ("HR.5F", "HR3F", "label", "groupF", "So", "Su", "chP", "chR", "preview")
    print(f"== {title}: {len(rows)} songs")
    print("   " + "  ".join(f"{k} {np.mean([r[k] for r in rows]):.3f}" for k in keys))
    n_ref, n_est = sum(r["nRef"] for r in rows), sum(r["nEst"] for r in rows)
    off = [o for r in rows for o in r["offBars"]]
    buckets = Counter("<1/2 bar" if abs(o) < 0.5 else f"{round(abs(o))} bar" if abs(abs(o) - round(abs(o))) < 0.25 else "other" for o in off)
    print(f"   sections marked {n_ref} found {n_est} (per song {n_ref / len(rows):.1f} / {n_est / len(rows):.1f}); "
          f"boundaries 3 s but not 0.5 s off: {len(off)} ({', '.join(f'{k} {v}' for k, v in sorted(buckets.items()))}); "
          f"missed {sum(r['missed'] for r in rows)}, extra {sum(r['extra'] for r in rows)}")
    conf: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        for (a, b), c in r["confusion"].items():
            conf[a][b] += c
    print("   marked -> found (share of time): " + "; ".join(
        f"{a} " + " ".join(f"{b} {c / sum(conf[a].values()):.2f}" for b, c in conf[a].most_common(3)) for a in LABELS if a in conf))


DEFAULT_RULES = (S.LABEL_RULES, S.BOUNDARY_RULES)
ALL_RULES = sorted(S.LABEL_RULES | S.BOUNDARY_RULES)


def use_rules(spec: str) -> None:
    """Turn on exactly the rules in `spec` ("none", "default" or names joined by commas)."""
    if spec == "default":
        S.LABEL_RULES, S.BOUNDARY_RULES = DEFAULT_RULES
        return
    names = set() if spec == "none" else {r.strip() for r in spec.split(",") if r.strip()}
    unknown = names - set(ALL_RULES)
    if unknown:
        raise SystemExit(f"unknown rules: {', '.join(sorted(unknown))} (known: {', '.join(ALL_RULES)})")
    boundary = set(DEFAULT_RULES[1])
    S.LABEL_RULES, S.BOUNDARY_RULES = frozenset(names - boundary), frozenset(names & boundary)


def wanted(truth: dict, split: dict | None, parts: list[str] | None) -> dict[str, list[str]]:
    """Song keys per part (only `parts` when given; "all" is their union)."""
    keys = [f"{s['file']}|{s.get('size', '')}" for s in truth["songs"]]
    out = {p: list(f) for p, f in (split or {}).items() if not parts or p in parts}
    out["all"] = [k for k in keys if k in {f for fs in out.values() for f in fs}] if parts else keys
    return out


def score_rows(truth: dict, cache: Path, keep: set[str], per_song: bool = False) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    for s in truth["songs"]:
        key = f"{s['file']}|{s.get('size', '')}"
        if key not in keep:
            continue
        p = cache / f"{song_key(s)}.npz"
        if not p.exists():
            print(f"no capture: {s['file']}")
            continue
        r = rows[key] = score_song(s, np.load(p))
        if per_song:
            print(f"{s['file'][:40]:40s} HR.5F {r['HR.5F']:.2f} HR3F {r['HR3F']:.2f} label {r['label']:.2f} groupF {r['groupF']:.2f} "
                  f"So {r['So']:.2f} Su {r['Su']:.2f} ch {r['chP']:.2f}/{r['chR']:.2f} {r['nRef']:2d}/{r['nEst']:2d} sections")
    return rows


def score(truth: dict, cache: Path, split: dict | None, per_song: bool, parts: list[str] | None) -> None:
    sets = wanted(truth, split, parts)
    rows = score_rows(truth, cache, set(sets["all"]), per_song)
    for part, files in sets.items():
        if part != "all":
            summary([rows[f] for f in files if f in rows], part)
    summary([rows[f] for f in sets["all"] if f in rows], "all")


def sweep(truth: dict, cache: Path, split: dict | None, parts: list[str] | None) -> None:
    """One line per rule set and part: the rule sets of 69-12 against "none" (analyzer 1.11.0)."""
    sets = wanted(truth, split, parts)
    default = sorted(DEFAULT_RULES[0] | DEFAULT_RULES[1])
    specs = ["none", "default"] + [f"{r}" for r in ALL_RULES] + [",".join(x for x in default if x != r) or "none" for r in default]
    names = ["none", "default"] + [f"+{r}" for r in ALL_RULES] + [f"default-{r}" for r in default]
    keys = ("HR.5F", "HR3F", "label", "groupF", "chP", "chR")
    print(f"{'rules':28s} {'part':6s} {'n':>3s} " + " ".join(f"{k:>6s}" for k in keys) + "   secs  extra  1bar  2bar")
    for name, spec in zip(names, specs):
        use_rules(spec)
        rows = score_rows(truth, cache, set(sets["all"]))
        for part, files in sets.items():
            got = [rows[f] for f in files if f in rows]
            if not got:
                continue
            off = [abs(o) for r in got for o in r["offBars"]]
            print(f"{name:28s} {part:6s} {len(got):3d} " + " ".join(f"{np.mean([r[k] for r in got]):6.3f}" for k in keys)
                  + f"  {np.mean([r['nEst'] for r in got]):5.1f}  {sum(r['extra'] for r in got):5d}"
                  + f"  {sum(1 for o in off if abs(o - 1) < 0.25):4d}  {sum(1 for o in off if abs(o - 2) < 0.25):4d}", flush=True)
    use_rules("default")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=("capture", "score"))
    ap.add_argument("truth")
    ap.add_argument("cache")
    ap.add_argument("--music", action="append", default=[])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--split")
    ap.add_argument("--songs", action="store_true")
    ap.add_argument("--rules", default="default", help='"none" (analyzer 1.11.0), "default", or rule names joined by commas')
    ap.add_argument("--parts", help="split parts to score, joined by commas (the rest stay unseen)")
    ap.add_argument("--sweep", action="store_true", help="score the rule sets of PATTERN_DESIGN 69-12 one line each")
    a = ap.parse_args()
    truth = json.load(open(a.truth, encoding="utf-8"))
    if a.mode == "capture":
        capture(truth, Path(a.cache), a.music, a.force)
        return
    split = json.load(open(a.split, encoding="utf-8")) if a.split else None
    parts = [p.strip() for p in a.parts.split(",")] if a.parts else None
    if a.sweep:
        sweep(truth, Path(a.cache), split, parts)
    else:
        use_rules(a.rules)
        score(truth, Path(a.cache), split, a.songs, parts)


if __name__ == "__main__":
    main()
