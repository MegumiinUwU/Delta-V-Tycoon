// Delta-V Tycoon — shared contract (Part A §A14.1). Do not rename anything here
// without a #bible-changes post from the Lead.

export type Role = 'planner' | 'engineer' | 'science' | 'comms';
export const ROLES: Role[] = ['planner', 'engineer', 'science', 'comms'];
export type OrbitId = 'leo' | 'sso' | 'geo' | 'lunar' | 'l2' | 'mars';
export type Destination = 'LEO' | 'SSO' | 'GTO' | 'TLI' | 'L2' | 'TMI';
export type GroundNetworkId = 'campus' | 'commercial' | 'deepspace';
export type DifficultyId = 'cadet' | 'engineer' | 'director';
export type ScenarioId = 'nile_watch' | 'storm_watch' | 'ice_hunter' | 'red_relay' | 'first_light' | 'sandbox';
export type Tier = 'basic' | 'advanced';
export type Severity = 'pass' | 'warn' | 'fail';
export type Phase = 'lobby' | 'council' | 'design' | 'launch' | 'ops' | 'report';
export type Outcome = 'launch_failure' | 'orbit_failure' | 'power_failure' | 'ended_early' | 'completed';
export type OutcomeClass = 'success' | 'partial' | 'failure';

export interface Item { id: string; name: string; tier: Tier; description: string }

export interface Orbit {
  id: OrbitId; name: string; destination: Destination; altitudeKm: number; periodMin: number;
  sunFraction: number; eclipseMin: number; solarFactor: number;
  insertionDvMs: number; stationKeepingDvMsPerYear: number; disposalDvMs: number;
  naturalLifetimeYears: number; commsFactor: number; contactHours: Record<GroundNetworkId, number>;
  lightDelaySec: number; radiation: number; opsCostMPerYear: number; cruiseMonths: number;
  magnetorquersWork: boolean; isNearEarth: boolean; debrisRule: boolean;
  description: string; pros: string[]; cons: string[];
}
export interface LaunchVehicle extends Item {
  classNote: string; capacityKg: Partial<Record<Destination, number>>; costM: number;
  costPerKgM?: number; minCostM?: number; reliability: number; scheduleIntervalMonths?: number;
}
export interface Bus extends Item { massKg: number; costM: number; baseLoadW: number; instrumentSlots: number;
  maxMassKg: number; hasSpareWheel: boolean }
export interface SolarArray extends Item { wPerKg: number; costMPerW: number; degradationPerYear: number }
export interface Rtg extends Item { massKg: number; powerW: number; costM: number; decayPerYear: number }
export interface Battery extends Item { whPerKg: number; costMPerWh: number; depthOfDischarge: number }
export interface Computer extends Item { massKg: number; powerW: number; costM: number; storageGbit: number;
  compression: number; autonomy: boolean; radHard: boolean }
export interface Adcs extends Item { massKg: number; powerW: number; costM: number; pointingDeg: number;
  nearEarthOnly: boolean }
export interface Propulsion extends Item { dryMassKg: number; ispS: number; costM: number; powerW: number;
  maxPropellantKg?: number; electric: boolean }
export interface Radio extends Item { massKg: number; powerW: number; costM: number; baseRateMbps: number;
  maxRateMbps: number; nearEarthOnly: boolean; rainFade: boolean }
export interface Hga extends Item { massKg: number; costM: number; gain: number; maxPointingDeg: number }
export interface GroundNetwork { id: GroundNetworkId; name: string; gain: number; costMPerYear: number;
  description: string }
export interface Instrument extends Item {
  massKg: number; powerW: number; costM: number; dataGbitPerDay: number; pointingReqDeg: number;
  tags: string[]; baseScience: number; devMonths: number; whatItMeasures: string; special?: 'particle_warning';
}
export interface Components {
  buses: Bus[]; solarArrays: SolarArray[]; rtg: Rtg; batteries: Battery[]; computers: Computer[];
  adcs: Adcs[]; propulsion: Propulsion[]; radios: Radio[]; hga: Hga; groundNetworks: GroundNetwork[];
}
export interface Scenario {
  id: ScenarioId; name: string; tagline: string; defaultDifficulty: DifficultyId; briefing: string;
  requiredTagGroups: string[][]; orbitFit: Partial<Record<OrbitId, number>>; minLifetimeYears: number;
  budgetM: number; launchWindowMonths: number; hardLaunchWindow: boolean; scienceTarget: number;
  tagWeights: Record<string, number>; defaultTagWeight: number; eventPool: string[]; eventCount: number;
  recommendedOrbit: OrbitId; learningGoals: string[]; userSegment: string; twins: MissionTwin[];
}
export interface MissionTwin { name: string; agency: string; launchYear: number; orbit: OrbitId; keyTags: string[];
  fact: string }
