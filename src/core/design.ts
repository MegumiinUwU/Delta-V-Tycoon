// defaultDesign + isUnlocked (Part B Step 3, Part A §A14.2).
import { findAnyItem, getCatalog, getDifficulty, getInstrument, getScenario } from './catalog';
import type { Design, DifficultyId, ScenarioId } from './types';

/** basic tier, OR difficulty unlocks advanced, OR sandbox, OR an instrument satisfying a required group. */
export function isUnlocked(itemId: string, difficulty: DifficultyId, scenarioId: ScenarioId): boolean {
  if (itemId === 'none') return true;
  const item = findAnyItem(itemId);
  if (!item) return false;
  if (item.tier === 'basic') return true;
  if (getDifficulty(difficulty).advancedUnlocked) return true;
  if (scenarioId === 'sandbox') return true;
  const instr = getCatalog().instruments.find((i) => i.id === itemId);
  if (instr) {
    const groups = getScenario(scenarioId).requiredTagGroups;
    return groups.some((g) => g.some((t) => instr.tags.includes(t)));
  }
  return false;
}

type Starter = [Design['planner'], Design['engineer'], string[], Design['comms']];
const S = (orbitId: Design['planner']['orbitId'], lifetimeYears: number, launchVehicleId: string): Design['planner'] =>
  ({ orbitId, lifetimeYears, launchVehicleId, deltaVMarginPct: 10 });
const E = (busId: string, solarArrayW: number, batteryWh: number, adcsId: string, propulsionId: string): Design['engineer'] =>
  ({ busId, solarArrayId: 'sa_si', solarArrayW, rtgCount: 0, batteryId: 'bat_liion', batteryWh, computerId: 'obc_basic', adcsId, propulsionId });

const STARTERS: Record<ScenarioId, Starter> = {
  nile_watch: [S('sso', 2, 'spark'), E('bus_small', 300, 200, 'adcs_wheels', 'prop_mono'), ['imager_ms'],
    { radioId: 'radio_sband', hga: false, groundNetworkId: 'campus' }],
  storm_watch: [S('geo', 5, 'workhorse'), E('bus_medium', 500, 1000, 'adcs_wheels', 'prop_biprop'), ['sounder_atm'],
    { radioId: 'radio_xband', hga: false, groundNetworkId: 'commercial' }],
  ice_hunter: [S('lunar', 1, 'workhorse'), E('bus_medium', 500, 400, 'adcs_wheels', 'prop_biprop'), ['spec_neutron'],
    { radioId: 'radio_sband', hga: false, groundNetworkId: 'deepspace' }],
  red_relay: [S('mars', 2, 'workhorse'), E('bus_medium', 1000, 500, 'adcs_wheels', 'prop_biprop'), ['spec_atm'],
    { radioId: 'radio_xband', hga: false, groundNetworkId: 'deepspace' }],
  first_light: [S('l2', 5, 'workhorse'), E('bus_medium', 800, 100, 'adcs_wheels', 'prop_mono'), ['tel_ir'],
    { radioId: 'radio_xband', hga: false, groundNetworkId: 'deepspace' }],
  sandbox: [S('leo', 2, 'spark'), E('bus_small', 300, 200, 'adcs_mag', 'prop_mono'), ['cam_wide'],
    { radioId: 'radio_sband', hga: false, groundNetworkId: 'campus' }],
};

/** Cheapest unlocked item of a list (by costM, or cost per unit). */
function cheapest<T extends { id: string; costM?: number; costMPerW?: number; costMPerWh?: number }>(
  list: T[], difficulty: DifficultyId, scenarioId: ScenarioId,
): string {
  const ok = list.filter((x) => isUnlocked(x.id, difficulty, scenarioId));
  ok.sort((a, b) => (a.costM ?? a.costMPerW ?? a.costMPerWh ?? 0) - (b.costM ?? b.costMPerW ?? b.costMPerWh ?? 0));
  return ok[0]?.id ?? list[0].id;
}

/** A valid, deliberately imperfect starter design (so the first lesson is reading the checks). */
export function defaultDesign(scenarioId: ScenarioId, difficulty: DifficultyId): Design {
  const [planner, engineer, instruments, comms] = STARTERS[scenarioId];
  const d: Design = {
    planner: { ...planner },
    engineer: { ...engineer },
    science: { instrumentIds: [...instruments] },
    comms: { ...comms },
  };
  const c = getCatalog(), k = c.components;
  const ok = (id: string) => isUnlocked(id, difficulty, scenarioId);
  if (!ok(d.planner.launchVehicleId)) d.planner.launchVehicleId = cheapest(c.launchVehicles, difficulty, scenarioId);
  if (!ok(d.engineer.busId)) d.engineer.busId = cheapest(k.buses, difficulty, scenarioId);
  if (d.engineer.solarArrayId !== 'none' && !ok(d.engineer.solarArrayId)) d.engineer.solarArrayId = cheapest(k.solarArrays, difficulty, scenarioId);
  if (d.engineer.rtgCount > 0 && !ok(k.rtg.id)) d.engineer.rtgCount = 0;
  if (!ok(d.engineer.batteryId)) d.engineer.batteryId = cheapest(k.batteries, difficulty, scenarioId);
  if (!ok(d.engineer.computerId)) d.engineer.computerId = cheapest(k.computers, difficulty, scenarioId);
  if (!ok(d.engineer.adcsId)) d.engineer.adcsId = cheapest(k.adcs, difficulty, scenarioId);
  if (!ok(d.engineer.propulsionId)) d.engineer.propulsionId = cheapest(k.propulsion.filter((x) => x.id !== 'prop_none'), difficulty, scenarioId);
  if (!ok(d.comms.radioId)) d.comms.radioId = cheapest(k.radios, difficulty, scenarioId);
  if (d.comms.hga && !ok(k.hga.id)) d.comms.hga = false;
  d.science.instrumentIds = d.science.instrumentIds.map((id) =>
    ok(id) ? id : cheapest(c.instruments.filter((x) => x.tags.some((t) => getInstrument(id).tags.includes(t))), difficulty, scenarioId));
  return d;
}

export function cloneDesign(d: Design): Design {
  return { planner: { ...d.planner }, engineer: { ...d.engineer }, science: { instrumentIds: [...d.science.instrumentIds] }, comms: { ...d.comms } };
}
