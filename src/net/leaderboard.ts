// Leaderboard: local (P1, localStorage) and online (P2, Firebase, verified by replay).
import { runChecks } from '../core/checks';
import { scoreMission } from '../core/score';
import { decodeDesign } from '../core/share';
import { simulateAll } from '../core/sim';
import type { DifficultyId, ScenarioId } from '../core/types';

export interface LeaderboardEntry {
  teamName: string; scenarioId: ScenarioId; difficulty: DifficultyId; seed: number; score: number; stars: number;
  outcome: string; designCode: string; at: number;
}

const KEY = 'dvt.leaderboard';
let memory: LeaderboardEntry[] = [];

function readLocal(): LeaderboardEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as LeaderboardEntry[];
  } catch { /* private mode / blocked storage: keep the in-memory copy */ }
  return memory;
}
function writeLocal(list: LeaderboardEntry[]) {
  memory = list;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(list)); } catch { /* keep in memory */ }
}

export function addLocal(entry: LeaderboardEntry): void {
  writeLocal([...readLocal(), { ...entry, teamName: entry.teamName.slice(0, 24) }].slice(-200));
}

/** Sorted best first. Filter by scenario and/or challenge seed. */
export function listLocal(scenarioId?: ScenarioId, challengeSeed?: number): LeaderboardEntry[] {
  return readLocal()
    .filter((e) => (!scenarioId || e.scenarioId === scenarioId) && (challengeSeed == null || e.seed === challengeSeed))
    .sort((a, b) => b.score - a.score || a.at - b.at);
}

/** Recomputes the score from the design code; true if it matches within 1 point. */
export function verifyEntry(e: LeaderboardEntry): boolean {
  const p = decodeDesign(e.designCode);
  if (!p || p.scenarioId !== e.scenarioId || p.difficulty !== e.difficulty || p.seed !== e.seed) return false;
  const input = { scenarioId: p.scenarioId, difficulty: p.difficulty, seed: p.seed, design: p.design, split: p.split };
  const result = simulateAll(input, p.decisions);
  const failChecksAtLaunch = runChecks(p.design, p.scenarioId, p.difficulty, p.split).filter((c) => c.severity === 'fail').length;
  // reviewDone is not in the share code, so accept either value.
  return [true, false].some((reviewDone) =>
    Math.abs(scoreMission(input, result, { reviewDone, failChecksAtLaunch }).total - e.score) <= 1);
}

export async function postOnline(entry: LeaderboardEntry): Promise<void> {
  const { db, ensureSignedIn } = await import('./firebase');
  const { push, ref, set } = await import('firebase/database');
  await ensureSignedIn();
  const r = push(ref(db, `leaderboard/${entry.scenarioId}`));
  await set(r, { ...entry, teamName: entry.teamName.slice(0, 24) });
}

/** Top 20 by score; entries that fail replay verification are hidden. */
export async function listOnline(scenarioId: ScenarioId): Promise<LeaderboardEntry[]> {
  const { db, ensureSignedIn } = await import('./firebase');
  const { get, limitToLast, orderByChild, query, ref } = await import('firebase/database');
  await ensureSignedIn();
  const snap = await get(query(ref(db, `leaderboard/${scenarioId}`), orderByChild('score'), limitToLast(20)));
  const list = Object.values((snap.val() ?? {}) as Record<string, LeaderboardEntry>);
  return list.filter(verifyEntry).sort((a, b) => b.score - a.score);
}
