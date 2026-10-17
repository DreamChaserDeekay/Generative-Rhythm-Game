"""Optional ML analysis backends (Demucs, beat_this, basic-pitch, allin1).

Each adapter imports its library lazily, so the server runs without any of them. `detect()`
reports which ones are installed and enabled; the analyzer uses those and falls back to the core
numpy/scipy analysis for the rest (or when an adapter fails).
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
    try:
        return importlib.metadata.version(ADAPTERS[name][2])
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


def detect() -> dict[str, Backend]:
    """Installed and enabled ML backends by kind (empty when ML is off or nothing is installed)."""
    if not ml_enabled():
        return {}
    cfg = ml_config()
    out: dict[str, Backend] = {}
    for kind in KINDS:
        spec = cfg.get(kind) or {}
        name = spec.get("backend")
        if name in ADAPTERS and installed(name):
            options = {k: v for k, v in spec.items() if k != "backend"}
            options.setdefault("device", cfg.get("device", "cpu"))
            out[kind] = Backend(kind=kind, name=name, version=_version(name), options=options)
    return out


def status() -> list[dict[str, Any]]:
    """Every known adapter with whether it is installed and in use (for /api/health)."""
    cfg = ml_config()
    licenses = load_config("analysis").get("licenses", {})
    active = detect()
    rows = []
    for kind in KINDS:
        name = (cfg.get(kind) or {}).get("backend")
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
