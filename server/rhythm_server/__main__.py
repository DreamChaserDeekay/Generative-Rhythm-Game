"""Command line: run the server, or analyze / generate / synthesize from the terminal."""

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


def _generate(args: argparse.Namespace) -> None:
    from .generator import generate_chart

    analysis = json.loads(Path(args.file).read_text(encoding="utf-8")) if args.file.endswith(".json") else _analyze_file(Path(args.file))
    t = time.time()
    chart = generate_chart(analysis, args.mode, args.difficulty, args.level, args.seed, meta={"title": Path(args.file).stem})
    m = chart["meta"]
    print(
        f"{m['keyMode']} {m['difficulty']} Lv.{m['level']} (rating {m['rating']}) · 노트 {m['noteCount']} · "
        f"평균 {m['nps']['avg']} NPS · 최대 {m['nps']['peak']} NPS · {time.time() - t:.2f}s",
        file=sys.stderr,
    )
    out = json.dumps(chart, ensure_ascii=False)
    Path(args.output).write_text(out, encoding="utf-8") if args.output else print(out)


def _synth(args: argparse.Namespace) -> None:
    import soundfile as sf

    from .synth import make_song

    song = make_song(bpm=args.bpm, bars=args.bars, seed=args.seed)
    sf.write(args.output, song.pcm, song.sample_rate)
    print(f"{args.output}: {song.duration:.1f}s, {args.bpm} BPM, {args.bars}마디", file=sys.stderr)


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

    generate = sub.add_parser("generate", help="오디오(또는 분석 JSON) → 채보 JSON")
    generate.add_argument("file")
    generate.add_argument("--mode", default="4K")
    generate.add_argument("--difficulty", default="NORMAL")
    generate.add_argument("--level", type=int)
    generate.add_argument("--seed", type=int)
    generate.add_argument("-o", "--output")

    synth = sub.add_parser("synth", help="테스트용 합성 곡 WAV 만들기")
    synth.add_argument("-o", "--output", default="demo.wav")
    synth.add_argument("--bpm", type=float, default=128.0)
    synth.add_argument("--bars", type=int, default=32)
    synth.add_argument("--seed", type=int, default=0)

    args = parser.parse_args(argv)
    {"analyze": _analyze, "generate": _generate, "synth": _synth}.get(args.command or "serve", _serve)(args)


if __name__ == "__main__":
    main()
