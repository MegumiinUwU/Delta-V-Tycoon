// v1.1 core additions: Concept Maturity (F-35), Mission Twin (F-33), science estimate and Trade-Space sweep (F-34).
import { clamp, computeBudgets } from './budgets';
import { getCatalog, getInstrument, getScenario } from './catalog';
import { runChecksWith } from './checks';
import { cloneDesign } from './design';
import type {
  BudgetSplit, Check, Design, DifficultyId, Maturity, MissionTwin, ScenarioId, SweepParam, SweepPoint,
} from './types';

/** JPL CML checklist: pass = green, warn = yellow, fail = red; CML 4 at ≥ 80% green with no red. */
export function conceptMaturity(checks: Check[]): Maturity {
  const green = checks.filter((c) => c.severity === 'pass').length;
  const yellow = checks.filter((c) => c.severity === 'warn').length;
  const red = checks.filter((c) => c.severity === 'fail').length;
  const greenPct = checks.length ? (green / checks.length) * 100 : 0;
  if (greenPct >= 80 && red === 0) return { cml: 4, name: 'Point Design', greenPct, green, yellow, red };
  if (greenPct >= 50) return { cml: 3, name: 'Trade Space', greenPct, green, yellow, red };
  return { cml: 2, name: 'Initial Feasibility', greenPct, green, yellow, red };
}

/** Score = 2 if same orbit + 1 per shared tag; highest wins, ties keep list order. Sandbox uses every twin. */
export function findMissionTwin(design: Design, scenarioId: ScenarioId): MissionTwin | null {
  const list = scenarioId === 'sandbox'
    ? getCatalog().scenarios.flatMap((s) => s.twins ?? [])
    : getScenario(scenarioId).twins ?? [];
  const tags = new Set(design.science.instrumentIds.flatMap((id) => getInstrument(id).tags));
  let best: MissionTwin | null = null, bestScore = -1;
  for (const t of list) {
    const score = (t.orbit === design.planner.orbitId ? 2 : 0) + t.keyTags.filter((k) => tags.has(k)).length;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

/**
 * Expected science return with no events: full-mission science at average power duty and battery penalty,
 * scaled by the fraction of data that reaches Earth.
 */
export function estimateScience(design: Design, scenarioId: ScenarioId, difficulty: DifficultyId, split: BudgetSplit): number {
  const b = computeBudgets(design, scenarioId, difficulty, split);
  const scenario = getScenario(scenarioId);
  const instruments = design.science.instrumentIds.map(getInstrument);
  if (!instruments.length) return 0;
  const fit = scenario.orbitFit[design.planner.orbitId] ?? 0;
  const weight = (tags: string[]) => Math.max(...tags.map((t) => scenario.tagWeights[t] ?? scenario.defaultTagWeight));
  const perYear = instruments.reduce((s, ins, i) => s + ins.baseScience * weight(ins.tags) * fit * b.pointing.perInstrument[i].quality, 0);
  const instrPower = instruments.reduce((s, i) => s + i.powerW, 0);
  const nonInstr = b.power.loadW - instrPower;
  let duty = instrPower > 0 ? clamp((b.power.generationW - nonInstr) / instrPower, 0, 1) : 1;
  if (b.power.eclipseMin > 0 && !b.power.batteryOk) duty *= Math.max(0.2, b.power.batteryWh / b.power.batteryRequiredWh);
  const years = design.planner.lifetimeYears;
  return perYear * years * duty * (b.data.returnPct / 100);
}

const NUMERIC: Partial<Record<SweepParam, { role: keyof Design; key: string; values: number[]; unit: string }>> = {
  lifetimeYears: { role: 'planner', key: 'lifetimeYears', values: range(0.5, 10, 0.5), unit: 'yr' },
  solarArrayW: { role: 'engineer', key: 'solarArrayW', values: range(0, 6000, 250), unit: 'W' },
  batteryWh: { role: 'engineer', key: 'batteryWh', values: range(50, 5000, 250), unit: 'Wh' },
  deltaVMarginPct: { role: 'planner', key: 'deltaVMarginPct', values: range(0, 30, 5), unit: '%' },
};
function range(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  for (let x = a; x <= b + 1e-9; x += step) out.push(Math.round(x * 100) / 100);
  return out;
}

/** Which design role owns a sweep parameter (the UI only lets that role apply a point). */
export function sweepRole(param: SweepParam): keyof Design {
  if (NUMERIC[param]) return NUMERIC[param]!.role;
  return param === 'launchVehicleId' ? 'planner' : param === 'busId' || param === 'adcsId' ? 'engineer' : 'comms';
}

/** Science, cost and margins vs one parameter, everything else fixed. */
export function tradeSweep(design: Design, scenarioId: ScenarioId, difficulty: DifficultyId, split: BudgetSplit,
  param: SweepParam): SweepPoint[] {
  const c = getCatalog();
  const scenario = getScenario(scenarioId);
  const num = NUMERIC[param];
  let options: { value: number | string; label: string }[];
  if (num) {
    const cur = (design[num.role] as unknown as Record<string, number>)[num.key];
    const vals = num.values.includes(cur) ? num.values : [...num.values, cur].sort((a, b) => a - b);
    options = vals.map((v) => ({ value: v, label: `${v} ${num.unit}` }));
  } else {
    const list: { id: string; name: string }[] = param === 'busId' ? c.components.buses : param === 'radioId' ? c.components.radios
      : param === 'groundNetworkId' ? c.components.groundNetworks : param === 'launchVehicleId' ? c.launchVehicles : c.components.adcs;
    options = list.map((x) => ({ value: x.id, label: x.name }));
  }
  const role = sweepRole(param);
  const key = num ? num.key : param;
  const current = (design[role] as unknown as Record<string, number | string>)[key];
  return options.map(({ value, label }) => {
    const d = cloneDesign(design);
    (d[role] as unknown as Record<string, number | string>)[key] = value;
    const b = computeBudgets(d, scenarioId, difficulty, split);
    const sci = estimateScience(d, scenarioId, difficulty, split);
    return {
      value, label, scienceEst: sci, scienceEstPctOfTarget: (sci / scenario.scienceTarget) * 100, totalCostM: b.cost.totalM,
      launchMarginPct: b.mass.launchMarginPct, powerMarginPct: b.power.marginPct, returnPct: b.data.returnPct,
      failCount: runChecksWith(d, scenarioId, b).filter((x) => x.severity === 'fail').length, isCurrent: value === current,
    };
  });
}
