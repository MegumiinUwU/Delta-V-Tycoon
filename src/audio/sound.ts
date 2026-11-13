// Sound manager: small pool per sound, respects mute/volume, ignores missing files and autoplay errors.
// Character voice lines live in voice.ts.
import { audio } from '../assets';

export type Sfx = 'sfx_click' | 'sfx_hover' | 'sfx_success' | 'sfx_fail' | 'sfx_warning' | 'sfx_launch' | 'sfx_event'
  | 'sfx_signoff' | 'sfx_coin';
export type Music = 'music_menu' | 'music_ops';

let volume = 0.7, muted = false, voices = true, unlocked = false, ducked = false;
const listeners = new Set<() => void>();
const pools = new Map<string, HTMLAudioElement[]>();
const missing = new Set<string>();
let music: HTMLAudioElement | null = null, musicName: Music | null = null, wantedMusic: Music | null = null;

/** Music sits at half volume, and lower still while a character is speaking. */
const musicVolume = () => volume * (ducked ? 0.15 : 0.5);

export function setAudioSettings(v: number, m: boolean, vo = true): void {
  volume = v; muted = m; voices = vo;
  if (music) { music.volume = musicVolume(); music.muted = muted; }
  listeners.forEach((f) => f());
}
export const audioState = () => ({ volume, muted, voices, unlocked });
/** Called when the settings change or audio gets unlocked (used by the voice queue). */
export function onAudioChange(f: () => void): void { listeners.add(f); }
export function duckMusic(on: boolean): void {
  ducked = on;
  if (music) music.volume = musicVolume();
}

function get(name: string): HTMLAudioElement | null {
  if (missing.has(name) || typeof Audio === 'undefined') return null;
  let pool = pools.get(name);
  if (!pool) { pool = []; pools.set(name, pool); }
  let a = pool.find((x) => x.paused || x.ended);
  if (!a && pool.length < 4) {
    a = new Audio(audio(name));
    a.addEventListener('error', () => missing.add(name), { once: true });
    pool.push(a);
  }
  return a ?? pool[0] ?? null;
}

export function play(name: Sfx): void {
  if (muted || !unlocked) return;
  const a = get(name);
  if (!a) return;
  try { a.currentTime = 0; a.volume = volume; a.play().catch(() => {}); } catch { /* ignore */ }
}

export function playMusic(name: Music | null): void {
  wantedMusic = name;
  if (!unlocked || name === musicName) return;
  music?.pause();
  music = null; musicName = name;
  if (!name || missing.has(name) || typeof Audio === 'undefined') return;
  const a = new Audio(audio(name));
  a.loop = true; a.volume = musicVolume(); a.muted = muted;
  a.addEventListener('error', () => missing.add(name), { once: true });
  a.play().catch(() => {});
  music = a;
}

/** Browsers only allow audio after a user gesture: called once from the first click. */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  if (wantedMusic) playMusic(wantedMusic);
  listeners.forEach((f) => f());
}
