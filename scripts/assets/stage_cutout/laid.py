"""The image model's cut-out laid back on its working canvas (the affine fit of register.py), and its green key.
   from laid import laid, key"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def laid(S, name, n, ref='canvas'):
    """(canvas, cut-out on the canvas): float32 RGB arrays of the canvas's size."""
    A = Image.open(f'{S}/work/{name}-{ref}.png').convert('RGB')
    B = Image.open(f'{S}/work/{name}-try-{n}.png').convert('RGB').resize(A.size, Image.LANCZOS)
    M = np.array(json.load(open(f'{S}/work/{name}-try-{n}-fit.json'))['matrix'])   # [x', y'] = M [x, y, 1]
    b = np.asarray(B).astype(np.float32)
    lin = np.array([[M[1, 1], M[1, 0]], [M[0, 1], M[0, 0]]])
    off = np.array([M[1, 2], M[0, 2]])
    out = np.stack([ndi.affine_transform(b[..., c], lin, off, order=3, mode='nearest') for c in range(3)], -1)
    return np.asarray(A).astype(np.float32), np.clip(out, 0, 255)


def key(b):
    """How much of a px of the cut-out is figure (0..1): the flat green keyed out, linear in the green's excess."""
    d = b[..., 1] - np.maximum(b[..., 0], b[..., 2])
    return np.clip((235 - d) / 225, 0, 1)
