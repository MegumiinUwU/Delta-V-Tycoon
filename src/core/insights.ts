// Report explanations ("Why") and "Try next" suggestions (Part B Step 6, Part A §A12).
import { computeBudgets } from './budgets';
import {
  getAdcs, getCatalog, getComputer, getGround, getInstrument, getOrbit, getPropulsion, getRadio, getScenario, getVehicle,
} from './catalog';
import { requiredGroupStatus } from './checks';
import { cloneDesign, isUnlocked } from './design';
import { fmtM, fmtNum, tagGroupsWords } from './format';
import type { Budgets, Design, Insight, Role, SimInput, SimResult } from './types';

export type InsightKey =
  | 'missing_group' | 'launch_heavy' | 'launch_unreachable' | 'launch_anomaly' | 'orbit_failure' | 'power_failure'
  | 'data_return' | 'duty' | 'battery' | 'pointing' | 'science_low' | 'over_budget' | 'ended_propellant'
  | 'ended_decay' | 'launch_margin_low' | 'orbit_fit' | 'debris' | 'event' | 'good';
export interface KeyedInsight extends Insight { key: InsightKey }

const n = fmtNum;
const pct = (x: number) => Math.round(x);

export function buildInsights(input: SimInput, result: SimResult, b: Budgets): KeyedInsight[] {
  const d = input.design;
  const scenario = getScenario(input.scenarioId);
  const orbit = getOrbit(d.planner.orbitId);
  const vehicle = getVehicle(d.planner.launchVehicleId);
  const prop = getPropulsion(d.engineer.propulsionId);
  const array = d.engineer.solarArrayId !== 'none' ? getCatalog().components.solarArrays.find((a) => a.id === d.engineer.solarArrayId) : null;
  const out: KeyedInsight[] = [];
  const add = (key: InsightKey, kind: 'good' | 'bad', role: Role, text: string, conceptId: string) =>
    out.push({ key, kind, role, text, conceptId });
  const reachedOrbit = result.outcome !== 'launch_failure' && result.outcome !== 'orbit_failure';

  // ---- outcome ----
  if (result.outcome === 'launch_failure') {
    if (result.outcomeReason === 'rocket cannot reach this orbit')
      add('launch_unreachable', 'bad', 'planner', `The ${vehicle.name} cannot fly to ${orbit.destination}. Choose a rocket that can reach ${orbit.name}.`, 'payload_capacity');
    else if (result.outcomeReason === 'too heavy for the rocket')
      add('launch_heavy', 'bad', 'planner', `Your spacecraft weighed ${n(b.mass.totalKg)} kg but the ${vehicle.name} can only carry ${n(b.mass.launchCapacityKg ?? 0)} kg to this orbit. Choose a bigger rocket or remove mass.`, 'payload_capacity');
    else
      add('launch_anomaly', 'bad', 'planner', `The ${vehicle.name} failed during ascent. Rockets with ${n(vehicle.reliability * 100)}% reliability fail about ${n((1 - vehicle.reliability) * 100)} in 100 launches. A more reliable rocket lowers that risk.`, 'payload_capacity');
  } else if (result.outcome === 'orbit_failure') {
    add('orbit_failure', 'bad', 'engineer', `The spacecraft needed ${n(orbit.insertionDvMs)} m/s to enter orbit but could only produce ${n(b.deltaV.capabilityMs)} m/s. More propellant or a higher-Isp engine fixes this.`, 'delta_v');
  } else if (result.outcome === 'power_failure') {
    add('power_failure', 'bad', 'engineer', `On day ${result.endDay + 1} the solar arrays produced less power than the computer and radio need, and the spacecraft shut down. Size arrays with margin for aging (${n((array?.degradationPerYear ?? 0) * 100)}% per year).`, 'power_budget');
  } else if (result.outcome === 'ended_early' && result.outcomeReason.startsWith('out of propellant')) {
    add('ended_propellant', 'bad', 'engineer', `Propellant for keeping the orbit ran out after ${n(result.achievedYears)} of ${n(d.planner.lifetimeYears)} years. Increase the delta-v margin or choose a more efficient engine.`, 'delta_v');
  } else if (result.outcome === 'ended_early' && result.outcomeReason.includes('decayed')) {
    add('ended_decay', 'bad', 'planner', `Without propulsion the orbit decayed after ${n(result.achievedYears)} of ${n(d.planner.lifetimeYears)} years. Add an engine to stay up longer.`, 'orbit');
  }

  // ---- design-level ----
  const groups = requiredGroupStatus(d, input.scenarioId);
  if (groups.missing.length)
    add('missing_group', 'bad', 'science', `The mission needed a ${tagGroupsWords(groups.missing)} instrument and none was on board, so the main objective could not be met.`, 'mission_requirements');

  const m = b.mass.launchMarginPct;
  if (m != null && m >= 0) {
    if (m >= 5 && m <= 40) add('good', 'good', 'planner', `Launch mass margin of ${pct(m)}% left room for surprises without paying for a rocket that was too big.`, 'payload_capacity');
    else if (m < 5) add('launch_margin_low', 'bad', 'planner', `Only ${n(m)}% launch margin. Real missions grow in mass during development; keep at least 10%.`, 'payload_capacity');
  }
  if (reachedOrbit && b.power.marginPct >= 15)
    add('good', 'good', 'engineer', `${pct(b.power.marginPct)}% power margin kept every instrument running even as the arrays aged.`, 'power_budget');

  if (reachedOrbit && result.samples.length) {
    const instrPower = d.science.instrumentIds.reduce((s, id) => s + getInstrument(id).powerW, 0);
    if (instrPower > 0) {
      const nonInstr = b.power.loadW - instrPower;
      const avg = result.samples.reduce((s, x) => s + Math.min(1, Math.max(0, (x.generationW - nonInstr) / instrPower)), 0) / result.samples.length;
      if (avg < 0.95) add('duty', 'bad', 'engineer', `Instruments ran at ${pct(avg * 100)}% on average because power was short. Bigger arrays or fewer power-hungry instruments would help.`, 'power_budget');
    }
  }
  if (reachedOrbit && orbit.eclipseMin > 0 && !b.power.batteryOk)
    add('battery', 'bad', 'engineer', `The battery could not carry the full load through each ${n(orbit.eclipseMin)}-minute eclipse, so instruments were switched off in the shadow.`, 'eclipse');

  if (reachedOrbit && result.dataGenerated > 0) {
    const r = (result.dataReturned / result.dataGenerated) * 100;
    if (r >= 95) add('good', 'good', 'comms', `${pct(r)}% of the data reached Earth. The link to ${getGround(d.comms.groundNetworkId).name} kept up with the instruments.`, 'data_rate');
    else add('data_return', 'bad', 'comms', `Only ${pct(r)}% of the data reached Earth; ${n(result.dataGenerated - result.dataReturned)} Gbit was lost. Faster radio, a high-gain antenna, a bigger ground network, or a compression computer would fix it.`, 'data_rate');
  }

  const adcs = getAdcs(d.engineer.adcsId);
  for (const p of b.pointing.perInstrument) {
    if (p.quality < 1)
      add('pointing', 'bad', 'science', `${getInstrument(p.id).name} needs ${n(p.reqDeg)}° pointing but your attitude control holds ${n(adcs.pointingDeg)}°, so its images were blurred to ${pct(p.quality * 100)}% quality.`, 'pointing');
  }

  const fit = scenario.orbitFit[orbit.id] ?? 0;
  if (fit < 1)
    add('orbit_fit', 'bad', 'planner', `${orbit.name} works for this mission, but only at ${pct(fit * 100)}% effectiveness. ${getOrbit(scenario.recommendedOrbit).name} suits it best.`, 'orbit');

  const budgetM = b.cost.budgetM;
  const finalReserve = ((budgetM - result.finalTotalCostM) / budgetM) * 100;
  if (result.finalTotalCostM > budgetM)
    add('over_budget', 'bad', 'planner', `The mission cost ${fmtM(result.finalTotalCostM)} against a budget of ${fmtM(budgetM)}. Real agencies cancel missions that overrun.`, 'mission_cost');
  else if (finalReserve >= 15)
    add('good', 'good', 'planner', `You finished with ${pct(finalReserve)}% of the budget in reserve — that money can fund the next mission.`, 'mission_cost');

  if (debrisViolated(d, b))
    add('debris', 'bad', 'planner', `The spacecraft cannot deorbit at end of life, adding to space debris in a crowded orbit. Carry ${n(orbit.disposalDvMs)} m/s for disposal.`, 'space_debris');
  void prop;

  // ---- events ----
  for (const e of result.events) {
    if (e.optionId === null) continue;
    const ev = getCatalog().events.find((x) => x.id === e.eventId)!;
    const opt = ev.options.find((o) => o.id === e.optionId)!;
    if (e.bad) add('event', 'bad', ev.ownerRole, `${ev.title}: ${opt.badExplanation ?? opt.explanation}`, ev.conceptId);
    else if (opt.good) add('event', 'good', ev.ownerRole, `${ev.title}: ${opt.explanation}`, ev.conceptId);
  }

  // ---- science (needs the other insights for its "biggest cause") ----
  if (reachedOrbit) {
    const sPct = (result.scienceReturned / scenario.scienceTarget) * 100;
    if (sPct >= 100) add('good', 'good', 'science', `Science return reached ${pct(sPct)}% of the goal.`, 'mission_requirements');
    else if (sPct < 70) {
      const cause = out.find((x) => x.kind === 'bad' && x.key !== 'event');
      add('science_low', 'bad', 'science', `Science return reached only ${pct(sPct)}% of the goal.${cause ? ' Biggest cause: ' + firstSentence(cause.text) : ''}`, 'mission_requirements');
    }
  }
  return out;
}

