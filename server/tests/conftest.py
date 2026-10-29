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


@pytest.fixture(autouse=True)
def fresh_plan_cache():
    """Each test makes its own top-tier first rounds (core.lane_plan keeps them per song, options
    and config, not per monkeypatched function)."""
    from rhythm_server.generator import core

    core._plan_cache.clear()
    yield


@pytest.fixture(scope="session", autouse=True)
def every_tier_on_the_test_songs():
    """The synthetic test songs are calm (top tier first-round rating 11-14.4, under songFit's
    `from`), so they would have no MASTER: here every one aims at the middle of each range with the
    tiers' own density floors, as before songFit (a span this wide puts them all at 0.5). The tests
    that check songFit set it themselves. Session wide: the module-wide chart fixtures are made
    before any function's monkeypatch."""
    from rhythm_server.config import difficulty_config

    fit = difficulty_config()["songFit"]
    was = dict(fit)
    fit.update({"from": -1e6, "to": 1e6, "floorAtBottom": 1.0})
    yield
    fit.update(was)


@pytest.fixture(scope="session")
def song128() -> SynthSong:
    return synth(128.0, 40, 1)


@pytest.fixture(scope="session")
def analysis128() -> dict:
    return analysis_of(128.0, 40, 1)


@pytest.fixture(scope="session")
def analysis174() -> dict:
    return analysis_of(174.0, 40, 2)
