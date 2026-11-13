import { useEffect, useMemo, useState } from 'react';
import { play } from '../../audio/sound';
import {
  conceptMaturity, encodeDesign, fmtKg, fmtM, fmtNum, fmtW, getCatalog, ROLE_TITLES, ROLES, suggestFixes, type Role,
} from '../../core';
import { getBus, getInstrument, getOrbit, getRadio, getScenario, getVehicle } from '../../core/catalog';
import { addLocal, postOnline } from '../../net/leaderboard';
import { currentDecisions } from '../../net/roomApi';
import { navigate } from '../../router';
import { KEYS, load, save, type SavedDesign } from '../../state/storage';
import { useDiscoveries } from '../../state/discoveries';
import { useGame, useIsHost } from '../../state/store';
import { Help, Portrait, ROLE_COLOR, Speech, Stars, VoiceLine } from '../components/common';
import { TwinCard } from './LaunchOps';
import { CareerBanner } from './CareerBanner';
import { Attempts } from './Attempts';

function CountUp({ to }: { to: number }) {
  const reduced = useGame((g) => g.settings.reducedMotion);
  const [n, setN] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) { setN(to); return; }
    const start = performance.now();
    let raf = 0;
    const f = (now: number) => { const k = Math.min(1, (now - start) / 1200); setN(Math.round(to * k)); if (k < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [to, reduced]);
  return <>{n}</>;
}

