// Crew cabin: the Idea Lab hub, drawn as a themed room. Wooden furniture, pines painted on the walls, and the game's
// own solar system on the ceiling: the Sun, Earth with its three orbits, the Moon, L2 and Mars. A mission you have
// flown lights up at the place it flew to. The steel board opens the orbit poem and the bookshelf opens the crew shorts.
import { useEffect, useState } from 'react';
import { bg, idleSprite, planet } from '../assets';
import { getCatalog, type ScenarioId } from '../core';
import { navigate } from '../router';
import { CAREER_ORDER, useCareer } from '../state/career';
import { useGame } from '../state/store';
import { C, LabPage, SvgSprite } from './common';

const ROOMS: { id: string; title: string; what: string; idea: string }[] = [
  { id: 'poem', title: 'Orbit poem', what: 'On the steel board', idea: 'Magnet lines you rearrange; they shuffle at every loss of signal.' },
  { id: 'stories', title: 'Crew shorts', what: 'On the bookshelf', idea: 'Four-panel comics about the lives of the crew.' },
];

/** Where each mission sits on the ceiling. */
const SPOT: Record<string, [number, number, string, ('start' | 'end')?]> = {
  nile_watch: [151, 9, 'SSO', 'end'], storm_watch: [186, 50, 'GEO'], ice_hunter: [236, 20, 'Moon'], first_light: [292, 42, 'L2'], red_relay: [392, 26, 'Mars'],
};

function Pine({ x, y, s = 1, c = C.forest }: { x: number; y: number; s?: number; c?: string }) {
  return (
    <g fill={c}>
      <polygon points={`${x},${y} ${x - 5 * s},${y + 9 * s} ${x + 5 * s},${y + 9 * s}`} />
      <polygon points={`${x},${y + 5 * s} ${x - 7 * s},${y + 16 * s} ${x + 7 * s},${y + 16 * s}`} />
      <polygon points={`${x},${y + 11 * s} ${x - 9 * s},${y + 24 * s} ${x + 9 * s},${y + 24 * s}`} />
      <rect x={x - 1 * s} y={y + 24 * s} width={2 * s} height={4 * s} fill={C.bark} />
    </g>
  );
}

function Hot({ id, label, x, y, w, h, children }: { id: string; label: string; x: number; y: number; w: number; h: number; children: React.ReactNode }) {
  const ly = y - 11;
  const go = () => navigate(`/lab/${id}`);
  return (
    <g className="hot" role="link" tabIndex={0} aria-label={label} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
      {children}
      <rect className="hot-frame" x={x} y={y} width={w} height={h} fill="transparent" stroke="transparent" strokeWidth={1} strokeDasharray="3 2" />
      <rect x={x + w / 2 - label.length * 2.4 - 3} y={ly} width={label.length * 4.8 + 6} height={9} fill={C.ink} opacity={0.85} />
      <text x={x + w / 2} y={ly + 7} textAnchor="middle" fontSize={8} fill={C.yellow}>{label}</text>
    </g>
  );
}

