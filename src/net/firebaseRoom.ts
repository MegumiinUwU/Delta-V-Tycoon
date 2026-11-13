// Online RoomApi on Firebase Realtime Database (Part A §A13, Part B Step 7). Loaded lazily via roomApi.ts.
import {
  get, onDisconnect, onValue, push, ref, runTransaction, serverTimestamp, set, update, type Unsubscribe,
} from 'firebase/database';
import { DEFAULT_SPLIT } from '../core/budgets';
import { defaultDesign } from '../core/design';
import { newSeed } from '../core/rng';
import type { BudgetSplit, Design, Role } from '../core/types';
import { ROLES } from '../core/types';
import { db, ensureSignedIn } from './firebase';
import { budgetOf, moveSplit } from './localRoom';
import type { ChatMessage, FundsRequest, MetaPatch, PlayerState, RoomApi, RoomMeta, RoomOpts, RoomState } from './roomApi';
import { makeCode, normalizeCode } from './roomCodes';

const HOST_TIMEOUT_MS = 30000;
const HOST_CHECK_MS = 5000;
const allFalse = (): Record<Role, boolean> => ({ planner: false, engineer: false, science: false, comms: false });

/** Maps any SDK failure to the error codes B's UI knows. */
async function net<T>(p: Promise<T>): Promise<T> {
  try { return await p; } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'ROOM_NOT_FOUND' || msg === 'ROOM_FULL' || msg === 'BAD_CODE') throw e;
    console.warn('[room] firebase error', e);
    throw new Error('NETWORK');
  }
}

/** Raw RTDB value → full RoomState with defaults (missing arrays → [], requests/chat → sorted arrays). */
export function toRoomState(raw: any, fallbackDesign: Design): RoomState {
  const meta = raw?.meta as RoomMeta;
  const d = raw?.design ?? {};
  const design: Design = {
    planner: { ...fallbackDesign.planner, ...(d.planner ?? {}) },
    engineer: { ...fallbackDesign.engineer, ...(d.engineer ?? {}) },
    // RTDB drops empty arrays, so once a design exists a missing instrument list means "no instruments".
    science: { instrumentIds: Array.isArray(d.science?.instrumentIds) ? [...d.science.instrumentIds]
      : d.science?.instrumentIds ? Object.values(d.science.instrumentIds) as string[]
      : raw?.design ? [] : [...fallbackDesign.science.instrumentIds] },
    comms: { ...fallbackDesign.comms, ...(d.comms ?? {}) },
  };
  const roles = { planner: null, engineer: null, science: null, comms: null } as Record<Role, string | null>;
  for (const r of ROLES) roles[r] = raw?.roles?.[r] ?? null;
  const signoffs = allFalse();
  for (const r of ROLES) signoffs[r] = !!raw?.signoffs?.[r];
  const requests: FundsRequest[] = Object.entries(raw?.requests ?? {})
    .map(([id, v]: [string, any]) => ({ ...v, id })).sort((a, b) => a.createdAt - b.createdAt);
  const chat: ChatMessage[] = Object.entries(raw?.chat ?? {})
    .map(([id, v]: [string, any]) => ({ ...v, id })).sort((a, b) => a.at - b.at).slice(-50);
  const decisions: RoomState['decisions'] = {};
  for (const [k, v] of Object.entries(raw?.decisions ?? {})) if (v) decisions[Number(k)] = v as any;
  const suggestions: RoomState['suggestions'] = {};
  for (const [k, v] of Object.entries(raw?.suggestions ?? {})) if (v) suggestions[Number(k)] = { ...(v as any) };
  return {
    meta, players: { ...(raw?.players ?? {}) }, roles,
    council: { split: { ...DEFAULT_SPLIT, ...(raw?.council?.split ?? {}) }, agreed: { ...(raw?.council?.agreed ?? {}) } },
    requests, design, signoffs, reviewDone: !!raw?.reviewDone, decisions, suggestions, chat, result: raw?.result ?? null,
  };
}

