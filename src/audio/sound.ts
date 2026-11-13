// Sound manager: small pool per sound, respects mute/volume, ignores missing files and autoplay errors.
import { audio } from '../assets';

export type Sfx = 'sfx_click' | 'sfx_hover' | 'sfx_success' | 'sfx_fail' | 'sfx_warning' | 'sfx_launch' | 'sfx_event'
  | 'sfx_signoff' | 'sfx_coin';
export type Music = 'music_menu' | 'music_ops';

let volume = 0.7, muted = false, unlocked = false;
const pools = new Map<string, HTMLAudioElement[]>();
const missing = new Set<string>();
let music: HTMLAudioElement | null = null, musicName: Music | null = null, wantedMusic: Music | null = null;

export function setAudioSettings(v: number, m: boolean): void {
  volume = v; muted = m;
  if (music) { music.volume = volume * 0.5; music.muted = muted; }
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
  a.loop = true; a.volume = volume * 0.5; a.muted = muted;
  a.addEventListener('error', () => missing.add(name), { once: true });
  a.play().catch(() => {});
  music = a;
}

/** Browsers only allow audio after a user gesture: called once from the first click. */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  if (wantedMusic) playMusic(wantedMusic);
}
