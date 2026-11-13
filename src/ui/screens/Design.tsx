// Design workshop: role tabs · preview + catalog · resource dashboard.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { groundIcon, itemIcon, orbitIcon, vehicleIcon } from '../../assets';
import { play } from '../../audio/sound';
import {
  fmtGbitDay, fmtKg, fmtM, fmtMs, fmtNum, fmtW, getCatalog, isUnlocked, requiredGroupStatus, ROLE_TITLES, ROLES,
  type Design, type Role,
} from '../../core';
import { getDifficulty, getScenario } from '../../core/catalog';
import { OrbitView } from '../../scenes/OrbitView';
import { SpacecraftPreview } from '../../scenes/SpacecraftPreview';
import { useGame, useMyRoles } from '../../state/store';
import { Dashboard } from '../components/Dashboard';
import { Help, Icon, Modal, Portrait, ROLE_COLOR, Speech, Stats, Term } from '../components/common';
import { ReviewPanel } from './Review';
import { TradeSpace } from './TradeSpace';

const ROLE_ICON: Record<Role, string> = { planner: 'role_planner', engineer: 'role_engineer', science: 'role_science', comms: 'role_comms' };

/** Hover handlers that show a preview of the patch on the dashboard. */
function useHover() {
  const preview = useGame((g) => g.previewDelta);
  const setHover = useGame((g) => g.setHover);
  return <R extends Role>(role: R, patch: Partial<Design[R]>) => ({
    onMouseEnter: () => setHover(preview(role, patch)), onMouseLeave: () => setHover(null),
    onFocus: () => setHover(preview(role, patch)), onBlur: () => setHover(null),
  });
}

function useEdit() {
  const room = useGame((g) => g.room);
  const setHover = useGame((g) => g.setHover);
  return <R extends Role>(role: R, patch: Partial<Design[R]>) => { setHover(null); play('sfx_click'); room?.updateDesign(role, patch); };
}

/** Slider showing its local value immediately and writing to the room after 100 ms (perf budget). */
function Slider<R extends Role>({ role, field, label, min, max, step, value, unit, disabled, marker, markerLabel, concept }:
  { role: R; field: keyof Design[R] & string; label: string; min: number; max: number; step: number; value: number; unit: string;
    disabled?: boolean; marker?: number; markerLabel?: string; concept?: string }) {
  const [local, setLocal] = useState(value);
  const room = useGame((g) => g.room);
  const preview = useGame((g) => g.previewDelta);
  const setHover = useGame((g) => g.setHover);
  const t = useRef<number>();
  useEffect(() => { setLocal(value); }, [value]);
  const change = (v: number) => {
    setLocal(v);
    setHover(preview(role, { [field]: v } as Partial<Design[R]>));
    clearTimeout(t.current);
    t.current = window.setTimeout(() => { room?.updateDesign(role, { [field]: v } as Partial<Design[R]>); setHover(null); }, 100);
  };
  const id = `sl-${role}-${field}`;
  return (
    <div className="slider-row">
      <label htmlFor={id}>{concept ? <Term id={concept}>{label}</Term> : label}</label>
      <div style={{ position: 'relative' }}>
        <input id={id} type="range" min={min} max={max} step={step} value={local} disabled={disabled} onChange={(e) => change(+e.target.value)} />
        {marker != null && marker >= min && marker <= max && (
          <div title={markerLabel} style={{ position: 'absolute', top: -4, height: 6, width: 2, background: 'var(--gold)',
            left: `${((marker - min) / (max - min)) * 100}%` }} />
        )}
      </div>
      <span>{fmtNum(local)} {unit}</span>
    </div>
  );
}

function Card({ selected, disabled, locked, onClick, hover, children, ribbon, title }:
  { selected: boolean; disabled?: boolean; locked?: boolean; onClick: () => void; hover?: object; children: ReactNode; ribbon?: string; title?: string }) {
  return (
    <button className="card part" aria-pressed={selected} disabled={disabled || locked} onClick={onClick} title={title} {...hover}>
      {ribbon && <span className="ribbon">{ribbon}</span>}
      {locked && <span className="ribbon" style={{ background: 'var(--muted-2)' }}><Icon id="ui_lock" size={16} alt="locked" /> locked</span>}
      {children}
    </button>
  );
}

