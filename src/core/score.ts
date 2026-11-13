// scoreMission — Part A §A12 (maximum 1000).
import { clamp, computeBudgets } from './budgets';
import { getScenario } from './catalog';
import { requiredGroupStatus, ROLE_TITLES } from './checks';
import { buildInsights, buildTryNext, debrisViolated } from './insights';
import type { OutcomeClass, Role, ScoreReport, SimInput, SimResult, TeamContext } from './types';

const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);

export function massMarginPoints(m: number | null): number {
  if (m == null || m < 0) return 0;
  if (m < 5) return lerp(m, 0, 5, 0, 50);
  if (m <= 60) return 50;
  if (m < 95) return lerp(m, 60, 95, 50, 30);
  return 30;
}
export function powerMarginPoints(p: number): number {
  if (p < 0) return 0;
  if (p < 10) return lerp(p, 0, 10, 0, 50);
  if (p <= 60) return 50;
  if (p < 150) return lerp(p, 60, 150, 50, 25);
  return 25;
}

export function scoreMission(input: SimInput, result: SimResult, team: TeamContext): ScoreReport {
  const b = computeBudgets(input.design, input.scenarioId, input.difficulty, input.split);
  const scenario = getScenario(input.scenarioId);
  const groups = requiredGroupStatus(input.design, input.scenarioId);
  const orbitFit = scenario.orbitFit[input.design.planner.orbitId] ?? 0;
  const reachedOrbit = result.outcome !== 'launch_failure' && result.outcome !== 'orbit_failure';
  const groupFrac = groups.total === 0 ? 1 : groups.satisfied / groups.total;

  let objectives = 150 * groupFrac + 50 * orbitFit + 100 * Math.min(1, result.achievedYears / scenario.minLifetimeYears);
  let science = 300 * Math.min(1, result.scienceReturned / scenario.scienceTarget);

  const finalReservePct = ((b.cost.budgetM - result.finalTotalCostM) / b.cost.budgetM) * 100;
  const budgetPts = result.finalTotalCostM > b.cost.budgetM ? 0 : 100 * clamp(finalReservePct / 15, 0, 1);
  const efficiency = budgetPts + massMarginPoints(b.mass.launchMarginPct) + powerMarginPoints(b.power.marginPct);

  const badEvents = result.events.filter((e) => e.bad).length;
  const lostFrac = result.dataGenerated > 0 ? result.dataLost / result.dataGenerated : 0;
  let operations = Math.max(0, 100 - 40 * lostFrac - 15 * badEvents - 20 * (debrisViolated(input.design, b) ? 1 : 0)
    - 30 * (result.outcome === 'power_failure' ? 1 : 0));

  if (!reachedOrbit) { objectives = 0; science = 0; operations = 0; }

  const g = (met: boolean, text: string) => ({ met, text });
  const roleGoals: Record<Role, { met: boolean; text: string }> = {
    planner: g(result.finalTotalCostM <= 0.9 * b.cost.budgetM && b.time.delayMonths === 0,
      'Total cost ≤ 90% of budget and launch on time'),
    engineer: g((b.mass.launchMarginPct ?? -1) >= 10 && b.power.marginPct >= 15 && b.power.batteryOk,
      'Launch mass margin ≥ 10%, power margin ≥ 15% and battery covers eclipse'),
    science: g(reachedOrbit && result.scienceReturned >= scenario.scienceTarget, 'Science returned ≥ 100% of target'),
    comms: g(reachedOrbit && result.dataLost === 0 && result.dataReturned >= 0.95 * result.dataGenerated,
      '≥ 95% of generated data returned to Earth'),
  };
  for (const r of Object.keys(roleGoals) as Role[]) roleGoals[r].text = `${ROLE_TITLES[r]}: ${roleGoals[r].text}`;
  const goalsMet = Object.values(roleGoals).filter((x) => x.met).length;
  const teamwork = 15 * goalsMet + (team.failChecksAtLaunch === 0 ? 20 : 0) + (team.reviewDone ? 20 : 0);

  const raw = objectives + science + efficiency + operations + teamwork;
  const total = Math.round(raw);
  const stars: 0 | 1 | 2 | 3 = total >= 850 ? 3 : total >= 650 ? 2 : total >= 450 ? 1 : 0;
  const success = groups.missing.length === 0 && result.achievedYears >= scenario.minLifetimeYears
    && result.scienceReturned >= 0.7 * scenario.scienceTarget && reachedOrbit;
  const outcomeClass: OutcomeClass = success ? 'success' : reachedOrbit && result.scienceReturned > 0 ? 'partial' : 'failure';
  const rankTitle = total >= 850 ? 'Flight Director' : total >= 650 ? 'Flight Engineer' : total >= 450 ? 'Mission Specialist' : 'Trainee';

  const keyed = buildInsights(input, result, b);
  const tryNext = buildTryNext(input, keyed, b);
  const insights = keyed.map(({ kind, role, text, conceptId }) => ({ kind, role, text, conceptId }));

  return { total, stars, outcomeClass, rankTitle, parts: { objectives, science, efficiency, operations, teamwork }, roleGoals, insights, tryNext };
}
