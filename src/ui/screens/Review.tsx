import { useState } from 'react';
import { play } from '../../audio/sound';
import { conceptMaturity, getCatalog, ROLE_TITLES, ROLES, type Role } from '../../core';
import { useGame, useIsHost, useMyRoles } from '../../state/store';
import { Help, Modal, Portrait, ROLE_COLOR, Speech, Status, Term } from '../components/common';

export function MaturityMeter() {
  const checks = useGame((g) => g.checks);
  const m = conceptMaturity(checks);
  const total = Math.max(1, checks.length);
  const line = getCatalog().dialog[`review_cml${m.cml}`]?.[0];
  return (
    <div className="panel dark col">
      <div className="row between">
        <span className="title" style={{ margin: 0 }}><Term id="concept_maturity">Concept Maturity</Term>: CML {m.cml} {m.name}</span>
        <Help id="concept_maturity" />
      </div>
      <div style={{ position: 'relative', height: 16, display: 'flex', border: '2px solid var(--border)' }} role="img"
        aria-label={`${Math.round(m.greenPct)}% green, ${m.yellow} yellow, ${m.red} red`}>
        <div style={{ width: `${(m.green / total) * 100}%`, background: 'var(--pass)', transition: 'width .4s' }} />
        <div style={{ width: `${(m.yellow / total) * 100}%`, background: 'var(--warn)', transition: 'width .4s' }} />
        <div style={{ width: `${(m.red / total) * 100}%`, background: 'var(--fail)', transition: 'width .4s' }} />
        <div title="80% green needed for CML 4" style={{ position: 'absolute', left: '80%', top: -4, bottom: -4, width: 2, background: '#fff' }} />
      </div>
      <span className="small">{Math.round(m.greenPct)}% green · {m.yellow} yellow · {m.red} red
        {m.cml < 4 && ' — reach 80% green with no red for CML 4 Point Design'}</span>
      {line && <Speech speaker={line.speaker} expr={line.expr} text={line.text} size={48} />}
    </div>
  );
}

export function ReviewPanel() {
  const room = useGame((g) => g.room)!;
  const s = useGame((g) => g.state)!;
  const checks = useGame((g) => g.checks);
  const set = useGame((g) => g.set);
  const mine = useMyRoles();
  const isHost = useIsHost();
  const [confirm, setConfirm] = useState(false);
  const solo = room.mode === 'local';
  const fails = checks.filter((c) => c.severity === 'fail').length;
  const warns = checks.filter((c) => c.severity === 'warn').length;
  const allSigned = ROLES.every((r) => s.signoffs[r]);
  const m = conceptMaturity(checks);
  const dialog = getCatalog().dialog;
  const showMe = (role: Role, id: string) => {
    set({ activeRole: role, reviewOpen: false, flash: id });
    setTimeout(() => set({ flash: null }), 1500);
  };
  const launch = async () => {
    play('sfx_launch');
    setConfirm(false);
    await room.setMeta({ phase: 'launch' });
  };
  return (
    <aside className="drawer" style={{ width: 'min(640px, 100vw)' }} role="dialog" aria-label="Readiness review">
      <div className="row between">
        <h2>Readiness review</h2>
        <button className="btn small" onClick={() => set({ reviewOpen: false })}>Close ✕</button>
      </div>
      <p className="big"><span className="fail">{fails} NO-GO</span> · <span className="warn">{warns} warnings</span> · <span className="pass">{checks.length - fails - warns} GO</span></p>
      <MaturityMeter />
      {ROLES.map((r) => {
        const holder = s.roles[r] ? s.players[s.roles[r]!] : null;
        const list = checks.filter((c) => c.role === r);
        return (
          <section key={r} className="col" style={{ marginTop: 12 }}>
            <div className="row between" style={{ borderBottom: `3px solid ${ROLE_COLOR[r]}` }}>
              <span className="row">{holder && <Portrait id={holder.characterId} size={32} />}<span className="title" style={{ margin: 0 }}>{ROLE_TITLES[r]}</span></span>
              {!solo && (
                <label className="row small">
                  <input type="checkbox" checked={s.signoffs[r]} disabled={!mine.includes(r)}
                    onChange={() => { play('sfx_signoff'); room.setSignoff(r, !s.signoffs[r]); }} />
                  {s.signoffs[r] ? 'Signed off' : mine.includes(r) ? 'Sign off' : 'waiting'}
                </label>
              )}
            </div>
            {list.map((c) => (
              <div key={c.id} className="row" style={{ alignItems: 'flex-start' }}>
                <Status s={c.severity} />
                <div className="grow">
                  <div>{c.title} — <span className="muted">{c.message}</span></div>
                  {c.severity !== 'pass' && <div className="small dim">Fix: {c.fixHint} <Help id={c.conceptId} /></div>}
                </div>
                {c.severity !== 'pass' && <button className="btn small" onClick={() => showMe(r, c.id)}>Show me</button>}
              </div>
            ))}
          </section>
        );
      })}
      <div className="col panel dark" style={{ marginTop: 12 }}>
        {solo && (
          <div className="row wrap">
            <button className="btn" disabled={s.reviewDone} onClick={() => { play('sfx_signoff'); room.setReviewDone(true); }}>
              {s.reviewDone ? "✓ Plan reviewed" : "I've reviewed the plan"}</button>
            <button className="btn" disabled={allSigned} onClick={async () => { play('sfx_signoff'); for (const r of ROLES) await room.setSignoff(r, true); }}>
              {allSigned ? '✓ All signed off' : 'Sign off all'}</button>
          </div>
        )}
        {(solo || isHost)
          ? <button className="btn big gold" data-tutorial="launch-button" disabled={!allSigned}
              onClick={() => (fails > 0 ? setConfirm(true) : launch())}>LAUNCH 🚀</button>
          : <span className="muted">The host presses LAUNCH once all four roles have signed off.</span>}
        {!allSigned && <span className="small dim">Every role must sign off first. Any design change clears all sign-offs.</span>}
        {fails === 0 && allSigned && dialog.launch_go?.[0] && <Speech speaker="hassan" expr="happy" text={dialog.launch_go[0].text} size={48} />}
      </div>
      {confirm && (
        <Modal label="NO-GO items present" onClose={() => setConfirm(false)}>
          <Speech speaker="hassan" expr="worried" text={dialog.launch_nogo?.[0]?.text ?? 'NO-GO items present — launching will likely fail. Launch anyway?'} />
          <p className="warn">Concept maturity reached: CML {m.cml} {m.name}. {fails} NO-GO item{fails === 1 ? '' : 's'}.</p>
          <div className="row"><button className="btn danger" onClick={launch}>Launch anyway</button><button className="btn primary" onClick={() => setConfirm(false)}>Go back and fix</button></div>
        </Modal>
      )}
    </aside>
  );
}