export function Report() {
  const room = useGame((g) => g.room)!;
  const s = useGame((g) => g.state)!;
  const sim = useGame((g) => g.sim);
  const score = useGame((g) => g.score);
  const checks = useGame((g) => g.checks);
  const failAtLaunch = useGame((g) => g.failChecksAtLaunch);
  const b = useGame((g) => g.budgets)!;
  const retry = useGame((g) => g.retry);
  const input = useGame((g) => g.simInput)();
  const isHost = useIsHost();
  const lead = room.mode === 'local' || isHost;
  const [copied, setCopied] = useState('');
  const [full, setFull] = useState(false);
  useEffect(() => { if (!score) useGame.getState().finishMission(); }, [score]);
  useEffect(() => { if (score) play(score.outcomeClass === 'failure' ? 'sfx_fail' : 'sfx_success'); }, [score]);
  const fixes = useMemo(() => (sim?.done && input ? suggestFixes(input, sim.result()) : []), [sim, input?.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sim || !score || !input) return <div className="page"><p>Preparing the mission report…</p></div>;
  const res = sim.result();
  const dialog = getCatalog().dialog;
  const sc = getScenario(s.meta.scenarioId);
  const code = encodeDesign({ v: 1, ...input, teamName: s.meta.teamName, decisions: currentDecisions(s) });
  const link = `${location.origin}${location.pathname}#/design/${code}`;
  const chars = getCatalog().characters;
  const roleChar = (r: Role) => { const u = s.roles[r]; const p = u ? s.players[u] : null; return p && room.mode === 'online' ? p.characterId : chars.find((c) => c.role === r)!.id; };
  const good = score.insights.filter((i) => i.kind === 'good'), bad = score.insights.filter((i) => i.kind === 'bad');
  const parts: [string, number, number][] = [['Objectives', score.parts.objectives, 300], ['Science', score.parts.science, 300],
    ['Efficiency', score.parts.efficiency, 200], ['Operations', score.parts.operations, 100], ['Teamwork', score.parts.teamwork, 100]];
  const d = s.design;
  const cml = conceptMaturity(checks);
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { prompt('Copy this:', text); } };
  const entry = { teamName: s.meta.teamName.slice(0, 24), scenarioId: s.meta.scenarioId, difficulty: s.meta.difficulty, seed: s.meta.seed,
    score: score.total, stars: score.stars, outcome: res.outcome, designCode: code, at: Date.now() };
  return (
    <div className="page col" style={{ gap: 12 }}>
      <div className="print-only"><h1>Delta-V Tycoon — Mission Report</h1><p>{s.meta.teamName} · {new Date().toLocaleDateString()} · {sc.name} · score {score.total}</p></div>
      <section className={`outcome-banner ${score.outcomeClass}`}>{score.outcomeClass.toUpperCase()} — {res.outcomeReason}</section>
      <section className="panel row wrap" style={{ alignItems: 'flex-start' }}>
        <div className="col" style={{ alignItems: 'center', minWidth: 200 }}>
          <Stars n={score.stars} />
          <span style={{ fontFamily: 'var(--font-title)', fontSize: 24 }} className="gold"><CountUp to={score.total} /></span>
          <span className="small">/ 1000 · {score.rankTitle}</span>
        </div>
        <div className="grow" style={{ minWidth: 300 }}>
          {dialog[`report_${score.outcomeClass}`]?.[0] && <Speech speaker="hassan" expr={score.outcomeClass === 'failure' ? 'worried' : 'happy'} text={dialog[`report_${score.outcomeClass}`][0].text} />}
        </div>
      </section>
      <CareerBanner />
      <section className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {ROLES.map((r) => {
          const met = score.roleGoals[r].met;
          const ch = chars.find((c) => c.id === roleChar(r));
          return (
            <div key={r} className="panel dark row" style={{ borderColor: ROLE_COLOR[r], alignItems: 'flex-start' }}>
              <Portrait id={roleChar(r)} expr={met ? 'happy' : 'worried'} size={48} />
              <div className="col" style={{ gap: 2 }}>
                <span className="small" style={{ color: ROLE_COLOR[r] }}>{ROLE_TITLES[r]}</span>
                <span className="small">"{met ? ch?.lines.success : ch?.lines.failure}"{ch && <VoiceLine speaker={ch.id} text={met ? ch.lines.success : ch.lines.failure} />}</span>
              </div>
            </div>
          );
        })}
      </section>
      <TwinCard />
      {fixes.length > 0 && (
        <section className="panel col">
          <h2>Try next <span className="small dim">— one click applies the fix and flies again</span></h2>
          {fixes.map((f, i) => (
            <div key={i} className="row between">
              <span>{i + 1}. {f.text}</span>
              {lead && <button className="btn primary no-print" onClick={() => retry(f.design)}>Apply & retry</button>}
            </div>
          ))}
        </section>
      )}
      <Attempts />
      <details className="more" open={full} onToggle={(e) => setFull((e.target as HTMLDetailsElement).open)}>
        <summary>Full report: score breakdown, why, timeline, design</summary>
        <div className="col" style={{ gap: 12 }}>
      <section className="panel col">
        <h2>Score breakdown</h2>
        {parts.map(([label, v, max]) => (
          <div key={label} className="scorebar"><span>{label}</span><div className="bar"><div style={{ width: `${(v / max) * 100}%` }} /></div><span>{Math.round(v)} / {max}</span></div>
        ))}
      </section>
      <section className="panel col">
        <h2>Role goals</h2>
        {ROLES.map((r) => <div key={r} className="row"><span className={score.roleGoals[r].met ? 'pass' : 'fail'}>{score.roleGoals[r].met ? '✓' : '✗'}</span>{score.roleGoals[r].text}</div>)}
      </section>
      <section className="panel">
        <h2>Why</h2>
        <DiscoveryLine />
        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          {([['What went well', good], ['What hurt', bad]] as const).map(([title, list]) => (
            <div key={title} className="col grow" style={{ minWidth: 300 }}>
              <h3 className={title === 'What went well' ? 'pass' : 'fail'}>{title}</h3>
              {list.length === 0 && <span className="dim">—</span>}
              {list.map((i, k) => <div key={k}><span className="rolechip" style={{ background: ROLE_COLOR[i.role] }} />{i.text} <Help id={i.conceptId} /></div>)}
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Mission timeline</h2>
        <table className="grid">
          <thead><tr><th>Day</th><th>Event</th><th>Choice</th><th>Who</th><th>Result</th></tr></thead>
          <tbody>
            {res.events.length === 0 && <tr><td colSpan={5} className="dim">No events.</td></tr>}
            {res.events.map((e) => {
              const ev = getCatalog().events.find((x) => x.id === e.eventId)!;
              const opt = ev.options.find((o) => o.id === e.optionId);
              const byUid = s.decisions[(s.meta.attempt ?? 0) * 100 + e.index]?.byUid;
              return (
                <tr key={e.index}><td>{e.day}</td><td>{e.title}</td><td>{opt?.label ?? 'auto-handled'}</td>
                  <td>{ROLE_TITLES[e.byRole]}{byUid && s.players[byUid] ? ` (${s.players[byUid].name})` : ''}</td>
                  <td className={e.bad ? 'fail' : ''}>{e.bad ? '✗ ' : ''}{e.text}</td></tr>
              );
            })}
            <tr><td>{res.endDay}</td><td colSpan={4}>End: {res.outcome.replace('_', ' ')} — {fmtNum(res.achievedYears)} of {fmtNum(d.planner.lifetimeYears)} years</td></tr>
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Design summary</h2>
        <table className="grid"><tbody>
          <tr><th>Concept maturity at launch</th><td>CML {cml.cml} {cml.name} · {failAtLaunch} NO-GO item{failAtLaunch === 1 ? '' : 's'}</td></tr>
          <tr><th>Orbit · rocket</th><td>{getOrbit(d.planner.orbitId).name}, {d.planner.lifetimeYears} yr · {getVehicle(d.planner.launchVehicleId).name}</td></tr>
          <tr><th>Spacecraft</th><td>{getBus(d.engineer.busId).name}, {fmtKg(b.mass.totalKg)}, {d.engineer.solarArrayId === 'none' ? 'no array' : `${d.engineer.solarArrayW} W array`}, {d.engineer.batteryWh} Wh</td></tr>
          <tr><th>Instruments</th><td>{d.science.instrumentIds.map((i) => getInstrument(i).name).join(', ') || 'none'}</td></tr>
          <tr><th>Power</th><td>{fmtW(b.power.generationW)} for {fmtW(b.power.loadW)} ({fmtNum(b.power.marginPct)}% margin)</td></tr>
          <tr><th>Comms</th><td>{getRadio(d.comms.radioId).name}{d.comms.hga ? ' + high-gain antenna' : ''}, {d.comms.groundNetworkId} network · data returned {fmtNum(res.dataGenerated ? (res.dataReturned / res.dataGenerated) * 100 : 100)}%</td></tr>
          <tr><th>Cost</th><td>{fmtM(res.finalTotalCostM)} of {fmtM(b.cost.budgetM)} (events added {fmtM(res.extraCostM)})</td></tr>
          <tr><th>Science</th><td>{fmtNum(res.scienceReturned)} of {sc.scienceTarget} target</td></tr>
        </tbody></table>
      </section>
        </div>
      </details>
      <section className="row wrap no-print">
        {lead && <button className="btn primary" onClick={() => retry()}>Retry same design</button>}
        <button className="btn" onClick={async () => { await useGame.getState().leaveRoom(); navigate(room.mode === 'online' ? '/' : '/solo'); }}>New mission</button>
        <button className="btn" onClick={() => copy(link, 'link')}>{copied === 'link' ? '✓ Link copied' : 'Copy share link'}</button>
        <button className="btn" onClick={() => { const list = load<SavedDesign[]>(KEYS.saved, []);
          save(KEYS.saved, [...list, { name: `${sc.name} — ${s.meta.teamName}`, code, at: Date.now(), score: score.total }]); setCopied('saved'); }}>
          {copied === 'saved' ? '✓ Saved' : 'Save design'}</button>
        <button className="btn" onClick={() => { setFull(true); setTimeout(() => window.print(), 50); }}>Print / Save PDF</button>
        <button className="btn gold" onClick={() => { addLocal(entry); postOnline(entry).catch(() => {}); setCopied('board'); }}>
          {copied === 'board' ? '✓ Added' : 'Add to leaderboard'}</button>
        <span className="small dim">Challenge code: DVT-{s.meta.scenarioId}-{s.meta.difficulty}-{(s.meta.seed >>> 0).toString(36)}
          <button className="btn small ghost" onClick={() => copy(`DVT-${s.meta.scenarioId}-${s.meta.difficulty}-${(s.meta.seed >>> 0).toString(36)}`, 'code')}>{copied === 'code' ? '✓' : 'copy'}</button></span>
      </section>
    </div>
  );
}

/** Links the report's lessons to the player's growing discovery log (knowledge as progress). */
function DiscoveryLine() {
  const found = useDiscoveries();
  const total = getCatalog().glossary.length;
  return (
    <p className="small muted no-print">
      Every lesson below is logged in your <a href="#/academy">discovery log</a>: <span className="gold">{found.size} / {total}</span> concepts so far.
    </p>
  );
}
