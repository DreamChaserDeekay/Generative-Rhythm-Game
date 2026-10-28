"""Our beat grid against the exact grid of BMS charts, on a BMS folder of the player's PC
(docs/PAPER_SURVEY.md 11): which beat phase the core analysis finds, and whether beat_this finds
the right one where we do not.

    python scripts/measure_bms_timing.py BMS_DIR [--limit N] [--jobs J] [--out rows.jsonl] [--check N]

Every song folder's keysounds are mixed in memory the way the BMS caches were made
(formats.keysounds.full_mix on the chart with the most notes); no audio is written. Variants:
  core    the analysis without ML backends (estimate_tempo and estimate_meter, as analyze() runs them)
  ml      the analysis with beat_this as analyze() uses it today: BPM hint and downbeats, our grid
  bt      beat_this's own beats and downbeats
  flip    the ml grid moved half a beat when most of beat_this's beats sit on its half beats
  cflip   the same move on the core grid
A constant-tempo song (one BPM, no stops) is right at T ms when its BPM matches the chart's (half or
double allowed, within 1%) and the median distance from our beats to the chart's grid (its half
beats too when we count twice as fast) is at most T ms; "half" counts songs whose beats sit on the
chart's half beats. Songs with tempo changes report the share of our beats within 40 ms of the
chart's beats. Rows name a song by a hash of its folder, never by its title. --check N runs the
full analyze() on the first N songs and confirms the core and ml grids here are the ones it finds.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from multiprocessing import get_context
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rhythm_server.analysis import analyzer as A  # noqa: E402
from rhythm_server.analysis import ml  # noqa: E402
from rhythm_server.analysis.backends import detect as detect_backends  # noqa: E402
from rhythm_server.config import SAMPLE_RATE  # noqa: E402
from rhythm_server.formats.common import measures  # noqa: E402
from rhythm_server.formats.keysounds import SoundIndex, decode_sounds, full_mix, normalizing_gain  # noqa: E402
from rhythm_server.formats.package import scan_package  # noqa: E402
from rhythm_server.generator.tempo import TempoMap  # noqa: E402

CHART_EXT = (".bms", ".bme", ".bml", ".pms", ".bmson")
MAX_MIX_S = 900.0
VARIANTS = ("core", "ml", "bt", "flip", "cflip")
TOLS = (10, 20, 40)
BEATS = None  # the beat_this backend, when installed


def song_dirs(root: Path) -> list[Path]:
    """Folders holding chart files, the topmost of each package."""
    out = []
    for d, subdirs, files in os.walk(root):
        if any(f.lower().endswith(CHART_EXT) for f in files):
            out.append(Path(d))
            subdirs[:] = []
    return sorted(out)


def timing_inputs(mono: np.ndarray, sr: int) -> dict:
    """The tempo and meter inputs analyze() computes (analyzer.py, from the spectra to the tempo analysis)."""
    duration = len(mono) / sr
    mel, centers = A.mel_power(mono, sr, A.FINE_NFFT, A.FINE_HOP, A.N_MELS, 30.0, min(16000.0, sr / 2 - 1))
    fine_rate = sr / A.FINE_HOP
    od = A.detect_onsets(mel, centers, fine_rate, A.ONSET_BIAS_S)
    mag = A.stft_magnitude(mono, A.COARSE_NFFT, A.COARSE_HOP)
    freqs = np.fft.rfftfreq(A.COARSE_NFFT, 1.0 / sr)
    max_bin = int(np.searchsorted(freqs, A.HARMONIC_MAX_HZ))
    harmonic, percussive = A.hpss(mag[:, :max_bin])
    coarse_rate = sr / A.COARSE_HOP
    drums = A.drum_flux(percussive, freqs[:max_bin], float(np.max(mag)), coarse_rate)
    chroma = (harmonic.astype(np.float64) ** 2) @ A.chroma_matrix(sr, A.COARSE_NFFT)[:, :max_bin].T
    chroma /= np.linalg.norm(chroma, axis=1, keepdims=True) + 1e-9
    spectra = A.onset_spectra(mel, od)
    return {"duration": duration, "od": od, "fine_rate": fine_rate, "coarse_rate": coarse_rate, "drums": drums, "chroma": chroma, "spectra": spectra}


def grid(x: dict, ml_beats: tuple[np.ndarray, np.ndarray] | None) -> tuple[np.ndarray, np.ndarray, int]:
    """(beats, downbeats, tempo lines) as analyze() finds them, with or without beat_this."""
    od, duration = x["od"], x["duration"]
    hint = ml.bpm_hint(ml_beats[0]) if ml_beats is not None else None
    tempo = A.estimate_tempo(
        od.times, od.strength, od.bands[:, 0], od.odf, x["fine_rate"], duration, bpm_override=None, bpm_hint=hint, drums=x["drums"],
        mid_fraction=od.bands[:, 1], chroma=x["chroma"], chroma_rate=x["coarse_rate"], onset_spectra=x["spectra"],
    )
    beats = tempo.beats[(tempo.beats >= 0) & (tempo.beats <= duration)]
    beat_chroma = A.beat_sync(x["chroma"], x["coarse_rate"], beats)
    unit = beat_chroma / (np.linalg.norm(beat_chroma, axis=1, keepdims=True) + 1e-9)
    novelty = np.zeros(len(beats))
    if len(beats) > 1:
        novelty[1:] = 1.0 - np.sum(unit[1:] * unit[:-1], axis=1)
    meter = ml.meter_from_downbeats(beats, ml_beats[0], ml_beats[1]) if ml_beats is not None else None
    if meter is None:
        drums = x["drums"]
        accents = A.BeatAccents(
            kicks=A.beat_peaks(beats, np.maximum(drums.full - drums.high, 0.0), drums.frame_rate),
            snares=A.beat_peaks(beats, drums.high, drums.frame_rate),
            onsets=A.beat_onsets(beats, od.times, od.strength),
            timbre=A.beat_timbre(beats, od.times, od.strength, x["spectra"]),
        )
        meter = A.estimate_meter(A.beat_cues(beats, od.times, od.strength, od.bands, novelty), beat_chroma, accents)
    beat0 = meter.first_downbeat_index if len(beats) else 0
    return beats, beats[beat0:: meter.beats_per_bar], len(A._tempo_map(beats, beat0))


def flipped(beats: np.ndarray, ref: np.ndarray) -> tuple[np.ndarray, bool]:
    """Our grid moved half a beat when most of ref's beats inside it sit nearer its half beats."""
    if len(beats) < 4 or len(ref) < 4:
        return beats, False
    mids = 0.5 * (beats[:-1] + beats[1:])
    inside = ref[(ref > beats[0]) & (ref < beats[-1])]
    if len(inside) < 4:
        return beats, False
    to_beat = np.min(np.abs(inside[:, None] - beats[None, :]), axis=1)
    to_mid = np.min(np.abs(inside[:, None] - mids[None, :]), axis=1)
    if float(np.mean(to_mid < to_beat)) > 0.5:
        return mids, True
    return beats, False