function connect(code: string, uid: string, first: RoomState): Promise<RoomApi> {
  const roomRef = ref(db, `rooms/${code}`);
  const playerRef = ref(db, `rooms/${code}/players/${uid}`);
  const subs = new Set<(s: RoomState) => void>();
  const unsubs: Unsubscribe[] = [];
  let state = first;
  let migrating = false;
  let clockOffset = 0;   // server time − this device's clock (lastSeen is a server timestamp)
  let hostTimer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearInterval(hostTimer);
    for (const u of unsubs) u();
    unsubs.length = 0;
  };

  // Presence
  unsubs.push(onValue(ref(db, '.info/serverTimeOffset'), (snap) => { clockOffset = Number(snap.val()) || 0; }));
  unsubs.push(onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val()) {
      onDisconnect(playerRef).update({ connected: false, lastSeen: serverTimestamp() });
      update(playerRef, { connected: true, lastSeen: serverTimestamp() }).catch(() => {});
    }
  }));

  // Host migration (P1): earliest-joined connected player takes over after 30 s.
  const checkHost = (s: RoomState) => {
    const host = s.players[s.meta.hostUid];
    if (!host || host.connected !== false || migrating) return;
    if (Date.now() + clockOffset - (host.lastSeen ?? 0) <= HOST_TIMEOUT_MS) return;
    const next = Object.values(s.players).filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next?.uid !== uid) return;
    migrating = true;
    const oldHost = s.meta.hostUid;
    runTransaction(ref(db, `rooms/${code}/meta/hostUid`), (cur) => (cur === oldHost ? uid : undefined))
      .catch(() => {}).finally(() => { migrating = false; });
  };
  // The room goes quiet when the host drops, so no data change would ever re-run the check: poll it.
  hostTimer = setInterval(() => checkHost(state), HOST_CHECK_MS);

  const path = (p: string) => ref(db, `rooms/${code}/${p}`);
  // Built before the room listener is attached: that listener can fire during the onValue() call itself when the
  // data is already cached, and it hands `api` to the caller.
  const api: RoomApi = {
    mode: 'online',
    myUid: uid,
    subscribe(cb) { subs.add(cb); cb(state); return () => { subs.delete(cb); }; },
    getState: () => state,
    async setMeta(patch: MetaPatch) {
      const paths: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) paths[`meta/${k}`] = v;
      // Lobby: the room was created with one mission's starter design; a different mission or difficulty needs its own.
      const scenarioId = patch.scenarioId ?? state.meta.scenarioId;
      const difficulty = patch.difficulty ?? state.meta.difficulty;
      if (state.meta.phase === 'lobby' && (scenarioId !== state.meta.scenarioId || difficulty !== state.meta.difficulty)) {
        const starter = defaultDesign(scenarioId, difficulty);
        for (const r of ROLES) paths[`design/${r}`] = starter[r];
      }
      await net(update(roomRef, paths));
    },
    updateMe: (patch) => net(update(playerRef, patch)),
    async claimRole(role) {
      const r = await net(runTransaction(path(`roles/${role}`), (cur) => (cur === null || cur === uid ? uid : undefined)));
      return r.committed;
    },
    releaseRole: (role) => net(set(path(`roles/${role}`), null)),
    setSplit: (split: BudgetSplit) => net(update(roomRef, { 'council/split': split, 'council/agreed': null })),
    setAgreed: (agreed) => net(set(path(`council/agreed/${uid}`), agreed ? true : null)),
    async requestFunds(fromRole, toRole, amountM, reason) {
      const r = push(path('requests'));
      await net(set(r, { id: r.key, fromRole, toRole, amountM, reason: reason.slice(0, 120), status: 'pending', createdAt: Date.now() }));
    },
    async answerRequest(id, accept) {
      const req = state.requests.find((x) => x.id === id);
      if (!req || req.status !== 'pending') return;
      if (state.roles[req.toRole] !== uid) throw new Error('NOT_OWNER');
      if (accept) {
        const points = (req.amountM / budgetOf(state)) * 100;
        await net(runTransaction(path('council/split'), (cur: BudgetSplit | null) =>
          moveSplit({ ...DEFAULT_SPLIT, ...(cur ?? {}) }, req.toRole, req.fromRole, points)));
      }
      await net(update(path(`requests/${id}`), { status: accept ? 'accepted' : 'declined' }));
    },
    async updateDesign<R extends Role>(role: R, patch: Partial<Design[R]>) {
      const paths: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) paths[`design/${role}/${k}`] = Array.isArray(v) ? [...v] : v;
      for (const r of ROLES) paths[`signoffs/${r}`] = false;
      paths.reviewDone = false;
      await net(update(roomRef, paths));
    },
    setSignoff: (role, value) => net(set(path(`signoffs/${role}`), value)),
    setReviewDone: (value) => net(set(path('reviewDone'), value)),
    async submitDecision(eventIndex, optionId) {
      await net(runTransaction(path(`decisions/${eventIndex}`),
        (cur) => (cur === null ? { optionId, byUid: uid, at: Date.now() } : undefined)));
    },
    suggest: (eventIndex, optionId) => net(set(path(`suggestions/${eventIndex}/${uid}`), optionId)),
    async sendChat(text) {
      const t = text.trim().slice(0, 200);
      if (!t) return;
      const r = push(path('chat'));
      await net(set(r, { uid, name: state.players[uid]?.name ?? '?', text: t, at: Date.now() }));
    },
    setResult: (r) => net(set(path('result'), r)),
    async leave() {
      stop();
      subs.clear();
      await onDisconnect(playerRef).cancel().catch(() => {});
      await update(playerRef, { connected: false, lastSeen: serverTimestamp() }).catch(() => {});
    },
  };

  return new Promise((resolve, reject) => {
    let resolved = false;
    unsubs.push(onValue(roomRef, (snap) => {
      const raw = snap.val();
      if (!raw?.meta) return;
      state = toRoomState(raw, state.design);
      for (const cb of [...subs]) cb(state);
      checkHost(state);
      if (!resolved) { resolved = true; resolve(api); }
    }, (err) => {
      console.warn('[room] listener', err);
      if (!resolved) { resolved = true; stop(); reject(new Error('NETWORK')); }
    }));
  });
}

