// localStorage helpers. Every access is wrapped: storage may be blocked, and nothing important lives only here.
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
export function save(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export interface Settings { volume: number; muted: boolean; voices: boolean; textScale: 1 | 1.25 | 1.5; reducedMotion: boolean }
const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DEFAULT_SETTINGS: Settings = { volume: 0.7, muted: false, voices: true, textScale: 1, reducedMotion: prefersReduced };
export interface SavedDesign { name: string; code: string; at: number; score?: number }
export interface Attempt { at: number; score: number; designCode: string;
  // added for attempt history (F-15); older saved attempts may lack them
  scenarioId?: string; difficulty?: string; stars?: number; outcomeClass?: string }
export const KEYS = { settings: 'dvt.settings', attempts: 'dvt.attempts', saved: 'dvt.saved', tutorial: 'dvt.tutorialDone' } as const;
