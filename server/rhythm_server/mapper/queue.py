"""Mapperatorinator's charts, one at a time (one GPU), by priority: the chart someone opened first,
then the other tiers of its key mode made in the background (docs/MAPPERATORINATOR.md).

A chart asked for again joins its job; a chart waiting in the background that is opened moves to
the front. Each job is a concurrent.futures.Future, resolved on the queue's own thread."""

from __future__ import annotations

import heapq
import itertools
import logging
import threading
from concurrent.futures import Future
from typing import Any, Callable

log = logging.getLogger("rhythm_server.mapper")

OPENED, BACKGROUND = 0, 2


class MapperQueue:
    def __init__(self, run: Callable[..., dict[str, Any]]):
        self._run = run
        self._cond = threading.Condition()
        # waiting entries: [priority, order, chart id]; an entry whose priority is no longer its
        # job's was moved up (pushed again) and is skipped
        self._heap: list[list[Any]] = []
        self._jobs: dict[str, tuple[Future[dict[str, Any]], tuple[Any, ...], int]] = {}
        self._order = itertools.count()
        self._thread: threading.Thread | None = None
        self._closed = False
        self.making: str | None = None

    def submit(self, chart_id: str, priority: int, args: tuple[Any, ...]) -> tuple[Future[dict[str, Any]], bool]:
        """The chart's job (a new one, or the one it joins) and whether it is new."""
        with self._cond:
            if self._closed:
                raise RuntimeError("the Mapperatorinator queue is closed")
            job = self._jobs.get(chart_id)
            if job is not None:
                future, old_args, old = job
                if priority < old and self.making != chart_id:
                    self._jobs[chart_id] = (future, old_args, priority)
                    heapq.heappush(self._heap, [priority, next(self._order), chart_id])
                return future, False
            future: Future[dict[str, Any]] = Future()
            self._jobs[chart_id] = (future, args, priority)
            heapq.heappush(self._heap, [priority, next(self._order), chart_id])
            if self._thread is None:
                self._thread = threading.Thread(target=self._work, name="mapper-queue", daemon=True)
                self._thread.start()
            self._cond.notify()
            return future, True

    def state(self, chart_id: str) -> str | None:
        """"making", "queued" or None."""
        with self._cond:
            if self.making == chart_id:
                return "making"
            return "queued" if chart_id in self._jobs else None

    def snapshot(self) -> dict[str, Any]:
        """The chart being made now (its id, or None) and how many wait their turn."""
        with self._cond:
            return {"making": self.making, "waiting": sum(1 for chart_id in self._jobs if chart_id != self.making)}

    def _work(self) -> None:
        while True:
            with self._cond:
                while not self._heap and not self._closed:
                    self._cond.wait()
                if self._closed:
                    return
                priority, _, chart_id = heapq.heappop(self._heap)
                job = self._jobs.get(chart_id)
                if job is None or job[2] != priority:
                    continue  # done already, or moved up (its newer entry is in the heap)
                future, args, _ = job
                self.making = chart_id
            if future.set_running_or_notify_cancel():
                # the job leaves the table only after its callbacks (which save the chart) ran: a
                # request in between joins the finished job instead of finding nothing
                try:
                    result = self._run(*args)
                except BaseException as e:  # noqa: BLE001  (handed to whoever waits for it)
                    future.set_exception(e)
                else:
                    future.set_result(result)
            with self._cond:
                self._jobs.pop(chart_id, None)
                self.making = None

    def close(self) -> None:
        with self._cond:
            self._closed = True
            for chart_id, (future, _, _) in list(self._jobs.items()):
                if chart_id != self.making:
                    future.cancel()
            self._cond.notify_all()
