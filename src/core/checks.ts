// runChecks — Part A §A10. One evaluator per check id; text comes from checks.json.
import { computeBudgets } from './budgets';
import {
  getAdcs, getBus, getCatalog, getGround, getInstrument, getOrbit, getPropulsion, getRadio, getScenario, getVehicle,
} from './catalog';
import { fill, fmtDelay, fmtM, tagGroupsWords } from './format';
import type { BudgetSplit, Budgets, Check, Design, DifficultyId, Role, ScenarioId, Severity } from './types';
import { ROLES } from './types';

export const ROLE_TITLES: Record<Role, string> = {
  planner: 'Mission Commander', engineer: 'Spacecraft Engineer', science: 'Science Lead', comms: 'Communications & Data Officer',
};

/** Which required tag groups the design satisfies. */
export function requiredGroupStatus(design: Design, scenarioId: ScenarioId): { satisfied: number; total: number; missing: string[][] } {
  const groups = getScenario(scenarioId).requiredTagGroups;
  const tags = new Set(design.science.instrumentIds.flatMap((id) => getInstrument(id).tags));
  const missing = groups.filter((g) => !g.some((t) => tags.has(t)));
  return { satisfied: groups.length - missing.length, total: groups.length, missing };
}

/** Builds the full template-variable object (A10 "Template variables"). */
export function checkVars(design: Design, scenarioId: ScenarioId, b: Budgets): Record<string, string | number> {
  const scenario = getScenario(scenarioId);
  const orbit = getOrbit(design.planner.orbitId);
  const vehicle = getVehicle(design.planner.launchVehicleId);
  const bus = getBus(design.engineer.busId);
  const adcs = getAdcs(design.engineer.adcsId);
  const fit = scenario.orbitFit[orbit.id] ?? 0;
  const blurred = b.pointing.perInstrument.filter((p) => p.quality < 1)
    .map((p) => `${getInstrument(p.id).name} (${Math.round(p.quality * 100)}%)`);
  return {
    totalKg: b.mass.totalKg, capKg: b.mass.launchCapacityKg ?? 0, launchMargin: b.mass.launchMarginPct ?? 0,
    vehicle: vehicle.name, destination: orbit.destination, busName: bus.name, busMaxKg: bus.maxMassKg,
    slots: bus.instrumentSlots, instrCount: design.science.instrumentIds.length,
    genW: b.power.generationW, loadW: b.power.loadW, powerMargin: b.power.marginPct,
    batteryWh: b.power.batteryWh, batteryReqWh: b.power.batteryRequiredWh, eclipseMin: b.power.eclipseMin,
    dvRequired: b.deltaV.requiredMs, dvCapability: b.deltaV.capabilityMs, insertionDv: orbit.insertionDvMs,
    rateMbps: b.data.rateMbps, downlink: b.data.downlinkGbitPerDay, generated: b.data.generatedGbitPerDay,
    returnPct: b.data.returnPct, storage: b.data.storageGbit,
    totalCost: fmtM(b.cost.totalM), budget: fmtM(b.cost.budgetM), reservePct: b.cost.reservePct,
    role: '', roleCost: '', roleAlloc: '',
    launchMonth: b.time.launchMonth, window: b.time.windowMonths, delayMonths: b.time.delayMonths, delayCost: fmtM(b.cost.delayM),
    lifetime: design.planner.lifetimeYears, minLifetime: scenario.minLifetimeYears,
    orbit: orbit.name, fit: fit * 100, recommendedOrbit: getOrbit(scenario.recommendedOrbit).name,
    missingTags: tagGroupsWords(requiredGroupStatus(design, scenarioId).missing),
    blurredList: blurred.join(', '), adcsName: adcs.name, adcsDeg: adcs.pointingDeg,
    radio: getRadio(design.comms.radioId).name, ground: getGround(design.comms.groundNetworkId).name,
    disposalDv: orbit.disposalDvMs, naturalLife: orbit.naturalLifetimeYears, lightDelay: fmtDelay(orbit.lightDelaySec),
  };
}

interface Raw { id: string; textId: string; severity: Severity; role: Role; conceptId: string; vars?: Record<string, string | number> }

export function runChecks(design: Design, scenarioId: ScenarioId, difficulty: DifficultyId, split: BudgetSplit): Check[] {
  const b = computeBudgets(design, scenarioId, difficulty, split);
  return runChecksWith(design, scenarioId, b);
}

