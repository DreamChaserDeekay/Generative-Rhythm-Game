"""Trains a Mapperatorinator LoRA for one key count and puts the adapter where the app finds it
(docs/MAPPER_LORA.md). It only starts Mapperatorinator's own training (osuT5/train.py, config
lora_v32) with the settings a mania adapter and a Windows PC need; nothing of the training is ours.

    python train.py --data D:\\grg-lora\\8K --keys 8 --test          10 steps: does it fit, how fast
    python train.py --data D:\\grg-lora\\8K --keys 8 --steps 1000    the training
    python train.py --keys 8 --install D:\\grg-lora\\8K\\run\\...\\lora   an adapter trained elsewhere

Run with the Python of the app's Mapperatorinator runtime (%LOCALAPPDATA%\\Generative Rhythm\\mapper\\
venv\\Scripts\\python.exe), after `uv pip install peft==0.18.1 soundfile` into it; --runtime names
another runtime folder. The work folder (--work, default <data>\\run) gets Mapperatorinator's
checkpoints: a full copy of the model and the optimizer each (about 2 GB, the last two are kept).
Only the `lora` folder in the last one is the adapter (adapter_config.json,
adapter_model.safetensors, mapperatorinator_lora_metadata.json); it is copied to
<runtime>\\lora\\<keys>K, where a folder already there is kept under another name.

What is changed from lora_v32 and why:
  pretrained_gamemode=3, data.gamemodes=[3], lora_metadata.ckpt_subfolders=[gamemode=3]
      the mania model (lora_v32 is written for osu!standard, gamemode 0)
  compile=false, attn_implementation=sdpa, dataloader.num_workers=0, logging.mode=disabled
      no torch.compile (needs a C compiler on Windows), no flash-attention (no Windows build), the
      data read in the training process, nothing sent to Weights & Biases
  optim.batch_size and grad_acc: `--minibatch` sequences at a time on the GPU (1 for 6 GB), still 32
      a step as in lora_v32
  mixed_precision: `--precision` (fp16 for GPUs without bf16 such as RTX 20xx, bf16, or no = fp32)
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path


def runtime_home() -> Path:
    if os.environ.get("GRG_MAPPER_HOME"):
        return Path(os.environ["GRG_MAPPER_HOME"])
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "Generative Rhythm" / "mapper"
    return Path.home() / ".cache" / "generative-rhythm" / "mapper"


def install(adapter: Path, runtime: Path, keys: int) -> Path:
    """Copies an adapter's folder to <runtime>/lora/<keys>K (the weights must be safetensors)."""
    for name in ("adapter_config.json", "adapter_model.safetensors"):
        if not (adapter / name).is_file():
            sys.exit(f"{adapter} is not an adapter: {name} is missing")
    target = runtime / "lora" / f"{keys}K"
    if target.exists():
        kept = target.with_name(f"{keys}K-before-{time.strftime('%Y%m%d-%H%M%S')}")
        target.rename(kept)
        print(f"the adapter that was there is kept as {kept}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(adapter, target)
    return target


def watch_gpu(stop: threading.Event, peak: list[int]) -> None:
    """The GPU's memory in use (MB) while the training runs, by nvidia-smi: its highest value."""
    smi = shutil.which("nvidia-smi")
    while smi and not stop.wait(2.0):
        try:
            out = subprocess.run([smi, "--query-gpu=memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10).stdout
            peak[0] = max(peak[0], int(out.splitlines()[0]))
        except (OSError, ValueError, IndexError, subprocess.SubprocessError):
            pass


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--keys", type=int, required=True)
    ap.add_argument("--data", type=Path, help="the dataset make_dataset.py made")
    ap.add_argument("--steps", type=int, default=1000)
    ap.add_argument("--test", action="store_true", help="10 steps, nothing installed: whether it fits the GPU and how long a step takes")
    ap.add_argument("--minibatch", type=int, default=1, choices=(1, 2, 4, 8))
    ap.add_argument("--batch", type=int, default=32, help="sequences a step (lora_v32: 32); smaller only to try the pipeline")
    ap.add_argument("--precision", default="fp16", choices=("fp16", "bf16", "no"))
    ap.add_argument("--rank", type=int, default=64)
    ap.add_argument("--device", default="gpu", choices=("gpu", "cpu"))
    ap.add_argument("--runtime", type=Path, default=runtime_home())
    ap.add_argument("--work", type=Path)
    ap.add_argument("--install", type=Path, help="only copy this adapter folder into the runtime")
    ap.add_argument("--no-install", action="store_true")
    ap.add_argument("extra", nargs="*", help="more Hydra overrides for osuT5/train.py, as key=value")
    a = ap.parse_args()
    if a.install:
        print(f"installed: {install(a.install, a.runtime, a.keys)}")
        return
    src = a.runtime / "src"
    if not a.data or not (a.data / "metadata.parquet").is_file():
        sys.exit("--data must be a folder make_dataset.py made (metadata.parquet)")
    if not (src / "osuT5" / "train.py").is_file():
        sys.exit(f"Mapperatorinator's source is not in {src}: install the AI charts in the app's settings first")
    import pandas as pd

    songs = int(pd.read_parquet(a.data / "metadata.parquet", columns=["BeatmapSetId"])["BeatmapSetId"].nunique())
    steps = 10 if a.test else a.steps
    work = (a.work or a.data / "run").resolve() / time.strftime("%Y%m%d-%H%M%S")
    data = a.data.resolve().as_posix()
    overrides = [
        "pretrained_gamemode=3", "data.gamemodes=[3]", 'lora_metadata.ckpt_subfolders=["gamemode=3"]',
        f'data.train_dataset_path="{data}"', f'data.test_dataset_path="{data}"',
        "data.train_dataset_start=0", f"data.train_dataset_end={songs}", "data.test_dataset_start=0", "data.test_dataset_end=0",
        "compile=false", "attn_implementation=sdpa", f"device={a.device}", f"mixed_precision={a.precision}",
        "dataloader.num_workers=0", "logging.mode=disabled", "checkpoint.cleanup_wandb_cache_before_save=false",
        f"optim.batch_size={a.batch}", f"optim.grad_acc={max(1, a.batch // a.minibatch)}", f"optim.total_steps={steps}",
        f"lora.r={a.rank}", f"lora.lora_alpha={2 * a.rank}",
        f'hydra.run.dir="{work.as_posix()}"', *a.extra,
    ]
    cmd = [sys.executable, str(src / "osuT5" / "train.py"), "-cn", "lora_v32", *overrides]
    print(f"{songs} songs, {steps} steps of {a.batch} sequences, {a.minibatch} at a time, {a.precision}\n$ " + " ".join(cmd), flush=True)
    env = {**os.environ, "WANDB_MODE": "disabled", "PYTHONUTF8": "1", "HF_HOME": os.environ.get("HF_HOME") or str(a.runtime / "hf")}
    stop, peak = threading.Event(), [0]
    threading.Thread(target=watch_gpu, args=(stop, peak), daemon=True).start()
    t0 = time.time()
    code = subprocess.run(cmd, cwd=src, env=env).returncode
    stop.set()
    seconds = time.time() - t0
    adapters = sorted(work.glob("checkpoints/checkpoint_*/lora"), key=lambda p: int(p.parent.name.rsplit("_", 1)[1]))
    report = {"ok": code == 0 and bool(adapters), "steps": steps, "seconds": round(seconds, 1), "secondsPerStep": round(seconds / steps, 1),
              "gpuPeakMB": peak[0] or None, "work": str(work), "adapter": str(adapters[-1]) if adapters else None}
    if report["ok"] and not a.test and not a.no_install:
        report["installed"] = str(install(adapters[-1], a.runtime, a.keys))
    print(json.dumps(report, ensure_ascii=False))
    if a.test and report["ok"]:
        print(f"1000 steps would take about {seconds / steps * 1000 / 3600:.1f} hours here (the first steps include loading the model)")
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
