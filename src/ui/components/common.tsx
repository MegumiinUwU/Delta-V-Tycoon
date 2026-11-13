import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { icon, idleSprite, portrait, type Expr } from '../../assets';
import { play } from '../../audio/sound';
import { useVoice } from '../../audio/voice';
import { getCatalog, type DialogLine, type Role, type Severity } from '../../core';
import { navigate } from '../../router';
import { useDiscoveries } from '../../state/discoveries';
import { useGame } from '../../state/store';

export const ROLE_COLOR: Record<Role, string> = {
  planner: 'var(--role-planner)', engineer: 'var(--role-engineer)', science: 'var(--role-science)', comms: 'var(--role-comms)',
};
export const ROLE_SHORT: Record<Role, string> = { planner: 'Commander', engineer: 'Engineer', science: 'Science', comms: 'Comms' };

export function Portrait({ id, expr = 'neutral', size = 64, title }: { id: string; expr?: Expr; size?: number; title?: string }) {
  const name = title ?? getCatalog().characters.find((c) => c.id === id)?.name ?? id;
  return <img className="portrait" src={portrait(id, expr)} width={size} height={size} alt={`${name} (${expr})`} />;
}

export function Icon({ id, size = 32, alt = '' }: { id: string; size?: number; alt?: string }) {
  return <img src={icon(id)} width={size} height={size} alt={alt} style={{ verticalAlign: 'middle' }} />;
}

export function Status({ s }: { s: Severity }) {
  const label = s === 'pass' ? 'GO' : s === 'warn' ? 'warning' : 'NO-GO';
  return <span className={`st ${s}`} role="img" aria-label={label} title={label} />;
}

/** Animated 4-frame idle sprite (32×48 frames). */
export function IdleSprite({ id, scale = 2, frames = 4, fps = 6 }: { id: string; scale?: number; frames?: number; fps?: number }) {
  const reduced = useGame((g) => g.settings.reducedMotion);
  const [f, setF] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setF((x) => (x + 1) % frames), 1000 / fps);
    return () => clearInterval(t);
  }, [reduced, frames, fps]);
  return (
    <div role="img" aria-label={id} style={{ width: 32 * scale, height: 48 * scale, backgroundImage: `url(${idleSprite(id)})`,
      backgroundSize: `${32 * frames * scale}px ${48 * scale}px`, backgroundPosition: `-${f * 32 * scale}px 0`, imageRendering: 'pixelated' }} />
  );
}

/** A glossary term: dotted underline, hover shows the short text, click opens the Academy drawer. */
export function Term({ id, children }: { id: string; children: ReactNode }) {
  const g = getCatalog().glossary.find((x) => x.id === id);
  const setGame = useGame((s) => s.set);
  if (!g) return <>{children}</>;
  return (
    <span className="term" title={g.short} tabIndex={0} role="button"
      onClick={(e) => { e.stopPropagation(); setGame({ glossaryId: id }); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGame({ glossaryId: id }); } }}>
      {children}
    </span>
  );
}
export function Help({ id }: { id: string }) {
  const setGame = useGame((s) => s.set);
  const g = getCatalog().glossary.find((x) => x.id === id);
  return (
    <button className="iconbtn" aria-label={`Explain ${g?.term ?? id}`} title={g?.short}
      onClick={(e) => { e.stopPropagation(); setGame({ glossaryId: id }); }}>?</button>
  );
}

/** Typewriter text; click to finish instantly. */
export function Typewriter({ text, cps = 45 }: { text: string; cps?: number }) {
  const reduced = useGame((g) => g.settings.reducedMotion);
  const [n, setN] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) { setN(text.length); return; }
    setN(0);
    const t = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(t); return x; } return x + 2; }), 2000 / cps);
    return () => clearInterval(t);
  }, [text, cps, reduced]);
  return <span onClick={() => setN(text.length)}>{text.slice(0, n)}{n < text.length && <span aria-hidden>▌</span>}</span>;
}

/** Small speaker button: speaks a character's line (automatically too, unless `auto` is false). Hidden when there is no clip. */
export function VoiceLine({ speaker, text, auto = true, onceKey }: { speaker: string; text: string; auto?: boolean; onceKey?: string }) {
  const on = useGame((g) => g.settings.voices && !g.settings.muted);
  const v = useVoice(speaker, text, { auto, onceKey });
  if (!v.has || !on) return null;
  return (
    <button className={`iconbtn voice${v.speaking ? ' on' : ''}`} aria-label="Hear this line" title="Hear this line"
      onClick={(e) => { e.stopPropagation(); v.replay(); }}>{v.speaking ? '🔊' : '🔈'}</button>
  );
}

