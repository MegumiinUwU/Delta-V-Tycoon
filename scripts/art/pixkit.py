"""Tiny pixel-art toolkit: palette, masks, canvas, outline. Everything is drawn on an
integer grid with ENDESGA 32 colours only (alpha 0 or 255)."""
from PIL import Image

ENDESGA32 = """be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633
e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e
124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466
262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569""".split()
PALETTE = {'#' + h for h in ENDESGA32}

OUT = '#181425'
WHITE, SUIT1, SUIT2 = '#ffffff', '#c0cbdc', '#8b9bb4'
GREY3, GREY4, NAVY_D, NAVY_DD = '#5a6988', '#3a4466', '#262b44', '#181425'
NAVY, BLUE, CYAN = '#124e89', '#0099db', '#2ce8f5'
GOLD, GOLD_HI, ORANGE, RUST = '#feae34', '#fee761', '#f77622', '#be4a2f'
GREEN, GREEN_D = '#63c74d', '#3e8948'
TEAL_D = '#193c3e'
BROWN1, BROWN2, BROWN3 = '#b86f50', '#733e39', '#3e2731'
SKIN_L, SKIN_LS = '#e8b796', '#c28569'
CREAM, TAN = '#ead4aa', '#e4a672'
RED_D = '#a22633'

# skin: base, shade, deep (mouth line / nostrils), highlight, lip
SKINS = {
    'light':  dict(base='#e8b796', shade='#c28569', deep='#b86f50', hi='#ead4aa', lip='#c28569'),
    'medium': dict(base='#c28569', shade='#b86f50', deep='#733e39', hi='#e8b796', lip='#b86f50'),
    'brown':  dict(base='#b86f50', shade='#733e39', deep='#3e2731', hi='#c28569', lip='#733e39'),
    'dark':   dict(base='#733e39', shade='#3e2731', deep='#3e2731', hi='#b86f50', lip='#3e2731'),
}

ROLE = {  # base, shade
    'planner': ('#feae34', '#f77622'),
    'engineer': ('#f77622', '#be4a2f'),
    'science': ('#63c74d', '#3e8948'),
    'comms': ('#2ce8f5', '#0099db'),
}


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = {}

    def inside(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def set(self, x, y, c):
        if self.inside(x, y):
            self.px[(x, y)] = c

    def get(self, x, y):
        return self.px.get((x, y))

    def fill(self, mask, c):
        for (x, y) in mask:
            self.set(x, y, c)

    def erase(self, mask):
        for p in mask:
            self.px.pop(p, None)

    def opaque(self):
        return set(self.px)

    def outline(self, color=OUT, protect=()):
        """1 px outline on every transparent pixel 4-adjacent to an opaque one."""
        solid = self.opaque()
        add = set()
        for (x, y) in solid:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q not in solid and self.inside(*q):
                    add.add(q)
        for q in add:
            if q not in protect:
                self.px[q] = color

    def blit(self, other, ox, oy):
        for (x, y), c in other.px.items():
            self.set(x + ox, y + oy, c)

    def shifted(self, dy, rows_upto):
        """copy where rows <= rows_upto are moved by dy (used for breathing)."""
        c = Canvas(self.w, self.h)
        for (x, y), col in self.px.items():
            if y <= rows_upto:
                c.set(x, y + dy, col)
        for (x, y), col in self.px.items():
            if y > rows_upto:
                if (x, y) not in c.px:
                    c.set(x, y, col)
        return c

    def image(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            im.putpixel((x, y), tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
        return im


# ---------- masks ----------
def rect(x0, y0, x1, y1):
    return {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}


def ellipse(cx, cy, rx, ry):
    """cx, cy may be .5 values; pixel centres tested."""
    m = set()
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1.0:
                m.add((x, y))
    return m


def rows(d):
    """{y: (x0, x1)} -> mask"""
    return {(x, y) for y, (a, b) in d.items() for x in range(a, b + 1)}


def poly(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    m = set()
    n = len(pts)
    for y in range(int(min(ys)) - 1, int(max(ys)) + 2):
        for x in range(int(min(xs)) - 1, int(max(xs)) + 2):
            px, py = x + .5, y + .5
            inside = False
            j = n - 1
            for i in range(n):
                xi, yi = pts[i]
                xj, yj = pts[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                    inside = not inside
                j = i
            if inside:
                m.add((x, y))
    return m


def line(x0, y0, x1, y1):
    pts = set()
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        pts.add((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy
    return pts


def edge(mask, dx, dy):
    """pixels of mask whose neighbour at (+dx,+dy) is outside mask."""
    return {(x, y) for (x, y) in mask if (x + dx, y + dy) not in mask}


def ring(mask):
    """border pixels of a mask (4-neighbour)."""
    return {(x, y) for (x, y) in mask
            if any((x + a, y + b) not in mask for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))}


def mirror(mask, axis2):
    """mirror around x = axis2/2 (axis2 = x0 + x1)."""
    return {(axis2 - x, y) for (x, y) in mask}


def check_image(im, size):
    assert im.size == size, (im.size, size)
    bad = set()
    for p in im.getdata():
        if p[3] not in (0, 255):
            bad.add(('alpha', p[3]))
        elif p[3] == 255:
            h = '#%02x%02x%02x' % p[:3]
            if h not in PALETTE:
                bad.add(h)
    assert not bad, bad
