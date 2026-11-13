// Random events: schedule, pending options, and option effects (Part B Step 6, Part A §A8.8 / §A11).
import { getCatalog, getEvent, getGround } from './catalog';
import { fmtNum } from './format';
import type {
  Budgets, Design, Difficulty, EventEffect, EventLogEntry, EventOption, GameEvent, GroundNetworkId, Outcome, Orbit,
  PendingEvent, Sample, Scenario, Computer, Propulsion, Bus, Instrument,
} from './types';

export type ModType = 'scienceMult' | 'powerMult' | 'dataMult' | 'relayMult' | 'contactLoss' | 'scienceOff';
export interface Modifier { type: ModType; value: number; untilDay: number | null }
export interface ScheduledEvent { index: number; day: number; eventId: string; roll: number }

export interface SimState {
  day: number; endDay: number; plannedDays: number; naturalEndDay: number; rng: () => number;
  stored: number; lost: number; dataGen: number; dataRet: number; sciGen: number; sciBonus: number; extraCost: number;
  modifiers: Modifier[]; pointingMult: number; batteryMult: number; groundNetworkId: GroundNetworkId;
  lifetimeYears: number; dvRemaining: number;
  schedule: ScheduledEvent[]; nextEventIdx: number; pending: PendingEvent | null; pendingDefault: string | null;
  events: EventLogEntry[]; samples: Sample[]; outcome: Outcome | null; outcomeReason: string; immune: Set<string>;
  done: boolean; shortenedBelowMin: boolean;
  // derived values refreshed when pointing / ground change
  downlinkGbitPerDay: number; quality: number[];
}

/** Everything constant for one simulation, plus helpers that read the live state. */
export interface SimEnv {
  design: Design; budgets: Budgets; scenario: Scenario; difficulty: Difficulty; orbit: Orbit; computer: Computer;
  prop: Propulsion; bus: Bus; instruments: Instrument[];
  generationNow(s: SimState): number;   // W at the current day with active modifiers
  scienceYearFull(s: SimState): number; // one year of science at full duty with current modifiers
  refreshDerived(s: SimState): void;    // recompute downlink + pointing quality
}

/** Conditions from A8.8 (orbits, adcsIn, needsEclipse). */
export function eventAllowed(ev: GameEvent, design: Design, orbit: Orbit): boolean {
  const c = ev.conditions;
  if (!c) return true;
  if (c.orbits && !c.orbits.includes(design.planner.orbitId)) return false;
  if (c.adcsIn && !c.adcsIn.includes(design.engineer.adcsId)) return false;
  if (c.needsEclipse && !(orbit.eclipseMin > 0)) return false;
  return true;
}

export function eventCountFor(scenario: Scenario, difficulty: Difficulty): number {
  return Math.max(1, Math.round(scenario.eventCount * difficulty.eventMult));
}

/** Weighted draw without replacement, then days, then one pre-drawn roll per event (schedule order). */
export function scheduleEvents(scenario: Scenario, difficulty: Difficulty, budgets: Budgets, design: Design,
  rng: () => number, plannedDays: number, orbit: Orbit): ScheduledEvent[] {
  void budgets;
  const count = eventCountFor(scenario, difficulty);
  const pool = scenario.eventPool.map(getEvent).filter((e) => eventAllowed(e, design, orbit));
  if (pool.length === 0) return [];
  const weight = (e: GameEvent) => (e.weightIfRadio && e.weightIfRadio.radioId === design.comms.radioId ? e.weightIfRadio.weight : 1);
  const picked: GameEvent[] = [];
  let avail = [...pool];
  for (let n = 0; n < count; n++) {
    if (avail.length === 0) avail = [...pool];   // repeats only once the pool is used up
    const total = avail.reduce((s, e) => s + weight(e), 0);
    let r = rng() * total;
    let k = 0;
    for (; k < avail.length - 1; k++) { r -= weight(avail[k]); if (r < 0) break; }
    picked.push(avail[k]);
    avail.splice(k, 1);
  }
  const withDays = picked.map((e, i) => ({ i, eventId: e.id, day: Math.floor(rng() * plannedDays * 0.9) + 1 }));
  withDays.sort((a, b) => a.day - b.day || a.i - b.i);
  return withDays.map((x, index) => ({ index, day: x.day, eventId: x.eventId, roll: rng() }));
}

