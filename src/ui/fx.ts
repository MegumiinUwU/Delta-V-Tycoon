// Tiny pointer effects shared by every screen, installed once. One passive listener on the page, at most one style
// write per frame, nothing at all on touch screens or with reduced motion.

/** Cards light up softly where the mouse is (motion.css `.card::before` reads --mx/--my). */
export function installCardLight(): () => void {
  let frame = 0;
  let last: { el: HTMLElement; x: number; y: number } | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('.card');
    if (!el) return;
    last = { el, x: e.clientX, y: e.clientY };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!last) return;
      const r = last.el.getBoundingClientRect();
      last.el.style.setProperty('--mx', `${last.x - r.left}px`);
      last.el.style.setProperty('--my', `${last.y - r.top}px`);
    });
  };
  document.addEventListener('pointermove', onMove, { passive: true });
  return () => { document.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame); };
}
