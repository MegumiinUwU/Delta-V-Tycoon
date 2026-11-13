// Sound manager: small pool per sound, respects mute/volume, ignores missing files and autoplay errors.
// Character voice lines live in voice.ts.
import { audio, audioFile } from '../assets';

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

/**
 * Character hover voices, played through Web Audio so they start instantly: the files are fetched once (on the first
 * user gesture), decoded once, and every hover just starts a ready buffer. To swap in a licensed clip, replace the
 * file and, if its format changes, the file name here.
 */
export const VOICE_FILES: Record<string, string> = { miku: 'voice_miku.wav', teto: 'voice_teto.wav', neru: 'voice_neru.wav' };
export const VOICED = new Set(Object.keys(VOICE_FILES));
let ctx: AudioContext | null = null;
const voiceBuffers = new Map<string, AudioBuffer | null>();   // null = failed to load: stay silent
let voiceNow: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;

function audioContext(): AudioContext | null {
  if (!ctx) {
    const AC = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function loadVoices(): void {
  const c = audioContext();
  if (!c) return;
  for (const [id, file] of Object.entries(VOICE_FILES)) {
    if (voiceBuffers.has(id)) continue;
    voiceBuffers.set(id, null);
    fetch(audioFile(file))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => c.decodeAudioData(data))
      .then((buf) => voiceBuffers.set(id, buf))
      .catch(() => { /* missing or undecodable: this character stays silent */ });
  }
}

/** Plays a character's voice (e.g. on hover). Switching to another character cuts the previous one short with a
 *  quick fade; hovering the same character again while it is still talking does nothing. */
export function playVoice(id: string): void {
  if (muted || !voices || !unlocked || !VOICED.has(id)) return;
  const c = audioContext();
  const buf = voiceBuffers.get(id);
  if (!c || !buf) return;
  if (voiceNow) {
    if (voiceNow.id === id) return;
    const old = voiceNow;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.015);
    try { old.src.stop(c.currentTime + 0.08); } catch { /* already stopped */ }
  }
  const src = c.createBufferSource();
  const gain = c.createGain();
  gain.gain.value = volume;
  src.buffer = buf;
  src.connect(gain).connect(c.destination);
  const now = { id, src, gain };
  src.onended = () => { if (voiceNow === now) voiceNow = null; };
  src.start();
  voiceNow = now;
}

/** Browsers only allow audio after a user gesture: called once from the first click. */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  loadVoices();
  if (wantedMusic) playMusic(wantedMusic);
  listeners.forEach((f) => f());
}
