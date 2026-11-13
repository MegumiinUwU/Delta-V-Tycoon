import { useEffect, useState } from 'react';
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
      <span className="small dim">{Math.round(m.greenPct)}% green{m.cml < 4 ? ' · 80% + no red = CML 4' : ''}</span>
      {line && <Speech speaker={line.speaker} expr={line.expr} text={line.text} size={48} />}
    </div>
  );
}

/** Flight-director style poll: each role answers GO / HOLD / NO-GO in turn (stamps pop in one by one). */
export function GoPoll() {
  const checks = useGame((g) => g.checks);
  const s = useGame((g) => g.state)!;
  const room = useGame((g) => g.room)!;
  const reduced = useGame((g) => g.settings.reducedMotion);
  const chars = getCatalog().characters;
  const [shown, setShown] = useState(reduced ? 4 : 0);
  const sig = checks.map((c) => c.severity[0]).join('');
  useEffect(() => {
    if (reduced) { setShown(4); return; }
    setShown(0);
    const ts = [0, 1, 2, 3].map((i) => window.setTimeout(() => { setShown(i + 1); play(i === 3 ? 'sfx_signoff' : 'sfx_click'); }, 350 + i * 380));
    return () => ts.forEach(clearTimeout);
  }, [sig, reduced]);
  const roleChar = (r: Role) => { const u = s.roles[r]; const p = u ? s.players[u] : null;
    return p && room.mode === 'online' ? p.characterId : chars.find((c) => c.role === r)?.id ?? 'hassan'; };
  return (
    <div className="poll" role="list" aria-label="GO / NO-GO poll">
      {ROLES.map((r, i) => {
        const mine = checks.filter((c) => c.role === r);
        const sev = mine.some((c) => c.severity === 'fail') ? 'fail' : mine.some((c) => c.severity === 'warn') ? 'warn' : 'pass';
        const ch = chars.find((c) => c.id === roleChar(r));
        return (
          <div key={r} className="who" role="listitem" style={{ borderColor: ROLE_COLOR[r] }} title={sev === 'pass' ? ch?.lines.success : ch?.lines.warning}>
            <Portrait id={roleChar(r)} expr={i < shown ? (sev === 'pass' ? 'happy' : 'worried') : 'neutral'} size={48} />
            <span className="small" style={{ color: ROLE_COLOR[r] }}>{ROLE_TITLES[r].split(' ')[0]}</span>
            <span className={`stamp ${sev} ${i < shown ? 'show' : ''}`}>{sev === 'pass' ? 'GO' : sev === 'warn' ? 'HOLD' : 'NO-GO'}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 3-2-1 overlay; calls onDone after the count (instantly with reduced motion). */
export function Countdown({ onDone }: { onDone: () => void }) {
  const reduced = useGame((g) => g.settings.reducedMotion);
  const [n, setN] = useState(3);
  useEffect(() => {
    if (reduced) { onDone(); return; }
    play('sfx_warning');
    const t = window.setInterval(() => setN((k) => {
      if (k <= 1) { window.clearInterval(t); window.setTimeout(onDone, 250); return 0; }
      play(k === 2 ? 'sfx_click' : 'sfx_warning');
      return k - 1;
    }), 800);
    return () => window.clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="countdown" role="alert" aria-live="assertive"><span key={n}>{n > 0 ? n : 'GO!'}</span></div>;
}

export function ReviewPanel() {
  const room = useGame((g) => g.room)!;
  const s = useGame((g) => g.state)!;
  const checks = useGame((g) => g.checks);
  const set = useGame((g) => g.set);
  const mine = useMyRoles();
  const isHost = useIsHost();
  const [confirm, setConfirm] = useState(false);
  const [counting, setCounting] = useState(false);
  const solo = room.mode === 'local';
  const fails = checks.filter((c) => c.severity === 'fail').length;
  const warns = checks.filter((c) => c.severity === 'warn').length;
  const allSigned = ROLES.every((r) => s.signoffs[r]);
  const m = conceptMaturity(checks);
  const dialog = getCatalog().dialog;
  const problems = checks.filter((c) => c.severity !== 'pass').sort((a, b) => (a.severity === 'fail' ? -1 : 1) - (b.severity === 'fail' ? -1 : 1));
  const showMe = (role: Role, id: string) => {
    set({ activeRole: role, reviewOpen: false, flash: id });
    setTimeout(() => set({ flash: null }), 1500);
  };
  const launch = async () => {
    setConfirm(false);
    if (solo) {   // solo: pressing LAUNCH from the review is the review confirmation + all four sign-offs
      await room.setReviewDone(true);
      for (const r of ROLES) if (!s.signoffs[r]) await room.setSignoff(r, true);
    }
    setCounting(true);
  };
  const go = async () => { play('sfx_launch'); await room.setMeta({ phase: 'launch' }); };
  const ready = solo || allSigned;
  return (
    <aside className="drawer" style={{ width: 'min(600px, 100vw)' }} role="dialog" aria-label="Readiness review">
      <div className="row between">
        <h2 style={{ margin: 0 }}>GO / NO-GO</h2>
        <button className="btn small" onClick={() => set({ reviewOpen: false })}>✕</button>
      </div>
      <GoPoll />
      <MaturityMeter />
      <p className="big" style={{ margin: '4px 0' }}><span className="fail">{fails} ✕</span> · <span className="warn">{warns} !</span> · <span className="pass">{checks.length - fails - warns} ✓</span></p>
      {problems.length === 0 && <p className="pass">Every check is GO.</p>}
      {problems.map((c) => (
        <div key={c.id} className="row panel dark" style={{ alignItems: 'center', gap: 8, padding: 6, borderLeft: `4px solid ${ROLE_COLOR[c.role]}` }}>
          <Status s={c.severity} />
          <div className="grow" title={`${c.message}\nFix: ${c.fixHint}`}>
            <div>{c.title}</div>
            <div className="small dim">{c.fixHint}</div>
          </div>
          <Help id={c.conceptId} />
          <button className="btn small primary" onClick={() => showMe(c.role, c.id)}>Fix ▸</button>
        </div>
      ))}
      <details className="more">
        <summary>All {checks.length} checks</summary>
        {checks.map((c) => <div key={c.id} className="row small"><Status s={c.severity} /><span>{c.title} — <span className="muted">{c.message}</span></span></div>)}
      </details>
      <div className="col panel dark" style={{ marginTop: 8 }}>
        {!solo && (
          <div className="row wrap">
            {ROLES.map((r) => (
              <label key={r} className="row small" style={{ color: ROLE_COLOR[r] }}>
                <input type="checkbox" checked={s.signoffs[r]} disabled={!mine.includes(r)}
                  onChange={() => { play('sfx_signoff'); room.setSignoff(r, !s.signoffs[r]); }} />
                {ROLE_TITLES[r].split(' ')[0]} {s.signoffs[r] ? '✓' : ''}
              </label>
            ))}
          </div>
        )}
        {(solo || isHost)
          ? <button className="btn big gold" data-tutorial="launch-button" disabled={!ready}
              onClick={() => (fails > 0 ? setConfirm(true) : launch())}>LAUNCH 🚀</button>
          : <span className="muted">The host launches once all four roles sign off.</span>}
        {!ready && <span className="small dim">Waiting for every role to sign off.</span>}
        {fails === 0 && ready && dialog.launch_go?.[0] && <Speech speaker="hassan" expr="happy" text={dialog.launch_go[0].text} size={48} />}
      </div>
      {confirm && (
        <Modal label="NO-GO items present" onClose={() => setConfirm(false)}>
          <Speech speaker="hassan" expr="worried" text={dialog.launch_nogo?.[0]?.text ?? 'NO-GO items present — launching will likely fail. Launch anyway?'} />
          <p className="warn">CML {m.cml} {m.name} · {fails} NO-GO</p>
          <div className="row"><button className="btn danger" onClick={launch}>Launch anyway</button><button className="btn primary" onClick={() => setConfirm(false)}>Go back and fix</button></div>
        </Modal>
      )}
      {counting && <Countdown onDone={go} />}
    </aside>
  );
}
