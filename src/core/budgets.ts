// computeBudgets — Part A §A9, implemented line by line. Never rounds (display rounding is the UI's job).
import {
  allSelectableItems, getAdcs, getArray, getBattery, getBus, getCatalog, getComputer, getDifficulty, getGround,
  getInstrument, getOrbit, getPropulsion, getRadio, getScenario, getVehicle,
} from './catalog';
import type { BudgetSplit, Budgets, Design, DifficultyId, Line, Role, ScenarioId } from './types';
import { ROLES } from './types';

export const DEFAULT_SPLIT: BudgetSplit = { planner: 35, engineer: 30, science: 25, comms: 10 };

export interface RocketResult { propellantKg: number; tankKg: number; capabilityMs: number; feasible: boolean }

/** Rocket equation with tank fraction and optional propellant cap (A9 + B4 notes). */
export function rocket(dryKg: number, dvMs: number, ispS: number, maxPropellantKg?: number): RocketResult {
  const { G0, TANK_FRACTION } = getCatalog().constants;
  if (ispS <= 0) return { propellantKg: 0, tankKg: 0, capabilityMs: 0, feasible: true };
  const x = Math.exp(dvMs / (ispS * G0)) - 1;
  const den = 1 - TANK_FRACTION * x;
  if (den <= 0.05) return { propellantKg: 0, tankKg: 0, capabilityMs: 0, feasible: false };
  let propellantKg = (dryKg * x) / den;
  if (maxPropellantKg != null && propellantKg > maxPropellantKg) propellantKg = maxPropellantKg;
  const tankKg = TANK_FRACTION * propellantKg;
  const capabilityMs = ispS * G0 * Math.log((dryKg + tankKg + propellantKg) / (dryKg + tankKg));
  return { propellantKg, tankKg, capabilityMs, feasible: true };
}