export function Cabin() {
  const career = useCareer();
  const attempts = useGame((g) => g.attempts);
  const reduced = useGame((g) => g.settings.reducedMotion);
  const [f, setF] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setF((x) => (x + 1) % 4), 170);
    return () => clearInterval(t);
  }, [reduced]);
  const cat = getCatalog();
  const flown = (id: ScenarioId) => !!career[id] || attempts.some((a) => a.scenarioId === id);
  const flownCount = CAREER_ORDER.filter(flown).length;
  // deterministic ceiling stars
  const stars = Array.from({ length: 70 }, (_, i) => [(i * 137) % 472 + 4, (i * 53) % 62 + 3, i % 7 === 0 ? 2 : 1] as const);
  return (
    <LabPage title="Crew cabin · Idea Lab" back="/" idea="Make a themed room: wood, tree motifs and a starry ceiling."
      quote="Wooden furniture… Trees on the walls. Rest of the solar system on the ceiling.">
      <svg className="lab-scene" viewBox="0 0 480 270" role="group" aria-label="The crew cabin. The steel board and the bookshelf open.">
        {/* ceiling: the solar system as the game knows it */}
        <rect width={480} height={70} fill={C.ink} />
        {stars.map(([x, y, s], i) => <rect key={i} x={x} y={y} width={s} height={s} fill={i % 5 === 0 ? C.yellow : C.silver} opacity={i % 3 === 0 ? 1 : 0.6} />)}
        <image href={planet('sun')} x={8} y={10} width={48} height={48} />
        <path d="M 60 60 Q 240 -10 470 46" fill="none" stroke={C.slate} strokeDasharray="2 3" />
        <ellipse cx={160} cy={36} rx={22} ry={8} fill="none" stroke={C.blue} /><ellipse cx={160} cy={36} rx={10} ry={30} fill="none" stroke={C.lime} />
        <ellipse cx={160} cy={36} rx={44} ry={16} fill="none" stroke={C.gold} />
        <image href={planet('earth')} x={148} y={24} width={24} height={24} />
        <text x={160} y={66} textAnchor="middle" fontSize={7} fill={C.grey}>Earth · LEO · SSO · GEO</text>
        <image href={planet('moon')} x={214} y={28} width={12} height={12} />
        <polygon points="278,42 282,38 286,42 282,46" fill="none" stroke={C.cyan} />
        <image href={planet('mars')} x={364} y={28} width={18} height={18} />
        {CAREER_ORDER.map((id) => {
          const [x, y, where, anchor = 'start'] = SPOT[id];
          const on = flown(id);
          const name = cat.scenarios.find((s) => s.id === id)!.name;
          const label = on ? name : where, lw = label.length * 3.7 + 4, lx = anchor === 'end' ? x - 6 - lw : x + 5;
          return (
            <g key={id} opacity={on ? 1 : 0.55}>
              <title>{`${name}: ${on ? 'flown' : 'not flown yet'}`}</title>
              {on ? <polygon points={`${x},${y - 4} ${x + 1.5},${y - 1} ${x + 4},${y - 1} ${x + 2},${y + 1} ${x + 3},${y + 4} ${x},${y + 2} ${x - 3},${y + 4} ${x - 2},${y + 1} ${x - 4},${y - 1} ${x - 1.5},${y - 1}`} fill={C.gold} />
                : <rect x={x - 1} y={y - 1} width={3} height={3} fill={C.grey} />}
              {on && <rect x={lx} y={y - 5} width={lw} height={9} fill={C.ink} opacity={0.85} />}
              <text x={lx + 2} y={y + 2} fontSize={7} fill={on ? C.gold : C.grey}>{label}</text>
            </g>
          );
        })}
        <rect x={0} y={70} width={480} height={6} fill={C.bark} /><rect x={0} y={70} width={480} height={1} fill={C.wood} />
        {/* wall: planks, with a painted row of pines */}
        <rect x={0} y={76} width={480} height={126} fill={C.oak} />
        {Array.from({ length: 21 }, (_, i) => <rect key={i} x={i * 24 - 1} y={76} width={2} height={126} fill={C.wood} />)}
        {Array.from({ length: 14 }, (_, i) => <Pine key={i} x={18 + i * 34} y={i % 2 ? 84 : 80} s={i % 2 ? 0.8 : 1} c={i % 3 === 0 ? C.green : C.forest} />)}
        {/* window onto the pad */}
        <rect x={196} y={114} width={88} height={58} fill={C.bark} />
        <svg x={200} y={118} width={80} height={50} viewBox="150 80 220 138" preserveAspectRatio="xMidYMid slice"><image href={bg('bg_launch_pad')} width={480} height={270} /></svg>
        <rect x={239} y={118} width={2} height={50} fill={C.bark} /><rect x={200} y={142} width={80} height={2} fill={C.bark} />
        <rect x={192} y={172} width={96} height={4} fill={C.wood} />
        {/* floor and rug */}
        <rect x={0} y={202} width={480} height={68} fill={C.wood} />
        {Array.from({ length: 5 }, (_, i) => <rect key={i} x={0} y={202 + i * 14} width={480} height={1} fill={C.bark} />)}
        <rect x={150} y={232} width={180} height={26} fill={C.wine} /><rect x={154} y={236} width={172} height={18} fill="none" stroke={C.gold} />
        <rect x={150} y={232} width={4} height={26} fill={C.gold} /><rect x={326} y={232} width={4} height={26} fill={C.gold} />
        {/* bookshelf → crew shorts */}
        <Hot id="stories" label="Crew shorts" x={14} y={118} w={70} h={96}>
          <rect x={14} y={118} width={70} height={96} fill={C.bark} /><rect x={18} y={122} width={62} height={88} fill={C.wood} />
          {[0, 1, 2].map((r) => <g key={r}>
            <rect x={18} y={148 + r * 30} width={62} height={3} fill={C.bark} />
            {Array.from({ length: 9 }, (_, i) => {
              const h = 16 + ((i * 7 + r * 3) % 7);
              return <rect key={i} x={20 + i * 6.6} y={148 + r * 30 - h} width={5} height={h} fill={[C.red, C.deep, C.gold, C.green, C.cream, C.blue, C.orange][(i + r * 2) % 7]} />;
            })}
          </g>)}
        </Hot>
        {/* steel board → magnet poem */}
        <Hot id="poem" label="Orbit poem" x={100} y={118} w={76} h={50}>
          <rect x={100} y={118} width={76} height={50} fill={C.bark} /><rect x={103} y={121} width={70} height={44} fill={C.silver} />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={108 + (i % 2) * 4} y={126 + i * 7} width={40 + ((i * 11) % 18)} height={5} fill={C.white} stroke={C.ink} strokeWidth={0.5} />)}
          <rect x={164} y={125} width={4} height={4} fill={C.red} />
        </Hot>
        {/* potted sapling */}
        <rect x={183} y={196} width={12} height={12} fill={C.orange} /><rect x={181} y={194} width={16} height={3} fill={C.wine} />
        <Pine x={189} y={166} s={1} c={C.green} />
        {/* clipboard (furniture) */}
        <g>
          <rect x={296} y={118} width={26} height={36} fill={C.pine} /><rect x={299} y={123} width={20} height={28} fill={C.white} />
          <rect x={304} y={116} width={10} height={5} fill={C.steel} />
          {[0, 1, 2, 3].map((i) => <g key={i}><rect x={301} y={127 + i * 6} width={3} height={3} fill={i < 2 ? C.lime : C.silver} /><rect x={306} y={128 + i * 6} width={11} height={1} fill={C.steel} /></g>)}
        </g>
        {/* desk with a model spacecraft (furniture) */}
        <g>
          <rect x={334} y={184} width={76} height={6} fill={C.pine} /><rect x={334} y={190} width={76} height={2} fill={C.bark} />
          <rect x={338} y={192} width={5} height={22} fill={C.oak} /><rect x={401} y={192} width={5} height={22} fill={C.oak} />
          <rect x={346} y={180} width={52} height={4} fill={C.green} />
          <rect x={364} y={162} width={16} height={12} fill={C.silver} /><rect x={364} y={160} width={16} height={2} fill={C.gold} />
          <rect x={346} y={164} width={16} height={7} fill={C.deep} /><rect x={382} y={164} width={16} height={7} fill={C.deep} />
          <rect x={370} y={174} width={4} height={6} fill={C.cyan} opacity={0.6} />
          {[C.gold, C.orange, C.lime].map((c, i) => <g key={i}><rect x={349 + i * 5} y={176} width={3} height={4} fill={C.white} /><rect x={349 + i * 5} y={173} width={3} height={3} fill={c} /></g>)}
        </g>
        {/* trunk (furniture) */}
        <g>
          <rect x={414} y={186} width={56} height={28} fill={C.oak} /><rect x={414} y={180} width={56} height={8} fill={C.pine} />
          <rect x={414} y={186} width={56} height={2} fill={C.bark} /><rect x={438} y={186} width={8} height={8} fill={C.gold} />
          <rect x={420} y={198} width={44} height={10} fill={C.cream} /><text x={442} y={206} textAnchor="middle" fontSize={7} fill={C.ink}>FLIGHT KIT</text>
        </g>
        {/* crew at home */}
        <SvgSprite href={idleSprite('amara')} x={90} y={176} frame={f} />
        <SvgSprite href={idleSprite('hassan')} x={222} y={182} frame={(f + 1) % 4} />
        <SvgSprite href={idleSprite('omar')} x={300} y={178} frame={(f + 2) % 4} />
        <SvgSprite href={idleSprite('priya')} x={262} y={186} frame={(f + 3) % 4} />
      </svg>
      <span className="small muted">Ceiling: {flownCount} of {CAREER_ORDER.length} missions flown. A mission lights up where it flew once you have a report for it.</span>
      <div className="lab-wood">
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
          {ROOMS.map((r) => (
            <button key={r.id} className="lab-sign" onClick={() => navigate(`/lab/${r.id}`)}>
              <b>{r.title}</b><span className="small">{r.what}</span><span className="small">{r.idea}</span>
            </button>
          ))}
        </div>
      </div>
    </LabPage>
  );
}
