// Agency career (F-31): the five missions in order, small to flagship. A mission unlocks when the previous one is
// flown to a "success"; reputation is the sum of your best stars per mission. Saved per browser (try/catch).
// Not included (needs a core contract change, Lead decision): reputation raising the next mission's budget.
import { useSyncExternalStore } from 'react';
import type { ScenarioId, ScoreReport } from '../core';
import { load, save } from './storage';

export const CAREER_ORDER: ScenarioId[] = ['nile_watch', 'storm_watch', 'ice_hunter', 'red_relay', 'first_light'];
export interface CareerEntry { stars: number; score: number; success: boolean; flights: number }
type CareerState = Partial<Record<ScenarioId, CareerEntry>>;

const KEY = 'dvt.career';
let state: CareerState = load<CareerState>(KEY, {});
const listeners = new Set<() => void>();

export const isUnlocked = (s: CareerState, i: number): boolean => i === 0 || !!s[CAREER_ORDER[i - 1]]?.success;
export const reputation = (s: CareerState): number => CAREER_ORDER.reduce((n, id) => n + (s[id]?.stars ?? 0), 0);
export const REPUTATION_MAX = CAREER_ORDER.length * 3;
export function agencyRank(rep: number): string {
  return rep >= 13 ? 'Flagship Agency' : rep >= 9 ? 'National Space Agency' : rep >= 5 ? 'Regional Agency' : rep >= 1 ? 'Start-up Agency' : 'Garage Team';
}

/** Records a career flight; returns the scenario that this flight newly unlocked, if any. */
export function recordCareerFlight(scenarioId: ScenarioId, score: ScoreReport): ScenarioId | null {
  const i = CAREER_ORDER.indexOf(scenarioId);
  if (i < 0) return null;
  const wasUnlocked = isUnlocked(state, i + 1);
  const prev = state[scenarioId];
  const success = score.outcomeClass === 'success';
  state = {
    ...state,
    [scenarioId]: {
      stars: Math.max(prev?.stars ?? 0, score.stars), score: Math.max(prev?.score ?? 0, score.total),
      success: (prev?.success ?? false) || success, flights: (prev?.flights ?? 0) + 1,
    },
  };
  save(KEY, state);
  listeners.forEach((l) => l());
  const next = CAREER_ORDER[i + 1];
  return next && !wasUnlocked && isUnlocked(state, i + 1) ? next : null;
}

export function resetCareer(): void { state = {}; save(KEY, state); listeners.forEach((l) => l()); }

export function useCareer(): CareerState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => state);
}
