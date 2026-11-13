// Orbit view (not to scale). Orbits are Kepler ellipses; the marker moves with Kepler's equation (faster near periapsis),
// inspired by NASA's mission-viz. Canvas 240×135 at 1×.
import { useEffect, useRef } from 'react';
import { img, planet, ready, sc } from '../assets';
import type { OrbitId } from '../core';
import { useGame } from '../state/store';

const W = 240, H = 135;

/** Solve E − e·sin E = M with 5 Newton steps; returns position relative to the focus. */
export function keplerPos(a: number, e: number, t: number, T: number): { x: number; y: number } {
  const M = (2 * Math.PI * t) / T;
  let E = M;
  for (let i = 0; i < 5; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const b = a * Math.sqrt(1 - e * e);
  return { x: a * (Math.cos(E) - e), y: b * Math.sin(E) };
}

interface Cfg { body: 'earth' | 'moon' | 'mars'; bodySize: number; a: number; e: number; squash: number; tilt: number; period: number }
const CFG: Record<OrbitId, Cfg> = {
  leo: { body: 'earth', bodySize: 64, a: 80, e: 0.05, squash: 0.375, tilt: 0, period: 4 },
  sso: { body: 'earth', bodySize: 64, a: 80, e: 0.05, squash: 0.375, tilt: (80 * Math.PI) / 180, period: 4 },
  geo: { body: 'earth', bodySize: 48, a: 60, e: 0, squash: 1, tilt: 0, period: 24 },
  lunar: { body: 'moon', bodySize: 56, a: 46, e: 0.05, squash: 0.4, tilt: (85 * Math.PI) / 180, period: 4 },
  l2: { body: 'earth', bodySize: 24, a: 10, e: 0, squash: 1, tilt: 0, period: 8 },
  mars: { body: 'mars', bodySize: 60, a: 50, e: 0.05, squash: 0.4, tilt: (85 * Math.PI) / 180, period: 4 },
};

export function OrbitView({ orbitId, scale = 2, transferMonths, contact = true }: { orbitId: OrbitId; scale?: number; transferMonths?: number; contact?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useGame((g) => g.settings.reducedMotion);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const start = performance.now();
    let raf = 0;
    const transferSec = transferMonths && transferMonths > 0 ? 3 : 0;
    const frame = (now: number) => {
      const t = reduced ? 0.6 : (now - start) / 1000;
      draw(ctx, orbitId, t, transferSec, transferMonths ?? 0, contact);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const retry = setInterval(() => { if (reduced) draw(ctx, orbitId, 0.6, 0, 0, contact); }, 500);
    return () => { cancelAnimationFrame(raf); clearInterval(retry); };
  }, [orbitId, reduced, transferMonths, contact]);
  const hint = orbitId === 'mars' ? 'Signal: 12.5 min one way. ' : '';
  return (
    <canvas ref={ref} width={W} height={H} title={`${hint}Diagram not to scale.`} role="img" aria-label={`Orbit view: ${orbitId} (not to scale)`}
      style={{ width: W * scale, maxWidth: '100%', height: 'auto', imageRendering: 'pixelated', background: '#181425', border: '2px solid var(--border)' }} />
  );
}

function stars(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#8b9bb4';
  for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % W, (i * 53 + (i % 7) * 11) % H, 1, 1);
}

function body(ctx: CanvasRenderingContext2D, id: 'earth' | 'moon' | 'mars' | 'sun', x: number, y: number, s: number) {
  const im = img(planet(id));
  if (ready(im)) ctx.drawImage(im, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  else {
    ctx.fillStyle = id === 'earth' ? '#124e89' : id === 'mars' ? '#be4a2f' : id === 'sun' ? '#feae34' : '#8b9bb4';
    ctx.beginPath(); ctx.arc(x, y, s / 2, 0, Math.PI * 2); ctx.fill();
  }
}

function marker(ctx: CanvasRenderingContext2D, x: number, y: number, dim = false) {
  const m = img(sc('sc_marker'));
  ctx.globalAlpha = dim ? 0.35 : 1;
  if (ready(m)) ctx.drawImage(m, Math.round(x - 4), Math.round(y - 4), 8, 8);
  else { ctx.fillStyle = '#feae34'; ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4); }
  ctx.globalAlpha = 1;
}

function ellipsePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, c: Cfg, dashed = false) {
  const b = c.a * Math.sqrt(1 - c.e * c.e) * c.squash;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(c.tilt);
  ctx.strokeStyle = '#5a6988'; ctx.lineWidth = 1; ctx.setLineDash(dashed ? [3, 3] : []);
  ctx.beginPath(); ctx.ellipse(-c.a * c.e, 0, c.a, b, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function orbitPoint(cx: number, cy: number, c: Cfg, t: number) {
  const p = keplerPos(c.a, c.e, t, c.period);
  const y = p.y * c.squash;
  return { x: cx + p.x * Math.cos(c.tilt) - y * Math.sin(c.tilt), y: cy + p.x * Math.sin(c.tilt) + y * Math.cos(c.tilt), behind: p.y < 0 };
}

function draw(ctx: CanvasRenderingContext2D, orbitId: OrbitId, t: number, transferSec: number, transferMonths: number, contact: boolean) {
  ctx.fillStyle = '#181425'; ctx.fillRect(0, 0, W, H);
  stars(ctx);
  ctx.font = '8px monospace'; ctx.fillStyle = '#c0cbdc';
  if (transferSec && t < transferSec) return drawTransfer(ctx, orbitId, t / transferSec, transferMonths);
  const c = CFG[orbitId];
  if (orbitId === 'l2') {
    body(ctx, 'sun', 20, H / 2, 40);
    body(ctx, 'earth', 90, H / 2, 24);
    const lx = 190, ly = H / 2;
    ctx.fillStyle = '#feae34'; ctx.fillRect(lx - 1, ly - 1, 3, 3);
    ellipsePath(ctx, lx, ly, { ...c, a: 16, squash: 0.6 });
    const p = orbitPoint(lx, ly, { ...c, a: 16, squash: 0.6 }, t);
    marker(ctx, p.x, p.y);
    ctx.fillStyle = '#c0cbdc'; ctx.fillText('L2', lx + 20, ly - 10); ctx.fillText('1.5 million km', 120, H - 8);
    ctx.setLineDash([2, 4]); ctx.strokeStyle = contact ? '#2ce8f5' : '#3a4466';
    ctx.beginPath(); ctx.moveTo(96, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    return;
  }
  const cx = W / 2, cy = H / 2;
  const p = orbitPoint(cx, cy, c, t);
  ellipsePath(ctx, cx, cy, c);
  const r = c.bodySize / 2;
  const behindBody = p.behind && Math.hypot(p.x - cx, p.y - cy) < r + 2;
  // eclipse wedge (Sun on the left): shadow to the right of the planet
  if (orbitId === 'leo' || orbitId === 'sso' || orbitId === 'lunar' || orbitId === 'mars') {
    ctx.fillStyle = '#26214080'; ctx.fillRect(cx, cy - r, W / 2, r * 2);
  }
  const inShadow = p.x > cx && Math.abs(p.y - cy) < r;
  if (p.behind) marker(ctx, p.x, p.y, inShadow || behindBody);
  body(ctx, c.body, cx, cy, c.bodySize);
  if (!p.behind) marker(ctx, p.x, p.y, inShadow);
  if (orbitId === 'geo') {
    const ang = Math.atan2(p.y - cy, p.x - cx);
    const gx = cx + Math.cos(ang) * r, gy = cy + Math.sin(ang) * r;
    ctx.fillStyle = '#63c74d'; ctx.fillRect(Math.round(gx) - 1, Math.round(gy) - 1, 3, 3);
    ctx.setLineDash([2, 3]); ctx.strokeStyle = '#2ce8f5'; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
  }
  if (orbitId === 'lunar' || orbitId === 'mars') {
    body(ctx, 'earth', 16, 16, 16);
    const on = contact && Math.floor(t * 2) % 2 === 0;
    ctx.setLineDash([2, 3]); ctx.strokeStyle = on ? '#2ce8f5' : '#3a4466';
    ctx.beginPath(); ctx.moveTo(22, 22); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    if (orbitId === 'mars') { ctx.fillStyle = '#c0cbdc'; ctx.fillText('12.5 min one way', 30, 12); }
  }
}

function drawTransfer(ctx: CanvasRenderingContext2D, orbitId: OrbitId, f: number, months: number) {
  // half-ellipse from Earth (left) to the target (right), marker moving with the same Kepler code
  const ex = 40, ey = H / 2, tx = 200;
  body(ctx, 'earth', ex, ey, 28);
  const target = orbitId === 'mars' ? 'mars' : orbitId === 'lunar' ? 'moon' : null;
  if (target) body(ctx, target, tx, ey, 24);
  else { ctx.fillStyle = '#feae34'; ctx.fillRect(tx - 1, ey - 1, 3, 3); ctx.fillText(orbitId === 'l2' ? 'L2' : 'GEO', tx - 6, ey - 8); }
  const a = (tx - ex) / 2, e = 0.6, b = a * Math.sqrt(1 - e * e);
  const cxE = ex + a; // ellipse centre
  ctx.setLineDash([3, 3]); ctx.strokeStyle = '#feae34';
  ctx.beginPath(); ctx.ellipse(cxE, ey, a, b * 0.6, 0, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  // perihelion at Earth: position relative to the focus at the far end, mirrored so it starts at Earth
  const p = keplerPos(a, 0, f * 0.5, 1);
  marker(ctx, cxE - p.x, ey - Math.abs(p.y) * 0.6);
  ctx.fillStyle = '#feae34';
  ctx.fillText(`Transfer: ${months < 1 ? `${Math.round(months * 30)} days` : `${Math.round(months * 10) / 10} months`}`, 70, H - 10);
}