export interface Difficulty { id: DifficultyId; name: string; budgetMult: number; eventMult: number;
  launchFailures: boolean; advancedUnlocked: boolean; hints: boolean; decisionTimerSec: number; description: string }

export type EffectType = 'loseScienceDays' | 'scienceMult' | 'powerMult' | 'contactLossDays' | 'costM' | 'deltaVUse'
  | 'scienceBonusPct' | 'pointingMult' | 'lifetimeYearsDelta' | 'dataMult' | 'endMission' | 'downgradeGround'
  | 'immunity' | 'batteryMult' | 'relayMult';
export interface EventEffect { type: EffectType; value?: number; days?: number; reason?: string; eventId?: string }
export interface EventRisk {
  chance: number;                                                       // base chance 0..1
  chanceRule?: 'power_margin_after_hit' | 'battery_below_required';     // dynamic chance (A8.8)
  chanceIfRule?: number;                                                // chance used when the rule is true
  effects: EventEffect[];
  reductions?: { ifInstrument?: string; ifComputer?: string; mult: number }[];
}
export interface EventOption {
  id: string; label: string; description: string; effects: EventEffect[]; risk?: EventRisk; good: boolean;
  requires?: { propulsion?: boolean; nearEarth?: boolean; busSpareWheel?: boolean; reservePctOfBudget?: number;
    autonomyIfDelayOverSec?: number };
  explanation: string; badExplanation?: string;
}
export interface GameEvent {
  id: string; title: string; ownerRole: Role; description: string; conceptId: string;
  conditions?: { orbits?: OrbitId[]; adcsIn?: string[]; needsEclipse?: boolean };
  weightIfRadio?: { radioId: string; weight: number };
  autoEffects?: EventEffect[]; autoHandledByComputer?: string; autoHandledText?: string;
  options: EventOption[]; defaultOptionId: string; defaultOptionIdIfNoPropulsion?: string;
}

export interface DesignPlanner { orbitId: OrbitId; lifetimeYears: number; launchVehicleId: string;
  deltaVMarginPct: number }
export interface DesignEngineer { busId: string; solarArrayId: string | 'none'; solarArrayW: number; rtgCount: number;
  batteryId: string; batteryWh: number; computerId: string; adcsId: string; propulsionId: string }
export interface DesignScience { instrumentIds: string[] }
export interface DesignComms { radioId: string; hga: boolean; groundNetworkId: GroundNetworkId }
export interface Design { planner: DesignPlanner; engineer: DesignEngineer; science: DesignScience; comms: DesignComms }
export type BudgetSplit = Record<Role, number>;   // percents, sum 100

export interface Line { label: string; value: number; role: Role }
export interface Budgets {
  mass: { dryKg: number; propellantKg: number; tankKg: number; totalKg: number; busMaxKg: number;
    launchCapacityKg: number | null; launchMarginPct: number | null; lines: Line[] };
  power: { generationW: number; loadW: number; marginPct: number; rtgW: number; batteryWh: number;
    batteryRequiredWh: number; batteryOk: boolean; eclipseMin: number; lines: Line[] };
  data: { generatedGbitPerDay: number; downlinkGbitPerDay: number; rateMbps: number; contactHoursPerDay: number;
    returnPct: number; storageGbit: number; hgaEffective: boolean };
  deltaV: { requiredMs: number; withMarginMs: number; capabilityMs: number; ispS: number; feasible: boolean };
  cost: { byRole: Record<Role, number>; allocationM: Record<Role, number>; launchM: number; opsM: number; delayM: number;
    totalM: number; budgetM: number; reservePct: number; lines: Line[] };
  time: { devMonths: number; launchMonth: number; windowMonths: number; delayMonths: number; transferMonths: number;
    lifetimeYears: number };
  pointing: { adcsDeg: number; perInstrument: { id: string; reqDeg: number; quality: number }[] };
}
export interface Check { id: string; severity: Severity; role: Role; title: string; message: string; fixHint: string;
  conceptId: string }

