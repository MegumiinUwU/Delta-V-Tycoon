// Balance report for the Lead (Part B Step 8). Run: npx tsx scripts/balance.ts [seeds=200]
import { computeBudgets, DEFAULT_SPLIT } from '../src/core/budgets';
import { getCatalog } from '../src/core/catalog';
import { runChecks } from '../src/core/checks';
import { defaultDesign, isUnlocked } from '../src/core/design';
import { mulberry32 } from '../src/core/rng';
import { scoreMission } from '../src/core/score';
import { goodChoice, simulateAll, simulateWith } from '../src/core/sim';
import type { Design, DifficultyId, Scenario, SimInput } from '../src/core/types';
import { A17 } from '../src/core/__tests__/refDesigns';

const SEEDS = Number(process.argv[2] ?? 200);
const cat = getCatalog();

interface Stats { min: number; med: number; max: number; success: number; stars: number }
function run(scenario: Scenario, difficulty: DifficultyId, design: Design, good: boolean): Stats {
  const scores: number[] = []; let success = 0, stars = 0;
  const fails = runChecks(design, scenario.id, difficulty, DEFAULT_SPLIT).filter((c) => c.severity === 'fail').length;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const input: SimInput = { scenarioId: scenario.id, difficulty, seed, design, split: DEFAULT_SPLIT };
    const r = good ? simulateWith(input, goodChoice) : simulateAll(input, {});
    const s = scoreMission(input, r, { reviewDone: true, failChecksAtLaunch: fails });
    scores.push(s.total); if (s.outcomeClass === 'success') success++; stars += s.stars;
  }
  scores.sort((a, b) => a - b);
  return { min: scores[0], med: scores[Math.floor(scores.length / 2)], max: scores[scores.length - 1],
    success: (success / SEEDS) * 100, stars: stars / SEEDS };
}

const pick = <T>(rng: () => number, xs: T[]): T => xs[Math.floor(rng() * xs.length)];

/** Semi-smart random design: random choices, then sized power/battery so it has a chance to pass. */
function randomDesign(s: Scenario, difficulty: DifficultyId, rng: () => number): Design {
  const ok = (id: string) => isUnlocked(id, difficulty, s.id);
  const k = cat.components;
  const orbits = Object.keys(s.orbitFit) as Design['planner']['orbitId'][];
  const instruments: string[] = [];
  for (const g of s.requiredTagGroups) {
    const c = cat.instruments.filter((i) => ok(i.id) && i.tags.some((t) => g.includes(t)));
    if (c.length) instruments.push(pick(rng, c).id);
  }
  if (rng() < 0.5) {
    const extra = cat.instruments.filter((i) => ok(i.id) && !instruments.includes(i.id) && (s.tagWeights[i.tags[0]] ?? s.defaultTagWeight) >= 0.5);
    if (extra.length) instruments.push(pick(rng, extra).id);
  }
  const d: Design = {
    planner: { orbitId: pick(rng, orbits), lifetimeYears: Math.max(s.minLifetimeYears, Math.round((s.minLifetimeYears + rng() * 3) * 2) / 2),
      launchVehicleId: pick(rng, cat.launchVehicles.filter((v) => ok(v.id))).id, deltaVMarginPct: pick(rng, [10, 15, 20, 30]) },
    engineer: { busId: pick(rng, k.buses.filter((b) => ok(b.id) && b.id !== 'bus_cube')).id,
      solarArrayId: pick(rng, k.solarArrays.filter((a) => ok(a.id))).id, solarArrayW: 500, rtgCount: 0,
      batteryId: pick(rng, k.batteries.filter((b) => ok(b.id))).id, batteryWh: 500,
      computerId: pick(rng, k.computers.filter((c) => ok(c.id))).id, adcsId: pick(rng, k.adcs.filter((a) => ok(a.id) && a.id !== 'adcs_mag')).id,
      propulsionId: pick(rng, k.propulsion.filter((p) => ok(p.id) && p.id !== 'prop_none' && p.id !== 'prop_coldgas')).id },
    science: { instrumentIds: instruments },
    comms: { radioId: pick(rng, k.radios.filter((r) => ok(r.id) && r.id !== 'radio_uhf')).id, hga: rng() < 0.5,
      groundNetworkId: pick(rng, k.groundNetworks).id },
  };
  for (let i = 0; i < 3; i++) {   // size power and battery to the load
    const b = computeBudgets(d, s.id, difficulty, DEFAULT_SPLIT);
    const perW = (b.power.generationW - b.power.rtgW) / Math.max(1, d.engineer.solarArrayW);
    d.engineer.solarArrayW = Math.min(6000, Math.ceil((b.power.loadW * (1.2 + rng() * 0.3)) / Math.max(1e-6, perW) / 50) * 50);
    d.engineer.batteryWh = Math.min(5000, Math.ceil((b.power.batteryRequiredWh * (1 + rng() * 0.3)) / 50) * 50);
  }
  return d;
}

const pad = (x: unknown, n: number) => String(x).padEnd(n);
const row = (label: string, st: Stats) =>
  `  ${pad(label, 26)} min ${pad(st.min, 5)} med ${pad(st.med, 5)} max ${pad(st.max, 5)} success ${pad(st.success.toFixed(0) + '%', 5)} stars ${st.stars.toFixed(2)}`;

console.log(`Delta-V Tycoon balance report — ${SEEDS} seeds per row\n`);
for (const s of cat.scenarios) {
  const diff = s.defaultDifficulty;
  console.log(`${s.name} (${s.id}, ${diff})`);
  const ref = A17.find((r) => r.scenarioId === s.id && r.name !== 'bad example');
  if (ref) {
    console.log(row('A17 reference / default', run(s, diff, ref.design, false)));
    console.log(row('A17 reference / all good', run(s, diff, ref.design, true)));
  }
  const def = defaultDesign(s.id, diff);
  console.log(row('starter design / default', run(s, diff, def, false)));
  console.log(row('starter design / all good', run(s, diff, def, true)));

  const rng = mulberry32(0xdeadbeef ^ s.id.length * 7919);
  const found: { d: Design; st: Stats }[] = [];
  for (let tries = 0; tries < 3000 && found.length < 20; tries++) {
    const d = randomDesign(s, diff, rng);
    if (runChecks(d, s.id, diff, DEFAULT_SPLIT).some((c) => c.severity === 'fail')) continue;
    found.push({ d, st: run(s, diff, d, true) });
  }
  found.sort((a, b) => b.st.med - a.st.med);
  console.log(`  random valid designs found: ${found.length}/20; best 3:`);
  for (const f of found.slice(0, 3)) {
    const p = f.d.planner, e = f.d.engineer, c = f.d.comms;
    console.log(row(`${p.orbitId} ${p.lifetimeYears}y ${p.launchVehicleId}`, f.st));
    console.log(`      ${e.busId} ${e.solarArrayId} ${e.solarArrayW} W, ${e.batteryId} ${e.batteryWh} Wh, ${e.computerId}, ${e.adcsId}, ${e.propulsionId} | ${f.d.science.instrumentIds.join(' + ')} | ${c.radioId}${c.hga ? ' + hga' : ''}, ${c.groundNetworkId}`);
  }
  console.log('');
}
