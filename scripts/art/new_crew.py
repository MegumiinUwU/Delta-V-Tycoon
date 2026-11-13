"""Three guest crew members (Kasane Teto, Hatsune Miku, Akita Neru) drawn as original pixel art in the game's style, built on the character artist's Elena base so the
face template, outline weight, proportions and flight suit match the existing crew exactly.

Each character: skin ramp, eye colour, hair ramp + hairstyle, role stripe colour.
Outputs (bible A15.2): portrait_<id>_{neutral,happy,worried}.png 64x64, sprite_<id>_idle.png 128x48 (4 frames),
sprite_<id>_suit.png 64x48 (2 frames). ENDESGA 32 only, alpha 0/255.
Run: python scripts/art/new_crew.py [characters_dir]
"""
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CHAR = ROOT / 'public' / 'assets' / 'characters'
OUTLINE = '181425'

SKIN = {  # base, shade, dark (A15 skin tones)
    'light': ('e8b796', 'c28569', 'b86f50'),
    'medium': ('c28569', 'b86f50', '733e39'),
    'brown': ('b86f50', '733e39', '3e2731'),
}
ROLE_STRIPE = {'engineer': ('f77622', 'be4a2f'), 'comms': ('2ce8f5', '0099db'), 'science': ('63c74d', '3e8948')}

CREW = {
    'teto': dict(skin='medium', eyes=('3e2731', '733e39'), role='engineer', style='twintails',
                   hair=dict(hi='f6757a', base='e43b44', mid='a22633', dark='733e39'), tie='feae34'),
    'miku': dict(skin='brown', eyes=('3e2731', '733e39'), role='comms', style='braids',
                  hair=dict(hi='2ce8f5', base='2ce8f5', mid='0099db', dark='124e89'), tie='feae34'),
    'neru': dict(skin='light', eyes=('3e8948', '63c74d'), role='science', style='ponytail',
                  hair=dict(hi='ffffff', base='fee761', mid='feae34', dark='f77622'), tie='63c74d'),
}

# Elena's colours in the base art
E_HAIR_LIGHT, E_HAIR_MID, E_DARK = 'ead4aa', 'e4a672', 'b86f50'
E_SKIN, E_SKIN_SHADE = 'e8b796', 'c28569'
E_EYE_DARK, E_EYE_LIGHT = '124e89', '0099db'
E_STRIPE, E_STRIPE_SHADE = 'f77622', 'be4a2f'


def hx(p):
    return '%02x%02x%02x' % p[:3]


def rgba(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


# ------------------------------------------------------------------ recolouring
def recolour(im: Image.Image, cfg: dict, kind: str) -> Image.Image:
    """kind: 'portrait' | 'idle' | 'suit'. Region rules come from the Elena base layout."""
    im = im.copy()
    w, h = im.size
    skin = SKIN[cfg['skin']]
    hair = cfg['hair']
    stripe = ROLE_STRIPE[cfg['role']]
    px = im.load()
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] == 0:
                continue
            c = hx(p)
            fx = x % 32 if kind != 'portrait' else x
            # hair zone (above the face) per asset type
            if kind == 'portrait':
                hair_zone = y <= 25
                dark_is_hair = hair_zone and x >= 33
                stripe_zone = y >= 46
            elif kind == 'idle':
                hair_zone = y <= 10
                dark_is_hair = False
                stripe_zone = y >= 15
            else:  # suit: hair visible inside the helmet only
                hair_zone = 2 <= y <= 11
                dark_is_hair = False
                stripe_zone = y >= 16
            if c == E_HAIR_LIGHT and hair_zone:
                new = hair['base']
            elif c == E_HAIR_MID and hair_zone:
                new = hair['mid']
            elif c == E_DARK and dark_is_hair:
                new = hair['dark']
            elif c == 'ffffff' and hair_zone and kind == 'idle' and is_hair_neighbour(im, x, y):
                new = hair['hi']                      # bun highlight on the small sprite
            elif c == 'ffffff' and kind == 'portrait' and y <= 8:
                new = hair['hi']
            elif kind == 'portrait' and c == E_HAIR_LIGHT and y > 25:
                new = skin[0]                         # Elena's pale cheek dots
            elif kind == 'portrait' and c == E_SKIN_SHADE and 33 <= y <= 35 and (19 <= x <= 27 or 33 <= x <= 37):
                new = skin[0]                         # Elena's freckles
            elif c == E_SKIN:
                new = skin[0]
            elif c == E_SKIN_SHADE:
                new = skin[1]
            elif c == E_DARK:
                new = skin[2]
            elif c == E_EYE_DARK and not stripe_zone:
                new = cfg['eyes'][0]
            elif c == E_EYE_LIGHT and not stripe_zone:
                new = cfg['eyes'][1]
            elif c == E_STRIPE and stripe_zone:
                new = stripe[0]
            elif c == E_STRIPE_SHADE and stripe_zone:
                new = stripe[1]
            else:
                continue
            px[x, y] = rgba(new)
            del fx
    return im


