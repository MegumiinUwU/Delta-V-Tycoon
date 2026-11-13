"""Guest crew art (Kasane Teto, Hatsune Miku, Akita Neru) built from the user's own chibi pixel art.

scripts/art/source/chibi_<id>.png hold the three sprites exactly as sent, recovered at their native pixel size
(the sent image was a ~6.56x upscale; each pixel was read from its block centre, close colours merged, the
background made transparent). Nothing is redrawn: every game file is those pixels, placed and scaled by whole
numbers only.

  sprite_<id>_idle.png  128x48  4 frames of 32x48, sprite at 1x on the frame floor; frames 2-3 breathe (upper body
                                1 px down, feet planted), the same 0-1-1-0 rhythm as the rest of the crew
  sprite_<id>_suit.png   64x48  2 frames, the same sprite (these characters have no flight-suit art)
  portrait_<id>_<expr>.png 64x64  bust (head and shoulders) at 3x, centred on the face; the same for all three expressions

Run: python scripts/art/exact_crew.py [characters_dir]
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent.parent / 'public' / 'assets' / 'characters'
IDS = ['teto', 'miku', 'neru']


FEET = 4  # bottom rows that stay planted while the upper body breathes


def breathe(spr: Image.Image) -> Image.Image:
    """Upper body 1 px down, feet unchanged (the top feet row is covered by the body's last row)."""
    out = Image.new('RGBA', spr.size, (0, 0, 0, 0))
    cut = spr.height - FEET
    out.alpha_composite(spr.crop((0, cut, spr.width, spr.height)), (0, cut))
    out.alpha_composite(spr.crop((0, 0, spr.width, cut)), (0, 1))
    return out


def frame(spr: Image.Image, w: int, h: int) -> Image.Image:
    f = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    f.alpha_composite(spr, ((w - spr.width) // 2, h - spr.height - 1))
    return f


def strip(frames):
    out = Image.new('RGBA', (sum(f.width for f in frames), frames[0].height), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.alpha_composite(f, (i * f.width, 0))
    return out


def face_centre(spr: Image.Image) -> int:
    a = np.asarray(spr).astype(int)
    skin = (a[..., 3] > 0) & (a[..., 0] > 200) & (a[..., 1] > 150) & (a[..., 2] > 130) & (a[..., 0] - a[..., 2] > 15)
    cols = np.where(skin[: spr.height // 2].any(0))[0]
    return int(round((cols.min() + cols.max()) / 2)) if len(cols) else spr.width // 2


def portrait(spr: Image.Image) -> Image.Image:
    scale, size = 3, 64
    n = size // scale + 1                      # 22 source pixels across, cropped back to 64
    cx = face_centre(spr)
    crop = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    crop.alpha_composite(spr.crop((cx - n // 2, 0, cx - n // 2 + n, n)), (0, 1))
    big = crop.resize((n * scale, n * scale), Image.NEAREST)
    off = (big.width - size) // 2
    return big.crop((off, 0, off + size, size))


for cid in IDS:
    spr = Image.open(HERE / 'source' / f'chibi_{cid}.png').convert('RGBA')
    assert spr.width <= 32 and spr.height <= 47, (cid, spr.size)
    strip([frame(s, 32, 48) for s in (spr, breathe(spr), breathe(spr), spr)]).save(OUT / f'sprite_{cid}_idle.png')
    strip([frame(spr, 32, 48), frame(spr, 32, 48)]).save(OUT / f'sprite_{cid}_suit.png')
    p = portrait(spr)
    for expr in ('neutral', 'happy', 'worried'):
        p.save(OUT / f'portrait_{cid}_{expr}.png')
    print(cid, spr.size, '->', OUT)