export function computeBudgets(design: Design, scenarioId: ScenarioId, difficulty: DifficultyId, split: BudgetSplit): Budgets {
  const K = getCatalog().constants;
  const comps = getCatalog().components;
  const p = design.planner, e = design.engineer, c = design.comms;
  const scenario = getScenario(scenarioId);
  const diff = getDifficulty(difficulty);
  const orbit = getOrbit(p.orbitId);
  const vehicle = getVehicle(p.launchVehicleId);
  const bus = getBus(e.busId);
  const hasArray = e.solarArrayId !== 'none';
  const array = hasArray ? getArray(e.solarArrayId) : null;
  const arrayW = hasArray ? e.solarArrayW : 0;
  const rtg = comps.rtg;
  const battery = getBattery(e.batteryId);
  const computer = getComputer(e.computerId);
  const adcs = getAdcs(e.adcsId);
  const prop = getPropulsion(e.propulsionId);
  const radio = getRadio(c.radioId);
  const hga = comps.hga;
  const ground = getGround(c.groundNetworkId);
  const instruments = design.science.instrumentIds.map(getInstrument);
  const life = p.lifetimeYears;

  // ---- Mass ----
  const massLines: Line[] = [{ label: bus.name, value: bus.massKg, role: 'engineer' }];
  for (const i of instruments) massLines.push({ label: i.name, value: i.massKg, role: 'science' });
  const arrayKg = array ? arrayW / array.wPerKg : 0;
  const rtgKg = e.rtgCount * rtg.massKg;
  const batteryKg = e.batteryWh / battery.whPerKg;
  const hgaKg = c.hga ? hga.massKg : 0;
  massLines.push(
    { label: 'Solar array', value: arrayKg, role: 'engineer' },
    { label: 'RTGs', value: rtgKg, role: 'engineer' },
    { label: 'Battery', value: batteryKg, role: 'engineer' },
    { label: 'Computer', value: computer.massKg, role: 'engineer' },
    { label: 'Attitude control', value: adcs.massKg, role: 'engineer' },
    { label: 'Propulsion (dry)', value: prop.dryMassKg, role: 'engineer' },
    { label: 'Radio', value: radio.massKg, role: 'comms' },
    { label: 'High-gain antenna', value: hgaKg, role: 'comms' },
  );
  const dryKg = massLines.reduce((s, l) => s + l.value, 0);

  const dvRequired = orbit.insertionDvMs + orbit.stationKeepingDvMsPerYear * life + orbit.disposalDvMs;
  const dvWithMargin = dvRequired * (1 + p.deltaVMarginPct / 100);
  const r = prop.id === 'prop_none'
    ? { propellantKg: 0, tankKg: 0, capabilityMs: 0, feasible: true }
    : rocket(dryKg, dvWithMargin, prop.ispS, prop.maxPropellantKg);
  massLines.push({ label: 'Propellant', value: r.propellantKg, role: 'engineer' }, { label: 'Tank', value: r.tankKg, role: 'engineer' });
  const totalKg = dryKg + r.propellantKg + r.tankKg;
  const cap = vehicle.capacityKg[orbit.destination];
  const launchCapacityKg = cap == null ? null : cap;
  const launchMarginPct = launchCapacityKg == null ? null : ((launchCapacityKg - totalKg) / launchCapacityKg) * 100;

  // ---- Communications and data ----
  const contactHours = orbit.contactHours[c.groundNetworkId];
  const hgaEffective = c.hga && adcs.pointingDeg <= K.HGA_MAX_POINTING_DEG;
  const rateMbps = Math.min(radio.maxRateMbps,
    radio.baseRateMbps * orbit.commsFactor * ground.gain * (hgaEffective ? hga.gain : 1));
  const downlinkGbitPerDay = rateMbps * contactHours * 3.6;
  const generatedGbitPerDay = instruments.reduce((s, i) => s + i.dataGbitPerDay, 0) * computer.compression;
  const returnPct = generatedGbitPerDay === 0 ? 100 : Math.min(100, (downlinkGbitPerDay / generatedGbitPerDay) * 100);

  // ---- Power ----
  const arrayAvgW = arrayW * orbit.solarFactor * orbit.sunFraction * K.SOLAR_EFFICIENCY;
  const rtgW = e.rtgCount * rtg.powerW;
  const generationW = arrayAvgW + rtgW;
  const radioAvgW = radio.powerW * Math.min(1, contactHours / 24);
  const powerLines: Line[] = [{ label: bus.name, value: bus.baseLoadW, role: 'engineer' }];
  for (const i of instruments) powerLines.push({ label: i.name, value: i.powerW, role: 'science' });
  powerLines.push(
    { label: 'Computer', value: computer.powerW, role: 'engineer' },
    { label: 'Attitude control', value: adcs.powerW, role: 'engineer' },
    { label: 'Propulsion', value: prop.powerW, role: 'engineer' },
    { label: 'Radio (average)', value: radioAvgW, role: 'comms' },
    { label: 'Radio standby', value: K.RADIO_STANDBY_W, role: 'comms' },
  );
  const loadW = powerLines.reduce((s, l) => s + l.value, 0);
  const powerMarginPct = loadW > 0 ? ((generationW - loadW) / loadW) * 100 : 0;
  const batteryRequiredWh = Math.max(K.MIN_BATTERY_WH,
    (Math.max(0, loadW - rtgW) * orbit.eclipseMin) / 60 / battery.depthOfDischarge);
  const batteryOk = e.batteryWh >= batteryRequiredWh;

  // ---- Pointing ----
  const perInstrument = instruments.map((i) => ({
    id: i.id, reqDeg: i.pointingReqDeg, quality: clamp(i.pointingReqDeg / adcs.pointingDeg, 0.1, 1),
  }));

  // ---- Time ----
  const advancedCount = allSelectableItems(design).filter((x) => x.tier === 'advanced').length;
  const devMonths = K.BASE_DEV_MONTHS + Math.max(0, ...instruments.map((i) => i.devMonths)) + K.ADVANCED_DEV_MONTHS * advancedCount;
  let launchMonth = devMonths;
  if (vehicle.scheduleIntervalMonths) launchMonth = Math.ceil(launchMonth / vehicle.scheduleIntervalMonths) * vehicle.scheduleIntervalMonths;
  if (scenario.hardLaunchWindow) {
    let window = scenario.launchWindowMonths;
    while (launchMonth > window) window += K.MARS_SYNODIC_MONTHS;
    launchMonth = window === scenario.launchWindowMonths ? launchMonth : window;
  }
  const delayMonths = Math.max(0, launchMonth - scenario.launchWindowMonths);
  const delayCostM = K.DELAY_COST_M_PER_MONTH * delayMonths;
  const transferMonths = orbit.cruiseMonths + (prop.electric ? orbit.insertionDvMs / K.ELECTRIC_DV_PER_MONTH : 0);

  // ---- Cost ----
  const oh = 1 + K.INTEGRATION_OVERHEAD;
  const costLines: Line[] = [
    { label: bus.name, value: bus.costM * oh, role: 'engineer' },
    { label: 'Solar array', value: arrayW * (array ? array.costMPerW : 0) * oh, role: 'engineer' },
    { label: 'RTGs', value: e.rtgCount * rtg.costM * oh, role: 'engineer' },
    { label: 'Battery', value: e.batteryWh * battery.costMPerWh * oh, role: 'engineer' },
    { label: computer.name, value: computer.costM * oh, role: 'engineer' },
    { label: adcs.name, value: adcs.costM * oh, role: 'engineer' },
    { label: prop.name, value: prop.costM * oh, role: 'engineer' },
  ];
  for (const i of instruments) costLines.push({ label: i.name, value: i.costM * oh, role: 'science' });
  costLines.push({ label: radio.name, value: radio.costM * oh, role: 'comms' });
  if (c.hga) costLines.push({ label: hga.name, value: hga.costM * oh, role: 'comms' });
  const launchM = vehicle.costPerKgM != null
    ? Math.max(vehicle.minCostM ?? 0, vehicle.costPerKgM * totalKg)
    : vehicle.costM;
  const opsM = orbit.opsCostMPerYear * life;
  const groundM = ground.costMPerYear * life;
  costLines.push(
    { label: `Launch (${vehicle.name})`, value: launchM, role: 'planner' },
    { label: 'Operations', value: opsM, role: 'planner' },
    { label: 'Ground network', value: groundM, role: 'comms' },
    { label: 'Delay', value: delayCostM, role: 'planner' },
  );
  const byRole = { planner: 0, engineer: 0, science: 0, comms: 0 } as Record<Role, number>;
  for (const l of costLines) byRole[l.role] += l.value;
  const totalM = ROLES.reduce((s, ro) => s + byRole[ro], 0);
  const budgetM = scenario.budgetM * diff.budgetMult;
  const reservePct = ((budgetM - totalM) / budgetM) * 100;
  const allocationM = {} as Record<Role, number>;
  for (const ro of ROLES) allocationM[ro] = (budgetM * split[ro]) / 100;

  return {
    mass: { dryKg, propellantKg: r.propellantKg, tankKg: r.tankKg, totalKg, busMaxKg: bus.maxMassKg, launchCapacityKg,
      launchMarginPct, lines: massLines },
    power: { generationW, loadW, marginPct: powerMarginPct, rtgW, batteryWh: e.batteryWh, batteryRequiredWh, batteryOk,
      eclipseMin: orbit.eclipseMin, lines: powerLines },
    data: { generatedGbitPerDay, downlinkGbitPerDay, rateMbps, contactHoursPerDay: contactHours, returnPct,
      storageGbit: computer.storageGbit, hgaEffective },
    deltaV: { requiredMs: dvRequired, withMarginMs: dvWithMargin, capabilityMs: r.capabilityMs, ispS: prop.ispS, feasible: r.feasible },
    cost: { byRole, allocationM, launchM, opsM, delayM: delayCostM, totalM, budgetM, reservePct, lines: costLines },
    time: { devMonths, launchMonth, windowMonths: scenario.launchWindowMonths, delayMonths, transferMonths, lifetimeYears: life },
    pointing: { adcsDeg: adcs.pointingDeg, perInstrument },
  };
}

export function clamp(x: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, x)); }
