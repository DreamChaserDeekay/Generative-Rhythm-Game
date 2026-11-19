"""Mapperatorinator, the chart generator (docs/MAPPERATORINATOR.md).

`Mapper` is what the server uses: whether Mapperatorinator can make charts here (its runtime is set
up), the chart id and level a request gets, and the chart itself, made by the worker process in
Mapperatorinator's own Python and turned into one of ours (charts.py). There is no other generator:
before the runtime is set up, or when a chart fails, the request is an error to try again on.
"""

from __future__ import annotations

import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable

from ..chart.keysounds import default_seed
from ..formats.osu import parse_osu
from . import charts, fit
from .lora import adapters
from .steady import STEADY_VERSION, settled_timing
from .runtime import Runtime, mapper_config
from .service import MapperError, MapperService
from .silence import music_end, quiet_spans

__all__ = ["Mapper", "MapperError", "Runtime", "mapper_config"]

log = logging.getLogger("rhythm_server.mapper")


class Mapper:
    def __init__(self, runtime: Runtime | None = None):
        self.runtime = runtime or Runtime()
        self.service = MapperService(self.runtime)
        # the model's own timing (before it was settled) of the charts that found or settled one, by chart id
        self.model_timings: dict[str, dict[str, Any]] = {}
        # the last chart it failed on (shown in the settings): {"chart", "error", "at"}
        self.last_error: dict[str, Any] | None = None

    def active(self) -> bool:
        return self.runtime.ready()

    def config(self) -> dict[str, Any]:
        cfg = dict(mapper_config())
        state = self.runtime.state() or {}
        cfg["_cpu"] = state.get("device") == "cpu"
        # the LoRA adapter of each key count that has one (lora.py)
        cfg["_lora"] = adapters(cfg, self.runtime.root)
        return cfg

    def plan(self, analysis: dict[str, Any], key_mode: str, difficulty: str, target_level: int | None, seed: int | None) -> tuple[int, int, str]:
        """The level a chart aims at, its seed and its id."""
        level = charts.target_level(key_mode, difficulty, target_level)
        if seed is None:
            seed = default_seed(analysis.get("audioHash", ""), key_mode, difficulty, target_level)
        return level, int(seed), charts.chart_id(analysis, key_mode, difficulty, level, int(seed), self.config())

    def predicted(self, analysis: dict[str, Any], key_mode: str, difficulty: str, target_level: int | None, seed: int | None, meta: dict[str, Any]) -> dict[str, Any]:
        level, seed, cid = self.plan(analysis, key_mode, difficulty, target_level, seed)
        return charts.predicted_meta(analysis, key_mode, difficulty, level, seed, cid, self.config(), meta, target_level)

    def generate(
        self, analysis: dict[str, Any], key_mode: str, difficulty: str, target_level: int | None, seed: int | None, meta: dict[str, Any],
        audio_path: Path, song_timing: Callable[[], dict[str, Any] | None] | None = None,
        song_fit: Callable[[], list[list[float]]] | None = None,
    ) -> dict[str, Any]:
        """`song_timing`: asked when the chart's turn comes, for the timing the song's first chart
        found (None: this is the first, and the model finds it), as the song's kept record
        ({"timing", "steady", "raw"}: Library.mapper_timing_record) or the timing alone.

        The model's timing is settled before the song keeps it (steady.settled_timing): a steady
        song's red lines become one tempo, and a tempo the song's onsets do not follow is taken
        out. A first chart's notes move with their grid; when tempos were taken out its notes
        followed them, and it is made again on the settled timing. A timing kept from before it was
        settled is settled before the chart is made on it (from the model's own when that was kept).
        The chart says what was done (generator.timingSteady, timingFixed) and the song keeps the
        timing; the model's own is in `model_timings` under the chart's id for the song to keep too."""
        from .. import audio_io
        import soundfile as sf

        cfg = self.config()
        level, seed, cid = self.plan(analysis, key_mode, difficulty, target_level, seed)
        timing = song_timing() if song_timing is not None else None
        onsets, duration = analysis.get("onsets", []), float(analysis["durationMs"])
        # mapper.json timingCheck and timingSteady (docs/MAPPERATORINATOR.md, "정박 곡의 박자를 하나로")
        check, steady = bool(cfg.get("timingCheck", True)), bool(cfg.get("timingSteady", True))
        fixed: list[dict[str, Any]] = []
        steadied: dict[str, Any] | None = None
        moves = None
        if timing is not None and "tempoMap" not in timing:
            record = timing
            timing = record.get("timing")
            if timing is not None and not (steady and record.get("steady") == STEADY_VERSION):
                model = record.get("raw") or timing
                timing, fixed, steadied, _ = settled_timing(model, onsets, duration, check, steady)
                self.model_timings[cid] = model
        elif timing is not None:
            timing, fixed, steadied, _ = settled_timing(timing, onsets, duration, check, steady)
        keycount = len(charts.columns(key_mode))
        if charts.lora_of(key_mode, cfg):
            # PEFT, which merges the adapter: a runtime set up before adapters has none
            try:
                self.runtime.ensure_lora()
            except Exception as e:
                raise MapperError(f"LoRA 어댑터를 쓰는 데 필요한 패키지(peft)를 설치하지 못했습니다: {e}") from e
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

            aim = charts.aim_of(key_mode, difficulty, target_level)
            rule = fit.settings(cfg)
            # the song's charts made before (other tiers): where they landed (`song_fit`)
            prior = [(float(s), float(r)) for s, r in (song_fit() if song_fit is not None and rule.get("enabled", True) else [])]
            first_stars = fit.first_stars(prior, aim, charts.stars_of(aim, cfg, key_mode), rule)

            def make(on_timing: dict[str, Any] | None, name: str, stars: float = first_stars) -> dict[str, Any]:
                beatmap = None
                if on_timing is not None:
                    beatmap = tmp / f"{name}-timing.osu"
                    beatmap.write_text(charts.timing_osu(on_timing, keycount, wav.name, meta.get("title", ""), meta.get("artist", "")), encoding="utf-8")
                out = tmp / name
                out.mkdir()
                return self.service.generate(charts.request_for(key_mode, aim, seed, cfg, wav, out, beatmap, meta, end, stars), timeout)

            answer = make(timing, "out")
            osu_text = Path(answer["osu"]).read_text(encoding="utf-8-sig")
            found = None
            try:
                if timing is None:
                    model = parse_osu(osu_text).timing
                    self.model_timings[cid] = model
                    found, fixed, steadied, moves = settled_timing(model, onsets, duration, check, steady)
                    if fixed:
                        # its notes followed the lost beat: made again on the timing without it
                        log.warning("Mapperatorinator's timing lost the beat (%s): the chart is made again without those tempos", fixed)
                        first = answer
                        answer = make(found, "again")
                        answer = {**answer, "seconds": float(first.get("seconds") or 0.0) + float(answer.get("seconds") or 0.0)}
                        osu_text = Path(answer["osu"]).read_text(encoding="utf-8-sig")
                    elif found is model:
                        found = None
                chart = charts.make_chart(
                    analysis, key_mode, difficulty, level, seed, cid, cfg, meta, osu_text, answer, target_level, timing, quiet,
                    found_timing=found, timing_fixed=fixed or None, timing_steady=steadied, moves=moves, stars=first_stars,
                )
                return self._fitted(
                    chart, osu_text, answer, first_stars, make, analysis, key_mode, difficulty, level, seed, cid, cfg, meta, target_level,
                    timing, quiet, fixed, steadied, len(prior),
                )
            except ValueError as e:
                raise MapperError(str(e)) from e
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def _fitted(
        self, chart: dict[str, Any], osu_text: str, answer: dict[str, Any], stars: float, make: Callable[..., dict[str, Any]],
        analysis: dict[str, Any], key_mode: str, difficulty: str, level: int, seed: int, cid: str, cfg: dict[str, Any], meta: dict[str, Any],
        target_level: int | None, timing: dict[str, Any] | None, quiet: list[tuple[float, float]], fixed: list[dict[str, Any]],
        steadied: dict[str, Any] | None, prior: int = 0,
    ) -> dict[str, Any]:
        """The chart with its level in its tier's range (fit.py): made again at the star rating the
        tries so far point to while it is not, at most levelFit.attempts charts in all, on the
        timing the first was made on; the last too high, it is the one of them least over that is
        thinned; all too low, the song has no chart of the tier (fit.TierAbsent)."""
        rule = fit.settings(cfg)
        if not rule.get("enabled", True):
            return chart
        window = fit.window_for(difficulty, target_level)
        goal = fit.aim(window, target_level)
        base = chart["timing"]
        made = [(chart, osu_text, answer, stars)]
        tries = [(stars, float(chart["meta"]["rating"]))]
        record = [{"stars": stars, "level": int(chart["meta"]["level"]), "rating": float(chart["meta"]["rating"])}]
        seconds = float(answer.get("seconds") or 0.0)

        def again(text: str, ans: dict[str, Any], at: float, max_level: int | None = None) -> dict[str, Any]:
            # on the timing the first chart has (the song's, or the one it found: still the song's first)
            return charts.make_chart(
                analysis, key_mode, difficulty, level, seed, cid, cfg, meta, text, ans, target_level, timing, quiet,
                found_timing=None if timing is not None else base, timing_fixed=fixed or None, timing_steady=steadied, moves=None,
                stars=at, max_level=max_level,
            )

        while window.side(int(made[-1][0]["meta"]["level"])) != 0 and len(made) < int(rule["attempts"]):
            nxt = fit.next_stars(tries, goal, rule)
            if any(abs(nxt - s) < 0.005 for s, _ in tries):
                break  # the stars are at their bound: another try would make the same chart
            log.info("chart %s level %s is outside %s-%s: made again at %.2f stars", cid, made[-1][0]["meta"]["level"], window.lo, window.hi, nxt)
            ans = make(base, f"try{len(made)}", nxt)
            seconds += float(ans.get("seconds") or 0.0)
            text = Path(ans["osu"]).read_text(encoding="utf-8-sig")
            c = again(text, ans, nxt)
            made.append((c, text, ans, nxt))
            tries.append((nxt, float(c["meta"]["rating"])))
            record.append({"stars": nxt, "level": int(c["meta"]["level"]), "rating": float(c["meta"]["rating"])})
        info = {"window": [window.lo, window.hi], "aim": goal, "tries": record, **({"prior": prior} if prior else {})}
        inside = [m for m in made if window.holds(int(m[0]["meta"]["level"]))]
        if inside:
            out = inside[-1][0]
        else:
            over = [m for m in made if int(m[0]["meta"]["level"]) > window.hi]
            if not over:
                raise fit.TierAbsent(
                    f"곡이 조용해 {difficulty}(레벨 {window.lo}–{window.hi}) 채보를 만들 수 없습니다 (가장 높은 레벨 {max(r['level'] for r in record)})",
                    # what it was found with (all of it is in the chart id too: a change of any asks again)
                    {"chartId": cid, "keyMode": key_mode, "difficulty": difficulty, "model": cfg.get("model", "v32"),
                     "settings": charts.settings_tag(cfg), "stars": charts.stars_table(cfg, key_mode), "levelFit": rule, **info},
                )
            least = min(over, key=lambda m: float(m[0]["meta"]["rating"]))
            out = again(least[1], least[2], least[3], max_level=window.hi)
        gen = out["meta"]["generator"]
        if not window.holds(int(out["meta"]["level"])):
            log.warning("chart %s: level %s is still outside %s-%s after thinning", cid, out["meta"]["level"], window.lo, window.hi)
        if len(made) > 1 or "thinned" in gen or prior:
            gen["fit"] = info
        gen["seconds"] = round(seconds, 2)
        return out

    def fit_key(self, key_mode: str) -> str:
        """Under what a song keeps where its charts landed (Library.mapper_fit_tries): the model, the
        key mode and the adapter and conditions of its key count (each lands elsewhere)."""
        cfg = self.config()
        lora = charts.lora_of(key_mode, cfg)
        cond = charts.conditions_of(key_mode, cfg)
        return f"{cfg.get('model', 'v32')}|{key_mode}|{lora['tag'] if lora else ''}|{json.dumps(cond, sort_keys=True) if cond else ''}"

    def close(self) -> None:
        self.service.close()
