import { describe, expect, it } from 'vitest';
import { agencyRank, CAREER_ORDER, isUnlocked, recordCareerFlight, reputation, resetCareer } from '../../state/career';
import type { ScoreReport } from '../types';

const score = (total: number, stars: 0 | 1 | 2 | 3, outcomeClass: ScoreReport['outcomeClass']) =>
  ({ total, stars, outcomeClass } as ScoreReport);

describe('agency career (F-31)', () => {
  it('unlocks missions in order on success only, and keeps the best stars', () => {
    resetCareer();
    let s: Parameters<typeof isUnlocked>[0] = {};
    expect(isUnlocked(s, 0)).toBe(true);
    expect(isUnlocked(s, 1)).toBe(false);
    expect(recordCareerFlight('nile_watch', score(500, 1, 'partial'))).toBeNull();      // partial: nothing unlocks
    expect(recordCareerFlight('nile_watch', score(900, 3, 'success'))).toBe('storm_watch');
    expect(recordCareerFlight('nile_watch', score(600, 1, 'success'))).toBeNull();      // already unlocked
    // read back through the public helpers
    s = { nile_watch: { stars: 3, score: 900, success: true, flights: 3 } };
    expect(isUnlocked(s, 1)).toBe(true);
    expect(isUnlocked(s, 2)).toBe(false);
    expect(reputation(s)).toBe(3);
    expect(CAREER_ORDER).toHaveLength(5);
  });
  it('ranks the agency by reputation', () => {
    expect(agencyRank(0)).toBe('Garage Team');
    expect(agencyRank(4)).toBe('Start-up Agency');
    expect(agencyRank(15)).toBe('Flagship Agency');
  });
});
