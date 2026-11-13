// Resource dashboard: 7 live meters with hover-preview ghost bars and deltas (the signature trade-off feature).
import { useState } from 'react';
import { fmtDelay, fmtGbitDay, fmtKg, fmtM, fmtMonths, fmtMs, fmtNum, fmtW, ROLES, type Budgets, type Check, type Severity } from '../../core';
import { getOrbit } from '../../core/catalog';
import { useGame } from '../../state/store';
import { Help, Icon, Modal, ROLE_COLOR, Status } from './common';

interface MeterDef {
  id: 'mass' | 'power' | 'budget' | 'data' | 'comms' | 'time' | 'deltav'; label: string; icon: string; concept: string; checks: string[];
  frac: (b: Budgets) => number; text: (b: Budgets) => string; sub?: (b: Budgets) => string;
  delta?: (b: Budgets, h: Budgets) => { text: string; better: boolean } | null;
  ticks?: (b: Budgets) => { at: number; color?: string; label: string }[];
}

const sign = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '±');
const d = (x: number, f: (v: number) => string, betterWhenLower: boolean, eps = 0.05) =>
  Math.abs(x) < eps ? null : { text: `${sign(x)}${f(Math.abs(x))}`, better: betterWhenLower ? x < 0 : x > 0 };

export const METERS: MeterDef[] = [
  { id: 'mass', label: 'Mass', icon: 'res_mass', concept: 'mass_budget', checks: ['launch_capacity', 'launch_destination', 'bus_mass'],
    frac: (b) => b.mass.totalKg / (b.mass.launchCapacityKg ?? b.mass.busMaxKg),
    text: (b) => `${fmtNum(b.mass.totalKg)} / ${b.mass.launchCapacityKg == null ? 'cannot reach' : fmtKg(b.mass.launchCapacityKg)}`,
    sub: (b) => (b.mass.launchMarginPct == null ? 'rocket cannot reach this orbit' : `launch margin ${fmtNum(b.mass.launchMarginPct)}% · bus max ${fmtKg(b.mass.busMaxKg)}`),
    delta: (b, h) => d(h.mass.totalKg - b.mass.totalKg, fmtKg, true),
    ticks: (b) => (b.mass.launchCapacityKg ? [{ at: b.mass.busMaxKg / b.mass.launchCapacityKg, label: 'bus max' }] : []) },
  { id: 'power', label: 'Power', icon: 'res_power', concept: 'power_budget', checks: ['power_balance', 'battery_eclipse', 'electric_power'],
    frac: (b) => b.power.loadW / Math.max(1, b.power.generationW),
    text: (b) => `${fmtNum(b.power.loadW)} / ${fmtW(b.power.generationW)}`,
    sub: (b) => `margin ${fmtNum(b.power.marginPct)}% · Battery ${fmtNum(b.power.batteryWh)}/${fmtNum(b.power.batteryRequiredWh)} Wh`,
    delta: (b, h) => d(h.power.marginPct - b.power.marginPct, (v) => `${fmtNum(v)}% margin`, false) },
  { id: 'budget', label: 'Budget', icon: 'res_budget', concept: 'mission_cost', checks: ['budget_total', ...ROLES.map((r) => `role_allocation_${r}`)],
    frac: (b) => b.cost.totalM / b.cost.budgetM,
    text: (b) => `${fmtM(b.cost.totalM)} / ${fmtM(b.cost.budgetM)}`,
    sub: (b) => `reserve ${fmtNum(b.cost.reservePct)}%`,
    delta: (b, h) => d(h.cost.totalM - b.cost.totalM, fmtM, true),
    ticks: (b) => { let acc = 0; return ROLES.slice(0, 3).map((r) => { acc += b.cost.allocationM[r]; return { at: acc / b.cost.budgetM, color: ROLE_COLOR[r], label: `${r} allocation` }; }); } },
  { id: 'data', label: 'Data', icon: 'res_data', concept: 'data_rate', checks: ['data_return', 'storage'],
    frac: (b) => b.data.returnPct / 100,
    text: (b) => `${fmtNum(b.data.generatedGbitPerDay)} → ${fmtGbitDay(b.data.downlinkGbitPerDay)}`,
    sub: (b) => `Returns ${fmtNum(b.data.returnPct)}% · storage ${fmtNum(b.data.storageGbit)} Gbit`,
    delta: (b, h) => d(h.data.downlinkGbitPerDay - b.data.downlinkGbitPerDay, fmtGbitDay, false) ?? d(h.data.generatedGbitPerDay - b.data.generatedGbitPerDay, fmtGbitDay, true) },
  { id: 'comms', label: 'Comms', icon: 'res_comms', concept: 'ground_station', checks: ['radio_range', 'hga_pointing'],
    frac: (b) => b.data.contactHoursPerDay / 24,
    text: (b) => `${fmtNum(b.data.rateMbps)} Mbps · ${fmtNum(b.data.contactHoursPerDay)} h/day`,
    sub: () => '',
    delta: (b, h) => d(h.data.rateMbps - b.data.rateMbps, (v) => `${fmtNum(v)} Mbps`, false, 0.01) },
  { id: 'time', label: 'Time', icon: 'res_time', concept: 'launch_window', checks: ['launch_window', 'lifetime_min', 'natural_lifetime'],
    frac: (b) => b.time.launchMonth / b.time.windowMonths,
    text: (b) => `launch month ${b.time.launchMonth} / ${b.time.windowMonths}`,
    sub: (b) => `lifetime ${fmtNum(b.time.lifetimeYears)} yr${b.time.transferMonths ? ` · transfer ${fmtMonths(b.time.transferMonths)}` : ''}${b.time.delayMonths ? ` · ${b.time.delayMonths} months late` : ''}`,
    delta: (b, h) => d(h.time.launchMonth - b.time.launchMonth, (v) => fmtMonths(v), true) },
  { id: 'deltav', label: 'Δv', icon: 'res_deltav', concept: 'delta_v', checks: ['deltav_capability', 'debris_disposal'],
    frac: (b) => (b.deltaV.capabilityMs > 0 ? b.deltaV.withMarginMs / b.deltaV.capabilityMs : b.deltaV.withMarginMs > 0 ? 1.2 : 0),
    text: (b) => `${fmtNum(b.deltaV.withMarginMs)} / ${fmtMs(b.deltaV.capabilityMs)}`,
    sub: (b) => `required ${fmtMs(b.deltaV.requiredMs)}${b.mass.propellantKg ? ` · propellant ${fmtKg(b.mass.propellantKg)}` : ''}`,
    delta: (b, h) => d(h.mass.propellantKg - b.mass.propellantKg, (v) => `${fmtKg(v)} propellant`, true) },
];

