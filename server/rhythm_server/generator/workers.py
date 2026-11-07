"""Chart generation off the server's own threads.

The generator is pure Python, so threads would take turns on the GIL: a song's five tiers were made
one after another (about 5 s on a 4-minute song). With more than one core they are made in worker
processes side by side (about 2 s), and the server keeps answering meanwhile. A chart is the same
wherever it is made: the generator depends only on the analysis, the options and the seed (each
worker works out the top tier's first round, core.lane_plan, for itself).

One job per chart id: a request for a chart that is being made, or waits to be, joins that job
instead of making it again. Jobs wait their turn by priority: a whole chart someone waits to play
first, then the briefs the song select asks for, then charts made ahead (the other tiers of a key
mode asked for, a song just analyzed)."""

from __future__ import annotations

import heapq
import itertools
import logging
import multiprocessing
import os
import queue
import threading
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures.process import BrokenProcessPool, ProcessPoolExecutor
from typing import Any

from .core import generate_chart

log = logging.getLogger("rhythm_server.charts")

WHOLE, BRIEF, AHEAD = 0, 1, 2
# a worker takes about 70 MB; five tiers on four workers finish about as soon as on five
MAX_WORKERS = 4
# without worker processes: requests are made in this many threads, as fastapi's pool did
THREADS = 4

ChartArgs = tuple[dict[str, Any], str, str, "int | None", "int | None", "dict[str, Any] | None", "dict[str, Any] | None"]


def default_workers() -> int:
    """GRG_CHART_WORKERS, else one worker per core but one (the server's own), at most MAX_WORKERS;
    0 (one core): charts are made in the server's threads."""
    env = os.environ.get("GRG_CHART_WORKERS", "").strip()
    if env:
        return max(0, int(env))
    return max(0, min(MAX_WORKERS, (os.cpu_count() or 1) - 1))


def _make(args: ChartArgs) -> dict[str, Any]:
    analysis, key_mode, difficulty, target_level, seed, params, meta = args
    return generate_chart(analysis, key_mode, difficulty, target_level, seed, params, meta)


def _warm() -> None:
    """Loads the configs a chart reads (the imports came with this module)."""
    from ..config import difficulty_config, load_config

    difficulty_config()
    for name in ("patterns", "instruments", "pick", "lane_moves", "keymodes", "plan"):
        load_config(name)