def score(beats: np.ndarray, downbeats: np.ndarray, tempo: TempoMap, chart_bpm: float | None, first: float, last: float, bars: np.ndarray) -> dict:
    span = beats[(beats >= first - 0.05) & (beats <= last + 0.05)]
    out: dict = {}
    if len(span) < 8:
        return {"short": True}
    if bars.size and downbeats.size:
        d = downbeats[(downbeats >= first - 0.05) & (downbeats <= last + 0.05)]
        out["downOnBar"] = round(float(np.mean(np.min(np.abs(d[:, None] - bars[None, :]), axis=1) <= 0.04)), 3) if len(d) else None
    last_beat = tempo.ms_to_beat(last * 1000.0) + 2
    if chart_bpm is None:  # tempo changes: beats on the chart's beats
        g = np.array([tempo.beat_to_ms(b) / 1000.0 for b in np.arange(0.0, last_beat, 1.0)])
        out["onGrid"] = round(float(np.mean(np.min(np.abs(span[:, None] - g[None, :]), axis=1) <= 0.04)), 3)
        return out
    ours = 60.0 / float(np.median(np.diff(span)))
    ratio = ours / chart_bpm
    kind = next((k for k, v in (("1", 1.0), ("1/2", 0.5), ("2", 2.0)) if abs(ratio / v - 1) < 0.01), None)
    step = 0.5 if kind == "2" else 1.0
    g = np.array([tempo.beat_to_ms(b) / 1000.0 for b in np.arange(0.0, last_beat, step)])
    i = np.clip(np.searchsorted(g, span), 1, len(g) - 1)
    off = np.where(np.abs(span - g[i - 1]) < np.abs(span - g[i]), span - g[i - 1], span - g[i])
    med = float(np.median(off))
    beat_s = 60.0 / chart_bpm * step
    out.update(kind=kind, ratio=round(ratio, 4), medMs=round(med * 1000.0, 2), medAbsMs=round(float(np.median(np.abs(off))) * 1000.0, 2),
               half=bool(kind and abs(abs(med) / beat_s - 0.5) < 0.06))
    return out


