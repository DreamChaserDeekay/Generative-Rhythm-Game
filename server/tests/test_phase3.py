"""Phase 3: stem separation, instrument tags, ML backend plumbing, repeat consistency, camera cues,
keysound stems and the stems / background-video API."""

from __future__ import annotations

import io
import sqlite3
import sys
import types
from functools import lru_cache
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from scipy.ndimage import median_filter

from rhythm_server.analysis import ml
from rhythm_server.analysis.analyzer import ANALYZER_VERSION, analyze
from rhythm_server.analysis.spectral import median_along
from rhythm_server.analysis.stems import HOP, N_FFT, STEM_NAMES, _istft, separate
from rhythm_server.api.app import create_app
from rhythm_server.api.library import Library
from rhythm_server.generator import generate_chart
from rhythm_server.generator.lanes import lane_infos
from rhythm_server.synth import INSTRUMENT_STEM, make_song


@lru_cache(maxsize=None)
def song_with_stems(bars: int = 16, seed: int = 8, bpm: float = 132.0):
    return make_song(bpm, bars, seed=seed, with_stems=True, repeat_melody=True)


@lru_cache(maxsize=None)
def analysis_of(bars: int = 40, seed: int = 5, bpm: float = 128.0) -> dict:
    song = make_song(bpm, bars, seed=seed, repeat_melody=True)
    return analyze(song.pcm, song.sample_rate, f"sha256:phase3-{bars}-{seed}", backends={})


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a.astype(np.float64).ravel(), b.astype(np.float64).ravel()
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


# ---------- stems ----------


def test_core_stems_add_up_to_the_mix_and_follow_the_instruments() -> None:
    song = song_with_stems()
    est = separate(song.pcm, song.sample_rate)
    assert set(est) == set(STEM_NAMES)
    assert all(v.shape == song.pcm.shape for v in est.values())
    assert float(np.max(np.abs(sum(est.values()) - song.pcm))) < 1e-4
    own = {name: _corr(est[name], song.stems[name]) for name in STEM_NAMES}
    assert own["drums"] >= 0.8 and own["vocals"] >= 0.85, own
    assert own["bass"] >= 0.4, own
    for name in ("drums", "vocals", "other"):
        others = [_corr(est[name], song.stems[t]) for t in STEM_NAMES if t != name]
        assert own[name] > max(others), (name, own[name], others)


