"""Band-Split RoFormer, for inference only: the model of the BS-RoFormer SW checkpoint (six stems:
bass, drums, other, vocals, guitar, piano; roformer_backend.py, docs/PATTERN_DESIGN.md 97).

Adapted from models/bs_roformer/bs_roformer.py and attend.py of ZFTurbo's Music Source Separation
Training (https://github.com/ZFTurbo/Music-Source-Separation-Training), itself built on Phil Wang's
BS-RoFormer (https://github.com/lucidrains/BS-RoFormer). Training (losses, checkpointing), linear
attention, PoPE and the beartype checks are left out; the module and parameter names are kept, so
the published state dicts load as they are.

MIT License — Copyright (c) 2024 Roman Solovyev (ZFTurbo); Copyright (c) 2023 Phil Wang

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import partial

import torch
import torch.nn.functional as F
from einops import pack, rearrange, unpack
from rotary_embedding_torch import RotaryEmbedding
from torch import nn
from torch.nn import Module, ModuleList


def _pack_one(t, pattern):
    return pack([t], pattern)


def _unpack_one(t, ps, pattern):
    return unpack(t, ps, pattern)[0]


class RMSNorm(Module):
    def __init__(self, dim):
        super().__init__()
        self.scale = dim**0.5
        self.gamma = nn.Parameter(torch.ones(dim))

    def forward(self, x):
        return F.normalize(x, dim=-1) * self.scale * self.gamma


class FeedForward(Module):
    def __init__(self, dim, mult=4, dropout=0.0):
        super().__init__()
        dim_inner = int(dim * mult)
        self.net = nn.Sequential(RMSNorm(dim), nn.Linear(dim, dim_inner), nn.GELU(), nn.Dropout(dropout), nn.Linear(dim_inner, dim), nn.Dropout(dropout))

    def forward(self, x):
        return self.net(x)


class Attend(Module):
    """Scaled dot-product attention (PyTorch's fused kernel)."""

    def __init__(self, dropout=0.0, flash=True, scale=None):
        super().__init__()
        self.scale = scale
        self.dropout = dropout
        self.attn_dropout = nn.Dropout(dropout)

    def forward(self, q, k, v):
        if self.scale is not None:
            q = q * (self.scale / q.shape[-1] ** -0.5)
        return F.scaled_dot_product_attention(q, k, v, dropout_p=self.dropout if self.training else 0.0)


class Attention(Module):
    def __init__(self, dim, heads=8, dim_head=64, dropout=0.0, rotary_embed=None, flash=True):
        super().__init__()
        self.heads = heads
        self.scale = dim_head**-0.5
        dim_inner = heads * dim_head
        self.rotary_embed = rotary_embed
        self.attend = Attend(flash=flash, dropout=dropout)
        self.norm = RMSNorm(dim)
        self.to_qkv = nn.Linear(dim, dim_inner * 3, bias=False)
        self.to_gates = nn.Linear(dim, heads)
        self.to_out = nn.Sequential(nn.Linear(dim_inner, dim, bias=False), nn.Dropout(dropout))

    def forward(self, x):
        x = self.norm(x)
        q, k, v = rearrange(self.to_qkv(x), "b n (qkv h d) -> qkv b h n d", qkv=3, h=self.heads)
        if self.rotary_embed is not None:
            q = self.rotary_embed.rotate_queries_or_keys(q)
            k = self.rotary_embed.rotate_queries_or_keys(k)
        out = self.attend(q, k, v)
        gates = self.to_gates(x)
        out = out * rearrange(gates, "b n h -> b h n 1").sigmoid()
        out = rearrange(out, "b h n d -> b n (h d)")
        return self.to_out(out)


class Transformer(Module):
    def __init__(self, *, dim, depth, dim_head=64, heads=8, attn_dropout=0.0, ff_dropout=0.0, ff_mult=4, norm_output=True, rotary_embed=None, flash_attn=True):
        super().__init__()
        self.layers = ModuleList([])
        for _ in range(depth):
            attn = Attention(dim=dim, dim_head=dim_head, heads=heads, dropout=attn_dropout, rotary_embed=rotary_embed, flash=flash_attn)
            self.layers.append(ModuleList([attn, FeedForward(dim=dim, mult=ff_mult, dropout=ff_dropout)]))
        self.norm = RMSNorm(dim) if norm_output else nn.Identity()

    def forward(self, x):
        for attn, ff in self.layers:
            x = attn(x) + x
            x = ff(x) + x
        return self.norm(x)


class BandSplit(Module):
    def __init__(self, dim, dim_inputs: tuple[int, ...]):
        super().__init__()
        self.dim_inputs = dim_inputs
        self.to_features = ModuleList([nn.Sequential(RMSNorm(dim_in), nn.Linear(dim_in, dim)) for dim_in in dim_inputs])

    def forward(self, x):
        x = x.split(self.dim_inputs, dim=-1)
        return torch.stack([to_feature(part) for part, to_feature in zip(x, self.to_features)], dim=-2)


def _mlp(dim_in, dim_out, dim_hidden=None, depth=1, activation=nn.Tanh):
    dim_hidden = dim_in if dim_hidden is None else dim_hidden
    net = []
    dims = (dim_in, *((dim_hidden,) * (depth - 1)), dim_out)
    for ind, (layer_dim_in, layer_dim_out) in enumerate(zip(dims[:-1], dims[1:])):
        net.append(nn.Linear(layer_dim_in, layer_dim_out))
        if ind != len(dims) - 2:
            net.append(activation())
    return nn.Sequential(*net)


class MaskEstimator(Module):
    def __init__(self, dim, dim_inputs: tuple[int, ...], depth, mlp_expansion_factor=4):
        super().__init__()
        self.dim_inputs = dim_inputs
        dim_hidden = dim * mlp_expansion_factor
        self.to_freqs = ModuleList([nn.Sequential(_mlp(dim, dim_in * 2, dim_hidden=dim_hidden, depth=depth), nn.GLU(dim=-1)) for dim_in in dim_inputs])

    def forward(self, x):
        x = x.unbind(dim=-2)
        return torch.cat([mlp(band) for band, mlp in zip(x, self.to_freqs)], dim=-1)


class BSRoformer(Module):
    def __init__(
        self,
        dim,
        *,
        depth,
        stereo=False,
        num_stems=1,
        time_transformer_depth=2,
        freq_transformer_depth=2,
        linear_transformer_depth=0,
        freqs_per_bands: tuple[int, ...] = (),
        dim_head=64,
        heads=8,
        attn_dropout=0.0,
        ff_dropout=0.0,
        flash_attn=True,
        dim_freqs_in=1025,
        stft_n_fft=2048,
        stft_hop_length=512,
        stft_win_length=2048,
        stft_normalized=False,
        stft_window_fn: Callable | None = None,
        zero_dc=True,
        mask_estimator_depth=2,
        mlp_expansion_factor=4,
        skip_connection=False,
        **_training_only,
    ):
        super().__init__()
        if linear_transformer_depth:
            raise ValueError("linear attention layers are not supported here")
        self.stereo = stereo
        self.audio_channels = 2 if stereo else 1
        self.num_stems = num_stems
        self.skip_connection = skip_connection
        self.layers = ModuleList([])
        transformer_kwargs = dict(dim=dim, heads=heads, dim_head=dim_head, attn_dropout=attn_dropout, ff_dropout=ff_dropout, flash_attn=flash_attn, norm_output=False)
        time_rotary_embed = RotaryEmbedding(dim=dim_head)
        freq_rotary_embed = RotaryEmbedding(dim=dim_head)
        for _ in range(depth):
            self.layers.append(
                nn.ModuleList(
                    [
                        Transformer(depth=time_transformer_depth, rotary_embed=time_rotary_embed, **transformer_kwargs),
                        Transformer(depth=freq_transformer_depth, rotary_embed=freq_rotary_embed, **transformer_kwargs),
                    ]
                )
            )
        self.final_norm = RMSNorm(dim)
        self.stft_kwargs = dict(n_fft=stft_n_fft, hop_length=stft_hop_length, win_length=stft_win_length, normalized=stft_normalized)
        self.stft_window_fn = partial(stft_window_fn or torch.hann_window, stft_win_length)
        freqs = stft_n_fft // 2 + 1
        if sum(freqs_per_bands) != freqs:
            raise ValueError(f"the bands must cover {freqs} frequencies, not {sum(freqs_per_bands)}")
        freqs_with_complex = tuple(2 * f * self.audio_channels for f in freqs_per_bands)
        self.band_split = BandSplit(dim=dim, dim_inputs=freqs_with_complex)
        self.mask_estimators = nn.ModuleList(
            [MaskEstimator(dim=dim, dim_inputs=freqs_with_complex, depth=mask_estimator_depth, mlp_expansion_factor=mlp_expansion_factor) for _ in range(num_stems)]
        )
        self.zero_dc = zero_dc

    def spectrum(self, raw_audio):
        """(batch, channels, samples) -> the STFT (batch, freqs x channels, frames, 2) and the
        network's input (batch, frames, freqs x channels x 2)."""
        if raw_audio.ndim == 2:
            raw_audio = rearrange(raw_audio, "b t -> b 1 t")
        raw_audio, packed_shape = _pack_one(raw_audio, "* t")
        window = self.stft_window_fn(device=raw_audio.device)
        stft_repr = torch.view_as_real(torch.stft(raw_audio, **self.stft_kwargs, window=window, return_complex=True))
        stft_repr = _unpack_one(stft_repr, packed_shape, "* f t c")
        stft_repr = rearrange(stft_repr, "b s f t c -> b (f s) t c")
        return stft_repr, rearrange(stft_repr, "b f t c -> b t (f c)")

    def masks(self, x):
        """The network: its input (batch, frames, freqs x channels x 2) -> the stems' complex masks
        (batch, stems, frames, freqs x channels x 2). The part exported to ONNX (no STFT inside)."""
        x = self.band_split(x)
        store = [None] * len(self.layers)
        for i, (time_transformer, freq_transformer) in enumerate(self.layers):
            if self.skip_connection:
                for j in range(i):
                    x = x + store[j]
            x = rearrange(x, "b t f d -> b f t d")
            x, ps = pack([x], "* t d")
            x = time_transformer(x)
            (x,) = unpack(x, ps, "* t d")
            x = rearrange(x, "b f t d -> b t f d")
            x, ps = pack([x], "* f d")
            x = freq_transformer(x)
            (x,) = unpack(x, ps, "* f d")
            if self.skip_connection:
                store[i] = x
        x = self.final_norm(x)
        return torch.stack([fn(x) for fn in self.mask_estimators], dim=1)

    def stems(self, stft_repr, mask, length):
        """The stems from the mixture's STFT and the masks: (batch, stems, channels, samples)."""
        window = self.stft_window_fn(device=stft_repr.device)
        mask = rearrange(mask.float(), "b n t (f c) -> b n f t c", c=2)
        stft_repr = rearrange(stft_repr, "b f t c -> b 1 f t c")
        stft_repr = torch.view_as_complex(stft_repr) * torch.view_as_complex(mask)
        stft_repr = rearrange(stft_repr, "b n (f s) t -> (b n s) f t", s=self.audio_channels)
        if self.zero_dc:
            stft_repr[:, 0] = 0.0
        recon = torch.istft(stft_repr, **self.stft_kwargs, window=window, return_complex=False, length=length)
        return rearrange(recon, "(b n s) t -> b n s t", s=self.audio_channels, n=self.num_stems)

    def forward(self, raw_audio):
        """(batch, channels, samples) -> (batch, stems, channels, samples)."""
        stft_repr, x = self.spectrum(raw_audio)
        return self.stems(stft_repr, self.masks(x), raw_audio.shape[-1])


def demix(
    run: Callable[[torch.Tensor], torch.Tensor],
    num_stems: int,
    mix: torch.Tensor,
    chunk: int,
    overlap: int,
    batch: int = 1,
    progress: Callable[[float], None] | None = None,
) -> torch.Tensor:
    """Separate a whole track (channels, samples) by overlapping chunks with linear fades, as MSST's
    `demix` (generic mode) does: (stems, channels, samples). `run` separates a batch of chunks,
    (batch, channels, samples) -> (batch, stems, channels, samples): the model itself, or its STFT
    around an ONNX session (roformer_backend)."""
    fade = chunk // 10
    step = chunk // overlap
    border = chunk - step
    n = mix.shape[-1]
    if n > 2 * border and border > 0:
        mix = F.pad(mix[None], (border, border), mode="reflect")[0]
    device = mix.device
    window = torch.ones(chunk, device=device)
    window[:fade] = torch.linspace(0, 1, fade, device=device)
    window[-fade:] = torch.linspace(1, 0, fade, device=device)
    total = mix.shape[-1]
    result = torch.zeros((num_stems,) + tuple(mix.shape), dtype=torch.float32, device=device)
    counter = torch.zeros(total, dtype=torch.float32, device=device)
    starts = list(range(0, total, step))
    with torch.inference_mode():
        for b0 in range(0, len(starts), batch):
            group = starts[b0 : b0 + batch]
            parts = []
            for i in group:
                part = mix[:, i : i + chunk]
                pad_mode = "reflect" if part.shape[-1] > chunk // 2 else "constant"
                parts.append(F.pad(part[None], (0, chunk - part.shape[-1]), mode=pad_mode)[0])
            out = run(torch.stack(parts)).float()
            for j, i in enumerate(group):
                seg = min(chunk, total - i)
                w = window.clone()
                if i == 0:
                    w[:fade] = 1
                if i + step >= total:
                    w[-fade:] = 1
                result[..., i : i + seg] += out[j, ..., :seg] * w[:seg]
                counter[i : i + seg] += w[:seg]
            if progress is not None:
                progress(min(1.0, (b0 + len(group)) / len(starts)))
    est = result / counter.clamp_min(1e-8)
    if n > 2 * border and border > 0:
        est = est[..., border:-border]
    return torch.nan_to_num(est)
