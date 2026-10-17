"""Keysounds of imported BMS/bmson charts: finding and decoding the samples, mixing them on the
chart timeline (the library's canonical audio) and packing them into one sprite for the client.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np

from .. import audio_io
from ..config import SAMPLE_RATE

log = logging.getLogger("rhythm_server.formats")

SOUND_EXTENSIONS = (".wav", ".ogg", ".flac", ".mp3", ".m4a", ".aac", ".opus")
SPRITE_GAP_S = 0.05
CUT_FADE_MS = 2.0
TARGET_PEAK = 0.98


class SoundIndex:
    """Case-insensitive lookup of package files; BMS often names `.wav` files that ship as `.ogg`."""

    def __init__(self, root: Path):
        self.exact: dict[str, Path] = {}
        self.stem: dict[str, Path] = {}
        for p in root.rglob("*"):
            if p.is_file() and p.suffix.lower() in SOUND_EXTENSIONS:
                rel = p.relative_to(root).as_posix().lower()
                self.exact[rel] = p
                self.stem.setdefault(rel.rsplit(".", 1)[0], p)

    def find(self, name: str, base: str) -> Path | None:
        rel = (f"{base}/{name}" if base else name).replace("\\", "/").lower().lstrip("./")
        if rel in self.exact:
            return self.exact[rel]
        return self.stem.get(rel.rsplit(".", 1)[0] if "." in rel.rsplit("/", 1)[-1] else rel)


def decode_sounds(names: list[str], index: SoundIndex, base: str) -> tuple[dict[str, np.ndarray], list[str]]:
    """Decoded samples (float32 stereo at the canonical rate) by sound name, and the names missing."""
    out: dict[str, np.ndarray] = {}
    missing: list[str] = []
    for name in names:
        path = index.find(name, base)
        if path is None:
            missing.append(name)
            continue
        try:
            out[name] = audio_io.decode_audio(path)
        except Exception as e:  # a broken sample must not stop the whole import
            log.warning("keysound %s could not be decoded: %s", name, e)
            missing.append(name)
    return out, missing


def render_events(events: list[dict[str, Any]], sounds: list[str], samples: dict[str, np.ndarray], length: int = 0) -> np.ndarray:
    """Mix keysound events: each starts at `t` (ms), from `so` ms into its sample, and stops after
    `sl` ms when set (the next start of the same sound), with a short fade at the cut."""
    out = np.zeros((max(length, 1), 2), dtype=np.float32)
    fade = max(1, int(CUT_FADE_MS * SAMPLE_RATE / 1000))
    for e in events:
        snd = e.get("snd")
        if snd is None:
            continue
        x = samples.get(sounds[int(snd)])
        if x is None:
            continue
        start = int(round(float(e["t"]) * SAMPLE_RATE / 1000))
        seg = x[int(round(float(e.get("so") or 0.0) * SAMPLE_RATE / 1000)) :]
        if e.get("sl") is not None:
            n = int(round(float(e["sl"]) * SAMPLE_RATE / 1000))
            if n < len(seg):
                seg = seg[:n].copy()
                k = min(fade, len(seg))
                seg[len(seg) - k :] *= np.linspace(1.0, 0.0, k, dtype=np.float32)[:, None]
        if start < 0:
            seg, start = seg[-start:], 0
        if len(seg) == 0:
            continue
        end = start + len(seg)
        if end > len(out):
            out = np.concatenate([out, np.zeros((end - len(out) + SAMPLE_RATE, 2), dtype=np.float32)])
        out[start:end] += seg
    return out


def full_mix(chart_bgm: list[dict[str, Any]], notes: list[dict[str, Any]], sounds: list[str], samples: dict[str, np.ndarray]) -> np.ndarray:
    """What autoplay sounds like: the background events and every note's keysound."""
    mix = render_events([*chart_bgm, *notes], sounds, samples)
    nonzero = np.flatnonzero(np.max(np.abs(mix), axis=1) > 1e-5)
    end = int(nonzero[-1]) + 1 if len(nonzero) else len(mix)
    return mix[: end + SAMPLE_RATE // 2]


def normalizing_gain(mix: np.ndarray) -> float:
    peak = float(np.max(np.abs(mix))) if mix.size else 0.0
    return min(1.0, TARGET_PEAK / peak) if peak > 0 else 1.0


def build_sprite(samples: dict[str, np.ndarray]) -> tuple[np.ndarray, dict[str, list[int]]]:
    """All samples back to back (with short gaps) and where each one sits, in samples."""
    gap = np.zeros((int(SPRITE_GAP_S * SAMPLE_RATE), 2), dtype=np.float32)
    parts: list[np.ndarray] = []
    index: dict[str, list[int]] = {}
    pos = 0
    for name in sorted(samples):
        x = samples[name]
        index[name] = [pos, len(x)]
        parts += [x, gap]
        pos += len(x) + len(gap)
    sprite = np.concatenate(parts) if parts else np.zeros((1, 2), dtype=np.float32)
    return np.clip(sprite, -1.0, 1.0), index