/** A character's line, spoken aloud when it appears. `voiceOnce`: do not repeat the same line under that key. */
export function Speech({ speaker, expr = 'neutral', text, typewriter = true, size = 64, voiceOnce }:
  { speaker: string; expr?: Expr; text: string; typewriter?: boolean; size?: number; voiceOnce?: string }) {
  const who = getCatalog().characters.find((c) => c.id === speaker);
  return (
    <div className="speech">
      <Portrait id={speaker} expr={expr} size={size} />
      <div className="bubble">
        <div className="who">{who?.name ?? speaker}{who?.title ? ` · ${who.title}` : ''}<VoiceLine speaker={speaker} text={text} onceKey={voiceOnce} /></div>
        <div aria-live="polite">{typewriter ? <Typewriter text={text} /> : text}</div>
      </div>
    </div>
  );
}

/** Steps through dialog lines (click Next). */
export function Dialog({ lines, onDone, doneLabel = 'Continue', fill: vars }: { lines: DialogLine[]; onDone?: () => void; doneLabel?: string; fill?: Record<string, string> }) {
  const [i, setI] = useState(0);
  const line = lines[Math.min(i, lines.length - 1)];
  if (!line) return null;
  const text = vars ? line.text.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m) : line.text;
  const last = i >= lines.length - 1;
  return (
    <div className="col">
      <Speech speaker={line.speaker} expr={line.expr} text={text} />
      <div className="row between">
        <span className="dim small">{i + 1} / {lines.length}</span>
        <div className="row">
          {i > 0 && <button className="btn small" onClick={() => setI(i - 1)}>Back</button>}
          {!last && <button className="btn small primary" onClick={() => { play('sfx_click'); setI(i + 1); }}>Next ▶</button>}
          {last && onDone && <button className="btn small primary" onClick={() => { play('sfx_click'); onDone(); }}>{doneLabel}</button>}
        </div>
      </div>
    </div>
  );
}

const ACTIVE = ['[aria-pressed=true]', '[aria-current=step]'];

/**
 * A highlight that glides to the active item of its parent (the child with aria-pressed=true or aria-current=step),
 * like ol.mr's tab pill. Put it inside a .seg toggle or the .stepper. It is one absolutely placed element that moves
 * with a transform transition (no animation library). `bar` makes it a 3 px underline instead of a full pill.
 */