def test_fast_hpss_median_and_overlap_add_give_the_same_bits() -> None:
    rng = np.random.default_rng(3)
    for shape in ((1, 1), (5, 40), (16, 16), (17, 17), (300, 257)):
        x = rng.random(shape).astype(np.float32)
        x[:, ::7] = 0.5  # ties
        for size in (2, 5, 17):
            for axis in (0, 1):
                plain = median_filter(x, size=(size, 1) if axis == 0 else (1, size), mode="reflect")
                assert median_along(x, size, axis).tobytes() == plain.tobytes(), (shape, size, axis)
    bins = N_FFT // 2 + 1
    spec = (rng.standard_normal((40, bins)) + 1j * rng.standard_normal((40, bins))).astype(np.complex64)
    # the inverse STFT adding the frames one by one
    window = np.hanning(N_FFT)
    frames = np.fft.irfft(spec, n=N_FFT, axis=1) * window
    out = np.zeros((len(frames) - 1) * HOP + N_FFT)
    norm = np.zeros_like(out)
    for i, frame in enumerate(frames):
        out[i * HOP : i * HOP + N_FFT] += frame
        norm[i * HOP : i * HOP + N_FFT] += window**2
    out /= np.maximum(norm, 1e-8)
    length = 39 * HOP
    assert _istft(spec, length).tobytes() == out[N_FFT // 2 : N_FFT // 2 + length].tobytes()


def test_onsets_are_tagged_with_the_stem_they_come_from() -> None:
    song = song_with_stems(bars=24, seed=5, bpm=128.0)
    a = analyze(song.pcm, song.sample_rate, "tags", backends={})
    assert a["analyzer"]["backends"]["stems"] == "core-dsp"
    times = np.array([o["t"] for o in a["onsets"]]) / 1000.0
    shares = np.array([o["sources"] for o in a["onsets"]])
    vocal = STEM_NAMES.index("vocals")
    lead_shares = [shares[int(np.argmin(np.abs(times - t))), vocal] for t in song.onsets["lead"] if np.min(np.abs(times - t)) <= 0.025]
    assert np.mean(np.array(lead_shares) >= 0.25) >= 0.6
    truth = sorted((t, INSTRUMENT_STEM[k]) for k, v in song.onsets.items() for t in v)
    drum_only = hits = 0
    for o, t in zip(a["onsets"], times):
        near = {stem for (u, stem) in truth if abs(u - t) <= 0.025}
        if near == {"drums"}:
            drum_only += 1
            hits += o["source"] == "drums"
    assert drum_only > 50 and hits / drum_only >= 0.7
    assert all(s["leader"] in STEM_NAMES and len(s["stems"]) == 4 for s in a["sections"])


# ---------- ML backend plumbing ----------


class StubBackend:
    """Stands in for analysis.backends.Backend with an in-memory adapter module."""

    def __init__(self, kind: str, name: str, module: types.SimpleNamespace):
        self.kind, self.name, self.version = kind, name, "9.9"
        self.options: dict = {}
        self._module = module

    @property
    def label(self) -> str:
        return f"{self.name}-{self.version}"

    def module(self) -> types.SimpleNamespace:
        return self._module


def test_installed_backends_are_used_and_failures_fall_back_to_core() -> None:
    song = song_with_stems()
    sr = song.sample_rate
    beats = np.array(song.beats)
    stems_used: dict = {}

    def broken(*_args):
        raise RuntimeError("model download failed")

    backends = {
        "stems": StubBackend("stems", "demucs", types.SimpleNamespace(separate=lambda pcm, _sr, _o: dict(song.stems))),
        "beats": StubBackend("beats", "beat_this", types.SimpleNamespace(track=lambda pcm, _sr, _o: (beats, beats[::4]))),
        "pitch": StubBackend("pitch", "basic_pitch", types.SimpleNamespace(notes=lambda pcm, _sr, _o: [(t, t + 0.5, 72.0, 0.9) for t in song.onsets["lead"]])),
        "structure": StubBackend("structure", "allin1", types.SimpleNamespace(structure=broken)),
    }
    a = analyze(song.pcm, sr, "ml", backends=backends, stems_out=stems_used)
    used = a["analyzer"]["backends"]
    assert used == {"stems": "demucs-9.9", "beats": "beat_this-9.9", "pitch": "basic_pitch-9.9", "structure": "core"}
    assert "structure" in a["analyzer"]["errors"] and "model download failed" in a["analyzer"]["errors"]["structure"]
    assert set(stems_used) == set(STEM_NAMES)
    assert a["stems"]["method"] == "demucs-9.9"
    # true stems -> lead onsets are tagged vocals, and transcribed pitches reach the onsets
    lead = {round(t * 1000) for t in song.onsets["lead"]}
    tagged = [o for o in a["onsets"] if any(abs(o["t"] - t) <= 25 for t in lead)]
    assert np.mean([o["sources"][STEM_NAMES.index("vocals")] >= 0.3 for o in tagged]) >= 0.8
    assert any(o["pitch"] == 72.0 for o in tagged)
    gt_down = song.downbeats[0] * 1000
    assert min(abs(b["t"] - gt_down) for b in a["beats"] if b["isDownbeat"]) < 15


def test_adapters_convert_library_output(monkeypatch: pytest.MonkeyPatch) -> None:
    from rhythm_server.analysis.backends import allin1_backend, basic_pitch_backend, beat_this_backend

    class FakeTracker:
        def __init__(self, checkpoint_path: str, device: str, dbn: bool):
            assert checkpoint_path == "final0" and device == "cpu" and dbn is False

        def __call__(self, signal: np.ndarray, sr: int):
            assert signal.ndim == 1 and sr == 44100
            return np.array([1.0, 0.5, 1.5]), np.array([0.5])

    monkeypatch.setitem(sys.modules, "beat_this", types.ModuleType("beat_this"))
    monkeypatch.setitem(sys.modules, "beat_this.inference", types.SimpleNamespace(Audio2Beats=FakeTracker))
    beats, downs = beat_this_backend.track(np.zeros((44100, 2), np.float32), 44100, {"checkpoint": "final0", "device": "cpu"})
    assert beats.tolist() == [0.5, 1.0, 1.5] and downs.tolist() == [0.5]

    def fake_predict(path: str, minimum_note_length: float):
        assert Path(path).exists() and minimum_note_length == 120
        return None, None, [(0.5, 1.0, 60, 0.8, None), (0.2, 0.2, 61, 0.5, None)]

    monkeypatch.setitem(sys.modules, "basic_pitch", types.ModuleType("basic_pitch"))
    monkeypatch.setitem(sys.modules, "basic_pitch.inference", types.SimpleNamespace(predict=fake_predict))
    assert basic_pitch_backend.notes(np.zeros(44100, np.float32), 44100, {"minNoteMs": 120}) == [(0.5, 1.0, 60.0, 0.8)]

    seg = types.SimpleNamespace
    result = seg(bpm=120, beats=[0.5, 1.0], downbeats=[0.5], segments=[seg(start=0.0, end=8.0, label="intro"), seg(start=8.0, end=16.0, label="chorus")])

    def fake_analyze(path: str, device: str = "cpu", keep_byproducts: bool = True):
        assert Path(path).exists() and keep_byproducts is False
        return result

    monkeypatch.setitem(sys.modules, "allin1", types.SimpleNamespace(analyze=fake_analyze))
    out = allin1_backend.structure(np.zeros((44100, 2), np.float32), 44100, {"device": "cpu"})
    assert out["segments"] == [(0.0, 8.0, "intro"), (8.0, 16.0, "chorus")] and out["bpm"] == 120.0


def test_ml_helpers() -> None:
    beats = 0.5 + np.arange(64) * (60 / 140)
    assert abs(ml.bpm_hint(beats) - 140) < 1e-6
    assert abs(ml.bpm_hint(0.5 + np.arange(64) * (60 / 240)) - 120) < 1e-6  # folded into 70-200
    grid = beats + 0.002
    meter = ml.meter_from_downbeats(grid, beats, beats[1::4])
    assert meter is not None and meter.beats_per_bar == 4 and meter.first_downbeat_index == 1
    energy = np.concatenate([np.full(32, -20.0), np.full(32, -5.0)])
    sections = ml.sections_from_segments([(0.0, 5.0, "start"), (0.6, 14.0, "verse"), (14.2, 30.0, "chorus")], beats, 0, 4, energy)
    assert [(s.start_beat, s.label) for s in sections] == [(0, "verse"), (32, "chorus")]
    assert sections[1].energy > sections[0].energy


# ---------- generation ----------


def _chart_consistency(chart: dict, analysis: dict) -> float:
    """Share of slots in repeated sections whose key lanes match the first occurrence."""
    keys = {l.index for l in lane_infos(chart["meta"]["keyMode"]) if l.kind == "key"}
    by_beat: dict[float, set[int]] = {}
    for n in chart["notes"]:
        if n["lane"] in keys:
            by_beat.setdefault(round(n["beat"], 4), set()).add(n["lane"])
    sections = sorted(analysis["sections"], key=lambda s: s["startBeat"])
    first: dict[str, tuple[float, float]] = {}
    same = total = 0
    for k, s in enumerate(sections):
        end = sections[k + 1]["startBeat"] if k + 1 < len(sections) else float("inf")
        if s["group"] not in first:
            first[s["group"]] = (s["startBeat"], end)
            continue
        ref_start, ref_end = first[s["group"]]
        for beat, lanes in by_beat.items():
            if s["startBeat"] <= beat < end and ref_start + beat - s["startBeat"] < ref_end:
                ref = by_beat.get(round(ref_start + beat - s["startBeat"], 4))
                if ref is not None and len(ref) == len(lanes):
                    total += 1
                    same += ref == lanes
    return same / max(1, total)


def test_repeated_sections_reuse_their_lane_patterns() -> None:
    a = analysis_of()
    assert len({s["group"] for s in a["sections"]}) < len(a["sections"])  # something repeats
    for mode, diff in (("4K", "HARD"), ("7K+1S", "EXPERT")):
        on = generate_chart(a, mode, diff, seed=11)
        off = generate_chart(a, mode, diff, seed=11, overrides={"repeatConsistency": 0})
        assert on["meta"]["repeatConsistency"] >= 0.9
        assert off["meta"]["repeatConsistency"] is None
        assert _chart_consistency(on, a) >= 0.85
        assert _chart_consistency(on, a) > _chart_consistency(off, a) + 0.2


def test_charts_carry_sources_camera_cues_and_a_keysound_stem() -> None:
    a = analysis_of()
    chart = generate_chart(a, "6K", "HARD", seed=3)
    assert all(n.get("src") in STEM_NAMES for n in chart["notes"])
    keysound = chart["meta"]["keysound"]
    assert keysound["stem"] in ("vocals", "other", "bass") and abs(sum(keysound["shares"].values()) - 1) < 0.01
    effects = chart["effects"]
    assert effects and all(e["type"] in ("tilt", "zoom") for e in effects)
    chorus = [s for s in a["sections"] if s["energy"] >= 0.7]
    assert any(e["type"] == "tilt" and e["beat"] == max(0, chorus[0]["startBeat"]) for e in effects)
    assert all(-1 <= e["value"] <= 1 for e in effects)


def _tagged_analysis() -> dict:
    """Hand-made analysis: kick-only hits on the beat, hat-only hits between them (120 BPM)."""
    onsets = []
    for i in range(256):
        t = 500.0 + i * 250.0
        kick = i % 2 == 0
        onsets.append(
            {
                "t": t,
                "strength": 1.0 if kick else 0.8,
                "band": "low" if kick else "high",
                "bands": [0.85, 0.1, 0.05] if kick else [0.05, 0.1, 0.85],
                "pitch": None,
                "harmonic": 0.1,
                "sustainEnd": None,
                "source": "drums",
                "sources": [0.9, 0.04, 0.03, 0.03],
            }
        )
    duration = 500.0 + 256 * 250.0 + 2000.0
    return {
        "audioHash": "sha256:tagged",
        "analyzer": {"name": "core", "version": ANALYZER_VERSION},
        "durationMs": duration,
        "timing": {"offsetMs": 500.0, "tempoMap": [{"beat": 0, "bpm": 120.0}], "meter": [{"measure": 0, "beatsPerMeasure": 4}]},
        "onsets": onsets,
        "sections": [],
        "energy": {"frameMs": 100, "values": [0.8] * int(duration / 100)},
        "overrides": {},
    }


def test_instrument_mapping_puts_kicks_left_and_hats_right() -> None:
    a = _tagged_analysis()

    def spread(mapping: float) -> float:
        chart = generate_chart(a, "7K+1S", "HARD", seed=2, overrides={"instrumentMapping": mapping})
        lanes = lane_infos("7K+1S")
        kicks = [lanes[n["lane"]].pos for n in chart["notes"] if lanes[n["lane"]].kind == "key" and round(n["beat"] * 2) % 2 == 0]
        hats = [lanes[n["lane"]].pos for n in chart["notes"] if lanes[n["lane"]].kind == "key" and round(n["beat"] * 2) % 2 == 1]
        return float(np.mean(hats) - np.mean(kicks))

    assert spread(1.0) > 0.25
    assert spread(1.0) > spread(0.0) + 0.2


def test_old_analyses_without_stems_still_generate() -> None:
    a = dict(analysis_of())
    a["onsets"] = [{k: v for k, v in o.items() if k not in ("source", "sources")} for o in a["onsets"]]
    a["sections"] = [{k: v for k, v in s.items() if k not in ("stems", "leader")} for s in a["sections"]]
    chart = generate_chart(a, "4K", "NORMAL", seed=1)
    assert chart["notes"] and "src" not in chart["notes"][0]
    assert chart["meta"]["keysound"] is None


# ---------- API ----------


@pytest.fixture()
def client(tmp_path):
    app = create_app(tmp_path / "data", client_dist=None, synchronous_jobs=True)
    with TestClient(app) as c:
        yield c


def test_stems_endpoint_separates_once_and_caches(client: TestClient, tmp_path) -> None:
    song = client.post("/api/songs/demo", json={"bpm": 128, "bars": 8}).json()["song"]
    assert song["status"] == "ready" and song["outdated"] is False
    assert song["analyzer"]["version"] == ANALYZER_VERSION and song["analyzer"]["backends"]["stems"] == "core-dsp"
    sid = song["id"]
    assert client.get(f"/api/songs/{sid}/stems").json()["cached"] is False
    r = client.get(f"/api/songs/{sid}/stems/vocals")
    assert r.status_code == 200 and r.headers["content-type"] == "audio/flac"
    stem, sr = sf.read(io.BytesIO(r.content))
    mix, _ = sf.read(io.BytesIO(client.get(f"/api/songs/{sid}/audio").content))
    assert sr == 44100 and stem.shape == mix.shape
    status = client.get(f"/api/songs/{sid}/stems").json()
    assert status["cached"] is True and status["method"] == "core-dsp"
    total = sum(sf.read(io.BytesIO(client.get(f"/api/songs/{sid}/stems/{n}").content))[0] for n in STEM_NAMES)
    assert float(np.max(np.abs(total - mix))) < 5e-4  # 16-bit stems still add up to the mix
    assert client.get(f"/api/songs/{sid}/stems/piano").status_code == 404
    # re-analysis drops the cached stems (they may come from another separator)
    assert client.post(f"/api/songs/{sid}/reanalyze").status_code == 200
    assert client.get(f"/api/songs/{sid}/stems").json()["cached"] is False
    health = client.get("/api/health").json()
    assert {b["kind"] for b in health["backends"]} == {"stems", "beats", "pitch", "structure"}


def test_stems_are_separated_in_the_background_after_analysis(tmp_path) -> None:
    """Keysounds need the stems; the analysis queue separates them right after the analysis so
    the first play does not wait for them."""
    import time

    app = create_app(tmp_path / "data", client_dist=None)
    with TestClient(app) as c:
        sid = c.post("/api/songs/demo", json={"bpm": 128, "bars": 8}).json()["song"]["id"]
        deadline = time.monotonic() + 120
        while c.get(f"/api/songs/{sid}/stems").json()["cached"] is False:
            assert time.monotonic() < deadline, "stems were not separated after the analysis"
            time.sleep(0.2)
        assert c.get(f"/api/songs/{sid}").json()["song"]["status"] == "ready"
        assert c.get(f"/api/songs/{sid}/stems").json()["method"] == "core-dsp"


def test_background_video_upload_and_offset(client: TestClient) -> None:
    sid = client.post("/api/songs/demo", json={"bpm": 120, "bars": 8}).json()["song"]["id"]
    assert client.post(f"/api/songs/{sid}/bga", files={"file": ("clip.avi", b"x", "video/avi")}).status_code == 415
    r = client.post(f"/api/songs/{sid}/bga", files={"file": ("clip.mp4", b"\x00\x00\x00\x18ftypmp42", "video/mp4")})
    assert r.status_code == 201 and r.json()["song"]["hasBga"] is True
    video = client.get(f"/api/songs/{sid}/bga")
    assert video.status_code == 200 and video.headers["content-type"] == "video/mp4" and video.content.startswith(b"\x00\x00\x00\x18ftyp")
    song = client.patch(f"/api/songs/{sid}", json={"bgaOffsetMs": -250}).json()["song"]
    assert song["bgaOffsetMs"] == -250
    assert client.delete(f"/api/songs/{sid}/bga").status_code == 204
    assert client.get(f"/api/songs/{sid}/bga").status_code == 404
    assert client.get(f"/api/songs/{sid}").json()["song"]["hasBga"] is False


def test_old_libraries_are_migrated(tmp_path) -> None:
    root = tmp_path / "old"
    root.mkdir()
    db = sqlite3.connect(root / "library.sqlite3")
    db.execute(
        "CREATE TABLE songs (id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '', album TEXT NOT NULL DEFAULT '', "
        "original_name TEXT NOT NULL DEFAULT '', audio_hash TEXT NOT NULL, duration_ms REAL NOT NULL DEFAULT 0, has_cover INTEGER NOT NULL DEFAULT 0, "
        "status TEXT NOT NULL DEFAULT 'queued', progress REAL NOT NULL DEFAULT 0, progress_label TEXT NOT NULL DEFAULT '', error TEXT, bpm REAL, "
        "bpm_min REAL, bpm_max REAL, preview_ms REAL, overrides TEXT NOT NULL DEFAULT '{}', created_at REAL NOT NULL, analyzed_at REAL)"
    )
    db.execute("INSERT INTO songs (id, title, audio_hash, created_at, status) VALUES ('0123456789abcdef', 'old', 'sha256:x', 0, 'ready')")
    db.commit()
    db.close()
    song = Library(root).get_song("0123456789abcdef")
    assert song["analyzer"] == {} and song["hasBga"] is False and song["bgaOffsetMs"] == 0
