// Orbit poem: a keepsake made of magnet lines. The game's own rule drives the art: a spacecraft can only be commanded
// while a ground station sees it, so the lines stay where you put them during contact and drift to new places at every
// loss of signal. Two ground-station pins hold a line through the dark, and there are never enough pins for all of it.
import { useEffect, useRef, useState } from 'react';
import { planet, sc } from '../assets';
import { play } from '../audio/sound';
import { load, save } from '../state/storage';
import { useGame } from '../state/store';
import { C, LabPage } from './common';

export const POOL = [
  'every kilogram is a promise', 'the rocket keeps its own accounts', 'we trade a little light for a little time',
  'somewhere below, a field is being counted', 'the battery remembers the dark', 'margin is the kindest number',
  'a whisper crosses, twelve minutes old', 'we point, and wait, and point again', 'what we could not carry, we learned',
  'go, and the long quiet after', 'the far side keeps no stations', 'one more pass, then home',
];
export const MAX_PINS = 2;
const KEY = 'dvt.lab.poem';
const PERIOD_S = 24, LOS_FROM = 0.42, LOS_TO = 0.58;   // fraction of the orbit spent out of contact

/** Loss of signal: unpinned lines trade places (always a real change when two or more are free). */
export function losShuffle(lines: string[], pinned: ReadonlySet<string>, rnd: () => number = Math.random): string[] {
  const free = lines.map((l, i) => (pinned.has(l) ? -1 : i)).filter((i) => i >= 0);
  if (free.length < 2) return lines;
  for (let tries = 0; tries < 20; tries++) {
    const order = [...free];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    if (order.some((x, i) => x !== free[i])) {
      const out = [...lines];
      free.forEach((pos, i) => { out[pos] = lines[order[i]]; });
      return out;
    }
  }
  const out = [...lines];
  [out[free[0]], out[free[1]]] = [out[free[1]], out[free[0]]];
  return out;
}

interface Saved { lines: string[]; pins: string[] }

