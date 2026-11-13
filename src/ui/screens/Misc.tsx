import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  computeBudgets, decodeDesign, fmtGbitDay, fmtKg, fmtM, fmtMs, fmtNum, fmtW, getCatalog, type GlossaryEntry, type ScenarioId,
} from '../../core';
import { getScenario } from '../../core/catalog';
import { listLocal, listOnline, type LeaderboardEntry } from '../../net/leaderboard';
import { navigate, onlineEnabled } from '../../router';
import { KEYS, load, save, type SavedDesign } from '../../state/storage';
import { useDiscoveries } from '../../state/discoveries';
import { useGame } from '../../state/store';
import { GlossaryCard, Portrait, Stars, Speech } from '../components/common';

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="screen"><div className="page col" style={{ gap: 12 }}>
      <div className="row between"><h1>{title}</h1><button className="btn" onClick={() => navigate('/')}>◀ Title</button></div>
      {children}
    </div></main>
  );
}

const CATS: [GlossaryEntry['category'] | 'all', string][] = [['all', 'All'], ['orbits', 'Orbits'], ['rockets', 'Rockets'], ['power', 'Power'],
  ['data', 'Data & Comms'], ['spacecraft', 'Spacecraft'], ['mission', 'Mission']];

export function Academy({ focus }: { focus?: string }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [only, setOnly] = useState<'all' | 'found' | 'new'>('all');
  const found = useDiscoveries();
  const total = getCatalog().glossary.length;
  const list = getCatalog().glossary.filter((g) => (cat === 'all' || g.category === cat)
    && (only === 'all' || (only === 'found') === found.has(g.id))
    && (!q || `${g.term} ${g.short} ${g.long}`.toLowerCase().includes(q.toLowerCase())));
  useEffect(() => { if (focus) document.getElementById(`g-${focus}`)?.scrollIntoView(); }, [focus]);
  return (
    <Page title="Mission Academy">
      <section className="panel dark col" aria-label="Discovery log">
        <div className="row between"><span className="title" style={{ margin: 0 }}>Discovery log</span><span className="gold">{found.size} / {total} concepts</span></div>
        <div style={{ height: 12, border: '2px solid var(--border)' }}><div style={{ width: `${(found.size / total) * 100}%`, height: '100%', background: 'var(--gold)' }} /></div>
        <span className="small muted">Concepts are logged when a mission teaches them: a warning in the review, an event, or a lesson in the report. Everything here is open to read anytime.</span>
      </section>
      <div className="row wrap">
        <div className="seg">{([['all', 'All'], ['found', 'Discovered'], ['new', 'Not yet']] as const).map(([id, label]) =>
          <button key={id} aria-pressed={only === id} onClick={() => setOnly(id)}>{label}</button>)}</div>
        <input type="search" placeholder="Search terms…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the glossary" />
        <div className="seg">{CATS.map(([id, label]) => <button key={id} aria-pressed={cat === id} onClick={() => setCat(id)}>{label}</button>)}</div>
      </div>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {list.map((g) => <GlossaryCard key={g.id} id={g.id} onOpen={(id) => { setQ(''); setCat('all'); setTimeout(() => document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: 'smooth' })); }} />)}
      </div>
    </Page>
  );
}

/** Key numbers of a design code, as label/value rows (Saved & Compare, report attempt comparison). */
export function summary(code: string) {
  const p = decodeDesign(code);
  if (!p) return null;
  const b = computeBudgets(p.design, p.scenarioId, p.difficulty, p.split);
  return { p, rows: [
    ['Scenario', getScenario(p.scenarioId).name], ['Difficulty', p.difficulty], ['Orbit', p.design.planner.orbitId],
    ['Rocket', p.design.planner.launchVehicleId], ['Lifetime', `${p.design.planner.lifetimeYears} yr`], ['Bus', p.design.engineer.busId],
    ['Instruments', p.design.science.instrumentIds.join(', ')], ['Total mass', fmtKg(b.mass.totalKg)],
    ['Launch margin', b.mass.launchMarginPct == null ? 'cannot reach' : `${fmtNum(b.mass.launchMarginPct)}%`],
    ['Power', `${fmtW(b.power.generationW)} / ${fmtW(b.power.loadW)}`], ['Power margin', `${fmtNum(b.power.marginPct)}%`],
    ['Downlink', fmtGbitDay(b.data.downlinkGbitPerDay)], ['Data return', `${fmtNum(b.data.returnPct)}%`],
    ['Delta-v', fmtMs(b.deltaV.capabilityMs)], ['Total cost', fmtM(b.cost.totalM)], ['Reserve', `${fmtNum(b.cost.reservePct)}%`],
    ['Launch month', String(b.time.launchMonth)],
  ] as [string, string][] };
}

