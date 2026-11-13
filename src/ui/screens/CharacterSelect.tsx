import { useCallback, useEffect, useRef, useState } from 'react';
import { play, playVoice } from '../../audio/sound';
import { hasVoice, hush, sayNow } from '../../audio/voice';
import { getCatalog } from '../../core';
import { Portrait } from '../components/common';

/** Names written family-name first: show the given name (last word) on cards and as the default player name. */
const FAMILY_NAME_FIRST = new Set(['miku', 'teto', 'neru']);
export const shortName = (c: { id: string; name: string }): string => {
  const parts = c.name.split(' ');
  return FAMILY_NAME_FIRST.has(c.id) ? parts[parts.length - 1] : parts[0];
};

/** Small "you are playing as" button shown after the character step; clicking it goes back to the character select. */
export function CrewChip({ characterId, name, onChange }: { characterId: string; name: string; onChange: () => void }) {
  const c = getCatalog().characters.find((x) => x.id === characterId);
  return (
    <button className="crew-chip" title="Change character" onClick={() => { play('sfx_click'); onChange(); }}>
      <Portrait id={characterId} expr="happy" size={40} />
      <span>{name.trim() || (c ? shortName(c) : '')}</span><span className="dim small">✎ change</span>
    </button>
  );
}

type LineKey ='success' | 'failure' | 'warning';
const FACE: Record<LineKey, 'happy' | 'neutral' | 'worried'> = { success: 'happy', warning: 'neutral', failure: 'worried' };
const OWNER = 'crew-select';

/**
 * Full-screen character select: one character at a time, ◀ ▶ arrows (or arrow keys / swipe) to browse.
 * The name sits under the portrait with a random voice line, spoken aloud when a clip exists.
 */
export function CharacterSelect({ characterId, setCharacterId, name, setName, onConfirm, onBack, confirmLabel = 'Pick a mission ▶' }: {
  characterId: string; setCharacterId: (id: string) => void; name: string; setName: (n: string) => void;
  onConfirm: () => void; onBack: () => void; confirmLabel?: string;
}) {
  const crew = getCatalog().characters.filter((c) => c.playable);
  const index = Math.max(0, crew.findIndex((c) => c.id === characterId));
  const c = crew[index];
  const [dir, setDir] = useState<'left' | 'right'>('right');
  const [line, setLine] = useState<{ id: string; key: LineKey } | null>(null);
  const lastLine = useRef<Record<string, LineKey>>({});
  const touchX = useRef<number | null>(null);

  /** Picks a random line for the character (never the same one twice in a row) and speaks it. */
  const rollLine = useCallback((id: string, speak: boolean) => {
    const ch = getCatalog().characters.find((x) => x.id === id);
    if (!ch) return;
    const keys = (Object.keys(ch.lines) as LineKey[]).filter((k) => k !== lastLine.current[id]);
    const key = keys[Math.floor(Math.random() * keys.length)];
    lastLine.current[id] = key;
    setLine({ id, key });
    if (!speak) return;
    if (hasVoice(id, ch.lines[key])) sayNow(OWNER, id, ch.lines[key]);
    else { hush(OWNER); playVoice(id); }   // Miku / Teto / Neru only have a signature voice clip
  }, []);

  useEffect(() => { rollLine(characterId, true); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => hush(OWNER), []);

  const go = useCallback((step: number) => {
    const next = crew[(index + step + crew.length) % crew.length];
    play('sfx_click');
    setDir(step > 0 ? 'right' : 'left');
    // Keep a name the player typed; otherwise follow the character.
    if (!name.trim() || name === shortName(c)) setName(shortName(next));
    setCharacterId(next.id);
    rollLine(next.id, true);
  }, [crew, index, c, name, setName, setCharacterId, rollLine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [go]);

  const shown = line && line.id === c.id ? line.key : 'success';
  const text = c.lines[shown];

  return (
    <main className="screen">
      <div className="page col crew-select">
        <div className="row between">
          <h1 style={{ margin: 0 }}>Choose your character</h1>
          <button className="btn" onClick={onBack}>◀ Back</button>
        </div>

        <section className="crew-stage" aria-roledescription="carousel" aria-label="Characters">
          <button className="btn crew-arrow" aria-label="Previous character" onClick={() => go(-1)}>◀</button>
          <div key={c.id} className={`crew-hero from-${dir}`} aria-live="polite"
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            }}>
            <Portrait id={c.id} expr={FACE[shown]} size={192} />
            <h2 className="crew-name">{c.name}</h2>
            <span className="small" style={{ color: `var(--role-${c.role})` }}>{c.title} · {c.from}</span>
            <button key={shown} className="crew-line" title="Hear another line" onClick={() => { play('sfx_click'); rollLine(c.id, true); }}>
              “{text}”
            </button>
            <span className="small dim">{c.bio}</span>
          </div>
          <button className="btn crew-arrow" aria-label="Next character" onClick={() => go(1)}>▶</button>
        </section>

        <div className="crew-dots" aria-hidden="true">
          {crew.map((x) => <span key={x.id} className={x.id === c.id ? 'on' : ''} />)}
        </div>
        <span className="small dim" style={{ textAlign: 'center' }}>{index + 1} / {crew.length}</span>

        <div className="row center wrap" style={{ gap: 12 }}>
          <label className="row" style={{ gap: 6 }}>
            <span className="muted">Your name</span>
            <input type="text" aria-label="Your name" maxLength={16} value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onConfirm(); }} style={{ width: 150 }} />
          </label>
          <button className="btn big gold" disabled={!name.trim()} onClick={() => { play('sfx_click'); onConfirm(); }}>{confirmLabel}</button>
        </div>
      </div>
    </main>
  );
}
