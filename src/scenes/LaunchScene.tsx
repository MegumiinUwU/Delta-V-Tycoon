// Launch animation on bg_launch_pad, 480×270 at 1×.
//
// Timeline (scene seconds): countdown T−3 … T−1 runs in real time, engines light at T−0.8 and the rocket is held
// down until liftoff at 3 s. From liftoff the mission clock speeds up (a real climb to orbit takes ~8½ minutes;
// here it takes 6 s), and the HUD shows the clock, how much it is sped up, altitude and speed, plus the real
// milestones: Max-Q, MECO and stage separation, orbit. A failure happens at T+0:58, near Max-Q, where real
// rockets are most often lost.
//
// Smoke is a small particle system kept in ground ("world") coordinates, so it stays where it was made while the
// camera climbs: a billowing cloud pushed sideways out of the flame trench at ignition, then an exhaust trail that
// thins out as the air does. Particles lit by the flame glow orange. Capped at a few hundred circles per frame.
import { useEffect, useRef } from 'react';
import { bg, fx, img, ready, vehicleSprite } from '../assets';
import { play } from '../audio/sound';
import { useGame } from '../state/store';

const W = 480, H = 270;
const SIZE: Record<string, [number, number]> = { spark: [16, 64], rideshare: [24, 128], arrow: [24, 96], workhorse: [24, 128], titan: [48, 128] };

const IGNITE = 2.2;           // main engines start (T−0.8)
const LIFTOFF = 3;            // hold-down released (T−0)
const FLIGHT = 6;             // scene seconds from liftoff to orbit
const ORBIT_AT = 520;         // mission clock at orbit insertion (8 min 40 s)
const FAIL_AT = 5;            // scene time of a launch failure (mission clock ≈ T+0:58)
const MAXQ = 72, MECO = 154;  // mission clock (s) of the milestones
const PAD_Y = 210, PAD_X = 240;

/** Mission clock (s) at scene time t: real time before liftoff, then sped up (quadratic, like the climb itself). */
const clockAt = (t: number) => (t < LIFTOFF ? t - LIFTOFF : ORBIT_AT * ((t - LIFTOFF) / FLIGHT) ** 2);
/** Scene time at which the mission clock reads c (inverse of clockAt after liftoff). */
const sceneAt = (c: number) => LIFTOFF + FLIGHT * Math.sqrt(c / ORBIT_AT);

function lerpTable(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i], [x0, y0] = table[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1][1];
}
// a typical medium launcher to low orbit: altitude (km) and speed (km/h) against the mission clock
const ALT_KM: [number, number][] = [[0, 0], [30, 2], [MAXQ, 12], [MECO, 68], [300, 150], [ORBIT_AT, 200]];
const SPEED_KMH: [number, number][] = [[0, 0], [30, 500], [MAXQ, 1700], [MECO, 8000], [300, 15000], [ORBIT_AT, 27400]];

