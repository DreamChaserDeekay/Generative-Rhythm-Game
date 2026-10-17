"""Background analysis jobs (one CPU-heavy job at a time)."""

from __future__ import annotations

import logging
import time
import traceback
from concurrent.futures import Future, ThreadPoolExecutor

from .. import audio_io
from ..analysis.analyzer import analyze
from .library import Library

log = logging.getLogger("rhythm_server.jobs")
PROGRESS_INTERVAL_S = 0.25


class AnalysisQueue:
    def __init__(self, library: Library, synchronous: bool = False):
        self.library = library
        self.synchronous = synchronous
        self._executor = None if synchronous else ThreadPoolExecutor(max_workers=1, thread_name_prefix="analysis")
        self._futures: dict[str, Future[None]] = {}

    def submit(self, song_id: str) -> None:
        self.library.update_song(song_id, status="queued", progress=0.0, progress_label="대기 중", error=None)
        if self._executor is None:
            self._run(song_id)
            return
        current = self._futures.get(song_id)
        if current is not None and not current.done():
            return
        self._futures[song_id] = self._executor.submit(self._run, song_id)

    def resume_pending(self) -> None:
        for song_id in self.library.pending_songs():
            self.submit(song_id)

    def shutdown(self) -> None:
        if self._executor is not None:
            self._executor.shutdown(wait=False, cancel_futures=True)

    def _run(self, song_id: str) -> None:
        lib = self.library
        last = 0.0

        def progress(p: float, label: str) -> None:
            nonlocal last
            now = time.monotonic()
            if now - last >= PROGRESS_INTERVAL_S or p >= 1.0:
                last = now
                lib.update_song(song_id, status="analyzing", progress=round(p, 3), progress_label=label)

        try:
            song = lib.get_song(song_id)
            progress(0.01, "오디오 읽는 중")
            pcm, sr = audio_io.read_canonical(lib.audio_path(song_id))
            stems: dict = {}
            result = analyze(pcm, sr, song["audioHash"], overrides=song["overrides"], progress=progress, stems_out=stems)
            lib.save_analysis(song_id, result)
            # stems cached from an earlier analysis may come from another separator
            lib.clear_stems(song_id)
            if stems:
                lib.save_stems(song_id, stems, result["analyzer"]["backends"]["stems"])
            lib.update_song(
                song_id,
                status="ready",
                progress=1.0,
                progress_label="완료",
                bpm=result["tempo"]["bpm"],
                bpm_min=result["tempo"]["bpmMin"],
                bpm_max=result["tempo"]["bpmMax"],
                preview_ms=result["previewMs"],
                analyzed_at=time.time(),
                analyzer={"version": result["analyzer"]["version"], "backends": result["analyzer"]["backends"], "errors": result["analyzer"].get("errors", {})},
                error=None,
            )
        except Exception as e:  # report the failure on the song instead of crashing the worker
            log.error("analysis failed for %s: %s\n%s", song_id, e, traceback.format_exc())
            try:
                lib.update_song(song_id, status="error", error=str(e) or e.__class__.__name__, progress_label="실패")
            except Exception:
                pass
