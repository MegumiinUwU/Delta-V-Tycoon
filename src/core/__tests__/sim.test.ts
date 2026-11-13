import { describe, expect, it } from 'vitest';
import { DEFAULT_SPLIT } from '../budgets';
import { getCatalog } from '../catalog';
import { runChecks } from '../checks';
import { defaultDesign, isUnlocked } from '../design';
import { scoreMission } from '../score';
import { decodeChallenge, decodeDesign, encodeChallenge, encodeDesign } from '../share';
import { createSimulation, goodChoice, simulateAll, simulateWith } from '../sim';
import type { Design, DifficultyId, ScenarioId, SimInput } from '../types';
import { A17 } from './refDesigns';

const input = (scenarioId: ScenarioId, design: Design, seed = 12345, difficulty: DifficultyId = 'engineer'): SimInput =>
  ({ scenarioId, difficulty, seed, design, split: DEFAULT_SPLIT });
const ref = (name: string) => structuredClone(A17.find((r) => r.name === name)!);

describe('simulation', () => {
  it('is deterministic: same seed and decisions → identical result JSON', () => {
    for (const row of A17) {
      const a = simulateAll(input(row.scenarioId, row.design, 777), {});
      const b = simulateAll(input(row.scenarioId, row.design, 777), {});
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('A17 designs complete with full data return across many seeds with good decisions (cadet)', () => {
    for (const row of A17.filter((r) => r.name !== 'bad example')) {
      for (let seed = 1; seed <= 20; seed++) {
        const r = simulateWith(input(row.scenarioId, row.design, seed, 'cadet'), goodChoice);
        expect(['completed', 'ended_early'], `${row.name} seed ${seed}: ${r.outcomeReason}`).toContain(r.outcome);
        // (a discovery follow-up triples data for 5 days and may overflow storage a little — that is intended)
        expect(r.dataReturned / r.dataGenerated, `${row.name} seed ${seed}`).toBeGreaterThan(0.95);
      }
    }
  });

  it('launch over capacity → launch_failure', () => {
    const d = ref('nile_watch').design;
    d.engineer.batteryWh = 3000;   // +17 kg of battery → over Spark's 200 kg
    const r = simulateAll(input('nile_watch', d), {});
    expect(r.outcome).toBe('launch_failure');
    expect(r.outcomeReason).toBe('too heavy for the rocket');
  });

  it('prop_none in LEO with 5-year life → ended_early at 4 years', () => {
    const d = ref('bad example').design;
    d.planner.lifetimeYears = 5;
    const r = simulateAll(input('sandbox', d, 1, 'cadet'), {});
    expect(r.outcome).toBe('ended_early');
    expect(r.achievedYears).toBeCloseTo(4, 2);
  });

  it('insufficient insertion delta-v → orbit_failure', () => {
    const d = ref('storm_watch').design;
    d.engineer.propulsionId = 'prop_coldgas';
    expect(simulateAll(input('storm_watch', d, 1, 'cadet'), {}).outcome).toBe('orbit_failure');
  });

  it('a 10-year mission simulates in under 50 ms', () => {
    const d = ref('storm_watch').design;
    d.planner.lifetimeYears = 10;
    simulateAll(input('storm_watch', d, 3), {});   // warm up
    const t = performance.now();
    simulateAll(input('storm_watch', d, 3), {});
    expect(performance.now() - t).toBeLessThan(50);
  });

  it('stops at events and resumes after decide()', () => {
    const row = ref('red_relay');
    const sim = createSimulation(input('red_relay', row.design, 99, 'director'));
    let events = 0;
    while (!sim.done) {
      sim.step(30);
      if (sim.pendingEvent) {
        events++;
        const opt = sim.pendingEvent.options.find((o) => !o.disabled)!;
        sim.decide(opt.id);
      }
    }
    expect(events).toBeGreaterThan(0);
    expect(sim.result().events.length).toBeGreaterThan(0);
  });

  it('solar storm safe mode is disabled at Mars without autonomy', () => {
    const d = ref('red_relay').design;
    d.engineer.computerId = 'obc_basic';
    for (let seed = 1; seed < 200; seed++) {
      const sim = createSimulation(input('red_relay', d, seed, 'director'));
      while (!sim.done) {
        sim.step(1e6);
        const p = sim.pendingEvent;
        if (!p) continue;
        if (p.event.id === 'solar_storm') {
          const safe = p.options.find((o) => o.id === 'safe_mode')!;
          expect(safe.disabled).toBe(true);
          expect(safe.disabledReason).toContain('12.5 minutes');
          return;
        }
        sim.decide(p.options.find((o) => !o.disabled)!.id);
      }
    }
    throw new Error('no solar storm found in 200 seeds');
  });
});

describe('scoring and insights', () => {
  it('bad example produces "data return" and "pointing" insights', () => {
    const row = ref('bad example');
    const inp = input('sandbox', row.design, 5, 'cadet');
    const r = simulateAll(inp, {});
    const s = scoreMission(inp, r, { reviewDone: true, failChecksAtLaunch: 0 });
    const bad = s.insights.filter((i) => i.kind === 'bad').map((i) => i.text);
    expect(bad.some((t) => t.includes('of the data reached Earth'))).toBe(true);
    expect(bad.some((t) => t.includes('blurred to 20% quality'))).toBe(true);
    expect(s.tryNext.length).toBeGreaterThan(0);
    expect(s.tryNext.length).toBeLessThanOrEqual(3);
  });

  it('reference designs score in a sensible range and stay ≤ 1000', () => {
    for (const row of A17.filter((r) => r.name !== 'bad example')) {
      const inp = input(row.scenarioId, row.design, 42, 'cadet');
      const s = scoreMission(inp, simulateAll(inp, {}), { reviewDone: true, failChecksAtLaunch: 0 });
      expect(s.total).toBeLessThanOrEqual(1000);
      expect(s.total, row.name).toBeGreaterThan(450);
    }
  });

  it('launch failure zeroes objectives, science and operations', () => {
    const d = ref('nile_watch').design;
    d.engineer.batteryWh = 3000;
    const inp = input('nile_watch', d);
    const s = scoreMission(inp, simulateAll(inp, {}), { reviewDone: false, failChecksAtLaunch: 1 });
    expect(s.parts.objectives + s.parts.science + s.parts.operations).toBe(0);
    expect(s.outcomeClass).toBe('failure');
  });
});

describe('checks and defaults', () => {
  it('every scenario default design is valid and unlocked', () => {
    for (const sc of getCatalog().scenarios) for (const df of getCatalog().difficulties) {
      const d = defaultDesign(sc.id, df.id);
      const checks = runChecks(d, sc.id, df.id, DEFAULT_SPLIT);
      expect(checks.length).toBeGreaterThan(20);
      for (const id of [d.engineer.busId, d.engineer.computerId, d.engineer.adcsId, d.comms.radioId, ...d.science.instrumentIds])
        expect(isUnlocked(id, df.id, sc.id), `${sc.id}/${df.id}/${id}`).toBe(true);
    }
  });
  it('checks are sorted fail → warn → pass and messages are filled', () => {
    const c = runChecks(ref('bad example').design, 'sandbox', 'engineer', DEFAULT_SPLIT);
    const rank = { fail: 0, warn: 1, pass: 2 };
    for (let i = 1; i < c.length; i++) expect(rank[c[i].severity]).toBeGreaterThanOrEqual(rank[c[i - 1].severity]);
    for (const x of c) expect(x.message).not.toMatch(/\{\w+\}/);
    expect(c.find((x) => x.id === 'data_return')!.severity).toBe('fail');
    expect(c.find((x) => x.id === 'role_allocation_comms')).toBeTruthy();
  });
  it('isUnlocked: cadet locks advanced except required instruments', () => {
    expect(isUnlocked('titan', 'cadet', 'nile_watch')).toBe(false);
    expect(isUnlocked('tel_ir', 'cadet', 'first_light')).toBe(true);
    expect(isUnlocked('titan', 'cadet', 'sandbox')).toBe(true);
    expect(isUnlocked('titan', 'engineer', 'nile_watch')).toBe(true);
  });
});

describe('codes', () => {
  it('share code round trip', () => {
    const p = { v: 1 as const, scenarioId: 'red_relay' as const, difficulty: 'director' as const, seed: 4242, teamName: 'Cairo Comets',
      design: ref('red_relay').design, split: DEFAULT_SPLIT, decisions: { 0: 'observe' } };
    expect(decodeDesign(encodeDesign(p))).toEqual(p);
    expect(decodeDesign('garbage')).toBeNull();
  });
  it('challenge code round trip', () => {
    const code = encodeChallenge('storm_watch', 'engineer', 123456789);
    expect(code).toBe(`DVT-storm_watch-engineer-${(123456789).toString(36)}`);
    expect(decodeChallenge(code)).toEqual({ scenarioId: 'storm_watch', difficulty: 'engineer', seed: 123456789 });
    expect(decodeChallenge('DVT-nope-engineer-abc')).toBeNull();
  });
});
