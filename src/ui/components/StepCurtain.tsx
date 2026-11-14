// Full-page step change, after ol.mr's page transitions: when a mission step finishes, a gold sheet and then a dark
// sheet sweep up over the page you just finished, the next step's number and name rise in the middle and hold long
// enough to read, then the sheets lift away in reverse order and the new page rises in behind them.
//
// Steps that follow each other at once (solo: the briefing goes straight past the council to design) queue up in
// the same curtain, each with its own title card, instead of cutting each other off. A mission also opens with a
// card for step 1. Two fixed layers and transform/opacity animations only; while idle nothing is mounted and nothing
// runs. Reduced motion skips it (the plain tab slide still plays).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../../state/store';
import { STEPS, stepOf, useShownStep } from '../steps';

// These match the animations of .step-curtain in motion.css.
const IN_MS = 650;       // gold then dark sheet sweep up over the old page
const TITLE_MS = 1400;   // one step's number and name: rise in, hold, fade (sc-title)
const REVEAL_MS = 140;   // into the lift: the gold sheet starts to go, the new page rises in behind it
const OUT_MS = 720;      // both sheets gone

const reducedMotion = () => document.documentElement.classList.contains('reduced-motion')
  || matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Snapshot { node: HTMLElement; top: number; left: number; width: number; height: number; bar: number }
type Stage = 'in' | 'hold' | 'out';
interface Run { id: number; steps: number[]; idx: number; stage: Stage; snap: Snapshot | null; bar: number }

/** The sheets cover the page under the top bar, so you can watch the step marker glide along while they pass. */
const barBottom = () => Math.max(0, document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0);

/** A copy of the page as it looks now. cloneNode leaves canvases blank (the launch scene), so their pixels are copied. */
function copyOf(panel: HTMLElement): HTMLElement {
  const node = panel.cloneNode(true) as HTMLElement;
  node.classList.remove('tab-panel');               // no entrance animation on the copy
  const from = panel.querySelectorAll('canvas');
  node.querySelectorAll('canvas').forEach((c, i) => {
    try { if (from[i]?.width) c.getContext('2d')?.drawImage(from[i], 0, 0); } catch { /* leave it blank */ }
  });
  return node;
}

