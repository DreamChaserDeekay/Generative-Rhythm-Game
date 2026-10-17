"""FastAPI application: songs, analysis, chart generation, scores, and the built client."""

from __future__ import annotations

import random
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .. import __version__
from ..analysis.analyzer import ANALYZER_NAME, ANALYZER_VERSION
from ..audio_io import SUPPORTED_EXTENSIONS
from ..config import CLIENT_DIST, data_dir, difficulty_config, load_config
from ..generator import GENERATOR_VERSION, GenerationError, chart_id_for, default_seed, generate_chart
from ..generator.params import resolve_params
from ..synth import make_song
from .jobs import AnalysisQueue
from .library import Library, SongNotFound

MAX_UPLOAD_BYTES = 300 * 1024 * 1024


class ChartRequest(BaseModel):
    keyMode: str
    difficulty: str = "NORMAL"
    targetLevel: int | None = Field(default=None, ge=1, le=15)
    seed: int | None = Field(default=None, ge=0, le=2**32 - 1)
    newSeed: bool = False
    params: dict[str, Any] = Field(default_factory=dict)


class SongPatch(BaseModel):
    title: str | None = None
    artist: str | None = None
    bpm: float | None = Field(default=None, gt=20, lt=400)
    clearBpm: bool = False
    offsetShiftMs: float | None = Field(default=None, ge=-2000, le=2000)


class DemoRequest(BaseModel):
    bpm: float = Field(default=128.0, gt=60, lt=220)
    bars: int = Field(default=48, ge=8, le=160)
    seed: int = Field(default=7, ge=0, le=10_000)


class ScoreRequest(BaseModel):
    chartId: str
    songId: str
    score: int = Field(ge=0, le=1_000_000)
    rate: float = Field(ge=0, le=100)
    maxCombo: int = Field(ge=0)
    lamp: str
    judgementMode: str = "NORMAL"
    breaks: int = Field(default=0, ge=0)
    autoPlay: bool = False
    detail: dict[str, Any] = Field(default_factory=dict)


