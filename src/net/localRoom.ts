// In-memory RoomApi for solo and same-screen play. Same behaviour rules as the online room.
import { DEFAULT_SPLIT } from '../core/budgets';
import { getDifficulty, getScenario } from '../core/catalog';
import { defaultDesign } from '../core/design';
import { newSeed } from '../core/rng';
import type { BudgetSplit, Design, Role } from '../core/types';
import type { FundsRequest, MetaPatch, RoomApi, RoomOpts, RoomState } from './roomApi';

export const LOCAL_UID = 'local';
const allFalse = (): Record<Role, boolean> => ({ planner: false, engineer: false, science: false, comms: false });

/** Moves `points` of split from `from` to `to`, never letting a role go below 0. */
export function moveSplit(split: BudgetSplit, from: Role, to: Role, points: number): BudgetSplit {
  const moved = Math.max(0, Math.min(points, split[from]));
  return { ...split, [from]: split[from] - moved, [to]: split[to] + moved };
}

export function initialRoomState(uid: string, opts: RoomOpts, code: string | null, now: number): RoomState {
  return {
    meta: { code, hostUid: uid, createdAt: now, scenarioId: opts.scenarioId, difficulty: opts.difficulty,
      seed: opts.seed ?? newSeed(), phase: 'council', teamName: opts.name, version: 1 },
    players: { [uid]: { uid, name: opts.name, characterId: opts.characterId, connected: true, joinedAt: now, lastSeen: now } },
    roles: { planner: uid, engineer: uid, science: uid, comms: uid },
    council: { split: { ...DEFAULT_SPLIT }, agreed: {} },
    requests: [],
    design: defaultDesign(opts.scenarioId, opts.difficulty),
    signoffs: allFalse(), reviewDone: false, decisions: {}, suggestions: {}, chat: [], result: null,
  };
}

export function createLocalRoom(opts: RoomOpts): RoomApi {
  const uid = LOCAL_UID;
  let state = initialRoomState(uid, opts, null, Date.now());
  const subs = new Set<(s: RoomState) => void>();
  let reqCounter = 0, chatCounter = 0;
  const set = (next: RoomState) => { state = next; for (const cb of [...subs]) cb(state); };

  const api: RoomApi = {
    mode: 'local',
    myUid: uid,
    subscribe(cb) { subs.add(cb); cb(state); return () => { subs.delete(cb); }; },
    getState: () => state,
    async setMeta(patch: MetaPatch) { set({ ...state, meta: { ...state.meta, ...patch } }); },
    async updateMe(patch) {
      const me = state.players[uid];
      set({ ...state, players: { ...state.players, [uid]: { ...me, ...patch } } });
    },
    async claimRole(role) {
      if (state.roles[role] !== null && state.roles[role] !== uid) return false;
      set({ ...state, roles: { ...state.roles, [role]: uid } });
      return true;
    },
    async releaseRole(role) { set({ ...state, roles: { ...state.roles, [role]: null } }); },
    async setSplit(split) { set({ ...state, council: { split: { ...split }, agreed: {} } }); },
    async setAgreed(agreed) {
      const a = { ...state.council.agreed };
      if (agreed) a[uid] = true; else delete a[uid];
      set({ ...state, council: { ...state.council, agreed: a } });
    },
    async requestFunds(fromRole, toRole, amountM, reason) {
      const r: FundsRequest = { id: `r${++reqCounter}`, fromRole, toRole, amountM, reason: reason.slice(0, 120), status: 'pending', createdAt: Date.now() };
      set({ ...state, requests: [...state.requests, r] });
    },
    async answerRequest(id, accept) {
      const r = state.requests.find((x) => x.id === id);
      if (!r || r.status !== 'pending') return;
      let split = state.council.split;
      if (accept) {
        const points = (r.amountM / budgetOf(state)) * 100;
        // The requester (fromRole) receives money from toRole.
        split = moveSplit(split, r.toRole, r.fromRole, points);
      }
      set({
        ...state, council: { ...state.council, split },
        requests: state.requests.map((x) => (x.id === id ? { ...x, status: accept ? 'accepted' : 'declined' } : x)),
      });
    },
    async updateDesign<R extends Role>(role: R, patch: Partial<Design[R]>) {
      const design = { ...state.design, [role]: { ...state.design[role], ...patch } } as Design;
      if (role === 'science' && (patch as Partial<Design['science']>).instrumentIds)
        design.science = { instrumentIds: [...(patch as Partial<Design['science']>).instrumentIds!] };
      set({ ...state, design, signoffs: allFalse(), reviewDone: false });
    },
    async setSignoff(role, value) { set({ ...state, signoffs: { ...state.signoffs, [role]: value } }); },
    async setReviewDone(value) { set({ ...state, reviewDone: value }); },
    async submitDecision(eventIndex, optionId) {
      if (state.decisions[eventIndex]) return;   // first write wins
      set({ ...state, decisions: { ...state.decisions, [eventIndex]: { optionId, byUid: uid, at: Date.now() } } });
    },
    async suggest(eventIndex, optionId) {
      const cur = state.suggestions[eventIndex] ?? {};
      set({ ...state, suggestions: { ...state.suggestions, [eventIndex]: { ...cur, [uid]: optionId } } });
    },
    async sendChat(text) {
      const t = text.trim().slice(0, 200);
      if (!t) return;
      const msg = { id: `c${++chatCounter}`, uid, name: state.players[uid].name, text: t, at: Date.now() };
      set({ ...state, chat: [...state.chat, msg].slice(-50) });
    },
    async setResult(r) { set({ ...state, result: { ...r } }); },
    async leave() { subs.clear(); },
  };
  return api;
}

/** Mission budget in $M for the room's scenario and difficulty. */
export function budgetOf(s: RoomState): number {
  return getScenario(s.meta.scenarioId).budgetM * getDifficulty(s.meta.difficulty).budgetMult;
}
