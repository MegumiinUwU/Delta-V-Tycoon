import { useEffect, useRef, useState } from 'react';
import { play } from '../../audio/sound';
import { decodeChallenge, getCatalog, ROLE_TITLES, ROLES, type DifficultyId, type ScenarioId } from '../../core';
import { fillEmptyRoles } from '../../net/roomApi';
import { BAD_CODE_MESSAGE, CODE_ALPHABET, normalizeCode } from '../../net/roomCodes';
import { navigate } from '../../router';
import { useGame, useIsHost } from '../../state/store';
import { Portrait, ROLE_COLOR } from '../components/common';
import { ROLE_GOALS, ROLE_OWNS } from './Council';
import { AvatarPicker, DifficultyPicker } from './SoloSetup';

const ERRORS: Record<string, string> = {
  NETWORK: "Can't reach the server. Check the Wi-Fi, or play Team Mode on one screen.",
  ROOM_NOT_FOUND: 'No room with that code.',
  ROOM_FULL: 'This crew already has 4 members.',
  BAD_CODE: BAD_CODE_MESSAGE,
};
const errText = (e: unknown) => ERRORS[e instanceof Error ? e.message : ''] ?? ERRORS.NETWORK;

export function CreateRoom() {
  const create = useGame((g) => g.createRoom);
  const [characterId, setCharacterId] = useState('nour');
  const [name, setName] = useState('Nour');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="screen"><div className="page col" style={{ gap: 16, maxWidth: 900 }}>
      <div className="row between"><h1>Create a team room</h1><button className="btn" onClick={() => navigate('/')}>◀ Back</button></div>
      <section className="panel"><AvatarPicker characterId={characterId} setCharacterId={setCharacterId} name={name} setName={setName} /></section>
      {error && <div className="panel fail" role="alert">{error} <button className="btn small" onClick={() => navigate('/solo')}>Play on one screen</button></div>}
      <button className="btn big gold" disabled={busy || !name.trim()} onClick={async () => {
        setBusy(true); setError('');
        try { await create({ name: name.trim(), characterId, scenarioId: 'nile_watch', difficulty: 'cadet' }); }
        catch (e) { setError(errText(e)); setBusy(false); }
      }}>{busy ? 'Creating room…' : 'Create room ▶'}</button>
    </div></main>
  );
}