const NETWORK_DOWN: Record<GroundNetworkId, GroundNetworkId | null> = { deepspace: 'commercial', commercial: 'campus', campus: null };

function optionDeltaV(o: EventOption): number {
  return o.effects.filter((e) => e.type === 'deltaVUse').reduce((s, e) => s + (e.value ?? 0), 0);
}

/** Why an option is disabled right now (undefined = enabled). */
export function disabledReason(o: EventOption, env: SimEnv, s: SimState): string | undefined {
  const r = o.requires;
  if (r) {
    if (r.propulsion && (env.prop.id === 'prop_none' || !(s.dvRemaining > optionDeltaV(o))))
      return env.prop.id === 'prop_none' ? 'There is no engine on board to move the spacecraft.' : 'Not enough propellant left for this manoeuvre.';
    if (r.nearEarth && !env.orbit.isNearEarth) return 'Magnetorquers only work near Earth, where there is a magnetic field.';
    if (r.busSpareWheel && !env.bus.hasSpareWheel) return 'This bus has no spare reaction wheel.';
    if (r.reservePctOfBudget != null) {
      const budgetM = env.budgets.cost.budgetM;
      const reservePct = ((budgetM - env.budgets.cost.totalM - s.extraCost) / budgetM) * 100;
      if (reservePct < r.reservePctOfBudget) return `Your reserve is only ${fmtNum(Math.max(0, reservePct))}% of the budget; ${r.reservePctOfBudget}% is needed.`;
    }
    if (r.autonomyIfDelayOverSec != null && env.orbit.lightDelaySec > r.autonomyIfDelayOverSec && !env.computer.autonomy)
      return `Signals take ${fmtNum(env.orbit.lightDelaySec / 60)} minutes to reach the spacecraft — without onboard autonomy you cannot react in time.`;
  }
  if (o.effects.some((e) => e.type === 'downgradeGround')) {
    const next = NETWORK_DOWN[s.groundNetworkId];
    if (!next) return 'You are already using the cheapest ground network.';
    if (env.orbit.contactHours[next] === 0) return 'This orbit needs the deep-space network.';
  }
  return undefined;
}

/** Applies auto-effects and builds the option list. Returns null when the computer auto-handles the event. */
export function buildPending(index: number, ev: GameEvent, s: SimState, env: SimEnv): { pending: PendingEvent | null; defaultId: string | null } {
  for (const e of ev.autoEffects ?? []) applyEffect(e, s, env);
  if (ev.autoHandledByComputer && ev.autoHandledByComputer === env.design.engineer.computerId) {
    return { pending: null, defaultId: null };
  }
  const options = ev.options.map((o) => {
    const reason = disabledReason(o, env, s);
    return { ...o, disabled: reason !== undefined, ...(reason !== undefined ? { disabledReason: reason } : {}) };
  });
  const enabled = (id?: string) => (id ? options.find((o) => o.id === id && !o.disabled)?.id : undefined);
  const defaultId = enabled(ev.defaultOptionId) ?? enabled(ev.defaultOptionIdIfNoPropulsion) ?? options.find((o) => !o.disabled)?.id ?? ev.defaultOptionId;
  return { pending: { index, day: s.day + 1, event: ev, options }, defaultId };
}

function addMod(s: SimState, type: ModType, value: number, days: number | undefined) {
  // Events fire at the start of day s.day+1; a "days" effect covers that day and the following ones.
  s.modifiers.push({ type, value, untilDay: days != null ? s.day + days : null });
}

