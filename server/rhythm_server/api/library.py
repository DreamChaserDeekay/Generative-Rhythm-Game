"""Song library: SQLite metadata + files under the data directory."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np

import soundfile as sf

from .. import audio_io
from ..analysis.stems import STEM_NAMES
from ..config import SAMPLE_RATE, load_config

SCHEMA = """
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  original_name TEXT NOT NULL DEFAULT '',
  audio_hash TEXT NOT NULL,
  duration_ms REAL NOT NULL DEFAULT 0,
  has_cover INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  progress_label TEXT NOT NULL DEFAULT '',
  error TEXT,
  bpm REAL,
  bpm_min REAL,
  bpm_max REAL,
  preview_ms REAL,
  overrides TEXT NOT NULL DEFAULT '{}',
  created_at REAL NOT NULL,
  analyzed_at REAL
);
CREATE TABLE IF NOT EXISTS charts (
  id TEXT PRIMARY KEY,
  song_id TEXT NOT NULL,
  key_mode TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  level INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  note_count INTEGER NOT NULL,
  generator_version TEXT NOT NULL,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chart_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  played_at REAL NOT NULL,
  score INTEGER NOT NULL,
  rate REAL NOT NULL,
  max_combo INTEGER NOT NULL,
  lamp TEXT NOT NULL,
  judgement_mode TEXT NOT NULL,
  breaks INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_charts_song ON charts(song_id);
CREATE INDEX IF NOT EXISTS idx_scores_chart ON scores(chart_id);
"""

# Worst to best; the client sends one of these with every score (config/gauge.json is the source).
LAMP_ORDER: list[str] = load_config("gauge")["lampOrder"]


def lamp_rank(lamp: str) -> int:
    return LAMP_ORDER.index(lamp) if lamp in LAMP_ORDER else 0


# Columns added after the first release; created on start-up when an older library is opened.
MIGRATIONS = {
    "analyzer": "TEXT NOT NULL DEFAULT '{}'",
    "bga_ext": "TEXT",
    "bga_offset_ms": "REAL NOT NULL DEFAULT 0",
}
# charts: where a chart came from (generated / edited / imported) and its display name
CHART_MIGRATIONS = {
    "kind": "TEXT NOT NULL DEFAULT 'generated'",
    "name": "TEXT NOT NULL DEFAULT ''",
}
SAVED_CHART_KINDS = ("edited", "imported")
BGA_EXTENSIONS = {".mp4": "video/mp4", ".webm": "video/webm", ".m4v": "video/mp4", ".mov": "video/quicktime", ".ogv": "video/ogg"}

SONG_ID = re.compile(r"^[0-9a-f]{16}$")
CHART_ID = re.compile(r"^c[0-9a-f]{20}$")


class SongNotFound(KeyError):
    pass


def _checked(pattern: re.Pattern[str], value: str) -> str:
    """IDs become file names; reject anything that is not exactly the expected hex form."""
    if not pattern.fullmatch(value):
        raise SongNotFound(value)
    return value


class Library:
    def __init__(self, root: Path):
        self.root = root
        for sub in ("songs", "charts", "tmp"):
            (root / sub).mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(str(root / "library.sqlite3"), check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.executescript(SCHEMA)
            for table, migrations in (("songs", MIGRATIONS), ("charts", CHART_MIGRATIONS)):
                have = {r["name"] for r in self._db.execute(f"PRAGMA table_info({table})")}
                for column, decl in migrations.items():
                    if column not in have:
                        self._db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
            self._db.commit()

    # ---------- paths ----------
    def song_dir(self, song_id: str) -> Path:
        return self.root / "songs" / _checked(SONG_ID, song_id)

    def audio_path(self, song_id: str) -> Path:
        return self.song_dir(song_id) / "audio.flac"

    def analysis_path(self, song_id: str) -> Path:
        return self.song_dir(song_id) / "analysis.json"

    def cover_path(self, song_id: str) -> Path | None:
        for p in self.song_dir(song_id).glob("cover.*"):
            return p
        return None

    def stems_dir(self, song_id: str) -> Path:
        return self.song_dir(song_id) / "stems"

    def stem_path(self, song_id: str, name: str) -> Path:
        if name not in STEM_NAMES:
            raise SongNotFound(name)
        return self.stems_dir(song_id) / f"{name}.flac"

    def bga_path(self, song_id: str) -> Path | None:
        row = self._row(_checked(SONG_ID, song_id))
        if row is None or not row["bga_ext"]:
            return None
        p = self.song_dir(song_id) / f"bga{row['bga_ext']}"
        return p if p.exists() else None

    def chart_path(self, chart_id: str) -> Path:
        return self.root / "charts" / f"{_checked(CHART_ID, chart_id)}.json"

    def tmp_path(self, suffix: str) -> Path:
        return self.root / "tmp" / f"{time.time_ns()}{suffix}"

    # ---------- songs ----------
    def add_song_file(self, src: Path, original_name: str) -> tuple[dict[str, Any], bool]:
        """Import an audio file. Returns (song, created); a duplicate file returns the existing song."""
        digest = audio_io.file_sha256(src)
        song_id = digest[:16]
        existing = self._row(song_id)
        if existing is not None:
            src.unlink(missing_ok=True)
            return self._song_json(existing), False
        song_dir = self.song_dir(song_id)
        song_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(original_name).suffix.lower() or src.suffix.lower()
        original = song_dir / f"original{ext}"
        shutil.move(str(src), original)
        try:
            pcm = audio_io.decode_audio(original)
            audio_io.write_canonical(self.audio_path(song_id), pcm)
            tags = audio_io.read_tags(original)
            cover = audio_io.read_cover(original)
        except Exception:
            shutil.rmtree(song_dir, ignore_errors=True)
            raise
        if cover is not None:
            data, mime = cover
            (song_dir / ("cover.png" if "png" in mime else "cover.jpg")).write_bytes(data)
        title = tags.title or Path(original_name).stem or "Untitled"
        self._insert_song(song_id, title, tags.artist or "", tags.album or "", original_name, f"sha256:{digest}", len(pcm) / SAMPLE_RATE * 1000.0, cover is not None)
        return self.get_song(song_id), True

    def add_generated_song(self, pcm: np.ndarray, title: str, artist: str) -> dict[str, Any]:
        """Import PCM made in-process (the synthetic demo track)."""
        digest = hashlib.sha256(np.ascontiguousarray(pcm).tobytes()).hexdigest()
        song_id = digest[:16]
        existing = self._row(song_id)
        if existing is not None:
            return self._song_json(existing)
        self.song_dir(song_id).mkdir(parents=True, exist_ok=True)
        audio_io.write_canonical(self.audio_path(song_id), pcm)
        self._insert_song(song_id, title, artist, "", "", f"sha256:{digest}", len(pcm) / SAMPLE_RATE * 1000.0, False)
        return self.get_song(song_id)

    def add_rendered_song(self, song_id: str, pcm: np.ndarray, title: str, artist: str, audio_hash: str) -> tuple[dict[str, Any], bool]:
        """A song whose audio we rendered (imported keysound charts), under a given id."""
        existing = self._row(_checked(SONG_ID, song_id))
        if existing is not None:
            return self._song_json(existing), False
        self.song_dir(song_id).mkdir(parents=True, exist_ok=True)
        audio_io.write_canonical(self.audio_path(song_id), pcm)
        self._insert_song(song_id, title, artist, "", "", audio_hash, len(pcm) / SAMPLE_RATE * 1000.0, False)
        return self.get_song(song_id), True

    def _insert_song(self, song_id: str, title: str, artist: str, album: str, original_name: str, audio_hash: str, duration_ms: float, has_cover: bool) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO songs (id, title, artist, album, original_name, audio_hash, duration_ms, has_cover, status, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)",
                (song_id, title, artist, album, original_name, audio_hash, duration_ms, int(has_cover), time.time()),
            )
            self._db.commit()

    def _row(self, song_id: str) -> sqlite3.Row | None:
        with self._lock:
            return self._db.execute("SELECT * FROM songs WHERE id = ?", (song_id,)).fetchone()

    def has_song(self, song_id: str) -> bool:
        return SONG_ID.fullmatch(song_id) is not None and self._row(song_id) is not None

    def get_song(self, song_id: str) -> dict[str, Any]:
        row = self._row(_checked(SONG_ID, song_id))
        if row is None:
            raise SongNotFound(song_id)
        return self._song_json(row)

    def list_songs(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM songs ORDER BY created_at DESC").fetchall()
        bests = self._best_by_song()
        return [dict(self._song_json(r), records=bests.get(r["id"], [])) for r in rows]

    def update_song(self, song_id: str, **fields: Any) -> dict[str, Any]:
        allowed = {
            "title", "artist", "status", "progress", "progress_label", "error", "bpm", "bpm_min", "bpm_max",
            "preview_ms", "analyzed_at", "overrides", "analyzer", "bga_ext", "bga_offset_ms",
        }  # fmt: skip
        sets = {k: v for k, v in fields.items() if k in allowed}
        for key in ("overrides", "analyzer"):
            if key in sets and not isinstance(sets[key], str):
                sets[key] = json.dumps(sets[key])
        if sets:
            with self._lock:
                self._db.execute(
                    f"UPDATE songs SET {', '.join(f'{k} = ?' for k in sets)} WHERE id = ?",
                    (*sets.values(), song_id),
                )
                self._db.commit()
        return self.get_song(song_id)

    def delete_song(self, song_id: str) -> None:
        with self._lock:
            charts = [r["id"] for r in self._db.execute("SELECT id FROM charts WHERE song_id = ?", (song_id,))]
            self._db.execute("DELETE FROM scores WHERE song_id = ?", (song_id,))
            self._db.execute("DELETE FROM charts WHERE song_id = ?", (song_id,))
            self._db.execute("DELETE FROM songs WHERE id = ?", (song_id,))
            self._db.commit()
        for chart_id in charts:
            self.chart_path(chart_id).unlink(missing_ok=True)
        shutil.rmtree(self.song_dir(song_id), ignore_errors=True)

    def pending_songs(self) -> list[str]:
        with self._lock:
            return [r["id"] for r in self._db.execute("SELECT id FROM songs WHERE status IN ('queued', 'analyzing')")]

    def _song_json(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "title": row["title"],
            "artist": row["artist"],
            "album": row["album"],
            "audioHash": row["audio_hash"],
            "durationMs": row["duration_ms"],
            "hasCover": bool(row["has_cover"]),
            "status": row["status"],
            "progress": row["progress"],
            "progressLabel": row["progress_label"],
            "error": row["error"],
            "bpm": row["bpm"],
            "bpmMin": row["bpm_min"],
            "bpmMax": row["bpm_max"],
            "previewMs": row["preview_ms"],
            "overrides": json.loads(row["overrides"] or "{}"),
            "createdAt": row["created_at"],
            "analyzedAt": row["analyzed_at"],
            "analyzer": json.loads(row["analyzer"] or "{}"),
            "hasBga": bool(row["bga_ext"]),
            "bgaOffsetMs": row["bga_offset_ms"] or 0.0,
            "originalName": row["original_name"],
        }

    # ---------- analysis ----------
    def save_analysis(self, song_id: str, analysis: dict[str, Any]) -> None:
        tmp = self.analysis_path(song_id).with_suffix(".tmp")
        tmp.write_text(json.dumps(analysis, separators=(",", ":")), encoding="utf-8")
        tmp.replace(self.analysis_path(song_id))

    def load_analysis(self, song_id: str) -> dict[str, Any] | None:
        p = self.analysis_path(song_id)
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    # ---------- stems ----------
    def stems_info(self, song_id: str) -> dict[str, Any] | None:
        p = self.stems_dir(song_id) / "stems.json"
        if not p.exists() or not all(self.stem_path(song_id, n).exists() for n in STEM_NAMES):
            return None
        return json.loads(p.read_text(encoding="utf-8"))

    def save_stems(self, song_id: str, stems: dict[str, np.ndarray], method: str) -> None:
        """Stores separated stems as 16-bit FLAC next to the canonical audio."""
        d = self.stems_dir(song_id)
        d.mkdir(parents=True, exist_ok=True)
        for name in STEM_NAMES:
            tmp = d / f"{name}.tmp.flac"
            sf.write(tmp, np.clip(stems[name], -1.0, 1.0), SAMPLE_RATE, subtype="PCM_16", format="FLAC")
            tmp.replace(self.stem_path(song_id, name))
        (d / "stems.json").write_text(json.dumps({"method": method, "names": list(STEM_NAMES), "createdAt": time.time()}), encoding="utf-8")

    def clear_stems(self, song_id: str) -> None:
        shutil.rmtree(self.stems_dir(song_id), ignore_errors=True)

    # ---------- keysounds (imported BMS/bmson) ----------
    def keysounds_dir(self, song_id: str) -> Path:
        return self.song_dir(song_id) / "keysounds"

    def save_keysounds(self, song_id: str, sprite: np.ndarray, index: dict[str, list[int]], gain: float) -> None:
        d = self.keysounds_dir(song_id)
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / "sprite.tmp.flac"
        sf.write(tmp, sprite, SAMPLE_RATE, subtype="PCM_16", format="FLAC")
        tmp.replace(d / "sprite.flac")
        (d / "sprite.json").write_text(json.dumps({"sampleRate": SAMPLE_RATE, "gain": gain, "sounds": index}), encoding="utf-8")

    def keysounds_info(self, song_id: str) -> dict[str, Any] | None:
        p = self.keysounds_dir(song_id) / "sprite.json"
        if not p.exists() or not (self.keysounds_dir(song_id) / "sprite.flac").exists():
            return None
        return json.loads(p.read_text(encoding="utf-8"))

    # ---------- background video ----------
    def save_bga(self, song_id: str, src: Path, ext: str) -> None:
        old = self.bga_path(song_id)
        if old is not None:
            old.unlink(missing_ok=True)
        shutil.move(str(src), self.song_dir(song_id) / f"bga{ext}")
        self.update_song(song_id, bga_ext=ext)

    def delete_bga(self, song_id: str) -> None:
        old = self.bga_path(song_id)
        if old is not None:
            old.unlink(missing_ok=True)
        self.update_song(song_id, bga_ext=None)

    # ---------- charts ----------
    def save_chart(self, chart: dict[str, Any], song_id: str) -> None:
        meta = chart["meta"]
        source = meta.get("source") or {}
        generator = meta.get("generator") or {}
        kind = source.get("kind", "generated")
        self.chart_path(meta["chartId"]).write_text(json.dumps(chart, separators=(",", ":")), encoding="utf-8")
        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO charts (id, song_id, key_mode, difficulty, level, seed, note_count, generator_version, created_at, kind, name) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    meta["chartId"], song_id, meta["keyMode"], meta["difficulty"], meta["level"], int(generator.get("seed", 0)),
                    len(chart["notes"]), generator.get("version", source.get("format", kind)), time.time(), kind, meta.get("chartName", ""),
                ),
            )
            self._db.commit()

    def list_charts(self, song_id: str, kinds: tuple[str, ...] = SAVED_CHART_KINDS) -> list[dict[str, Any]]:
        """Saved (edited / imported) charts of a song, newest first."""
        marks = ",".join("?" for _ in kinds)
        with self._lock:
            rows = self._db.execute(
                f"SELECT * FROM charts WHERE song_id = ? AND kind IN ({marks}) ORDER BY created_at DESC", (_checked(SONG_ID, song_id), *kinds)
            ).fetchall()
        return [
            {
                "chartId": r["id"], "songId": r["song_id"], "keyMode": r["key_mode"], "difficulty": r["difficulty"], "level": r["level"],
                "noteCount": r["note_count"], "kind": r["kind"], "name": r["name"], "createdAt": r["created_at"],
            }
            for r in rows
            if self.chart_path(r["id"]).exists()
        ]  # fmt: skip

    def chart_song(self, chart_id: str) -> str | None:
        with self._lock:
            row = self._db.execute("SELECT song_id FROM charts WHERE id = ?", (chart_id,)).fetchone()
        return row["song_id"] if row else None

    def delete_chart(self, chart_id: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM scores WHERE chart_id = ?", (chart_id,))
            self._db.execute("DELETE FROM charts WHERE id = ?", (chart_id,))
            self._db.commit()
        self.chart_path(chart_id).unlink(missing_ok=True)

    def load_chart(self, chart_id: str) -> dict[str, Any] | None:
        if not CHART_ID.fullmatch(chart_id):
            return None
        p = self.chart_path(chart_id)
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    # ---------- scores ----------
    def add_score(self, record: dict[str, Any]) -> int:
        with self._lock:
            cur = self._db.execute(
                "INSERT INTO scores (chart_id, song_id, played_at, score, rate, max_combo, lamp, judgement_mode, breaks, detail) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    record["chartId"],
                    record["songId"],
                    time.time(),
                    int(record["score"]),
                    float(record["rate"]),
                    int(record["maxCombo"]),
                    record["lamp"],
                    record.get("judgementMode", "NORMAL"),
                    int(record.get("breaks", 0)),
                    json.dumps(record.get("detail", {})),
                ),
            )
            self._db.commit()
            return int(cur.lastrowid)

    def best_scores(self, song_id: str) -> list[dict[str, Any]]:
        return self._best_by_song(song_id).get(song_id, [])

    def _best_by_song(self, song_id: str | None = None) -> dict[str, list[dict[str, Any]]]:
        query = (
            "SELECT s.*, c.key_mode, c.difficulty, c.level, c.seed, c.kind, c.name FROM scores s JOIN charts c ON c.id = s.chart_id"
            + (" WHERE s.song_id = ?" if song_id else "")
        )
        with self._lock:
            rows = self._db.execute(query, (song_id,) if song_id else ()).fetchall()
        best: dict[str, dict[str, Any]] = {}
        for r in rows:
            cur = best.get(r["chart_id"])
            if cur is None:
                best[r["chart_id"]] = cur = {
                    "chartId": r["chart_id"],
                    "songId": r["song_id"],
                    "keyMode": r["key_mode"],
                    "difficulty": r["difficulty"],
                    "level": r["level"],
                    "seed": r["seed"],
                    "kind": r["kind"],
                    "name": r["name"],
                    "score": r["score"],
                    "rate": r["rate"],
                    "maxCombo": r["max_combo"],
                    "lamp": r["lamp"],
                    "plays": 0,
                }
            cur["plays"] += 1
            if r["score"] > cur["score"]:
                cur.update(score=r["score"], rate=r["rate"], maxCombo=r["max_combo"])
            if lamp_rank(r["lamp"]) > lamp_rank(cur["lamp"]):
                cur["lamp"] = r["lamp"]
        out: dict[str, list[dict[str, Any]]] = {}
        for rec in best.values():
            out.setdefault(rec["songId"], []).append(rec)
        return out
