"""Delta-V Tycoon environment art (Brief 5 / A15.2): procedural pixel art on the ENDESGA 32 palette.

Draws every non-character asset that was still a placeholder: backgrounds, planets, rockets, fx strips,
spacecraft parts, event + scenario illustrations, logo, favicon and the link-preview image.
Rules kept from the art bible: native 1x size, palette colours only, alpha 0/255, 1 px #181425 outline
on objects, light from the top-left, dithering instead of gradients.
Run: python scripts/art/env_art.py            (writes into public/assets/)
"""
import math
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / 'public' / 'assets'
HEX = """be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e
124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569""".split()
P = {h: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in HEX}
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
OUT = '181425'
rng = np.random.default_rng(7)


# ------------------------------------------------------------------ canvas
class Cv:
    def __init__(s, w, h, fill=None):
        s.w, s.h = w, h
        s.c = np.full((h, w), '', dtype=object)
        if fill:
            s.c[:, :] = fill

    def px(s, x, y, col):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < s.w and 0 <= y < s.h:
            s.c[y, x] = col

    def get(s, x, y):
        return s.c[y, x] if 0 <= x < s.w and 0 <= y < s.h else ''

    def rect(s, x0, y0, x1, y1, col):
        for y in range(max(0, y0), min(s.h, y1 + 1)):
            for x in range(max(0, x0), min(s.w, x1 + 1)):
                s.c[y, x] = col

    def line(s, x0, y0, x1, y1, col, w=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(1, n)
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for dx in range(w):
                s.px(x + dx - w // 2, y, col)

    def disc(s, cx, cy, r, col):
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                if (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r:
                    s.px(x, y, col)

    def ring(s, cx, cy, r, col, t=1):
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                d = math.hypot(x + .5 - cx, y + .5 - cy)
                if r - t < d <= r:
                    s.px(x, y, col)

    def ellipse(s, cx, cy, rx, ry, col):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1:
                    s.px(x, y, col)

    def poly(s, pts, col):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            for i in range(len(pts)):
                (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
                if (y0 <= y + .5 < y1) or (y1 <= y + .5 < y0):
                    xs.append(x0 + (y + .5 - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                for x in range(int(math.ceil(a - .5)), int(math.floor(b - .5)) + 1):
                    s.px(x, y, col)

    def mask(s):
        return s.c != ''

    def outline(s, col=OUT):
        m = s.mask()
        o = np.zeros_like(m)
        o[1:, :] |= m[:-1, :]; o[:-1, :] |= m[1:, :]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
        s.c[o & ~m] = col

    def blit(s, o, ox, oy):
        for y in range(o.h):
            for x in range(o.w):
                if o.c[y, x]:
                    s.px(ox + x, oy + y, o.c[y, x])

    def img(s):
        a = np.zeros((s.h, s.w, 4), dtype=np.uint8)
        for y in range(s.h):
            for x in range(s.w):
                v = s.c[y, x]
                if v:
                    a[y, x] = (*P[v], 255)
        return Image.fromarray(a, 'RGBA')


def ramp(cols, v, x, y):
    """pick from a dark->light colour list by value 0..1 with ordered dithering."""
    v = min(max(v, 0), 0.9999) * (len(cols) - 1)
    i = int(v)
    f = v - i
    return cols[min(i + (1 if f > BAYER[y % 4, x % 4] else 0), len(cols) - 1)]


def save(cv_or_img, rel, size):
    im = cv_or_img.img() if isinstance(cv_or_img, Cv) else cv_or_img
    assert im.size == size, (rel, im.size, size)
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)
    return im


def noise2(w, h, scale, seed, octaves=3):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp, tot = 1.0, 0
    for o in range(octaves):
        gs = max(2, int(scale * 2 ** o))
        g = r.random((gs + 1, gs + 1))
        ys = np.linspace(0, gs - 1e-6, h)
        xs = np.linspace(0, gs - 1e-6, w)
        yi, xi = ys.astype(int), xs.astype(int)
        yf, xf = ys - yi, xs - xi
        yf = yf * yf * (3 - 2 * yf); xf = xf * xf * (3 - 2 * xf)
        a = g[yi][:, xi]; b = g[yi][:, xi + 1]; c = g[yi + 1][:, xi]; d = g[yi + 1][:, xi + 1]
        v = (a * (1 - xf) + b * xf) * (1 - yf[:, None]) + (c * (1 - xf) + d * xf) * yf[:, None]
        out += v * amp
        tot += amp
        amp *= 0.5
    return out / tot


def starfield(cv, n, seed=1, region=None, colours=('ffffff', 'c0cbdc', '8b9bb4', '5a6988')):
    r = np.random.default_rng(seed)
    x0, y0, x1, y1 = region or (0, 0, cv.w - 1, cv.h - 1)
    for _ in range(n):
        x, y = r.integers(x0, x1 + 1), r.integers(y0, y1 + 1)
        c = colours[min(len(colours) - 1, int(r.exponential(1.0)))]
        cv.px(x, y, c)
        if r.random() < 0.04:   # sparkle
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                cv.px(x + dx, y + dy, '5a6988')
            cv.px(x, y, 'ffffff')


# ------------------------------------------------------------------ planets (orthographic spheres)
AFRICA = [(-17, 21), (-16, 12), (-12, 7), (-8, 4.5), (-2, 5), (5, 4), (9, 3), (9.5, -1), (12, -5), (12.5, -12), (14, -22),
          (18, -34.5), (21, -34.5), (26, -33.5), (32.5, -28), (35.5, -23), (40.5, -15), (40, -10.5), (39.5, -5), (42, -0.5),
          (48, 4), (51, 11.5), (43.5, 12), (39, 17), (37, 22), (34, 28), (32.5, 31.5), (25, 31.8), (20, 31), (19.5, 30.4),
          (15, 32.5), (10.5, 33.5), (10, 37), (3, 36.8), (-2, 35.2), (-6, 35.8), (-9.5, 30), (-13, 27.5), (-17, 21)]
ARABIA = [(32.5, 31.5), (35.5, 33), (36, 36.5), (44, 37), (48, 30), (50.5, 26), (56, 26), (59.5, 22.5), (52, 16.5),
          (45, 13), (43, 12.7), (39, 21), (34.5, 28)]
EUROPE = [(-9.5, 37), (-9, 43.5), (-1.5, 43.6), (3, 43), (8, 44), (12.5, 44), (16, 38), (18.5, 40.2), (14, 45.5), (23.5, 40),
          (26, 41), (29, 41.2), (36, 36.6), (36, 41), (41, 41.5), (45, 47), (40, 55), (30, 60), (10, 60), (-10, 52)]
MADAGASCAR = [(44, -25), (47, -25), (50.5, -15.5), (49.5, -12), (44, -17)]
NILE = [(31.2, 30.5), (31.3, 27), (32.9, 24), (31, 21.8), (33.5, 19), (32.5, 15.6), (32.6, 12), (31.5, 9), (31.7, 4.5)]
DELTA_FAN = [(29.8, 31.2), (31.2, 30), (32.6, 31.3)]


def inpoly(lon, lat, poly):
    ins = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i], poly[i - 1]
        if (y0 > lat) != (y1 > lat) and lon < (x1 - x0) * (lat - y0) / (y1 - y0) + x0:
            ins = not ins
    return ins


def sphere(size, surface, lon0=0.0, lat0=0.0, light=(-0.55, -0.6, 0.58), atmos=None, shade=True):
    """surface(lon, lat, x, y) -> (colour list dark->light) ; returns a Cv."""
    cv = Cv(size, size)
    r = size / 2 - 1
    L = np.array(light) / np.linalg.norm(light)
    cl0, sl0 = math.cos(math.radians(lat0)), math.sin(math.radians(lat0))
    for y in range(size):
        for x in range(size):
            nx, ny = (x + .5 - size / 2) / r, (y + .5 - size / 2) / r
            d2 = nx * nx + ny * ny
            if d2 > 1:
                continue
            nz = math.sqrt(1 - d2)
            # rotate view by lat0 around x axis then get lon/lat
            yy, zz = -ny * cl0 + nz * sl0, ny * sl0 + nz * cl0
            lat = math.degrees(math.asin(max(-1, min(1, yy))))
            lon = math.degrees(math.atan2(nx, zz)) + lon0
            cols = surface(lon, lat, x, y)
            lit = max(0.0, nx * L[0] + ny * L[1] + nz * L[2]) if shade else 0.8
            v = 0.15 + 0.85 * lit
            cv.c[y, x] = ramp(cols, v, x, y)
    if atmos:
        for y in range(size):
            for x in range(size):
                d = math.hypot(x + .5 - size / 2, y + .5 - size / 2)
                if r - 1 < d <= r and cv.c[y, x]:
                    lit = (-(x - size / 2) * 0.7 - (y - size / 2) * 0.7) / r
                    cv.c[y, x] = atmos[0] if lit > -0.3 else atmos[1]
    return cv


def earth_surface(lon, lat, x, y, clouds, cloud_t=0.64):
    ocean = ['262b44', '124e89', '124e89', '0099db']
    land_green = ['193c3e', '265c42', '3e8948', '63c74d']
    desert = ['733e39', 'b86f50', 'e4a672', 'ead4aa']
    ice = ['8b9bb4', 'c0cbdc', 'ffffff', 'ffffff']
    if clouds(lon, lat) > cloud_t:
        return ['8b9bb4', 'c0cbdc', 'ffffff', 'ffffff']
    if abs(lat) > 80:
        return ice
    for (a, b) in zip(NILE, NILE[1:]):
        # distance to Nile segment in degrees
        ax, ay = a; bx, by = b
        t = max(0, min(1, ((lon - ax) * (bx - ax) + (lat - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
        if math.hypot(lon - (ax + t * (bx - ax)), lat - (ay + t * (by - ay))) < 0.9:
            return ['124e89', '3e8948', '63c74d', '63c74d']
    if inpoly(lon, lat, DELTA_FAN):
        return land_green
    if inpoly(lon, lat, AFRICA) or inpoly(lon, lat, ARABIA) or inpoly(lon, lat, MADAGASCAR):
        if 15 < lat < 33 or (lon > 36 and lat > 12) or (-30 < lat < -17 and lon < 22):
            return desert
        if 10 < lat <= 15:
            return ['733e39', 'b86f50', '3e8948', 'e4a672']
        return land_green
    if inpoly(lon, lat, EUROPE):
        return land_green
    return ocean


def make_earth(size, lon0=22, lat0=12, cloud_t=0.64):
    n = noise2(256, 128, 6, 11, 4)

    def clouds(lon, lat):
        u = int(((lon + 180) % 360) / 360 * 255)
        v = int((90 - lat) / 180 * 127)
        band = 0.06 * math.cos(math.radians(lat * 3))
        return n[v, u] + band
    cv = sphere(size, lambda lo, la, x, y: earth_surface(lo, la, x, y, clouds, cloud_t), lon0, lat0, atmos=('2ce8f5', '0099db'))
    return cv


def make_moon(size):
    craters = [(-20, -70, 9), (30, -62, 7), (0, -80, 6), (60, -50, 8), (-50, -45, 10), (-10, -30, 12), (40, -15, 9),
               (-35, 10, 14), (15, 20, 8), (45, 35, 11), (-15, 50, 9), (70, 5, 7), (-70, -10, 8), (5, -55, 5)]
    maria = noise2(128, 64, 4, 3, 3)

    def surf(lon, lat, x, y):
        base = ['3a4466', '5a6988', '8b9bb4', 'c0cbdc', 'ffffff']
        u = int(((lon + 180) % 360) / 360 * 127); v = int((90 - lat) / 180 * 63)
        if maria[v, u] > 0.6:
            base = ['262b44', '3a4466', '5a6988', '8b9bb4']
        for (clo, cla, cr) in craters:
            d = math.hypot((lon - clo) * math.cos(math.radians(lat)), lat - cla)
            if d < cr:
                if lat < -50 and d < cr * 0.8:
                    return ['181425', '262b44', '262b44', '3a4466']   # permanently shadowed polar craters
                return ['262b44', '3a4466', '5a6988', '8b9bb4'] if d < cr * 0.75 else ['5a6988', '8b9bb4', 'c0cbdc', 'ffffff']
        return base
    return sphere(size, surf, 0, -25)


def make_mars(size):
    n = noise2(160, 80, 5, 21, 4)

    def surf(lon, lat, x, y):
        if lat > 70:
            return ['8b9bb4', 'c0cbdc', 'ffffff', 'ffffff']
        if abs(lat + 8) < 2.2 and -70 < lon < 10:       # Valles Marineris
            return ['3e2731', '733e39', 'be4a2f']
        u = int(((lon + 180) % 360) / 360 * 159); v = int((90 - lat) / 180 * 79)
        if n[v, u] > 0.6:
            return ['3e2731', '733e39', 'b86f50', 'd77643']
        return ['733e39', 'be4a2f', 'd77643', 'e4a672']
    return sphere(size, surf, -40, 15, atmos=('f6757a', 'be4a2f'))


def make_sun(size):
    cv = Cv(size, size)
    c = size / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x + .5 - c, y + .5 - c) / (c - 1)
            if d <= 0.62:
                cv.c[y, x] = ramp(['f77622', 'feae34', 'fee761', 'ffffff'], 1 - d * 1.1 - 0.08 * ((x - c) + (y - c)) / c, x, y)
            elif d <= 1.0:
                g = (1 - d) / 0.38
                if g > BAYER[y % 4, x % 4] * 1.2:
                    cv.c[y, x] = 'feae34' if g > 0.6 else ('f77622' if g > 0.3 else 'be4a2f')
    return cv


# ------------------------------------------------------------------ rockets
def rocket(w, h, body_w, boosters=False, stripe='0099db', fairing_w=None):
    cv = Cv(w, h)
    cx = w / 2
    fw = fairing_w or body_w
    nose = max(6, int(fw * 1.3))
    fins_h = max(5, h // 9)
    top = 1

    def column_shade(x0, x1, y0, y1, cols=('ffffff', 'c0cbdc', '8b9bb4')):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                t = (x - x0 + .5) / (x1 - x0 + 1)
                cv.px(x, y, cols[0] if t < 0.45 else cols[1] if t < 0.8 else cols[2])
    # fairing + nose cone
    fx0, fx1 = int(cx - fw / 2), int(cx + fw / 2) - 1
    for y in range(top, top + nose):
        k = (y - top + 1) / nose
        half = max(0.5, fw / 2 * math.sqrt(k))
        column_shade(int(round(cx - half)), int(round(cx + half)) - 1, y, y)
    fair_end = top + nose + max(4, h // 7)
    column_shade(fx0, fx1, top + nose, fair_end)
    # body
    bx0, bx1 = int(cx - body_w / 2), int(cx + body_w / 2) - 1
    column_shade(bx0, bx1, fair_end + 1, h - 3)
    # stage seam + stripes + flag-free markings
    for yy in (fair_end + 1, int(h * 0.55)):
        cv.rect(bx0, yy, bx1, yy, '8b9bb4')
    cv.rect(bx0, int(h * 0.30), bx1, int(h * 0.30) + 1, stripe)
    cv.rect(bx0, h - 10, bx1, h - 9, stripe)
    # windows / logo dot
    cv.px(int(cx) - 1, fair_end - 3, '3a4466')
    # fins
    for side in (-1, 1):
        x_edge = bx0 - 1 if side < 0 else bx1 + 1
        for i in range(fins_h):
            for j in range(1 + i * 2 // fins_h + (1 if i > fins_h // 2 else 0)):
                cv.px(x_edge + side * j, h - 3 - fins_h + i, '5a6988' if side > 0 else '8b9bb4')
    # engine bell
    cv.rect(int(cx) - max(1, body_w // 4), h - 2, int(cx) + max(1, body_w // 4) - 1, h - 1, '3a4466')
    if boosters:
        for side in (-1, 1):
            b0 = bx0 - 7 if side < 0 else bx1 + 2
            for y in range(int(h * 0.42), h - 2):
                for x in range(b0, b0 + 6):
                    t = (x - b0 + .5) / 6
                    cv.px(x, y, 'ffffff' if t < 0.45 else 'c0cbdc' if t < 0.8 else '8b9bb4')
            for y in range(int(h * 0.42) - 5, int(h * 0.42)):
                k = (y - (int(h * 0.42) - 5) + 1) / 5
                half = 3 * math.sqrt(k)
                for x in range(int(round(b0 + 3 - half)), int(round(b0 + 3 + half))):
                    cv.px(x, y, 'ffffff' if x < b0 + 3 else 'c0cbdc')
            cv.rect(b0, h - 12, b0 + 5, h - 11, 'feae34')
            cv.rect(b0 + 1, h - 2, b0 + 4, h - 1, '3a4466')
    cv.outline()
    return cv


# ------------------------------------------------------------------ fx strips
def flame_strip():
    cv = Cv(64, 24)
    for f in range(4):
        for y in range(24):
            for x in range(16):
                cx = 8 + math.sin(f * 1.7 + y * 0.5) * (y / 24) * 1.5
                half = 7.5 * (1 - y / 26) ** 0.7 * (0.9 + 0.12 * math.sin(f * 2.1 + y))
                d = abs(x + .5 - cx) / max(half, 0.1)
                if d <= 1 and y < 22 - (f % 2) * 2 + (x % 3 == 0):
                    v = (1 - d) * (1 - y / 30)
                    cv.px(f * 16 + x, y, ramp(['be4a2f', 'f77622', 'feae34', 'fee761', 'ffffff'], v * 1.2, x, y))
    return cv


def smoke_strip():
    cv = Cv(192, 32)
    for f in range(6):
        r = 5 + f * 2.2
        blobs = [(16, 18, r), (16 - r * 0.5, 20, r * 0.7), (16 + r * 0.5, 19, r * 0.75), (16, 14 - f * 0.5, r * 0.65)]
        for y in range(32):
            for x in range(32):
                inside = [b for b in blobs if math.hypot(x + .5 - b[0], y + .5 - b[1]) <= b[2]]
                if inside and (f < 4 or (x + y + f) % 5 != 0):
                    lit = 1 - (y / 32) - 0.1 * ((x - 16) / 16)
                    cv.px(f * 32 + x, y, ramp(['5a6988', '8b9bb4', 'c0cbdc', 'ffffff'], lit - f * 0.07, x, y))
    return cv


def explosion_strip():
    cv = Cv(512, 64)
    for f in range(8):
        R = 6 + f * 4.2
        core = max(0, R * (1 - f / 6))
        r2 = np.random.default_rng(f)
        spikes = r2.random(12) * 0.5 + 0.75
        for y in range(64):
            for x in range(64):
                dx, dy = x + .5 - 32, y + .5 - 32
                ang = (math.atan2(dy, dx) + math.pi) / (2 * math.pi) * 12
                k = spikes[int(ang) % 12]
                d = math.hypot(dx, dy) / (R * k)
                if d <= 1:
                    if f >= 6 and (x + y) % 2:
                        continue
                    if f >= 5:
                        col = ramp(['3a4466', '5a6988', '8b9bb4'], 1 - d, x, y)
                    else:
                        col = ramp(['be4a2f', 'f77622', 'feae34', 'fee761', 'ffffff'], (1 - d) * 1.3 - f * 0.08, x, y)
                    cv.px(f * 64 + x, y, col)
        if 1 <= f <= 5:    # flying debris bits
            for i in range(8):
                a = i * math.pi / 4 + f * 0.2
                cv.px(f * 64 + 32 + math.cos(a) * (R + 4), 32 + math.sin(a) * (R + 4), '8b9bb4')
    return cv


# ------------------------------------------------------------------ spacecraft parts
def foil_box(s, foil=True):
    cv = Cv(s, s)
    for y in range(1, s - 1):
        for x in range(1, s - 1):
            t = (x + y) / (2 * s)
            if foil:
                n = (x * 7 + y * 13 + (x * y) % 5) % 9
                col = 'fee761' if (n == 0 and t < 0.5) else ('f77622' if n == 4 or t > 0.72 else 'feae34')
            else:
                col = 'c0cbdc' if t < 0.5 else '8b9bb4'
            cv.px(x, y, col)
    # radiator panel + edge highlight
    cv.rect(2, 2, s - 3, 2, 'fee761' if foil else 'ffffff')
    if s >= 32:
        cv.rect(s // 4, s // 3, s - s // 4, s - s // 3, 'c0cbdc')
        for yy in range(s // 3 + 1, s - s // 3, 2):
            cv.rect(s // 4 + 1, yy, s - s // 4 - 1, yy, '8b9bb4')
    cv.outline()
    # crop back inside canvas (outline sits on the edge pixels)
    return cv


def panel(gaas=False):
    cv = Cv(16, 24)
    base, dark, glint = ('262b44', '181425', 'b55088') if gaas else ('124e89', '193c3e', '0099db')
    for y in range(1, 23):
        for x in range(1, 15):
            cv.px(x, y, base)
    for x in range(1, 15):
        for y in (8, 15):
            cv.px(x, y, 'c0cbdc')
    for y in range(1, 23):
        cv.px(8, y, '8b9bb4')
    for (x, y) in ((2, 2), (3, 3), (10, 9), (11, 10), (3, 16), (4, 17)):
        cv.px(x, y, glint)
    if gaas:
        cv.px(12, 4, '68386c'); cv.px(5, 11, '68386c')
    cv.rect(0, 0, 15, 0, OUT); cv.rect(0, 23, 15, 23, OUT); cv.rect(0, 0, 0, 23, OUT); cv.rect(15, 0, 15, 23, OUT)
    return cv


def small_parts():
    rtg = Cv(8, 16)
    for y in range(2, 15):
        for x in range(2, 6):
            rtg.px(x, y, '8b9bb4' if x > 3 else 'c0cbdc')
    for y in range(3, 14, 2):
        rtg.px(1, y, '5a6988'); rtg.px(6, y, '5a6988')
    rtg.px(3, 1, 'f77622')
    rtg.outline()
    hga = Cv(24, 24)
    hga.ellipse(12, 10, 10.5, 6, 'ffffff')
    hga.ellipse(12.5, 10.5, 8, 4, 'c0cbdc')
    hga.ellipse(13, 11, 4, 2, '8b9bb4')
    hga.line(12, 11, 12, 21, '8b9bb4')
    hga.rect(10, 21, 14, 22, '5a6988')
    hga.px(12, 9, '3a4466')
    hga.outline()
    lga = Cv(8, 8)
    lga.rect(3, 1, 4, 5, 'c0cbdc'); lga.px(4, 1, '8b9bb4'); lga.rect(2, 6, 5, 6, '5a6988'); lga.px(3, 0, 'e43b44')
    lga.outline()
    thr = Cv(8, 8)
    thr.rect(3, 0, 4, 1, '8b9bb4')
    for y, (a, b) in enumerate([(2, 5), (2, 5), (1, 6), (1, 6), (0, 7)]):
        for x in range(a, b + 1):
            thr.px(x, 2 + y, '5a6988' if x > 3 else '8b9bb4')
    thr.px(3, 6, '3a4466'); thr.px(4, 6, '3a4466')
    mk = Cv(8, 8)
    mk.rect(3, 3, 4, 4, 'feae34'); mk.rect(0, 3, 2, 4, '0099db'); mk.rect(5, 3, 7, 4, '0099db'); mk.px(3, 2, 'ffffff')
    return rtg, hga, lga, thr, mk


def satellite(scale=1, foil=True, arrays='124e89', dish=True):
    """small generic spacecraft sprite for illustrations (about 26x14 at scale 1)."""
    cv = Cv(30, 18)
    for y in range(5, 13):
        for x in range(11, 19):
            cv.px(x, y, 'feae34' if foil and (x + y) % 5 else ('f77622' if foil else 'c0cbdc'))
    cv.rect(11, 5, 18, 5, 'fee761')
    for side in (0, 1):
        x0 = 1 if side == 0 else 20
        cv.rect(x0, 7, x0 + 8, 10, arrays)
        for x in range(x0, x0 + 9, 3):
            cv.rect(x, 7, x, 10, '0099db' if arrays == '124e89' else '68386c')
        cv.rect(9 if side == 0 else 19, 8, 10 if side == 0 else 19, 9, '8b9bb4')
    if dish:
        cv.ellipse(15, 3, 4, 1.6, 'ffffff'); cv.px(15, 4, '8b9bb4')
    cv.outline()
    if scale == 1:
        return cv
    big = Cv(cv.w * scale, cv.h * scale)
    for y in range(cv.h):
        for x in range(cv.w):
            if cv.c[y, x]:
                big.rect(x * scale, y * scale, x * scale + scale - 1, y * scale + scale - 1, cv.c[y, x])
    return big


# ------------------------------------------------------------------ pixel font (5x7) for the logo
FONT = {
    'D': ["1110 ", "1001 ", "1001 ", "1001 ", "1001 ", "1001 ", "1110 "],
    'E': ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    'L': ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    'T': ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    'A': ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    'V': ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
    'Y': ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    'C': ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    'O': ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    'N': ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    '-': ["00000", "00000", "00000", "11110", "00000", "00000", "00000"],
    ' ': ["000", "000", "000", "000", "000", "000", "000"],
}


def text_mask(s, scale):
    w = sum((len(FONT[ch][0].rstrip()) if ch != ' ' else 3) * scale + scale for ch in s) - scale
    m = np.zeros((7 * scale, w), dtype=bool)
    x = 0
    for ch in s:
        g = FONT[ch]
        gw = len(g[0].rstrip()) if ch != ' ' else 3
        for r, row in enumerate(g):
            for c, v in enumerate(row[:gw]):
                if v == '1':
                    m[r * scale:(r + 1) * scale, x + c * scale:x + (c + 1) * scale] = True
        x += gw * scale + scale
    return m


def draw_text(cv, s, scale, x0, y0, cols, depth=2, depth_col='a22633'):
    m = text_mask(s, scale)
    h, w = m.shape
    for d in range(depth, 0, -1):           # extruded shadow, light from top-left
        for y in range(h):
            for x in range(w):
                if m[y, x]:
                    cv.px(x0 + x + d, y0 + y + d, depth_col)
    for y in range(h):
        for x in range(w):
            if m[y, x]:
                cv.px(x0 + x, y0 + y, ramp(cols, 1 - y / h, x, y))
    for y in range(h):                       # top highlight row per glyph
        for x in range(w):
            if m[y, x] and (y == 0 or not m[y - 1, x]):
                cv.px(x0 + x, y0 + y, 'ffffff')
    return w, h


def make_logo():
    cv = Cv(256, 64)
    w1, h1 = draw_text(cv, 'DELTA-V', 4, 0, 0, ['f77622', 'feae34', 'fee761'], depth=3, depth_col='a22633')
    off = (w1 - text_mask('TYCOON', 3).shape[1]) // 2
    draw_text(cv, 'TYCOON', 3, off, 34, ['0099db', '2ce8f5', 'ffffff'], depth=2, depth_col='124e89')
    # little rocket on the right
    r = rocket(12, 40, 6, stripe='e43b44')
    cv.blit(r, w1 + 18, 6)
    for i, y in enumerate(range(46, 60)):
        for x in range(w1 + 21, w1 + 27):
            if (x + y) % (2 + i // 4) == 0:
                cv.px(x, y, ['fee761', 'feae34', 'f77622', 'be4a2f'][min(3, i // 4)])
    cv.outline()
    # centre the whole logo horizontally
    m = cv.mask()
    xs = np.where(m.any(0))[0]
    shift = (256 - (xs.max() - xs.min() + 1)) // 2 - xs.min()
    out = Cv(256, 64)
    out.blit(cv, shift, 0)
    return out


# ------------------------------------------------------------------ backgrounds
def sky_gradient(cv, y0, y1, cols):
    for y in range(y0, y1 + 1):
        for x in range(cv.w):
            cv.c[y, x] = ramp(cols, (y - y0) / max(1, y1 - y0), x, y)


def make_space_tile():
    cv = Cv(64, 64, '181425')
    r = np.random.default_rng(5)
    for _ in range(26):
        x, y = r.integers(0, 64), r.integers(0, 64)
        cv.px(x, y, ['ffffff', 'c0cbdc', '8b9bb4', '5a6988', '5a6988'][r.integers(0, 5)])
    cv.px(20, 40, '2ce8f5'); cv.px(50, 12, 'fee761')
    return cv


def make_bg_title():
    cv = Cv(480, 270, '181425')
    neb = noise2(480, 270, 3, 2, 4)
    for y in range(270):
        for x in range(480):
            v = neb[y, x]
            if v > 0.62:
                cv.c[y, x] = ramp(['181425', '262b44', '68386c'], (v - 0.62) * 4, x, y)
            elif v < 0.33:
                cv.c[y, x] = ramp(['181425', '193c3e'], (0.33 - v) * 3, x, y)
    starfield(cv, 520, 3)
    # Earth limb across the bottom: a big rendered sphere (Africa + Nile), only its top shows
    e = make_earth(420, 22, -38, cloud_t=0.70)
    for y in range(e.h):
        for x in range(e.w):
            if e.c[y, x]:
                cv.px(x + 60, y + 168, e.c[y, x])
    for y in range(150, 270):                         # thin atmosphere glow above the limb
        for x in range(480):
            d = math.hypot(x - 270, y - 378) - 209
            if 0 < d <= 4 and d / 4 < BAYER[y % 4, x % 4] and not cv.c[y, x] in ('ffffff',):
                cv.px(x, y, '0099db' if d < 2 else '124e89')
    # city lights on the night side (right)
    r = np.random.default_rng(9)
    for _ in range(50):
        x = int(r.integers(400, 480)); y = int(r.integers(215, 270))
        if math.hypot(x - 270, y - 378) < 205:
            cv.px(x, y, 'fee761')
    # rocket climbing with exhaust trail (right of centre, logo space top-left stays clear)
    rk = rocket(12, 40, 6)
    trail = [(380 - i * 0.35, 170 + i) for i in range(70)]
    for i, (x, y) in enumerate(trail):
        w = 1 + i // 18
        for dx in range(-w, w + 1):
            if (int(x) + dx + int(y)) % (1 + i // 25) == 0:
                cv.px(x + dx, y, ['ffffff', 'c0cbdc', '8b9bb4', '5a6988'][min(3, i // 18)])
    cv.blit(rk, 374, 128)
    for i in range(10):
        for dx in range(-2, 2):
            cv.px(380 + dx, 168 + i, ['ffffff', 'fee761', 'feae34', 'f77622', 'be4a2f'][min(4, i // 2)])
    # the Moon, small, top right
    m = make_moon(28)
    cv.blit(m, 420, 22)
    return cv


def make_bg_launch_pad():
    cv = Cv(480, 270)
    sky_gradient(cv, 0, 190, ['262b44', '3a4466', '68386c', 'b55088', 'f6757a', 'feae34'])
    starfield(cv, 90, 4, region=(0, 0, 479, 70), colours=('c0cbdc', '8b9bb4', '5a6988'))
    # rising sun at the horizon (left), sea on the left, desert on the right
    for y in range(160, 196):
        for x in range(40, 120):
            d = math.hypot(x - 80, y - 196) / 34
            if d <= 1:
                cv.c[y, x] = ramp(['feae34', 'fee761', 'ffffff'], 1 - d, x, y)
    for y in range(190, 270):
        for x in range(0, 480):
            shore = 150 + 18 * math.sin(y * 0.06) + (y - 190) * 0.9
            if x < shore:
                v = 0.7 - (y - 190) / 120 + (0.25 if (x + y * 3) % 23 == 0 else 0)
                cv.c[y, x] = ramp(['193c3e', '124e89', '0099db', 'f6757a'], v, x, y)
            else:
                v = 0.85 - (y - 190) / 150 - (x - shore) / 900
                cv.c[y, x] = ramp(['733e39', 'b86f50', 'e4a672', 'ead4aa'], v, x, y)
    # distant dunes
    for x in range(160, 480):
        h = int(8 + 6 * math.sin(x * 0.03) + 4 * math.sin(x * 0.11))
        for y in range(190 - h, 191):
            cv.c[y, x] = ramp(['733e39', 'b86f50', 'd77643'], 0.6 - (190 - y) / 30, x, y)
    # concrete pad + flame trench (rocket stands at x=240, pad top y=210)
    cv.rect(196, 210, 300, 214, '8b9bb4')
    cv.rect(196, 210, 300, 210, 'c0cbdc')
    cv.rect(196, 215, 300, 222, '5a6988')
    cv.rect(226, 215, 254, 222, '262b44')
    # launch tower (right of centre) with lattice + arms
    tx0, tx1 = 262, 276
    cv.rect(tx0, 92, tx1, 209, '3a4466')
    for y in range(92, 210, 6):
        cv.line(tx0, y, tx1, y + 6, 'be4a2f')
        cv.line(tx1, y, tx0, y + 6, 'be4a2f')
        cv.rect(tx0, y, tx1, y, 'a22633')
    cv.rect(tx0, 92, tx0, 209, 'd77643')
    for ay in (120, 160, 190):
        cv.rect(250, ay, tx0, ay + 1, '5a6988')
    cv.rect(tx0 - 2, 88, tx1 + 2, 91, '5a6988')
    cv.px(269, 86, 'e43b44'); cv.px(269, 87, 'e43b44')
    # lightning-protection masts + small service building
    for mx in (186, 318):
        cv.line(mx, 120, mx, 209, '5a6988')
        cv.px(mx, 119, 'e43b44')
    cv.rect(330, 188, 372, 209, 'c0cbdc'); cv.rect(330, 188, 372, 189, 'ffffff')
    for wx in range(334, 370, 8):
        cv.rect(wx, 194, wx + 4, 198, '0099db')
    cv.rect(352, 200, 358, 209, '5a6988')
    return cv


def make_bg_mission_control():
    cv = Cv(480, 270, '181425')
    sky_gradient(cv, 0, 180, ['262b44', '262b44', '3a4466'])
    # big wall screen with world map + ground track
    cv.rect(70, 20, 410, 130, '181425')
    cv.rect(72, 22, 408, 128, '193c3e')
    for y in range(24, 127):
        for x in range(74, 407):
            lon = (x - 74) / 333 * 360 - 180
            lat = 90 - (y - 24) / 103 * 180
            land = inpoly(lon, lat, AFRICA) or inpoly(lon, lat, ARABIA) or inpoly(lon, lat, EUROPE) or inpoly(lon, lat, MADAGASCAR)
            if land:
                cv.c[y, x] = '3e8948' if (x + y) % 2 else '265c42'
            elif (x - 74) % 28 == 0 or (y - 24) % 26 == 0:
                cv.c[y, x] = '124e89'
    for x in range(74, 407):                 # sinusoidal ground track
        y = 75 - 32 * math.sin((x - 74) / 333 * 2 * math.pi * 1.5)
        cv.px(x, y, 'feae34')
        cv.px(x, y + 1, 'f77622')
    cv.rect(300, 60, 302, 62, 'ffffff')
    # side screens
    for sx in (12, 420):
        cv.rect(sx, 30, sx + 48, 100, '181425')
        cv.rect(sx + 2, 32, sx + 46, 98, '262b44')
        for i in range(6):
            cv.rect(sx + 5, 38 + i * 10, sx + 5 + (13 * (i + 2) % 38), 41 + i * 10, ['63c74d', '2ce8f5', 'feae34'][i % 3])
    # console rows (lower part calm for UI)
    for row, (y0, h) in enumerate(((150, 20), (182, 26))):
        cv.rect(0, y0, 479, y0 + h, '3a4466')
        cv.rect(0, y0, 479, y0 + 1, '5a6988')
        for x in range(10 + row * 18, 470, 46):
            cv.rect(x, y0 - 12, x + 30, y0 - 1, '181425')
            cv.rect(x + 2, y0 - 10, x + 28, y0 - 3, '124e89' if (x // 46) % 3 else '193c3e')
            cv.rect(x + 4, y0 - 8, x + 4 + (x * 7) % 20, y0 - 7, '2ce8f5')
            cv.px(x + 6, y0 + 5, ['e43b44', '63c74d', 'feae34'][(x // 46) % 3])
    cv.rect(0, 210, 479, 269, '262b44')
    for x in range(0, 480, 24):
        cv.rect(x, 210, x, 269, '3a4466')
    return cv


def make_bg_clean_room():
    cv = Cv(480, 270)
    sky_gradient(cv, 0, 200, ['c0cbdc', 'ffffff', 'c0cbdc'])
    for x in range(0, 480, 40):              # wall panels
        cv.rect(x, 0, x, 200, '8b9bb4')
    cv.rect(0, 30, 479, 31, '8b9bb4')
    for x in range(20, 480, 80):              # ceiling lights
        cv.rect(x, 4, x + 40, 8, 'ffffff')
        cv.rect(x, 9, x + 40, 9, '8b9bb4')
    # floor grid in perspective
    for y in range(200, 270):
        for x in range(480):
            cv.c[y, x] = '8b9bb4' if (y - 200) % (6 + (y - 200) // 8) == 0 else 'c0cbdc'
    for i in range(-12, 13):
        cv.line(240 + i * 8, 200, 240 + i * 40, 269, '8b9bb4')
    # side equipment: cart + crane hook + test stand (centre stays empty)
    cv.rect(24, 140, 110, 200, '5a6988'); cv.rect(24, 140, 110, 142, '8b9bb4')
    for i in range(4):
        cv.rect(32 + i * 20, 150, 46 + i * 20, 168, '3a4466'); cv.px(38 + i * 20, 155, '63c74d')
    cv.rect(380, 40, 384, 150, '3a4466'); cv.rect(360, 40, 470, 44, 'feae34')
    cv.line(400, 44, 400, 110, '5a6988'); cv.rect(394, 110, 406, 114, 'f77622')
    cv.rect(400, 170, 460, 200, '124e89'); cv.rect(400, 170, 460, 172, '0099db')
    # floor safety lines
    cv.rect(150, 250, 330, 251, 'feae34')
    for x in range(150, 330, 10):
        cv.rect(x, 250, x + 4, 251, '181425')
    return cv


# ------------------------------------------------------------------ illustrations
def frame(cv):
    cv.rect(0, 0, cv.w - 1, 0, OUT); cv.rect(0, cv.h - 1, cv.w - 1, cv.h - 1, OUT)
    cv.rect(0, 0, 0, cv.h - 1, OUT); cv.rect(cv.w - 1, 0, cv.w - 1, cv.h - 1, OUT)


def space(w, h, seed):
    cv = Cv(w, h, '181425')
    starfield(cv, w * h // 70, seed)
    return cv


def warn_badge(cv, x, y, col='e43b44'):
    cv.disc(x, y, 6, col); cv.ring(x, y, 6, OUT)
    cv.rect(int(x) - 1, int(y) - 4, int(x), int(y) + 1, 'ffffff'); cv.rect(int(x) - 1, int(y) + 3, int(x), int(y) + 4, 'ffffff')


def ev_solar_storm():
    cv = space(96, 64, 31)
    s = make_sun(56); cv.blit(s, -14, -6)
    for i, (x, y) in enumerate([(40, 22), (48, 26), (56, 30), (63, 33), (70, 36)]):
        for k in range(3):
            cv.px(x + k, y + (i % 2), ['feae34', 'f77622', 'fee761'][k])
    for i in range(14):
        a = 0.2 + i * 0.09
        cv.px(28 + math.cos(a) * (22 + i * 3), 22 + math.sin(a) * (22 + i * 2), 'fee761' if i % 2 else '2ce8f5')
    cv.blit(satellite(), 62, 38)
    frame(cv); return cv


def ev_micrometeoroid():
    cv = space(96, 64, 32)
    p = panel(); big = Cv(48, 40)
    for y in range(24):
        for x in range(16):
            if p.c[y, x]:
                for dy in range(2):
                    for dx in range(3):
                        big.px(x * 3 + dx, y * 2 + dy - 4, p.c[y, x])
    cv.blit(big, 30, 18)
    cv.line(4, 4, 46, 34, 'c0cbdc'); cv.line(4, 5, 45, 35, '5a6988')
    cv.disc(48, 36, 3, 'ffffff'); cv.ring(48, 36, 6, 'fee761'); cv.ring(48, 36, 8, 'f77622')
    for (dx, dy) in ((52, 30), (55, 38), (44, 42), (50, 44)):
        cv.line(48, 36, dx, dy, '181425')
    frame(cv); return cv


def ev_ground_outage():
    cv = Cv(96, 64)
    sky_gradient(cv, 0, 63, ['181425', '262b44', '3a4466'])
    for (cx, cy, r) in ((24, 12, 12), (44, 9, 13), (64, 13, 12), (80, 10, 9)):
        cv.disc(cx, cy, r, '5a6988'); cv.disc(cx - 2, cy - 2, r - 3, '8b9bb4')
    for i in range(40):
        x = (i * 37) % 96; y = 22 + (i * 13) % 34
        cv.line(x, y, x - 2, y + 4, '0099db')
    cv.line(52, 20, 46, 32, 'fee761'); cv.line(46, 32, 52, 32, 'fee761'); cv.line(52, 32, 44, 46, 'fee761')
    cv.rect(0, 56, 95, 63, '265c42')
    cv.ellipse(30, 38, 13, 7, 'ffffff'); cv.ellipse(31, 39, 10, 5, 'c0cbdc')
    cv.line(30, 44, 30, 55, '8b9bb4'); cv.rect(24, 54, 36, 56, '5a6988')
    warn_badge(cv, 76, 40)
    frame(cv); return cv


def ev_wheel_failure():
    cv = space(96, 64, 34)
    cx, cy = 40, 33
    cv.disc(cx, cy, 20, '3a4466'); cv.disc(cx, cy, 18, '5a6988'); cv.disc(cx, cy, 14, '3a4466')
    cv.disc(cx - 2, cy - 2, 6, '8b9bb4'); cv.disc(cx, cy, 4, 'c0cbdc')
    for k in range(6):
        a = k * math.pi / 3
        cv.line(cx + math.cos(a) * 5, cy + math.sin(a) * 5, cx + math.cos(a) * 13, cy + math.sin(a) * 13, '8b9bb4')
    for (x, y) in ((58, 18), (62, 22), (60, 14), (64, 26)):
        cv.px(x, y, 'fee761'); cv.px(x + 1, y, 'f77622')
    cv.line(66, 20, 84, 44, 'e43b44', 2); cv.line(84, 20, 66, 44, 'e43b44', 2)
    frame(cv); return cv


def ev_budget_cut():
    cv = Cv(96, 64)
    sky_gradient(cv, 0, 63, ['262b44', '3a4466'])
    for i in range(5):
        y = 50 - i * 5
        cv.ellipse(30, y, 12, 3.5, 'f77622'); cv.ellipse(30, y - 1, 12, 3.5, 'feae34'); cv.ellipse(28, y - 2, 6, 1.4, 'fee761')
    cv.line(52, 14, 80, 48, 'e43b44', 3)
    cv.poly([(80, 52), (86, 40), (72, 46)], 'e43b44')
    cv.rect(60, 8, 88, 16, '181425')
    for x, ch in zip(range(62, 88, 6), '-10%'):
        pass
    cv.rect(62, 10, 86, 14, 'e43b44')
    cv.rect(64, 11, 84, 13, 'ffffff')
    frame(cv); return cv


def ev_computer_reset():
    cv = Cv(96, 64, '193c3e')
    for x in range(0, 96, 8):
        cv.rect(x, 0, x, 63, '265c42')
    for y in range(0, 64, 8):
        cv.rect(0, y, 95, y, '265c42')
    cv.rect(30, 16, 66, 48, '262b44'); cv.rect(32, 18, 64, 46, '3a4466'); cv.rect(38, 24, 58, 40, '181425')
    for i in range(6):
        for side in (0, 1):
            cv.rect(26 + side * 41, 20 + i * 5, 29 + side * 41, 21 + i * 5, 'feae34')
            cv.rect(34 + i * 5, 12 + side * 37, 35 + i * 5, 15 + side * 37, 'feae34')
    for i, b in enumerate('10110'):
        cv.rect(41 + i * 3, 30, 42 + i * 3, 34, '63c74d' if b == '1' else '2ce8f5')
    cv.rect(47, 30, 48, 34, 'e43b44')
    cv.line(76, 4, 70, 18, 'fee761', 2); cv.line(70, 18, 76, 18, 'fee761', 2); cv.line(76, 18, 66, 34, 'fee761', 2)
    frame(cv); return cv


def ev_debris():
    cv = space(96, 64, 36)
    e = make_earth(120, 30, 10)
    cv.blit(e, -20, 34)
    cv.blit(satellite(), 18, 12)
    for (x, y, s) in ((62, 16, 3), (70, 24, 2), (58, 28, 2), (76, 14, 1), (66, 34, 1)):
        cv.poly([(x, y), (x + s + 2, y + 1), (x + s, y + s + 2), (x - 1, y + s)], '8b9bb4')
        cv.px(x, y, 'c0cbdc')
    cv.ring(66, 22, 13, 'e43b44')
    cv.line(48, 20, 56, 20, 'feae34'); cv.px(54, 19, 'feae34'); cv.px(54, 21, 'feae34')
    frame(cv); return cv


def ev_discovery():
    cv = space(96, 64, 37)
    for y in range(64):
        for x in range(96):
            d = math.hypot((x - 60) / 1.6, y - 30)
            if d < 18 and cv.c[y, x] == '181425' and (18 - d) / 18 > BAYER[y % 4, x % 4] * 1.3:
                cv.c[y, x] = '68386c' if d > 9 else 'b55088'
    cv.disc(60, 30, 3, 'ffffff')
    for k in range(4):
        a = k * math.pi / 2
        cv.line(60, 30, 60 + math.cos(a) * 9, 30 + math.sin(a) * 9, 'fee761')
    cv.ring(60, 30, 14, '2ce8f5')
    cv.rect(10, 40, 30, 46, 'c0cbdc'); cv.line(20, 46, 20, 58, '8b9bb4'); cv.rect(14, 58, 26, 60, '5a6988')
    cv.line(28, 40, 46, 33, '2ce8f5')
    cv.rect(84, 6, 88, 18, 'feae34'); cv.rect(84, 21, 88, 25, 'feae34')
    frame(cv); return cv


def ev_dust_storm():
    cv = space(96, 64, 38)
    m = make_mars(84)
    cv.blit(m, 6, -10)
    for i in range(200):
        a = i * 0.29
        r = 8 + i * 0.13
        x, y = 48 + math.cos(a) * r * 1.4, 32 + math.sin(a) * r * 0.7
        if cv.get(int(x), int(y)) not in ('', '181425'):
            cv.px(x, y, ['e4a672', 'ead4aa', 'd77643'][i % 3])
    cv.blit(satellite(), 62, 44)
    frame(cv); return cv


def ev_battery_aging():
    cv = Cv(96, 64)
    sky_gradient(cv, 0, 63, ['262b44', '3a4466'])
    cv.rect(26, 14, 66, 52, '181425'); cv.rect(28, 16, 64, 50, '5a6988'); cv.rect(40, 10, 52, 13, '181425'); cv.rect(41, 11, 51, 13, '8b9bb4')
    cv.rect(30, 18, 62, 48, '262b44')
    cv.rect(32, 40, 60, 46, 'e43b44'); cv.rect(32, 40, 60, 40, 'f6757a')
    for y in (24, 32):
        cv.rect(32, y, 60, y + 6, '3a4466')
    cv.line(72, 18, 86, 46, 'e43b44', 2)
    cv.poly([(86, 50), (90, 40), (80, 44)], 'e43b44')
    frame(cv); return cv


def sc_nile_watch():
    cv = space(160, 90, 41)
    e = make_earth(240, 31, -12, cloud_t=0.74)
    cv.blit(e, -40, 22)
    for i in range(40):
        cv.px(60 + i * 2, 30 + i * 0.4, 'feae34' if i % 2 else '')
    cv.blit(satellite(), 112, 18)
    for y in range(28, 50):
        w = (y - 28) // 2
        for x in range(126 - w, 127 + w):
            if (x + y) % 3 == 0:
                cv.px(x, y, '2ce8f5')
    frame(cv); return cv


def sc_storm_watch():
    cv = space(160, 90, 42)
    e = make_earth(120, 20, 5)
    cv.blit(e, 20, -10)
    for i in range(260):
        a = i * 0.21
        r = 2 + i * 0.07
        cv.px(78 + math.cos(a) * r, 44 + math.sin(a) * r * 0.8, 'ffffff' if i % 3 else 'c0cbdc')
    for i in range(6):
        cv.line(66 + i * 5, 52, 63 + i * 5, 58, 'fee761')
    cv.blit(satellite(), 126, 30)
    cv.line(130, 46, 96, 44, '2ce8f5')
    frame(cv); return cv


def sc_ice_hunter():
    cv = space(160, 90, 43)
    m = make_moon(170)
    cv.blit(m, -5, 30)
    for (x, y) in ((52, 78), (82, 84), (110, 80)):
        cv.ellipse(x, y, 9, 3, '181425'); cv.ellipse(x - 1, y - 1, 5, 1.5, '2ce8f5')
    cv.blit(satellite(dish=False), 100, 10)
    for y in range(26, 60, 3):
        cv.px(114 - (y - 26) * 0.5, y, 'c0cbdc')
    frame(cv); return cv


def sc_red_relay():
    cv = space(160, 90, 44)
    m = make_mars(160)
    cv.blit(m, -10, 36)
    cv.blit(satellite(), 94, 8)
    cv.rect(56, 64, 66, 70, 'c0cbdc'); cv.rect(55, 70, 57, 72, '3a4466'); cv.rect(64, 70, 66, 72, '3a4466'); cv.line(58, 64, 58, 59, '8b9bb4')
    for i in range(12):
        t = i / 11
        cv.px(60 + (108 - 60) * t, 58 - (58 - 24) * t, '63c74d')
    for i in range(10):
        cv.px(116 + i * 4, 18 - i * 1.6, '2ce8f5')
    frame(cv); return cv


def sc_first_light():
    cv = space(160, 90, 45)
    for (gx, gy, s, c) in ((30, 20, 8, 'b55088'), (130, 66, 10, '68386c'), (120, 18, 5, '0099db')):
        for y in range(90):
            for x in range(160):
                d = math.hypot((x - gx) / 1.8, y - gy)
                if d < s and (s - d) / s > BAYER[y % 4, x % 4]:
                    cv.c[y, x] = c
        cv.px(gx, gy, 'ffffff')
    # gold hexagonal mirror + sunshield
    cv.poly([(40, 72), (120, 72), (136, 84), (24, 84)], 'b55088')
    cv.poly([(42, 72), (118, 72), (128, 78), (32, 78)], 'f6757a')
    hexes = [(0, 0), (1, 0), (-1, 0), (0.5, -0.87), (-0.5, -0.87), (0.5, 0.87), (-0.5, 0.87),
             (1.5, -0.87), (-1.5, -0.87), (1.5, 0.87), (-1.5, 0.87), (0, -1.74), (0, 1.74)]
    for (hx, hy) in hexes:
        cx, cy = 80 + hx * 11, 42 + hy * 11
        pts = [(cx + 6 * math.cos(a), cy + 6 * math.sin(a)) for a in [k * math.pi / 3 + math.pi / 6 for k in range(6)]]
        cv.poly(pts, 'feae34')
        cv.px(cx - 2, cy - 2, 'fee761'); cv.px(cx + 2, cy + 2, 'f77622')
    cv.line(80, 42, 80, 22, '8b9bb4'); cv.disc(80, 21, 2, 'c0cbdc')
    cv.line(80, 62, 80, 72, '8b9bb4')
    frame(cv); return cv


def sc_sandbox():
    cv = Cv(160, 90)
    sky_gradient(cv, 0, 89, ['181425', '262b44', '3a4466'])
    starfield(cv, 120, 46, region=(0, 0, 159, 60))
    for x in range(0, 160, 16):
        cv.rect(x, 70, x, 89, '5a6988')
    cv.rect(0, 70, 159, 70, '8b9bb4')
    parts = [(rocket(12, 40, 6), 22, 24), (satellite(), 62, 30)]
    for (o, x, y) in parts:
        cv.blit(o, x, y)
    m = make_mars(26); cv.blit(m, 120, 12)
    e = make_moon(18); cv.blit(e, 100, 46)
    for (x, y, c) in ((50, 56, 'feae34'), (110, 64, '2ce8f5'), (140, 54, '63c74d')):
        cv.rect(x, y, x + 6, y + 6, c); cv.rect(x, y, x + 6, y, 'ffffff')
    frame(cv); return cv


def make_favicon():
    cv = Cv(32, 32)
    cv.disc(16, 16, 15, '262b44')
    r = rocket(12, 26, 6, stripe='e43b44')
    cv.blit(r, 10, 1)
    for i in range(4):
        cv.px(15, 27 + i, ['fee761', 'feae34', 'f77622', 'be4a2f'][i]); cv.px(16, 27 + i, ['ffffff', 'fee761', 'feae34', 'f77622'][i])
    return cv


def make_og(title_img, logo_img):
    big = title_img.resize((1200, 675), Image.NEAREST).crop((0, 22, 1200, 652))
    big.alpha_composite(logo_img.resize((768, 192), Image.NEAREST), (60, 50))
    chars = ['nour', 'diaa', 'omar', 'amara', 'kwame']
    x = 80
    for cid in chars:
        p = ROOT / 'characters' / f'sprite_{cid}_suit.png'
        if p.exists():
            s = Image.open(p).convert('RGBA').crop((32, 0, 64, 48)).resize((128, 192), Image.NEAREST)
            big.alpha_composite(s, (x, 400))
            x += 140
    return big


def main():
    W = {}
    W['title'] = save(make_bg_title(), 'bg/bg_title.png', (480, 270))
    save(make_bg_launch_pad(), 'bg/bg_launch_pad.png', (480, 270))
    save(make_bg_mission_control(), 'bg/bg_mission_control.png', (480, 270))
    save(make_bg_clean_room(), 'bg/bg_clean_room.png', (480, 270))
    save(make_space_tile(), 'bg/bg_space_tile.png', (64, 64))
    save(make_earth(128), 'planets/planet_earth.png', (128, 128))
    save(make_moon(96), 'planets/planet_moon.png', (96, 96))
    save(make_mars(112), 'planets/planet_mars.png', (112, 112))
    save(make_sun(64), 'planets/planet_sun.png', (64, 64))
    save(rocket(16, 64, 8, stripe='0099db'), 'lv/lv_spark.png', (16, 64))
    save(rocket(24, 96, 10, stripe='e43b44', fairing_w=12), 'lv/lv_arrow.png', (24, 96))
    save(rocket(24, 128, 12, stripe='124e89', fairing_w=14), 'lv/lv_workhorse.png', (24, 128))
    save(rocket(48, 128, 14, boosters=True, stripe='feae34', fairing_w=16), 'lv/lv_titan.png', (48, 128))
    save(flame_strip(), 'fx/fx_flame.png', (64, 24))
    save(smoke_strip(), 'fx/fx_smoke.png', (192, 32))
    save(explosion_strip(), 'fx/fx_explosion.png', (512, 64))
    for s, n in ((16, 'bus_cube'), (32, 'bus_small'), (48, 'bus_medium'), (64, 'bus_large')):
        save(foil_box(s, foil=n != 'bus_cube'), f'sc/{n}.png', (s, s))
    save(panel(False), 'sc/sa_si_panel.png', (16, 24))
    save(panel(True), 'sc/sa_gaas_panel.png', (16, 24))
    rtg, hga, lga, thr, mk = small_parts()
    save(rtg, 'sc/rtg.png', (8, 16)); save(hga, 'sc/hga.png', (24, 24)); save(lga, 'sc/antenna_lga.png', (8, 8))
    save(thr, 'sc/thruster.png', (8, 8)); save(mk, 'sc/sc_marker.png', (8, 8))
    for name, fn in (('solar_storm', ev_solar_storm), ('micrometeoroid', ev_micrometeoroid), ('ground_outage', ev_ground_outage),
                     ('wheel_failure', ev_wheel_failure), ('budget_cut', ev_budget_cut), ('computer_reset', ev_computer_reset),
                     ('debris_conjunction', ev_debris), ('discovery', ev_discovery), ('dust_storm', ev_dust_storm),
                     ('battery_aging', ev_battery_aging)):
        save(fn(), f'events/ev_{name}.png', (96, 64))
    for name, fn in (('nile_watch', sc_nile_watch), ('storm_watch', sc_storm_watch), ('ice_hunter', sc_ice_hunter),
                     ('red_relay', sc_red_relay), ('first_light', sc_first_light), ('sandbox', sc_sandbox)):
        save(fn(), f'scenarios/sc_{name}.png', (160, 90))
    W['logo'] = save(make_logo(), 'ui/logo_deltav.png', (256, 64))
    save(make_favicon(), 'ui/favicon.png', (32, 32))
    og = make_og(W['title'], W['logo'])
    save(og, 'ui/og_image.png', (1200, 630))
    print('done')


if __name__ == '__main__':
    only = sys.argv[1:]
    if only:
        g = globals()
        for name in only:
            print(name)
    main()
