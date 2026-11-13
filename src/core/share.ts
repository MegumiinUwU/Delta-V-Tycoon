// Design share codes and challenge codes (Part A §A13 "Codes").
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { getCatalog } from './catalog';
import { findAnyItem } from './catalog';
import type { DifficultyId, ScenarioId, SharePayload } from './types';
import { ROLES } from './types';

export function encodeDesign(p: SharePayload): string {
  return compressToEncodedURIComponent(JSON.stringify(p));
}

/** Returns null for anything malformed or referencing unknown ids. */
export function decodeDesign(code: string): SharePayload | null {
  try {
    const json = decompressFromEncodedURIComponent(code);
    if (!json) return null;
    const p = JSON.parse(json) as SharePayload;
    if (!p || p.v !== 1) return null;
    const c = getCatalog();
    if (!c.scenarios.some((s) => s.id === p.scenarioId)) return null;
    if (!c.difficulties.some((d) => d.id === p.difficulty)) return null;
    if (typeof p.seed !== 'number' || !p.design) return null;
    const { planner, engineer, science, comms } = p.design;
    if (!c.orbits.some((o) => o.id === planner?.orbitId)) return null;
    const ids = [planner.launchVehicleId, engineer?.busId, engineer.batteryId, engineer.computerId, engineer.adcsId,
      engineer.propulsionId, comms?.radioId, ...(science?.instrumentIds ?? [])];
    if (engineer.solarArrayId !== 'none') ids.push(engineer.solarArrayId);
    if (ids.some((id) => typeof id !== 'string' || !findAnyItem(id))) return null;
    if (!c.components.groundNetworks.some((g) => g.id === comms.groundNetworkId)) return null;
    if (!p.split || ROLES.some((r) => typeof p.split[r] !== 'number')) return null;
    return { ...p, teamName: String(p.teamName ?? '').slice(0, 24), decisions: p.decisions ?? {} };
  } catch {
    return null;
  }
}

export function encodeChallenge(s: ScenarioId, d: DifficultyId, seed: number): string {
  return `DVT-${s}-${d}-${(seed >>> 0).toString(36)}`;
}

export function decodeChallenge(code: string): { scenarioId: ScenarioId; difficulty: DifficultyId; seed: number } | null {
  const m = /^DVT-([a-z_]+)-(cadet|engineer|director)-([0-9a-z]+)$/.exec(code.trim());
  if (!m) return null;
  if (!getCatalog().scenarios.some((s) => s.id === m[1])) return null;
  const seed = parseInt(m[3], 36);
  if (!Number.isFinite(seed) || seed > 0xffffffff) return null;
  return { scenarioId: m[1] as ScenarioId, difficulty: m[2] as DifficultyId, seed };
}