const worst = (checks: Check[], ids: string[]): Severity => {
  const s = checks.filter((c) => ids.includes(c.id)).map((c) => c.severity);
  return s.includes('fail') ? 'fail' : s.includes('warn') ? 'warn' : 'pass';
};
const COLOR: Record<Severity, string> = { pass: 'var(--pass)', warn: 'var(--warn)', fail: 'var(--fail)' };

export function Dashboard() {
  const b = useGame((g) => g.budgets);
  const h = useGame((g) => g.hover);
  const checks = useGame((g) => g.checks);
  const state = useGame((g) => g.state);
  const [open, setOpen] = useState<MeterDef['id'] | null>(null);
  if (!b || !state) return null;
  const orbit = getOrbit(state.design.planner.orbitId);
  const counts = { fail: checks.filter((c) => c.severity === 'fail').length, warn: checks.filter((c) => c.severity === 'warn').length,
    pass: checks.filter((c) => c.severity === 'pass').length };
  return (
    <section className="col" aria-label="Resource dashboard" style={{ gap: 4 }}>
      <h3 style={{ marginBottom: 2 }}>Resource dashboard</h3>
      {METERS.map((m) => {
        const sev = worst(checks, m.checks);
        const f = Math.min(1.2, Math.max(0, m.frac(b)));
        const hf = h ? Math.min(1.2, Math.max(0, m.frac(h))) : null;
        const dl = h && m.delta ? m.delta(b, h) : null;
        const sub = m.id === 'comms' ? `light delay ${fmtDelay(orbit.lightDelaySec)}` : m.sub?.(b);
        return (
          <button key={m.id} className="meter" data-tutorial={`meter-${m.id}`} onClick={() => setOpen(m.id)} aria-label={`${m.label}: ${m.text(b)}. Open breakdown`}>
            <div className="row between">
              <span className="row" style={{ gap: 4 }}><Icon id={m.icon} size={24} /> {m.label} <Status s={sev} /></span>
              <span className="small">{m.text(b)}{dl && <span className={`delta ${dl.better ? 'better' : 'worse'}`}>{dl.text}</span>}</span>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: `${Math.min(100, f * 100)}%`, background: COLOR[sev] }} />
              {hf != null && Math.abs(hf - f) > 0.002 && (
                <div className="ghost" style={{ left: `${Math.min(hf, f) * 100}%`, width: `${Math.abs(hf - f) * 100}%` }} />
              )}
              {m.ticks?.(b).map((t) => t.at > 0 && t.at < 1.2 && <div key={t.label} className="tick" title={t.label} style={{ left: `${Math.min(99, t.at * 100)}%`, background: t.color }} />)}
            </div>
            {sub && <div className="small dim">{sub}</div>}
          </button>
        );
      })}
      <div className="row small" aria-label="Checks summary">
        Checks: <span className="fail">{counts.fail}✗</span> <span className="warn">{counts.warn}!</span> <span className="pass">{counts.pass}✓</span>
      </div>
      {open && <Breakdown id={open} b={b} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Breakdown({ id, b, onClose }: { id: MeterDef['id']; b: Budgets; onClose: () => void }) {
  const m = METERS.find((x) => x.id === id)!;
  const lines = id === 'mass' ? b.mass.lines.map((l) => [l.label, fmtKg(l.value), l.role] as const)
    : id === 'power' ? b.power.lines.map((l) => [l.label, fmtW(l.value), l.role] as const)
    : id === 'budget' ? b.cost.lines.map((l) => [l.label, fmtM(l.value), l.role] as const) : null;
  return (
    <Modal label={`${m.label} breakdown`} onClose={onClose}>
      <div className="row between"><h2>{m.label} breakdown <Help id={m.concept} /></h2><button className="btn small" onClick={onClose}>Close</button></div>
      <p>{m.text(b)} — {m.sub?.(b)}</p>
      {lines && (
        <table className="grid">
          <tbody>{lines.filter((l) => l[1] !== '0 kg' && l[1] !== '0 W' && l[1] !== '$0M').map(([label, v, role], i) => (
            <tr key={i}><td><span className="rolechip" style={{ background: ROLE_COLOR[role] }} />{label}</td><td>{v}</td></tr>))}</tbody>
        </table>
      )}
      {id === 'budget' && (
        <table className="grid" style={{ marginTop: 8 }}>
          <thead><tr><th>Role</th><th>Cost</th><th>Allocation</th></tr></thead>
          <tbody>{ROLES.map((r) => <tr key={r}><td>{r}</td><td>{fmtM(b.cost.byRole[r])}</td><td>{fmtM(b.cost.allocationM[r])}</td></tr>)}</tbody>
        </table>
      )}
      {id === 'data' && <p>Rate {fmtNum(b.data.rateMbps)} Mbps × {fmtNum(b.data.contactHoursPerDay)} h contact × 3.6 = {fmtGbitDay(b.data.downlinkGbitPerDay)} downlink; instruments make {fmtGbitDay(b.data.generatedGbitPerDay)}. High-gain antenna {b.data.hgaEffective ? 'working' : 'not used or not pointed'}.</p>}
      {id === 'deltav' && <p>Required {fmtMs(b.deltaV.requiredMs)}, with margin {fmtMs(b.deltaV.withMarginMs)}; engine Isp {b.deltaV.ispS} s; propellant {fmtKg(b.mass.propellantKg)} + tank {fmtKg(b.mass.tankKg)}.{!b.deltaV.feasible && ' The rocket equation is infeasible: too much delta-v for this engine.'}</p>}
      {id === 'time' && <p>Development {b.time.devMonths} months → launch month {b.time.launchMonth} (window {b.time.windowMonths}); delay cost {fmtM(b.cost.delayM)}.</p>}
    </Modal>
  );
}