class ChartMaker:
    def __init__(self, workers: int):
        self.workers = workers
        self._lock = threading.Lock()
        self._jobs: dict[str, Future[dict[str, Any]]] = {}
        # waiting jobs: [priority, order, chart id, args, tries]; an entry whose args are None was
        # moved up (pushed again with a higher priority)
        self._waiting: list[list[Any]] = []
        self._entries: dict[str, list[Any]] = {}
        self._order = itertools.count()
        self._running = 0
        self._pool: ProcessPoolExecutor | ThreadPoolExecutor | None = None
        self._closed = False
        # finished jobs are handled on a thread of their own, not in the pool's (a process pool's
        # results thread must not be the one submitting the next job)
        self._done: queue.SimpleQueue[tuple[str, ChartArgs, int, Future[dict[str, Any]]] | None] = queue.SimpleQueue()
        self._done_thread: threading.Thread | None = None
        # charts started so far (a chart asked for twice is made once)
        self.started = 0

    @property
    def parallel(self) -> bool:
        """Whether charts are made in worker processes (and so made ahead)."""
        return self.workers > 0

    def busy(self) -> bool:
        """Whether a chart is being made or waits to be."""
        with self._lock:
            return bool(self._jobs)

    def start(self) -> None:
        """Starts the workers (each loads the generator), so the first chart does not wait for them."""
        if not self.parallel:
            return
        with self._lock:
            pool = self._executor()
        for _ in range(self.workers):
            pool.submit(_warm)

    def close(self) -> None:
        with self._lock:
            self._closed = True
            pool, self._pool = self._pool, None
        if pool is not None:
            pool.shutdown(wait=False, cancel_futures=True)
        self._done.put(None)

    def job(self, chart_id: str, priority: int, args: ChartArgs) -> tuple[Future[dict[str, Any]], bool]:
        """The job making `chart_id` (an existing one, moved up to `priority`), and whether it is new."""
        with self._lock:
            fut = self._jobs.get(chart_id)
            if fut is not None:
                entry = self._entries.get(chart_id)
                if entry is not None and priority < entry[0]:
                    self._push(chart_id, priority, entry[3], entry[4])
                    entry[3] = None
                return fut, False
            fut = Future()
            self._jobs[chart_id] = fut
            self._push(chart_id, priority, args, 0)
            self._dispatch()
            return fut, True

    def _push(self, chart_id: str, priority: int, args: ChartArgs, tries: int) -> None:
        entry = [priority, next(self._order), chart_id, args, tries]
        self._entries[chart_id] = entry
        heapq.heappush(self._waiting, entry)

    def _executor(self) -> ProcessPoolExecutor | ThreadPoolExecutor:
        if self._pool is None:
            if self.parallel:
                # spawn on every system: forking the server's threads is unsafe
                self._pool = ProcessPoolExecutor(self.workers, mp_context=multiprocessing.get_context("spawn"))
            else:
                self._pool = ThreadPoolExecutor(THREADS, thread_name_prefix="chart")
        return self._pool

    def _dispatch(self) -> None:
        slots = self.workers if self.parallel else THREADS
        while not self._closed and self._running < slots and self._waiting:
            entry = heapq.heappop(self._waiting)
            if entry[3] is None:
                continue
            _, _, chart_id, args, tries = entry
            del self._entries[chart_id]
            self._running += 1
            self.started += 1
            try:
                inner = self._executor().submit(_make, args)
            except (BrokenProcessPool, RuntimeError) as e:
                self._running -= 1
                self._drop_broken_pool()
                self._fail(chart_id, args, tries, e)
                continue
            if self._done_thread is None:
                self._done_thread = threading.Thread(target=self._handle_done, name="chart-results", daemon=True)
                self._done_thread.start()
            inner.add_done_callback(lambda f, c=chart_id, a=args, t=tries: self._done.put((c, a, t, f)))

    def _drop_broken_pool(self) -> None:
        if self._pool is not None and getattr(self._pool, "_broken", False):
            self._pool.shutdown(wait=False, cancel_futures=True)
            self._pool = None

    def _fail(self, chart_id: str, args: ChartArgs, tries: int, error: BaseException) -> None:
        """A worker died (and broke its pool): a new pool makes the chart, once."""
        log.warning("chart worker failed (%s): %s", type(error).__name__, error)
        if tries == 0 and not self._closed:
            self._push(chart_id, WHOLE, args, 1)
        else:
            fut = self._jobs.pop(chart_id)
            threading.Thread(target=fut.set_exception, args=(error,), daemon=True).start()

    def _handle_done(self) -> None:
        while (item := self._done.get()) is not None:
            try:
                self._finished(*item)
            except Exception:  # keep handling the others
                log.exception("chart job result")

    def _finished(self, chart_id: str, args: ChartArgs, tries: int, inner: Future[dict[str, Any]]) -> None:
        error = inner.exception() if not inner.cancelled() else RuntimeError("chart job cancelled")
        if isinstance(error, BrokenProcessPool):
            with self._lock:
                self._running -= 1
                self._drop_broken_pool()
                self._fail(chart_id, args, tries, error)
                self._dispatch()
            return
        fut = self._jobs[chart_id]
        # the result first (its callbacks keep it), then the job goes: one asking in between joins it
        if error is not None:
            fut.set_exception(error)
        else:
            fut.set_result(inner.result())
        with self._lock:
            self._running -= 1
            self._jobs.pop(chart_id, None)
            self._dispatch()
