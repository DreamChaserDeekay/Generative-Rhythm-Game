"""One song in one key mode at each tier, the way the server makes a song's charts (the first chart
finds the timing, the others are given it; the model stops at the music's end), with the model's
other conditions or a LoRA adapter when given. Keeps the raw .osu files and a report, for
scripts/mapper_keymode_report.py (docs/MAPPER_LORA.md).

    python scripts/mapper_probe.py --audio song.mp3 --out probe --mode 8K --tiers HARD EXPERT
        [--conditions '{"negativeDescriptors": ["style/N+1"], "cfgScale": 2.0}'] [--lora <adapter folder> | auto]

Needs the server package and Mapperatorinator's runtime set up (`python -m rhythm_server mapper
setup`; GRG_MAPPER_ALLOW_CPU=1 for a machine without an NVIDIA GPU). The workflows run it on the
runner's CPU; nothing it makes is committed.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path

import soundfile as sf

from rhythm_server import audio_io
from rhythm_server.chart.keysounds import default_seed
from rhythm_server.formats.osu import parse_osu
from rhythm_server.mapper import Mapper, charts, lora
from rhythm_server.mapper.silence import music_end, quiet_spans


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--mode", default="8K")
    ap.add_argument("--tiers", nargs="+", default=["NORMAL", "EXPERT", "ELITE"])
    ap.add_argument("--conditions", default="")
    ap.add_argument("--lora", help="an adapter's folder, or `auto`: the adapters the app finds (runtime folder lora/<N>K)")
    a = ap.parse_args()
    src, out, mode = a.audio, a.out, a.mode
    out.mkdir(parents=True, exist_ok=True)
    mapper = Mapper()
    if not mapper.active():
        sys.exit("Mapperatorinator is not set up: " + json.dumps(mapper.runtime.status(), ensure_ascii=False, default=str))
    cfg = mapper.config()
    keys = len(charts.columns(mode))
    if a.conditions.strip():
        cfg["conditions"] = {f"{keys}K": json.loads(a.conditions)}
    if a.lora == "auto":
        if not charts.lora_of(mode, cfg):
            sys.exit(f"no adapter for {mode} in {mapper.runtime.root / 'lora'}")
        mapper.runtime.ensure_lora()
    elif a.lora:
        adapter = lora.adapter(Path(a.lora))
        if adapter is None:
            sys.exit(f"no adapter in {a.lora}")
        cfg["_lora"] = {keys: adapter}
        mapper.runtime.ensure_lora()
    else:
        cfg["_lora"] = {}
    pcm = audio_io.decode_audio(src)
    duration = len(pcm) * 1000.0 / 44100
    quiet = quiet_spans(pcm, 44100, cfg["silence"])
    end = music_end(quiet, duration)
    audio_hash = "sha256:" + audio_io.file_sha256(src)
    report = {"audio": src.name, "seconds": round(duration / 1000, 1), "model": cfg.get("model"), "mode": mode,
              "conditions": charts.conditions_of(mode, cfg), "lora": charts.lora_of(mode, cfg), "runs": {}}
    timing = None
    try:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "song.wav"
            sf.write(wav, pcm, 44100, subtype="PCM_16")
            for tier in a.tiers:
                level = charts.aim_of(mode, tier, None)
                seed = default_seed(audio_hash, mode, tier, None)
                made = Path(tmp) / tier
                made.mkdir()
                beatmap = None
                if timing is not None:
                    beatmap = Path(tmp) / f"timing-{tier}.osu"
                    beatmap.write_text(charts.timing_osu(timing, keys, wav.name, src.stem), encoding="utf-8")
                request = charts.request_for(mode, level, seed, cfg, wav, made, beatmap, {"title": src.stem}, end)
                t = time.time()
                try:
                    answer = mapper.service.generate(request, 3 * 3600.0)
                    text = Path(answer["osu"]).read_text(encoding="utf-8-sig")
                    (out / f"{src.stem}.{mode}.{tier}.osu").write_text(text, encoding="utf-8")
                    if timing is None:
                        timing = parse_osu(text).timing
                    report["runs"][tier] = {
                        "ok": True, "level": level, "stars": charts.stars_of(level, cfg, mode), "seed": seed, "seconds": round(time.time() - t, 1),
                        "timing": "song" if beatmap else "model", "notes": len(charts.notes_from_osu(text, charts.columns(mode))),
                        "device": answer.get("device"), "precision": answer.get("precision"), "lora": answer.get("lora"),
                    }
                except Exception as e:  # noqa: BLE001  (the other tiers still count)
                    report["runs"][tier] = {"ok": False, "level": level, "seconds": round(time.time() - t, 1), "error": str(e)}
                print(json.dumps({tier: report["runs"][tier]}, ensure_ascii=False), file=sys.stderr, flush=True)
    finally:
        mapper.close()
    (out / f"{src.stem}.{mode}.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    if not all(r.get("ok") for r in report["runs"].values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
