// Each orbit's distinctive "house rules", derived from the same numbers the simulation uses (so what players read
// always matches what happens). Ordered most distinctive first; cards show the top two, the tooltip shows all.
import { fmtDelay } from '../core/format';
import type { Orbit } from '../core/types';

export interface OrbitRule { icon: string; text: string; concept: string }

export function orbitRules(o: Orbit): OrbitRule[] {
  const r: OrbitRule[] = [];
  const ch = o.contactHours;
  if (o.lightDelaySec > 60) r.push({ icon: 'res_comms', text: `${fmtDelay(o.lightDelaySec)} delay: needs autonomy`, concept: 'light_delay' });
  if (o.solarFactor < 1) r.push({ icon: 'res_power', text: `${Math.round(o.solarFactor * 100)}% sunlight`, concept: 'solar_power' });
  if (o.eclipseMin === 0) r.push({ icon: 'res_power', text: 'no eclipses', concept: 'eclipse' });
  if (o.insertionDvMs >= 500) r.push({ icon: 'res_deltav', text: `${o.insertionDvMs} m/s to arrive`, concept: 'delta_v' });
  if (ch.campus === 0 && ch.commercial === 0) r.push({ icon: 'res_comms', text: 'deep-space network only', concept: 'ground_station' });
  if (ch.campus >= 24) r.push({ icon: 'res_comms', text: '24 h contact', concept: 'ground_station' });
  if (!o.magnetorquersWork) r.push({ icon: 'st_warn', text: 'magnetorquers fail', concept: 'pointing' });
  if (o.naturalLifetimeYears < 10) r.push({ icon: 'res_time', text: `decays in ${o.naturalLifetimeYears} yr without fuel`, concept: 'orbit' });
  if (o.debrisRule) r.push({ icon: 'res_deltav', text: 'must carry deorbit fuel', concept: 'space_debris' });
  const best = Math.max(ch.campus, ch.commercial, ch.deepspace);
  if (best > 0 && best < 24) r.push({ icon: 'res_comms', text: `up to ${best} h/day contact`, concept: 'ground_station' });
  return r;
}
