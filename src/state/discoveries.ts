// Discovery log: knowledge as visible progress (players learn concepts in context, not from a manual).
// A concept is logged the moment the game actually teaches it — a NO-GO/warning you review, an event that hits
// your mission, a "Why" insight in the report, or an Academy entry you open. Entries link to each other through
// glossary.related, so the log grows into a web rather than a checklist. Persisted per browser (try/catch).
import { useSyncExternalStore } from 'react';
import { getCatalog } from '../core';
import { load, save } from './storage';
import { useGame } from './store';

const KEY = 'dvt.discoveries';
let found = new Set<string>(load<string[]>(KEY, []));
const listeners = new Set<() => void>();
let snapshot = found;

const known = () => new Set(getCatalog().glossary.map((g) => g.id));

/** Logs concepts; returns the ones that were new. Shows one batched toast unless silent. */
export function discover(ids: (string | undefined | null)[], opts: { silent?: boolean } = {}): string[] {
  const valid = known();
  const fresh = [...new Set(ids)].filter((id): id is string => !!id && valid.has(id) && !found.has(id));
  if (!fresh.length) return [];
  found = new Set([...found, ...fresh]);
  snapshot = found;
  save(KEY, [...found]);
  listeners.forEach((l) => l());
  if (!opts.silent) {
    const terms = fresh.map((id) => getCatalog().glossary.find((g) => g.id === id)?.term ?? id);
    const shown = terms.slice(0, 2).join(', ') + (terms.length > 2 ? ` +${terms.length - 2}` : '');
    useGame.getState().toast(`New in your discovery log: ${shown} (${found.size}/${valid.size})`, 'good', [
      { label: 'Read', run: () => useGame.getState().set({ glossaryId: fresh[0] }) },
    ]);
  }
  return fresh;
}

export function resetDiscoveries(): void {
  found = new Set(); snapshot = found; save(KEY, []); listeners.forEach((l) => l());
}

/** React hook: the current set of discovered concept ids. */
export function useDiscoveries(): Set<string> {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => snapshot, () => snapshot);
}

/** Watches the game store and logs concepts at the moments the game teaches them. Call once at startup. */
export function startDiscoveryTracking(): () => void {
  let lastEvent: number | null = null;
  return useGame.subscribe((s, prev) => {
    // Opening the readiness review: every concept behind a warning or NO-GO you are looking at
    if (s.reviewOpen && !prev.reviewOpen) discover(s.checks.filter((c) => c.severity !== 'pass').map((c) => c.conceptId));
    // Reading an Academy entry (drawer or "?" buttons) logs it quietly — you chose to learn it
    if (s.glossaryId && s.glossaryId !== prev.glossaryId) discover([s.glossaryId], { silent: true });
    // A random event hitting your mission
    const pending = s.sim?.pendingEvent;
    if (pending && pending.index !== lastEvent) { lastEvent = pending.index; discover([pending.event.conceptId]); }
    if (!s.sim) lastEvent = null;
    // The mission report's "Why" section
    if (s.score && !prev.score) discover(s.score.insights.map((i) => i.conceptId));
  });
}
