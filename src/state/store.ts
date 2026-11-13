// Game store (bible A14.4). Screens read from here; the room (LocalRoom or online) is the source of truth.
import { create } from 'zustand';
import { play, setAudioSettings } from '../audio/sound';
import {
  computeBudgets, createSimulation, encodeDesign, previewPatch, runChecksWith, scoreMission, type Budgets, type Check,
  type Design, type DifficultyId, type Role, type ScenarioId, type ScoreReport, type LiveSimulation, type SimInput,
} from '../core';
import {
  createLocalRoom, createOnlineRoom, currentDecisions, joinOnlineRoom, replayDecisions, type RoomApi, type RoomState,
} from '../net/roomApi';
import { navigate } from '../router';
import { recordCareerFlight } from './career';
import { DEFAULT_SETTINGS, KEYS, load, save, type Attempt, type Settings } from './storage';

export interface Toast { id: number; text: string; kind: 'info' | 'warn' | 'good' | 'bad'; action?: { label: string; run: () => void }[] }
export interface StartOpts { name: string; characterId: string; scenarioId: ScenarioId; difficulty: DifficultyId; seed?: number }

interface GameStore {
  room: RoomApi | null; state: RoomState | null;
  budgets: Budgets | null; checks: Check[];
  sim: LiveSimulation | null; simTick: number; simSpeed: 1 | 2 | 4 | 8; paused: boolean;
  score: ScoreReport | null; attempts: Attempt[];
  settings: Settings;
  // UI state
  activeRole: Role; hover: Budgets | null; toasts: Toast[]; glossaryId: string | null; reviewOpen: boolean;
  requirementsOpen: boolean; briefingDone: boolean; failChecksAtLaunch: number; connected: boolean; chatOpen: boolean;
  chatSeen: number; tradeOpen: boolean; flash: string | null;
  /** true while flying a mission started from the Agency career screen (F-31) */
  career: boolean;
  // actions
  startSolo(o: StartOpts, design?: Design): void;
  createRoom(o: StartOpts): Promise<void>;
  joinRoom(code: string, o: { name: string; characterId: string }): Promise<void>;
  leaveRoom(): Promise<void>;
  previewDelta<R extends Role>(role: R, patch: Partial<Design[R]>): Budgets | null;
  setHover(b: Budgets | null): void;
  simInput(): SimInput | null;
  bumpSim(): void;
  finishMission(): void;
  retry(design?: Design): Promise<void>;
  toast(text: string, kind?: Toast['kind'], action?: Toast['action']): void;
  dismissToast(id: number): void;
  setSettings(p: Partial<Settings>): void;
  set(p: Partial<GameStore>): void;
}

let toastId = 0;
let unsub: (() => void) | null = null;
let memoKey = '';

const FIELD_NAMES: Record<string, string> = {
  orbitId: 'the orbit', lifetimeYears: 'the lifetime', launchVehicleId: 'the rocket', deltaVMarginPct: 'the delta-v margin',
  busId: 'the bus', solarArrayId: 'the solar array', solarArrayW: 'the solar array', rtgCount: 'the RTGs', batteryId: 'the battery',
  batteryWh: 'the battery', computerId: 'the computer', adcsId: 'attitude control', propulsionId: 'the propulsion',
  instrumentIds: 'instruments', radioId: 'the radio', hga: 'the antenna', groundNetworkId: 'the ground network',
};

function changedField(a: Design, b: Design): { role: Role; field: string } | null {
  for (const role of ['planner', 'engineer', 'science', 'comms'] as Role[]) {
    const x = a[role] as unknown as Record<string, unknown>, y = b[role] as unknown as Record<string, unknown>;
    for (const k of Object.keys(y)) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return { role, field: k };
  }
  return null;
}

