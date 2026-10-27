"""FastAPI application: songs, analysis, chart generation, scores, and the built client."""

from __future__ import annotations

import hmac
import logging
import os
import random
import re
import shutil
import threading
import zipfile
from collections import OrderedDict
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
from ..generator import GENERATOR_VERSION, GenerationError, chart_id_for, default_seed, generate_chart
from ..generator.sections import edited_analysis
from .sketch import sketch_of
from ..generator.core import keysound_meta
from ..generator.params import resolve_params
from ..synth import make_song
from .imports import import_package
from .jobs import AnalysisQueue
from .library import BGA_EXTENSIONS, Library, SongNotFound

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
) -> FastAPI:
    """`shutdown_token`: the desktop app's, for POST /api/shutdown (a later launch stops the server
    an earlier one left behind on its port); None: no such route."""
    library = Library(root or data_dir())
    # stems for keysounds are separated right after each analysis (ensure_stems is defined below)
    queue = AnalysisQueue(library, synchronous=synchronous_jobs, after_analysis=lambda song_id: ensure_stems(song_id))

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

    def ensure_stems(song_id: str) -> dict[str, Any]:
        """Cached stems, separating them first (ML separator when installed, else the core one)."""
        info = library.stems_info(song_id)
        if info is not None:
            return info
        with stem_locks_guard:
            lock = stem_locks.setdefault(song_id, threading.Lock())
        with lock:
            info = library.stems_info(song_id)
            if info is not None:
                return info
            pcm, sr = audio_io.read_canonical(library.audio_path(song_id))
            stems, method = None, "core-dsp"
            backend = detect_backends().get("stems")
            if backend is not None:
                try:
                    stems, method = backend.module().separate(pcm, sr, backend.options), backend.label
                except Exception as e:
                    log.warning("stem backend %s failed, using the core separator: %s", backend.label, e)
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
            "generator": GENERATOR_VERSION,
            "keyModes": keymodes["enabled"],
            "difficulties": difficulty_config()["order"],
            "formats": sorted(SUPPORTED_EXTENSIONS),
            "backends": backend_status(),
            "stems": list(STEM_NAMES),
        }

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
        try:
            song, created = library.add_song_file(tmp, name)
        except Exception as e:
            tmp.unlink(missing_ok=True)
            raise HTTPException(422, f"오디오를 읽지 못했습니다: {e}") from e
        if created or song["status"] == "error":
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

    # Charts made for their brief only (the song select's levels of the tiers not chosen) stay off
    # the disk, which would otherwise fill with every song looked at: the last few whole ones (one
    # asked for whole next is saved then, not made again) and the metas of more.
    brief_charts: OrderedDict[str, dict[str, Any]] = OrderedDict()
    brief_metas: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def keep(cache: OrderedDict[str, dict[str, Any]], key: str, value: dict[str, Any], size: int) -> None:
        cache[key] = value
        cache.move_to_end(key)
        while len(cache) > size:
            cache.popitem(last=False)

    @app.post("/api/songs/{song_id}/charts")
    async def create_chart(song_id: str, req: ChartRequest) -> dict[str, Any]:
        song = song_or_404(song_id)
        if song["status"] != "ready":
            raise HTTPException(409, "아직 분석이 끝나지 않았습니다")
        analysis = library.load_analysis(song_id)
        if analysis is None:
            raise HTTPException(409, "분석 결과가 없습니다")
        if song.get("sections"):
            analysis = edited_analysis(analysis, song["sections"])
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
            return {"meta": cached["meta"], "cached": True} if req.brief else {"chart": cached, "cached": True}
        if req.brief and chart_id in brief_metas:
            brief_metas.move_to_end(chart_id)
            return {"meta": brief_metas[chart_id], "cached": True}
        chart = brief_charts.pop(chart_id, None)
        made = chart is not None
        if chart is None:
            meta = {"songId": song_id, "title": song["title"], "artist": song["artist"]}
            try:
                chart = await run_in_threadpool(
                    generate_chart, analysis, req.keyMode, req.difficulty, req.targetLevel, seed, req.params, meta
                )
            except GenerationError as e:
                raise HTTPException(422, str(e)) from e
        if req.brief:
            keep(brief_charts, chart_id, chart, BRIEF_CHARTS_KEPT)
            keep(brief_metas, chart_id, chart["meta"], BRIEF_METAS_KEPT)
            return {"meta": chart["meta"], "cached": made}
        library.save_chart(chart, song_id)
        return {"chart": chart, "cached": made}

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

