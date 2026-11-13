"""Recover the asset artist's sprites from the labelled preview sheets in assets/ (see Brief 5).

r.jpeg   : 49 catalog item icons, 7x7 grid, drawn at 3x  -> items/<id>.png (32x32)
a .jpeg  : rows 1-3 = 20 UI icons at 4x -> icons/<id>.png (16x16)
Run: python scripts/art/recover_previews.py <out_dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from extract import extract, palette_report  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ITEMS = [
    ['bus_cube', 'bus_medium', 'bus_large', 'sa_si', 'sa_gaas', 'rtg', 'bat_liion'],
    ['bat_liion_adv', 'obc_basic', 'obc_adv', 'adcs_mag', 'adcs_wheels', 'adcs_precision', 'prop_none'],
    ['prop_coldgas', 'prop_mono', 'prop_biprop', 'prop_electric', 'radio_uhf', 'radio_sband', 'radio_kaband'],
    ['hga', 'gs_campus', 'gs_commercial', 'gs_deepspace', 'lv_spark', 'lv_rideshare', 'lv_arrow'],
    ['lv_workhorse', 'lv_titan', 'orbit_leo', 'orbit_sso', 'orbit_geo', 'orbit_lunar', 'orbit_l2'],
    ['orbit_mars', 'cam_wide', 'cam_hires', 'imager_tir', 'radar_sar', 'sounder_atm', 'lightning_map'],
    ['spec_neutron', 'lidar_alt', 'magnetometer', 'spec_atm', 'det_particle', 'relay_uhf', 'tel_ir'],
]
UI_TILES = ['ui_panel_dark', 'ui_button', 'ui_button_hover', 'ui_button_pressed', 'ui_button_disabled', 'ui_tab', 'ui_tab_active']
UI_ICONS = [
    ['res_mass', 'res_power', 'res_budget', 'res_data', 'res_comms', 'res_time', 'res_deltav'],
    ['res_science', 'st_pass', 'st_warn', 'st_fail', 'st_info', 'role_planner', 'role_engineer'],
    ['role_science', 'role_comms', 'ui_star_full', 'ui_star_empty', 'ui_lock', 'ui_help'],
]


def main(out: Path):
    results = []
    r = np.asarray(Image.open(ROOT / 'assets' / 'r.jpeg').convert('RGB')).astype(int)
    pitch_x = r.shape[1] / 7
    for row, ids in enumerate(ITEMS):
        for col, iid in enumerate(ids):
            rect = (int(col * pitch_x) + 2, 30 + 124 * row, int((col + 1) * pitch_x) - 2, 132 + 124 * row)
            results.append((f'items/{iid}.png', extract(r, rect, 3, (32, 32))))
    a = np.asarray(Image.open(ROOT / 'assets' / 'a .jpeg').convert('RGB')).astype(int)
    # Row 0 (UI tiles) is not recovered: the preview tiles are off by a pixel here and there, which breaks 9-slicing,
    # so scripts/art/ui_kit.py redraws them with exact geometry from the same design.
    for row, ids in enumerate(UI_ICONS):
        for col, iid in enumerate(ids):
            rect = (8 + 128 * col, 140 + 125 * row, 8 + 128 * col + 110, 232 + 125 * row)
            results.append((f'icons/{iid}.png', extract(a, rect, 4, (16, 16))))
    for rel, im in results:
        p = out / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        im.save(p)
    return results


if __name__ == '__main__':
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'build' / 'recovered')
    res = main(out)
    bad = [(rel, palette_report(im)) for rel, im in res if palette_report(im)['off_palette']]
    print(f'{len(res)} sprites written to {out}; off-palette: {bad or "none"}')