export function StepCurtain() {
  const step = useGame((g) => (g.state ? stepOf(g.state.meta.phase, g.briefingDone) : -1));
  const snap = useRef<Snapshot | null>(null);
  const prev = useRef(step);
  const [run, setRun] = useState<Run | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const titleAt = useRef(0);

  // The store tells its listeners about a change before React redraws, so the page on screen is still the step you
  // just finished: copy it now, and measure the top bar now too, while nothing is moving.
  useEffect(() => useGame.subscribe((g, old) => {
    if (!g.state || !old.state) return;
    const next = stepOf(g.state.meta.phase, g.briefingDone);
    if (next <= stepOf(old.state.meta.phase, old.briefingDone) || reducedMotion()) return;
    const panel = document.querySelector<HTMLElement>('.tab-panel.phase');
    if (!panel || snap.current) return;              // keep the first copy if two steps land before React redraws
    const r = panel.getBoundingClientRect();
    snap.current = { node: copyOf(panel), top: r.top, left: r.left, width: r.width, height: r.height, bar: barBottom() };
  }), []);

  // A mission opens with the card for its first step, over the sheets already in place.
  useLayoutEffect(() => {
    if (step !== 0 || reducedMotion()) return;
    titleAt.current = performance.now();
    setRun({ id: Date.now(), steps: [0], idx: 0, stage: 'hold', snap: null, bar: barBottom() });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = step;
    const s = snap.current;
    snap.current = null;
    if (step <= was || was < 0) return;
    const passed = Array.from({ length: step - was }, (_, i) => was + 1 + i);   // every step reached, in order
    setRun((r) => {
      // still covered: add the new steps to this curtain's cards rather than starting over
      if (r && r.stage !== 'out') return { ...r, steps: [...r.steps, ...passed] };
      if (!s) return r;
      return { id: Date.now(), steps: passed, idx: 0, stage: 'in', snap: s, bar: s.bar };
    });
  }, [step]);

  // Put the copy of the old page under the sheets and hold the new page on its first frame until the lift (its code
  // may still be loading meanwhile).
  useLayoutEffect(() => {
    const box = ghost.current;
    const main = box?.closest('.screen');
    if (!run || !box || !main) return;
    const s = run.snap;
    if (s) {
      s.node.style.cssText = `position:absolute;top:${s.top - s.bar}px;left:${s.left}px;width:${s.width}px;height:${s.height}px;margin:0`;
      box.setAttribute('inert', '');
      box.replaceChildren(s.node);
    }
    main.classList.add('curtain-on');
    return () => main.classList.remove('curtain-on');
  }, [run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The page under the curtain rises in when the sheets lift. The mark is set on the panel itself and never taken
  // off, so nothing restarts when the curtain goes away; a step queued later gets a new panel, so mark that too.
  useLayoutEffect(() => {
    if (run) ghost.current?.closest('.screen')?.querySelector<HTMLElement>('.tab-panel.phase')?.setAttribute('data-reveal', '');
  }, [run?.id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // the top bar's marker follows the card on screen (before paint, so it never shows a later step first)
  const shownStep = run ? run.steps[run.idx] : null;
  useLayoutEffect(() => { useShownStep.setState({ step: shownStep }); }, [shownStep]);
  useEffect(() => () => useShownStep.setState({ step: null }), []);

  // The timeline: sweep in, one card per step, lift.
  useEffect(() => {
    if (!run) return;
    const timers: number[] = [];
    let poll = 0;
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, Math.max(0, ms)));
    if (run.stage === 'in') {
      later(IN_MS, () => { titleAt.current = performance.now(); setRun((r) => r && { ...r, stage: 'hold' }); });
    } else if (run.stage === 'hold') {
      // opening a mission: the top bar may still be loading, so place the curtain under it once it shows
      if (!run.bar) {
        const find = () => { const b = barBottom(); if (b) setRun((r) => r && { ...r, bar: b }); else poll = window.setTimeout(find, 30); };
        find();
      }
      // timed from when this card appeared, so a step queued meanwhile doesn't stretch it
      later(TITLE_MS - (performance.now() - titleAt.current), () => {
        titleAt.current = performance.now();
        setRun((r) => r && (r.idx < r.steps.length - 1 ? { ...r, idx: r.idx + 1 } : { ...r, stage: 'out' }));
      });
    } else {
      later(REVEAL_MS, () => ghost.current?.closest('.screen')?.classList.remove('curtain-on'));
      later(OUT_MS, () => setRun(null));
    }
    return () => { timers.forEach((t) => window.clearTimeout(t)); window.clearTimeout(poll); };
  }, [run?.id, run?.stage, run?.idx, run?.steps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) return null;
  const n = run.steps[run.idx];
  const s = STEPS[n];
  return (
    <div className={`step-curtain is-${run.stage}${run.snap ? '' : ' opening'}`} key={run.id} aria-hidden="true" style={{ top: run.bar }}>
      <div className="sc-ghost" ref={ghost} />
      <div className="sc-sheet gold" />
      <div className="sc-sheet dark">
        {run.stage === 'hold' && (
          <div className="sc-title" key={run.idx}>
            <span className="sc-num">{String(n + 1).padStart(2, '0')}<span className="sc-of"> / {String(STEPS.length).padStart(2, '0')}</span></span>
            <span className="sc-label">{s.label}</span>
            {s.cml && <span className="sc-cml">{s.cml}</span>}
            <span className="sc-dots">{STEPS.map((_, i) => <i key={i} className={i < n ? 'done' : i === n ? 'on' : ''} />)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
