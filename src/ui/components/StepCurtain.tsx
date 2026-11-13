// Full-page step change, after ol.mr's page transitions: when a mission step finishes, a gold sheet and then a dark
// sheet sweep up over the page you just finished, the next step's number and name rise in the middle, and the
// sheets lift away to show the new page. Two fixed layers and transform/opacity keyframes only; while idle nothing
// is mounted and nothing runs. Reduced motion skips it (the plain tab slide still plays).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../../state/store';
import { STEPS, stepOf } from '../steps';

const TOTAL_MS = 1350;   // matches the keyframes in motion.css (.step-curtain)
const LIFT_MS = 800;     // the sheets start to lift: the new page plays its own entrance from here

const reducedMotion = () => document.documentElement.classList.contains('reduced-motion')
  || matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Snapshot { node: HTMLElement; top: number; left: number; width: number; height: number }

/** The sheets cover the page under the top bar, so you can watch the step marker glide along while they pass. */
const barBottom = () => Math.max(0, document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0);

export function StepCurtain() {
  const step = useGame((g) => (g.state ? stepOf(g.state.meta.phase, g.briefingDone) : -1));
  const snap = useRef<Snapshot | null>(null);
  const prev = useRef(step);
  const [run, setRun] = useState<{ step: number; id: number } | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);

  // The store tells its listeners about a change before React redraws, so the page on screen is still the step you
  // just finished: copy it now, to keep showing it while the first sheet covers it.
  useEffect(() => useGame.subscribe((g, old) => {
    if (!g.state || !old.state) return;
    const next = stepOf(g.state.meta.phase, g.briefingDone);
    if (next <= stepOf(old.state.meta.phase, old.briefingDone) || reducedMotion()) return;
    const panel = document.querySelector<HTMLElement>('.tab-panel.phase');
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const node = panel.cloneNode(true) as HTMLElement;
    node.classList.remove('tab-panel');               // no entrance animation on the copy
    snap.current = { node, top: r.top, left: r.left, width: r.width, height: r.height };
  }), []);

  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = step;
    if (step <= was || was < 0 || !snap.current) { snap.current = null; return; }
    setTop(barBottom());
    setRun({ step, id: Date.now() });
  }, [step]);

  // put the copy of the old page under the sheets
  useLayoutEffect(() => {
    const s = snap.current;
    const box = ghost.current;
    if (!run || !s || !box) return;
    s.node.style.cssText = `position:absolute;top:${s.top - top}px;left:${s.left}px;width:${s.width}px;height:${s.height}px;margin:0`;
    box.setAttribute('inert', '');
    box.replaceChildren(s.node);
  }, [run, top]);

  // the new page waits, paused on its first frame, until the sheets lift (it may still be loading when they start)
  useLayoutEffect(() => {
    const main = ghost.current?.closest('.screen');
    if (!run || !main) { snap.current = null; return; }
    main.classList.add('curtain-on');
    const lift = window.setTimeout(() => main.classList.remove('curtain-on'), LIFT_MS);
    const end = window.setTimeout(() => setRun(null), TOTAL_MS);
    return () => { window.clearTimeout(lift); window.clearTimeout(end); main.classList.remove('curtain-on'); };
  }, [run]);

  if (!run) return null;
  const s = STEPS[run.step];
  return (
    <div className="step-curtain" key={run.id} aria-hidden="true" style={{ top }}>
      <div className="sc-ghost" ref={ghost} />
      <div className="sc-sheet gold" />
      <div className="sc-sheet dark">
        <div className="sc-title">
          <span className="sc-num">{String(run.step + 1).padStart(2, '0')}<span className="sc-of"> / {String(STEPS.length).padStart(2, '0')}</span></span>
          <span className="sc-label">{s.label}</span>
          {s.cml && <span className="sc-cml">{s.cml}</span>}
          <span className="sc-dots">{STEPS.map((_, i) => <i key={i} className={i < run.step ? 'done' : i === run.step ? 'on' : ''} />)}</span>
        </div>
      </div>
    </div>
  );
}