/** Same as runChecks but reuses an already computed Budgets object. */
export function runChecksWith(design: Design, scenarioId: ScenarioId, b: Budgets): Check[] {
  const scenario = getScenario(scenarioId);
  const orbit = getOrbit(design.planner.orbitId);
  const vehicle = getVehicle(design.planner.launchVehicleId);
  const bus = getBus(design.engineer.busId);
  const adcs = getAdcs(design.engineer.adcsId);
  const prop = getPropulsion(design.engineer.propulsionId);
  const radio = getRadio(design.comms.radioId);
  const K = getCatalog().constants;
  const vars = checkVars(design, scenarioId, b);
  const out: Raw[] = [];
  const add = (id: string, role: Role, conceptId: string, severity: Severity, extra?: Record<string, string | number>) =>
    out.push({ id, textId: id, role, conceptId, severity, vars: extra });
  const sev = (fail: boolean, warn: boolean): Severity => (fail ? 'fail' : warn ? 'warn' : 'pass');

  const cap = b.mass.launchCapacityKg;
  add('launch_destination', 'planner', 'payload_capacity', sev(cap == null, false));
  if (cap != null) add('launch_capacity', 'planner', 'payload_capacity', sev(b.mass.totalKg > cap, (b.mass.launchMarginPct ?? 0) < 10));
  add('bus_mass', 'engineer', 'mass_budget', sev(b.mass.totalKg > bus.maxMassKg, b.mass.totalKg > 0.9 * bus.maxMassKg));
  add('bus_slots', 'science', 'mass_budget', sev(design.science.instrumentIds.length > bus.instrumentSlots, false));
  add('power_balance', 'engineer', 'power_budget', sev(b.power.generationW < b.power.loadW, b.power.marginPct < 15));
  const noEclipse = b.power.eclipseMin === 0;
  add('battery_eclipse', 'engineer', 'eclipse',
    noEclipse ? 'pass' : sev(b.power.batteryWh < 0.5 * b.power.batteryRequiredWh, b.power.batteryWh < b.power.batteryRequiredWh));
  add('deltav_capability', 'engineer', 'delta_v',
    sev(!b.deltaV.feasible || b.deltaV.capabilityMs < orbit.insertionDvMs, b.deltaV.capabilityMs < b.deltaV.requiredMs));
  const arrayW = design.engineer.solarArrayId === 'none' ? 0 : design.engineer.solarArrayW;
  add('electric_power', 'engineer', 'delta_v', sev(prop.electric && arrayW * orbit.solarFactor < K.ELECTRIC_MIN_W, false));
  // Magnetorquers need a magnetic field: orbit.magnetorquersWork refines "near Earth" (GEO is near Earth but has too weak a field).
  add('adcs_environment', 'engineer', 'pointing', sev(adcs.nearEarthOnly && (!orbit.isNearEarth || !orbit.magnetorquersWork), false));
  add('pointing_quality', 'science', 'pointing', sev(false, b.pointing.perInstrument.some((p) => p.quality < 1)));
  add('hga_pointing', 'comms', 'antenna_gain', sev(false, design.comms.hga && !b.data.hgaEffective));
  add('radio_range', 'comms', 'ground_station', sev((radio.nearEarthOnly && !orbit.isNearEarth) || b.data.contactHoursPerDay === 0, false));
  add('data_return', 'comms', 'data_rate', sev(b.data.returnPct < 25, b.data.returnPct < 95));
  add('storage', 'comms', 'data_rate', sev(false, (b.data.generatedGbitPerDay - b.data.downlinkGbitPerDay) * 3 > b.data.storageGbit));
  add('budget_total', 'planner', 'mission_cost', sev(b.cost.totalM > b.cost.budgetM, b.cost.reservePct < 5));
  for (const role of ROLES) {
    out.push({
      id: `role_allocation_${role}`, textId: 'role_allocation', role, conceptId: 'mission_cost',
      severity: sev(false, b.cost.byRole[role] > b.cost.allocationM[role]),
      vars: { role: ROLE_TITLES[role], roleCost: fmtM(b.cost.byRole[role]), roleAlloc: fmtM(b.cost.allocationM[role]) },
    });
  }
  add('launch_window', 'planner', 'launch_window', sev(false, b.time.launchMonth > b.time.windowMonths));
  add('required_instruments', 'science', 'mission_requirements', sev(requiredGroupStatus(design, scenarioId).missing.length > 0, false));
  const fit = scenario.orbitFit[orbit.id];
  add('orbit_fit', 'planner', 'orbit', sev(fit == null || fit <= 0, (fit ?? 0) < 1));
  add('lifetime_min', 'planner', 'mission_lifetime', sev(false, design.planner.lifetimeYears < scenario.minLifetimeYears));
  add('debris_disposal', 'planner', 'space_debris',
    sev(false, orbit.debrisRule && (prop.id === 'prop_none' || b.deltaV.capabilityMs < b.deltaV.requiredMs)));
  add('natural_lifetime', 'planner', 'orbit', sev(false, prop.id === 'prop_none' && design.planner.lifetimeYears > orbit.naturalLifetimeYears));
  void vehicle;

  const texts = getCatalog().checksText;
  const order: Record<Severity, number> = { fail: 0, warn: 1, pass: 2 };
  const checks: Check[] = out.map((r) => {
    const t = texts[r.textId];
    const v = { ...vars, role: ROLE_TITLES[r.role], ...(r.vars ?? {}) };
    const tmpl = t ? (r.severity === 'fail' ? t.fail ?? t.warn ?? t.pass : r.severity === 'warn' ? t.warn ?? t.fail ?? t.pass : t.pass) : r.id;
    return {
      id: r.id, severity: r.severity, role: r.role, conceptId: r.conceptId,
      title: t ? fill(t.title, v) : r.id, message: fill(tmpl, v), fixHint: t ? fill(t.fixHint, v) : '',
    };
  });
  checks.sort((a, z) => order[a.severity] - order[z.severity] || ROLES.indexOf(a.role) - ROLES.indexOf(z.role));
  return checks;
}