const firstSentence = (t: string) => { const i = t.indexOf('. '); return i >= 0 ? t.slice(0, i + 1) : t; };

export function debrisViolated(d: Design, b: Budgets): boolean {
  const orbit = getOrbit(d.planner.orbitId);
  return orbit.debrisRule && (d.engineer.propulsionId === 'prop_none' || b.deltaV.capabilityMs < b.deltaV.requiredMs);
}

// ---------------- Try next ----------------

type Change = { design: Design; what: string };

function deltaText(input: SimInput, before: Budgets, after: Budgets): string {
  const dk = after.mass.totalKg - before.mass.totalKg;
  const dw = after.power.loadW - before.power.loadW;
  const dc = after.cost.totalM - before.cost.totalM;
  const sign = (x: number) => (x >= 0 ? '+' : '−');
  void input;
  return `(${sign(dk)}${n(Math.abs(dk))} kg, ${sign(dw)}${n(Math.abs(dw))} W, ${sign(dc)}${fmtM(Math.abs(dc))})`;
}


/** Up to 3 concrete suggestions, priority: missing group → failures → data → duty/battery → pointing → science → budget. */
export function buildTryNext(input: SimInput, insights: KeyedInsight[], b: Budgets): string[] {
  const order: InsightKey[][] = [
    ['missing_group'], ['launch_heavy', 'launch_unreachable', 'launch_anomaly', 'orbit_failure', 'power_failure', 'ended_propellant', 'ended_decay'],
    ['data_return'], ['duty', 'battery'], ['pointing'], ['science_low'], ['over_budget', 'launch_margin_low'],
  ];
  const bad = new Set(insights.filter((i) => i.kind === 'bad').map((i) => i.key));
  const out: string[] = [];
  for (const tier of order) for (const key of tier) {
    if (out.length >= 3) return out;
    if (!bad.has(key)) continue;
    const s = suggestFix(key, input, b);
    if (s && !out.includes(s.text)) out.push(s.text);
  }
  return out.slice(0, 3);
}

