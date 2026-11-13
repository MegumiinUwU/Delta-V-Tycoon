// Trade-Space Explorer (F-34, NASA JPL CML 3): science, cost and margins vs one parameter.
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtM, fmtNum, sweepRole, tradeSweep, type Role, type SweepParam, type SweepPoint } from '../../core';
import { useGame, useMyRoles } from '../../state/store';
import { Help, Modal } from '../components/common';

const PARAMS: [SweepParam, string, boolean][] = [
  ['lifetimeYears', 'Mission lifetime', true], ['solarArrayW', 'Solar array power', true], ['batteryWh', 'Battery capacity', true],
  ['deltaVMarginPct', 'Delta-v margin', true], ['busId', 'Bus', false], ['radioId', 'Radio', false], ['groundNetworkId', 'Ground network', false],
  ['launchVehicleId', 'Rocket', false], ['adcsId', 'Attitude control', false],
];

function Tip({ active, payload }: { active?: boolean; payload?: { payload: SweepPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="panel small">
      <div className="gold">{p.label}{p.isCurrent ? ' (current)' : ''}</div>
      <div>Science ≈ {fmtNum(p.scienceEstPctOfTarget)}% of target</div>
      <div>Cost {fmtM(p.totalCostM)}</div>
      <div>Launch margin {p.launchMarginPct == null ? 'cannot reach' : `${fmtNum(p.launchMarginPct)}%`} · Power margin {fmtNum(p.powerMarginPct)}%</div>
      <div>Data return {fmtNum(p.returnPct)}%</div>
      {p.failCount > 0 && <div className="fail">✗ {p.failCount} NO-GO check{p.failCount > 1 ? 's' : ''}</div>}
    </div>
  );
}

export function TradeSpace({ onClose }: { onClose: () => void }) {
  const s = useGame((g) => g.state)!;
  const b = useGame((g) => g.budgets)!;
  const room = useGame((g) => g.room)!;
  const mine = useMyRoles();
  const [param, setParam] = useState<SweepParam>('lifetimeYears');
  const numeric = PARAMS.find((p) => p[0] === param)![2];
  const pts = useMemo(() => tradeSweep(s.design, s.meta.scenarioId, s.meta.difficulty, s.council.split, param), [s.design, s.meta, s.council.split, param]);
  const role = sweepRole(param) as Role;
  const can = mine.includes(role);
  const budgetPct = (x: number) => (x / b.cost.budgetM) * 100;
  const data = pts.map((p) => ({ ...p, costPct: budgetPct(p.totalCostM) }));
  const apply = (p: SweepPoint) => {
    if (!can || p.isCurrent) return;
    const key = param === 'lifetimeYears' || param === 'deltaVMarginPct' || param === 'launchVehicleId' ? param : param;
    room.updateDesign(role, { [key]: p.value } as never);
  };
  return (
    <Modal label="Trade-Space Explorer" onClose={onClose} wide>
      <div className="row between"><h2>Trade-Space Explorer <Help id="trade_space" /></h2><button className="btn small" onClick={onClose}>Close</button></div>
      <p className="muted small">Explore the trade space before you commit to a point design (NASA JPL CML 3). Everything else stays fixed.</p>
      <label className="row">Parameter
        <select value={param} onChange={(e) => setParam(e.target.value as SweepParam)}>
          {PARAMS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {!can && <span className="small warn">View only — the {role} role applies this.</span>}
      </label>
      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} onClick={(e) => { const i = (e as { activeTooltipIndex?: number })?.activeTooltipIndex; if (i != null) apply(data[Number(i)]); }}>
            <CartesianGrid stroke="#3a4466" />
            <XAxis dataKey="label" stroke="#c0cbdc" tick={{ fontSize: 14 }} interval={numeric ? 'preserveStartEnd' : 0} />
            <YAxis stroke="#c0cbdc" unit="%" tick={{ fontSize: 14 }} />
            <Tooltip content={<Tip />} />
            <ReferenceLine y={100} stroke="#feae34" strokeDasharray="4 4" label={{ value: '100% target / budget', fill: '#feae34', fontSize: 14 }} />
            {numeric ? (
              <>
                <Line dataKey="scienceEstPctOfTarget" name="Science % of target" stroke="#63c74d" strokeWidth={2} isAnimationActive={false}
                  dot={(p: { cx?: number; cy?: number; payload?: SweepPoint; index?: number }) => (
                    <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload?.isCurrent ? 6 : 3}
                      fill={p.payload?.failCount ? '#e43b44' : p.payload?.isCurrent ? '#feae34' : '#63c74d'} />)} />
                <Line dataKey="costPct" name="Cost % of budget" stroke="#0099db" strokeWidth={2} dot={false} isAnimationActive={false} />
              </>
            ) : (
              <>
                <Bar dataKey="scienceEstPctOfTarget" name="Science % of target" isAnimationActive={false}>
                  {data.map((p, i) => <Cell key={i} fill={p.failCount ? '#a22633' : p.isCurrent ? '#feae34' : '#63c74d'} stroke={p.isCurrent ? '#fff' : undefined} />)}
                </Bar>
                <Bar dataKey="costPct" name="Cost % of budget" fill="#0099db" isAnimationActive={false} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="small"><span className="pass">■</span> science (estimate, no random events) · <span style={{ color: 'var(--blue)' }}>■</span> cost vs budget ·
        <span className="fail"> ■</span> would create a NO-GO check · <span className="gold">●</span> current. {can && 'Click a point to apply it.'}</p>
    </Modal>
  );
}
