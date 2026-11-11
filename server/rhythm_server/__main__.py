"""Command line: run the server, or analyze / synthesize / try Mapperatorinator from the terminal."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path


class _DroppedConnectionFilter(logging.Filter):
    """Windows' proactor event loop logs a traceback for every connection the browser drops, which
    happens all the time with audio range requests; they are not errors."""

    def filter(self, record: logging.LogRecord) -> bool:
        exc = record.exc_info[1] if record.exc_info else None
        return not isinstance(exc, ConnectionResetError)


def _serve(args: argparse.Namespace) -> None:
    import uvicorn

    from .api.app import create_app

    logging.getLogger("asyncio").addFilter(_DroppedConnectionFilter())
    if args.data:
        os.environ["GRG_DATA_DIR"] = str(Path(args.data).resolve())
    # the desktop app's: the server it started can be stopped by its next launch (see desktop/main.js)
    app = create_app(shutdown_token=os.environ.get("GRG_SHUTDOWN_TOKEN") or None)
    print(f"Generative Rhythm 서버: http://{args.host}:{args.port}  (데이터: {app.state.library.root})")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


def _analyze_file(path: Path) -> dict:
    from . import audio_io
    from .analysis.analyzer import analyze

    pcm = audio_io.decode_audio(path)
    return analyze(pcm, 44100, f"sha256:{audio_io.file_sha256(path)}", progress=lambda p, m: print(f"  {p * 100:5.1f}% {m}", file=sys.stderr))


def _analyze(args: argparse.Namespace) -> None:
    t = time.time()
    result = _analyze_file(Path(args.file))
    print(f"분석 완료 {time.time() - t:.1f}s · BPM {result['tempo']['bpm']} · 온셋 {len(result['onsets'])}", file=sys.stderr)
    out = json.dumps(result, ensure_ascii=False)
    Path(args.output).write_text(out, encoding="utf-8") if args.output else print(out)


def _synth(args: argparse.Namespace) -> None:
    import soundfile as sf

    from .synth import make_song

    song = make_song(bpm=args.bpm, bars=args.bars, seed=args.seed)
    sf.write(args.output, song.pcm, song.sample_rate)
    print(f"{args.output}: {song.duration:.1f}s, {args.bpm} BPM, {args.bars}마디", file=sys.stderr)


def _mapper(args: argparse.Namespace) -> None:
    """Mapperatorinator's runtime from the command line: its status, its setup (what the settings'
    install button does), and one chart of a synthetic song made with it."""
    import tempfile

    from . import audio_io
    from .analysis.analyzer import analyze
    from .mapper import Mapper
    from .synth import make_structured_song

    mapper = Mapper()
    if args.action == "status":
        print(json.dumps(mapper.runtime.status(), ensure_ascii=False, default=str))
        return
    if args.action == "setup":
        t = time.time()
        state = mapper.runtime.setup(lambda step, f: print(f"  {f * 100:5.1f}% {step}", file=sys.stderr, flush=True))
        print(json.dumps({"ok": True, "seconds": round(time.time() - t, 1), **state}, ensure_ascii=False, default=str))
        return
    if not mapper.active():
        sys.exit(f"Mapperatorinator is not set up: {json.dumps(mapper.runtime.status(), ensure_ascii=False, default=str)}")
    if args.action == "probe":
        _mapper_probe(mapper, args)
        return
    song = make_structured_song(bpm=128.0, seed=2)
    pcm = song.pcm[: int(song.sample_rate * args.seconds)]
    analysis = analyze(pcm, song.sample_rate, "sha256:mapper-try", backends={})
    with tempfile.TemporaryDirectory() as tmp:
        audio = Path(tmp) / "audio.flac"
        audio_io.write_canonical(audio, pcm, song.sample_rate)
        t = time.time()
        try:
            chart = mapper.generate(analysis, args.mode, args.difficulty, None, 1, {"title": "synthetic"}, audio)
        finally:
            mapper.close()
    meta = chart["meta"]
    print(json.dumps({"ok": True, "seconds": round(time.time() - t, 1), "keyMode": meta["keyMode"], "level": meta["level"],
                      "noteCount": meta["noteCount"], "generator": meta["generator"]}, ensure_ascii=False, default=str))


def _mapper_probe(mapper, args: argparse.Namespace) -> None:
    """Mapperatorinator's raw .osu of an audio file, with the model's own timing: once with the notes
    only and once with the scroll speed pass too (what it costs, and what a camera could read of
    it). Writes <out>/<name>.map.osu, <name>.sv.osu and <name>.json (the seconds of each)."""
    import shutil
    import tempfile

    import soundfile as sf

    from . import audio_io
    from .mapper import charts

    src = Path(args.audio)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    cfg = mapper.config()
    level = charts.target_level(args.mode, args.difficulty, None)
    pcm = audio_io.decode_audio(src)
    report: dict = {"audio": src.name, "seconds": round(len(pcm) / 44100, 1), "model": cfg.get("model"), "mode": args.mode,
                    "difficulty": args.difficulty, "stars": charts.stars_of(level, cfg), "runs": {}}
    try:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "song.wav"
            sf.write(wav, pcm, 44100, subtype="PCM_16")
            for name, sv in (("map", False), ("sv", True)):
                made = Path(tmp) / name
                made.mkdir()
                request = {**charts.request_for(args.mode, level, 1, cfg, wav, made, None, {"title": src.stem}), "sv": sv}
                t = time.time()
                try:
                    answer = mapper.service.generate(request, 3 * 3600.0)
                    shutil.copyfile(answer["osu"], out / f"{src.stem}.{name}.osu")
                    report["runs"][name] = {"ok": True, "seconds": round(time.time() - t, 1), "worker": answer.get("seconds"),
                                            "device": answer.get("device"), "precision": answer.get("precision")}
                except Exception as e:  # noqa: BLE001  (the other run still counts)
                    report["runs"][name] = {"ok": False, "seconds": round(time.time() - t, 1), "error": str(e)}
                print(json.dumps({name: report["runs"][name]}, ensure_ascii=False), file=sys.stderr, flush=True)
    finally:
        mapper.close()
    (out / f"{src.stem}.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


def _selftest(_args: argparse.Namespace) -> None:
    from .analysis.backends import roformer_backend

    report = roformer_backend.self_test()
    print(json.dumps(report, ensure_ascii=False, default=str))
    sys.exit(0 if report["ok"] else 1)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="rhythm_server", description="Generative Rhythm Game 로컬 분석 서버")
    sub = parser.add_subparsers(dest="command")

    serve = sub.add_parser("serve", help="서버 실행 (기본)")
    for p in (parser, serve):
        p.add_argument("--host", default="127.0.0.1")
        p.add_argument("--port", type=int, default=8765)
        p.add_argument("--data", help="데이터 폴더 (기본: 저장소의 data/)")

    analyze = sub.add_parser("analyze", help="오디오 파일 분석 → AnalysisResult JSON")
    analyze.add_argument("file")
    analyze.add_argument("-o", "--output")

    synth = sub.add_parser("synth", help="테스트용 합성 곡 WAV 만들기")
    synth.add_argument("-o", "--output", default="demo.wav")
    synth.add_argument("--bpm", type=float, default=128.0)
    synth.add_argument("--bars", type=int, default=32)
    synth.add_argument("--seed", type=int, default=0)

    sub.add_parser("selftest", help="BS-RoFormer의 ONNX · DirectML 경로 점검 (ML판)")

    mapper = sub.add_parser("mapper", help="Mapperatorinator 실행 환경: 상태 · 설치 · 시험 생성 (docs/MAPPERATORINATOR.md)")
    mapper.add_argument("action", choices=["status", "setup", "generate", "probe"])
    mapper.add_argument("--audio", help="probe: 오디오 파일")
    mapper.add_argument("--out", default="mapper-probe", help="probe: .osu를 둘 폴더")
    mapper.add_argument("--seconds", type=float, default=30.0, help="generate: 합성 곡의 길이(초)")
    mapper.add_argument("--mode", default="7K+1S")
    mapper.add_argument("--difficulty", default="HARD")

    args = parser.parse_args(argv)
    {"analyze": _analyze, "synth": _synth, "selftest": _selftest, "mapper": _mapper}.get(args.command or "serve", _serve)(args)


if __name__ == "__main__":
    main()
