// id → URL map for every asset (bible A15). Always built from BASE_URL so GitHub Pages paths work.
const B = import.meta.env.BASE_URL + 'assets/';
export type Expr = 'neutral' | 'happy' | 'worried';
export const portrait = (id: string, expr: Expr = 'neutral') => `${B}characters/portrait_${id}_${expr}.png`;
export const idleSprite = (id: string) => `${B}characters/sprite_${id}_idle.png`;
export const suitSprite = (id: string) => `${B}characters/sprite_${id}_suit.png`;
export const itemIcon = (id: string) => `${B}items/${id}.png`;
export const icon = (id: string) => `${B}icons/${id}.png`;
export const bg = (id: string) => `${B}bg/${id}.png`;
export const eventArt = (id: string) => `${B}events/ev_${id}.png`;
export const scenarioArt = (id: string) => `${B}scenarios/sc_${id}.png`;
export const planet = (id: 'earth' | 'moon' | 'mars' | 'sun') => `${B}planets/planet_${id}.png`;
export const vehicleSprite = (id: string) => `${B}lv/lv_${id === 'rideshare' ? 'workhorse' : id}.png`;
export const sc = (name: string) => `${B}sc/${name}.png`;
export const fx = (name: string) => `${B}fx/${name}.png`;
export const ui = (name: string) => `${B}ui/${name}.png`;
export const audio = (name: string) => `${B}audio/${name}.mp3`;
export const voice = (clipId: string) => `${B}voice/${clipId}.mp3`;
export const audioFile = (file: string) => `${B}audio/${file}`;
export const orbitIcon = (orbitId: string) => itemIcon(`orbit_${orbitId}`);
export const groundIcon = (id: string) => itemIcon(`gs_${id}`);
export const vehicleIcon = (id: string) => itemIcon(`lv_${id}`);

/** Preload images; resolves when all have loaded or after `timeoutMs`, whichever is first. Reports progress 0..1. */
export function preload(urls: string[], onProgress?: (p: number) => void, timeoutMs = 5000): Promise<void> {
  if (!urls.length) return Promise.resolve();
  let done = 0;
  const all = Promise.all(urls.map((u) => new Promise<void>((res) => {
    const im = new Image();
    im.onload = im.onerror = () => { done++; onProgress?.(done / urls.length); res(); };
    im.src = u;
  })));
  return Promise.race([all.then(() => undefined), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

const imgCache = new Map<string, HTMLImageElement>();
/** Cached Image element for canvas drawing (may still be loading; check .complete). */
export function img(url: string): HTMLImageElement {
  let i = imgCache.get(url);
  if (!i) { i = new Image(); i.src = url; imgCache.set(url, i); }
  return i;
}
export const ready = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0;
