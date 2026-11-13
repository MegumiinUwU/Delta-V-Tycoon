// Briefing (NASA: Identify Need & Goals · CML 1): one line from Dr. Hassan, the mission at a glance as icon tiles,
// and the full NASA-style requirements table (with "Verified by") one click away.
import { bg, itemIcon, orbitIcon, scenarioArt } from '../../assets';
import { play } from '../../audio/sound';
import { fmtM, getCatalog } from '../../core';
import { getScenario } from '../../core/catalog';
import { useGame } from '../../state/store';
import { Dialog, Icon } from '../components/common';
import { RequirementsPanel } from '../components/TopBar';

export function Briefing() {
  const state = useGame((g) => g.state)!;
  const budgets = useGame((g) => g.budgets);
  const room = useGame((g) => g.room)!;
  const set = useGame((g) => g.set);
  const sc = getScenario(state.meta.scenarioId);
  const cat = getCatalog();
  const intro = cat.dialog[`intro_${sc.id}`] ?? [];
  const orbit = cat.orbits.find((o) => o.id === sc.recommendedOrbit)!;
  // one icon per required group: the instruments that would satisfy it
  const needs = sc.requiredTagGroups.map((g) => cat.instruments.filter((i) => i.tags.some((t) => g.includes(t))).slice(0, 3));
  const go = async () => {
    play('sfx_click');
    set({ briefingDone: true });
    // solo: the council is a formality — use the suggested split and go straight to design
    if (room.mode === 'local' && state.meta.phase === 'council') {
      await room.setAgreed(true);
      await room.setMeta({ phase: 'design' });
    }
  };
  return (
    <div className="bgcover grow" style={{ backgroundImage: `url(${bg('bg_mission_control')})`, padding: 16 }}>
      <div className="page col panel" style={{ maxWidth: 900, background: '#262b44f2', gap: 14 }}>
        <div className="row" style={{ gap: 16, alignItems: 'stretch' }}>
          <img src={scenarioArt(sc.id)} width={240} height={135} alt="" style={{ imageRendering: 'pixelated', border: '2px solid var(--border)' }} />
          <div className="col grow" style={{ gap: 6 }}>
            <span className="badge" style={{ alignSelf: 'flex-start', color: 'var(--blue)' }}>Need &amp; Goals · CML 1</span>
            <h1 style={{ margin: 0 }}>{sc.name}</h1>
            <span className="gold">{sc.tagline}</span>
          </div>
        </div>
        {intro.length > 0 && <Dialog lines={intro} />}
        <div className="tiles" aria-label="Mission at a glance">
          {needs.map((list, k) => (
            <div key={k} className="tile" title={list.map((i) => i.name).join(' or ')}>
              <span className="row" style={{ gap: 2 }}>{list.map((i) => <img key={i.id} src={itemIcon(i.id)} width={32} height={32} alt={i.name} />)}</span>
              <span className="lbl">must carry</span>
              <span className="small">{[...new Set(list.map((i) => i.name.split(' ').slice(-1)[0]))].join(' or ')}</span>
            </div>
          ))}
          <div className="tile" title={orbit.description}>
            <img src={orbitIcon(orbit.id)} width={32} height={32} alt="" />
            <span className="lbl">best orbit</span><span className="small">{orbit.name}</span>
          </div>
          <div className="tile"><Icon id="res_time" size={32} /><span className="big">{sc.minLifetimeYears} yr</span><span className="lbl">minimum life</span></div>
          <div className="tile"><Icon id="res_budget" size={32} /><span className="big">{fmtM(budgets?.cost.budgetM ?? sc.budgetM)}</span><span className="lbl">budget</span></div>
          <div className="tile"><Icon id="res_science" size={32} /><span className="big">{sc.scienceTarget}</span><span className="lbl">science goal</span></div>
        </div>
        <p className="small" style={{ margin: 0 }}><span className="gold">Your data helps: </span>{sc.userSegment}</p>
        <details className="more">
          <summary>Mission requirements &amp; how NASA would verify them</summary>
          <RequirementsPanel />
        </details>
        <div className="row center">
          <button className="btn big gold" onClick={go}>Build the spacecraft ▶</button>
        </div>
      </div>
    </div>
  );
}
