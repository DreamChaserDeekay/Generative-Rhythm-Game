"""Mapperatorinator's own Python, set up on first use (docs/MAPPERATORINATOR.md).

The desktop editions carry the CPU build of PyTorch; CUDA's is over 2 GB, more than an NSIS
installer holds. So the app keeps a second environment of its own in the runtime folder
(GRG_MAPPER_HOME, else %LOCALAPPDATA%\\Generative Rhythm\\mapper on Windows,
~/.cache/generative-rhythm/mapper elsewhere), made with uv:

    uv/            uv itself, from its PyPI wheel (sha256 checked)
    python/        a Python 3.11 uv installs
    venv/          PyTorch with CUDA (or the CPU build when allowed) and Mapperatorinator's packages
    src/           Mapperatorinator's source at the pinned commit (bundled with the app, else GitHub)
    hf/            the weights (Hugging Face cache)
    state.json     what was installed, written last: the runtime is ready once it is there
    setup.log, worker.log

Nothing here runs Mapperatorinator in the server's process: worker.py runs in venv/.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Callable

from ..config import REPO_ROOT, load_config

log = logging.getLogger("rhythm_server.mapper")

# what state.json must say for the runtime to count as set up (a new tag sets it up again)
RUNTIME_TAG = "1"
NVIDIA = 0x10DE
# new processes without a console window (the desktop app has none)
NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


def mapper_config() -> dict[str, Any]:
    """config/mapper.json, with GRG_MAPPER_ALLOW_CPU=1 (set up and run on the CPU: the desktop
    build's smoke test) and GRG_MAPPER_MODEL (another inference config, e.g. v32-mini) over it."""
    cfg = dict(load_config("mapper"))
    if os.environ.get("GRG_MAPPER_ALLOW_CPU") == "1":
        cfg.update(allowCpu=True, requireNvidia=False)
    if os.environ.get("GRG_MAPPER_MODEL"):
        cfg["model"] = os.environ["GRG_MAPPER_MODEL"]
    return cfg


def home() -> Path:
    env = os.environ.get("GRG_MAPPER_HOME")
    if env:
        return Path(env)
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "Generative Rhythm" / "mapper"
    return Path.home() / ".cache" / "generative-rhythm" / "mapper"


def bundled_source(name: str) -> Path | None:
    """The source a desktop build carries (packaging/vendor/<name>, copied next to the server), or
    GRG_MAPPER_SRC for Mapperatorinator itself."""
    if name == "mapperatorinator" and os.environ.get("GRG_MAPPER_SRC"):
        return Path(os.environ["GRG_MAPPER_SRC"])
    for root in (Path(getattr(sys, "_MEIPASS", "")) / "vendor", REPO_ROOT / "packaging" / "vendor"):
        if (root / name).is_dir():
            return root / name
    return None


def worker_script() -> Path:
    """worker.py as a file (the frozen server carries it as data: it runs in the other Python)."""
    here = Path(__file__).with_name("worker.py")
    if here.is_file():
        return here
    return Path(getattr(sys, "_MEIPASS", "")) / "rhythm_server" / "mapper" / "worker.py"


def nvidia_gpus() -> list[dict[str, Any]]:
    """NVIDIA GPUs by name and memory: DXGI's adapter list on Windows, nvidia-smi elsewhere."""
    if sys.platform == "win32":
        try:
            from ..analysis.backends.roformer_backend import _dxgi_adapters

            return [{"name": a[1], "memoryMB": a[2]} for a in _dxgi_adapters() if len(a) > 4 and a[4] == NVIDIA and not a[3]]
        except Exception as e:
            log.info("DirectX adapters could not be listed: %s", e)
            return []
    smi = shutil.which("nvidia-smi")
    if not smi:
        return []
    try:
        out = subprocess.run([smi, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=15).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    gpus = []
    for line in out.splitlines():
        name, _, mem = line.rpartition(",")
        if name.strip():
            gpus.append({"name": name.strip(), "memoryMB": int(float(mem.strip() or 0))})
    return gpus


class Runtime:
    """The runtime folder and its setup (one at a time, on a thread of its own)."""

    def __init__(self, root: Path | None = None):
        self.root = root or home()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._progress: dict[str, Any] | None = None
        self._error: str | None = None
        self._gpus: list[dict[str, Any]] | None = None

    # ---------- paths ----------
    @property
    def venv_python(self) -> Path:
        return self.root / "venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")

    @property
    def uv(self) -> Path:
        return self.root / "uv" / ("uv.exe" if sys.platform == "win32" else "uv")

    @property
    def src(self) -> Path:
        return self.root / "src"

    def env(self) -> dict[str, str]:
        env = dict(os.environ)
        env.update(
            UV_PYTHON_INSTALL_DIR=str(self.root / "python"), UV_CACHE_DIR=str(self.root / "cache"), HF_HOME=str(self.root / "hf"),
            PYTHONUTF8="1", PYTHONIOENCODING="utf-8", WANDB_MODE="disabled", HF_HUB_DISABLE_TELEMETRY="1",
            TOKENIZERS_PARALLELISM="false",
        )
        # the frozen server's own Python must not leak into the other one
        for key in ("PYTHONHOME", "PYTHONPATH", "VIRTUAL_ENV"):
            env.pop(key, None)
        return env

    # ---------- state ----------
    def state(self) -> dict[str, Any] | None:
        try:
            state = json.loads((self.root / "state.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if state.get("tag") != RUNTIME_TAG or not self.venv_python.is_file() or not self.src.is_dir():
            return None
        return state

    def gpus(self) -> list[dict[str, Any]]:
        if self._gpus is None:
            self._gpus = nvidia_gpus()
        return self._gpus

    def status(self) -> dict[str, Any]:
        cfg = mapper_config()
        gpus = self.gpus()
        state = self.state()
        out: dict[str, Any] = {"enabled": bool(cfg.get("enabled", True)), "model": cfg.get("model", "v32"), "gpus": gpus, "home": str(self.root)}
        with self._lock:
            installing = self._thread is not None and self._thread.is_alive()
            progress, error = self._progress, self._error
        if not out["enabled"]:
            out["state"] = "disabled"
        elif installing:
            out.update(state="installing", progress=progress)
        elif state is not None:
            out.update(state="ready", runtime=state)
        elif not gpus and cfg.get("requireNvidia", True) and not cfg.get("allowCpu", False):
            out.update(state="unsupported", reason="NVIDIA GPU가 없어 Mapperatorinator를 쓸 수 없습니다. 기존 생성기로 채보를 만듭니다.")
        elif error:
            out.update(state="failed", error=error)
        else:
            out["state"] = "missing"
        return out

    def ready(self) -> bool:
        return bool(mapper_config().get("enabled", True)) and self.state() is not None

    # ---------- setup ----------
    def install(self) -> bool:
        """Starts the setup on its own thread; False when one is running already."""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return False
            self._error = None
            self._progress = {"step": "준비", "fraction": 0.0}
            self._thread = threading.Thread(target=self._install, name="mapper-setup", daemon=True)
            self._thread.start()
        return True

    def wait(self, timeout: float | None = None) -> None:
        with self._lock:
            thread = self._thread
        if thread is not None:
            thread.join(timeout)

    def _report(self, step: str, fraction: float) -> None:
        with self._lock:
            self._progress = {"step": step, "fraction": round(fraction, 3)}
        log.info("Mapperatorinator setup: %s (%.0f%%)", step, fraction * 100)

    def _install(self) -> None:
        try:
            self.setup(self._report)
        except Exception as e:
            log.exception("Mapperatorinator setup failed")
            with self._lock:
                self._error = f"{type(e).__name__}: {e}"
        finally:
            with self._lock:
                self._progress = None

    def setup(self, report: Callable[[str, float], None] = lambda s, f: None) -> dict[str, Any]:
        cfg = mapper_config()
        rt = cfg["runtime"]
        cpu = not self.gpus()
        if cpu and cfg.get("requireNvidia", True) and not cfg.get("allowCpu", False):
            raise RuntimeError("NVIDIA GPU가 없습니다")
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "state.json").unlink(missing_ok=True)
        logf = open(self.root / "setup.log", "a", encoding="utf-8")
        try:
            logf.write(f"\n==== setup {time.strftime('%Y-%m-%d %H:%M:%S')} ({'cpu' if cpu else 'cuda'})\n")
            report("uv 내려받기", 0.02)
            self._fetch_uv(rt["uv"])
            report(f"Python {rt['python']} 설치", 0.05)
            self._run([str(self.uv), "python", "install", rt["python"]], logf)
            if not self.venv_python.is_file():
                self._run([str(self.uv), "venv", str(self.root / "venv"), "--python", rt["python"], "--managed-python"], logf)
            pip = [str(self.uv), "pip", "install", "--python", str(self.venv_python)]
            report("PyTorch 내려받기 (CPU)" if cpu else "PyTorch (CUDA) 내려받기 — 약 2.5GB", 0.1)
            self._run(pip + list(rt["torch"]) + ["--index-url", rt["torchIndex"]["cpu" if cpu else "cuda"]], logf)
            report("Mapperatorinator 패키지 설치", 0.55)
            self._run(pip + list(rt["packages"]) + [self._slider(rt["slider"])], logf)
            report("Mapperatorinator 소스", 0.7)
            self._source(rt["source"])
            report("확인", 0.75)
            info = self._worker_json(["--check"], logf, timeout=900)
            if not cpu and not info.get("cuda"):
                raise RuntimeError("설치한 PyTorch가 GPU(CUDA)를 쓰지 못합니다 — NVIDIA 드라이버를 최신으로 올려 보세요 (setup.log)")
            report("모델 내려받기", 0.8)
            repo = self._model_repo(str(cfg.get("model", "v32")))
            self._worker_json(["--download", repo], logf, timeout=7200)
            state = {
                "tag": RUNTIME_TAG, "device": "cuda" if info.get("cuda") else "cpu", "gpu": info.get("device"), "memoryMB": info.get("memoryMB"),
                "capability": info.get("capability"), "torch": info.get("torch"), "python": info.get("python"), "model": repo,
                "source": rt["source"]["commit"], "installedAt": time.time(),
            }
            (self.root / "state.json").write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
            report("완료", 1.0)
            return state
        finally:
            logf.close()

    def _model_repo(self, model: str) -> str:
        """The Hugging Face repo an inference config names (configs/inference/<model>.yaml)."""
        try:
            for line in (self.src / "configs" / "inference" / f"{model}.yaml").read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("model_path:"):
                    return line.split(":", 1)[1].split("#", 1)[0].strip().strip("'\"")
        except OSError:
            pass
        return f"OliBomby/Mapperatorinator-{model}"

    def _run(self, cmd: list[str], logf: Any, timeout: float = 7200) -> None:
        logf.write("$ " + " ".join(cmd) + "\n")
        logf.flush()
        proc = subprocess.run(cmd, stdout=logf, stderr=subprocess.STDOUT, env=self.env(), timeout=timeout, creationflags=NO_WINDOW)
        if proc.returncode != 0:
            raise RuntimeError(f"{Path(cmd[0]).name} {cmd[1]} failed ({proc.returncode}); see {self.root / 'setup.log'}")

    def _worker_json(self, args: list[str], logf: Any, timeout: float) -> dict[str, Any]:
        cmd = [str(self.venv_python), str(worker_script()), "--src", str(self.src), *args]
        logf.write("$ " + " ".join(cmd) + "\n")
        logf.flush()
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=logf, env=self.env(), timeout=timeout, creationflags=NO_WINDOW, cwd=str(self.src))
        lines = [l for l in proc.stdout.decode("utf-8", "replace").splitlines() if l.strip()]
        try:
            result = json.loads(lines[-1])
        except (IndexError, ValueError):
            raise RuntimeError(f"worker {args[0]} gave no answer ({proc.returncode}); see {self.root / 'setup.log'}") from None
        logf.write(json.dumps(result, ensure_ascii=False) + "\n")
        if not result.get("ok"):
            raise RuntimeError(f"worker {args[0]}: {result.get('error')}")
        return result

    def _fetch_uv(self, spec: dict[str, Any]) -> None:
        if self.uv.is_file():
            return
        wheel = spec["wheels"]["win32" if sys.platform == "win32" else "linux"]
        data = _download(wheel["url"], wheel["sha256"])
        name = self.uv.name
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            member = next(m for m in z.namelist() if m.endswith(f".data/scripts/{name}"))
            self.uv.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.uv.with_suffix(".part")
            tmp.write_bytes(z.read(member))
            if sys.platform != "win32":
                tmp.chmod(0o755)
            os.replace(tmp, self.uv)

    def _slider(self, spec: dict[str, Any]) -> str:
        local = bundled_source("slider")
        return str(local) if local is not None else f"slider @ {spec['zip']}"

    def _source(self, spec: dict[str, Any]) -> None:
        marker = self.src / ".grg-commit"
        if marker.is_file() and marker.read_text(encoding="utf-8").strip() == spec["commit"]:
            return
        tmp = Path(tempfile.mkdtemp(prefix="src-", dir=self.root))
        try:
            local = bundled_source("mapperatorinator")
            if local is not None:
                shutil.copytree(local, tmp / "src", ignore=shutil.ignore_patterns(".git", "__pycache__"))
            else:
                with zipfile.ZipFile(io.BytesIO(_download(spec["zip"]))) as z:
                    z.extractall(tmp)
                top = next(p for p in tmp.iterdir() if p.is_dir())
                top.rename(tmp / "src")
            (tmp / "src" / ".grg-commit").write_text(spec["commit"], encoding="utf-8")
            if self.src.exists():
                shutil.rmtree(self.src)
            os.replace(tmp / "src", self.src)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


def _download(url: str, sha256: str | None = None) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as resp:
        data = resp.read()
    if sha256 and hashlib.sha256(data).hexdigest() != sha256.lower():
        raise ValueError(f"{url}: sha256 does not match")
    return data
