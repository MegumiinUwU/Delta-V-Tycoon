import { useEffect, useRef, useState } from 'react';
import { play } from '../../audio/sound';
import { fmtM, getCatalog, ROLE_TITLES, ROLES, type BudgetSplit, type Role } from '../../core';
import { useGame, useIsHost } from '../../state/store';
import { Dialog, Portrait, rangeFill, ROLE_COLOR } from '../components/common';

export const ROLE_GOALS: Record<Role, string> = {
  planner: 'Total cost ≤ 90% of budget AND launch on time',
  engineer: 'Launch mass margin ≥ 10%, power margin ≥ 15% and the battery covers eclipse',
  science: 'Science returned ≥ 100% of the scenario target',
  comms: '≥ 95% of generated data returned to Earth',
};
export const ROLE_OWNS: Record<Role, string> = {
  planner: 'orbit, mission lifetime, launch vehicle, delta-v margin',
  engineer: 'bus, solar array, RTGs, battery, computer, attitude control, propulsion',
  science: 'instruments',
  comms: 'radio, high-gain antenna, ground network',
};

/** Moving one slider takes points proportionally from the others; always integers summing to 100. */
export function rebalance(split: BudgetSplit, role: Role, value: number): BudgetSplit {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const others = ROLES.filter((r) => r !== role);
  const rest = others.reduce((s, r) => s + split[r], 0);
  const out = { ...split, [role]: v } as BudgetSplit;
  const remaining = 100 - v;
  others.forEach((r) => { out[r] = rest > 0 ? Math.round((split[r] / rest) * remaining) : Math.round(remaining / others.length); });
  const diff = 100 - ROLES.reduce((s, r) => s + out[r], 0);
  if (diff !== 0) { const big = others.reduce((a, b) => (out[a] >= out[b] ? a : b)); out[big] += diff; }
  return out;
}

export function SplitSliders({ split, budgetM, onChange }: { split: BudgetSplit; budgetM: number; onChange: (s: BudgetSplit) => void }) {
  return (
    <div className="col">
      {ROLES.map((r) => (
        <div key={r} className="slider-row">
          <label htmlFor={`split-${r}`}><span className="rolechip" style={{ background: ROLE_COLOR[r] }} />{ROLE_TITLES[r]}</label>
          <input id={`split-${r}`} type="range" min={0} max={100} step={1} value={split[r]} style={rangeFill(split[r], 0, 100)}
            onChange={(e) => onChange(rebalance(split, r, +e.target.value))} />
          <span>{split[r]}% · {fmtM((budgetM * split[r]) / 100)}</span>
        </div>
      ))}
    </div>
  );
}

export function Council() {
  const room = useGame((g) => g.room)!;
  const state = useGame((g) => g.state)!;
  const budgets = useGame((g) => g.budgets);
  const isHost = useIsHost();
  const [local, setLocal] = useState(state.council.split);
  const timer = useRef<number>();
  useEffect(() => { setLocal(state.council.split); }, [state.council.split]);
  const change = (s: BudgetSplit) => {
    setLocal(s);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => room.setSplit(s), 100);
  };
  const budgetM = budgets?.cost.budgetM ?? 0;
  const solo = room.mode === 'local';
  const players = Object.values(state.players).filter((p) => p.connected);
  const allAgreed = players.length > 0 && players.every((p) => state.council.agreed[p.uid]);
  const iAgreed = !!state.council.agreed[room.myUid];
  const line = getCatalog().dialog.council_solo ?? [];

  return (
    <div className="page col" style={{ maxWidth: 980, gap: 12 }}>
      <h1>Budget Council</h1>
      {solo && line.length > 0 && <Dialog lines={line} fill={{ budget: fmtM(budgetM) }} />}
      {!solo && <p className="muted">Split the {fmtM(budgetM)} budget between the four roles. Anyone can move the sliders — <span className="warn">any change clears all agreements</span>. This is where negotiation starts.</p>}
      <div className="panel">
        <SplitSliders split={local} budgetM={budgetM} onChange={change} />
      </div>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {ROLES.map((r) => {
          const holder = state.roles[r] ? state.players[state.roles[r]!] : null;
          return (
            <div key={r} className="panel dark col" style={{ borderColor: ROLE_COLOR[r] }}>
              <div className="row">{holder && <Portrait id={holder.characterId} size={40} />}<span className="title" style={{ margin: 0 }}>{ROLE_TITLES[r]}</span></div>
              <span className="small muted">Goal: {ROLE_GOALS[r]}</span>
            </div>
          );
        })}
      </div>
      {!solo && (
        <div className="panel row wrap">
          {players.map((p) => (
            <span key={p.uid} className="row"><Portrait id={p.characterId} size={32} />{p.name}
              {state.council.agreed[p.uid] ? <span className="pass">✓ agreed</span> : <span className="dim">… deciding</span>}</span>
          ))}
        </div>
      )}
      <div className="row center">
        {solo ? (
          <button className="btn big gold" onClick={async () => { play('sfx_coin'); await room.setSplit(local); await room.setAgreed(true); await room.setMeta({ phase: 'design' }); }}>
            Agree & start designing ▶
          </button>
        ) : (
          <>
            <button className={`btn big ${iAgreed ? '' : 'primary'}`} onClick={() => { play('sfx_signoff'); room.setAgreed(!iAgreed); }}>
              {iAgreed ? '✓ Agreed (tap to undo)' : 'Agree'}
            </button>
            {isHost
              ? <button className="btn big gold" disabled={!allAgreed} onClick={() => room.setMeta({ phase: 'design' })}>Open design ▶</button>
              : <span className="muted">{allAgreed ? 'Waiting for the host to open design…' : 'Waiting for everyone to agree…'}</span>}
          </>
        )}
      </div>
    </div>
  );
}
