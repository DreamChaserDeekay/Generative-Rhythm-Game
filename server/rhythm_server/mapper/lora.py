"""LoRA adapters for Mapperatorinator, one per key count (docs/MAPPER_LORA.md).

An adapter is the `lora` folder a Mapperatorinator LoRA training leaves in its checkpoint (PEFT's
adapter_config.json and adapter_model.safetensors, and mapperatorinator_lora_metadata.json). Put in
the runtime folder as `lora/<N>K/` (`lora/8K/` for 8K; 4K+FX and 6K+FX use 4K's and 6K's), it is
merged into the model for the notes of that key count's charts. config/mapper.json `lora.adapters`
names another folder for a key count (absolute, or under `lora/`), and `lora.enabled` false turns
them all off. Nothing here loads an adapter: the worker does, in Mapperatorinator's Python.

A chart made with an adapter says so (meta.generator.lora), and its id holds the adapter's tag (the
first 12 hex digits of the weights file's sha256): it is another chart than the base model's, and
than another adapter's. Without an adapter the ids are what they were.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

CONFIG, WEIGHTS = "adapter_config.json", "adapter_model.safetensors"
# the tags of the weight files hashed already: (path, size, mtime) -> tag
_TAGS: dict[tuple[str, int, int], str] = {}


def _tag(weights: Path) -> str:
    stat = weights.stat()
    key = (str(weights), stat.st_size, stat.st_mtime_ns)
    if key not in _TAGS:
        digest = hashlib.sha256()
        with open(weights, "rb") as f:
            for block in iter(lambda: f.read(1 << 20), b""):
                digest.update(block)
        _TAGS[key] = digest.hexdigest()[:12]
    return _TAGS[key]


def adapter(folder: Path) -> dict[str, Any] | None:
    """What a folder's adapter is ({"path", "tag", "r"}), None when it holds none. Only safetensors
    weights count: PEFT would unpickle an adapter_model.bin."""
    if not (folder / CONFIG).is_file() or not (folder / WEIGHTS).is_file():
        return None
    try:
        rank = json.loads((folder / CONFIG).read_text(encoding="utf-8")).get("r")
    except (OSError, ValueError):
        return None
    return {"path": str(folder), "tag": _tag(folder / WEIGHTS), "r": rank}


def adapters(cfg: dict[str, Any], root: Path) -> dict[int, dict[str, Any]]:
    """The adapter of each key count that has one: `root`/lora/<N>K, or the folder mapper.json
    lora.adapters names for "<N>K"."""
    settings = cfg.get("lora") or {}
    if not settings.get("enabled", True):
        return {}
    base = root / "lora"
    named = {str(k).upper(): v for k, v in (settings.get("adapters") or {}).items() if v}
    found: dict[int, dict[str, Any]] = {}
    for keys in range(1, 19):
        name = named.get(f"{keys}K")
        folder = (base / str(name) if not Path(str(name)).is_absolute() else Path(str(name))) if name else base / f"{keys}K"
        one = adapter(folder)
        if one is not None:
            found[keys] = one
    return found