const fmtClock = (c: number) => {
  const s = Math.floor(Math.abs(c)), sign = c < 0 ? '-' : '+';
  return `T${sign}${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

interface Puff { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; age: number; shade: number; rise: number }

// fixed star field for the top of the climb
const STARS = Array.from({ length: 40 }, (_, i) => [(i * 137.5) % W, (i * 71.3) % (H - 40), (i % 3) + 1] as const);

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
    let raf = 0, last = start, ignited = false, ended = false, boom = false;
    const [rw, rh] = SIZE[vehicleId] ?? [24, 96];
    const puffs: Puff[] = [];
    const add = (p: Omit<Puff, 'age'>) => { if (puffs.length < 420) puffs.push({ ...p, age: 0 }); };
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const count = (perSec: number, dt: number) => Math.floor(perSec * dt + Math.random());   // keeps low rates from rounding to 0

    const frame = (now: number) => {
      let t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (reduced) t = t < 1 ? 0.5 : failed ? 7 : 9.5;
      if (!ignited && t >= IGNITE) { ignited = true; play('sfx_launch'); }
      if (failed && !boom && t >= FAIL_AT) { boom = true; play('sfx_fail'); }
      const exploded = failed && t >= FAIL_AT;
      const tf = Math.min(FLIGHT, Math.max(0, (failed ? Math.min(t, FAIL_AT) : t) - LIFTOFF));   // flight time, frozen at a failure or in orbit
      const inOrbit = !failed && tf >= FLIGHT;
      const clock = t < LIFTOFF ? t - LIFTOFF : clockAt(LIFTOFF + tf);

      // rocket: climbs faster and faster, pitches over (gravity turn) and drifts downrange
      const alt = 40 * tf * tf;
      const pitch = 0.32 * Math.min(1, Math.max(0, (tf - 1.2) / 4)) ** 2;
      const rx = PAD_X + 34 * (tf / FLIGHT) ** 3;
      const ry = PAD_Y - rh - alt;                       // world y of the rocket's top
      const scroll = Math.max(0, -ry + 24);              // camera keeps the rocket near the top, leaving room for its trail
      const scrollSpeed = 80 * tf;                       // d(alt)/dt, px per second
      // engines: ramp up at ignition, cut briefly at MECO / stage separation, a wider plume in thin air
      const sep = clock >= MECO && clock < MECO + 25;   // a short flame-out between the stages
      const throttle = exploded || inOrbit || t < IGNITE ? 0 : sep ? 0 : t < LIFTOFF ? 0.45 + 0.55 * ((t - IGNITE) / (LIFTOFF - IGNITE)) : clock > MECO ? 0.7 : 1;
      const thin = Math.min(1, Math.max(0, (clock - 30) / 140));    // 0 at the ground, 1 near space
      // the rocket pivots on its nozzle; exhaust leaves along its axis
      const nozzleX = rx, nozzleY = ry + rh, backX = -Math.sin(pitch), backY = Math.cos(pitch);

      // ---- smoke: spawn ----
      if (!reduced && dt > 0) {
        if (throttle > 0 && tf < 1.6) {                  // ground cloud: exhaust thrown sideways out of the trench
          const n = count(70 * throttle * (1 - tf / 1.6), dt);
          for (let i = 0; i < n; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            add({ x: PAD_X + side * rnd(4, 14), y: PAD_Y + rnd(-2, 6), vx: side * rnd(40, 110), vy: rnd(-18, 2), r: rnd(4, 8), grow: rnd(7, 14),
              life: rnd(3.2, 5.2), shade: rnd(0.78, 1), rise: rnd(3, 8) });
          }
        }
        if (throttle > 0 && t >= LIFTOFF && thin < 1) { // exhaust trail behind the climbing rocket
          const n = count(60 * (1 - thin * 0.75), dt);
          for (let i = 0; i < n; i++) {
            const d = rnd(8, 16) + rnd(0, 1) * scrollSpeed * dt;   // fill the gap the rocket left since the last frame
            add({ x: nozzleX + backX * d + rnd(-2, 2), y: nozzleY + backY * d, vx: backX * 20 + rnd(-6, 6) + 5, vy: backY * rnd(10, 26), r: rnd(2, 3.5), grow: rnd(3, 6) * (1 + thin * 2),
              life: rnd(2, 3) * (1 - thin * 0.55), shade: rnd(0.85, 1), rise: 0 });
          }
        }
        if (boom && puffs.length < 380 && t < FAIL_AT + 0.4) {   // dark explosion cloud
          for (let i = 0, n = count(140, dt); i < n; i++) {
            const a = rnd(0, Math.PI * 2), sp = rnd(10, 60);
            add({ x: rx + Math.cos(a) * 6, y: ry + rh / 2 + Math.sin(a) * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rnd(5, 10), grow: rnd(6, 12),
              life: rnd(2.5, 4), shade: rnd(0.1, 0.35), rise: rnd(2, 6) });
          }
        }
      }
      // ---- smoke: move (drag, a light wind to the right, warm clouds slowly rise) ----
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.age += dt;
        if (p.age >= p.life) { puffs[i] = puffs[puffs.length - 1]; puffs.pop(); continue; }
        const drag = Math.exp(-1.6 * dt);
        p.vx = p.vx * drag + 6 * dt; p.vy = p.vy * drag - p.rise * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.grow * dt * (1 - p.age / p.life * 0.6);
      }

      // ---- draw ----
      const shake = t > IGNITE && t < LIFTOFF + 1 && !reduced ? (Math.random() - 0.5) * 3 * Math.min(1, throttle) : 0;
      ctx.save(); ctx.translate(Math.round(shake), 0);
      // sky above the picture darkens with altitude; stars come out near space
      const sky = Math.round(38 * (1 - thin));
      ctx.fillStyle = `rgb(${24 + sky * 0.2},${20 + sky * 0.3},${37 + sky})`; ctx.fillRect(0, 0, W, H);
      const back = img(bg('bg_launch_pad'));
      if (ready(back)) ctx.drawImage(back, 0, Math.round(scroll), W, H);
      const dark = Math.min(0.9, thin * 1.1);
      if (dark > 0) { ctx.fillStyle = `rgba(24,20,37,${dark})`; ctx.fillRect(0, 0, W, H); }
      if (thin > 0.35) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (thin - 0.35) * 2)})`;
        for (const [sx, sy, s] of STARS) ctx.fillRect(sx, sy, s === 3 ? 2 : 1, s === 3 ? 2 : 1);
      }
      // flame light on the pad and the bottom of the cloud
      if (throttle > 0 && scroll < 140) {
        const g = ctx.createRadialGradient(nozzleX, nozzleY + scroll + 6, 2, nozzleX, nozzleY + scroll + 6, 90);
        g.addColorStop(0, `rgba(255,190,90,${0.45 * throttle})`); g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      // smoke behind the rocket: older puffs first, so new ones sit on top
      for (const p of puffs) {
        const sy = p.y + scroll;
        if (sy + p.r < 0 || sy - p.r > H) continue;
        const k = p.age / p.life;
        const a = 0.75 * Math.min(1, p.age / 0.12) * (1 - k) ** 1.4;
        const dx = p.x - nozzleX, dy = p.y - nozzleY;
        const lit = throttle > 0 ? Math.max(0, 1 - Math.hypot(dx, dy) / 60) * throttle : 0;   // glow from the flame
        const v = 60 + 180 * p.shade;                    // exhaust is near white, a breakup cloud dark grey
        const c = (m: number) => `rgba(${Math.round(Math.min(255, v * m + lit * 90))},${Math.round(Math.min(255, v * m + lit * 30))},${Math.round(v * m - lit * 40)},${a})`;
        const x = Math.round(p.x), y = Math.round(sy), r = Math.max(1, Math.round(p.r));
        ctx.fillStyle = c(0.82); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();               // shaded body
        ctx.fillStyle = c(1); ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.68, 0, Math.PI * 2); ctx.fill();  // lit top
      }
      if (!exploded) {
        ctx.save();
        ctx.translate(Math.round(rx), Math.round(ry + scroll + rh));
        ctx.rotate(pitch);
        if (throttle > 0) {
          const fl = img(fx('fx_flame'));
          const f = Math.floor(t * 14) % 4;
          const wide = 1 + thin * 0.9, long = (0.55 + 0.45 * throttle) * (1 + (Math.random() - 0.5) * 0.12);
          const fw = rw * wide, fh = 24 * (rw / 16) * long;
          if (ready(fl)) ctx.drawImage(fl, f * 16, 0, 16, 24, -fw / 2, -2, fw, fh);
        }
        const rocket = img(vehicleSprite(vehicleId));
        if (ready(rocket)) ctx.drawImage(rocket, -rw / 2, -rh, rw, rh);
        else { ctx.fillStyle = '#c0cbdc'; ctx.fillRect(-rw / 2, -rh, rw, rh); }
        ctx.restore();
      } else {
        const ex = img(fx('fx_explosion'));
        const f = Math.min(7, Math.floor((t - FAIL_AT) * 12));
        if (ready(ex) && f < 8) ctx.drawImage(ex, f * 64, 0, 64, 64, rx - 48, ry + scroll + rh / 2 - 48, 96, 96);
      }
      ctx.restore();

      // ---- HUD ----
      const text = (s: string, x: number, y: number, color: string) => {
        ctx.fillStyle = '#181425'; ctx.fillText(s, x + 1, y + 1);
        ctx.fillStyle = color; ctx.fillText(s, x, y);
      };
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      if (t < LIFTOFF) text(t < 1 ? 'T-3' : t < 2 ? 'T-2' : 'T-1', W / 2, 60, '#feae34');   // ASCII minus: the pixel font has no '−'
      ctx.font = '8px "Press Start 2P", monospace';
      if (t >= IGNITE && t < LIFTOFF) text('MAIN ENGINE START', W / 2, 80, '#ffffff');
      if (t >= LIFTOFF) {
        ctx.textAlign = 'left';
        text(fmtClock(clock), 8, 16, '#feae34');
        const rate = exploded || inOrbit ? 0 : tf < 0.05 ? 1 : (2 * ORBIT_AT * tf) / (FLIGHT * FLIGHT);
        if (rate > 1.5) text(`time ×${Math.round(rate)}`, 8, 28, '#8b9bb4');
        text(`ALT ${Math.round(lerpTable(ALT_KM, clock))} km`, 8, 44, '#ffffff');
        text(`SPD ${Math.round(lerpTable(SPEED_KMH, clock)).toLocaleString('en-US')} km/h`, 8, 56, '#ffffff');
        // milestone banners, each shown for a moment just after it happens
        ctx.textAlign = 'center';
        const milestone = (c: number, label: string) => { const ts = sceneAt(c); if (t >= ts && t < ts + 1.1) text(label, W / 2, H - 16, '#ffffff'); };
        if (t < LIFTOFF + 0.9) text('LIFTOFF', W / 2, H - 16, '#ffffff');
        if (!failed) {
          milestone(MAXQ, 'MAX-Q · peak air pressure');
          milestone(MECO, 'MECO · stage separation');
        }
      }
      ctx.textAlign = 'center';
      ctx.font = '16px "Press Start 2P", monospace';
      if (exploded && t > FAIL_AT + 0.7) {
        text('LAUNCH FAILURE', W / 2, H - 48, '#e43b44');
        ctx.font = '8px "Press Start 2P", monospace';
        text(`vehicle lost at ${fmtClock(clockAt(FAIL_AT))}`, W / 2, H - 30, '#ffffff');
      }
      if (inOrbit) {
        text('LAUNCH SUCCESSFUL', W / 2, H - 48, '#63c74d');
        ctx.font = '8px "Press Start 2P", monospace';
        text('engines off · in orbit', W / 2, H - 30, '#ffffff');
      }
      if (!ended && ((failed && t >= FAIL_AT + 1.5) || (!failed && t >= LIFTOFF + FLIGHT + 0.3))) {
        ended = true; if (!failed) play('sfx_success'); endRef.current();
      }
      if (!ended || now - start < (LIFTOFF + FLIGHT + 3) * 1000) raf = requestAnimationFrame(frame);   // let the smoke settle, then stop
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [vehicleId, failed, reduced]);
  return <canvas ref={ref} width={W} height={H} role="img" aria-label="Launch animation"
    style={{ width: W * scale, maxWidth: '100%', height: 'auto', imageRendering: 'pixelated', border: '2px solid var(--border)' }} />;
}
