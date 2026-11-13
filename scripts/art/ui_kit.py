"""Redraw the 24x24 UI 9-slice tiles (Brief 5) with exact geometry, following the asset artist's design.

public/assets/ui/ui_panel.png is the artist's approved file and is used as-is; ui_panel_dark is the same structure recoloured
(centre #181425, border #262b44). Buttons/tabs follow the artist's preview: 2-row highlight, 2-row shadow,
cut corners, #181425 outline; tabs have an open bottom edge.
Run: python scripts/art/ui_kit.py <assets_root>
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
O, T = '181425', None


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def save(rows, path):
    im = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c:
                im.putpixel((x, y), rgb(c))
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)


def button(top: str, face: str, bottom: str):
    """Outline with cut corners; rows 1-2 = top colour, rows 21-22 = bottom colour, face between."""
    rows = []
    for y in range(24):
        row = []
        for x in range(24):
            corner = (x in (0, 23) and y in (0, 23))
            inner_corner = (x in (1, 22) and y in (1, 22))
            if corner:
                row.append(T)
            elif x in (0, 23) or y in (0, 23) or inner_corner:
                row.append(O)
            elif y <= 2:
                row.append(top if (y == 1 or 2 <= x <= 21) else face)
            elif y >= 21:
                row.append(bottom)
            else:
                row.append(face)
        rows.append(row)
    return rows


def tab(top1: str, top2: str | None, side: str, face: str):
    """Open bottom edge: outline only on top/left/right; rows 1-2 = top colours."""
    rows = []
    for y in range(24):
        row = []
        for x in range(24):
            if y == 0 and x in (0, 23):
                row.append(T)
            elif y == 0 or x in (0, 23) or (y == 1 and x in (1, 22)):
                row.append(O)
            elif y in (1, 2):
                row.append(top1)
            elif y == 3 and top2:
                row.append(top2)
            elif x in (1, 22):
                row.append(side)
            else:
                row.append(face)
        rows.append(row)
    return rows


def panel_dark():
    src = Image.open(ROOT / 'public' / 'assets' / 'ui' / 'ui_panel.png').convert('RGBA')  # the artist's approved tile
    remap = {'181425': '181425', '5a6988': '3a4466', 'c0cbdc': '8b9bb4', '3a4466': '262b44', '262b44': '181425'}
    rows = []
    for y in range(24):
        row = []
        for x in range(24):
            r, g, b, a = src.getpixel((x, y))
            row.append(remap['%02x%02x%02x' % (r, g, b)] if a else T)
        rows.append(row)
    return rows


def main(assets: Path):
    ui = assets / 'ui'
    save(panel_dark(), ui / 'ui_panel_dark.png')
    save(button('5a6988', '3a4466', '262b44'), ui / 'ui_button.png')
    save(button('0099db', '124e89', '262b44'), ui / 'ui_button_hover.png')
    save(button('262b44', '3a4466', '5a6988'), ui / 'ui_button_pressed.png')      # shadow on top, face shifted down
    save(button('3a4466', '262b44', '262b44'), ui / 'ui_button_disabled.png')     # no shadow
    save(tab('5a6988', None, '262b44', '3a4466'), ui / 'ui_tab.png')
    save(tab('feae34', 'f77622', '3a4466', '262b44'), ui / 'ui_tab_active.png')


if __name__ == '__main__':
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'public' / 'assets')