def one(folder: str) -> list[dict]:
    root = Path(folder)
    rows = []
    try:
        groups, _ = scan_package(root)
    except Exception as e:  # noqa: BLE001
        return [{"song": _name(root, ""), "error": f"parse: {type(e).__name__}"}]
    for g in groups:
        charts = [c for c in g.charts if c.key_mode in ("7K+1S", "5K") and len(c.notes) >= 50] or [c for c in g.charts if len(c.notes) >= 50]
        if not charts:
            continue
        render = max(charts, key=lambda c: len(c.notes) + len(c.bgm))
        row = {"song": _name(root, g.base)}
        try:
            samples, missing = decode_sounds(sorted(set(render.sounds)), SoundIndex(root), g.base)
            if len(samples) < 0.5 * max(1, len(set(render.sounds))):
                rows.append({**row, "error": f"sounds missing {len(missing)}"})
                continue
            mix = full_mix(render.bgm, render.notes, render.sounds, samples)
            del samples
            if len(mix) > MAX_MIX_S * SAMPLE_RATE or len(mix) < 10 * SAMPLE_RATE:
                rows.append({**row, "error": "length"})
                continue
            mix = (mix * normalizing_gain(mix)).astype(np.float32)
            mono = mix.mean(axis=1) if mix.ndim == 2 else mix
            tm = render.timing
            bpms = [float(x["bpm"]) for x in tm.get("tempoMap", [])]
            constant = len(bpms) == 1 and not tm.get("stops")
            tempo = TempoMap(tm)
            ts = sorted(float(n["t"]) for n in render.notes)
            first, last = ts[0] / 1000.0, ts[-1] / 1000.0
            last_beat = tempo.ms_to_beat(ts[-1])
            bars = np.array([tempo.beat_to_ms(s) / 1000.0 for s, _ in measures(tm.get("meter"), last_beat + 1)])
            row.update(constant=constant, bpmChart=bpms[0] if bpms else None, minutes=round(len(mono) / SAMPLE_RATE / 60.0, 2))
            t0 = time.perf_counter()
            x = timing_inputs(mono, SAMPLE_RATE)
            beats, downs, lines = grid(x, None)
            row["coreSeconds"] = round(time.perf_counter() - t0, 2)
            chart_bpm = bpms[0] if constant else None
            row["core"] = {**score(beats, downs, tempo, chart_bpm, first, last, bars), "lines": lines}
            if BEATS is not None:
                t0 = time.perf_counter()
                bt_beats, bt_downs = BEATS.module().track(mix, SAMPLE_RATE, BEATS.options)
                row["btSeconds"] = round(time.perf_counter() - t0, 2)
                mb, md, ml_lines = grid(x, (bt_beats, bt_downs))
                row["ml"] = {**score(mb, md, tempo, chart_bpm, first, last, bars), "lines": ml_lines}
                row["bt"] = score(bt_beats, bt_downs, tempo, chart_bpm, first, last, bars)
                fb, moved = flipped(mb, bt_beats)
                fm = ml.meter_from_downbeats(fb, bt_beats, bt_downs)
                fd = fb[fm.first_downbeat_index:: fm.beats_per_bar] if fm else fb[:0]
                row["flip"] = {**score(fb, fd, tempo, chart_bpm, first, last, bars), "moved": moved}
                cb, cmoved = flipped(beats, bt_beats)
                row["cflip"] = {**score(cb, cb[:0], tempo, chart_bpm, first, last, bars), "moved": cmoved}
            rows.append(row)
        except Exception as e:  # noqa: BLE001
            rows.append({**row, "error": f"{type(e).__name__}: {e}"[:200]})
    return rows