/** Side-by-side comparison of two design codes; rows that differ are highlighted. */
export function CompareTable({ a, b, labels = ['A', 'B'], scores }: { a: string; b: string; labels?: [string, string]; scores?: [number | undefined, number | undefined] }) {
  const sa = summary(a), sb = summary(b);
  if (!sa || !sb) return <p className="warn">! One of the codes is not a valid design code.</p>;
  return (
    <table className="grid">
      <thead><tr><th></th><th>{labels[0]}</th><th>{labels[1]}</th></tr></thead>
      <tbody>
        {sa.rows.map(([k, v], i) => <tr key={k} className={v !== sb.rows[i][1] ? 'diff' : ''}><td>{k}</td><td>{v}</td><td>{sb.rows[i][1]}</td></tr>)}
        {scores && <tr className={scores[0] !== scores[1] ? 'diff' : ''}><td>Score</td><td>{scores[0] ?? '—'}</td><td>{scores[1] ?? '—'}</td></tr>}
      </tbody>
    </table>
  );
}

export function Saved() {
  const [list, setList] = useState(() => load<SavedDesign[]>(KEYS.saved, []));
  const [a, setA] = useState(''), [bCode, setB] = useState('');
  const update = (l: SavedDesign[]) => { setList(l); save(KEYS.saved, l); };
  const sa = useMemo(() => (a ? summary(a) : null), [a]);
  const sb = useMemo(() => (bCode ? summary(bCode) : null), [bCode]);
  const scoreOf = (code: string) => list.find((x) => x.code === code)?.score;
  return (
    <Page title="Saved designs & compare">
      <section className="panel col">
        {list.length === 0 && <p className="muted">No saved designs yet. Use “Save design” on a mission report.</p>}
        {list.map((d, i) => (
          <div key={d.at} className="row wrap between">
            <span>{d.name} <span className="dim small">{new Date(d.at).toLocaleString()}{d.score != null && ` · score ${d.score}`}</span></span>
            <span className="row">
              <button className="btn small" onClick={() => navigate(`/design/${d.code}`)}>Open</button>
              <button className="btn small" onClick={() => setA(d.code)}>Compare A</button>
              <button className="btn small" onClick={() => setB(d.code)}>Compare B</button>
              <button className="btn small" onClick={() => navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/design/${d.code}`)}>Copy link</button>
              <button className="btn small danger" onClick={() => update(list.filter((_, k) => k !== i))}>Delete</button>
            </span>
          </div>
        ))}
      </section>
      <section className="panel col">
        <h2>Compare two designs</h2>
        <div className="row wrap">
          <label className="row">A <input type="text" value={a} onChange={(e) => setA(e.target.value.split('#/design/').pop()!.trim())} placeholder="paste a code or link" /></label>
          <label className="row">B <input type="text" value={bCode} onChange={(e) => setB(e.target.value.split('#/design/').pop()!.trim())} placeholder="paste a code or link" /></label>
        </div>
        {(a && !sa) || (bCode && !sb) ? <p className="warn">! One of the codes is not a valid design code.</p> : null}
        {sa && sb && (
          <table className="grid">
            <thead><tr><th></th><th>A</th><th>B</th></tr></thead>
            <tbody>
              {sa.rows.map(([k, v], i) => <tr key={k} className={v !== sb.rows[i][1] ? 'diff' : ''}><td>{k}</td><td>{v}</td><td>{sb.rows[i][1]}</td></tr>)}
              <tr className={scoreOf(a) !== scoreOf(bCode) ? 'diff' : ''}><td>Score</td><td>{scoreOf(a) ?? '—'}</td><td>{scoreOf(bCode) ?? '—'}</td></tr>
            </tbody>
          </table>
        )}
      </section>
    </Page>
  );
}

export function Leaderboard() {
  const [tab, setTab] = useState<'local' | 'online'>('local');
  const [scenario, setScenario] = useState<ScenarioId | ''>('');
  const [difficulty, setDifficulty] = useState('');
  const [challenge, setChallenge] = useState('');
  const [online, setOnline] = useState<LeaderboardEntry[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (tab !== 'online' || !scenario) return;
    setOnline(null); setErr('');
    listOnline(scenario).then(setOnline).catch(() => setErr("Can't reach the online leaderboard right now."));
  }, [tab, scenario]);
  const seed = challenge.trim() ? parseInt(challenge.trim().split('-').pop() ?? '', 36) : undefined;
  const rows = (tab === 'local' ? listLocal(scenario || undefined, Number.isFinite(seed) ? seed : undefined) : online ?? [])
    .filter((e) => !difficulty || e.difficulty === difficulty);
  return (
    <Page title="Leaderboard">
      <div className="row wrap">
        <div className="seg"><button aria-pressed={tab === 'local'} onClick={() => setTab('local')}>Local</button>
          {onlineEnabled() && <button aria-pressed={tab === 'online'} onClick={() => setTab('online')}>Online</button>}</div>
        <select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)} aria-label="Scenario">
          <option value="">All scenarios</option>{getCatalog().scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
          <option value="">All difficulties</option>{getCatalog().difficulties.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input type="text" placeholder="Challenge code" value={challenge} onChange={(e) => setChallenge(e.target.value)} />
      </div>
      {tab === 'online' && !scenario && <p className="muted">Choose a scenario to load the online board (entries are verified by replaying the design).</p>}
      {err && <p className="warn">{err}</p>}
      <table className="grid">
        <thead><tr><th>#</th><th>Team</th><th>Score</th><th>Stars</th><th>Outcome</th><th>Scenario</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="dim">No entries yet.</td></tr>}
          {rows.map((e, i) => (
            <tr key={`${e.at}-${i}`}><td>{i + 1}</td><td>{e.teamName}</td><td>{e.score}</td><td><Stars n={e.stars} size={16} /></td><td>{e.outcome}</td>
              <td>{getScenario(e.scenarioId).name} · {e.difficulty}</td><td><button className="btn small" onClick={() => navigate(`/design/${e.designCode}`)}>View design</button></td></tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}

export function SettingsScreen() {
  const settings = useGame((g) => g.settings);
  const setSettings = useGame((g) => g.setSettings);
  const [reset, setReset] = useState(false);
  return (
    <Page title="Settings">
      <section className="panel col" style={{ maxWidth: 640 }}>
        <label className="slider-row">Volume <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => setSettings({ volume: +e.target.value })} /><span>{Math.round(settings.volume * 100)}%</span></label>
        <label className="row"><input type="checkbox" checked={settings.muted} onChange={() => setSettings({ muted: !settings.muted })} /> Mute all sound</label>
        <div className="row">Text size
          <div className="seg">{([1, 1.25, 1.5] as const).map((v) => <button key={v} aria-pressed={settings.textScale === v} onClick={() => setSettings({ textScale: v })}>{v * 100}%</button>)}</div>
        </div>
        <label className="row"><input type="checkbox" checked={settings.reducedMotion} onChange={() => setSettings({ reducedMotion: !settings.reducedMotion })} /> Reduced motion</label>
        <button className="btn" onClick={() => { save(KEYS.tutorial, false); setReset(true); }}>{reset ? '✓ Tutorial will show again' : 'Reset tutorial'}</button>
        <button className="btn" onClick={() => history.back()}>Done</button>
      </section>
    </Page>
  );
}

export function Credits() {
  const crew = getCatalog().characters;
  return (
    <Page title="Credits">
      <section className="panel col">
        <h2>Team</h2>
        <p>Team Lead · Programmer A (simulation core & online rooms) · Programmer B (UI, scenes & build) · Character Artist · Environment & Asset Artist · QA & Playtest.</p>
        <p className="small muted">Diaa El Awdi appears in the game as a playable Mission Commander with his permission.</p>
      </section>
      <section className="panel col">
        <h2>Crew</h2>
        <div className="row wrap">{crew.map((c) => <span key={c.id} className="row"><Portrait id={c.id} size={32} />{c.name}</span>)}</div>
      </section>
      <section className="panel col">
        <h2>Built with</h2>
        <p>React, TypeScript, Vite, Zustand, Recharts, Firebase Realtime Database, lz-string, Vitest.</p>
        <p>Fonts: Press Start 2P (CodeMan38) and VT323 (Peter Hull), SIL Open Font License, self-hosted via @fontsource.</p>
        <p>Palette: ENDESGA 32 by Endesga.</p>
        <h2>Sources</h2>
        <p>R. Wessen, C. Borden, J. Ziemer, J. Kwok (JPL), <i>Space Mission Concept Development Using Concept Maturity Levels</i> (2013) ·
          J. Levri (NASA S3VI), <i>Design and Develop Science Missions</i> (2025) · NASA Webb, <i>Build It Yourself</i> · NASA <i>mission-viz</i>.
          Full list in docs/SOURCES.md; asset sources and licences in CREDITS.md.</p>
        <h2>Tools used</h2>
        <p>Claude (Anthropic) via Claude Code helped write game code, content files and documentation; see README → "Tools used".</p>
        <p className="small dim">NASA Space Apps Cairo 2026 · Space Mission Design Game challenge. Not endorsed by NASA or any agency.</p>
      </section>
    </Page>
  );
}

/** #/design/:code → decode and open in the solo shell. */
export function OpenDesign({ code }: { code: string }) {
  const start = useGame((g) => g.startSolo);
  const p = decodeDesign(code);
  useEffect(() => {
    if (p) start({ name: p.teamName || 'Crew', characterId: 'nour', scenarioId: p.scenarioId, difficulty: p.difficulty, seed: p.seed }, p.design);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (p) return <div className="page"><p>Opening shared design…</p></div>;
  return <Page title="Shared design"><p className="warn">That design code is not valid or comes from a different game version.</p></Page>;
}

/** First Cadet nile_watch mission: Dr. Hassan walks through dialog.tutorial with spotlight targets. */
export function Tutorial() {
  const s = useGame((g) => g.state);
  const briefingDone = useGame((g) => g.briefingDone);
  const set = useGame((g) => g.set);
  const lines = getCatalog().dialog.tutorial ?? [];
  const [i, setI] = useState(0);
  const [done, setDone] = useState(() => load<boolean>(KEYS.tutorial, false));
  const active = !done && !!s && s.meta.phase === 'design' && briefingDone && s.meta.difficulty === 'cadet' && s.meta.scenarioId === 'nile_watch' && lines.length > 0;
  const line = lines[i];
  useLayoutEffect(() => {
    if (!active || !line?.target) return;
    const tab = line.target.match(/^tab-(planner|engineer|science|comms)$/)?.[1];
    if (tab) set({ activeRole: tab as never });
    if (['orbit-cards', 'vehicle-cards'].includes(line.target)) set({ activeRole: 'planner' });
    if (line.target === 'instrument-cards') set({ activeRole: 'science' });
    if (line.target === 'radio-cards') set({ activeRole: 'comms' });
    if (line.target === 'launch-button') set({ reviewOpen: true });
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-tutorial="${line.target}"]`);
      el?.classList.add('tut-target');
      el?.scrollIntoView({ block: 'nearest' });
    }, 50);
    return () => { clearTimeout(t); document.querySelectorAll('.tut-target').forEach((e) => e.classList.remove('tut-target')); };
  }, [active, line, set]);
  if (!active || !line) return null;
  const finish = () => { save(KEYS.tutorial, true); setDone(true); };
  return (
    <div className="tut-box panel col" role="dialog" aria-label="Tutorial">
      <Speech speaker={line.speaker} expr={line.expr} text={line.text} />
      <div className="row between">
        <button className="btn small ghost" onClick={finish}>Skip tutorial</button>
        <span className="dim small">{i + 1} / {lines.length}</span>
        <span className="row">
          {i > 0 && <button className="btn small" onClick={() => setI(i - 1)}>Back</button>}
          {i < lines.length - 1 ? <button className="btn small primary" onClick={() => setI(i + 1)}>Next ▶</button>
            : <button className="btn small primary" onClick={finish}>Let's build!</button>}
        </span>
      </div>
    </div>
  );
}
