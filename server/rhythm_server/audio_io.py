"""Decoding to canonical audio, tags and cover art.

Every uploaded file is decoded exactly once and stored as a 44.1kHz stereo FLAC. Analysis and
playback both use that file, so decoder differences (MP3 encoder delay, etc.) cannot shift charts.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import av
import numpy as np
import soundfile as sf

from .config import SAMPLE_RATE

SUPPORTED_EXTENSIONS = {".mp3", ".ogg", ".oga", ".opus", ".wav", ".flac", ".m4a", ".aac", ".mp4"}


@dataclass
class Tags:
    title: str | None = None
    artist: str | None = None
    album: str | None = None


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def decode_audio(path: Path, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Decode any FFmpeg-readable file to float32 stereo PCM, shape (samples, 2)."""
    chunks: list[np.ndarray] = []
    with av.open(str(path)) as container:
        if not container.streams.audio:
            raise ValueError("오디오 스트림이 없는 파일입니다")
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format="fltp", layout="stereo", rate=sample_rate)
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray())
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray())
    if not chunks:
        raise ValueError("디코딩된 오디오가 비어 있습니다")
    pcm = np.concatenate(chunks, axis=1).T.astype(np.float32, copy=False)
    return np.ascontiguousarray(pcm)


def write_canonical(path: Path, pcm: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
    peak = float(np.max(np.abs(pcm))) if pcm.size else 0.0
    if peak > 1.0:
        pcm = pcm / peak
    sf.write(str(path), pcm, sample_rate, format="FLAC", subtype="PCM_16")


def read_canonical(path: Path) -> tuple[np.ndarray, int]:
    pcm, sr = sf.read(str(path), dtype="float32", always_2d=True)
    return pcm, int(sr)


def _as_flac16(pcm: np.ndarray) -> np.ndarray:
    """libsndfile's FLAC 16-bit samples of float PCM, read back as float: round(x * 32768) to the
    nearest (ties to even), clipped to the 16-bit range, over 32768 (all exact in float32). A tiny
    negative sample rounds to -0.0 where the file holds 0: adding 0.0 makes it +0.0."""
    q = pcm * np.float32(32768.0)
    np.rint(q, out=q)
    np.clip(q, -32768.0, 32767.0, out=q)
    q += np.float32(0.0)
    q /= np.float32(32768.0)
    return q


@lru_cache(maxsize=1)
def _flac16_known() -> bool:
    """Whether this libsndfile writes and reads 16-bit FLAC as _as_flac16 says (ties, both ends of
    the range, past them, tiny and random values)."""
    rng = np.random.default_rng(0)
    probe = np.concatenate([
        (np.arange(-33000, 33000, dtype=np.float64) + 0.5) / 32768.0,
        np.array([0.0, -0.0, 1.0, -1.0, 0.99999, -0.99999, 1.0 - 2.0**-24, 1e-9, -1e-9]),
        rng.uniform(-1.0, 1.0, 20000), rng.normal(0.0, 1e-4, 4000),
    ]).astype(np.float32)
    probe = np.ascontiguousarray(np.stack([probe, probe[::-1]], axis=1))
    buf = io.BytesIO()
    try:
        sf.write(buf, probe, SAMPLE_RATE, format="FLAC", subtype="PCM_16")
        buf.seek(0)
        back = sf.read(buf, dtype="float32", always_2d=True)[0]
    except Exception:
        return False
    # bit for bit (the sign of zero too)
    return back.shape == probe.shape and np.array_equal(back.view(np.int32), _as_flac16(probe).view(np.int32))


def canonical_pcm(pcm: np.ndarray) -> np.ndarray | None:
    """The PCM `read_canonical` gives back once `write_canonical` has stored `pcm`, without the file
    (the analysis can start on it while the file is written). None when that cannot be worked out
    here (the file is read then): a libsndfile that rounds otherwise, or samples that are not
    finite."""
    if pcm.dtype != np.float32 or pcm.ndim != 2 or not pcm.size or not np.isfinite(pcm).all() or not _flac16_known():
        return None
    peak = float(np.max(np.abs(pcm)))
    if peak > 1.0:
        pcm = pcm / peak
    return np.ascontiguousarray(_as_flac16(pcm))


def _metadata_value(meta: dict[str, str], key: str) -> str | None:
    for k, v in meta.items():
        if k.lower() == key and str(v).strip():
            return str(v).strip()
    return None


def read_tags(path: Path) -> Tags:
    """Title/artist/album from container or stream metadata (ID3, Vorbis comments, MP4 atoms)."""
    try:
        with av.open(str(path)) as container:
            meta = dict(container.metadata)
            for stream in container.streams.audio:
                meta = {**dict(stream.metadata), **meta}
    except Exception:
        return Tags()
    return Tags(title=_metadata_value(meta, "title"), artist=_metadata_value(meta, "artist"), album=_metadata_value(meta, "album"))


def read_cover(path: Path) -> tuple[bytes, str] | None:
    """Embedded cover art (an attached-picture stream) as (bytes, mime type), if any."""
    try:
        with av.open(str(path)) as container:
            for stream in container.streams.video:
                if not stream.disposition & av.stream.Disposition.attached_pic:
                    continue
                for packet in container.demux(stream):
                    data = bytes(packet)
                    if data:
                        mime = "image/png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
                        return data, mime
    except Exception:
        return None
    return None