export function Poem() {
  const reduced = useGame((g) => g.settings.reducedMotion);
  const [init] = useState(() => load<Saved>(KEY, { lines: POOL.slice(0, 6), pins: [] }));
  const [lines, setLines] = useState<string[]>(() => (init.lines.length === 6 && init.lines.every((l) => POOL.includes(l)) ? init.lines : POOL.slice(0, 6)));
  const [pins, setPins] = useState<Set<string>>(() => new Set(init.pins.filter((p) => POOL.includes(p)).slice(0, MAX_PINS)));
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState(0);            // 0..1 around the orbit
  const [passes, setPasses] = useState(0);
  const [copied, setCopied] = useState(false);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const state = useRef({ lines, pins, drag });
  state.current = { lines, pins, drag };
  const start = useRef(performance.now());
  const wasLos = useRef(false);

  useEffect(() => { save(KEY, { lines, pins: [...pins] }); }, [lines, pins]);

  const lose = () => {
    const { lines: cur, pins: p, drag: d } = state.current;
    if (d) return;                                  // a line in your hand is a line in contact
    const next = losShuffle(cur, p);
    setMoved(new Set(next.filter((l, i) => l !== cur[i])));
    setLines(next); setPasses((n) => n + 1);
    play('sfx_hover');
    setTimeout(() => setMoved(new Set()), 600);
  };
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      const ph = (((performance.now() - start.current) / 1000) % PERIOD_S) / PERIOD_S;
      setPhase(ph);
      const los = ph >= LOS_FROM && ph < LOS_TO;
      if (los && !wasLos.current) lose();
      wasLos.current = los;
    }, 100);
    return () => clearInterval(t);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const los = phase >= LOS_FROM && phase < LOS_TO;
  const untilLos = Math.ceil((((LOS_FROM - phase + 1) % 1) * PERIOD_S));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= lines.length || from === to) return;
    const next = [...lines]; const [x] = next.splice(from, 1); next.splice(to, 0, x); setLines(next);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const from = lines.indexOf(drag);
    let to = from;
    rows.current.forEach((el, i) => {
      if (!el || i === from) return;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (i < from && e.clientY < mid) to = Math.min(to, i);
      if (i > from && e.clientY > mid) to = Math.max(to, i);
    });
    move(from, to);
  };
  const togglePin = (l: string) => {
    const next = new Set(pins);
    if (next.has(l)) next.delete(l); else if (next.size < MAX_PINS) next.add(l);
    setPins(next); play('sfx_click');
  };
  const swapIn = (spare: string) => {
    const target = sel && lines.includes(sel) ? sel : [...lines].reverse().find((l) => !pins.has(l)) ?? lines[lines.length - 1];
    setLines(lines.map((l) => (l === target ? spare : l)));
    if (pins.has(target)) { const p = new Set(pins); p.delete(target); setPins(p); }
    setSel(spare); play('sfx_click');
  };
  const a = phase * Math.PI * 2 - Math.PI / 2;      // phase 0 = over the station (top)
  const sx = 80 + Math.cos(a) * 58, sy = 80 + Math.sin(a) * 58;
  const arc = (f0: number, f1: number) => {
    const p = (f: number) => [80 + Math.cos(f * Math.PI * 2 - Math.PI / 2) * 58, 80 + Math.sin(f * Math.PI * 2 - Math.PI / 2) * 58];
    const [x0, y0] = p(f0), [x1, y1] = p(f1);
    return `M ${x0} ${y0} A 58 58 0 0 1 ${x1} ${y1}`;
  };
  return (
    <LabPage title="Orbit poem" idea="A personal keepsake of rearrangeable pieces, where a game mechanic shapes the art."
      quote="Something like fridge magnets… the order of the lines changes every time you look away.">
      <div className="lab-two">
        <div className="lab-fridge" onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)} aria-label="Poem board">
          {lines.map((l, i) => (
            <div key={l} ref={(el) => { rows.current[i] = el; }}
              className={`lab-magnet${drag === l ? ' dragging' : ''}${pins.has(l) ? ' pinned' : ''}${moved.has(l) ? ' moved' : ''}`}
              style={sel === l ? { outline: '3px solid #124e89' } : undefined}
              onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button')) return; setDrag(l); setSel(l); }}>
              <span className="txt">{l}</span>
              <button aria-label={`Move “${l}” up`} disabled={i === 0} onClick={() => move(i, i - 1)}>▲</button>
              <button aria-label={`Move “${l}” down`} disabled={i === lines.length - 1} onClick={() => move(i, i + 1)}>▼</button>
              <button aria-pressed={pins.has(l)} disabled={!pins.has(l) && pins.size >= MAX_PINS} onClick={() => togglePin(l)}
                title="A ground station holds this line through loss of signal">{pins.has(l) ? 'HELD' : 'pin'}</button>
            </div>
          ))}
          <span className="small" style={{ color: '#3a4466', marginTop: 'auto' }}>Drag a line, or use ▲ ▼. Lines you are holding never drift.</span>
        </div>
        <div className="col">
          <section className="panel dark col" aria-live="polite">
            <svg viewBox="0 0 160 160" className="lab-scene" style={{ border: 0, background: 'none' }} role="img"
              aria-label={los ? 'Loss of signal' : `In contact. Loss of signal in ${untilLos} seconds`}>
              <circle cx={80} cy={80} r={58} fill="none" stroke={C.slate} strokeDasharray="2 3" />
              <path d={arc(LOS_FROM, LOS_TO)} fill="none" stroke={C.red} strokeWidth={3} />
              <image href={planet('earth')} x={48} y={48} width={64} height={64} />
              <rect x={78} y={40} width={4} height={8} fill={C.gold} /><polygon points="72,40 88,40 84,34 76,34" fill={C.gold} />
              {!los && <line x1={80} y1={36} x2={sx} y2={sy} stroke={C.cyan} strokeDasharray="1 3" />}
              <image href={sc('sc_marker')} x={sx - 8} y={sy - 8} width={16} height={16} />
            </svg>
            <span className={los ? 'fail' : 'pass'}>{los ? 'LOSS OF SIGNAL: free lines drift' : reduced ? 'IN CONTACT' : `IN CONTACT · next loss in ${untilLos} s`}</span>
            <span className="small muted">Ground-station pins: {pins.size} / {MAX_PINS} · passes: {passes}</span>
            <button className="btn small" onClick={lose}>Skip to loss of signal ▶</button>
          </section>
          <section className="panel col">
            <span className="title" style={{ margin: 0 }}>Spare magnets</span>
            <span className="small muted">Click one to swap it for the selected line.</span>
            {POOL.filter((l) => !lines.includes(l)).map((l) => <button key={l} className="lab-spare small" onClick={() => swapIn(l)}>{l}</button>)}
            <button className="btn small" onClick={() => { navigator.clipboard?.writeText(lines.join('\n')).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? '✓ Copied' : 'Copy poem'}</button>
          </section>
        </div>
      </div>
    </LabPage>
  );
}
