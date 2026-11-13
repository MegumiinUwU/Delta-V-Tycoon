// Attempt history (F-15): every flight of this mission, its score and the change since the previous one, plus a
// side-by-side comparison with the previous design — "modify and re-simulate many times" made visible.
import { decodeDesign } from '../../core';
import { useGame } from '../../state/store';
import type { Attempt } from '../../state/storage';
import { Stars } from '../components/common';
import { CompareTable } from './Misc';

const scenarioOf = (a: Attempt) => a.scenarioId ?? decodeDesign(a.designCode)?.scenarioId;
const difficultyOf = (a: Attempt) => a.difficulty ?? decodeDesign(a.designCode)?.difficulty;

export function Attempts() {
  const attempts = useGame((g) => g.attempts);
  const s = useGame((g) => g.state);
  if (!s) return null;
  const mine = attempts.filter((a) => scenarioOf(a) === s.meta.scenarioId && difficultyOf(a) === s.meta.difficulty);
  if (mine.length === 0) return null;
  const rows = mine.map((a, i) => ({ a, n: i + 1, delta: i > 0 ? a.score - mine[i - 1].score : null })).reverse().slice(0, 8);
  const best = Math.max(...mine.map((a) => a.score));
  const cur = mine[mine.length - 1], prev = mine.length > 1 ? mine[mine.length - 2] : null;
  return (
    <section className="panel col" aria-label="Your attempts">
      <h2>Your attempts <span className="small dim">— this mission, {s.meta.difficulty}</span></h2>
      <table className="grid">
        <thead><tr><th>#</th><th>When</th><th>Stars</th><th>Score</th><th>Change</th></tr></thead>
        <tbody>
          {rows.map(({ a, n, delta }) => (
            <tr key={a.at} className={a === cur ? 'diff' : ''}>
              <td>{n}{a === cur ? ' (this one)' : ''}{a.score === best ? ' ★ best' : ''}</td>
              <td>{new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{a.stars != null ? <Stars n={a.stars} size={16} /> : '—'}</td>
              <td>{a.score}</td>
              <td className={delta == null ? 'dim' : delta > 0 ? 'pass' : delta < 0 ? 'fail' : 'dim'}>
                {delta == null ? 'first flight' : `${delta > 0 ? '+' : ''}${delta}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {prev && (
        <details className="more">
          <summary>Compare with your previous attempt</summary>
          <CompareTable a={prev.designCode} b={cur.designCode} labels={[`Attempt ${mine.length - 1}`, `Attempt ${mine.length} (this one)`]}
            scores={[prev.score, cur.score]} />
        </details>
      )}
    </section>
  );
}