def _name(root: Path, base: str) -> str:
    return hashlib.sha1(f"{root.name}/{base}".encode("utf-8", "replace")).hexdigest()[:10]


def init(use_bt: bool, threads: int) -> None:
    global BEATS
    BEATS = detect_backends().get("beats") if use_bt else None
    if BEATS is not None:
        try:
            import torch

            torch.set_num_threads(threads)
        except Exception:  # noqa: BLE001
            pass


def summarize(rows: list[dict]) -> None:
    ok = [r for r in rows if "error" not in r and "core" in r]
    const = [r for r in ok if r["constant"] and not r["core"].get("short")]
    other = [r for r in ok if not r["constant"]]
    print(f"{len(rows)} songs read, {len(ok)} measured ({len(const)} constant tempo, {len(other)} with tempo changes or stops), "
          f"{sum(1 for r in rows if 'error' in r)} skipped")
    for v in VARIANTS:
        rs = [r[v] for r in const if v in r and not r[v].get("short")]
        if not rs:
            continue
        n = len(rs)
        right = [s for s in rs if s.get("kind")]
        line = f"  {v:5s} n {n}: BPM {len(right) / n:.3f}"
        for tol in TOLS:
            line += f" | <={tol} ms {sum(1 for s in right if s['medAbsMs'] <= tol) / n:.3f}"
        line += f" | half beat {sum(1 for s in right if s.get('half')) / n:.3f}"
        downs = [s["downOnBar"] for s in rs if s.get("downOnBar") is not None]
        if downs:
            line += f" | downbeats on bars {np.mean(downs):.3f} (songs >= 0.5: {np.mean([d >= 0.5 for d in downs]):.3f})"
        if "lines" in rs[0]:
            line += f" | one tempo line {np.mean([s['lines'] == 1 for s in rs]):.3f}"
        if v in ("flip", "cflip"):
            line += f" | moved {np.mean([s['moved'] for s in rs]):.3f}"
        print(line)
        if other:
            g = [r[v]["onGrid"] for r in other if v in r and r[v].get("onGrid") is not None]
            if g:
                print(f"        tempo changes n {len(g)}: beats on the chart's beats {np.mean(g):.3f} (songs >= 0.9: {np.mean([x >= 0.9 for x in g]):.3f})")
    # what each beat_this variant does to the songs the core analysis gets right and wrong (40 ms)
    def right(s: dict | None) -> bool:
        return bool(s and s.get("kind") and s["medAbsMs"] <= 40)

    for v in ("ml", "bt", "flip", "cflip"):
        both = [r for r in const if v in r and not r[v].get("short")]
        if not both:
            continue
        fixed = sum(1 for r in both if not right(r["core"]) and right(r[v]))
        broken = sum(1 for r in both if right(r["core"]) and not right(r[v]))
        wrong = sum(1 for r in both if not right(r["core"]))
        half_fixed = sum(1 for r in both if r["core"].get("half") and right(r[v]))
        half = sum(1 for r in both if r["core"].get("half"))
        print(f"  core -> {v:5s}: fixes {fixed} of the {wrong} songs core gets wrong ({half_fixed} of its {half} half-beat songs), breaks {broken} of {len(both) - wrong}")
    secs = [r["coreSeconds"] / r["minutes"] for r in ok if r.get("minutes")]
    bts = [r["btSeconds"] / r["minutes"] for r in ok if r.get("btSeconds") and r.get("minutes")]
    print(f"  seconds per minute of audio: core timing {np.median(secs):.2f}" + (f", beat_this {np.median(bts):.2f}" if bts else ", beat_this not installed"))


