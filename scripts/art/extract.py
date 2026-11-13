"""Recover pixel-exact sprites from nearest-neighbour preview images (JPEG screenshots).

Method: find the sprite's bounding box in a cell, pick the pixel-grid offset with the most uniform blocks,
take the median colour of each block's interior, snap it to the ENDESGA 32 palette, then rebuild the
#181425 outline (the preview background has the same colour): background-coloured pixels connected to the
cell edge become transparent, enclosed ones stay opaque, and a 1 px outline ring is re-added.
"""
import numpy as np
from PIL import Image

PALETTE_HEX = """be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e
124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569""".split()
PALETTE = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in PALETTE_HEX])
OUTLINE = np.array([0x18, 0x14, 0x25])
BG_IDX = PALETTE_HEX.index('181425')


def _ycc(c):
    c = np.asarray(c, dtype=float)
    y = c @ np.array([0.299, 0.587, 0.114])
    return np.stack([y, (c[..., 2] - y) * 0.564, (c[..., 0] - y) * 0.713], -1)


_PAL_YCC = _ycc(PALETTE)


def snap(rgb, chroma_boost=1.3):
    """Nearest palette colour in YCbCr; chroma is boosted to undo JPEG chroma-subsampling wash-out (tuned on real PNGs)."""
    o = _ycc(np.asarray(rgb, dtype=float))
    o[..., 1:] *= chroma_boost
    d = ((o[:, None, :] - _PAL_YCC[None, :, :]) ** 2).sum(-1)
    return d.argmin(axis=1)


def bbox(region, bg, thr=60):
    mask = np.abs(region - bg).sum(axis=2) > thr
    ys, xs = np.where(mask)
    if not len(xs):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def extract(img, rect, scale, size, outline=True, center=True):
    """img: HxWx3 int array. rect: (x0,y0,x1,y1) cell area. Returns an RGBA PIL image of size (w,h)."""
    x0, y0, x1, y1 = rect
    region = img[y0:y1, x0:x1].astype(float)
    bg = img[3, 3].astype(float)
    bb = bbox(region, bg)
    if bb is None:
        raise ValueError('empty cell')
    bx0, by0, bx1, by1 = bb
    # choose the grid offset with the most uniform blocks
    best = None
    for ox in range(scale):
        for oy in range(scale):
            sx, sy = bx0 - ox, by0 - oy
            nx = (bx1 - sx + scale - 1) // scale
            ny = (by1 - sy + scale - 1) // scale
            sub = region[max(sy, 0):sy + ny * scale, max(sx, 0):sx + nx * scale]
            if sub.shape[0] < ny * scale or sub.shape[1] < nx * scale:
                continue
            blocks = sub.reshape(ny, scale, nx, scale, 3)
            var = blocks.var(axis=(1, 3)).sum()
            if best is None or var < best[0]:
                best = (var, sx, sy, nx, ny)
    _, sx, sy, nx, ny = best
    m = 1 if scale >= 3 else 0          # skip the block border (JPEG ringing)
    cols = np.zeros((ny, nx, 3))
    for j in range(ny):
        for i in range(nx):
            blk = region[sy + j * scale + m: sy + (j + 1) * scale - m, sx + i * scale + m: sx + (i + 1) * scale - m]
            cols[j, i] = np.median(blk.reshape(-1, 3), axis=0)
    idx = snap(cols.reshape(-1, 3)).reshape(ny, nx)
    # transparency: background-coloured pixels connected to the border of this patch (padded)
    pad = np.pad(idx, 1, constant_values=BG_IDX)
    trans = np.zeros_like(pad, dtype=bool)
    stack = [(0, 0)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= pad.shape[0] or x >= pad.shape[1] or trans[y, x] or pad[y, x] != BG_IDX:
            continue
        trans[y, x] = True
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    opaque = ~trans
    if outline:  # re-add the 1 px outline ring that merged into the preview background
        ring = np.zeros_like(opaque)
        ring[1:, :] |= opaque[:-1, :]; ring[:-1, :] |= opaque[1:, :]
        ring[:, 1:] |= opaque[:, :-1]; ring[:, :-1] |= opaque[:, 1:]
        ring &= ~opaque
        opaque |= ring
    ys, xs = np.where(opaque)
    oy0, oy1, ox0, ox1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.zeros((oy1 - oy0, ox1 - ox0, 4), dtype=np.uint8)
    sub_idx, sub_op = pad[oy0:oy1, ox0:ox1], opaque[oy0:oy1, ox0:ox1]
    rgba[..., :3] = PALETTE[sub_idx]
    rgba[..., 3] = np.where(sub_op, 255, 0)
    spr = Image.fromarray(rgba, 'RGBA')
    w, h = size
    if spr.width > w or spr.height > h:
        raise ValueError(f'sprite {spr.size} larger than canvas {size}')
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(spr, ((w - spr.width) // 2, (h - spr.height) // 2) if center else (0, 0))
    return out


def palette_report(im):
    a = np.asarray(im.convert('RGBA'))
    op = a[..., 3] > 0
    cols = {tuple(c) for c in a[op][:, :3]}
    pal = {tuple(c) for c in PALETTE}
    return {'size': im.size, 'colours': len(cols), 'off_palette': len(cols - pal), 'alpha': sorted(set(a[..., 3].ravel()))}
