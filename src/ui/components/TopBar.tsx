import { conceptMaturity, fmtM, tagGroupsWords, type Phase } from '../../core';
import { getCatalog } from '../../core';
import { getDifficulty, getScenario } from '../../core/catalog';
import { navigate } from '../../router';
import { useGame, useIsHost } from '../../state/store';
import { STEPS, PHASES as ORDER } from '../steps';
import { Modal, Portrait, SlideMarker } from './common';

export function TopBar() {
  const state = useGame((g) => g.state);
  const room = useGame((g) => g.room);
  const budgets = useGame((g) => g.budgets);
  const checks = useGame((g) => g.checks);
  const briefingDone = useGame((g) => g.briefingDone);
  const set = useGame((g) => g.set);
  const chatSeen = useGame((g) => g.chatSeen);
  const connected = useGame((g) => g.connected);
  const isHost = useIsHost();
  if (!state || !room) return null;
  const sc = getScenario(state.meta.scenarioId);
  const diff = getDifficulty(state.meta.difficulty);
  const phase = state.meta.phase === 'council' && !briefingDone ? 'lobby' : state.meta.phase;
  const idx = ORDER.indexOf(phase);
  const m = conceptMaturity(checks);
  const unread = Math.max(0, state.chat.length - chatSeen);
  const pending = state.requests.filter((r) => r.status === 'pending' && state.roles[r.toRole] === room.myUid);
  return (
    <>
      <header className="topbar no-print">
        <button className="iconbtn" onClick={() => { if (confirm('Leave this mission and return to the title screen?')) { useGame.getState().leaveRoom(); navigate('/'); } }}
          aria-label="Back to title">◀</button>
        <div className="col" style={{ gap: 0 }}>
          <span className="title" style={{ margin: 0 }}>{sc.name}</span>
          <span className="small muted">{diff.name} · Budget {fmtM(budgets?.cost.budgetM ?? sc.budgetM * diff.budgetMult)}
            {state.meta.code && <> · Room <span className="gold">{state.meta.code}</span></>}</span>
        </div>
        <nav className="stepper grow" aria-label="Mission phase">
          {STEPS.map((s, i) => {
            const on = s.phases.includes(phase as Phase);
            const done = ORDER.indexOf(s.phases[0]) < idx;
            const cml = s.label === 'Build & Verify' && idx >= 2 ? `CML ${m.cml}` : s.cml;
            return (
              <div key={s.label} className={`step ${on ? 'on' : done ? 'done' : ''}`} aria-current={on ? 'step' : undefined}>
                {done ? <span className="tick" aria-label="done">✓</span> : `${i + 1}.`} {s.label}{cml && <span className="cml">{cml}</span>}
              </div>
            );
          })}
          <SlideMarker />
        </nav>
        <button className="btn small" onClick={() => set({ requirementsOpen: true })}>Mission requirements</button>
        {pending.length > 0 && <span className="badge gold" title="Funds requests waiting for you">$ {pending.length}</span>}
        {room.mode === 'online' && (
          <div className="row" aria-label="Crew">
            {Object.values(state.players).map((p) => (
              <span key={p.uid} title={`${p.name}${p.uid === state.meta.hostUid ? ' (host)' : ''}${p.connected ? '' : ' — disconnected'}`}
                style={{ position: 'relative', opacity: p.connected ? 1 : 0.35 }}>
                <Portrait id={p.characterId} size={28} title={p.name} />
                <span style={{ position: 'absolute', right: 0, bottom: 0, width: 8, height: 8, background: p.connected ? 'var(--pass)' : 'var(--fail)' }} />
              </span>
            ))}
            <button className="btn small" onClick={() => set({ chatOpen: true, chatSeen: state.chat.length })}>
              Chat{unread > 0 && <span className="badge gold">{unread}</span>}
            </button>
          </div>
        )}
        {isHost && room.mode === 'online' && <span className="small gold" title="You are the host">♛</span>}
        <button className="iconbtn" aria-label="Glossary" onClick={() => set({ glossaryId: 'trade_off' })}>?</button>
        <a className="iconbtn" href="#/settings" aria-label="Settings">⚙</a>
      </header>
      {room.mode === 'online' && !connected && <div className="banner">Reconnecting…</div>}
      <RequirementsModal />
    </>
  );
}

/** F-36: requirements with a "Verified by" column + user segment. */
export function RequirementsPanel() {
  const state = useGame((g) => g.state);
  const budgets = useGame((g) => g.budgets);
  if (!state) return null;
  const sc = getScenario(state.meta.scenarioId);
  const orbits = getCatalog().orbits;
  const fit = Object.entries(sc.orbitFit).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([o, f]) => `${orbits.find((x) => x.id === o)?.name ?? o} (${Math.round((f ?? 0) * 100)}%)`).join(', ');
  const rows: [string, string, string][] = [
    ...sc.requiredTagGroups.map((g): [string, string, string] => ['Required instrument', `a ${tagGroupsWords([g])} instrument`, 'Readiness review (inspection)']),
    ['Orbit suits the mission', fit, 'Orbit fit check (analysis)'],
    ['Minimum lifetime', `${sc.minLifetimeYears} years in orbit`, 'Operations simulation (demonstration)'],
    ['Budget', fmtM(budgets?.cost.budgetM ?? sc.budgetM), 'Cost roll-up (analysis)'],
    ['Launch window', `launch by month ${sc.launchWindowMonths}${sc.hardLaunchWindow ? ' (Mars window — next one 26 months later)' : ''}`, 'Schedule analysis'],
    ['Science return', `${sc.scienceTarget} science points`, 'Operations simulation (demonstration)'],
  ];
  return (
    <div className="col">
      <p><span className="gold">Who uses your data: </span>{sc.userSegment}</p>
      <table className="grid">
        <thead><tr><th>Requirement</th><th>Value</th><th>Verified by</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td className="muted">{r[2]}</td></tr>)}</tbody>
      </table>
      {sc.learningGoals?.length > 0 && (
        <div>
          <h3 className="gold">Learning goals</h3>
          <ul style={{ margin: 0 }}>{sc.learningGoals.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function RequirementsModal() {
  const open = useGame((g) => g.requirementsOpen);
  const set = useGame((g) => g.set);
  if (!open) return null;
  return (
    <Modal label="Mission requirements" onClose={() => set({ requirementsOpen: false })}>
      <div className="row between"><h2>Mission requirements</h2><button className="btn small" onClick={() => set({ requirementsOpen: false })}>Close</button></div>
      <RequirementsPanel />
    </Modal>
  );
}