export interface Fix { text: string; design: Design }

/** Same as buildTryNext but each suggestion carries the changed design ("Apply & retry"). */
export function buildFixes(input: SimInput, insights: KeyedInsight[], b: Budgets): Fix[] {
  const order: InsightKey[] = ['missing_group', 'launch_heavy', 'launch_unreachable', 'launch_anomaly', 'orbit_failure',
    'power_failure', 'ended_propellant', 'ended_decay', 'data_return', 'duty', 'battery', 'pointing', 'science_low',
    'over_budget', 'launch_margin_low'];
  const bad = new Set(insights.filter((i) => i.kind === 'bad').map((i) => i.key));
  const out: Fix[] = [];
  for (const key of order) {
    if (out.length >= 3) break;
    if (!bad.has(key)) continue;
    const f = suggestFix(key, input, b);
    if (f && !out.some((x) => x.text === f.text)) out.push(f);
  }
  return out;
}

function suggestFix(key: InsightKey, input: SimInput, b: Budgets): Fix | null {
  const box: { d: Design | null } = { d: null };
  const tryDesign = (inp: SimInput, design: Design): Budgets => { box.d = design; return computeBudgets(design, inp.scenarioId, inp.difficulty, inp.split); };
  const text = suggestText(key, input, b, tryDesign, (d) => { box.d = d; });
  return text && box.d ? { text, design: box.d } : null;
}