export interface SimInput { scenarioId: ScenarioId; difficulty: DifficultyId; seed: number; design: Design;
  split: BudgetSplit }
export interface PendingEvent { index: number; day: number; event: GameEvent;
  options: (EventOption & { disabled: boolean; disabledReason?: string })[]; autoText?: string }
export interface Sample { day: number; generationW: number; loadW: number; duty: number; stored: number;
  dataGeneratedCum: number; dataReturnedCum: number; scienceCum: number; costCum: number }
export interface EventLogEntry { index: number; day: number; eventId: string; title: string; optionId: string | null;
  byRole: Role; bad: boolean; text: string }
export interface SimResult {
  outcome: Outcome; outcomeReason: string; endDay: number; plannedDays: number; achievedYears: number;
  dataGenerated: number; dataReturned: number; dataLost: number; scienceGenerated: number; scienceReturned: number;
  extraCostM: number; finalTotalCostM: number; samples: Sample[]; events: EventLogEntry[];
}
export interface Simulation {
  readonly day: number; readonly pendingEvent: PendingEvent | null; readonly done: boolean;
  step(days: number): void;            // advances; stops early at an event or the end
  decide(optionId: string): void;      // resolves pendingEvent
  current(): Sample;                   // latest values for the live dashboard
  result(): SimResult;                 // valid when done
}
export interface Insight { kind: 'good' | 'bad'; role: Role; text: string; conceptId: string }
export interface ScoreReport {
  total: number; stars: 0 | 1 | 2 | 3; outcomeClass: OutcomeClass; rankTitle: string;
  parts: { objectives: number; science: number; efficiency: number; operations: number; teamwork: number };
  roleGoals: Record<Role, { met: boolean; text: string }>;
  insights: Insight[]; tryNext: string[];
}
export interface TeamContext { reviewDone: boolean; failChecksAtLaunch: number }
export interface Maturity { cml: 2 | 3 | 4; name: 'Initial Feasibility' | 'Trade Space' | 'Point Design';
  greenPct: number; green: number; yellow: number; red: number }
export type SweepParam = 'lifetimeYears' | 'solarArrayW' | 'batteryWh' | 'deltaVMarginPct' | 'busId' | 'radioId'
  | 'groundNetworkId' | 'launchVehicleId' | 'adcsId';
export interface SweepPoint { value: number | string; label: string; scienceEst: number; scienceEstPctOfTarget: number;
  totalCostM: number; launchMarginPct: number | null; powerMarginPct: number; returnPct: number; failCount: number;
  isCurrent: boolean }

// ---- Additions from Part B, Step 1 ----
export interface Catalog {
  orbits: Orbit[]; launchVehicles: LaunchVehicle[]; components: Components; instruments: Instrument[];
  scenarios: Scenario[]; difficulties: Difficulty[]; events: GameEvent[];
  glossary: GlossaryEntry[];
  checksText: Record<string, { title: string; fail?: string; warn?: string; pass: string; fixHint: string }>;
  dialog: Record<string, DialogLine[]>; characters: Character[]; constants: Constants;
}
export interface GlossaryEntry { id: string; term: string;
  category: 'orbits' | 'rockets' | 'power' | 'data' | 'spacecraft' | 'mission';
  short: string; long: string; example: string; related: string[] }
export interface DialogLine { speaker: string; expr: 'neutral' | 'happy' | 'worried'; text: string; target?: string }
export interface Character { id: string; name: string; from: string; role: Role | 'npc'; playable: boolean;
  title: string; bio: string; lines: { success: string; failure: string; warning: string } }
export interface Constants { G0: number; SOLAR_EFFICIENCY: number; INTEGRATION_OVERHEAD: number; TANK_FRACTION: number;
  RADIO_STANDBY_W: number; MIN_BATTERY_WH: number; HGA_MAX_POINTING_DEG: number; DELAY_COST_M_PER_MONTH: number;
  BASE_DEV_MONTHS: number; ADVANCED_DEV_MONTHS: number; MARS_SYNODIC_MONTHS: number; ELECTRIC_MIN_W: number;
  ELECTRIC_DV_PER_MONTH: number; MAX_LIFETIME_YEARS: number; DAYS_PER_YEAR: number }
export interface SharePayload { v: 1; scenarioId: ScenarioId; difficulty: DifficultyId; seed: number; teamName: string;
  design: Design; split: BudgetSplit; decisions: Record<number, string> }
