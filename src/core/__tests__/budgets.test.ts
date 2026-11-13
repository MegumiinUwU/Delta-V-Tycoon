import { describe, expect, it } from 'vitest';
import { computeBudgets, DEFAULT_SPLIT } from '../budgets';
import type { Design, ScenarioId } from '../types';
import { A17, type RefRow } from './refDesigns';

const near = (actual: number, expected: number, tol = 0.15) =>
  expect(Math.abs(actual - expected), `got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tol);

describe('A17 reference designs', () => {
  for (const row of A17) {
    it(row.name, () => {
      const b = computeBudgets(row.design, row.scenarioId, 'engineer', DEFAULT_SPLIT);
      near(b.mass.totalKg, row.totalKg);
      near(b.mass.launchMarginPct!, row.launchMargin);
      near(b.power.loadW, row.loadW);
      near(b.power.generationW, row.genW);
      near(b.power.marginPct, row.powerMargin);
      near(b.power.batteryRequiredWh, row.batteryReqWh, 0.5); // table rounds Wh to integers
      near(b.data.downlinkGbitPerDay, row.downlink);
      near(b.data.returnPct, row.returnPct, 0.5);
      // A17's cost column excludes the launch-delay cost (see red_relay / first_light); compare without it.
      near(b.cost.totalM - b.cost.delayM, row.costM);
      expect(b.cost.delayM).toBeCloseTo(row.delayM, 6);
    });
  }
});

describe('time rules (B5)', () => {
  const base = (scenarioId: ScenarioId, patch: (d: Design) => void): Design => {
    const d = structuredClone(A17.find((r) => r.scenarioId === scenarioId)!.design);
    patch(d);
    return d;
  };
  it('red_relay basic parts + sounder_atm → launchMonth 52, delay cost 39', () => {
    const d = base('red_relay', (d) => {
      d.engineer.solarArrayId = 'sa_si'; d.engineer.computerId = 'obc_basic'; d.science.instrumentIds = ['sounder_atm'];
    });
    const b = computeBudgets(d, 'red_relay', 'engineer', DEFAULT_SPLIT);
    expect(b.time.devMonths).toBe(30);
    expect(b.time.launchMonth).toBe(52);
    expect(b.cost.delayM).toBeCloseTo(39, 6);
  });
  it('rideshare with only cam_wide → launchMonth 20', () => {
    const d = base('nile_watch', (d) => { d.planner.launchVehicleId = 'rideshare'; d.science.instrumentIds = ['cam_wide']; });
    const b = computeBudgets(d, 'nile_watch', 'engineer', DEFAULT_SPLIT);
    expect(b.time.devMonths).toBe(18);
    expect(b.time.launchMonth).toBe(20);
  });
  it('rideshare cannot reach LEO', () => {
    const d = base('nile_watch', (d) => { d.planner.launchVehicleId = 'rideshare'; d.planner.orbitId = 'leo'; });
    expect(computeBudgets(d, 'nile_watch', 'engineer', DEFAULT_SPLIT).mass.launchCapacityKg).toBeNull();
  });
  it('cold gas propellant is capped at 20 kg', () => {
    const d = base('nile_watch', (d) => { d.engineer.propulsionId = 'prop_coldgas'; d.planner.lifetimeYears = 10; });
    const b = computeBudgets(d, 'nile_watch', 'engineer', DEFAULT_SPLIT);
    expect(b.mass.propellantKg).toBeLessThanOrEqual(20);
    expect(b.deltaV.capabilityMs).toBeLessThan(b.deltaV.withMarginMs);
  });
});

export type { RefRow };
