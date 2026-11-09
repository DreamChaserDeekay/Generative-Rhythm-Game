"""The BS-RoFormer SW stem backend (docs/PATTERN_DESIGN.md 97): its weights are downloaded once and
checked, and the model splits a track in overlapping chunks into stems that add up as Demucs's do."""

from __future__ import annotations

import hashlib

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


def test_a_small_model_splits_a_track_into_stems_that_add_up(tmp_path, monkeypatch) -> None:
    torch = pytest.importorskip("torch")
    pytest.importorskip("einops")
    pytest.importorskip("rotary_embedding_torch")
    from rhythm_server.analysis.backends.bs_roformer import BSRoformer

    kwargs = dict(dim=16, depth=1, stereo=True, num_stems=6, time_transformer_depth=1, freq_transformer_depth=1, dim_head=8, heads=2,
                  freqs_per_bands=[32, 32, 64, 129], stft_n_fft=512, stft_hop_length=128, stft_win_length=512)
    torch.manual_seed(0)
    state = BSRoformer(**kwargs).state_dict()
    ckpt = tmp_path / "tiny.ckpt"
    torch.save(state, ckpt)
    opts = _options(tmp_path, monkeypatch, ckpt.read_bytes())
    opts.update(model=kwargs, instruments=["bass", "drums", "other", "vocals", "guitar", "piano"], chunk=128 * 64, overlap=2, device="cpu")
    sr = 22050
    pcm = (np.random.default_rng(1).standard_normal((sr * 2, 2)) * 0.1).astype(np.float32)
    out = rb.separate(pcm, sr, opts)
    assert set(out) == {"drums", "bass", "vocals", "other", "guitar", "piano"}
    assert all(v.shape == pcm.shape for v in out.values())
    four = sum(out[k] for k in ("drums", "bass", "vocals", "other"))
    assert np.abs(four - pcm).max() < 1e-4  # "other" takes the residual, as with Demucs
