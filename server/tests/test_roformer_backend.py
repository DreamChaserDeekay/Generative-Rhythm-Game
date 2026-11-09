"""The BS-RoFormer SW stem backend (docs/PATTERN_DESIGN.md 97): its weights are downloaded once and
checked, and the model splits a track in overlapping chunks into stems that add up as Demucs's do."""

from __future__ import annotations

import hashlib
import sys

import numpy as np
import pytest

from rhythm_server.analysis.backends import ADAPTERS, ml_config
from rhythm_server.analysis.backends import roformer_backend as rb


def _options(tmp_path, monkeypatch, data: bytes, sha: str | None = None) -> dict:
    src = tmp_path / "src.ckpt"
    src.write_bytes(data)
    monkeypatch.setenv("GRG_MODEL_DIR", str(tmp_path / "models"))
    return {"file": "model.ckpt", "url": src.as_uri(), "sha256": sha or hashlib.sha256(data).hexdigest()}


def test_the_weights_are_downloaded_once_and_checked(tmp_path, monkeypatch) -> None:
    opts = _options(tmp_path, monkeypatch, b"weights" * 1000)
    path = rb.weights(opts)
    assert path.read_bytes() == b"weights" * 1000
    (tmp_path / "src.ckpt").unlink()  # the second call uses the file on disk
    assert rb.weights(opts) == path
    bad = _options(tmp_path, monkeypatch, b"other bytes", sha="0" * 64)
    bad["file"] = "bad.ckpt"
    with pytest.raises(ValueError, match="sha256"):
        rb.weights(bad)
    assert not (tmp_path / "models" / "bad.ckpt").exists()
    assert not list((tmp_path / "models").glob("*.part"))  # no half-written file is left


def test_the_shipped_settings_name_the_checkpoints_stems_and_bands() -> None:
    opts = ml_config()["models"]["roformer"]
    assert "roformer" in ADAPTERS
    assert opts["instruments"] == ["bass", "drums", "other", "vocals", "guitar", "piano"]
    assert opts["model"]["num_stems"] == 6 and sum(opts["model"]["freqs_per_bands"]) == opts["model"]["stft_n_fft"] // 2 + 1
    assert len(opts["sha256"]) == 64 and opts["chunk"] % opts["model"]["stft_hop_length"] == 0


TINY = dict(dim=16, depth=1, stereo=True, num_stems=6, time_transformer_depth=1, freq_transformer_depth=1, dim_head=8, heads=2,
            freqs_per_bands=[32, 32, 64, 129], stft_n_fft=512, stft_hop_length=128, stft_win_length=512)
NAMES = ["bass", "drums", "other", "vocals", "guitar", "piano"]


def _tiny(tmp_path, monkeypatch, device: str) -> dict:
    torch = pytest.importorskip("torch")
    pytest.importorskip("einops")
    pytest.importorskip("rotary_embedding_torch")
    from rhythm_server.analysis.backends.bs_roformer import BSRoformer

    torch.manual_seed(0)
    ckpt = tmp_path / "tiny.ckpt"
    torch.save(BSRoformer(**TINY).state_dict(), ckpt)
    opts = _options(tmp_path, monkeypatch, ckpt.read_bytes())
    opts.update(model=TINY, instruments=NAMES, chunk=128 * 64, dmlChunk=128 * 48, overlap=2, device=device)
    return opts


def _pcm(sr: int) -> np.ndarray:
    return (np.random.default_rng(1).standard_normal((sr * 2, 2)) * 0.1).astype(np.float32)


def test_a_small_model_splits_a_track_into_stems_that_add_up(tmp_path, monkeypatch) -> None:
    opts = _tiny(tmp_path, monkeypatch, "cpu")
    pcm = _pcm(22050)
    out = rb.separate(pcm, 22050, opts)
    assert set(out) == set(NAMES)
    assert all(v.shape == pcm.shape for v in out.values())
    four = sum(out[k] for k in ("drums", "bass", "vocals", "other"))
    assert np.abs(four - pcm).max() < 1e-4  # "other" takes the residual, as with Demucs


def test_the_onnx_export_in_onnx_runtime_separates_as_pytorch_does(tmp_path, monkeypatch) -> None:
    """The GPU path of the desktop editions (DirectML), run here on ONNX Runtime's CPU: the network
    exported once with a free frames axis, between the model's own STFT and inverse STFT."""
    pytest.importorskip("onnx")
    pytest.importorskip("onnxruntime")
    opts = _tiny(tmp_path, monkeypatch, "dml")
    pcm = _pcm(44100)
    out = rb.separate(pcm, 44100, opts)
    exported = list((tmp_path / "models").glob(f"*.{rb.ONNX_TAG}.onnx"))
    assert len(exported) == 1 and not list((tmp_path / "models").glob("*.part"))
    ref = rb.separate(pcm, 44100, dict(opts, device="cpu", chunk=opts["dmlChunk"]))
    assert max(float(np.abs(out[k] - ref[k]).max()) for k in NAMES) < 1e-4
    stamp = exported[0].stat().st_mtime_ns
    assert rb.separate(pcm, 44100, opts)["drums"].shape == pcm.shape
    assert exported[0].stat().st_mtime_ns == stamp  # the export is made once


def test_without_a_gpu_the_model_leaves_the_song_to_demucs(monkeypatch) -> None:
    monkeypatch.setattr(rb, "_accelerator", lambda _o: None)
    assert not rb.usable({"device": "auto"})
    assert rb.usable({"device": "auto", "cpu": True}) and rb.usable({"device": "cpu"})
    monkeypatch.setattr(rb, "_accelerator", lambda _o: "dml")
    assert rb.usable({"device": "auto"})
    if sys.platform != "win32":
        assert rb.gpu.__wrapped__(2048) is None  # DirectX adapters are listed on Windows only


def test_the_stems_go_to_demucs_when_the_model_does_not_suit_the_machine(monkeypatch) -> None:
    import rhythm_server.analysis.backends as be

    cfg = {"enabled": True, "device": "cpu", "stems": {"backend": "roformer", "fallback": "demucs"},
           "models": {"roformer": {"version": "x", "device": "auto"}, "demucs": {"model": "htdemucs_6s"}}}
    monkeypatch.setattr(be, "ml_config", lambda: cfg)
    monkeypatch.setattr(be, "installed", lambda name: True)
    monkeypatch.setattr(rb, "_accelerator", lambda _o: None)
    stems = be.detect()["stems"]
    assert stems.name == "demucs" and stems.fallback is None and stems.options["model"] == "htdemucs_6s"
    assert [r["name"] for r in be.status() if r["kind"] == "stems"] == ["demucs"]
    monkeypatch.setattr(rb, "_accelerator", lambda _o: "dml")
    stems = be.detect()["stems"]
    assert stems.label == "roformer-x" and stems.fallback is not None and stems.fallback.name == "demucs"
    assert stems.options["device"] == "auto" and "model" not in stems.options  # each backend gets its own settings
