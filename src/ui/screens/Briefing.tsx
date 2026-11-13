import { bg } from '../../assets';
import { getCatalog } from '../../core';
import { getScenario } from '../../core/catalog';
import { useGame } from '../../state/store';
import { Dialog } from '../components/common';
import { RequirementsPanel } from '../components/TopBar';

export function Briefing() {
  const state = useGame((g) => g.state)!;
  const set = useGame((g) => g.set);
  const sc = getScenario(state.meta.scenarioId);
  const intro = getCatalog().dialog[`intro_${sc.id}`] ?? [];
  return (
    <div className="bgcover grow" style={{ backgroundImage: `url(${bg('bg_mission_control')})`, padding: 16 }}>
      <div className="page col panel" style={{ maxWidth: 980, background: '#262b44ee', gap: 12, position: 'relative' }}>
        <span className="badge" style={{ position: 'absolute', top: 12, right: 12, color: 'var(--blue)' }}>CML 1 · Cocktail Napkin</span>
        <h1>{sc.name}</h1>
        <p className="gold">{sc.tagline}</p>
        {intro.length > 0 && <Dialog lines={intro} />}
        <p>{sc.briefing}</p>
        <RequirementsPanel />
        <div className="row center">
          <button className="btn big gold" onClick={() => set({ briefingDone: true })}>Continue ▶</button>
        </div>
      </div>
    </div>
  );
}
