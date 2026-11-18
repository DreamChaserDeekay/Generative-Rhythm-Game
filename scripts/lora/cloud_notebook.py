# The cells of a notebook that trains a key count's LoRA on a free cloud GPU (Kaggle or Colab, a T4
# of 16 GB), as a skeleton: paste each `# %%` cell into a notebook cell (docs/MAPPER_LORA.md). It was
# not run by us: the same two scripts are tried on Windows by the workflow "Mapper LoRA smoke", the
# cloud's own setup (GPU on, internet on, where files live) is yours to check. Kaggle: Settings →
# Accelerator "GPU T4 x2", Internet "On"; sessions end after 12 hours, so a training that takes
# longer is split with --steps and continued, or run with fewer steps.

# %% 1. Mapperatorinator's source at the commit the app uses, and what it needs
KEYS = 8  # the key count to train: 5, 6 or 8
COMMIT = "5884d1bcb57494f09fe3d74f3a6b58ca0d2960aa"  # config/mapper.json runtime.source.commit
import os, subprocess, sys
HOME = "/kaggle/working/mapper" if os.path.isdir("/kaggle/working") else "/content/mapper"
os.makedirs(HOME, exist_ok=True)
os.environ["GRG_MAPPER_HOME"] = HOME
run = lambda *cmd: subprocess.run(cmd, check=True)
if not os.path.isdir(f"{HOME}/src"):
    run("git", "clone", "https://github.com/OliBomby/Mapperatorinator", f"{HOME}/src")
    run("git", "-C", f"{HOME}/src", "checkout", COMMIT)
# the versions of config/mapper.json runtime.packages (the notebook's own PyTorch is kept)
run(sys.executable, "-m", "pip", "install", "-q", "accelerate==1.12.0", "transformers==4.57.3", "hydra-core==1.3.2", "peft==0.18.1",
    "pydub==0.25.1", "einops==0.8.1", "nnAudio==0.3.4", "rosu-pp-py==3.1.0", "wandb==0.24.2", "soundfile", "pyarrow", "pandas",
    "slider @ https://github.com/OliBomby/slider/archive/ea28c484a0a542d6e094e25aa02e1529ff2c8313.zip")

# %% 2. our two scripts (this repository is public)
RAW = "https://raw.githubusercontent.com/DreamChaserDeekay/Generative-Rhythm-Game/develop/scripts/lora"
for name in ("make_dataset.py", "train.py"):
    run("curl", "-fsSL", "-o", f"{HOME}/{name}", f"{RAW}/{name}")

# %% 3. the dataset: every tar file of the Hugging Face dataset is read through (79 GB of traffic,
# a few GB kept); --min-column-share 0.5 for 8K leaves out the charts written as 7 keys and a scratch
run(sys.executable, f"{HOME}/make_dataset.py", "--keys", str(KEYS), "--out", f"{HOME}/data-{KEYS}K")

# %% 4. ten steps first: does it fit, how long is a step (a T4 has no bf16: fp16, or `no` for fp32)
run(sys.executable, f"{HOME}/train.py", "--data", f"{HOME}/data-{KEYS}K", "--keys", str(KEYS), "--test", "--minibatch", "2", "--precision", "fp16")

# %% 5. the training; the adapter ends in <HOME>/lora/<KEYS>K
run(sys.executable, f"{HOME}/train.py", "--data", f"{HOME}/data-{KEYS}K", "--keys", str(KEYS), "--steps", "1000", "--minibatch", "2", "--precision", "fp16")

# %% 6. the adapter as one file to download (about 100 MB); on the PC unpack it and run
#   python train.py --keys 8 --install <the unpacked folder>
import shutil
shutil.make_archive(f"{HOME}/lora-{KEYS}K", "zip", f"{HOME}/lora/{KEYS}K")
print(f"{HOME}/lora-{KEYS}K.zip")