export async function createOnlineRoomImpl(opts: RoomOpts): Promise<RoomApi> {
  const uid = await net(ensureSignedIn());
  const now = Date.now();
  let code: string | null = null;
  const seed = opts.seed ?? newSeed();
  for (let i = 0; i < 5 && !code; i++) {
    const c = makeCode();
    const meta: RoomMeta = { code: c, hostUid: uid, createdAt: now, scenarioId: opts.scenarioId, difficulty: opts.difficulty,
      seed, phase: 'lobby', teamName: opts.name, version: 1 };
    const r = await net(runTransaction(ref(db, `rooms/${c}/meta`), (cur) => (cur === null ? meta : undefined)));
    if (r.committed) code = c;
  }
  if (!code) throw new Error('NETWORK');
  const player: PlayerState = { uid, name: opts.name, characterId: opts.characterId, connected: true, joinedAt: now, lastSeen: now };
  // Order matters for the security rules: meta → players/{uid} → design/* (host may write only while missing) → the rest.
  await net(set(ref(db, `rooms/${code}/players/${uid}`), player));
  const design = defaultDesign(opts.scenarioId, opts.difficulty);
  await net(update(ref(db, `rooms/${code}`), {
    'design/planner': design.planner, 'design/engineer': design.engineer, 'design/science': design.science, 'design/comms': design.comms,
  }));
  await net(update(ref(db, `rooms/${code}`), {
    'council/split': DEFAULT_SPLIT, signoffs: allFalse(), reviewDone: false,
  }));
  const first: RoomState = {
    meta: { code, hostUid: uid, createdAt: now, scenarioId: opts.scenarioId, difficulty: opts.difficulty, seed, phase: 'lobby',
      teamName: opts.name, version: 1 },
    players: { [uid]: player }, roles: { planner: null, engineer: null, science: null, comms: null },
    council: { split: { ...DEFAULT_SPLIT }, agreed: {} }, requests: [], design, signoffs: allFalse(), reviewDone: false,
    decisions: {}, suggestions: {}, chat: [], result: null,
  };
  return connect(code, uid, first);
}

export async function joinOnlineRoomImpl(rawCode: string, opts: { name: string; characterId: string }): Promise<RoomApi> {
  const code = normalizeCode(rawCode);
  if (!code) throw new Error('BAD_CODE');
  const uid = await net(ensureSignedIn());
  const metaSnap = await net(get(ref(db, `rooms/${code}/meta`)));
  if (!metaSnap.exists()) throw new Error('ROOM_NOT_FOUND');
  const playersSnap = await net(get(ref(db, `rooms/${code}/players`)));
  const players = (playersSnap.val() ?? {}) as Record<string, PlayerState>;
  const connectedCount = Object.values(players).filter((p) => p.connected).length;
  if (connectedCount >= 4 && !players[uid]) throw new Error('ROOM_FULL');
  const now = Date.now();
  const me: PlayerState = { uid, name: opts.name, characterId: opts.characterId, connected: true,
    joinedAt: players[uid]?.joinedAt ?? now, lastSeen: now };
  await net(set(ref(db, `rooms/${code}/players/${uid}`), me));
  const meta = metaSnap.val() as RoomMeta;
  const first = toRoomState({ meta, players: { ...players, [uid]: me } }, defaultDesign(meta.scenarioId, meta.difficulty));
  return connect(code, uid, first);
}