def check(folders: list[str], n: int) -> None:
    """The grids measured here are the ones analyze() finds (core, and with beat_this)."""
    bt = detect_backends().get("beats")
    done = 0
    for folder in folders:
        root = Path(folder)
        groups, _ = scan_package(root)
        for g in groups:
            charts = [c for c in g.charts if len(c.notes) >= 50]
            if not charts:
                continue
            render = max(charts, key=lambda c: len(c.notes) + len(c.bgm))
            samples, _ = decode_sounds(sorted(set(render.sounds)), SoundIndex(root), g.base)
            mix = full_mix(render.bgm, render.notes, render.sounds, samples)
            mix = (mix * normalizing_gain(mix)).astype(np.float32)
            x = timing_inputs(mix.mean(axis=1) if mix.ndim == 2 else mix, SAMPLE_RATE)
            for label, backends in (("core", {}), ("ml", {"beats": bt} if bt else None)):
                if backends is None:
                    continue
                a = A.analyze(mix, SAMPLE_RATE, "sha256:check", backends=backends)
                ref = np.array([b["t"] for b in a["beats"]]) / 1000.0
                mine, _, _ = grid(x, bt.module().track(mix, SAMPLE_RATE, bt.options) if label == "ml" else None)
                same = len(ref) == len(mine) and np.allclose(ref, mine, atol=1e-3)
                print(f"check {label}: {'same grid' if same else 'DIFFERENT grid'} ({len(ref)} / {len(mine)} beats)")
            done += 1
            break
        if done >= n:
            return


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("bms_dir")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--out", help="per-song rows (JSON lines, no titles)")
    ap.add_argument("--no-beat-this", action="store_true", help="the core analysis only")
    ap.add_argument("--check", type=int, default=0, help="first confirm the grids on N songs against the full analyze()")
    args = ap.parse_args()
    folders = [str(p) for p in song_dirs(Path(args.bms_dir))]
    if args.limit:
        folders = folders[: args.limit]
    print(f"{len(folders)} song folders under {args.bms_dir}")
    if args.check:
        check(folders, args.check)
    threads = max(1, (os.cpu_count() or 2) // max(1, args.jobs))
    rows: list[dict] = []
    out = open(args.out, "w", encoding="utf-8") if args.out else None
    if args.jobs > 1:
        # spawned workers: a forked one hangs in torch once the parent has run beat_this (--check)
        pool = get_context("spawn").Pool(args.jobs, initializer=init, initargs=(not args.no_beat_this, threads))
        results = pool.imap_unordered(one, folders)
    else:
        pool = None
        init(not args.no_beat_this, threads)
        results = map(one, folders)
    for i, song_rows in enumerate(results, 1):
        rows.extend(song_rows)
        if out:
            for r in song_rows:
                out.write(json.dumps(r) + "\n")
            out.flush()
        if i % 25 == 0:
            print(f"  {i}/{len(folders)} folders", flush=True)
    if pool is not None:
        pool.close()
        pool.join()
    if out:
        out.close()
    summarize(rows)


if __name__ == "__main__":
    main()
