"""Mapperatorinator as the chart generator (this branch; docs/MAPPERATORINATOR.md).

`Mapper` is what the server uses: whether Mapperatorinator can make charts here (its runtime is set
up), the chart id and level a request gets, and the chart itself, made by the worker process in
Mapperatorinator's own Python and turned into one of ours (charts.py). Without an NVIDIA GPU, or
before the runtime is set up, the server makes charts with its own generator as before.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any

from ..generator.core import default_seed
from . import charts
from .runtime import Runtime, mapper_config
from .service import MapperError, MapperService

__all__ = ["Mapper", "MapperError", "Runtime", "mapper_config"]


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
        audio_path: Path,
    ) -> dict[str, Any]:
        from .. import audio_io
        import soundfile as sf

        cfg = self.config()
        level, seed, cid = self.plan(analysis, key_mode, difficulty, target_level, seed)
        jobs = self.runtime.root / "jobs"
        jobs.mkdir(parents=True, exist_ok=True)
        tmp = Path(tempfile.mkdtemp(prefix="chart-", dir=jobs))
        try:
            pcm, sr = audio_io.read_canonical(audio_path)
            wav = tmp / "song.wav"
            sf.write(wav, pcm, sr, subtype="PCM_16")
            beatmap = None
            if cfg.get("useAppTiming", True):
                beatmap = tmp / "timing.osu"
                text = charts.timing_osu(analysis["timing"], len(charts.columns(key_mode)), wav.name, meta.get("title", ""), meta.get("artist", ""))
                beatmap.write_text(text, encoding="utf-8")
            out = tmp / "out"
            out.mkdir()
            request = charts.request_for(key_mode, level, seed, cfg, wav, out, beatmap, meta)
            answer = self.service.generate(request, float(cfg.get("timeoutSeconds", 1800)))
            osu_text = Path(answer["osu"]).read_text(encoding="utf-8-sig")
            try:
                return charts.make_chart(analysis, key_mode, difficulty, level, seed, cid, cfg, meta, osu_text, answer, target_level)
            except ValueError as e:
                raise MapperError(str(e)) from e
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def close(self) -> None:
        self.service.close()
