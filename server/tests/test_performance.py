from __future__ import annotations

import time

import pytest

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.generator import generate_chart
from rhythm_server.synth import make_song


@pytest.mark.slow
def test_four_minute_song_analysis_and_regeneration_budgets() -> None:
    song = make_song(bpm=140.0, bars=136, seed=11, offset=0.3)  # ~3.9 minutes
    assert song.duration >= 230
    t = time.perf_counter()
    analysis = analyze(song.pcm, song.sample_rate, "perf")
    analysis_s = time.perf_counter() - t
    assert analysis_s <= 30.0, f"analysis took {analysis_s:.1f}s"
    for mode in ("4K", "7K+1S"):
        for difficulty in ("NORMAL", "MASTER"):
            t = time.perf_counter()
            generate_chart(analysis, mode, difficulty, seed=99)
            gen_s = time.perf_counter() - t
            assert gen_s <= 3.0, f"{mode} {difficulty} generation took {gen_s:.2f}s"
