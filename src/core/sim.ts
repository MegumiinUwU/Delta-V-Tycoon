// Day-by-day mission simulation (Part A §A11). Deterministic: same input + seed + decisions → same result.
import { computeBudgets, clamp } from './budgets';
import {
  getAdcs, getArray, getBattery, getBus, getCatalog, getComputer, getDifficulty, getEvent, getGround, getInstrument,
  getOrbit, getPropulsion, getRadio, getScenario, getVehicle,
} from './catalog';
import { applyOption, buildPending, scheduleEvents, type ModType, type SimEnv, type SimState } from './events';
import { mulberry32 } from './rng';
import type { PendingEvent, Sample, SimInput, SimResult, Simulation } from './types';

export function createSimulation(input: SimInput): Simulation {
  const K = getCatalog().constants;
  const { design } = input;
  const b = computeBudgets(design, input.scenarioId, input.difficulty, input.split);
  const scenario = getScenario(input.scenarioId);
  const difficulty = getDifficulty(input.difficulty);
  const orbit = getOrbit(design.planner.orbitId);
  const vehicle = getVehicle(design.planner.launchVehicleId);
  const bus = getBus(design.engineer.busId);
  const array = design.engineer.solarArrayId !== 'none' ? getArray(design.engineer.solarArrayId) : null;
  const arrayW = array ? design.engineer.solarArrayW : 0;
  const rtg = getCatalog().components.rtg;
  const rtgCount = design.engineer.rtgCount;
  const battery = getBattery(design.engineer.batteryId);
  void battery;
  const computer = getComputer(design.engineer.computerId);
  const adcs = getAdcs(design.engineer.adcsId);
  const prop = getPropulsion(design.engineer.propulsionId);
  const radio = getRadio(design.comms.radioId);
  const hga = getCatalog().components.hga;
  const instruments = design.science.instrumentIds.map(getInstrument);

  // ---- constants precomputed once ----
  const instrPower = instruments.reduce((s, i) => s + i.powerW, 0);
  const nonInstrLoad = b.power.loadW - instrPower;
  const genGbitBase = b.data.generatedGbitPerDay;
  const orbitFit = scenario.orbitFit[orbit.id] ?? 0;
  const tagWeight = (tags: string[]) => Math.max(...tags.map((t) => scenario.tagWeights[t] ?? scenario.defaultTagWeight));
  const sciK = instruments.map((i) => i.baseScience * tagWeight(i.tags) * orbitFit);
  const isRelay = instruments.map((i) => i.tags.includes('relay'));
  const arrayFactor = orbit.solarFactor * orbit.sunFraction * K.SOLAR_EFFICIENCY;
  const reqWh = b.power.batteryRequiredWh;
  const noEclipse = orbit.eclipseMin === 0;
  const skPerDay = orbit.stationKeepingDvMsPerYear / 365;
  const electricStarved = prop.electric && arrayW * orbit.solarFactor < K.ELECTRIC_MIN_W;
  const capability = electricStarved ? 0 : b.deltaV.capabilityMs;
  const plannedDays0 = Math.round(design.planner.lifetimeYears * 365);
  const naturalEndDay = prop.id === 'prop_none' ? Math.round(orbit.naturalLifetimeYears * 365) : Number.POSITIVE_INFINITY;
  const runningPerDay = (b.cost.opsM + getGround(design.comms.groundNetworkId).costMPerYear * design.planner.lifetimeYears) / Math.max(1, plannedDays0);
  const upfrontCost = b.cost.totalM - runningPerDay * plannedDays0;

  const rng = mulberry32(input.seed);
  const s: SimState = {
    day: 0, endDay: Math.min(plannedDays0, naturalEndDay), plannedDays: plannedDays0, naturalEndDay, rng,
    stored: 0, lost: 0, dataGen: 0, dataRet: 0, sciGen: 0, sciBonus: 0, extraCost: 0,
    modifiers: [], pointingMult: 1, batteryMult: 1, groundNetworkId: design.comms.groundNetworkId,
    lifetimeYears: design.planner.lifetimeYears, dvRemaining: capability - orbit.insertionDvMs,
    schedule: [], nextEventIdx: 0, pending: null, pendingDefault: null, events: [], samples: [],
    outcome: null, outcomeReason: '', immune: new Set(), done: false, shortenedBelowMin: false,
    downlinkGbitPerDay: b.data.downlinkGbitPerDay, quality: b.pointing.perInstrument.map((p) => p.quality),
  };
  const sampleEvery = Math.max(1, Math.floor(s.endDay / 200));

  const active = (type: ModType, day: number) => s.modifiers.filter((m) => m.type === type && (m.untilDay === null || day <= m.untilDay));
  const product = (type: ModType, day: number) => active(type, day).reduce((p, m) => p * m.value, 1);
  const arrayAt = (day: number) => arrayW * Math.pow(1 - (array?.degradationPerYear ?? 0), day / 365);
  const rtgAt = (day: number) => rtgCount * rtg.powerW * Math.pow(1 - rtg.decayPerYear, day / 365);
  const generationAt = (day: number) => arrayAt(day) * arrayFactor * product('powerMult', day) + rtgAt(day);

  const env: SimEnv = {
    design, budgets: b, scenario, difficulty, orbit, computer, prop, bus, instruments,
    generationNow: (st) => generationAt(Math.max(1, st.day)),
    scienceYearFull: (st) => {
      const d = st.day + 1;
      const mult = product('scienceMult', d);
      const relay = product('relayMult', d);
      return sciK.reduce((sum, k, i) => sum + k * st.quality[i] * mult * (isRelay[i] ? relay : 1), 0);
    },
    refreshDerived: (st) => {
      const pointing = adcs.pointingDeg * st.pointingMult;
      st.quality = instruments.map((i) => clamp(i.pointingReqDeg / pointing, 0.1, 1));
      const ground = getGround(st.groundNetworkId);
      const hgaEff = design.comms.hga && pointing <= K.HGA_MAX_POINTING_DEG;
      const rate = Math.min(radio.maxRateMbps, radio.baseRateMbps * orbit.commsFactor * ground.gain * (hgaEff ? hga.gain : 1));
      st.downlinkGbitPerDay = rate * orbit.contactHours[st.groundNetworkId] * 3.6;
    },
  };

  let last: Sample = { day: 0, generationW: generationAt(0), loadW: b.power.loadW, duty: 0, stored: 0,
    dataGeneratedCum: 0, dataReturnedCum: 0, scienceCum: 0, costCum: upfrontCost };

  const finish = (outcome: SimResult['outcome'], reason: string) => {
    s.outcome = outcome; s.outcomeReason = reason; s.done = true; s.pending = null;
  };

  // ---- Before day 0: launch, insertion, schedule ----
  const cap = b.mass.launchCapacityKg;
  if (cap == null) finish('launch_failure', 'rocket cannot reach this orbit');
  else if (b.mass.totalKg > cap) finish('launch_failure', 'too heavy for the rocket');
  else if (difficulty.launchFailures && rng() > vehicle.reliability) finish('launch_failure', 'launch vehicle anomaly');
  else if (!b.deltaV.feasible || capability < orbit.insertionDvMs) finish('orbit_failure', 'not enough delta-v to enter orbit');
  if (s.done) { s.endDay = 0; }
  else s.schedule = scheduleEvents(scenario, difficulty, b, design, rng, plannedDays0, orbit);

  const simulateDay = (d: number) => {
    const gen = generationAt(d);
    if (gen < nonInstrLoad) {
      finish('power_failure', 'the solar arrays could not power the computer and radio');
      s.endDay = d - 1;
      return;
    }
    let duty = instrPower > 0 ? clamp((gen - nonInstrLoad) / instrPower, 0, 1) : 1;
    const battWh = b.power.batteryWh * s.batteryMult;
    const battOk = noEclipse || battWh >= reqWh;
    if (!battOk) duty *= Math.max(0.2, battWh / reqWh);
    if (active('scienceOff', d).length) duty = 0;
    const generatedToday = genGbitBase * duty * product('dataMult', d);
    const capacity = active('contactLoss', d).length ? 0 : s.downlinkGbitPerDay;
    const queue = s.stored + generatedToday;
    const sent = Math.min(queue, capacity);
    s.stored = queue - sent;
    if (s.stored > computer.storageGbit) { s.lost += s.stored - computer.storageGbit; s.stored = computer.storageGbit; }
    const mult = product('scienceMult', d), relay = product('relayMult', d);
    let sci = 0;
    for (let i = 0; i < sciK.length; i++) sci += sciK[i] * s.quality[i] * (isRelay[i] ? relay : 1);
    sci *= (duty * mult) / 365;
    s.dataGen += generatedToday; s.dataRet += sent; s.sciGen += sci;
    s.day = d;
    last = { day: d, generationW: gen, loadW: b.power.loadW, duty, stored: s.stored, dataGeneratedCum: s.dataGen,
      dataReturnedCum: s.dataRet, scienceCum: scienceReturned(), costCum: upfrontCost + runningPerDay * d + s.extraCost };
    if (d % sampleEvery === 0) s.samples.push(last);
    if (prop.id !== 'prop_none') {
      s.dvRemaining -= skPerDay;
      if (s.dvRemaining <= orbit.disposalDvMs && d < s.endDay) {
        s.endDay = d;
        finish('ended_early', 'out of propellant to maintain the orbit');
      }
    }
  };

  const scienceReturned = () => s.sciGen * (s.dataGen > 0 ? s.dataRet / s.dataGen : 1) + s.sciBonus;

  const endOutcome = () => {
    if (s.shortenedBelowMin) finish('ended_early', 'the mission was shortened below the minimum lifetime');
    else if (s.endDay < s.plannedDays && s.endDay === s.naturalEndDay) finish('ended_early', 'the orbit decayed without propulsion');
    else finish('completed', 'mission completed');
  };

  /** Triggers due events. Returns true if the stepper must stop (pending decision). */
  const triggerEvents = (): boolean => {
    while (s.nextEventIdx < s.schedule.length && s.schedule[s.nextEventIdx].day <= s.day + 1) {
      const sch = s.schedule[s.nextEventIdx++];
      if (s.immune.has(sch.eventId)) continue;
      const ev = getEvent(sch.eventId);
      const { pending, defaultId } = buildPending(sch.index, ev, s, env);
      if (!pending) {
        s.events.push({ index: sch.index, day: s.day + 1, eventId: ev.id, title: ev.title, optionId: null, byRole: ev.ownerRole,
          bad: false, text: ev.autoHandledText ?? '' });
        continue;
      }
      s.pending = pending; s.pendingDefault = defaultId;
      return true;
    }
    return false;
  };

  const sim: Simulation & { readonly pendingDefaultOptionId: string | null } = {
    get day() { return s.day; },
    get pendingEvent(): PendingEvent | null { return s.pending; },
    get done() { return s.done; },
    get pendingDefaultOptionId() { return s.pendingDefault; },
    step(days: number) {
      let n = 0;
      while (!s.done && !s.pending && n < days) {
        if (s.day >= s.endDay) { endOutcome(); break; }
        if (triggerEvents()) break;
        if (s.done) break;
        simulateDay(s.day + 1);
        n++;
      }
      if (!s.done && !s.pending && s.day >= s.endDay) endOutcome();
      if (s.done && (s.samples.length === 0 || s.samples[s.samples.length - 1].day !== last.day)) s.samples.push(last);
    },
    decide(optionId: string) {
      const p = s.pending;
      if (!p) return;
      const chosen = p.options.find((o) => o.id === optionId && !o.disabled) ?? p.options.find((o) => o.id === s.pendingDefault)!;
      const sch = s.schedule.find((x) => x.index === p.index)!;
      s.pending = null; s.pendingDefault = null;
      s.events.push(applyOption(chosen, sch.roll, s, env, p.event, p.index, p.day));
      if (s.done) s.samples.push(last);
    },
    current: () => last,
    result(): SimResult {
      const totalCost = b.cost.totalM + s.extraCost;
      return {
        outcome: s.outcome ?? 'completed', outcomeReason: s.outcomeReason, endDay: s.endDay, plannedDays: s.plannedDays,
        achievedYears: Math.max(0, s.endDay) / 365,
        dataGenerated: s.dataGen, dataReturned: s.dataRet, dataLost: s.lost, scienceGenerated: s.sciGen,
        scienceReturned: scienceReturned(), extraCostM: s.extraCost, finalTotalCostM: totalCost,
        samples: s.samples, events: s.events,
      };
    },
  };
  return sim;
}

