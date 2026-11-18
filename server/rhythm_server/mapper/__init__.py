"""Mapperatorinator, the chart generator (docs/MAPPERATORINATOR.md).

`Mapper` is what the server uses: whether Mapperatorinator can make charts here (its runtime is set
up), the chart id and level a request gets, and the chart itself, made by the worker process in
Mapperatorinator's own Python and turned into one of ours (charts.py). There is no other generator:
before the runtime is set up, or when a chart fails, the request is an error to try again on.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable

from ..chart.keysounds import default_seed
from ..formats.osu import parse_osu
from . import charts
from .steady import STEADY_VERSION, steady_timing
from .runtime import Runtime, mapper_config
from .service import MapperError, MapperService
from .silence import music_end, quiet_spans

__all__ = ["Mapper", "MapperError", "Runtime", "mapper_config"]

log = logging.getLogger("rhythm_server.mapper")


class Mapper:
    def __init__(self, runtime: Runtime | None = None):
        self.runtime = runtime or Runtime()
        self.service = MapperService(self.runtime)
        # the last chart it failed on (shown in the settings): {"chart", "error", "at"}
        self.last_error: dict[str, Any] | None = None

    def active(self) -> bool:
        return self.runtime.ready()

    def config(self) -> dict[str, Any]:
        cfg = dict(mapper_config())
        state = self.runtime.state() or {}
        cfg["_cpu"] = state.get("device") == "cpu"
        return cfg

    def plan(self, analysis: dict[str, Any], key_mode: str, difficulty: str, target_level: int | None, seed: int | None) -> tuple[int, int, str]:
        """The level a chart aims at, its seed and its id."""
        level = charts.target_level(key_mode, difficulty, target_level)
        if seed is None:
            seed = default_seed(analysis.get("audioHash", ""), key_mode, difficulty, target_level)
        return level, int(seed), charts.chart_id(analysis, key_mode, difficulty, level, int(seed), self.config())

    def predicted(self, analysis: dict[str, Any], key_mode: str, difficulty: str, target_level: int | None, seed: int | None, meta: dict[str, Any]) -> dict[str, Any]:
        level, seed, cid = self.plan(analysis, key_mode, difficulty, target_level, seed)
        return charts.predicted_meta(analysis, key_mode, difficulty, level, seed, cid, self.config(), meta)

    def generate(
        self, analysis: dict[str, Any], key_mode: str, difficulty: str, target_level: int | None, seed: int | None, meta: dict[str, Any],
        audio_path: Path, song_timing: Callable[[], dict[str, Any] | None] | None = None,
    ) -> dict[str, Any]:
        """`song_timing`: asked when the chart's turn comes, for the timing the song's first chart
        found (None: this is the first, and the model finds it). The timing is checked against the
        song's onsets (charts.checked_timing): a tempo the song does not follow is taken out, and a
        first chart made on one is made again on the timing without it; the chart says what was
        taken out (generator.timingFixed), and the song keeps that timing. A steady song's timing is
        then made one tempo (steady.steady_timing): a first chart's notes move with their grid, a
        timing kept from before is steadied before the chart is made on it; the chart says so
        (generator.timingSteady), and the song keeps that timing too (a kept timing that says it was
        steadied is not steadied again: a song's charts share it to the millisecond)."""
        from .. import audio_io
        import soundfile as sf

        cfg = self.config()
        level, seed, cid = self.plan(analysis, key_mode, difficulty, target_level, seed)
        timing = song_timing() if song_timing is not None else None
        # the song's kept record ({"timing", "steady"}: Library.mapper_timing_kept) or the timing alone
        steadied_before = False
        if timing is not None and "tempoMap" not in timing:
            timing, steadied_before = timing.get("timing"), timing.get("steady") == STEADY_VERSION
        onsets, duration = analysis.get("onsets", []), float(analysis["durationMs"])
        # mapper.json timingCheck: on the runner's 24 real timings it changes 7, fits none worse in any
        # 20 s window and mends the two that lost the beat (docs/MAPPERATORINATOR.md)
        check = bool(cfg.get("timingCheck", True))
        # mapper.json timingSteady: on the same 24 it makes 20 one tempo (or one a real tempo), 3 of a
        # song whose tempo sways stay, and no 20 s window's onsets lie further from the grid
        steady = bool(cfg.get("timingSteady", True))
        fixed: list[dict[str, Any]] = []
        steadied: dict[str, Any] | None = None
        moves = None
        if timing is not None and check:
            # a song's timing kept from before this check: it may have lost the beat
            timing, fixed = charts.checked_timing(timing, onsets, duration)
        if timing is not None and steady and not steadied_before:
            # one kept from before it was steadied: the chart is made on the steady one
            timing, steadied, _ = steady_timing(timing, onsets, duration)
        keycount = len(charts.columns(key_mode))
        timeout = float(cfg.get("timeoutSeconds", 1800))
        jobs = self.runtime.root / "jobs"
        jobs.mkdir(parents=True, exist_ok=True)
        tmp = Path(tempfile.mkdtemp(prefix="chart-", dir=jobs))
        try:
            pcm, sr = audio_io.read_canonical(audio_path)
            wav = tmp / "song.wav"
            sf.write(wav, pcm, sr, subtype="PCM_16")
            quiet = quiet_spans(pcm, sr, cfg["silence"]) if cfg.get("silence") else []
            end = music_end(quiet, len(pcm) * 1000.0 / sr)

            def make(on_timing: dict[str, Any] | None, name: str) -> dict[str, Any]:
                beatmap = None
                if on_timing is not None:
                    beatmap = tmp / f"{name}-timing.osu"
                    beatmap.write_text(charts.timing_osu(on_timing, keycount, wav.name, meta.get("title", ""), meta.get("artist", "")), encoding="utf-8")
                out = tmp / name
                out.mkdir()
                return self.service.generate(charts.request_for(key_mode, level, seed, cfg, wav, out, beatmap, meta, end), timeout)

            answer = make(timing, "out")
            osu_text = Path(answer["osu"]).read_text(encoding="utf-8-sig")
            found = None
            try:
                if timing is None and check:
                    found, fixed = charts.checked_timing(parse_osu(osu_text).timing, onsets, duration)
                    if fixed:
                        # its notes followed the lost beat: made again on the timing without it
                        log.warning("Mapperatorinator's timing lost the beat (%s): the chart is made again without those tempos", fixed)
                        first = answer
                        answer = make(found, "again")
                        answer = {**answer, "seconds": float(first.get("seconds") or 0.0) + float(answer.get("seconds") or 0.0)}
                        osu_text = Path(answer["osu"]).read_text(encoding="utf-8-sig")
                    else:
                        found = None
                if timing is None and steady:
                    # the notes are on the grid the model found: they move with it
                    made, steadied, moves = steady_timing(found or parse_osu(osu_text).timing, onsets, duration)
                    if steadied:
                        found = made
                return charts.make_chart(
                    analysis, key_mode, difficulty, level, seed, cid, cfg, meta, osu_text, answer, target_level, timing, quiet,
                    found_timing=found, timing_fixed=fixed or None, timing_steady=steadied, moves=moves,
                )
            except ValueError as e:
                raise MapperError(str(e)) from e
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def close(self) -> None:
        self.service.close()
