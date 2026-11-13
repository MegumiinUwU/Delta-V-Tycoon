// Writes an obvious solid-colour PNG for every asset in the manifest (bible A15.2 / A15.3) that does not exist yet.
// Never overwrites: artists' files are always safe. Run: npm run placeholders
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

const characters = ['nour', 'lucas', 'diaa', 'omar', 'elena', 'amara', 'hiroshi', 'kwame', 'layla', 'hassan', 'priya'];
const playable = characters.filter((c) => c !== 'hassan' && c !== 'priya');
const exprs = ['neutral', 'happy', 'worried'];
const events = ['solar_storm', 'micrometeoroid', 'ground_outage', 'wheel_failure', 'budget_cut', 'computer_reset',
  'debris_conjunction', 'discovery', 'dust_storm', 'battery_aging'];
const scenarios = ['nile_watch', 'storm_watch', 'ice_hunter', 'red_relay', 'first_light', 'sandbox'];
const items = ['bus_cube', 'bus_small', 'bus_medium', 'bus_large', 'sa_si', 'sa_gaas', 'rtg', 'bat_liion', 'bat_liion_adv',
  'obc_basic', 'obc_adv', 'adcs_mag', 'adcs_wheels', 'adcs_precision', 'prop_none', 'prop_coldgas', 'prop_mono', 'prop_biprop',
  'prop_electric', 'radio_uhf', 'radio_sband', 'radio_xband', 'radio_kaband', 'hga', 'gs_campus', 'gs_commercial',
  'gs_deepspace', 'lv_spark', 'lv_rideshare', 'lv_arrow', 'lv_workhorse', 'lv_titan', 'orbit_leo', 'orbit_sso', 'orbit_geo',
  'orbit_lunar', 'orbit_l2', 'orbit_mars', 'cam_wide', 'cam_hires', 'imager_ms', 'imager_tir', 'radar_sar', 'sounder_atm',
  'lightning_map', 'spec_neutron', 'lidar_alt', 'magnetometer', 'spec_atm', 'det_particle', 'relay_uhf', 'tel_ir'];
const icons = ['res_mass', 'res_power', 'res_budget', 'res_data', 'res_comms', 'res_time', 'res_deltav', 'res_science',
  'st_pass', 'st_warn', 'st_fail', 'st_info', 'role_planner', 'role_engineer', 'role_science', 'role_comms', 'ui_star_full',
  'ui_star_empty', 'ui_lock', 'ui_help'];

/** [path, width, height, frames] */
const manifest = [
  ...characters.flatMap((id) => exprs.map((e) => [`characters/portrait_${id}_${e}.png`, 64, 64, 1])),
  ...characters.map((id) => [`characters/sprite_${id}_idle.png`, 128, 48, 4]),
  ...playable.map((id) => [`characters/sprite_${id}_suit.png`, 64, 48, 2]),
  ['bg/bg_title.png', 480, 270, 1], ['bg/bg_mission_control.png', 480, 270, 1], ['bg/bg_clean_room.png', 480, 270, 1],
  ['bg/bg_launch_pad.png', 480, 270, 1], ['bg/bg_space_tile.png', 64, 64, 1],
  ['planets/planet_earth.png', 128, 128, 1], ['planets/planet_moon.png', 96, 96, 1], ['planets/planet_mars.png', 112, 112, 1],
  ['planets/planet_sun.png', 64, 64, 1],
  ['lv/lv_spark.png', 16, 64, 1], ['lv/lv_arrow.png', 24, 96, 1], ['lv/lv_workhorse.png', 24, 128, 1], ['lv/lv_titan.png', 48, 128, 1],
  ['fx/fx_flame.png', 64, 24, 4], ['fx/fx_smoke.png', 192, 32, 6], ['fx/fx_explosion.png', 512, 64, 8],
  ['sc/bus_cube.png', 16, 16, 1], ['sc/bus_small.png', 32, 32, 1], ['sc/bus_medium.png', 48, 48, 1], ['sc/bus_large.png', 64, 64, 1],
  ['sc/sa_si_panel.png', 16, 24, 1], ['sc/sa_gaas_panel.png', 16, 24, 1], ['sc/rtg.png', 8, 16, 1], ['sc/hga.png', 24, 24, 1],
  ['sc/antenna_lga.png', 8, 8, 1], ['sc/thruster.png', 8, 8, 1], ['sc/sc_marker.png', 8, 8, 1],
  ...items.map((id) => [`items/${id}.png`, 32, 32, 1]),
  ...icons.map((id) => [`icons/${id}.png`, 16, 16, 1]),
  ...events.map((id) => [`events/ev_${id}.png`, 96, 64, 1]),
  ...scenarios.map((id) => [`scenarios/sc_${id}.png`, 160, 90, 1]),
  ...['ui_panel', 'ui_panel_dark', 'ui_button', 'ui_button_hover', 'ui_button_pressed', 'ui_button_disabled', 'ui_tab',
    'ui_tab_active'].map((n) => [`ui/${n}.png`, 24, 24, 1]),
  ['ui/logo_deltav.png', 256, 64, 1], ['ui/favicon.png', 32, 32, 1], ['ui/og_image.png', 1200, 630, 1],
];

const FOLDER_COLOURS = { characters: '#b55088', bg: '#262b44', items: '#5a6988', icons: '#8b9bb4', events: '#68386c', ui: '#3a4466' };
const BORDER = '#feae34';
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

let written = 0, kept = 0;
for (const [path, w, h, frames] of manifest) {
  const file = join(ROOT, path);
  if (existsSync(file)) { kept++; continue; }
  const fill = hex(FOLDER_COLOURS[path.split('/')[0]] ?? '#124e89');
  const border = hex(BORDER);
  const png = new PNG({ width: w, height: h });
  const fw = w / frames;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || (frames > 1 && x % fw === 0);
    const [r, g, b] = edge ? border : fill;
    const i = (y * w + x) * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, PNG.sync.write(png));
  written++;
}
console.log(`placeholders: ${written} written, ${kept} already present (never overwritten), ${manifest.length} in manifest`);
