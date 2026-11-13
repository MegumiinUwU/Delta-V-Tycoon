// Composited pixel spacecraft (bible A15.2 "Spacecraft preview composition"). Canvas 160×120 at 1×, CSS-scaled.
import { useEffect, useRef, useState } from 'react';
import { bg, img, itemIcon, ready, sc } from '../assets';
import { play } from '../audio/sound';
import { fmtKg, type Design } from '../core';
import { getBus } from '../core/catalog';

const BUS_SIZE: Record<string, number> = { bus_cube: 16, bus_small: 32, bus_medium: 48, bus_large: 64 };

export function drawSpacecraft(ctx: CanvasRenderingContext2D, d: Design, cx: number, cy: number, onMissing?: (i: HTMLImageElement) => void) {
  const use = (url: string) => { const i = img(url); if (!ready(i)) onMissing?.(i); return i; };
  const draw = (i: HTMLImageElement, x: number, y: number, w: number, h: number) => { if (ready(i)) ctx.drawImage(i, Math.round(x), Math.round(y), w, h); };
  const e = d.engineer;
  const size = BUS_SIZE[e.busId] ?? 32;
  const left = cx - size / 2, top = cy - size / 2;
  // solar panels, each side, outward
  const n = e.solarArrayId === 'none' ? 0 : Math.max(0, Math.min(6, Math.ceil(e.solarArrayW / 500)));
  if (n > 0) {
    const panel = use(sc(`${e.solarArrayId}_panel`));
    const space = cx - size / 2 - 2;
    const pw = Math.min(16, Math.floor(space / n));
    for (let i = 0; i < n; i++) {
      draw(panel, left - (i + 1) * pw, cy - 12, pw, 24);
      draw(panel, left + size + i * pw, cy - 12, pw, 24);
    }
    ctx.fillStyle = '#8b9bb4';
    ctx.fillRect(left - n * pw, cy - 1, n * pw, 1);
  }
  draw(use(sc(e.busId)), left, top, size, size);
  if (d.comms.hga) draw(use(sc('hga')), cx - 12, top - 22, 24, 24);
  draw(use(sc('antenna_lga')), left + size - 4, top - 6, 8, 8);
  for (let i = 0; i < e.rtgCount; i++) draw(use(sc('rtg')), left - 2 + i * 9, top + size - 4, 8, 16);
  if (e.propulsionId !== 'prop_none') draw(use(sc('thruster')), cx - 4, top + size, 8, 8);
  const ins = d.science.instrumentIds.slice(0, 6);
  const iw = 16, total = ins.length * iw;
  ins.forEach((id, i) => draw(use(itemIcon(id)), cx - total / 2 + i * iw, cy - 8 + (size < 32 ? 12 : 0), iw, iw));
}

export function SpacecraftPreview({ design, totalKg, scale = 3, background = true }: { design: Design; totalKg?: number; scale?: number; background?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);
  const [pop, setPop] = useState(false);
  const count = useRef(0);
  const items = design.science.instrumentIds.length + (design.comms.hga ? 1 : 0) + design.engineer.rtgCount
    + (design.engineer.solarArrayId === 'none' ? 0 : Math.ceil(design.engineer.solarArrayW / 500));
  useEffect(() => {
    if (items > count.current && count.current > 0) { setPop(true); play('sfx_click'); setTimeout(() => setPop(false), 150); }
    count.current = items;
  }, [items]);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 160, 120);
    const back = img(bg('bg_clean_room'));
    if (background && ready(back)) ctx.drawImage(back, 160, 75, 160, 120, 0, 0, 160, 120);
    drawSpacecraft(ctx, design, 80, 64, (i) => { i.onload = () => force((x) => x + 1); });
  });
  const bus = getBus(design.engineer.busId);
  const n = design.science.instrumentIds.length;
  return (
    <figure style={{ margin: 0 }} className="col">
      <canvas ref={ref} width={160} height={120} style={{ width: 160 * scale, maxWidth: '100%', height: 'auto', imageRendering: 'pixelated',
        transform: pop ? 'scale(1.02)' : undefined, transition: 'transform 0.15s', background: '#1f2238', border: '2px solid var(--border)' }}
        aria-label={`Spacecraft preview: ${bus.name} with ${n} instruments`} role="img" />
      <figcaption className="small muted center row">{bus.name}{totalKg != null && <> · {fmtKg(totalKg)}</>} · {n} instrument{n === 1 ? '' : 's'}</figcaption>
    </figure>
  );
}
