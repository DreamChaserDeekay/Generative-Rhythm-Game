"""FastAPI application: songs, analysis, chart generation, scores, and the built client."""

from __future__ import annotations

import asyncio
import hmac
import logging
import os
import random
import re
import shutil
import threading
import time
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from urllib.parse import parse_qs, quote, urlparse

from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .. import __version__, audio_io
from ..analysis.analyzer import ANALYZER_NAME, ANALYZER_VERSION
from ..analysis.backends import detect as detect_backends, status as backend_status
from ..analysis.stems import STEM_NAMES, separate
from ..audio_io import SUPPORTED_EXTENSIONS
from ..config import CLIENT_DIST, data_dir, difficulty_config, load_config, max_level
from ..formats import FormatError, assemble_chart, export_chart, export_formats
from ..formats.common import ascii_text
from ..formats.images import MAX_IMAGE_BYTES, MEDIA_TYPES, image_kind
from ..formats.package import ARCHIVE_EXTENSIONS, IMPORT_EXTENSIONS, extract_archive, extract_images, safe_relpath
from ..chart.keysounds import keysound_meta
from ..chart.sections import edited_analysis
from ..difficulty.tiers import resolve_tier
from .sketch import sketch_of
from ..synth import make_song
from .imports import import_package
from .jobs import AnalysisQueue
from .library import BGA_EXTENSIONS, Library, SongNotFound
from ..mapper import Mapper, MapperError
from ..mapper.charts import MAPPER_VERSION, settings_tag, song_bpm
from ..mapper.runtime import public_settings, save_settings
from ..mapper.queue import BACKGROUND, OPENED, MapperQueue

log = logging.getLogger("rhythm_server.api")
MAX_UPLOAD_BYTES = 300 * 1024 * 1024
MAX_BGA_BYTES = 1024 * 1024 * 1024
MAX_IMPORT_BYTES = 4 * 1024**3
MAX_REPLAY_ENTRIES = 200_000
MAX_TARGET_LEVEL = max_level()


class ChartRequest(BaseModel):
    keyMode: str
    difficulty: str = "NORMAL"
    targetLevel: int | None = Field(default=None, ge=1, le=MAX_TARGET_LEVEL)
    seed: int | None = Field(default=None, ge=0, le=2**32 - 1)
    newSeed: bool = False
    params: dict[str, Any] = Field(default_factory=dict)
    # the chart's meta only (its level and notes for the song select), not its notes; a chart made
    # for it is not saved until it is asked for whole
    brief: bool = False


class CustomChartRequest(BaseModel):
    """Notes edited in the chart editor, on the timing of the chart they started from."""

    baseChartId: str
    notes: list[dict[str, Any]] = Field(max_length=50_000)
    name: str = Field(default="", max_length=80)


NOTE_FIELDS = ("t", "lane", "type", "endT", "src", "snd", "so", "sl")


class SectionEdit(BaseModel):
    """One section of a user's section edit: where it starts (beats from the first downbeat, on a
    bar line), what it is and which repetition group it belongs to."""

    startBeat: float = Field(ge=-64, le=100_000)
    label: Literal["intro", "verse", "pre-chorus", "chorus", "bridge", "drop", "outro"]
    group: str = Field(pattern=r"^[A-Z]$")


class SongPatch(BaseModel):
    title: str | None = None
    artist: str | None = None
    bpm: float | None = Field(default=None, gt=20, lt=400)
    clearBpm: bool = False
    offsetShiftMs: float | None = Field(default=None, ge=-2000, le=2000)
    bgaOffsetMs: float | None = Field(default=None, ge=-60000, le=60000)
    # a YouTube link (or video ID) as the background video; "" removes it
    bgaYoutube: str | None = Field(default=None, max_length=500)
    # the song's sections as the user sees them; [] goes back to the analysed ones
    sections: list[SectionEdit] | None = Field(default=None, max_length=128)


YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def youtube_video_id(text: str) -> str | None:
    """The video ID of a YouTube link (watch, youtu.be, shorts, embed, live) or of a bare ID."""
    text = text.strip()
    if YOUTUBE_ID.fullmatch(text):
        return text
    url = urlparse(text if "://" in text else f"https://{text}")
    host = (url.hostname or "").lower()
    for prefix in ("www.", "m.", "music."):
        host = host.removeprefix(prefix)
    if host == "youtu.be":
        candidate = url.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "youtube-nocookie.com"):
        parts = url.path.strip("/").split("/")
        if parts[0] == "watch":
            candidate = (parse_qs(url.query).get("v") or [""])[0]
        else:
            candidate = parts[1] if len(parts) >= 2 and parts[0] in ("shorts", "embed", "live", "v") else ""
    else:
        return None
    return candidate if YOUTUBE_ID.fullmatch(candidate) else None


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
    # the inputs of the play (client format, see engine/replay.ts); kept next to the score
    replay: dict[str, Any] | None = None


# so many charts made for their brief only are kept whole in memory, and the metas of so many
BRIEF_CHARTS_KEPT = 12
BRIEF_METAS_KEPT = 1000


def _exit_soon() -> None:
    """Ends the process a moment after the response has gone out (as the desktop app's own stop does)."""
    threading.Timer(0.2, os._exit, (0,)).start()