/** Headless replay: answers each pending event with decisions[index] ?? the (effective) default option. */
export function simulateAll(input: SimInput, decisions: Record<number, string>): SimResult {
  const sim = createSimulation(input) as ReturnType<typeof createSimulation> & { pendingDefaultOptionId: string | null };
  let guard = 0;
  while (!sim.done && guard++ < 100000) {
    sim.step(1e9);
    const p = sim.pendingEvent;
    if (p) sim.decide(decisions[p.index] ?? sim.pendingDefaultOptionId ?? p.event.defaultOptionId);
  }
  return sim.result();
}

/** Headless run where a function picks each option (balance script: "all good decisions"). */
export function simulateWith(input: SimInput, choose: (p: PendingEvent) => string): SimResult {
  const sim = createSimulation(input);
  let guard = 0;
  while (!sim.done && guard++ < 100000) {
    sim.step(1e9);
    const p = sim.pendingEvent;
    if (p) sim.decide(choose(p));
  }
  return sim.result();
}

/** Picks the first enabled "good" option, else the effective default. */
export function goodChoice(p: PendingEvent): string {
  return p.options.find((o) => o.good && !o.disabled)?.id ?? effectiveDefaultOptionId(p);
}

/** The option the timer should submit for a pending event (default, or the fallback when it is disabled). */
export function effectiveDefaultOptionId(p: PendingEvent): string {
  const ok = (id?: string) => (id ? p.options.find((o) => o.id === id && !o.disabled)?.id : undefined);
  return ok(p.event.defaultOptionId) ?? ok(p.event.defaultOptionIdIfNoPropulsion) ?? p.options.find((o) => !o.disabled)?.id ?? p.event.defaultOptionId;
}
