"""Optional ML analysis backends (Demucs or BS-RoFormer, beat_this, basic-pitch, allin1).

Each adapter imports its library lazily, so the server runs without any of them. `detect()`
reports which ones are installed and enabled; the analyzer uses those and falls back to the core
numpy/scipy analysis for the rest (or when an adapter fails). A kind may name a `fallback` backend:
it is used when the first is not installed, says the machine does not suit it (its adapter's
`usable(options)`: BS-RoFormer without a GPU) or fails on a song.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import importlib.util
import os
from dataclasses import dataclass, field
from typing import Any

from ...config import load_config

KINDS = ("stems", "beats", "pitch", "structure")

# kind -> (adapter module, packages that must be importable, distribution name for the version)
ADAPTERS: dict[str, tuple[str, tuple[str, ...], str]] = {
    "demucs": ("demucs_backend", ("demucs", "torch"), "demucs"),
    # the BS-RoFormer model is in this package (bs_roformer.py); its label is the checkpoint's
    "roformer": ("roformer_backend", ("torch", "einops", "rotary_embedding_torch"), "roformer"),
    "beat_this": ("beat_this_backend", ("beat_this", "torch"), "beat-this"),
    "basic_pitch": ("basic_pitch_backend", ("basic_pitch",), "basic-pitch"),
    "allin1": ("allin1_backend", ("allin1", "torch"), "allin1"),
}


@dataclass
class Backend:
    kind: str
    name: str
    version: str
    options: dict[str, Any] = field(default_factory=dict)
    fallback: Backend | None = None

    @property
    def label(self) -> str:
        return f"{self.name}-{self.version}"

    def module(self) -> Any:
        return importlib.import_module(f"{__name__}.{ADAPTERS[self.name][0]}")


def ml_config() -> dict[str, Any]:
    return load_config("analysis")["ml"]


def ml_enabled() -> bool:
    return os.environ.get("GRG_ML", "1") not in ("0", "false", "off") and bool(ml_config().get("enabled", True))


def installed(name: str) -> bool:
    _, packages, _ = ADAPTERS[name]
    try:
        return all(importlib.util.find_spec(p) is not None for p in packages)
    except (ImportError, ValueError):
        return False


def _version(name: str) -> str:
    fixed = (ml_config().get("models", {}).get(name) or {}).get("version")
    if fixed:
        return str(fixed)
    try:
        return importlib.metadata.version(ADAPTERS[name][2])
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


def _backend(kind: str, name: str, spec: dict[str, Any], cfg: dict[str, Any]) -> Backend | None:
    if name not in ADAPTERS or not installed(name):
        return None
    # the backend's own settings (ml.models) under the kind's
    options = {**(cfg.get("models", {}).get(name) or {}), **{k: v for k, v in spec.items() if k not in ("backend", "fallback")}}
    options.pop("version", None)
    options.setdefault("device", cfg.get("device", "cpu"))
    backend = Backend(kind=kind, name=name, version=_version(name), options=options)
    try:
        usable = getattr(backend.module(), "usable", None)
        if usable is not None and not usable(options):
            return None
    except Exception:  # an adapter that cannot even be imported is not usable
        return None
    return backend


def detect() -> dict[str, Backend]:
    """Installed and enabled ML backends by kind (empty when ML is off or nothing is installed)."""
    if not ml_enabled():
        return {}
    cfg = ml_config()
    out: dict[str, Backend] = {}
    for kind in KINDS:
        spec = cfg.get(kind) or {}
        first = _backend(kind, str(spec.get("backend")), spec, cfg)
        second = _backend(kind, str(spec.get("fallback")), spec, cfg) if spec.get("fallback") else None
        if first is not None:
            first.fallback = second
            out[kind] = first
        elif second is not None:
            out[kind] = second
    return out


def status() -> list[dict[str, Any]]:
    """Every known adapter with whether it is installed and in use (for /api/health)."""
    cfg = ml_config()
    licenses = load_config("analysis").get("licenses", {})
    active = detect()
    rows = []
    for kind in KINDS:
        # the backend in use, else the one asked for
        name = active[kind].name if kind in active else (cfg.get(kind) or {}).get("backend")
        if name not in ADAPTERS:
            continue
        rows.append(
            {
                "kind": kind,
                "name": name,
                "installed": installed(name),
                "active": kind in active,
                "version": _version(name) if installed(name) else None,
                "license": licenses.get(name, ""),
            }
        )
    return rows
