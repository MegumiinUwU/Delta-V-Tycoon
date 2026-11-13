// Character voices: one clip per (speaker, text), recorded by scripts/art/voice_kokoro.py and listed in data/voice.json.
// Lines play one after another; each line belongs to an owner (a speech bubble), which can replace or cancel its own line.
import { useEffect, useId, useSyncExternalStore } from 'react';
import { voice as voiceUrl } from '../assets';
import manifest from '../data/voice.json';
import { audioState, duckMusic, onAudioChange } from './sound';
import { voiceId } from './voiceKey';

const clips: Record<string, number> = manifest.clips;   // clip id → seconds
const GAP_MS = 220;

interface Item { owner: string; id: string; onceKey?: string }
let queue: Item[] = [];
let current: { item: Item; el: HTMLAudioElement } | null = null;
const heard = new Map<string, string>();   // onceKey → last clip that was actually heard
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const enabled = () => { const a = audioState(); return a.voices && !a.muted; };
export const hasVoice = (speaker: string, text: string): boolean => clips[voiceId(speaker, text)] !== undefined;
/** Length of the recorded line in seconds (0 if there is none). */
export const voiceSeconds = (speaker: string, text: string): number => clips[voiceId(speaker, text)] ?? 0;

function next(): void {
  if (current || !audioState().unlocked || typeof Audio === 'undefined') return;
  const item = queue.shift();
  if (!item) { duckMusic(false); return; }
  const el = new Audio(voiceUrl(item.id));
  el.volume = audioState().volume;
  const done = () => {
    if (current?.el !== el) return;
    if (item.onceKey && el.ended) heard.set(item.onceKey, item.id);
    current = null;
    emit();
    setTimeout(next, GAP_MS);
  };
  el.addEventListener('ended', done);
  el.addEventListener('error', done);
  current = { item, el };
  duckMusic(true);
  el.play().catch(done);
  emit();
}

/** Stops and forgets the lines of one owner (or of everyone). */
export function hush(owner?: string): void {
  queue = owner ? queue.filter((q) => q.owner !== owner) : [];
  if (current && (!owner || current.item.owner === owner)) {
    const { el, item } = current;
    if (item.onceKey && el.currentTime > 1) heard.set(item.onceKey, item.id);
    current = null;
    el.pause();
    emit();
    next();
  }
}

/** Queues a line behind the ones already waiting. With `onceKey`, it is skipped if it was the last line heard under that key. */
export function say(owner: string, speaker: string, text: string, onceKey?: string): boolean {
  const id = voiceId(speaker, text);
  if (clips[id] === undefined || !enabled()) return false;
  if (onceKey && heard.get(onceKey) === id) return false;
  hush(owner);
  queue.push({ owner, id, onceKey });
  next();
  return true;
}

/** Speaks a line right away, cutting off whoever is talking (for lines the player asks for with a click). */
export function sayNow(owner: string, speaker: string, text: string): boolean {
  const id = voiceId(speaker, text);
  if (clips[id] === undefined || !enabled()) return false;
  hush();
  queue.push({ owner, id });
  next();
  return true;
}

onAudioChange(() => {
  if (!enabled()) { hush(); return; }
  if (current) current.el.volume = audioState().volume;
  next();   // the first click unlocks audio: start what was waiting
});

/** Speaks `text` when it appears or changes, and stops when the component leaves. `auto: false` only gives `replay`. */
export function useVoice(speaker: string, text: string, opts: { auto?: boolean; onceKey?: string } = {}):
  { has: boolean; speaking: boolean; replay: () => void } {
  const owner = useId();
  const { auto = true, onceKey } = opts;
  const has = hasVoice(speaker, text);
  useEffect(() => {
    if (!has) return;
    if (auto) say(owner, speaker, text, onceKey);
    return () => hush(owner);
  }, [owner, speaker, text, has, auto, onceKey]);
  const speaking = useSyncExternalStore(subscribe, () => current?.item.owner === owner, () => false);
  return { has, speaking, replay: () => { sayNow(owner, speaker, text); } };
}