def create_app(root: Path | None = None, client_dist: Path | None = CLIENT_DIST, synchronous_jobs: bool = False) -> FastAPI:
    library = Library(root or data_dir())
    queue = AnalysisQueue(library, synchronous=synchronous_jobs)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        queue.resume_pending()
        yield
        queue.shutdown()

    app = FastAPI(title="Generative Rhythm Game server", version=__version__, lifespan=lifespan)
    app.state.library = library
    app.state.queue = queue

    def song_or_404(song_id: str) -> dict[str, Any]:
        try:
            return library.get_song(song_id)
        except SongNotFound:
            raise HTTPException(404, "곡을 찾을 수 없습니다") from None

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        keymodes = load_config("keymodes")
        return {
            "ok": True,
            "version": __version__,
            "analyzer": f"{ANALYZER_NAME}-{ANALYZER_VERSION}",
            "generator": GENERATOR_VERSION,
            "keyModes": keymodes["enabled"],
            "difficulties": difficulty_config()["order"],
            "formats": sorted(SUPPORTED_EXTENSIONS),
        }

    @app.get("/api/songs")
    def list_songs() -> dict[str, Any]:
        return {"songs": library.list_songs()}

    @app.post("/api/songs", status_code=201)
    def upload_song(file: UploadFile = File(...)) -> dict[str, Any]:
        name = file.filename or "upload"
        ext = Path(name).suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(415, f"지원하지 않는 형식입니다: {ext or '(확장자 없음)'}")
        tmp = library.tmp_path(ext)
        size = 0
        with open(tmp, "wb") as out:
            while chunk := file.file.read(1 << 20):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    out.close()
                    tmp.unlink(missing_ok=True)
                    raise HTTPException(413, "파일이 너무 큽니다 (최대 300MB)")
                out.write(chunk)
        try:
            song, created = library.add_song_file(tmp, name)
        except Exception as e:
            tmp.unlink(missing_ok=True)
            raise HTTPException(422, f"오디오를 읽지 못했습니다: {e}") from e
        if created or song["status"] == "error":
            queue.submit(song["id"])
            song = library.get_song(song["id"])
        return {"song": song, "created": created}

    @app.post("/api/songs/demo", status_code=201)
    def add_demo(req: DemoRequest) -> dict[str, Any]:
        synth = make_song(bpm=req.bpm, bars=req.bars, seed=req.seed, offset=0.8)
        song = library.add_generated_song(synth.pcm, f"Demo Groove {req.bpm:g}", "Generative Rhythm (합성 데모)")
        if song["status"] != "ready":
            queue.submit(song["id"])
            song = library.get_song(song["id"])
        return {"song": song}

    @app.get("/api/songs/{song_id}")
    def get_song(song_id: str) -> dict[str, Any]:
        song = song_or_404(song_id)
        return {"song": dict(song, records=library.best_scores(song_id))}

    @app.patch("/api/songs/{song_id}")
    def patch_song(song_id: str, patch: SongPatch) -> dict[str, Any]:
        song = song_or_404(song_id)
        fields: dict[str, Any] = {}
        if patch.title is not None:
            fields["title"] = patch.title.strip() or song["title"]
        if patch.artist is not None:
            fields["artist"] = patch.artist.strip()
        overrides = dict(song["overrides"])
        if patch.clearBpm:
            overrides.pop("bpm", None)
        if patch.bpm is not None:
            overrides["bpm"] = patch.bpm
        if patch.offsetShiftMs is not None:
            overrides["offsetShiftMs"] = patch.offsetShiftMs
        reanalyze = overrides != song["overrides"]
        if reanalyze:
            fields["overrides"] = overrides
        song = library.update_song(song_id, **fields)
        if reanalyze:
            queue.submit(song_id)
            song = library.get_song(song_id)
        return {"song": song, "reanalyzing": reanalyze}

    @app.delete("/api/songs/{song_id}", status_code=204)
    def delete_song(song_id: str) -> None:
        song_or_404(song_id)
        library.delete_song(song_id)

    @app.get("/api/songs/{song_id}/audio")
    def song_audio(song_id: str) -> FileResponse:
        song_or_404(song_id)
        path = library.audio_path(song_id)
        if not path.exists():
            raise HTTPException(404, "오디오 파일이 없습니다")
        return FileResponse(path, media_type="audio/flac")

    @app.get("/api/songs/{song_id}/cover")
    def song_cover(song_id: str) -> FileResponse:
        song_or_404(song_id)
        path = library.cover_path(song_id)
        if path is None:
            raise HTTPException(404, "앨범아트가 없습니다")
        return FileResponse(path)

    @app.get("/api/songs/{song_id}/analysis")
    def song_analysis(song_id: str) -> dict[str, Any]:
        song_or_404(song_id)
        analysis = library.load_analysis(song_id)
        if analysis is None:
            raise HTTPException(409, "아직 분석이 끝나지 않았습니다")
        return analysis

    @app.post("/api/songs/{song_id}/charts")
    async def create_chart(song_id: str, req: ChartRequest) -> dict[str, Any]:
        song = song_or_404(song_id)
        if song["status"] != "ready":
            raise HTTPException(409, "아직 분석이 끝나지 않았습니다")
        analysis = library.load_analysis(song_id)
        if analysis is None:
            raise HTTPException(409, "분석 결과가 없습니다")
        try:
            params = resolve_params(req.keyMode, req.difficulty, req.targetLevel, req.params)
        except (ValueError, StopIteration) as e:
            raise HTTPException(400, str(e)) from e
        seed = req.seed
        if req.newSeed:
            seed = random.SystemRandom().randrange(2**32)
        if seed is None:
            seed = default_seed(analysis["audioHash"], req.keyMode, params.difficulty, params.target_level)
        chart_id = chart_id_for(analysis, req.keyMode, params, seed)
        cached = library.load_chart(chart_id)
        if cached is not None:
            return {"chart": cached, "cached": True}
        meta = {"songId": song_id, "title": song["title"], "artist": song["artist"]}
        try:
            chart = await run_in_threadpool(
                generate_chart, analysis, req.keyMode, req.difficulty, req.targetLevel, seed, req.params, meta
            )
        except GenerationError as e:
            raise HTTPException(422, str(e)) from e
        library.save_chart(chart, song_id)
        return {"chart": chart, "cached": False}

    @app.get("/api/charts/{chart_id}")
    def get_chart(chart_id: str) -> dict[str, Any]:
        chart = library.load_chart(chart_id)
        if chart is None:
            raise HTTPException(404, "채보를 찾을 수 없습니다")
        return {"chart": chart}

    @app.post("/api/scores", status_code=201)
    def add_score(req: ScoreRequest) -> dict[str, Any]:
        if req.autoPlay:
            raise HTTPException(400, "오토 플레이 기록은 저장하지 않습니다")
        song_or_404(req.songId)
        if library.load_chart(req.chartId) is None:
            raise HTTPException(404, "채보를 찾을 수 없습니다")
        score_id = library.add_score(req.model_dump())
        return {"id": score_id, "records": library.best_scores(req.songId)}

    @app.get("/api/songs/{song_id}/scores")
    def song_scores(song_id: str) -> dict[str, Any]:
        song_or_404(song_id)
        return {"records": library.best_scores(song_id)}

    if client_dist is not None and (Path(client_dist) / "index.html").exists():
        app.mount("/", StaticFiles(directory=str(client_dist), html=True), name="client")

    return app

