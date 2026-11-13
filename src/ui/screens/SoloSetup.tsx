import { useState } from 'react';
import { scenarioArt } from '../../assets';
import { play } from '../../audio/sound';
import { decodeChallenge, getCatalog, type DifficultyId, type ScenarioId } from '../../core';
import { navigate } from '../../router';
import { useGame } from '../../state/store';
import { Portrait } from '../components/common';

/** Avatar grid + name (shared by solo, create room and join). */
export function AvatarPicker({ characterId, setCharacterId, name, setName }:
  { characterId: string; setCharacterId: (id: string) => void; name: string; setName: (n: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const crew = getCatalog().characters.filter((c) => c.playable);
  const shown = crew.find((c) => c.id === (hover ?? characterId));
  return (
    <div className="col">
      <div className="row wrap" role="radiogroup" aria-label="Choose your avatar">
        {crew.map((c) => (
          <button key={c.id} className="card" role="radio" aria-checked={c.id === characterId} aria-pressed={c.id === characterId}
            style={{ width: 96, alignItems: 'center' }} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(c.id)} onBlur={() => setHover(null)}
            onClick={() => { play('sfx_click'); setCharacterId(c.id); setName(c.name.split(' ')[0]); }}>
            <Portrait id={c.id} expr={hover === c.id ? 'happy' : 'neutral'} size={64} />
            <span className="small">{c.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>
      {shown && <p className="small muted"><span className="gold">{shown.name}</span> ({shown.from}) · {shown.title} — {shown.bio}</p>}
      <label className="row">Your name
        <input type="text" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} style={{ width: 220 }} />
      </label>
    </div>
  );
}

export function ScenarioCards({ value, onChange, locked }: { value: ScenarioId; onChange: (s: ScenarioId) => void; locked?: boolean }) {
  const scenarios = getCatalog().scenarios;
  return (
    <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {scenarios.map((s) => (
        <button key={s.id} className="card" aria-pressed={s.id === value} disabled={locked && s.id !== value}
          onClick={() => { play('sfx_click'); onChange(s.id); }}>
          <img src={scenarioArt(s.id)} width={160} height={90} alt="" style={{ width: '100%', height: 'auto' }} />
          <span className="title" style={{ margin: '4px 0' }}>{s.name}</span>
          <span className="small muted">{s.tagline}</span>
          <span className="row wrap small">
            <span className="chip">{getCatalog().difficulties.find((d) => d.id === s.defaultDifficulty)?.name}</span>
            {s.id === 'nile_watch' && <span className="chip gold">recommended for beginners</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function DifficultyPicker({ value, onChange, locked }: { value: DifficultyId; onChange: (d: DifficultyId) => void; locked?: boolean }) {
  const diffs = getCatalog().difficulties;
  return (
    <div className="col">
      <div className="seg" role="radiogroup" aria-label="Difficulty">
        {diffs.map((d) => (
          <button key={d.id} role="radio" aria-checked={d.id === value} aria-pressed={d.id === value} disabled={locked && d.id !== value}
            onClick={() => onChange(d.id)}>{d.name}</button>
        ))}
      </div>
      <span className="small muted">{diffs.find((d) => d.id === value)?.description}</span>
    </div>
  );
}

export function SoloSetup() {
  const start = useGame((g) => g.startSolo);
  const [scenarioId, setScenario] = useState<ScenarioId>('nile_watch');
  const [difficulty, setDifficulty] = useState<DifficultyId>('cadet');
  const [characterId, setCharacterId] = useState('nour');
  const [name, setName] = useState('Nour');
  const [code, setCode] = useState('');
  const [seed, setSeed] = useState<number | undefined>();
  const challenge = code.trim() ? decodeChallenge(code.trim()) : null;
  const applyCode = (c: string) => {
    setCode(c);
    const d = c.trim() ? decodeChallenge(c.trim()) : null;
    if (d) { setScenario(d.scenarioId); setDifficulty(d.difficulty); setSeed(d.seed); } else setSeed(undefined);
  };
  return (
    <main className="screen">
      <div className="page col" style={{ gap: 16 }}>
        <div className="row between"><h1>Solo mission</h1><button className="btn" onClick={() => navigate('/')}>◀ Back</button></div>
        <section className="panel col">
          <h2>1. Choose a mission</h2>
          <ScenarioCards value={scenarioId} locked={!!challenge} onChange={(s) => {
            setScenario(s);
            setDifficulty(getCatalog().scenarios.find((x) => x.id === s)!.defaultDifficulty);
          }} />
        </section>
        <section className="panel col">
          <h2>2. Difficulty</h2>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} locked={!!challenge} />
        </section>
        <section className="panel col">
          <h2>3. Your avatar</h2>
          <AvatarPicker characterId={characterId} setCharacterId={setCharacterId} name={name} setName={setName} />
        </section>
        <section className="panel col">
          <label className="row">Have a challenge code?
            <input type="text" value={code} placeholder="DVT-storm_watch-engineer-k3x9q1" onChange={(e) => applyCode(e.target.value)} style={{ width: 340 }} />
          </label>
          {code.trim() && (challenge
            ? <span className="pass">✓ Seed locked — same events as the other teams.</span>
            : <span className="warn">! That code is not valid. It looks like DVT-scenario-difficulty-seed.</span>)}
        </section>
        <div className="row center">
          <button className="btn big gold" disabled={!name.trim()}
            onClick={() => { play('sfx_success'); start({ name: name.trim() || 'Crew', characterId, scenarioId, difficulty, seed }); }}>
            Start mission ▶
          </button>
        </div>
      </div>
    </main>
  );
}
