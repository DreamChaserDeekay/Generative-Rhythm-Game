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
"precision", "encoder" ("fp32" when a fp16 model's encoder ran in fp32, see encoder_fp32)} or
{"id", "ok": false, "error"}. Mapperatorinator's own prints go to stderr (the server keeps them in
worker.log).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
import types
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
        # whether precision "auto" (Mapperatorinator's bf16) is bf16 or its fp32 fallback on this GPU
        try:
            info["bf16"] = bool(torch.cuda.is_bf16_supported(including_emulation=False))
        except TypeError:
            info["bf16"] = bool(torch.cuda.is_bf16_supported())
    import inference  # every module a generation needs imports

    info["inference"] = inference.__name__
    return info


# fp16 models whose encoder side runs in fp32 (encoder_fp32): id(model) -> the fp32 stand-in that
# Mapperatorinator's encoder precompute reads in place of the model
_ENCODERS32: dict[int, object] = {}
_PRECOMPUTE_PATCHED = False


def encoder_shadow(model, encoder32, parts: dict, dtype) -> object:
    """What osuT5's server.precompute_encoder_outputs reads of a model, with the fp32 encoder and
    embedders (`parts`) in place of the model's; `dtype` is what it casts the mel spectrogram and the
    conditioning to before them."""
    flags = {k: getattr(model, k) for k in ("do_style_embed", "do_difficulty_embed", "do_mapper_embed", "do_song_position_embed", "project_encoder_input")}
    return types.SimpleNamespace(
        device=model.device, eval=lambda: None, spectrogram=model.spectrogram, num_classes=model.num_classes,
        transformer=types.SimpleNamespace(dtype=dtype, model=types.SimpleNamespace(encoder=encoder32)), **flags, **parts,
    )


def _patch_precompute(server_module, processor_module, dtype) -> None:
    """Routes server.precompute_encoder_outputs (and the processor's imported name for it) through the
    fp32 stand-in of a model in _ENCODERS32, casting the hidden states it returns to `dtype` for the
    decoder; other models pass through untouched. Once per process."""
    global _PRECOMPUTE_PATCHED
    if _PRECOMPUTE_PATCHED:
        return
    original = server_module.precompute_encoder_outputs

    def precompute(model, frames, cond_kwargs, song_positions=None, batch_size=16):
        shadow = _ENCODERS32.get(id(model))
        if shadow is None:
            return original(model, frames, cond_kwargs, song_positions, batch_size)
        return original(shadow, frames, cond_kwargs, song_positions, batch_size).to(dtype)

    server_module.precompute_encoder_outputs = precompute
    processor_module.precompute_encoder_outputs = precompute
    _PRECOMPUTE_PATCHED = True


