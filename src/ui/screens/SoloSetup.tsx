import { useEffect, useState } from 'react';
import { scenarioArt } from '../../assets';
import { play, playVoice } from '../../audio/sound';
import { hush, sayNow } from '../../audio/voice';
import { decodeChallenge, getCatalog, type DifficultyId, type ScenarioId } from '../../core';
import { navigate } from '../../router';
import { useGame } from '../../state/store';
import { Portrait } from '../components/common';

/** Names written family-name first: show the given name (last word) on cards and as the default player name. */
const FAMILY_NAME_FIRST = new Set(['miku', 'teto', 'neru']);
export const shortName = (c: { id: string; name: string }): string => {
  const parts = c.name.split(' ');
  return FAMILY_NAME_FIRST.has(c.id) ? parts[parts.length - 1] : parts[0];
};

/** Avatar row + name (shared by solo, create room and join). Portraits only; name/bio on hover. */
export function AvatarPicker({ characterId, setCharacterId, name, setName, showName = true }:
  { characterId: string; setCharacterId: (id: string) => void; name: string; setName: (n: string) => void; showName?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const crew = getCatalog().characters.filter((c) => c.playable);
  useEffect(() => () => hush('avatar'), []);
  return (
    <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
      <div className="row" role="radiogroup" aria-label="Choose your avatar" style={{ gap: 2 }}>
        {crew.map((c) => (
          <button key={c.id} className="av" role="radio" aria-checked={c.id === characterId} title={`${c.name} · ${c.title}`}
            onMouseEnter={() => { setHover(c.id); playVoice(c.id); }} onMouseLeave={() => setHover(null)}
            onFocus={() => { setHover(c.id); playVoice(c.id); }} onBlur={() => setHover(null)}
            onClick={() => { play('sfx_click'); sayNow('avatar', c.id, c.lines.success); setCharacterId(c.id); setName(shortName(c)); }}>
            <Portrait id={c.id} expr={hover === c.id || c.id === characterId ? 'happy' : 'neutral'} size={48} />
          </button>
        ))}
      </div>
      {showName && <input type="text" aria-label="Your name" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} style={{ width: 130 }} />}
    </div>
  );
}

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
      <div className="page col" style={{ gap: 12, paddingBottom: 0 }}>
        <div className="row between"><h1 style={{ margin: 0 }}>Pick a mission</h1><button className="btn" onClick={() => navigate('/')}>◀ Back</button></div>
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
        <AvatarPicker characterId={characterId} setCharacterId={setCharacterId} name={name} setName={setName} />
        <button className="btn big gold" disabled={!name.trim()}
          onClick={() => { play('sfx_success'); start({ name: name.trim() || 'Crew', characterId, scenarioId, difficulty, seed }); }}>
          Start ▶
        </button>
      </div>
    </main>
  );
}
