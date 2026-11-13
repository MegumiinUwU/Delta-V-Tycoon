import { useCallback, useEffect, useRef, useState } from 'react';
import { CartesianGrid, Area, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { eventArt, orbitIcon } from '../../assets';
import { play, playMusic } from '../../audio/sound';
import { voiceSeconds } from '../../audio/voice';
import { effectiveDefaultOptionId, findMissionTwin, fmtGbit, fmtNum, getCatalog, ROLE_TITLES, type Sample } from '../../core';
import { getDifficulty, getOrbit, getScenario, getVehicle } from '../../core/catalog';
import { LaunchScene } from '../../scenes/LaunchScene';
import { OrbitView } from '../../scenes/OrbitView';
import { decisionKey, simBehind } from '../../net/roomApi';
import { useGame, useIsHost, useMyRoles } from '../../state/store';
import { Icon, Modal, Portrait, ROLE_COLOR, Speech } from '../components/common';

const FAR = new Set(['geo', 'lunar', 'l2', 'mars']);

export function TwinCard() {
  const s = useGame((g) => g.state)!;
  const twin = findMissionTwin(s.design, s.meta.scenarioId);
  const intro = getCatalog().dialog.twin_intro?.[0];
  if (!twin) return null;
  return (
    <div className="panel col" style={{ borderColor: 'var(--gold)' }}>
      {intro && <Speech speaker={intro.speaker} expr={intro.expr} text={intro.text} size={48} typewriter={false} voiceOnce={`twin:${s.meta.seed}:${s.meta.attempt ?? 0}`} />}
      <div className="row">
        <img src={orbitIcon(twin.orbit)} width={48} height={48} alt={`${twin.orbit} orbit`} />
        <div className="col" style={{ gap: 2 }}>
          <span className="title gold" style={{ margin: 0 }}>Mission Twin: {twin.name}</span>
          <span className="small muted">{twin.agency} · launched {twin.launchYear} · {getOrbit(twin.orbit).name}</span>
          <span>{twin.fact}</span>
        </div>
      </div>
      <span className="small"><span className="gold">Who used your data: </span>{getScenario(s.meta.scenarioId).userSegment}</span>
    </div>
  );
}

export function LaunchScreen() {
  const room = useGame((g) => g.room)!;
  const s = useGame((g) => g.state)!;
  const sim = useGame((g) => g.sim);
  const b = useGame((g) => g.budgets)!;
  const isHost = useIsHost();
  const lead = room.mode === 'local' || isHost;
  const [stage, setStage] = useState<'launch' | 'result'>('launch');
  if (!sim) return null;
  const res = sim.done ? sim.result() : null;
  const failed = res?.outcome === 'launch_failure';
  const orbitFail = res?.outcome === 'orbit_failure';
  const orbit = getOrbit(s.design.planner.orbitId);
  const far = FAR.has(orbit.id);
  const next = () => room.setMeta({ phase: res ? 'report' : 'ops' });
  return (
    <div className="page col" style={{ alignItems: 'center', gap: 12 }}>
      <LaunchScene vehicleId={s.design.planner.launchVehicleId} failed={failed} onEnd={() => setStage('result')} />
      {stage === 'result' && (
        <div className="panel col" style={{ width: '100%', maxWidth: 960 }}>
          {failed && <><h2 className="fail">LAUNCH FAILURE</h2><p>Reason: {res!.outcomeReason}.</p></>}
          {orbitFail && <><h2 className="fail">ORBIT INSERTION FAILED</h2><p>The {getVehicle(s.design.planner.launchVehicleId).name} worked, but the spacecraft {res!.outcomeReason}.</p></>}
          {!res && (
            <>
              <h2 className="pass">{far ? `ON THE WAY TO ${orbit.name.toUpperCase()}${b.time.transferMonths >= 1 ? ` — ${fmtNum(b.time.transferMonths)} months cruise` : ''}` : 'ORBIT REACHED'}</h2>
              <div className="row wrap center" style={{ alignItems: 'flex-start' }}>
                {far && <OrbitView orbitId={orbit.id} transferMonths={b.time.transferMonths || orbit.cruiseMonths} scale={2} />}
                <div style={{ flex: 1, minWidth: 320 }}><TwinCard /></div>
              </div>
            </>
          )}
          {lead ? <AutoNext onNext={next} label={res ? 'See report ▶' : 'Begin operations ▶'} auto={!res} />
            : <span className="muted">Waiting for the host…</span>}
        </div>
      )}
    </div>
  );
}

function AutoNext({ onNext, label, auto }: { onNext: () => void; label: string; auto: boolean }) {
  const reduced = useGame((g) => g.settings.reducedMotion);
  useEffect(() => { if (!auto) return; const t = setTimeout(onNext, reduced ? 1500 : 5000); return () => clearTimeout(t); }, [auto, onNext, reduced]);
  return <div className="row center"><button className="btn big gold" onClick={onNext}>{label}</button></div>;
}

// ---------------- Operations ----------------

export function OpsScreen() {
  const room = useGame((g) => g.room)!;
  const s = useGame((g) => g.state)!;
  const sim = useGame((g) => g.sim);
  const b = useGame((g) => g.budgets)!;
  const speed = useGame((g) => g.simSpeed);
  const paused = useGame((g) => g.paused);
  const set = useGame((g) => g.set);
  const bump = useGame((g) => g.bumpSim);
  useGame((g) => g.simTick);
  const isHost = useIsHost();
  const lead = room.mode === 'local' || isHost;
  const [result, setResult] = useState<{ text: string; bad: boolean; role: string } | null>(null);
  const seenLog = useRef(0);
  const lastPush = useRef(0);
  const team = room.mode === 'online';

  useEffect(() => { playMusic('music_ops'); return () => playMusic(null); }, []);

  /** Runs this screen's simulation forward to the next event that needs a decision (or to the end of the mission). */
  const skipToEvent = useCallback(() => {
    if (!sim || sim.done || sim.pendingEvent) return;
    sim.step(1e9);
    if (sim.pendingEvent) play('sfx_event');
    bump();
  }, [sim, bump]);

  // Main stepping loop: a full mission ≈ 60 s at 1×.
  useEffect(() => {
    if (!sim) return;
    let raf = 0, last = 0, carry = 0;
    const loop = (now: number) => {
      // Mission days per second, not per drawn frame: every screen flies at the same pace whatever its refresh rate.
      // A gap longer than a quarter second (hidden tab, stalled machine) is not flown: the mission waits for you.
      const dt = last ? Math.min(250, now - last) : 1000 / 60;
      last = now;
      // Team: the room already holds a decision for an event this screen has not reached (slower or background
      // tab). Skip straight to that event; the decision is then applied like any other.
      const latest = useGame.getState().state;
      if (team && latest && !sim.pendingEvent && simBehind(sim, latest)) { skipToEvent(); }
      else if (!sim.done && !sim.pendingEvent && !paused && !result) {
        carry += (Math.max(1, Math.round((speed * sim.live.plannedDays) / 3600)) * 60 * dt) / 1000;
        const days = Math.floor(carry);
        carry -= days;
        if (days > 0) sim.step(days);
        if (sim.pendingEvent) { play('sfx_event'); bump(); }
      }
      // auto-handled events become toasts
      const log = sim.result().events;
      for (; seenLog.current < log.length; seenLog.current++) {
        const e = log[seenLog.current];
        if (e.optionId === null && e.text) useGame.getState().toast(`${e.title}: ${e.text}`, 'good');
      }
      if (now - lastPush.current > 100) { lastPush.current = now; bump(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, speed, paused, result, bump, team, skipToEvent]);

  // Team: the host pressed "Next event" — every screen skips ahead with it, so nobody is left behind.
  const jumpSeen = useRef(s.meta.opsJump ?? 0);
  useEffect(() => {
    const n = s.meta.opsJump ?? 0;
    if (n <= jumpSeen.current) return;
    jumpSeen.current = n;
    skipToEvent();
  }, [s.meta.opsJump, skipToEvent]);
  const nextEvent = () => {
    if (team) { jumpSeen.current = (s.meta.opsJump ?? 0) + 1; room.setMeta({ opsJump: jumpSeen.current }); }
    skipToEvent();
  };

  // Apply decisions as soon as they exist in the room (solo too, through LocalRoom).
  const pending = sim?.pendingEvent ?? null;
  const decision = pending ? s.decisions[decisionKey(s, pending.index)] : undefined;
  useEffect(() => {
    if (!sim || !pending || !decision) return;
    sim.decide(decision.optionId);
    const log = sim.result().events;
    const entry = log[log.length - 1];
    seenLog.current = log.length;
    if (entry) { setResult({ text: entry.text, bad: entry.bad, role: entry.byRole }); play(entry.bad ? 'sfx_fail' : 'sfx_success'); }
    bump();
  }, [sim, pending, decision, bump]);

  // End of mission → score, then report.
  useEffect(() => {
    if (!sim?.done || result) return;
    useGame.getState().finishMission();
    if (lead) { const t = setTimeout(() => room.setMeta({ phase: 'report' }), 1200); return () => clearTimeout(t); }
  }, [sim?.done, result, lead, room]);

  if (!sim) return null;
  const cur = sim.current();
  const live = sim.live;
  const samples: Sample[] = [...sim.result().samples, cur].filter((x, i, a) => i === 0 || x.day > a[i - 1].day);
  const sc = getScenario(s.meta.scenarioId);
  const setSpeed = (v: 1 | 2 | 4 | 8) => { set({ simSpeed: v }); if (room.mode === 'online') room.setMeta({ opsSpeed: v }); };
  const togglePause = () => { set({ paused: !paused }); if (room.mode === 'online') room.setMeta({ opsPaused: !paused }); };
  const chartH = 120;
  const lostCum = samples.map((x) => ({ ...x, lost: Math.max(0, x.dataGeneratedCum - x.dataReturnedCum - x.stored) }));
  return (
    <div className="workshop" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
      <section className="col">
        <OrbitView orbitId={s.design.planner.orbitId} scale={3} contact={cur.duty >= 0} />
        <div className="panel dark col" aria-label="Mission timeline">
          <div className="row between"><span>Day {sim.day} of {live.endDay}</span><span className="small muted">{fmtNum(sim.day / 365)} years</span></div>
          <div style={{ position: 'relative', height: 20, background: '#181425', border: '1px solid var(--border)' }}>
            <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${(sim.day / Math.max(1, live.endDay)) * 100}%`, background: 'var(--blue)' }} />
            {live.schedule.filter((x) => x.day <= live.endDay).map((x) => {
              const done = sim.result().events.find((e) => e.index === x.index);
              return <span key={x.index} title={done ? done.title : 'Unknown event'} style={{ position: 'absolute', left: `${(x.day / Math.max(1, live.endDay)) * 100}%`, top: 0,
                transform: 'translateX(-50%)', color: done ? (done.bad ? 'var(--fail)' : 'var(--gold)') : '#fff' }}>{done ? '◆' : '?'}</span>;
            })}
          </div>
          <div className="row">
            {lead ? (
              <>
                {([1, 2, 4, 8] as const).map((v) => <button key={v} className={`btn small ${speed === v ? 'primary' : ''}`} onClick={() => setSpeed(v)}>{v}×</button>)}
                <button className="btn small" onClick={togglePause}>{paused ? '▶ Resume' : '❚❚ Pause'}</button>
                <button className="btn small gold" disabled={sim.done || !!sim.pendingEvent || !!result} title="Jump to the next decision"
                  onClick={nextEvent}>Next event ⏩</button>
              </>
            ) : <span className="small muted">Speed {speed}× · the host controls speed{paused ? ' · paused' : ''}</span>}
          </div>
        </div>
        <div className="row wrap">
          <Mini label="Battery" value={`${fmtNum(live.batteryPct)}%`} ok={live.batteryOk} />
          <Mini label="Propellant left" value={live.propellantPct == null ? 'none' : `${fmtNum(live.propellantPct)}%`} ok={live.propellantPct == null || live.propellantPct > 10} />
          <Mini label="Data stored" value={`${fmtGbit(cur.stored)} / ${fmtNum(live.storageGbit)}`} ok={cur.stored < live.storageGbit * 0.9} />
          <Mini label="Instruments" value={`${Math.round(cur.duty * 100)}% duty`} ok={cur.duty > 0.9} />
        </div>
      </section>
      <section className="col" style={{ gap: 4 }}>
        <ChartBox title="Power (W)">
          <LineChart data={samples}><CartesianGrid stroke="#3a4466" /><XAxis dataKey="day" hide /><YAxis width={40} stroke="#c0cbdc" />
            <Line dataKey="generationW" stroke="#feae34" dot={false} isAnimationActive={false} name="generation" />
            <Line dataKey="loadW" stroke="#e43b44" dot={false} isAnimationActive={false} name="load" /></LineChart>
        </ChartBox>
        <ChartBox title="Data (Gbit, cumulative) — red: lost">
          <ComposedChart data={lostCum}><CartesianGrid stroke="#3a4466" /><XAxis dataKey="day" hide /><YAxis width={40} stroke="#c0cbdc" />
            <Area dataKey="lost" fill="#e43b44" stroke="#e43b44" isAnimationActive={false} />
            <Line dataKey="dataGeneratedCum" stroke="#c0cbdc" dot={false} isAnimationActive={false} />
            <Line dataKey="dataReturnedCum" stroke="#2ce8f5" dot={false} isAnimationActive={false} /></ComposedChart>
        </ChartBox>
        <ChartBox title={`Science returned (target ${sc.scienceTarget})`}>
          <LineChart data={samples}><CartesianGrid stroke="#3a4466" /><XAxis dataKey="day" hide /><YAxis width={40} stroke="#c0cbdc" domain={[0, (m: number) => Math.ceil(Math.max(m, sc.scienceTarget * 1.1))]} />
            <ReferenceLine y={sc.scienceTarget} stroke="#feae34" strokeDasharray="4 4" />
            <Line dataKey="scienceCum" stroke="#63c74d" dot={false} isAnimationActive={false} /></LineChart>
        </ChartBox>
        <ChartBox title={`Cost ($M, budget ${fmtNum(b.cost.budgetM)})`}>
          <LineChart data={samples}><CartesianGrid stroke="#3a4466" /><XAxis dataKey="day" hide /><YAxis width={40} stroke="#c0cbdc" domain={[0, (m: number) => Math.ceil(Math.max(m, b.cost.budgetM * 1.05))]} />
            <ReferenceLine y={b.cost.budgetM} stroke="#e43b44" strokeDasharray="4 4" />
            <Line dataKey="costCum" stroke="#0099db" dot={false} isAnimationActive={false} /></LineChart>
        </ChartBox>
        <span className="dim small" style={{ height: chartH ? undefined : 0 }}>Charts show up to 200 samples of the simulated mission.</span>
      </section>
      {pending && !decision && <EventModal />}
      {result && <ResultModal r={result} onDone={() => setResult(null)} />}
    </div>
  );
}

function Mini({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="panel dark small" style={{ minWidth: 140 }}><div className="dim">{label}</div><div>{ok ? <span className="pass">✓</span> : <span className="warn">!</span>} {value}</div></div>;
}

function ChartBox({ title, children }: { title: string; children: JSX.Element }) {
  return (
    <div className="panel dark" style={{ padding: 4 }}>
      <div className="small muted">{title}</div>
      <div style={{ width: '100%', height: 110 }}><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </div>
  );
}

function ResultModal({ r, onDone }: { r: { text: string; bad: boolean; role: string }; onDone: () => void }) {
  const s = useGame((g) => g.state)!;
  const room = useGame((g) => g.room)!;
  const voiced = useGame((g) => g.settings.voices && !g.settings.muted);
  const holder = s.roles[r.role as keyof typeof s.roles];
  const charId = (holder && room.mode === 'online' ? s.players[holder]?.characterId : getCatalog().characters.find((c) => c.role === r.role)?.id) ?? 'hassan';
  const ms = Math.max(3000, voiced ? voiceSeconds(charId, r.text) * 1000 + 700 : 0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => { const t = setTimeout(() => done.current(), ms); return () => clearTimeout(t); }, [ms]);
  return (
    <Modal label="Event result" onClose={onDone}>
      <Speech speaker={charId} expr={r.bad ? 'worried' : 'happy'} text={r.text} />
      <div className="row center" style={{ marginTop: 8 }}><button className="btn primary" onClick={onDone}>Continue ▶</button></div>
    </Modal>
  );
}

const OTHERS_GRACE_SEC = 15;

function EventModal() {
  const room = useGame((g) => g.room)!;
  const s = useGame((g) => g.state)!;
  const sim = useGame((g) => g.sim)!;
  const mine = useMyRoles();
  const p = sim.pendingEvent!;
  const ev = p.event;
  const team = room.mode === 'online';
  const owner = mine.includes(ev.ownerRole);
  const timerSec = getDifficulty(s.meta.difficulty).decisionTimerSec;
  const [left, setLeft] = useState(timerSec);
  const holderUid = s.roles[ev.ownerRole];
  const holder = holderUid ? s.players[holderUid] : null;
  // The role holder's own screen sends the default answer when the timer runs out. Screens can reach an event a few
  // seconds apart, so the others wait a little longer before stepping in — unless the holder is away.
  const grace = owner || !holder?.connected ? 0 : OTHERS_GRACE_SEC;
  useEffect(() => {
    if (!team) return;
    let x = timerSec;
    setLeft(x);
    const t = setInterval(() => {
      x -= 1;
      setLeft(Math.max(0, x));
      if (x <= -grace) { clearInterval(t); room.submitDecision(decisionKey(s, p.index), effectiveDefaultOptionId(p)).catch(() => {}); }
    }, 1000);
    return () => clearInterval(t);
  }, [team, timerSec, p, room, grace]); // eslint-disable-line react-hooks/exhaustive-deps
  const charId = holder && team ? holder.characterId : getCatalog().characters.find((c) => c.role === ev.ownerRole)?.id ?? 'hassan';
  const key = decisionKey(s, p.index);
  const sugg = s.suggestions[key] ?? {};
  return (
    <Modal label={ev.title}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <img src={eventArt(ev.id)} width={288} height={192} alt="" style={{ maxWidth: '45%', height: 'auto' }} />
        <div className="col grow">
          <h2 className="warn">{ev.title}</h2>
          <p>{ev.description}</p>
          <div className="row"><Portrait id={charId} expr="worried" size={48} />
            <span className="small">Decision by: <span style={{ color: ROLE_COLOR[ev.ownerRole] }}>{ROLE_TITLES[ev.ownerRole]}</span>{team && holder ? ` (${holder.name})` : ''}</span>
            {team && <span className="badge warn" aria-live="polite">{left}s</span>}
          </div>
        </div>
      </div>
      <div className="col" style={{ marginTop: 8 }}>
        {p.options.map((o) => (
          <button key={o.id} className="btn" style={{ justifyContent: 'space-between', textAlign: 'left' }} disabled={o.disabled}
            onClick={() => { play('sfx_click'); if (owner) room.submitDecision(key, o.id); else room.suggest(key, o.id); }}>
            <span className="col" style={{ gap: 0, alignItems: 'flex-start' }}>
              <span>{o.label}</span>
              <span className="small muted">{o.disabled ? `🔒 ${o.disabledReason}` : o.description}</span>
            </span>
            <span className="row">
              {Object.entries(sugg).filter(([, opt]) => opt === o.id).map(([uid]) => s.players[uid] &&
                <Portrait key={uid} id={s.players[uid].characterId} size={24} title={`${s.players[uid].name} suggests this`} />)}
            </span>
          </button>
        ))}
        {!owner && <p className="small muted">You don't hold this role — tap an option to suggest it.</p>}
        <span className="row small dim"><Icon id="st_info" size={16} /> Default if nobody decides: {p.options.find((o) => o.id === effectiveDefaultOptionId(p))?.label}</span>
      </div>
    </Modal>
  );
}
