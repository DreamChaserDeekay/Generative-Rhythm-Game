"""The worker process (worker.py in Mapperatorinator's Python), one at a time: the model stays loaded
between charts, and charts wait their turn (one GPU, a few GB of memory). When no chart has been
made for idleUnloadSeconds (config/mapper.json), the worker is let go, and with it the model and the
GPU's memory it held: the game plays on a card of its own, and the next chart starts the worker
again (the model loads anew, some seconds)."""

from __future__ import annotations

import itertools
import json
import logging
import queue
import subprocess
import threading
import time
from typing import Any

from .runtime import NO_WINDOW, Runtime, mapper_config, worker_script

log = logging.getLogger("rhythm_server.mapper")

#: Seconds without a chart before the worker is let go, where config/mapper.json does not say
#: (idleUnloadSeconds; 0 keeps it until the server stops).
DEFAULT_IDLE_UNLOAD_S = 120.0


class MapperError(RuntimeError):
    pass


class MapperService:
    def __init__(self, runtime: Runtime, idle_unload_s: float | None = None):
        """`idle_unload_s`: seconds without a chart before the worker is let go (None: config's
        idleUnloadSeconds, read as each chart ends, so a changed setting holds from the next)."""
        self.runtime = runtime
        self._lock = threading.Lock()
        self._proc: subprocess.Popen[bytes] | None = None
        self._answers: queue.SimpleQueue[str | None] = queue.SimpleQueue()
        self._ids = itertools.count(1)
        self.busy = False
        self._idle_unload_s = idle_unload_s
        self._idle_timer: threading.Timer | None = None
        # when the last chart ended (time.monotonic): what an idle timer was armed for
        self._used_at = 0.0

    def _start(self) -> subprocess.Popen[bytes]:
        if self._proc is not None and self._proc.poll() is None:
            return self._proc
        rt = self.runtime
        logf = open(rt.root / "worker.log", "ab")
        logf.write(f"\n==== worker {time.strftime('%Y-%m-%d %H:%M:%S')}\n".encode())
        logf.flush()
        proc = subprocess.Popen(
            [str(rt.venv_python), str(worker_script()), "--src", str(rt.src), "--serve"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=logf, env=rt.env(), cwd=str(rt.src), creationflags=NO_WINDOW,
        )
        logf.close()
        self._answers = queue.SimpleQueue()
        answers = self._answers

        def read() -> None:
            assert proc.stdout is not None
            for raw in proc.stdout:
                answers.put(raw.decode("utf-8", "replace"))
            answers.put(None)

        threading.Thread(target=read, name="mapper-worker-out", daemon=True).start()
        self._proc = proc
        return proc

    def generate(self, request: dict[str, Any], timeout: float) -> dict[str, Any]:
        """Sends one request and waits for its answer; the worker is restarted when it died or took
        too long."""
        with self._lock:
            self._cancel_idle()
            self.busy = True
            try:
                proc = self._start()
                req = dict(request, id=next(self._ids))
                assert proc.stdin is not None
                try:
                    proc.stdin.write((json.dumps(req, ensure_ascii=False) + "\n").encode("utf-8"))
                    proc.stdin.flush()
                except OSError as e:
                    self._stop()
                    raise MapperError(f"Mapperatorinator 작업 프로세스가 멈췄습니다: {e} (worker.log)") from e
                deadline = time.monotonic() + timeout
                while True:
                    try:
                        line = self._answers.get(timeout=max(0.1, deadline - time.monotonic()))
                    except queue.Empty:
                        self._stop()
                        raise MapperError(f"Mapperatorinator가 {int(timeout)}초 안에 끝나지 않았습니다") from None
                    if line is None:
                        self._stop()
                        raise MapperError("Mapperatorinator 작업 프로세스가 끝나 버렸습니다 (worker.log)")
                    try:
                        answer = json.loads(line)
                    except ValueError:
                        continue  # not ours (stdout is the protocol's, but be safe)
                    if answer.get("id") == req["id"]:
                        break
                if not answer.get("ok"):
                    raise MapperError(str(answer.get("error") or "Mapperatorinator가 채보를 만들지 못했습니다"))
                return answer
            finally:
                self.busy = False
                self._used_at = time.monotonic()
                self._arm_idle()

    def loaded(self) -> bool:
        """Whether the worker process is up: from a chart on it keeps the model, a few GB of the
        GPU's memory, until no chart has been made for idleUnloadSeconds."""
        proc = self._proc
        return proc is not None and proc.poll() is None

    def idle_unload_s(self) -> float:
        """Seconds without a chart before the worker is let go (0: never)."""
        if self._idle_unload_s is not None:
            return max(0.0, self._idle_unload_s)
        try:
            return max(0.0, float(mapper_config().get("idleUnloadSeconds", DEFAULT_IDLE_UNLOAD_S)))
        except (TypeError, ValueError):
            return DEFAULT_IDLE_UNLOAD_S

    def _arm_idle(self) -> None:
        """(holding the lock) Lets the worker go once no chart comes for idle_unload_s seconds."""
        self._cancel_idle()
        wait = self.idle_unload_s()
        if wait <= 0 or self._proc is None:
            return
        timer = threading.Timer(wait, self._unload_if_idle, args=(self._used_at,))
        timer.name = "mapper-idle"
        timer.daemon = True
        self._idle_timer = timer
        timer.start()

    def _cancel_idle(self) -> None:
        timer, self._idle_timer = self._idle_timer, None
        if timer is not None:
            timer.cancel()

    def _unload_if_idle(self, used_at: float) -> None:
        # a chart being made holds the lock, and arms the timer again as it ends
        if not self._lock.acquire(blocking=False):
            return
        try:
            if self.busy or self._used_at != used_at or self._proc is None:
                return  # used since this timer was armed, or already gone
            log.info("Mapperatorinator: no chart for %.0f s, the worker lets the model and its GPU memory go", time.monotonic() - used_at)
            self._idle_timer = None
            self._stop()
        finally:
            self._lock.release()

    def _stop(self) -> None:
        proc, self._proc = self._proc, None
        if proc is None:
            return
        try:
            if proc.stdin is not None:
                proc.stdin.close()
        except OSError:
            pass
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    def close(self) -> None:
        with self._lock:
            self._cancel_idle()
            self._stop()