function Head({ iconUrl, name }: { iconUrl: string; name: string }) {
  return <span className="row" style={{ gap: 6 }}><img src={iconUrl} width={32} height={32} alt="" style={{ imageRendering: 'pixelated' }} /><span className="name">{name}</span></span>;
}

function PlannerTab({ can }: { can: boolean }) {
  const s = useGame((g) => g.state)!;
  const hover = useHover(), edit = useEdit();
  const { orbits, launchVehicles } = getCatalog();
  const sc = getScenario(s.meta.scenarioId);
  const diff = getDifficulty(s.meta.difficulty);
  const p = s.design.planner;
  const orbit = orbits.find((o) => o.id === p.orbitId)!;
  return (
    <>
      <div className="section" data-tutorial="orbit-cards">
        <h3>Orbit <Help id="orbit" /></h3>
        <div className="cards parts">
          {orbits.map((o) => {
            const fit = sc.orbitFit[o.id];
            const badge = fit == null ? 'Not suitable' : fit >= 1 ? 'Best' : 'OK';
            return (
              <Card key={o.id} selected={p.orbitId === o.id} disabled={!can} locked={fit == null} hover={hover('planner', { orbitId: o.id })}
                onClick={() => edit('planner', { orbitId: o.id })} title={`${o.description}\n\n+ ${o.pros.join('\n+ ')}\n- ${o.cons.join('\n- ')}`}
                ribbon={diff.hints && o.id === sc.recommendedOrbit ? 'suggested' : undefined}>
                <Head iconUrl={orbitIcon(o.id)} name={o.name} />
                <span className={`small ${fit == null ? 'fail' : fit >= 1 ? 'pass' : 'warn'}`}>{fit == null ? '✕' : fit >= 1 ? '✓' : '!'} {badge}{fit != null && fit < 1 ? ` ${Math.round(fit * 100)}%` : ''}</span>
              </Card>
            );
          })}
        </div>
      </div>
      <div className="section">
        <Slider role="planner" field="lifetimeYears" label="Mission lifetime" concept="mission_lifetime" min={0.5} max={10} step={0.5}
          value={p.lifetimeYears} unit="yr" disabled={!can} marker={sc.minLifetimeYears} markerLabel={`minimum ${sc.minLifetimeYears} yr`} />
        <Slider role="planner" field="deltaVMarginPct" label="Delta-v margin" concept="delta_v" min={0} max={30} step={5}
          value={p.deltaVMarginPct} unit="%" disabled={!can} />
      </div>
      <div className="section" data-tutorial="vehicle-cards">
        <h3>Launch vehicle <Help id="payload_capacity" /></h3>
        <div className="cards parts">
          {launchVehicles.map((v) => {
            const cap = v.capacityKg[orbit.destination];
            const unlocked = isUnlocked(v.id, s.meta.difficulty, s.meta.scenarioId);
            return (
              <Card key={v.id} selected={p.launchVehicleId === v.id} disabled={!can || cap == null} locked={!unlocked}
                hover={hover('planner', { launchVehicleId: v.id })} onClick={() => edit('planner', { launchVehicleId: v.id })}
                title={`${v.description}\nReliability ${fmtNum(v.reliability * 100)}%`}>
                <Head iconUrl={vehicleIcon(v.id)} name={v.name} />
                {cap == null ? <span className="small fail">✕ can't reach</span> : <Stats items={[
                  ['res_mass', `lifts ${fmtKg(cap)}`],
                  ['res_budget', v.costPerKgM ? `${fmtM(v.costPerKgM * 1000)}/t` : fmtM(v.costM)]]} />}
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}

function EngineerTab({ can }: { can: boolean }) {
  const s = useGame((g) => g.state)!;
  const b = useGame((g) => g.budgets)!;
  const hover = useHover(), edit = useEdit();
  const k = getCatalog().components;
  const e = s.design.engineer;
  const un = (id: string) => isUnlocked(id, s.meta.difficulty, s.meta.scenarioId);
  const array = k.solarArrays.find((a) => a.id === e.solarArrayId);
  const battery = k.batteries.find((x) => x.id === e.batteryId)!;
  const list = <T extends { id: string; name: string; description?: string }>(title: string, concept: string, items: T[], field: keyof Design['engineer'], body: (x: T) => ReactNode) => (
    <div className="section">
      <h3>{title} <Help id={concept} /></h3>
      <div className="cards parts">
        {items.map((x) => (
          <Card key={x.id} selected={e[field] === x.id} disabled={!can} locked={!un(x.id)} hover={hover('engineer', { [field]: x.id })}
            onClick={() => edit('engineer', { [field]: x.id })} title={x.description}>
            <Head iconUrl={itemIcon(x.id)} name={x.name} />
            {body(x)}
          </Card>
        ))}
      </div>
    </div>
  );
  return (
    <>
      {list('Bus', 'mass_budget', k.buses, 'busId', (x) => <Stats items={[
        ['res_science', `${x.instrumentSlots} slot${x.instrumentSlots > 1 ? 's' : ''}`], ['res_mass', `≤ ${fmtKg(x.maxMassKg)}`], ['res_budget', fmtM(x.costM)]]} />)}
      <div className="section">
        <h3>Solar array <Help id="solar_power" /></h3>
        <div className="seg" role="radiogroup" aria-label="Solar array type">
          {[{ id: 'none', name: 'None' }, ...k.solarArrays].map((a) => (
            <button key={a.id} aria-pressed={e.solarArrayId === a.id} disabled={!can || (a.id !== 'none' && !un(a.id))}
              {...hover('engineer', { solarArrayId: a.id })} onClick={() => edit('engineer', { solarArrayId: a.id })}>
              {a.id === 'none' ? 'None' : a.id === 'sa_si' ? 'Silicon' : 'GaAs'}{a.id !== 'none' && !un(a.id) ? ' 🔒' : ''}
            </button>
          ))}
        </div>
        {array && <Stats items={[['res_power', `${array.wPerKg} W/kg`], ['res_time', `−${fmtNum(array.degradationPerYear * 100)}%/yr`], ['res_budget', `${fmtM(array.costMPerW * 1000)}/kW`]]} />}
        <Slider role="engineer" field="solarArrayW" label="Array power" min={0} max={6000} step={50} value={e.solarArrayW} unit="W" disabled={!can || e.solarArrayId === 'none'} />
        {un('rtg') && (
          <div className="slider-row">
            <span><Term id="rtg">RTG units</Term></span>
            <div className="row">
              <button className="btn small" disabled={!can || e.rtgCount <= 0} onClick={() => edit('engineer', { rtgCount: e.rtgCount - 1 })}>−</button>
              <span>{e.rtgCount}</span>
              <button className="btn small" disabled={!can || e.rtgCount >= 3} {...hover('engineer', { rtgCount: e.rtgCount + 1 })}
                onClick={() => edit('engineer', { rtgCount: e.rtgCount + 1 })}>+</button>
            </div>
            <span className="small muted">110 W, 45 kg, $60M each</span>
          </div>
        )}
      </div>
      <div className="section">
        <h3>Battery <Help id="battery" /></h3>
        <div className="seg" role="radiogroup" aria-label="Battery type">
          {k.batteries.map((x) => (
            <button key={x.id} aria-pressed={e.batteryId === x.id} disabled={!can || !un(x.id)} {...hover('engineer', { batteryId: x.id })}
              onClick={() => edit('engineer', { batteryId: x.id })}>{x.name}{!un(x.id) ? ' 🔒' : ''}</button>
          ))}
        </div>
        <span className="small muted" title={`${battery.whPerKg} Wh per kg · usable depth ${Math.round(battery.depthOfDischarge * 100)}%`}>Gold mark = enough for the {b.power.eclipseMin}-min <Term id="eclipse">eclipse</Term></span>
        <Slider role="engineer" field="batteryWh" label="Capacity" min={50} max={5000} step={50} value={e.batteryWh} unit="Wh" disabled={!can}
          marker={b.power.batteryRequiredWh} markerLabel={`needed: ${fmtNum(b.power.batteryRequiredWh)} Wh`} />
      </div>
      {list('Computer', 'radiation', k.computers, 'computerId', (x) => <Stats items={[
        ['res_data', `${fmtNum(x.storageGbit)} Gbit`], x.compression < 1 && ['res_comms', 'data ×½'], ['res_budget', fmtM(x.costM)]]} />)}
      {list('Attitude control', 'pointing', k.adcs, 'adcsId', (x) => <Stats items={[
        ['st_info', `±${x.pointingDeg}°`], ['res_power', fmtW(x.powerW)], ['res_budget', fmtM(x.costM)]]} />)}
      {list('Propulsion', 'specific_impulse', k.propulsion, 'propulsionId', (x) => <Stats items={[
        ['res_deltav', x.ispS ? `Isp ${x.ispS}s` : 'none'], ['res_mass', fmtKg(x.dryMassKg)], ['res_budget', fmtM(x.costM)]]} />)}
      <Stats items={[['res_deltav', `needs ${fmtMs(b.deltaV.withMarginMs)}`], ['res_mass', `${fmtKg(b.mass.propellantKg)} fuel`]]} />
      {!b.deltaV.feasible && <span className="fail small">✕ this engine can't reach the orbit</span>}
    </>
  );
}

function ScienceTab({ can }: { can: boolean }) {
  const s = useGame((g) => g.state)!;
  const hover = useHover(), edit = useEdit();
  const sc = getScenario(s.meta.scenarioId);
  const ids = s.design.science.instrumentIds;
  const bus = getCatalog().components.buses.find((x) => x.id === s.design.engineer.busId)!;
  const groups = sc.requiredTagGroups;
  return (
    <div className="section" data-tutorial="instrument-cards">
      <div className="row between">
        <h3>Instruments <Help id="instrument_science" /></h3>
        <span className={ids.length > bus.instrumentSlots ? 'fail' : 'muted'}>{ids.length} / {bus.instrumentSlots} slots</span>
      </div>
      {requiredGroupStatus(s.design, s.meta.scenarioId).missing.length > 0 && <p className="warn small">! Add one marked Required</p>}
      <div className="cards parts">
        {getCatalog().instruments.map((i) => {
          const on = ids.includes(i.id);
          const next = on ? ids.filter((x) => x !== i.id) : [...ids, i.id];
          const required = groups.some((g) => g.some((t) => i.tags.includes(t)));
          const w = Math.max(...i.tags.map((t) => sc.tagWeights[t] ?? sc.defaultTagWeight));
          return (
            <Card key={i.id} selected={on} disabled={!can} locked={!isUnlocked(i.id, s.meta.difficulty, s.meta.scenarioId)} ribbon={required ? 'Required' : undefined}
              hover={hover('science', { instrumentIds: next })} onClick={() => edit('science', { instrumentIds: next })}
              title={`${i.whatItMeasures}\n${i.description}\n${fmtKg(i.massKg)} · ${fmtGbitDay(i.dataGbitPerDay)} · needs ±${i.pointingReqDeg}° pointing`}>
              <Head iconUrl={itemIcon(i.id)} name={i.name} />
              <Stats items={[['res_science', <span className={w >= 0.8 ? 'pass' : w >= 0.4 ? 'warn' : 'dim'}>{'★'.repeat(Math.max(1, Math.round(w * 3)))}</span>],
                ['res_power', fmtW(i.powerW)], ['res_budget', fmtM(i.costM)]]} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CommsTab({ can }: { can: boolean }) {
  const s = useGame((g) => g.state)!;
  const b = useGame((g) => g.budgets)!;
  const checks = useGame((g) => g.checks);
  const preview = useGame((g) => g.previewDelta);
  const hover = useHover(), edit = useEdit();
  const k = getCatalog().components;
  const c = s.design.comms;
  const orbit = getCatalog().orbits.find((o) => o.id === s.design.planner.orbitId)!;
  const dr = checks.find((x) => x.id === 'data_return');
  const tip = getCatalog().dialog.priya_tip?.[0];
  const adcs = k.adcs.find((a) => a.id === s.design.engineer.adcsId)!;
  const canPoint = adcs.pointingDeg <= k.hga.maxPointingDeg;
  return (
    <>
      {dr && dr.severity !== 'pass' && tip && <Speech speaker={tip.speaker} expr="worried" text={tip.text} />}
      <div className="section" data-tutorial="radio-cards">
        <h3>Radio <Help id="data_rate" /></h3>
        <div className="cards parts">
          {k.radios.map((r) => {
            const pb = preview('comms', { radioId: r.id });
            const blocked = r.nearEarthOnly && !orbit.isNearEarth;
            return (
              <Card key={r.id} selected={c.radioId === r.id} disabled={!can || blocked} locked={!isUnlocked(r.id, s.meta.difficulty, s.meta.scenarioId)}
                hover={hover('comms', { radioId: r.id })} onClick={() => edit('comms', { radioId: r.id })} title={r.description}>
                <Head iconUrl={itemIcon(r.id)} name={r.name} />
                {blocked ? <span className="small fail">✕ can't reach</span> : <Stats items={[
                  ['res_comms', `${fmtNum(pb?.data.rateMbps ?? 0)} Mbps`], ['res_power', fmtW(r.powerW)], ['res_budget', fmtM(r.costM)]]} />}
              </Card>
            );
          })}
        </div>
      </div>
      <div className="section">
        <h3>High-gain antenna <Help id="antenna_gain" /></h3>
        <label className="row" title={canPoint ? '' : `Your attitude control holds ±${adcs.pointingDeg}°; the dish needs ±0.1° or better.`}
          {...hover('comms', { hga: !c.hga })}>
          <input type="checkbox" checked={c.hga} disabled={!can || (!canPoint && !c.hga)} onChange={() => edit('comms', { hga: !c.hga })} />
          {k.hga.name} <Stats items={[['res_comms', `×${k.hga.gain}`], ['res_budget', fmtM(k.hga.costM)]]} />
          {!canPoint && <span className="warn small"> needs reaction wheels</span>}
          {c.hga && <span className={b.data.hgaEffective ? 'pass' : 'warn'}>{b.data.hgaEffective ? '✓ pointed' : '! not pointed'}</span>}
        </label>
      </div>
      <div className="section">
        <h3>Ground network <Help id="ground_station" /></h3>
        <div className="cards parts">
          {k.groundNetworks.map((g) => {
            const h = orbit.contactHours[g.id];
            return (
              <Card key={g.id} selected={c.groundNetworkId === g.id} disabled={!can || h === 0} hover={hover('comms', { groundNetworkId: g.id })}
                onClick={() => edit('comms', { groundNetworkId: g.id })} title={g.description}>
                <Head iconUrl={groundIcon(g.id)} name={g.name} />
                {h === 0 ? <span className="small fail">✕ can't reach</span> : <Stats items={[['res_time', `${fmtNum(h)} h/day`], ['res_budget', `${fmtM(g.costMPerYear)}/yr`]]} />}
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}

function FundsRequest({ fromRole, onClose }: { fromRole: Role; onClose: () => void }) {
  const room = useGame((g) => g.room)!;
  const [to, setTo] = useState<Role>(ROLES.find((r) => r !== fromRole)!);
  const [amount, setAmount] = useState(5);
  const [reason, setReason] = useState('');
  return (
    <Modal label="Request funds" onClose={onClose}>
      <h2>Request funds for the {ROLE_TITLES[fromRole]}</h2>
      <div className="col">
        <label className="row">From <select value={to} onChange={(e) => setTo(e.target.value as Role)}>
          {ROLES.filter((r) => r !== fromRole).map((r) => <option key={r} value={r}>{ROLE_TITLES[r]}</option>)}</select></label>
        <label className="row">Amount ($M) <input type="number" min={0.5} step={0.5} value={amount} onChange={(e) => setAmount(+e.target.value)} style={{ width: 100 }} /></label>
        <label className="row">Reason <input type="text" maxLength={80} value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 380 }} /></label>
        <div className="row"><button className="btn primary" disabled={amount <= 0} onClick={() => { room.requestFunds(fromRole, to, amount, reason || 'Need more budget'); play('sfx_coin'); onClose(); }}>Send request</button>
          <button className="btn" onClick={onClose}>Cancel</button></div>
      </div>
    </Modal>
  );
}

export function DesignWorkshop() {
  const s = useGame((g) => g.state)!;
  const b = useGame((g) => g.budgets);
  const checks = useGame((g) => g.checks);
  const active = useGame((g) => g.activeRole);
  const set = useGame((g) => g.set);
  const reviewOpen = useGame((g) => g.reviewOpen);
  const tradeOpen = useGame((g) => g.tradeOpen);
  const room = useGame((g) => g.room)!;
  const mine = useMyRoles();
  const [view, setView] = useState<'craft' | 'orbit'>('craft');
  const [funds, setFunds] = useState<Role | null>(null);
  if (!b) return null;
  const can = mine.includes(active);
  const holderName = (r: Role) => { const u = s.roles[r]; return u ? s.players[u]?.name ?? 'someone' : 'nobody'; };
  const characters = getCatalog().characters;
  const roleChar = (r: Role) => { const u = s.roles[r]; const p = u ? s.players[u] : null;
    return p && room.mode === 'online' ? p.characterId : characters.find((c) => c.role === r)?.id ?? 'hassan'; };
  return (
    <div className="workshop">
      <nav className="col" aria-label="Roles" role="tablist">
        {ROLES.map((r) => {
          const over = b.cost.byRole[r] > b.cost.allocationM[r];
          const fails = checks.some((c) => c.role === r && c.severity === 'fail');
          const ch = characters.find((c) => c.id === roleChar(r));
          return (
            <button key={r} role="tab" aria-selected={active === r} className="roletab" data-tutorial={`tab-${r}`}
              onClick={() => set({ activeRole: r })} title={fails ? ch?.lines.warning : undefined}>
              <span className="stripe" style={{ background: ROLE_COLOR[r] }} />
              <Portrait id={roleChar(r)} expr={fails ? 'worried' : 'neutral'} size={40} />
              <span className="col" style={{ gap: 0 }}>
                <span className="row" style={{ gap: 4 }}><Icon id={ROLE_ICON[r]} size={16} />{ROLE_TITLES[r]}</span>
                {room.mode === 'online' && <span className="small dim">{holderName(r)}</span>}
                <span className="small">{fmtM(b.cost.byRole[r])} / {fmtM(b.cost.allocationM[r])} {over && <span className="badge fail">over</span>}</span>
                <span className="small">{s.signoffs[r] ? <span className="pass">✓ signed off</span> : <span className="dim">not signed</span>}</span>
              </span>
            </button>
          );
        })}
        <button className="btn big gold" data-tutorial="review-button" onClick={() => { play('sfx_click'); set({ reviewOpen: true }); }}>Review ▶</button>
        {mine.length > 0 && room.mode === 'online' && <button className="btn small" onClick={() => setFunds(mine.includes(active) ? active : mine[0])}>Request funds</button>}
      </nav>

      <section className="col" style={{ minWidth: 0 }}>
        <div className="row between">
          <div className="seg" role="radiogroup" aria-label="Preview">
            <button aria-pressed={view === 'craft'} onClick={() => setView('craft')}>Spacecraft</button>
            <button aria-pressed={view === 'orbit'} onClick={() => setView('orbit')}>Orbit view</button>
          </div>
          <button className="btn small" onClick={() => set({ tradeOpen: true })} title="Explore the trade space (CML 3)">Trade Space ▤</button>
        </div>
        <div className="row center">
          {view === 'craft' ? <SpacecraftPreview design={s.design} totalKg={b.mass.totalKg} scale={2} /> : <OrbitView orbitId={s.design.planner.orbitId} scale={2} />}
        </div>
        {!can && <div className="banner">{holderName(active)} controls this tab</div>}
        <div className="panel dark" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 420px)', minHeight: 260 }}>
          {active === 'planner' && <PlannerTab can={can} />}
          {active === 'engineer' && <EngineerTab can={can} />}
          {active === 'science' && <ScienceTab can={can} />}
          {active === 'comms' && <CommsTab can={can} />}
        </div>
      </section>

      <aside className="panel" style={{ overflow: 'auto' }}><Dashboard /></aside>
      {reviewOpen && <ReviewPanel />}
      {tradeOpen && <TradeSpace onClose={() => set({ tradeOpen: false })} />}
      {funds && <FundsRequest fromRole={funds} onClose={() => setFunds(null)} />}
    </div>
  );
}