export const useGame = create<GameStore>((set, get) => {
  const settings = { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(KEYS.settings, {}) };
  setAudioSettings(settings.volume, settings.muted, settings.voices);

  /** Called on every room state change. */
  const onState = (s: RoomState) => {
    const prev = get().state;
    const key = JSON.stringify([s.design, s.meta.scenarioId, s.meta.difficulty, s.council.split]);
    const patch: Partial<GameStore> = { state: s };
    if (key !== memoKey) {
      memoKey = key;
      const budgets = computeBudgets(s.design, s.meta.scenarioId, s.meta.difficulty, s.council.split);
      patch.budgets = budgets;
      patch.checks = runChecksWith(s.design, s.meta.scenarioId, budgets);
    }
    // Team: "<name> changed <field> — all sign-offs reset"
    if (prev && get().room?.mode === 'online' && prev.meta.phase === 'design' && JSON.stringify(prev.design) !== JSON.stringify(s.design)) {
      const ch = changedField(prev.design, s.design);
      if (ch && Object.values(prev.signoffs).some(Boolean)) {
        const holder = s.roles[ch.role];
        const name = (holder && s.players[holder]?.name) || 'Someone';
        get().toast(`${name} changed ${FIELD_NAMES[ch.field] ?? ch.field} — all sign-offs reset`, 'warn');
      }
    }
    // Incoming funds requests for roles I hold
    if (prev && get().room) {
      const me = get().room!.myUid;
      for (const r of s.requests) {
        if (r.status === 'pending' && s.roles[r.toRole] === me && !prev.requests.some((p) => p.id === r.id)) {
          play('sfx_coin');
          get().toast(`Funds request: $${r.amountM}M from you for ${r.fromRole} — "${r.reason}"`, 'info', [
            { label: 'Accept', run: () => get().room?.answerRequest(r.id, true) },
            { label: 'Decline', run: () => get().room?.answerRequest(r.id, false) },
          ]);
        }
      }
    }
    // Phase transitions
    const phase = s.meta.phase;
    const enteringLaunch = phase === 'launch' && (!prev || prev.meta.phase !== 'launch');
    // Arrived while the flight is already under way (joined late, or reloaded the page): there is no simulation yet.
    const lateArrival = (phase === 'ops' || phase === 'report') && !get().sim;
    if (enteringLaunch || lateArrival) {
      const checks = patch.checks ?? get().checks;
      patch.failChecksAtLaunch = checks.filter((c) => c.severity === 'fail').length;
      const sim = createSimulation({ scenarioId: s.meta.scenarioId, difficulty: s.meta.difficulty, seed: s.meta.seed, design: s.design, split: s.council.split });
      // The simulation is deterministic: replaying the room's decisions puts this screen where the crew already is.
      if (lateArrival) replayDecisions(sim, s);
      patch.sim = sim;
      patch.score = null; patch.reviewOpen = false;
    }
    // The host has moved the room to the report while this screen was still flying (slower or background tab):
    // finish the same flight here so the report can be shown.
    const flight = patch.sim ?? get().sim;
    if (phase === 'report' && flight && !flight.done) replayDecisions(flight, s, true);
    if ((phase === 'design' || phase === 'council' || phase === 'lobby') && get().sim) { patch.sim = null; patch.score = null; }
    if (phase === 'council' && prev && prev.meta.phase === 'lobby') patch.briefingDone = false;
    if (s.meta.opsSpeed && get().room?.mode === 'online') patch.simSpeed = s.meta.opsSpeed;
    if (s.meta.opsPaused !== undefined && get().room?.mode === 'online') patch.paused = s.meta.opsPaused;
    set(patch);
  };

  // Buttons call the room without waiting for the answer. When an online call fails, say so instead of doing nothing.
  let lastNetToast = 0;
  if (typeof addEventListener === 'function') {
    addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
      if (!(e.reason instanceof Error) || e.reason.message !== 'NETWORK' || Date.now() - lastNetToast < 4000) return;
      lastNetToast = Date.now();
      get().toast("That didn't reach the server. Check the connection and try again.", 'warn');
    });
  }

  const attach = (room: RoomApi) => {
    unsub?.();
    const old = get().room;
    if (old && old !== room) void old.leave().catch(() => {});   // never keep a second room connection alive
    memoKey = '';
    set({ room, state: null, sim: null, score: null, briefingDone: false, activeRole: 'planner', reviewOpen: false, toasts: [], chatSeen: 0, career: false });
    unsub = room.subscribe(onState);
  };

  return {
    room: null, state: null, budgets: null, checks: [], sim: null, simTick: 0, simSpeed: 1, paused: false, score: null,
    attempts: load<Attempt[]>(KEYS.attempts, []), settings,
    activeRole: 'planner', hover: null, toasts: [], glossaryId: null, reviewOpen: false, requirementsOpen: false,
    briefingDone: false, failChecksAtLaunch: 0, connected: true, chatOpen: false, chatSeen: 0, tradeOpen: false, flash: null, career: false,

    startSolo(o, design) {
      const room = createLocalRoom(o);
      attach(room);
      if (design) for (const r of ['planner', 'engineer', 'science', 'comms'] as Role[]) room.updateDesign(r, design[r]);
      navigate('/play');
    },
    async createRoom(o) {
      await get().leaveRoom();
      const room = await createOnlineRoom(o);
      attach(room);
      navigate(`/room/${room.getState().meta.code}`);
    },
    async joinRoom(code, o) {
      // Leave first: joining the room you are still connected to would otherwise mark you as away again.
      await get().leaveRoom();
      const room = await joinOnlineRoom(code, o);
      attach(room);
      navigate(`/room/${room.getState().meta.code}`);
    },
    async leaveRoom() {
      unsub?.(); unsub = null;
      await get().room?.leave();
      set({ room: null, state: null, sim: null, score: null, budgets: null, checks: [] });
    },
    previewDelta(role, patch) {
      const s = get().state;
      if (!s) return null;
      return computeBudgets(previewPatch(s.design, role, patch), s.meta.scenarioId, s.meta.difficulty, s.council.split);
    },
    setHover(b) { set({ hover: b }); },
    simInput() {
      const s = get().state;
      return s ? { scenarioId: s.meta.scenarioId, difficulty: s.meta.difficulty, seed: s.meta.seed, design: s.design, split: s.council.split } : null;
    },
    bumpSim() { set({ simTick: get().simTick + 1 }); },
    finishMission() {
      const { sim, state, failChecksAtLaunch, room } = get();
      const input = get().simInput();
      if (!sim || !sim.done || !state || !input || get().score) return;
      const reviewDone = state.reviewDone || Object.values(state.signoffs).every(Boolean);
      const score = scoreMission(input, sim.result(), { reviewDone, failChecksAtLaunch });
      const designCode = encodeDesign({ v: 1, ...input, teamName: state.meta.teamName, decisions: currentDecisions(state) });
      const attempts = [...get().attempts, { at: Date.now(), score: score.total, designCode, scenarioId: input.scenarioId,
        difficulty: input.difficulty, stars: score.stars, outcomeClass: score.outcomeClass }].slice(-50);
      save(KEYS.attempts, attempts);
      set({ score, attempts });
      if (get().career) {
        const unlocked = recordCareerFlight(input.scenarioId, score);
        if (unlocked) get().toast('Career: a new mission is unlocked!', 'good', [{ label: 'Career', run: () => navigate('/career') }]);
      }
      if (room && room.myUid === state.meta.hostUid && room.mode === 'online')
        room.setResult({ score: score.total, stars: score.stars, outcome: sim.result().outcome, designCode, at: Date.now() }).catch(() => {});
    },
    async retry(design) {
      const room = get().room;
      if (!room) return;
      try {
        if (design) for (const r of ['planner', 'engineer', 'science', 'comms'] as Role[]) await room.updateDesign(r, design[r]);
        // Going back to design clears the simulation and score for every screen (see onState).
        await room.setMeta({ phase: 'design', attempt: (room.getState().meta.attempt ?? 0) + 1 });
      } catch {
        get().toast("Couldn't start the retry. Check the connection and try again.", 'warn');
      }
    },
    toast(text, kind = 'info', action) {
      const id = ++toastId;
      set({ toasts: [...get().toasts, { id, text, kind, action }].slice(-4) });
      setTimeout(() => get().dismissToast(id), action ? 15000 : 4500);
    },
    dismissToast(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },
    setSettings(p) {
      const settings = { ...get().settings, ...p };
      save(KEYS.settings, settings);
      setAudioSettings(settings.volume, settings.muted, settings.voices);
      set({ settings });
    },
    set(p) { set(p); },
  };
});

/** Roles held by me in the current room. */
export function useMyRoles(): Role[] {
  const room = useGame((g) => g.room);
  const state = useGame((g) => g.state);
  if (!room || !state) return [];
  return (Object.keys(state.roles) as Role[]).filter((r) => state.roles[r] === room.myUid);
}
export function useIsHost(): boolean {
  const room = useGame((g) => g.room);
  const state = useGame((g) => g.state);
  return !!room && !!state && state.meta.hostUid === room.myUid;
}
