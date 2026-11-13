import { useState } from 'react';
import { scenarioArt } from '../../assets';
import { play } from '../../audio/sound';
import { decodeChallenge, getCatalog, type DifficultyId, type ScenarioId } from '../../core';
import { navigate } from '../../router';
import { useGame } from '../../state/store';
import { SlideMarker } from '../components/common';
import { CharacterSelect, CrewChip } from './CharacterSelect';

const STARS: Record<string, string> = { cadet: '★', engineer: '★★', director: '★★★' };

export function ScenarioCards({ value, onChange, locked }: { value: ScenarioId; onChange: (s: ScenarioId) => void; locked?: boolean }) {
  const scenarios = getCatalog().scenarios;
  return (
    <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
      {scenarios.map((s) => (
        <button key={s.id} className="card scen" aria-pressed={s.id === value} disabled={locked && s.id !== value} title={s.tagline}
          onClick={() => { play('sfx_click'); onChange(s.id); }}>
          <img src={scenarioArt(s.id)} width={160} height={90} alt="" />
          <span className="body">
            <span className="row between"><span className="title" style={{ margin: 0, fontSize: 12 }}>{s.name}</span>
              <span className="gold" title="difficulty">{STARS[s.defaultDifficulty]}</span></span>
            <span className="small muted">{s.tagline.split(/[.—]/)[0]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function DifficultyPicker({ value, onChange, locked }: { value: DifficultyId; onChange: (d: DifficultyId) => void; locked?: boolean }) {
  const diffs = getCatalog().difficulties;
  return (
    <div className="seg" role="radiogroup" aria-label="Difficulty">
      <SlideMarker />
      {diffs.map((d) => (
        <button key={d.id} role="radio" aria-checked={d.id === value} aria-pressed={d.id === value} disabled={locked && d.id !== value}
          title={d.description} onClick={() => { play('sfx_click'); onChange(d.id); }}>{STARS[d.id]} {d.name}</button>
      ))}
    </div>
  );
}

export function SoloSetup() {
  const start = useGame((g) => g.startSolo);
  const [scenarioId, setScenario] = useState<ScenarioId>('nile_watch');
  const [difficulty, setDifficulty] = useState<DifficultyId>('cadet');
  const [step, setStep] = useState<'crew' | 'mission'>('crew');
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
  if (step === 'crew') {
    return <CharacterSelect characterId={characterId} setCharacterId={setCharacterId} name={name} setName={setName}
      onConfirm={() => setStep('mission')} onBack={() => navigate('/')} />;
  }
  return (
    <main className="screen">
      <div className="page col" style={{ gap: 12, paddingBottom: 0 }}>
        <div className="row between"><h1 style={{ margin: 0 }}>Pick a mission</h1><button className="btn" onClick={() => setStep('crew')}>◀ Back</button></div>
        <ScenarioCards value={scenarioId} locked={!!challenge} onChange={(s) => {
          setScenario(s);
          setDifficulty(getCatalog().scenarios.find((x) => x.id === s)!.defaultDifficulty);
        }} />
        <details className="more">
          <summary>Have a challenge code?</summary>
          <input type="text" value={code} placeholder="DVT-storm_watch-engineer-k3x9q1" onChange={(e) => applyCode(e.target.value)} style={{ width: 340 }} />
          {code.trim() && (challenge ? <span className="pass"> ✓ same events as the other teams</span> : <span className="warn"> ! not a valid code</span>)}
        </details>
      </div>
      <div className="setup-bar">
        <DifficultyPicker value={difficulty} onChange={setDifficulty} locked={!!challenge} />
        <CrewChip characterId={characterId} name={name} onChange={() => setStep('crew')} />
        <button className="btn big gold" disabled={!name.trim()}
          onClick={() => { play('sfx_success'); start({ name: name.trim() || 'Crew', characterId, scenarioId, difficulty, seed }); }}>
          Start ▶
        </button>
      </div>
    </main>
  );
}
