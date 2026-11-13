// Report banner for career flights: progress, the newly unlocked mission, and the way back to the career map.
import { getCatalog } from '../../core';
import { navigate } from '../../router';
import { CAREER_ORDER, isUnlocked, reputation, REPUTATION_MAX, useCareer } from '../../state/career';
import { useGame } from '../../state/store';

export function CareerBanner() {
  const isCareer = useGame((g) => g.career);
  const s = useGame((g) => g.state);
  const career = useCareer();
  if (!isCareer || !s) return null;
  const i = CAREER_ORDER.indexOf(s.meta.scenarioId);
  const next = CAREER_ORDER[i + 1];
  const nextOpen = next && isUnlocked(career, i + 1);
  const nextName = next && getCatalog().scenarios.find((x) => x.id === next)!.name;
  return (
    <section className="panel col no-print" style={{ borderColor: 'var(--gold)' }} aria-label="Career progress">
      <div className="row between">
        <span className="title" style={{ margin: 0 }}>Agency career · mission {i + 1} of {CAREER_ORDER.length}</span>
        <span className="gold">Reputation {reputation(career)} / {REPUTATION_MAX} ★</span>
      </div>
      <span className="small">
        {!next ? 'This is the flagship mission: the last step of the career.'
          : nextOpen ? <>Next mission unlocked: <span className="gold">{nextName}</span>.</>
          : <>Fly this mission to a <span className="pass">success</span> to unlock <span className="gold">{nextName}</span>.</>}
      </span>
      <div className="row"><button className="btn small primary" onClick={async () => { await useGame.getState().leaveRoom(); navigate('/career'); }}>Career map ▶</button></div>
    </section>
  );
}