def create_app(
    root: Path | None = None,
    client_dist: Path | None = CLIENT_DIST,
    synchronous_jobs: bool = False,
    shutdown_token: str | None = None,
    mapper: Mapper | None = None,
) -> FastAPI:
    """`shutdown_token`: the desktop app's, for POST /api/shutdown (a later launch stops the server
    an earlier one left behind on its port); None: no such route. `mapper`: Mapperatorinator, the
    chart generator (docs/MAPPERATORINATOR.md); charts are made once its runtime is set up."""
    library = Library(root or data_dir())
    mapper = mapper or Mapper()
    # Mapperatorinator's charts, one at a time (one GPU): the one opened first, then the other
    # tiers of its key mode in the background
    mapper_queue = MapperQueue(mapper.generate)
    # stems for keysounds are separated right after each analysis (ensure_stems is defined below)
    queue = AnalysisQueue(library, synchronous=synchronous_jobs, after_analysis=lambda song_id, pcm: ensure_stems(song_id, pcm))

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        queue.resume_pending()
        yield
        queue.shutdown()
        mapper_queue.close()
        mapper.close()

    app = FastAPI(title="Generative Rhythm Game server", version=__version__, lifespan=lifespan)
    app.state.library = library
    app.state.queue = queue
    app.state.mapper = mapper

    def song_or_404(song_id: str) -> dict[str, Any]:
        try:
            return library.get_song(song_id)
        except SongNotFound:
            raise HTTPException(404, "곡을 찾을 수 없습니다") from None

    def annotate(songs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Marks songs whose analysis predates the current analyzer or the installed backends."""
        active = {kind: b.name for kind, b in detect_backends().items()}
        out = []
        for song in songs:
            info = song.get("analyzer") or {}
            used = info.get("backends") or {}
            outdated = song["status"] == "ready" and (
                info.get("version") != ANALYZER_VERSION or any(not str(used.get(k, "")).startswith(name) for k, name in active.items())
            )
            out.append(dict(song, outdated=outdated))
        return out

    stem_locks: dict[str, threading.Lock] = {}
    stem_locks_guard = threading.Lock()

    def ensure_stems(song_id: str, pcm: Any = None) -> dict[str, Any]:
        """Cached stems, separating them first (ML separator when installed, else the core one).
        `pcm`: the song's canonical audio when at hand (right after its analysis), else read."""
        info = library.stems_info(song_id)
        if info is not None:
            return info
        with stem_locks_guard:
            lock = stem_locks.setdefault(song_id, threading.Lock())
        with lock:
            info = library.stems_info(song_id)
            if info is not None:
                return info
            if pcm is not None:
                sr = audio_io.SAMPLE_RATE
            else:
                pcm, sr = audio_io.read_canonical(library.audio_path(song_id))
            stems, method = None, "core-dsp"
            backend = detect_backends().get("stems")
            while backend is not None and stems is None:
                try:
                    stems, method = backend.module().separate(pcm, sr, backend.options), backend.label
                except Exception as e:
                    log.warning("stem backend %s failed: %s", backend.label, e)
                    backend = backend.fallback  # the second separator, then the core one
            if stems is None:
                stems = separate(pcm, sr)
            library.save_stems(song_id, stems, method)
            return library.stems_info(song_id) or {}

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        keymodes = load_config("keymodes")
        return {
            "ok": True,
            "version": __version__,
            "analyzer": f"{ANALYZER_NAME}-{ANALYZER_VERSION}",
            # charts known by their brief are told apart by this ("+mapper-": how the client knows
            # its charts are Mapperatorinator's, made when opened)
            "generator": f"ai+mapper-{MAPPER_VERSION}-{settings_tag(mapper.config())}",
            "keyModes": keymodes["enabled"],
            "difficulties": difficulty_config()["order"],
            "formats": sorted(SUPPORTED_EXTENSIONS),
            "backends": backend_status(),
            "stems": list(STEM_NAMES),
            "mapper": mapper_state(),
        }

    def mapper_state() -> dict[str, Any]:
        return {**mapper.runtime.status(), "lastError": mapper.last_error, "settings": public_settings()}

    @app.put("/api/mapper/settings")
    def mapper_settings(patch: dict[str, Any]) -> dict[str, Any]:
        """The settings screen's Mapperatorinator settings (kept in the runtime folder: a new
        install of the app keeps them). A chart made with other settings stays saved; the ones
        made from now on follow these."""
        try:
            save_settings(patch)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        return mapper_state()

    @app.get("/api/mapper")
    def mapper_status() -> dict[str, Any]:
        return mapper_state()

    @app.get("/api/mapper/queue")
    def mapper_queue_state() -> dict[str, Any]:
        """The chart being made now and how many wait. The model works on the GPU the game is
        drawn with: the desktop app notes this down when its graphics are lost (desktop/main.js)."""
        return mapper_queue.snapshot()

    @app.post("/api/mapper/install", status_code=202)
    def mapper_install() -> dict[str, Any]:
        status = mapper.runtime.status()
        if status["state"] == "unsupported":
            raise HTTPException(409, status.get("reason") or "NVIDIA GPU가 없습니다")
        mapper.runtime.install()
        return mapper_state()

    if shutdown_token:

        @app.post("/api/shutdown", status_code=202)
        def shutdown(x_shutdown_token: str = Header("")) -> dict[str, Any]:
            if not hmac.compare_digest(x_shutdown_token.encode(), shutdown_token.encode()):
                raise HTTPException(403, "토큰이 맞지 않습니다")
            _exit_soon()
            return {"ok": True}

    @app.get("/api/songs")
    def list_songs() -> dict[str, Any]:
        return {"songs": annotate(library.list_songs())}

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
        # with no analysis ahead of it, the song's analysis starts on the decoded audio while its
        # canonical file is written
        started: list[str] = []

        def start(song_id: str, pcm: Any) -> None:
            queue.submit(song_id, pcm=pcm)
            started.append(song_id)

        try:
            song, created = library.add_song_file(tmp, name, start=start if queue.starts_now() else None)
        except Exception as e:
            tmp.unlink(missing_ok=True)
            raise HTTPException(422, f"오디오를 읽지 못했습니다: {e}") from e
        if (created or song["status"] == "error") and song["id"] not in started:
            queue.submit(song["id"])
        song = library.get_song(song["id"])
        return {"song": annotate([song])[0], "created": created}

    @app.post("/api/songs/demo", status_code=201)
    def add_demo(req: DemoRequest) -> dict[str, Any]:
        synth = make_song(bpm=req.bpm, bars=req.bars, seed=req.seed, offset=0.8)
        song = library.add_generated_song(synth.pcm, f"Demo Groove {req.bpm:g}", "Generative Rhythm (합성 데모)")
        if song["status"] != "ready":
            queue.submit(song["id"])
            song = library.get_song(song["id"])
        return {"song": annotate([song])[0]}

    @app.get("/api/songs/{song_id}")
    def get_song(song_id: str) -> dict[str, Any]:
        song = annotate([song_or_404(song_id)])[0]
        return {"song": dict(song, records=library.best_scores(song_id))}

    @app.post("/api/songs/{song_id}/reanalyze")
    def reanalyze(song_id: str) -> dict[str, Any]:
        song_or_404(song_id)
        queue.submit(song_id)
        return {"song": annotate([library.get_song(song_id)])[0]}

    @app.get("/api/songs/{song_id}/stems")
    def stems_status(song_id: str) -> dict[str, Any]:
        song_or_404(song_id)
        info = library.stems_info(song_id)
        backend = detect_backends().get("stems")
        return {"names": list(STEM_NAMES), "cached": info is not None, "method": info["method"] if info else (backend.label if backend else "core-dsp")}

    @app.get("/api/songs/{song_id}/stems/{name}")
    async def stem_audio(song_id: str, name: str) -> FileResponse:
        song = song_or_404(song_id)
        if name not in STEM_NAMES:
            raise HTTPException(404, "알 수 없는 스템입니다")
        if song["status"] != "ready":
            raise HTTPException(409, "아직 분석이 끝나지 않았습니다")
        await run_in_threadpool(ensure_stems, song_id)
        return FileResponse(library.stem_path(song_id, name), media_type="audio/flac")

    @app.post("/api/songs/{song_id}/bga", status_code=201)
    def upload_bga(song_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
        song_or_404(song_id)
        ext = Path(file.filename or "").suffix.lower()
        if ext not in BGA_EXTENSIONS:
            raise HTTPException(415, f"지원하지 않는 영상 형식입니다: {ext or '(확장자 없음)'} — mp4·webm을 쓰세요")
        tmp = library.tmp_path(ext)
        size = 0
        with open(tmp, "wb") as out:
            while chunk := file.file.read(1 << 20):
                size += len(chunk)
                if size > MAX_BGA_BYTES:
                    out.close()
                    tmp.unlink(missing_ok=True)
                    raise HTTPException(413, "영상이 너무 큽니다 (최대 1GB)")
                out.write(chunk)
        library.save_bga(song_id, tmp, ext)
        return {"song": annotate([library.get_song(song_id)])[0]}

    @app.get("/api/songs/{song_id}/bga")
    def get_bga(song_id: str) -> FileResponse:
        song_or_404(song_id)
        path = library.bga_path(song_id)
        if path is None:
            raise HTTPException(404, "배경 영상이 없습니다")
        return FileResponse(path, media_type=BGA_EXTENSIONS.get(path.suffix, "application/octet-stream"))

    @app.delete("/api/songs/{song_id}/bga", status_code=204)
    def delete_bga(song_id: str) -> None:
        song_or_404(song_id)
        library.delete_bga(song_id)

    @app.patch("/api/songs/{song_id}")
    def patch_song(song_id: str, patch: SongPatch) -> dict[str, Any]:
        song = song_or_404(song_id)
        if patch.bgaYoutube is not None:
            if not patch.bgaYoutube.strip():
                library.delete_bga(song_id)
            else:
                video_id = youtube_video_id(patch.bgaYoutube)
                if video_id is None:
                    raise HTTPException(400, "유튜브 영상 링크를 알아볼 수 없습니다")
                library.set_bga_youtube(song_id, video_id)
        fields: dict[str, Any] = {}
        if patch.title is not None:
            fields["title"] = patch.title.strip() or song["title"]
        if patch.artist is not None:
            fields["artist"] = patch.artist.strip()
        if patch.bgaOffsetMs is not None:
            fields["bga_offset_ms"] = patch.bgaOffsetMs
        if patch.sections is not None:
            starts = [e.startBeat for e in patch.sections]
            if len(set(starts)) != len(starts):
                raise HTTPException(400, "같은 위치에서 시작하는 구간이 둘 있습니다")
            fields["sections"] = [e.model_dump() for e in sorted(patch.sections, key=lambda e: e.startBeat)] or None
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
            fields["sections"] = None  # a new beat grid: edited sections no longer line up
        song = library.update_song(song_id, **fields)
        if reanalyze:
            queue.submit(song_id)
            song = library.get_song(song_id)
        return {"song": annotate([song])[0], "reanalyzing": reanalyze}

    @app.delete("/api/songs/{song_id}", status_code=204)
    def delete_song(song_id: str) -> None:
        song_or_404(song_id)
        library.delete_song(song_id)

    @app.get("/api/songs/{song_id}/audio")
    def song_audio(song_id: str) -> FileResponse:
        song_or_404(song_id)
        library.wait_audio(song_id)
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
        return FileResponse(path, media_type=MEDIA_TYPES.get(path.suffix.lower()))

    @app.post("/api/songs/{song_id}/cover", status_code=201)
    def upload_cover(song_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
        """A picture of the player's as the song's cover (in place of its tag's or its package's)."""
        song_or_404(song_id)
        data = file.file.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "그림이 너무 큽니다 (최대 20MB)")
        kind = image_kind(data)
        if kind is None:
            raise HTTPException(415, "그림 파일이 아닙니다 — png·jpg·webp·gif·bmp를 쓰세요")
        library.save_cover(song_id, data, kind)
        return {"song": annotate([library.get_song(song_id)])[0]}

    @app.delete("/api/songs/{song_id}/cover", status_code=204)
    def delete_cover(song_id: str) -> None:
        song_or_404(song_id)
        library.delete_cover(song_id)

    @app.get("/api/songs/{song_id}/analysis")
    def song_analysis(song_id: str) -> dict[str, Any]:
        song_or_404(song_id)
        analysis = library.load_analysis(song_id)
        if analysis is None:
            raise HTTPException(409, "아직 분석이 끝나지 않았습니다")
        return analysis

    sketches: dict[tuple[str, Any, str], dict[str, Any]] = {}

    @app.get("/api/songs/{song_id}/sketch")
    def song_sketch(song_id: str) -> dict[str, Any]:
        """Sections and waveform peaks of the song (the user's sections when edited), for the menus."""
        song = song_or_404(song_id)
        key = (song_id, song.get("analyzedAt"), repr(song.get("sections")))
        if key not in sketches:
            analysis = library.load_analysis(song_id)
            if analysis is None:
                raise HTTPException(409, "아직 분석이 끝나지 않았습니다")
            if song.get("sections"):
                analysis = edited_analysis(analysis, song["sections"])
            sketches[key] = sketch_of(analysis)
        return sketches[key]

    @app.get("/api/songs/{song_id}/sections")
    def song_sections(song_id: str) -> dict[str, Any]:
        """The sections charts are made from (the user's edits, else the analysed ones)."""
        song = song_or_404(song_id)
        analysis = library.load_analysis(song_id)
        if analysis is None:
            raise HTTPException(409, "아직 분석이 끝나지 않았습니다")
        keys = ("startBeat", "endBeat", "label", "group", "energy", "loopBars", "confidence")
        analysed = [{k: r[k] for k in keys if k in r} for r in analysis.get("sections", [])]
        used = edited_analysis(analysis, song["sections"])["sections"] if song.get("sections") else analysed
        return {
            "sections": [{k: r[k] for k in keys if k in r} for r in used],
            "analysed": analysed,
            "edited": bool(song.get("sections")),
            "beatsPerBar": int(analysis["timing"]["meter"][0]["beatsPerMeasure"]),
        }

    def chart_analysis(song: dict[str, Any]) -> dict[str, Any] | None:
        """The analysis charts of the song are made from (with the user's sections)."""
        analysis = library.load_analysis(song["id"])
        if analysis is not None and song.get("sections"):
            analysis = edited_analysis(analysis, song["sections"])
        return analysis

    def chart_meta(song: dict[str, Any]) -> dict[str, Any]:
        return {"songId": song["id"], "title": song["title"], "artist": song["artist"]}

    def queue_mapper(song: dict[str, Any], analysis: dict[str, Any], key_mode: str, tier: str, target: int | None, seed: int | None, priority: int) -> tuple[str, Any]:
        """Queues a Mapperatorinator chart (None for the job when it is saved already): its id and
        job. A made chart is saved by its job, whoever waits for it."""
        _, seed, chart_id = mapper.plan(analysis, key_mode, tier, target, seed)
        if library.chart_path(chart_id).exists():
            return chart_id, None
        sid, model = song["id"], str(mapper.config().get("model", "v32"))
        # the song's timing is asked for when the chart's turn comes: its first chart has found it by then
        args = (analysis, key_mode, tier, target, seed, chart_meta(song), library.audio_path(sid), lambda: library.mapper_timing(sid, model))
        job, new = mapper_queue.submit(chart_id, priority, args)
        if new:
            def done(j: Any, label: str = f"{song['title']} {key_mode} {tier}") -> None:
                if j.cancelled():
                    return
                e = j.exception()
                if e is None:
                    chart = j.result()
                    library.save_chart(chart, sid)
                    if chart["meta"]["generator"].get("timing") == "model":
                        # the song's first chart: its timing is the song's from now on (the other
                        # tiers are made on it), and the song list's BPM
                        library.save_mapper_timing(sid, model, chart["timing"])
                        library.update_song(sid, **{k: v for k, v in zip(("bpm", "bpm_min", "bpm_max"), song_bpm(chart["timing"], chart["meta"]["durationMs"]).values())})
                else:
                    log.warning("Mapperatorinator could not make %s: %s", label, e)
                    mapper.last_error = {"chart": label, "error": str(e), "at": time.time()}

            job.add_done_callback(done)
        return chart_id, job

    def mapper_unavailable() -> str:
        """Why Mapperatorinator cannot make a chart now (there is no other generator)."""
        status = mapper.runtime.status()
        return {
            "unsupported": status.get("reason") or "NVIDIA GPU가 없어 AI 채보를 만들 수 없습니다.",
            "installing": "AI 채보 실행 환경을 설치하는 중입니다. 설치가 끝난 뒤 다시 시도해 주세요.",
            "failed": f"AI 채보 실행 환경 설치에 실패했습니다: {status.get('error')}. 설정에서 다시 설치해 주세요.",
        }.get(status["state"], "AI 채보 실행 환경이 아직 설치되지 않았습니다. 설정 → AI 채보에서 설치해 주세요.")

    @app.post("/api/songs/{song_id}/charts")
    async def create_chart(song_id: str, req: ChartRequest) -> dict[str, Any]:
        """A chart by Mapperatorinator, the only generator (docs/MAPPERATORINATOR.md). `params` (the
        old generator's options) is taken and ignored. A brief gets the level the tier aims at and
        whether it is being made or waits to be. A chart opened is made first; then the other tiers
        of its key mode, in the background. A chart it cannot make is an error to try again on."""
        song = song_or_404(song_id)
        if song["status"] != "ready":
            raise HTTPException(409, "아직 분석이 끝나지 않았습니다")
        analysis = chart_analysis(song)
        if analysis is None:
            raise HTTPException(409, "분석 결과가 없습니다")
        try:
            resolve_tier(req.keyMode, req.difficulty, req.targetLevel)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        seed = random.SystemRandom().randrange(2**32) if req.newSeed else req.seed
        _, seed, chart_id = mapper.plan(analysis, req.keyMode, req.difficulty, req.targetLevel, seed)
        cached = library.load_chart(chart_id)
        if cached is not None:
            return {"meta": cached["meta"], "cached": True} if req.brief else {"chart": cached, "cached": True}
        if req.brief:
            meta = mapper.predicted(analysis, req.keyMode, req.difficulty, req.targetLevel, seed, chart_meta(song))
            state = mapper_queue.state(chart_id)
            meta["making"], meta["queued"] = state == "making", state == "queued"
            return {"meta": meta, "cached": False}
        if not mapper.active():
            raise HTTPException(503, mapper_unavailable())
        _, job = queue_mapper(song, analysis, req.keyMode, req.difficulty, req.targetLevel, seed, OPENED)
        for tier in difficulty_config()["order"]:
            if tier != req.difficulty:
                try:
                    queue_mapper(song, analysis, req.keyMode, tier, None, None, BACKGROUND)
                except ValueError:
                    pass  # a tier this key mode does not have
        if job is None:  # saved meanwhile
            chart = library.load_chart(chart_id)
            if chart is None:
                raise HTTPException(502, "만든 채보를 읽지 못했습니다. 다시 시도해 주세요.")
            return {"chart": chart, "cached": True}
        try:
            chart = await asyncio.wrap_future(job)
        except MapperError as e:
            raise HTTPException(502, f"AI 채보를 만들지 못했습니다: {e} — 다시 시도해 주세요.") from e
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001  (whatever broke, the player hears it and can try again)
            log.exception("chart %s failed", chart_id)
            raise HTTPException(502, f"AI 채보를 만들지 못했습니다: {type(e).__name__}: {e} — 다시 시도해 주세요.") from e
        return {"chart": chart, "cached": False}

    @app.get("/api/charts/{chart_id}")
    def get_chart(chart_id: str) -> dict[str, Any]:
        chart = library.load_chart(chart_id)
        if chart is None:
            raise HTTPException(404, "채보를 찾을 수 없습니다")
        return {"chart": chart}

    def chart_or_404(chart_id: str) -> dict[str, Any]:
        chart = library.load_chart(chart_id)
        if chart is None:
            raise HTTPException(404, "채보를 찾을 수 없습니다")
        return chart

    @app.get("/api/songs/{song_id}/charts")
    def saved_charts(song_id: str) -> dict[str, Any]:
        song_or_404(song_id)
        return {"charts": library.list_charts(song_id)}

    @app.post("/api/songs/{song_id}/charts/custom", status_code=201)
    def save_custom_chart(song_id: str, req: CustomChartRequest) -> dict[str, Any]:
        song = song_or_404(song_id)
        base = chart_or_404(req.baseChartId)
        bmeta = base["meta"]
        notes = [{k: n[k] for k in NOTE_FIELDS if k in n} for n in req.notes]
        base_name = bmeta.get("chartName") or f"{bmeta['keyMode']} {bmeta['difficulty']}"
        source = {"kind": "edited", "from": bmeta["chartId"]}
        if (bmeta.get("source") or {}).get("format"):
            source["format"] = bmeta["source"]["format"]
        extra = {k: bmeta[k] for k in ("keysoundGain", "genre") if k in bmeta}
        try:
            chart = assemble_chart(
                key_mode=bmeta["keyMode"],
                timing=base["timing"],
                notes=notes,
                title=song["title"],
                artist=song["artist"],
                song_id=song_id,
                audio_hash=bmeta.get("audioHash") or song["audioHash"],
                difficulty=bmeta["difficulty"],
                source=source,
                duration_ms=bmeta.get("durationMs"),
                chart_name=req.name.strip() or f"{base_name} (편집)",
                sections=base.get("sections"),
                effects=base.get("effects"),
                extra_meta=extra,
                sounds=base.get("sounds"),
                bgm=base.get("bgm"),
            )
        except (FormatError, KeyError, TypeError, ValueError) as e:
            raise HTTPException(422, str(e)) from e
        chart["meta"]["keysound"] = keysound_meta(chart["notes"])
        library.save_chart(chart, song_id)
        return {"chart": chart}

    @app.delete("/api/charts/{chart_id}", status_code=204)
    def delete_chart(chart_id: str) -> None:
        chart_or_404(chart_id)
        library.delete_chart(chart_id)

    @app.post("/api/import", status_code=201)
    def import_charts(files: list[UploadFile] = File(...), paths: list[str] = Form(default=[])) -> dict[str, Any]:
        """Chart packages: a folder's files (with their relative `paths`), a .zip or an .osz."""
        work = library.tmp_path("-import")
        root = work / "package"
        root.mkdir(parents=True)
        warnings: list[str] = []
        # (archive, the folder it was unpacked into): their pictures come out once a chart names them
        archives: list[tuple[Path, Path]] = []
        try:
            total = 0
            for i, upload in enumerate(files):
                name = paths[i] if i < len(paths) and paths[i] else (upload.filename or f"file{i}")
                rel = safe_relpath(name)
                suffix = Path(rel or "").suffix.lower()
                if rel is None or suffix not in IMPORT_EXTENSIONS:
                    continue
                archive = suffix in ARCHIVE_EXTENSIONS
                target = (work / "archives" / rel) if archive else (root / rel)
                target.parent.mkdir(parents=True, exist_ok=True)
                with open(target, "wb") as out:
                    while chunk := upload.file.read(1 << 20):
                        total += len(chunk)
                        if total > MAX_IMPORT_BYTES:
                            raise HTTPException(413, "가져올 파일이 너무 큽니다 (최대 4GB)")
                        out.write(chunk)
                if archive:
                    try:
                        warnings += extract_archive(target, root / Path(rel).stem)
                        archives.append((target, root / Path(rel).stem))
                    except (zipfile.BadZipFile, FormatError) as e:
                        warnings.append(f"{rel}: 압축을 풀지 못했습니다 ({e})")
                        target.unlink(missing_ok=True)

            def fetch_images(wanted: set[str]) -> None:
                for archive_path, dest in archives:
                    extract_images(archive_path, dest, root, wanted)

            try:
                result = import_package(library, queue, root, fetch_images)
            except FormatError as e:
                raise HTTPException(422, "; ".join([str(e), *warnings[:3]])) from e
        finally:
            shutil.rmtree(work, ignore_errors=True)
        result["warnings"] = warnings + result["warnings"]
        result["songs"] = annotate(result["songs"])
        return result

    @app.get("/api/songs/{song_id}/keysounds.json")
    def keysound_index(song_id: str) -> dict[str, Any]:
        song_or_404(song_id)
        info = library.keysounds_info(song_id)
        if info is None:
            raise HTTPException(404, "키음이 없는 곡입니다")
        return info

    @app.get("/api/songs/{song_id}/keysounds.flac")
    def keysound_sprite(song_id: str) -> FileResponse:
        song_or_404(song_id)
        if library.keysounds_info(song_id) is None:
            raise HTTPException(404, "키음이 없는 곡입니다")
        return FileResponse(library.keysounds_dir(song_id) / "sprite.flac", media_type="audio/flac")

    @app.get("/api/charts/{chart_id}/export")
    def export_chart_file(chart_id: str, format: str = "osu", offsetMs: float = Query(default=0.0, ge=-5000, le=5000)) -> Response:
        chart = chart_or_404(chart_id)
        if format not in export_formats(chart["meta"]["keyMode"]):
            raise HTTPException(400, f"{chart['meta']['keyMode']} 채보는 {format}로 내보낼 수 없습니다")
        song_id = chart["meta"].get("songId") or library.chart_song(chart_id)
        song: dict[str, Any] = {}
        if song_id:
            try:
                song = library.get_song(song_id)
            except SongNotFound:
                song = {}
        audio_name = song.get("originalName") or "audio.flac"
        try:
            data, filename, media = export_chart(chart, format, audio_name, song.get("previewMs"), offsetMs)
        except FormatError as e:
            raise HTTPException(422, str(e)) from e
        disposition = f"attachment; filename=\"{ascii_text(filename, 'chart')}\"; filename*=UTF-8''{quote(filename)}"
        return Response(content=data, media_type=media, headers={"Content-Disposition": disposition})

    @app.post("/api/scores", status_code=201)
    def add_score(req: ScoreRequest) -> dict[str, Any]:
        if req.autoPlay:
            raise HTTPException(400, "오토 플레이 기록은 저장하지 않습니다")
        song_or_404(req.songId)
        if library.load_chart(req.chartId) is None:
            raise HTTPException(404, "채보를 찾을 수 없습니다")
        replay = req.replay
        if replay is not None:
            log = replay.get("log")
            if replay.get("chartId") != req.chartId or not isinstance(log, list) or len(log) % 3 or len(log) > MAX_REPLAY_ENTRIES * 3:
                raise HTTPException(422, "리플레이 데이터가 올바르지 않습니다")
        score_id = library.add_score(req.model_dump(exclude={"replay"}), replay)
        return {"id": score_id, "records": library.best_scores(req.songId)}

    @app.get("/api/scores/{score_id}/replay")
    def score_replay(score_id: int) -> dict[str, Any]:
        replay = library.load_replay(score_id)
        if replay is None:
            raise HTTPException(404, "리플레이가 없습니다")
        return replay

    @app.get("/api/songs/{song_id}/scores")
    def song_scores(song_id: str) -> dict[str, Any]:
        song_or_404(song_id)
        return {"records": library.best_scores(song_id)}

    if client_dist is not None and (Path(client_dist) / "index.html").exists():
        app.mount("/", StaticFiles(directory=str(client_dist), html=True), name="client")

    return app

