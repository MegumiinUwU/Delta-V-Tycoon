import { useEffect, useMemo, useState } from 'react';
import { icon } from '../../assets';
import { play } from '../../audio/sound';
import { hush, sayNow } from '../../audio/voice';
import {
  conceptMaturity, encodeDesign, findMissionTwin, fmtKg, fmtM, fmtNum, fmtW, getCatalog, ROLE_TITLES, ROLES, suggestFixes, type Role,
} from '../../core';
import { getBus, getInstrument, getOrbit, getRadio, getScenario, getVehicle } from '../../core/catalog';
import { addLocal, postOnline } from '../../net/leaderboard';
import { currentDecisions } from '../../net/roomApi';
import { navigate } from '../../router';
import { KEYS, load, save, type SavedDesign } from '../../state/storage';
import { useDiscoveries } from '../../state/discoveries';
import { useGame, useIsHost } from '../../state/store';
import { Help, Portrait, ROLE_COLOR, VoiceLine } from '../components/common';
import { TwinCard } from './LaunchOps';
import { CareerBanner } from './CareerBanner';
import { Attempts } from './Attempts';

type Tab = 'fix' | 'why' | 'twin' | 'attempts' | 'full' | 'share';
const OUTCOME_LABEL = { success: 'Mission success', partial: 'Partial success', failure: 'Mission lost' } as const;

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
  const [tab, setTab] = useState<Tab | null>(null);
  const [printAll, setPrintAll] = useState(false);
  useEffect(() => () => hush('crew'), []);
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
  const twin = findMissionTwin(s.design, s.meta.scenarioId);
  const hassanLine = dialog[`report_${score.outcomeClass}`]?.[0]?.text;
  const challenge = `DVT-${s.meta.scenarioId}-${s.meta.difficulty}-${(s.meta.seed >>> 0).toString(36)}`;
  const tabs: { id: Tab; label: string; count?: number; hot?: boolean }[] = [
    ...(fixes.length > 0 ? [{ id: 'fix' as Tab, label: 'What to fix', count: fixes.length, hot: true }] : []),
    { id: 'why', label: 'Why', count: bad.length || undefined },
    ...(twin ? [{ id: 'twin' as Tab, label: 'Mission twin' }] : []),
    { id: 'attempts', label: 'Attempts' },
    { id: 'full', label: 'Full report' },
    { id: 'share', label: 'Share & save' },
  ];
  const show = (t: Tab) => printAll || tab === t;
  const printReport = () => { setPrintAll(true); setTimeout(() => { window.print(); setPrintAll(false); }, 80); };
  return (
    <div className="page col report" style={{ gap: 12 }}>
      <div className="print-only"><h1>Delta-V Tycoon — Mission Report</h1><p>{s.meta.teamName} · {new Date().toLocaleDateString()} · {sc.name} · score {score.total}</p></div>

      <section className={`rp-hero ${score.outcomeClass}`} aria-label="Mission result">
        <div className="rp-kicker">{OUTCOME_LABEL[score.outcomeClass]}</div>
        <div className="rp-stars" role="img" aria-label={`${score.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <img key={i} className={`rp-star${i < score.stars ? ' on' : ''}`} style={{ animationDelay: `${0.35 + i * 0.3}s` }}
              src={icon(i < score.stars ? 'ui_star_full' : 'ui_star_empty')} width={80} height={80} alt="" />
          ))}
        </div>
        <div className="rp-score"><CountUp to={score.total} /><span>/ 1000</span></div>
        <div className="rp-rank">{score.rankTitle}</div>
        <p className="rp-reason">{res.outcomeReason}</p>
        {hassanLine && (
          <p className="rp-quote"><Portrait id="hassan" expr={score.outcomeClass === 'failure' ? 'worried' : 'happy'} size={32} />
            <span>"{hassanLine}"<VoiceLine speaker="hassan" text={hassanLine} /></span></p>
        )}
        <div className="rp-crew" aria-label="Crew goals">
          {ROLES.map((r) => {
            const met = score.roleGoals[r].met;
            const ch = chars.find((c) => c.id === roleChar(r));
            const line = met ? ch?.lines.success : ch?.lines.failure;
            return (
              <button key={r} className={`rp-member ${met ? 'met' : 'missed'}`} style={{ borderColor: ROLE_COLOR[r] }}
                title={`${ROLE_TITLES[r]}: ${score.roleGoals[r].text}${line ? `\n"${line}"` : ''}`}
                aria-label={`${ROLE_TITLES[r]}: goal ${met ? 'met' : 'missed'}. Hear their line.`}
                onClick={() => { if (ch && line) sayNow('crew', ch.id, line); }}>
                <Portrait id={roleChar(r)} expr={met ? 'happy' : 'worried'} size={56} />
                <span className="rp-mark">{met ? '✓' : '✗'}</span>
              </button>
            );
          })}
        </div>
        {twin && (
          <button className="rp-twin no-print" onClick={() => setTab(tab === 'twin' ? null : 'twin')}>
            Your design is a close cousin of <span className="gold">{twin.name}</span> ▸
          </button>
        )}
      </section>

      <CareerBanner />

      <section className="rp-actions no-print">
        {lead && <button className="btn primary big" onClick={() => retry()}>↻ Retry</button>}
        <button className="btn big" onClick={async () => { await useGame.getState().leaveRoom(); navigate(room.mode === 'online' ? '/' : '/solo'); }}>New mission</button>
        <button className="btn gold big" disabled={copied === 'board'} onClick={() => { addLocal(entry); postOnline(entry).catch(() => {}); setCopied('board'); }}>
          {copied === 'board' ? '✓ On the board' : '★ Add to leaderboard'}</button>
      </section>

      <nav className="rp-tabs no-print" role="tablist" aria-label="Report details">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`rp-tab${t.hot && tab !== t.id ? ' hot' : ''}`}
            onClick={() => { play('sfx_click'); setTab(tab === t.id ? null : t.id); }}>
            {t.label}{t.count != null && <span className="rp-count">{t.count}</span>}
          </button>
        ))}
      </nav>

      {show('fix') && fixes.length > 0 && (
        <section className="panel col rp-panel" role="tabpanel" aria-label="What to fix">
          <h2>Try next <span className="small dim">— one click applies the fix and flies again</span></h2>
          {fixes.map((f, i) => (
            <div key={i} className="rp-fix">
              <span className="rp-num">{i + 1}</span>
              <span className="grow">{f.text}</span>
              {lead && <button className="btn primary no-print" onClick={() => retry(f.design)}>Apply & retry</button>}
            </div>
          ))}
        </section>
      )}

      {show('why') && (
        <section className="panel col rp-panel" role="tabpanel" aria-label="Why">
          <h2>Why</h2>
          <DiscoveryLine />
          <div className="row wrap" style={{ alignItems: 'flex-start' }}>
            {([['What went well', good], ['What hurt', bad]] as const).map(([title, list]) => (
              <div key={title} className="col grow" style={{ minWidth: 260 }}>
                <h3 className={title === 'What went well' ? 'pass' : 'fail'}>{title}</h3>
                {list.length === 0 && <span className="dim">—</span>}
                {list.map((i, k) => <div key={k}><span className="rolechip" style={{ background: ROLE_COLOR[i.role] }} />{i.text} <Help id={i.conceptId} /></div>)}
              </div>
            ))}
          </div>
          <h3>Role goals</h3>
          {ROLES.map((r) => <div key={r} className="row"><span className={score.roleGoals[r].met ? 'pass' : 'fail'}>{score.roleGoals[r].met ? '✓' : '✗'}</span>{score.roleGoals[r].text}</div>)}
        </section>
      )}

      {show('twin') && twin && <div className="rp-panel" role="tabpanel" aria-label="Mission twin"><TwinCard /></div>}

      {show('attempts') && (
        <div className="rp-panel col" role="tabpanel" aria-label="Attempts">
          <Attempts />
          <div className="row no-print"><a className="btn" href="#/leaderboard">Open the leaderboard ▸</a></div>
        </div>
      )}

      {show('full') && (
        <div className="col rp-panel" role="tabpanel" aria-label="Full report" style={{ gap: 12 }}>
          <section className="panel col">
            <h2>Score breakdown</h2>
            {parts.map(([label, v, max]) => (
              <div key={label} className="scorebar"><span>{label}</span><div className="bar"><div style={{ width: `${(v / max) * 100}%` }} /></div><span>{Math.round(v)} / {max}</span></div>
            ))}
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
      )}

      {show('share') && (
        <section className="panel col rp-panel no-print" role="tabpanel" aria-label="Share and save">
          <div className="row wrap">
            <button className="btn" onClick={() => copy(link, 'link')}>{copied === 'link' ? '✓ Link copied' : 'Copy share link'}</button>
            <button className="btn" onClick={() => { const list = load<SavedDesign[]>(KEYS.saved, []);
              save(KEYS.saved, [...list, { name: `${sc.name} — ${s.meta.teamName}`, code, at: Date.now(), score: score.total }]); setCopied('saved'); }}>
              {copied === 'saved' ? '✓ Saved' : 'Save design'}</button>
            <button className="btn" onClick={printReport}>Print / Save PDF</button>
          </div>
          <span className="small dim">Challenge code: {challenge}
            <button className="btn small ghost" onClick={() => copy(challenge, 'code')}>{copied === 'code' ? '✓' : 'copy'}</button></span>
        </section>
      )}
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