export function SlideMarker({ bar }: { bar?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const place = useCallback(() => {
    const m = ref.current, parent = m?.parentElement;
    if (!m || !parent) return;
    const on = parent.querySelector<HTMLElement>(ACTIVE.map((a) => `:scope > ${a}`).join(','));
    if (!on) { m.style.opacity = '0'; return; }
    const h = bar ? 3 : on.offsetHeight;
    m.style.width = `${on.offsetWidth}px`;
    m.style.height = `${h}px`;
    m.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop + on.offsetHeight - h}px)`;
    m.style.opacity = '1';
    if (!placed.current) {                       // first placement: jump there, don't slide in from the corner
      placed.current = true;
      m.style.transition = 'none';
      void m.offsetWidth;
      m.style.transition = '';
    }
  }, [bar]);
  useLayoutEffect(place);                        // after every render of the owner (selection may have changed)
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place());  // fonts loading, wrapping, text scale
    ro.observe(parent);
    Array.from(parent.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [place]);
  return <span ref={ref} className={bar ? 'slide-marker bar' : 'slide-marker'} aria-hidden />;
}

/** Inline style for a range input so its gold "filled" part matches the value. */
export const rangeFill = (value: number, min: number, max: number): CSSProperties =>
  ({ '--p': `${max > min ? ((value - min) / (max - min)) * 100 : 0}%` } as CSSProperties);

export function Modal({ children, onClose, label, wide }: { children: ReactNode; onClose?: () => void; label: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Esc / backdrop: play the short close animation first (skipped with reduced motion), then close.
  const requestClose = useCallback(() => {
    const close = closeRef.current;
    if (!close) return;
    const reduced = document.documentElement.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { close(); return; }
    setClosing(true);
    setTimeout(() => closeRef.current?.(), 150);
  }, []);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href], input, select, [tabindex]')?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); prev?.focus?.(); };
  }, [requestClose]);
  return (
    <div className={`overlay${closing ? ' closing' : ''}`} onClick={onClose && !closing ? requestClose : undefined} role="presentation">
      <div ref={ref} className="panel modal" style={wide ? { maxWidth: 1000 } : undefined} role="dialog" aria-modal="true" aria-label={label}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useGame((g) => g.toasts);
  const dismiss = useGame((g) => g.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <div className="row between">
            <span>{t.text}</span>
            <button className="iconbtn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>✕</button>
          </div>
          {t.action && (
            <div className="row" style={{ marginTop: 4 }}>
              {t.action.map((a) => <button key={a.label} className="btn small" onClick={() => { a.run(); dismiss(t.id); }}>{a.label}</button>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function GlossaryCard({ id, onOpen }: { id: string; onOpen?: (id: string) => void }) {
  const g = getCatalog().glossary.find((x) => x.id === id);
  if (!g) return <p className="dim">No glossary entry "{id}".</p>;
  const all = getCatalog().glossary;
  const found = useDiscoveries();
  return (
    <article className="panel dark col" id={`g-${g.id}`}>
      <h3 className="gold">{g.term} <span className="chip">{g.category}</span>
        {found.has(g.id) && <span className="chip pass" title="You met this concept in a mission">✓ discovered</span>}</h3>
      <p><strong>{g.short}</strong></p>
      <p className="muted">{g.long}</p>
      {g.example && <p className="small"><span className="gold">Example: </span>{g.example}</p>}
      {g.related?.length > 0 && (
        <div className="row wrap small">
          <span className="dim">Related:</span>
          {g.related.map((r) => {
            const t = all.find((x) => x.id === r);
            return t ? <button key={r} className="btn small ghost" onClick={() => onOpen?.(r)}>{found.has(r) ? '✓ ' : ''}{t.term}</button> : null;
          })}
        </div>
      )}
    </article>
  );
}

export function GlossaryDrawer() {
  const id = useGame((g) => g.glossaryId);
  const set = useGame((g) => g.set);
  useEffect(() => {
    if (!id) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') set({ glossaryId: null }); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [id, set]);
  if (!id) return null;
  return (
    <aside className="drawer" role="dialog" aria-label="Mission Academy">
      <div className="row between">
        <h2>Mission Academy</h2>
        <button className="btn small" onClick={() => set({ glossaryId: null })}>Close</button>
      </div>
      <GlossaryCard id={id} onOpen={(r) => set({ glossaryId: r })} />
      <p className="small dim" style={{ marginTop: 8 }}>
        <a href="#/academy" onClick={() => set({ glossaryId: null })}>Open the full Academy</a>
      </p>
    </aside>
  );
}

export function Stars({ n, size = 32 }: { n: number; size?: number }) {
  return (
    <span className="row" role="img" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => <Icon key={i} id={i < n ? 'ui_star_full' : 'ui_star_empty'} size={size} />)}
    </span>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="overlay">
        <div className="panel modal col">
          <h2 className="fail">Houston, we have a problem</h2>
          <p>Something broke in the game. Take a screenshot for the QA team, then go back to the title screen.</p>
          <pre className="panel dark small" style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error?.stack ?? this.state.error)}</pre>
          <button className="btn primary" onClick={() => { this.setState({ error: null }); navigate('/'); location.reload(); }}>Back to title</button>
        </div>
      </div>
    );
  }
}

export function Loading({ label = 'Loading crew…', progress }: { label?: string; progress: number }) {
  return (
    <div className="screen center col" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <h2>{label}</h2>
      <div style={{ width: 320, height: 16, border: '2px solid var(--border)' }}>
        <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--gold)' }} />
      </div>
    </div>
  );
}

/** Compact icon + value chips: replaces long key/value tables on cards. Full numbers go in the card tooltip. */
export function Stats({ items }: { items: ([string, ReactNode] | false | null | undefined)[] }) {
  return (
    <span className="stats">
      {items.filter(Boolean).map((it, i) => {
        const [id, v] = it as [string, ReactNode];
        return <span key={i} className="stat"><img src={icon(id)} width={16} height={16} alt="" />{v}</span>;
      })}
    </span>
  );
}
