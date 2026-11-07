"""How long the bundled server takes over a 4-minute song, stage by stage (used by the desktop
workflow after the smoke test, which has downloaded the model weights already).

    python packaging/time_analysis.py <rhythm-server.exe> <work dir> [port]

Starts the server on a new library, adds a 4-minute synthetic demo song (128 BPM, 128 bars),
follows the analysis's progress labels (the ML steps, then the core analysis) and asks for a chart,
then prints the time of each stage. Informational: it fails only when the server does."""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


def call(base: str, path: str, body: dict | None = None, timeout: float = 600.0) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, headers={"Content-Type": "application/json"}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())


def main() -> None:
    exe, work = Path(sys.argv[1]), Path(sys.argv[2])
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 8796
    base = f"http://127.0.0.1:{port}"
    work.mkdir(parents=True, exist_ok=True)
    log = open(work / "timing-server.log", "w", encoding="utf-8")
    server = subprocess.Popen([str(exe), "--port", str(port), "--data", str(work / "library")], stdout=log, stderr=subprocess.STDOUT)
    try:
        for _ in range(240):
            try:
                health = call(base, "/api/health", timeout=2)
                break
            except OSError:
                if server.poll() is not None:
                    raise SystemExit(f"the server exited with {server.returncode}")
                time.sleep(0.5)
        active = [f"{b['name']}-{b.get('version', '')}" for b in health["backends"] if b.get("active")]
        print(f"server {health['version']} | analyzer {health['analyzer']} | ML: {', '.join(active) or 'none'}")
        t0 = time.monotonic()
        song = call(base, "/api/songs/demo", {"bpm": 128, "bars": 128, "seed": 5})["song"]
        stages: list[tuple[str, float]] = []
        while True:
            s = call(base, f"/api/songs/{song['id']}")["song"]
            label = s.get("progressLabel") or s["status"]
            if not stages or stages[-1][0] != label:
                stages.append((label, time.monotonic() - t0))
            if s["status"] in ("ready", "error"):
                break
            if time.monotonic() - t0 > 3600:
                raise SystemExit("the analysis took over an hour")
            time.sleep(0.25)
        ready = time.monotonic() - t0
        if s["status"] != "ready":
            raise SystemExit(f"the analysis failed: {s.get('error')}")
        print(f"4-minute song ({s.get('durationMs', 0) / 1000:.0f} s): ready after {ready:.1f} s | backends {json.dumps(s['analyzer']['backends'])}")
        for (label, start), (_, end) in zip(stages, stages[1:] + [("", ready)]):
            print(f"  {end - start:7.1f} s  {label}")
        t = time.monotonic()
        chart = call(base, f"/api/songs/{song['id']}/charts", {"keyMode": "6K", "difficulty": "EXPERT"})["chart"]
        print(f"6K EXPERT chart: {time.monotonic() - t:.1f} s ({chart['meta']['noteCount']} notes, Lv.{chart['meta']['level']})")
    finally:
        server.kill()
        server.wait(30)
        log.close()


if __name__ == "__main__":
    main()