export function Join({ code: initial }: { code?: string }) {
  const join = useGame((g) => g.joinRoom);
  const [chars, setChars] = useState<string[]>(() => (initial ?? '').toUpperCase().slice(0, 5).padEnd(5, ' ').split('').map((c) => c.trim()));
  const [characterId, setCharacterId] = useState('kwame');
  const [name, setName] = useState('Kwame');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const code = chars.join('');
  const setAt = (i: number, v: string) => {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length > 1) { // paste
      const next = (code.slice(0, i) + clean).slice(0, 5).padEnd(5, ' ').split('').map((c) => c.trim());
      setChars(next); boxes.current[Math.min(4, i + clean.length)]?.focus(); return;
    }
    const next = [...chars]; next[i] = clean; setChars(next);
    if (clean && i < 4) boxes.current[i + 1]?.focus();
  };
  const valid = normalizeCode(code);
  return (
    <main className="screen"><div className="page col" style={{ gap: 16, maxWidth: 900 }}>
      <div className="row between"><h1>Join a room</h1><button className="btn" onClick={() => navigate('/')}>◀ Back</button></div>
      <section className="panel col">
        <label htmlFor="code-0">Room code</label>
        <div className="row">
          {chars.map((c, i) => (
            <input key={i} id={`code-${i}`} ref={(el) => (boxes.current[i] = el)} type="text" inputMode="text" maxLength={5} value={c} aria-label={`Code letter ${i + 1}`}
              onChange={(e) => setAt(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Backspace' && !c && i > 0) boxes.current[i - 1]?.focus(); }}
              style={{ width: 56, height: 64, textAlign: 'center', fontFamily: 'var(--font-title)', fontSize: 24 }} />
          ))}
        </div>
        {code.length === 5 && !valid && <span className="warn">{BAD_CODE_MESSAGE}</span>}
        <span className="small dim">Letters and numbers from {CODE_ALPHABET}</span>
      </section>
      <section className="panel"><AvatarPicker characterId={characterId} setCharacterId={setCharacterId} name={name} setName={setName} /></section>
      {error && <div className="panel fail" role="alert">{error}</div>}
      <button className="btn big gold" disabled={busy || !valid || !name.trim()} onClick={async () => {
        setBusy(true); setError('');
        try { await join(valid!, { name: name.trim(), characterId }); } catch (e) { setError(errText(e)); setBusy(false); }
      }}>{busy ? 'Joining…' : 'Join ▶'}</button>
    </div></main>
  );
}

export function Lobby() {
  const room = useGame((g) => g.room)!;
  const s = useGame((g) => g.state)!;
  const isHost = useIsHost();
  const [copied, setCopied] = useState(false);
  const [challenge, setChallenge] = useState('');
  const link = `${location.origin}${location.pathname}#/join/${s.meta.code}`;
  const players = Object.values(s.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const allClaimed = ROLES.every((r) => s.roles[r]);
  const chars = getCatalog().characters;
  return (
    <div className="page workshop" style={{ gridTemplateColumns: '280px 1fr 300px' }}>
      <section className="panel col">
        <span className="dim">Room code</span>
        <span style={{ fontFamily: 'var(--font-title)', fontSize: 24 }} className="gold">{s.meta.code}</span>
        <button className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { prompt('Invite link:', link); } }}>
          {copied ? '✓ Invite link copied' : 'Copy invite link'}</button>
        <h3>Crew ({players.filter((p) => p.connected).length}/4)</h3>
        {players.map((p) => (
          <div key={p.uid} className="row" style={{ opacity: p.connected ? 1 : 0.4 }}>
            <Portrait id={p.characterId} size={40} />
            <span>{p.name}{p.uid === s.meta.hostUid && ' ♛'}{p.uid === room.myUid && ' (you)'}</span>
            <span className={p.connected ? 'pass' : 'fail'}>{p.connected ? '● online' : '○ away'}</span>
          </div>
        ))}
      </section>
      <section className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', alignContent: 'start' }}>
        {ROLES.map((r) => {
          const holder = s.roles[r] ? s.players[s.roles[r]!] : null;
          const mine = s.roles[r] === room.myUid;
          const art = holder?.characterId ?? chars.find((c) => c.role === r)!.id;
          return (
            <div key={r} className="panel dark col" style={{ borderColor: ROLE_COLOR[r] }}>
              <div className="row"><Portrait id={art} size={48} expr={holder ? 'happy' : 'neutral'} /><span className="title" style={{ margin: 0, color: ROLE_COLOR[r] }}>{ROLE_TITLES[r]}</span></div>
              <span className="small">Controls: {ROLE_OWNS[r]}</span>
              <span className="small muted">Goal: {ROLE_GOALS[r]}</span>
              {holder ? (
                <div className="row between"><span>{holder.name}</span>
                  {(mine || isHost) && <button className="btn small" onClick={() => room.releaseRole(r)}>Release</button>}</div>
              ) : <button className="btn primary" onClick={async () => { play('sfx_click'); if (!(await room.claimRole(r))) useGame.getState().toast('Someone claimed it first.', 'warn'); }}>Claim</button>}
            </div>
          );
        })}
      </section>
      <section className="panel col">
        {isHost ? (
          <>
            <h3>Mission (host)</h3>
            <select value={s.meta.scenarioId} onChange={(e) => room.setMeta({ scenarioId: e.target.value as ScenarioId })} aria-label="Scenario">
              {getCatalog().scenarios.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <DifficultyPicker value={s.meta.difficulty} onChange={(d: DifficultyId) => room.setMeta({ difficulty: d })} />
            <label className="col small">Challenge code
              <input type="text" value={challenge} onChange={(e) => {
                setChallenge(e.target.value);
                const c = decodeChallenge(e.target.value.trim());
                if (c) room.setMeta({ scenarioId: c.scenarioId, difficulty: c.difficulty, seed: c.seed });
              }} />
            </label>
            <label className="col small">Team name <input type="text" maxLength={24} value={s.meta.teamName} onChange={(e) => room.setMeta({ teamName: e.target.value })} /></label>
            <button className="btn" onClick={() => fillEmptyRoles(room)}>Fill empty roles with me</button>
            <button className="btn big gold" disabled={!allClaimed} onClick={() => room.setMeta({ phase: 'council' })}>Start ▶</button>
            {!allClaimed && <span className="small dim">Every role needs a holder (one player may hold several).</span>}
          </>
        ) : (
          <><h3>{getCatalog().scenarios.find((x) => x.id === s.meta.scenarioId)?.name}</h3><p className="muted">Waiting for the host…</p></>
        )}
      </section>
    </div>
  );
}

export function ChatDrawer() {
  const open = useGame((g) => g.chatOpen);
  const s = useGame((g) => g.state);
  const room = useGame((g) => g.room);
  const set = useGame((g) => g.set);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && s) { set({ chatSeen: s.chat.length }); end.current?.scrollIntoView(); } }, [open, s?.chat.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !s || !room) return null;
  return (
    <aside className="drawer left" role="dialog" aria-label="Crew chat" style={{ width: 'min(380px, 100vw)', display: 'flex', flexDirection: 'column' }}>
      <div className="row between"><h2>Crew chat</h2><button className="btn small" onClick={() => set({ chatOpen: false })}>Close</button></div>
      <div className="col grow" style={{ overflow: 'auto' }}>
        {s.chat.map((m) => {
          const p = s.players[m.uid];
          return <div key={m.id} className="row" style={{ alignItems: 'flex-start' }}>{p && <Portrait id={p.characterId} size={24} />}<span><span className="gold">{m.name}:</span> {m.text}</span></div>;
        })}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); room.sendChat(text); setText(''); }}>
        <input type="text" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" className="grow" />
        <button className="btn primary" disabled={!text.trim()}>Send</button>
      </form>
    </aside>
  );
}