function suggestText(key: InsightKey, input: SimInput, b: Budgets, tryDesign: (inp: SimInput, d: Design) => Budgets,
  pick: (d: Design) => void): string | null {
  const d = input.design;
  const c = getCatalog();
  const ok = (id: string) => isUnlocked(id, input.difficulty, input.scenarioId);
  const orbit = getOrbit(d.planner.orbitId);
  const mk = (patch: (x: Design) => void): Design => { const x = cloneDesign(d); patch(x); return x; };

  switch (key) {
    case 'missing_group': {
      const missing = requiredGroupStatus(d, input.scenarioId).missing[0];
      const cands = c.instruments.filter((i) => ok(i.id) && i.tags.some((t) => missing.includes(t))).sort((a, z) => a.costM - z.costM);
      if (!cands.length) return null;
      const nd = mk((x) => x.science.instrumentIds.push(cands[0].id));
      return `Add the ${cands[0].name} ${deltaText(input, b, tryDesign(input, nd))} to cover the ${tagGroupsWords([missing])} requirement.`;
    }
    case 'launch_heavy': case 'launch_unreachable': case 'launch_anomaly': {
      const cur = getVehicle(d.planner.launchVehicleId);
      const fits = c.launchVehicles.filter((v) => ok(v.id) && v.id !== cur.id && (v.capacityKg[orbit.destination] ?? 0) >= b.mass.totalKg * 1.1)
        .filter((v) => key !== 'launch_anomaly' || v.reliability > cur.reliability)
        .sort((a, z) => (key === 'launch_anomaly' ? z.reliability - a.reliability : a.costM - z.costM));
      if (!fits.length) return null;
      const v = fits[0];
      const nb = tryDesign(input, mk((x) => { x.planner.launchVehicleId = v.id; }));
      return `Fly on the ${v.name} (${n(v.capacityKg[orbit.destination]!)} kg to ${orbit.destination}, ${n(v.reliability * 100)}% reliable): launch margin becomes ${n(nb.mass.launchMarginPct ?? 0)}% for ${fmtM(nb.cost.launchM - b.cost.launchM)} more.`;
    }
    case 'orbit_failure': case 'ended_propellant': {
      const engines = c.components.propulsion.filter((p) => ok(p.id) && p.id !== 'prop_none' && p.id !== 'prop_coldgas');
      for (const margin of [d.planner.deltaVMarginPct, 20, 30])
        for (const p of engines.sort((a, z) => z.ispS - a.ispS)) {
          const nd = mk((x) => { x.engineer.propulsionId = p.id; x.planner.deltaVMarginPct = margin; });
          const nb = tryDesign(input, nd);
          if (nb.deltaV.feasible && nb.deltaV.capabilityMs >= nb.deltaV.requiredMs && (nb.mass.launchMarginPct ?? -1) >= 0)
            return `Use the ${p.name} with a ${margin}% delta-v margin ${deltaText(input, b, nb)}: ${n(nb.deltaV.capabilityMs)} m/s available for ${n(nb.deltaV.requiredMs)} m/s needed.`;
        }
      return null;
    }
    case 'ended_decay': {
      const nd = mk((x) => { x.engineer.propulsionId = 'prop_mono'; });
      return `Add a Hydrazine Monopropellant engine ${deltaText(input, b, tryDesign(input, nd))} to hold the orbit and deorbit safely at the end.`;
    }
    case 'power_failure': case 'duty': {
      if (d.engineer.solarArrayId === 'none') return null;
      const target = (b.power.loadW * 1.2 - b.power.rtgW) / (b.power.generationW - b.power.rtgW || 1) * d.engineer.solarArrayW;
      const w = Math.min(6000, Math.ceil(target / 50) * 50);
      if (w <= d.engineer.solarArrayW) return null;
      const nb = tryDesign(input, mk((x) => { x.engineer.solarArrayW = w; }));
      return `Raise the solar array from ${n(d.engineer.solarArrayW)} W to ${n(w)} W ${deltaText(input, b, nb)} for a ${n(nb.power.marginPct)}% power margin.`;
    }
    case 'battery': {
      const w = Math.min(5000, Math.ceil(b.power.batteryRequiredWh / 50) * 50);
      const nb = tryDesign(input, mk((x) => { x.engineer.batteryWh = w; }));
      return `Raise the battery from ${n(d.engineer.batteryWh)} Wh to ${n(w)} Wh ${deltaText(input, b, nb)} so it covers every eclipse.`;
    }
    case 'data_return': {
      const radios = c.components.radios.filter((r) => ok(r.id));
      const curRadio = getRadio(d.comms.radioId);
      const cands: Change[] = [];
      for (const r of radios) if (r.maxRateMbps > curRadio.maxRateMbps && !(r.nearEarthOnly && !orbit.isNearEarth))
        cands.push({ design: mk((x) => { x.comms.radioId = r.id; }), what: `Swap the ${curRadio.name} for the ${r.name}` });
      if (!d.comms.hga) cands.push({ design: mk((x) => { x.comms.hga = true; }), what: 'Add the High-Gain Dish Antenna' });
      for (const g of c.components.groundNetworks) if (g.gain > getGround(d.comms.groundNetworkId).gain && orbit.contactHours[g.id] > 0)
        cands.push({ design: mk((x) => { x.comms.groundNetworkId = g.id; }), what: `Switch to the ${g.name}` });
      if (ok('obc_adv') && getComputer(d.engineer.computerId).compression > 0.5)
        cands.push({ design: mk((x) => { x.engineer.computerId = 'obc_adv'; }), what: 'Use the Rad-Hard Computer with Compression' });
      let best: { c: Change; nb: Budgets } | null = null;
      for (const ch of cands) {
        const nb = tryDesign(input, ch.design);
        if (!best || nb.data.returnPct > best.nb.data.returnPct + 1e-9 || (Math.abs(nb.data.returnPct - best.nb.data.returnPct) < 1e-9 && nb.cost.totalM < best.nb.cost.totalM)) best = { c: ch, nb };
      }
      if (!best || best.nb.data.returnPct <= b.data.returnPct) return null;
      pick(best.c.design);
      const mult = b.data.downlinkGbitPerDay > 0 ? best.nb.data.downlinkGbitPerDay / b.data.downlinkGbitPerDay : 0;
      return `${best.c.what} ${deltaText(input, b, best.nb)} to ${mult > 1.05 ? `multiply your downlink by ${n(mult)} and ` : ''}raise data return from ${pct(b.data.returnPct)}% to ${pct(best.nb.data.returnPct)}%.`;
    }
    case 'pointing': {
      const cur = getAdcs(d.engineer.adcsId);
      const worst = b.pointing.perInstrument.reduce((a, p) => (p.quality < a.quality ? p : a));
      const opts = c.components.adcs.filter((a) => ok(a.id) && a.pointingDeg < cur.pointingDeg).sort((a, z) => z.pointingDeg - a.pointingDeg);
      const fix = opts.find((a) => a.pointingDeg <= worst.reqDeg) ?? opts[opts.length - 1];
      if (!fix) return null;
      const nb = tryDesign(input, mk((x) => { x.engineer.adcsId = fix.id; }));
      return `Swap the ${cur.name} for the ${fix.name} ${deltaText(input, b, nb)} so the ${getInstrument(worst.id).name} images are sharp.`;
    }
    case 'science_low': {
      const scen = getScenario(input.scenarioId);
      if (d.planner.lifetimeYears < getCatalog().constants.MAX_LIFETIME_YEARS) {
        const y = Math.min(getCatalog().constants.MAX_LIFETIME_YEARS, d.planner.lifetimeYears + 1);
        const nb = tryDesign(input, mk((x) => { x.planner.lifetimeYears = y; }));
        return `Extend the mission to ${n(y)} years ${deltaText(input, b, nb)}: every extra year adds science toward the ${n(scen.scienceTarget)}-point goal.`;
      }
      return null;
    }
    case 'over_budget': case 'launch_margin_low': {
      const cur = getVehicle(d.planner.launchVehicleId);
      const need = key === 'launch_margin_low' ? 1.1 : 1.0;
      const vs = c.launchVehicles.filter((v) => ok(v.id) && v.id !== cur.id && (v.capacityKg[orbit.destination] ?? 0) >= b.mass.totalKg * need);
      const nbs = vs.map((v) => { const nd = mk((x) => { x.planner.launchVehicleId = v.id; }); return { v, nd, nb: tryDesign(input, nd) }; })
        .filter((x) => (key === 'launch_margin_low' ? true : x.nb.cost.totalM < b.cost.totalM))
        .sort((a, z) => a.nb.cost.totalM - z.nb.cost.totalM);
      if (!nbs.length) return null;
      const { v, nb, nd } = nbs[0];
      pick(nd);
      return `Fly on the ${v.name} ${deltaText(input, b, nb)}: ${n(nb.mass.launchMarginPct ?? 0)}% launch margin and ${n(nb.cost.reservePct)}% budget reserve.`;
    }
    default: return null;
  }
}