def encoder_fp32(model) -> None:
    """A fp16 model's encoder side in fp32; the decoder stays fp16.

    Mapperatorinator casts the whole model to fp16 for precision fp16. The encoder's input is a power
    mel spectrogram of peak-normalised audio (no log): values in the thousands in loud passages. The
    model was trained in bf16, whose range is fp32's; fp16 ends at 65504. So the mel projection and
    the convolutions at the front of the encoder can overflow in loud passages (inf, then clamped or
    NaN activations), and the notes of those windows come out as nonsense; seen at home on an RTX
    2060 in the last, loudest part of a song (docs/MAPPERATORINATOR.md). The encoder is one batched
    pass over the windows before decoding (seconds); the decoder, where the minutes go, keeps fp16.

    Two paths run the encoder, both covered: the sequential loop's precompute (osuT5's
    server.precompute_encoder_outputs, routed through a fp32 stand-in of the model) and HF generate's
    model.get_encoder() (parallel mode; replaced on the instance by an encoder made of the fp32 copies
    whose hidden states are cast to fp16).
    """
    import copy

    import torch
    from torch import nn
    from osuT5.osuT5.inference import processor as processor_module
    from osuT5.osuT5.inference import server as server_module

    if model.dtype != torch.float16 or id(model) in _ENCODERS32:
        return
    encoder32 = copy.deepcopy(model.transformer.model.encoder).float().eval()
    parts = {}
    for name in ("style_embedder", "difficulty_embedder", "mapper_embedder", "song_pos_embedder", "encoder_embedder"):
        module = getattr(model, name, None)
        if isinstance(module, nn.Module):
            parts[name] = copy.deepcopy(module).float().eval()
    _ENCODERS32[id(model)] = encoder_shadow(model, encoder32, parts, torch.float32)
    _patch_precompute(server_module, processor_module, torch.float16)

    original_get_encoder = model.get_encoder

    class Encoder32(nn.Module):
        """Mapperatorinator's OsuTEncoder with the fp32 parts: fp16 conditioning in (model_generate
        casts it to the model's dtype), fp16 hidden states out (the decoder's dtype)."""

        def __init__(self, inner):
            super().__init__()
            self.inner = inner

        def forward(self, frames, beatmap_idx=None, difficulty=None, mapper_idx=None, song_position=None,
                    output_attentions=False, output_hidden_states=False, return_dict=False):
            def f32(t):
                return t.float() if isinstance(t, torch.Tensor) and t.is_floating_point() else t

            out = self.inner(
                f32(frames), beatmap_idx=beatmap_idx, difficulty=f32(difficulty), mapper_idx=mapper_idx, song_position=f32(song_position),
                output_attentions=output_attentions, output_hidden_states=output_hidden_states, return_dict=return_dict,
            )
            if return_dict:
                out["last_hidden_state"] = out.last_hidden_state.to(torch.float16)
                return out
            return (out[0].to(torch.float16),) + tuple(out[1:])

    def get_encoder():
        inner = original_get_encoder()
        inner.base = encoder32
        for name, module in parts.items():
            setattr(inner, name, module)
        return Encoder32(inner)

    model.get_encoder = get_encoder


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
        # hitsound and volume tokens are two of a mania note's five: off, the decode is that much
        # shorter (the app plays its own keysounds; the model then maps as for an unhitsounded map)
        args.hitsounded = bool(req.get("hitsounds", True))
        # how far each 16.4 s window advances: 1 - lookback - lookahead of itself (the defaults 0.5
        # and 0.4 see every second of music in ten windows)
        if req.get("lookback") is not None:
            args.lookback = float(req["lookback"])
        if req.get("lookahead") is not None:
            args.lookahead = float(req["lookahead"])
        # windows made independently, a batch at a time on the GPU (no context between windows)
        args.parallel = bool(req.get("parallel", False))
        if args.parallel:
            args.max_batch_size = int(req.get("batchSize") or 8)
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
        # the notes only: the model's template is [TIMING, MAP, SV] and it makes each in its own
        # pass over the song; the app uses no scroll speed changes, so the SV pass is skipped
        # (asking for MAP alone makes the passes up to MAP), and the timing is given, not made
        args.output_type = [self.ContextType.MAP]
        if args.beatmap_path:
            # the song's timing as given (the app's beats and bar lines); the model maps on it
            args.in_context = [self.ContextType.TIMING]
        else:
            args.in_context = [self.ContextType.NONE]
        self.inference.compile_args(args, verbose=False)
        return args

    def _model(self, args, auto_select: bool, lora: bool = True):
        key = (args.model_path, args.gamemode, args.precision, args.device, args.attn_implementation, auto_select)
        if key not in self.models:
            # another model or precision (the settings changed): the old ones leave the GPU first
            for old in [k for k in self.models if k[:5] != key[:5]]:
                _ENCODERS32.pop(id(self.models.pop(old)[0]), None)
            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
            model, tokenizer = self.inference.load_model_with_server(
                args.model_path, args.train, args.device, max_batch_size=args.max_batch_size, use_server=False,
                precision=args.precision, attn_implementation=args.attn_implementation, lora_path=args.lora_path if lora else None,
                gamemode=args.gamemode, auto_select_gamemode_model=auto_select, fast_decoder_loop=args.fast_decoder_loop,
            )
            if args.precision == "fp16" and str(args.device).startswith("cuda"):
                encoder_fp32(model)
            self.models[key] = (model, tokenizer)
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
        answer = {"osu": str(path), "seconds": round(time.time() - t0, 2), "device": args.device, "precision": args.precision}
        if id(model) in _ENCODERS32:
            answer["encoder"] = "fp32"
        return answer


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
