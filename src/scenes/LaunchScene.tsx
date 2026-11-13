// Launch animation on bg_launch_pad, 480×270 at 1×. Success at 8 s, failure explosion at 5 s.
import { useEffect, useRef } from 'react';
import { bg, fx, img, ready, vehicleSprite } from '../assets';
import { play } from '../audio/sound';
import { useGame } from '../state/store';

const W = 480, H = 270;
const SIZE: Record<string, [number, number]> = { spark: [16, 64], rideshare: [24, 128], arrow: [24, 96], workhorse: [24, 128], titan: [48, 128] };

export function LaunchScene({ vehicleId, failed, onEnd, scale = 2 }: { vehicleId: string; failed: boolean; onEnd: () => void; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useGame((g) => g.settings.reducedMotion);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const start = performance.now();
    let raf = 0, launched = false, ended = false, boom = false;
    const [rw, rh] = SIZE[vehicleId] ?? [24, 96];
    const padY = 210;
    const smoke: { x: number; y: number; t0: number }[] = [];
    const frame = (now: number) => {
      let t = (now - start) / 1000;
      if (reduced) t = t < 1 ? 0.5 : failed ? 7 : 9;
      if (!launched && t >= 2) { launched = true; play('sfx_launch'); }
      if (failed && !boom && t >= 5) { boom = true; play('sfx_fail'); }
      const rise = t < 3 ? 0 : failed ? Math.min(2, t - 3) : t - 3;
      const y = padY - rh - 40 * rise * rise;
      const scroll = Math.max(0, -y + 60);
      const shake = t > 3 && t < 4 && !reduced ? (Math.random() - 0.5) * 4 : 0;
      ctx.save(); ctx.translate(Math.round(shake), 0);
      // background (scrolls down as the rocket climbs), sky fades at 6 s
      const back = img(bg('bg_launch_pad'));
      ctx.fillStyle = '#262b44'; ctx.fillRect(0, 0, W, H);
      if (ready(back)) ctx.drawImage(back, 0, Math.round(scroll), W, H);
      const dark = Math.min(1, Math.max(0, (t - 6) / 1.5));
      if (dark > 0) { ctx.fillStyle = `rgba(24,20,37,${dark})`; ctx.fillRect(0, 0, W, H); }
      const ry = y + scroll;
      const exploded = failed && t >= 5;
      if (!exploded) {
        // flame + smoke
        if (t >= 2.5) {
          const fl = img(fx('fx_flame'));
          const f = Math.floor(t * 12) % 4;
          if (ready(fl)) ctx.drawImage(fl, f * 16, 0, 16, 24, 240 - rw / 2, ry + rh, rw, 24 * (rw / 16));
          if (t < 6 && Math.random() < 0.4) smoke.push({ x: 240 + (Math.random() - 0.5) * 40, y: padY + scroll - 20, t0: t });
        }
        const rocket = img(vehicleSprite(vehicleId));
        if (ready(rocket)) ctx.drawImage(rocket, 240 - rw / 2, Math.round(ry), rw, rh);
        else { ctx.fillStyle = '#c0cbdc'; ctx.fillRect(240 - rw / 2, Math.round(ry), rw, rh); }
      } else {
        const ex = img(fx('fx_explosion'));
        const f = Math.min(7, Math.floor((t - 5) * 12));
        if (ready(ex) && f < 8) ctx.drawImage(ex, f * 64, 0, 64, 64, 240 - 48, ry + rh / 2 - 48, 96, 96);
      }
      const sm = img(fx('fx_smoke'));
      for (const p of smoke) {
        const age = t - p.t0;
        if (age > 1.5 || !ready(sm)) continue;
        const f = Math.min(5, Math.floor(age * 4));
        ctx.globalAlpha = 1 - age / 1.5;
        ctx.drawImage(sm, f * 32, 0, 32, 32, p.x - 16 - age * 10, p.y + scroll * 0 - age * 8, 32 + age * 16, 32 + age * 16);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // texts
      ctx.textAlign = 'center';
      ctx.font = '16px "Press Start 2P", monospace';
      if (t < 3) {
        ctx.fillStyle = '#feae34';
        ctx.fillText(t < 1 ? 'T−3' : t < 2 ? 'T−2' : 'T−1', W / 2, 60);
      }
      if (exploded && t > 5.7) {
        ctx.fillStyle = '#e43b44'; ctx.fillText('LAUNCH FAILURE', W / 2, 70);
      }
      if (!failed && t >= 8) {
        ctx.fillStyle = '#63c74d'; ctx.fillText('LAUNCH SUCCESSFUL', W / 2, 70);
      }
      if (!ended && ((failed && t >= 6.5) || (!failed && t >= 8.2))) { ended = true; if (!failed) play('sfx_success'); endRef.current(); }
      if (!ended || t < 10) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [vehicleId, failed, reduced]);
  return <canvas ref={ref} width={W} height={H} role="img" aria-label="Launch animation"
    style={{ width: W * scale, maxWidth: '100%', height: 'auto', imageRendering: 'pixelated', border: '2px solid var(--border)' }} />;
}
