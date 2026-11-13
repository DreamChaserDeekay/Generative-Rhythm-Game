"""The worker process (worker.py in Mapperatorinator's Python), one at a time: the model stays loaded
between charts, and charts wait their turn (one GPU, a few GB of memory)."""

from __future__ import annotations

import itertools
import json
import logging
import queue
import subprocess
import threading
import time
from typing import Any

from .runtime import NO_WINDOW, Runtime, worker_script

log = logging.getLogger("rhythm_server.mapper")


class MapperError(RuntimeError):
    pass


class MapperService:
    def __init__(self, runtime: Runtime):
        self.runtime = runtime
        self._lock = threading.Lock()
        self._proc: subprocess.Popen[bytes] | None = None
        self._answers: queue.SimpleQueue[str | None] = queue.SimpleQueue()
        self._ids = itertools.count(1)
        self.busy = False

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

    def loaded(self) -> bool:
        """Whether the worker process is up: from its first chart on it keeps the model, a few GB of
        the GPU's memory, until the server stops."""
        proc = self._proc
        return proc is not None and proc.poll() is None

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
            self._stop()
