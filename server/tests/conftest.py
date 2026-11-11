from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

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


@pytest.fixture(autouse=True)
def fake_mapper_runtime(tmp_path_factory, monkeypatch):
    """Mapperatorinator, the chart generator (docs/MAPPERATORINATOR.md), is a stand-in in the tests:
    a runtime folder of its own that counts as set up, and a worker that answers with an .osu of
    notes on the beats (fakes.py). A test of a runtime that is not set up removes its state.json."""
    from fakes import FAKE_WORKER, set_up

    from rhythm_server.mapper.runtime import Runtime

    home = tmp_path_factory.mktemp("mapper-home")
    set_up(home)
    script = home / "fake_worker.py"
    script.write_text(FAKE_WORKER, encoding="utf-8")
    monkeypatch.setenv("GRG_MAPPER_HOME", str(home))
    monkeypatch.setattr("rhythm_server.mapper.service.worker_script", lambda: script)
    monkeypatch.setattr(Runtime, "venv_python", property(lambda self: Path(sys.executable)))
    monkeypatch.setattr("rhythm_server.mapper.runtime.nvidia_gpus", lambda: [{"name": "NVIDIA GeForce RTX 2060", "memoryMB": 6144}])
    yield home
