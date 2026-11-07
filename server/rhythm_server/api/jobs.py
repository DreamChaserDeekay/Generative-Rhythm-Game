"""Background analysis jobs (one CPU-heavy job at a time)."""

from __future__ import annotations

import logging
import time
import traceback
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor

import numpy as np

from .. import audio_io
from ..analysis.analyzer import analyze
from ..config import SAMPLE_RATE
from .library import Library

log = logging.getLogger("rhythm_server.jobs")
PROGRESS_INTERVAL_S = 0.25


class AnalysisQueue:
    """`after_analysis(song_id, pcm)` runs for each analyzed song once the queued analyses are done
    (the stems for keysounds are separated there, so a first play does not wait for them); `pcm`
    is the song's canonical audio when it ran right after the analysis, else None. `on_ready` runs
    once a song's analysis is saved, just before the song shows as ready (its charts are started
    then). Synchronous queues (tests, command line) skip both."""

    def __init__(
        self,
        library: Library,
        synchronous: bool = False,
        after_analysis: Callable[[str, np.ndarray | None], None] | None = None,
        on_ready: Callable[[str], None] | None = None,
    ):
        self.library = library
        self.synchronous = synchronous
        self.after_analysis = after_analysis
        self.on_ready = on_ready
        self._executor = None if synchronous else ThreadPoolExecutor(max_workers=1, thread_name_prefix="analysis")
        self._futures: dict[str, Future[None]] = {}
        # an upload's decoded audio, handed over before its canonical file is written
        self._pcm: dict[str, np.ndarray] = {}

    def submit(self, song_id: str, pcm: np.ndarray | None = None) -> None:
        """`pcm`: the song's audio as its canonical file gives it back (Library.add_song_file's
        `start`), so the analysis need not wait for the file."""
        self.library.update_song(song_id, status="queued", progress=0.0, progress_label="대기 중", error=None)
        if self._executor is None:
            self._run(song_id)
            return
        current = self._futures.get(song_id)
        if current is not None and not current.done():
            return
        if pcm is not None:
            self._pcm[song_id] = pcm
        self._futures[song_id] = self._executor.submit(self._run, song_id)

    def starts_now(self) -> bool:
        """Whether an analysis submitted now would start at once (an upload hands its audio over then)."""
        return self._executor is not None and not self.waiting()

    def waiting(self, song_id: str | None = None) -> bool:
        """Whether an analysis other than `song_id`'s is queued or running."""
        return any(not f.done() for sid, f in list(self._futures.items()) if sid != song_id)

    def resume_pending(self) -> None:
        for song_id in self.library.pending_songs():
            self.submit(song_id)

    def shutdown(self) -> None:
        if self._executor is not None:
            self._executor.shutdown(wait=False, cancel_futures=True)

    def _run(self, song_id: str) -> None:
        lib = self.library
        last = 0.0
        shown = ""

        def progress(p: float, label: str) -> None:
            # a new step always shows (a slow ML step must not hide behind the one just before it)
            nonlocal last, shown
            now = time.monotonic()
            if label != shown or now - last >= PROGRESS_INTERVAL_S or p >= 1.0:
                last, shown = now, label
                lib.update_song(song_id, status="analyzing", progress=round(p, 3), progress_label=label)

        try:
            song = lib.get_song(song_id)
            progress(0.01, "오디오 읽는 중")
            pcm = self._pcm.pop(song_id, None)
            if pcm is not None:
                sr = SAMPLE_RATE
            else:
                pcm, sr = audio_io.read_canonical(lib.audio_path(song_id))
            stems: dict = {}
            result = analyze(pcm, sr, song["audioHash"], overrides=song["overrides"], progress=progress, stems_out=stems)
            # the stems are separated next when no analysis waits: from this audio, not the file again
            kept = pcm if self.after_analysis is not None and self._executor is not None and not self.waiting(song_id) else None
            del pcm
            # the canonical file of an upload that handed its audio over (stems and playback read it)
            lib.wait_audio(song_id)
            lib.save_analysis(song_id, result)
            # stems cached from an earlier analysis may come from another separator
            lib.clear_stems(song_id)
            if stems:
                lib.save_stems(song_id, stems, result["analyzer"]["backends"]["stems"])
            # its charts start before the song shows as ready: the song select asks for them then
            self._ready(song_id)
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
            return
        if self.after_analysis is not None and self._executor is not None:
            # queued behind the analyses waiting now: every song becomes playable first
            try:
                self._executor.submit(self._after, song_id, kept)
            except RuntimeError:
                pass  # shutting down

    def _ready(self, song_id: str) -> None:
        if self.on_ready is None or self._executor is None:
            return
        try:
            self.on_ready(song_id)
        except Exception as e:  # charts are made when asked for all the same
            log.warning("starting the charts of %s failed: %s", song_id, e)

    def _after(self, song_id: str, pcm: np.ndarray | None) -> None:
        try:
            assert self.after_analysis is not None
            self.after_analysis(song_id, pcm)
        except Exception as e:
            log.warning("post-analysis step failed for %s: %s", song_id, e)
