"""Runs inside Mapperatorinator's own Python (the runtime set up by mapper/runtime.py), never in the
server: only the standard library is imported at first, Mapperatorinator's modules once a command
needs them. docs/MAPPERATORINATOR.md.

    python worker.py --src <Mapperatorinator source> --check
        one JSON line: PyTorch's version, whether CUDA works and the GPU's name
    python worker.py --src <source> --download <Hugging Face repo>
        downloads the mania weights (gamemode=3) and the tokenizer into HF_HOME
    python worker.py --src <source> --serve
        a request per line on stdin, a JSON answer per line on stdout; the model stays loaded

A request: {"id", "audio" (a WAV), "out" (a folder), "beatmap" (an .osu with the song's timing
points, or null to let the model find the timing), "model" (an inference config: v32, v32-mini),
"keycount", "difficulty" (star rating), "seed", "holdNoteRatio", "temperature", "precision",
"device", "title", "artist"}. The answer: {"id", "ok", "osu" (the made .osu), "seconds", "device",
"precision"} or {"id", "ok": false, "error"}. Mapperatorinator's own prints go to stderr (the
server keeps them in worker.log).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path


def _protocol() -> object:
    """stdout for the answers only: everything printed afterwards (Python's or a C library's) goes
    to stderr."""
    out = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
    sys.stdout.flush()
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr
    return out


def _enter(src: Path) -> None:
    # its configs and a few files are read relative to the source folder
    os.chdir(src)
    sys.path.insert(0, str(src))


def check() -> dict:
    import torch

    info = {"torch": torch.__version__, "cuda": bool(torch.cuda.is_available()), "python": sys.version.split()[0]}
    if info["cuda"]:
        props = torch.cuda.get_device_properties(0)
        info.update(device=props.name, memoryMB=int(props.total_memory) >> 20, capability=[props.major, props.minor])
    import inference  # every module a generation needs imports

    info["inference"] = inference.__name__
    return info


def download(repo: str) -> dict:
    from huggingface_hub import snapshot_download

    path = snapshot_download(repo, allow_patterns=["gamemode=3/*", "*.json"])
    return {"path": path}


class Generator:
    def __init__(self, src: Path):
        from hydra import compose, initialize_config_dir
        from omegaconf import OmegaConf

        import inference
        from osuT5.osuT5.tokenizer import ContextType

        self.src = src
        self.inference = inference
        self.ContextType = ContextType
        self._compose = compose
        self._initialize = initialize_config_dir
        self._omegaconf = OmegaConf
        self.models: dict[tuple, tuple] = {}

    def args_for(self, req: dict):
        with self._initialize(version_base="1.1", config_dir=str(self.src / "configs" / "inference")):
            cfg = self._compose(config_name=str(req.get("model") or "v32"))
        args = self._omegaconf.to_object(cfg)
        args.audio_path = req["audio"]
        args.output_path = req["out"]
        args.beatmap_path = req.get("beatmap") or None
        args.gamemode = 3
        args.keycount = int(req["keycount"])
        args.difficulty = float(req["difficulty"])
        args.seed = int(req["seed"]) % (2**31)
        args.hold_note_ratio = req.get("holdNoteRatio")
        args.hitsounded = True
        args.use_server = False
        args.export_osz = False
        args.add_to_beatmap = False
        args.generate_positions = False
        args.super_timing = False
        args.device = str(req.get("device") or "auto")
        if req.get("precision") not in (None, "", "auto"):
            args.precision = str(req["precision"])
        if req.get("temperature") is not None:
            args.temperature = float(req["temperature"])
        args.title = req.get("title") or "Generative Rhythm"
        args.artist = req.get("artist") or ""
        args.creator = "Mapperatorinator"
        args.version = f"{args.keycount}K {args.difficulty:.2f}"
        args.tags = "generative-rhythm"
        if args.beatmap_path:
            # the song's timing as given (the app's beats and bar lines); the model maps on it
            args.in_context = [self.ContextType.TIMING]
            args.output_type = [c for c in args.output_type if c != self.ContextType.TIMING] or [self.ContextType.MAP]
        else:
            args.in_context = [self.ContextType.NONE]
        self.inference.compile_args(args, verbose=False)
        return args

    def _model(self, args, auto_select: bool, lora: bool = True):
        key = (args.model_path, args.gamemode, args.precision, args.device, args.attn_implementation, auto_select)
        if key not in self.models:
            self.models[key] = self.inference.load_model_with_server(
                args.model_path, args.train, args.device, max_batch_size=args.max_batch_size, use_server=False,
                precision=args.precision, attn_implementation=args.attn_implementation, lora_path=args.lora_path if lora else None,
                gamemode=args.gamemode, auto_select_gamemode_model=auto_select, fast_decoder_loop=args.fast_decoder_loop,
            )
        return self.models[key]

    def generate(self, req: dict) -> dict:
        t0 = time.time()
        args = self.args_for(req)
        self.inference.setup_inference_environment(args.seed)
        model, tokenizer = self._model(args, args.auto_select_gamemode_model)
        timing_model = timing_tokenizer = None
        if self.inference.should_load_separate_timing_model(args):
            timing_model, timing_tokenizer = self._model(args, False, lora=False)
        generation_config, beatmap_config = self.inference.get_config(args)
        _, path = self.inference.generate(
            args, generation_config=generation_config, beatmap_config=beatmap_config, model=model, tokenizer=tokenizer,
            timing_model=timing_model, timing_tokenizer=timing_tokenizer, verbose=False,
        )
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        return {"osu": str(path), "seconds": round(time.time() - t0, 2), "device": args.device, "precision": args.precision}


def serve(src: Path, out) -> None:
    generator = None
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req: dict = {}
        try:
            req = json.loads(line)
            if generator is None:
                generator = Generator(src)
            answer = {"id": req.get("id"), "ok": True, **generator.generate(req)}
        except Exception as e:
            traceback.print_exc()
            answer = {"id": req.get("id"), "ok": False, "error": f"{type(e).__name__}: {e}"}
        out.write(json.dumps(answer, ensure_ascii=False) + "\n")
        out.flush()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--download")
    group.add_argument("--serve", action="store_true")
    a = ap.parse_args()
    out = _protocol()
    src = Path(a.src).resolve()
    _enter(src)
    if a.serve:
        serve(src, out)
        return
    try:
        result = {"ok": True, **(check() if a.check else download(a.download))}
    except Exception as e:
        traceback.print_exc()
        result = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    out.write(json.dumps(result, ensure_ascii=False) + "\n")
    out.flush()
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