def is_hair_neighbour(im, x, y):
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < im.width and 0 <= ny < im.height:
            p = im.getpixel((nx, ny))
            if p[3] and hx(p) in (E_HAIR_LIGHT, E_HAIR_MID):
                return True
    return False


def remove_bun(im: Image.Image) -> Image.Image:
    """Portrait: delete Elena's top bun (rows 0-7) and close the cap with an outline on row 8."""
    im = im.copy()
    for y in range(0, 8):
        for x in range(64):
            im.putpixel((x, y), (0, 0, 0, 0))
    for x in range(64):
        if im.getpixel((x, 8))[3]:
            im.putpixel((x, 8), rgba(OUTLINE))
    return im


# ------------------------------------------------------------------ hair drawing
def polyline(points, samples=200):
    """Catmull-Rom spline through points -> list of (x, y, t)."""
    pts = [points[0]] + points + [points[-1]]
    out = []
    segs = len(points) - 1
    for s in range(segs):
        p0, p1, p2, p3 = pts[s], pts[s + 1], pts[s + 2], pts[s + 3]
        for i in range(samples // segs):
            u = i / (samples // segs)
            u2, u3 = u * u, u * u * u
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)
            out.append((x, y, (s + u) / segs))
    out.append((points[-1][0], points[-1][1], 1.0))
    return out


def lerp_list(vals, t):
    f = t * (len(vals) - 1)
    i = min(int(f), len(vals) - 2)
    return vals[i] + (vals[i + 1] - vals[i]) * (f - i)


def draw_strand(layer, points, radii, hair, pattern, tie=None, tie_at=0.08):
    """Rasterise a shaded hair strand with outline onto an RGBA layer (pixel art, no AA).
    pattern: 'coil' (spiral bands), 'braid' (alternating chevrons) or 'flow' (soft lengthwise streaks)."""
    w, h = layer.size
    curve = polyline(points)
    length = sum(math.dist(curve[i][:2], curve[i + 1][:2]) for i in range(len(curve) - 1))
    # accumulate arc length for each sample
    acc = [0.0]
    for i in range(1, len(curve)):
        acc.append(acc[-1] + math.dist(curve[i - 1][:2], curve[i][:2]))
    filled = {}
    for y in range(h):
        for x in range(w):
            best = None
            for i in range(0, len(curve), 2):
                cx, cy, t = curve[i]
                r = lerp_list(radii, t)
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if d <= r and (best is None or d / r < best[0]):
                    j = min(i + 1, len(curve) - 1)
                    tx, ty = curve[j][0] - cx, curve[j][1] - cy
                    n = math.hypot(tx, ty) or 1
                    side = ((x + 0.5 - cx) * (-ty) + (y + 0.5 - cy) * tx) / n / r   # -1..1 across the strand
                    best = (d / r, side, acc[i], t)
            if best:
                filled[(x, y)] = best
    for (x, y), (dn, side, s, t) in filled.items():
        lit = -side  # light from the top-left: the strand side facing up-left is lit
        col = hair['base']
        if pattern == 'coil':
            band = (s + side * 2.5) % 5
            if band < 1.2:
                col = hair['mid']
            elif lit > 0.45 and band > 3:
                col = hair['hi']
        elif pattern == 'braid':
            seg = int(s // 3)
            if (side > 0) == (seg % 2 == 0):
                col = hair['mid']
            if abs(side) > 0.75:
                col = hair['dark']
            if lit > 0.3 and (seg % 2 == 1) and abs(side) < 0.6 and int(s) % 3 == 1:
                col = hair['hi']
        else:  # flow
            if lit > 0.5:
                col = hair['hi'] if int(s) % 5 < 3 else hair['base']
            elif side > 0.45:
                col = hair['mid']
            if side > 0.8:
                col = hair['dark']
        if t > 0.92 and side > 0:
            col = hair['dark']
        if tie and abs(s - tie_at * length) < 1.1:
            col = tie
        layer.putpixel((x, y), rgba(col))
    # 1 px outline (4-neighbour ring)
    for (x, y) in list(filled):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in filled and layer.getpixel((nx, ny))[3] == 0:
                layer.putpixel((nx, ny), rgba(OUTLINE))


def mirror_pts(points, axis):
    return [(2 * axis - x, y) for x, y in points]


def hair_layer(size, style, hair, tie, scale='portrait', head=(0, 0)):
    """Back-hair layer drawn under the base sprite. head = (dx, dy) offset of the head in this frame."""
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    ox, oy = head
    P = lambda pts: [(x + ox, y + oy) for x, y in pts]  # noqa: E731
    if scale == 'portrait':
        axis = 28.5
        if style == 'twintails':
            left = [(19, 11), (14, 12), (10, 17), (9, 24), (10, 31), (12, 38)]
            radii = [2.6, 3.4, 4, 3.8, 3.1, 1.8]
            draw_strand(layer, P(left), radii, hair, 'coil', tie, 0.12)
            draw_strand(layer, P(mirror_pts(left, axis)), radii, hair, 'coil', tie, 0.12)
        elif style == 'braids':
            left = [(18, 19), (14, 24), (12, 31), (12, 38), (13, 44)]
            radii = [3, 3.4, 3.4, 3.1, 2.4]
            draw_strand(layer, P(left), radii, hair, 'braid', tie, 0.93)
            draw_strand(layer, P(mirror_pts(left, axis)), radii, hair, 'braid', tie, 0.93)
        else:  # side ponytail on the right
            right = [(36, 9), (43, 11), (47, 17), (48, 26), (47, 35), (44, 43)]
            draw_strand(layer, P(right), [3, 4.2, 5, 5, 4, 2.2], hair, 'flow', tie, 0.1)
    else:  # 32x48 sprite frame; head roughly x 8..22, y 0..14
        axis = 15.5
        if style == 'twintails':
            left = [(10, 2), (6, 5), (5, 10), (6, 15)]
            draw_strand(layer, P(left), [1.6, 2.2, 2.2, 1.2], hair, 'coil', tie, 0.1)
            draw_strand(layer, P(mirror_pts(left, axis)), [1.6, 2.2, 2.2, 1.2], hair, 'coil', tie, 0.1)
        elif style == 'braids':
            left = [(9, 7), (7, 11), (7, 16)]
            draw_strand(layer, P(left), [1.4, 1.5, 1.2], hair, 'braid', tie, 0.92)
            draw_strand(layer, P(mirror_pts(left, axis)), [1.4, 1.5, 1.2], hair, 'braid', tie, 0.92)
        else:
            right = [(21, 1), (25, 4), (26, 9), (25, 14)]
            draw_strand(layer, P(right), [1.6, 2.2, 2.2, 1.2], hair, 'flow', tie, 0.1)
    return layer


def under(base: Image.Image, back: Image.Image) -> Image.Image:
    out = back.copy()
    out.alpha_composite(base)
    return out


def head_offset(frame: Image.Image, ref: Image.Image):
    """Offset of this idle frame's head relative to frame 0 (the idle loop bobs the head)."""
    def top_left(im):
        for y in range(15):
            for x in range(32):
                if im.getpixel((x, y))[3]:
                    return x, y
        return 0, 0
    (ax, ay), (bx, by) = top_left(ref), top_left(frame)
    return bx - ax, by - ay


def build(cid: str, cfg: dict, out: Path):
    style, hair, tie = cfg['style'], cfg['hair'], cfg.get('tie')
    for expr in ('neutral', 'happy', 'worried'):
        base = Image.open(CHAR / f'portrait_elena_{expr}.png').convert('RGBA')
        base = recolour(remove_bun(base), cfg, 'portrait')
        under(base, hair_layer((64, 64), style, hair, tie)).save(out / f'portrait_{cid}_{expr}.png')
    idle = Image.open(CHAR / 'sprite_elena_idle.png').convert('RGBA')
    sheet = Image.new('RGBA', idle.size, (0, 0, 0, 0))
    ref = idle.crop((0, 0, 32, 48))
    for f in range(4):
        frame = idle.crop((f * 32, 0, f * 32 + 32, 48))
        rec = recolour(frame, cfg, 'idle')
        sheet.alpha_composite(under(rec, hair_layer((32, 48), style, hair, tie, 'sprite', head_offset(frame, ref))), (f * 32, 0))
    sheet.save(out / f'sprite_{cid}_idle.png')
    suit = Image.open(CHAR / 'sprite_elena_suit.png').convert('RGBA')
    recolour(suit, cfg, 'suit').save(out / f'sprite_{cid}_suit.png')


if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else CHAR
    out.mkdir(parents=True, exist_ok=True)
    for cid, cfg in CREW.items():
        build(cid, cfg, out)
    print('built', ', '.join(CREW), '->', out)
