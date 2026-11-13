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

/** Characters that have a voice clip in assets/audio/voice_<id>.(mp3|wav). */
export const VOICED = new Set(['miku']);
const voiceSrc = new Map<string, string>();
let voicePlaying: HTMLAudioElement | null = null;

/**
 * Plays a character's voice clip (e.g. on hover). Prefers voice_<id>.mp3 and falls back to .wav, so a real clip can
 * be dropped in later without code changes. Ignored when muted, before the first user gesture, or if no file exists.
 */
export function playVoice(id: string): void {
  if (muted || !unlocked || !VOICED.has(id) || typeof Audio === 'undefined') return;
  if (voicePlaying && !voicePlaying.paused) return;          // don't stack while one is still playing
  const tryPlay = (src: string, fallback?: string) => {
    const a = new Audio(src);
    a.volume = volume;
    a.addEventListener('error', () => { if (fallback) tryPlay(fallback); else voiceSrc.set(id, ''); }, { once: true });
    a.addEventListener('canplay', () => voiceSrc.set(id, src), { once: true });
    a.play().catch(() => {});
    voicePlaying = a;
  };
  const known = voiceSrc.get(id);
  if (known === '') return;
  const base = audio(`voice_${id}`).replace(/\.mp3$/, '');
  if (known) tryPlay(known); else tryPlay(`${base}.mp3`, `${base}.wav`);
}

/** Browsers only allow audio after a user gesture: called once from the first click. */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  if (wantedMusic) playMusic(wantedMusic);
}
