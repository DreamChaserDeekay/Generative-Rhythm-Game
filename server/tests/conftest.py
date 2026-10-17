from __future__ import annotations

from functools import lru_cache

import pytest

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.synth import SynthSong, make_song


@lru_cache(maxsize=None)
def synth(bpm: float, bars: int = 32, seed: int = 0, offset: float = 0.537, tempo_change: tuple[int, float] | None = None) -> SynthSong:
    return make_song(bpm=bpm, bars=bars, seed=seed, offset=offset, tempo_change=tempo_change)


@lru_cache(maxsize=None)
def analysis_of(bpm: float, bars: int = 32, seed: int = 0, offset: float = 0.537, tempo_change: tuple[int, float] | None = None) -> dict:
    song = synth(bpm, bars, seed, offset, tempo_change)
    return analyze(song.pcm, song.sample_rate, f"sha256:test-{bpm}-{bars}-{seed}-{tempo_change}")


@pytest.fixture(scope="session")
def song128() -> SynthSong:
    return synth(128.0, 40, 1)


@pytest.fixture(scope="session")
def analysis128() -> dict:
    return analysis_of(128.0, 40, 1)


@pytest.fixture(scope="session")
def analysis174() -> dict:
    return analysis_of(174.0, 40, 2)