/** Applies one effect to the live state. Returns true if it ended the mission. */
export function applyEffect(e: EventEffect, s: SimState, env: SimEnv): boolean {
  const v = e.value ?? 0;
  switch (e.type) {
    case 'loseScienceDays': if (v || e.days) addMod(s, 'scienceOff', 0, e.days ?? v); break;
    case 'contactLossDays': addMod(s, 'contactLoss', 0, e.days ?? v); break;
    case 'scienceMult': addMod(s, 'scienceMult', v, e.days); break;
    case 'powerMult': addMod(s, 'powerMult', v, e.days); break;
    case 'dataMult': addMod(s, 'dataMult', v, e.days); break;
    case 'relayMult': addMod(s, 'relayMult', v, e.days); break;
    case 'costM': s.extraCost += e.reason === 'pct_of_budget' ? (v / 100) * env.budgets.cost.budgetM : v; break;
    case 'deltaVUse': s.dvRemaining -= v; break;
    case 'scienceBonusPct': s.sciBonus += (v / 100) * env.scienceYearFull(s); break;
    case 'pointingMult': s.pointingMult *= v; env.refreshDerived(s); break;
    case 'batteryMult': s.batteryMult *= v; break;
    case 'lifetimeYearsDelta': {
      s.plannedDays = Math.max(s.day + 1, Math.round(s.plannedDays + v * 365));
      s.lifetimeYears = s.plannedDays / 365;
      s.endDay = Math.min(s.plannedDays, s.naturalEndDay);
      if (s.lifetimeYears < env.scenario.minLifetimeYears) s.shortenedBelowMin = true;
      break;
    }
    case 'downgradeGround': {
      const next = NETWORK_DOWN[s.groundNetworkId];
      if (next && env.orbit.contactHours[next] > 0) {
        const remainingYears = Math.max(0, (s.plannedDays - s.day) / 365);
        s.extraCost -= (getGround(s.groundNetworkId).costMPerYear - getGround(next).costMPerYear) * remainingYears;
        s.groundNetworkId = next;
        env.refreshDerived(s);
      }
      break;
    }
    case 'immunity': s.immune.add(e.eventId ?? ''); break;
    case 'endMission':
      s.outcome = 'ended_early'; s.outcomeReason = e.reason ?? 'mission ended'; s.done = true; s.endDay = s.day;
      return true;
  }
  return false;
}

/** Applies the chosen option (with its pre-drawn roll). Returns the log entry. */
export function applyOption(option: EventOption, roll: number, s: SimState, env: SimEnv, ev: GameEvent, index: number, day: number): EventLogEntry {
  const before = s.shortenedBelowMin;
  let bad = false;
  for (const e of option.effects) { if (e.type === 'endMission') bad = true; if (applyEffect(e, s, env)) break; }
  if (!s.done && option.risk) {
    const risk = option.risk;
    let chance = risk.chance;
    if (risk.chanceRule && risk.chanceIfRule != null) {
      const ruleTrue = risk.chanceRule === 'power_margin_after_hit'
        ? (env.generationNow(s) - env.budgets.power.loadW) / env.budgets.power.loadW < 0
        : env.budgets.power.batteryWh * s.batteryMult < env.budgets.power.batteryRequiredWh;
      if (ruleTrue) chance = risk.chanceIfRule;
    }
    for (const red of risk.reductions ?? []) {
      if (red.ifInstrument && env.design.science.instrumentIds.includes(red.ifInstrument)) chance *= red.mult;
      if (red.ifComputer && env.design.engineer.computerId === red.ifComputer) chance *= red.mult;
    }
    if (roll < chance) {
      bad = true;
      for (const e of risk.effects) if (applyEffect(e, s, env)) break;
    }
  }
  if (!before && s.shortenedBelowMin) bad = true;
  return { index, day, eventId: ev.id, title: ev.title, optionId: option.id, byRole: ev.ownerRole, bad,
    text: bad ? option.badExplanation ?? option.explanation : option.explanation };
}

export function getEventCatalog(): GameEvent[] { return getCatalog().events; }
