// Agency career (F-31): fly the five missions in order, small to flagship; each success unlocks the next.
import { useState } from 'react';
import { scenarioArt } from '../../assets';
import { play } from '../../audio/sound';
import { getCatalog } from '../../core';
import { navigate } from '../../router';
import { agencyRank, CAREER_ORDER, isUnlocked, reputation, REPUTATION_MAX, resetCareer, useCareer } from '../../state/career';
import { useGame } from '../../state/store';
import { CountUp, Icon, Stars } from '../components/common';
import { CharacterSelect, CrewChip } from './CharacterSelect';

export function Career() {
  const career = useCareer();
  const start = useGame((g) => g.startSolo);
  const set = useGame((g) => g.set);
  const [step, setStep] = useState<'crew' | 'career'>('crew');
  const [characterId, setCharacterId] = useState('nour');
  const [name, setName] = useState('Nour');
  const rep = reputation(career);
  const cat = getCatalog();
  const fly = (scenarioId: (typeof CAREER_ORDER)[number]) => {
    const sc = cat.scenarios.find((s) => s.id === scenarioId)!;
    play('sfx_success');
    start({ name: name.trim() || 'Crew', characterId, scenarioId, difficulty: sc.defaultDifficulty });
    set({ career: true });
  };
  if (step === 'crew') {
    return <CharacterSelect characterId={characterId} setCharacterId={setCharacterId} name={name} setName={setName}
      onConfirm={() => setStep('career')} onBack={() => navigate('/')} confirmLabel="To the career ▶" />;
  }
  return (
    <main className="screen"><div className="page col" style={{ gap: 12 }}>
      <div className="row between"><h1>Agency career</h1>
        <div className="row"><CrewChip characterId={characterId} name={name} onChange={() => setStep('crew')} />
          <button className="btn" onClick={() => setStep('crew')}>◀ Back</button></div></div>
      <section className="panel dark col">
        <div className="row between">
          <span className="title" style={{ margin: 0 }}>{agencyRank(rep)}</span>
          <span className="gold">Reputation <CountUp to={rep} ms={700} /> / {REPUTATION_MAX} ★</span>
        </div>
        <div style={{ height: 12, border: '2px solid var(--border)' }}><div style={{ width: `${(rep / REPUTATION_MAX) * 100}%`, height: '100%', background: 'var(--gold)', transition: 'width .7s var(--ease-out)' }} /></div>
        <span className="small muted">Grow from a garage team to a flagship agency. Fly each mission to a success to unlock the next one; your best stars on each mission make your reputation.</span>
      </section>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {CAREER_ORDER.map((id, i) => {
          const sc = cat.scenarios.find((s) => s.id === id)!;
          const diff = cat.difficulties.find((d) => d.id === sc.defaultDifficulty)!;
          const open = isUnlocked(career, i);
          const rec = career[id];
          return (
            <div key={id} className="card" style={{ cursor: 'default', opacity: open ? 1 : 0.55 }} aria-label={`${sc.name}${open ? '' : ' (locked)'}`}>
              <img src={scenarioArt(id)} width={160} height={90} alt="" style={{ width: '100%', height: 'auto', imageRendering: 'pixelated' }} />
              <span className="row between"><span className="title" style={{ margin: '4px 0' }}>{i + 1}. {sc.name}</span>{!open && <Icon id="ui_lock" size={16} alt="locked" />}</span>
              <span className="small muted">{sc.tagline}</span>
              <span className="row between small"><span className="chip">{diff.name}</span>{rec ? <Stars n={rec.stars} size={16} /> : <span className="dim">not flown</span>}</span>
              {rec && <span className="small">{rec.success ? <span className="pass">✓ success</span> : <span className="warn">! not yet a success</span>} · best {rec.score} · {rec.flights} flight{rec.flights > 1 ? 's' : ''}</span>}
              {open
                ? <button className="btn primary" onClick={() => fly(id)}>{rec ? 'Fly again' : 'Fly this mission'} ▶</button>
                : <span className="small dim">Unlocks after a success on “{cat.scenarios.find((s) => s.id === CAREER_ORDER[i - 1])!.name}”.</span>}
            </div>
          );
        })}
      </div>
      <div className="row"><button className="btn small ghost" onClick={() => { if (confirm('Reset your career progress?')) resetCareer(); }}>Reset career</button></div>
    </div></main>
  );
}
