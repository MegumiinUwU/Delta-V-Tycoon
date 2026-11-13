import { describe, expect, it } from 'vitest';
import { DEFAULT_SPLIT } from '../budgets';
import { runChecks } from '../checks';
import { conceptMaturity, estimateScience, findMissionTwin, tradeSweep } from '../explore';
import { A17 } from './refDesigns';

const ref = (n: string) => structuredClone(A17.find((r) => r.name === n)!);

describe('v1.1 core additions', () => {
  it('conceptMaturity follows the 80% / no-red rule', () => {
    const mk = (p: number, w: number, f: number) => [
      ...Array(p).fill({ severity: 'pass' }), ...Array(w).fill({ severity: 'warn' }), ...Array(f).fill({ severity: 'fail' }),
    ];
    expect(conceptMaturity(mk(8, 2, 0) as never).cml).toBe(4);
    expect(conceptMaturity(mk(9, 0, 1) as never).cml).toBe(3);
    expect(conceptMaturity(mk(4, 6, 0) as never).cml).toBe(2);
    const bad = ref('bad example');
    expect(conceptMaturity(runChecks(bad.design, 'sandbox', 'engineer', DEFAULT_SPLIT)).red).toBeGreaterThan(0);
  });
  it('findMissionTwin picks the closest real mission', () => {
    expect(findMissionTwin(ref('nile_watch').design, 'nile_watch')!.name).toBe('Landsat 9');
    expect(findMissionTwin(ref('ice_hunter').design, 'ice_hunter')!.name).toBe('Lunar Reconnaissance Orbiter');
    expect(findMissionTwin(ref('first_light').design, 'first_light')!.name).toBe('James Webb Space Telescope');
    expect(findMissionTwin(ref('red_relay').design, 'sandbox')).not.toBeNull();
  });
  it('estimateScience grows with lifetime and tradeSweep marks the current point', () => {
    const d = ref('nile_watch').design;
    const s3 = estimateScience(d, 'nile_watch', 'cadet', DEFAULT_SPLIT);
    d.planner.lifetimeYears = 5;
    expect(estimateScience(d, 'nile_watch', 'cadet', DEFAULT_SPLIT)).toBeGreaterThan(s3);
    const pts = tradeSweep(d, 'nile_watch', 'cadet', DEFAULT_SPLIT, 'lifetimeYears');
    expect(pts.filter((p) => p.isCurrent)).toHaveLength(1);
    const radios = tradeSweep(d, 'nile_watch', 'cadet', DEFAULT_SPLIT, 'radioId');
    expect(radios.length).toBe(4);
    expect(radios.find((p) => p.value === 'radio_uhf')!.returnPct).toBeLessThan(5);
  });
});
