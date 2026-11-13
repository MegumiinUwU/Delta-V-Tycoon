// Online room logic with two (or three) players, run against an in-memory database that enforces
// database.rules.json (see fakeFirebase.ts). No network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultDesign } from '../../core/design';
import { createSimulation, goodChoice, simulateAll } from '../../core/sim';
import type { SimInput } from '../../core/types';
import { createOnlineRoomImpl, joinOnlineRoomImpl } from '../firebaseRoom';
import { createLocalRoom } from '../localRoom';
import { currentDecisions, replayDecisions, simBehind, type RoomApi, type RoomState } from '../roomApi';
import { database, drop, listenerCount, reset, session } from './fakeFirebase';

vi.mock('firebase/database', async () => (await import('./fakeFirebase')).database);
vi.mock('../firebase', async () => {
  const fake = await import('./fakeFirebase');
  return { db: {}, firebaseConfigured: true, ensureSignedIn: async () => fake.session.uid };
});

/** Runs a call as that player (the fake database checks the rules against the current user). */
async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> { session.uid = uid; return fn(); }

const HOST = { name: 'Nour', characterId: 'nour', scenarioId: 'nile_watch', difficulty: 'cadet' } as const;
const rooms: RoomApi[] = [];
async function host(): Promise<RoomApi> { const r = await as('u1', () => createOnlineRoomImpl({ ...HOST })); rooms.push(r); return r; }
async function join(uid: string, code: string, name = 'Kwame'): Promise<RoomApi> {
  const r = await as(uid, () => joinOnlineRoomImpl(code, { name, characterId: 'kwame' }));
  rooms.push(r);
  return r;
}
const code = (r: RoomApi) => r.getState().meta.code!;

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); reset(); });
afterEach(async () => {
  for (const r of rooms.splice(0)) await as(r.myUid, () => r.leave());
  vi.useRealTimers(); vi.restoreAllMocks();
});

describe('online room: create and join', () => {
  it('a host creates a room and a second player joins it; both see the same state', async () => {
    const a = await host();
    expect(a.getState().meta.phase).toBe('lobby');
    const b = await join('u2', code(a));
    for (const s of [a.getState(), b.getState()]) {
      expect(Object.keys(s.players).sort()).toEqual(['u1', 'u2']);
      expect(s.meta.hostUid).toBe('u1');
      expect(s.design).toEqual(defaultDesign('nile_watch', 'cadet'));
      expect(Object.values(s.players).every((p) => p.connected)).toBe(true);
    }
  });

  it('reports a wrong or malformed code', async () => {
    await expect(as('u2', () => joinOnlineRoomImpl('ABCDE', { name: 'K', characterId: 'kwame' }))).rejects.toThrow('ROOM_NOT_FOUND');
    await expect(as('u2', () => joinOnlineRoomImpl('AB0DE', { name: 'K', characterId: 'kwame' }))).rejects.toThrow('BAD_CODE');
  });

  it('joining again from the same tab does not hang, and leaving removes every listener', async () => {
    const a = await host();
    const first = await join('u2', code(a));
    const again = await join('u2', code(a));   // would never resolve before the fix
    expect(again.getState().players.u2.connected).toBe(true);
    await as('u2', () => first.leave());
    await as('u2', () => again.leave());
    await as('u1', () => a.leave());
    rooms.length = 0;
    expect(listenerCount(`rooms/${code(a)}`)).toBe(0);
  });
});

describe('online room: roles, design and the rules', () => {
  it('a role goes to the first player who claims it; only its holder or the host can release it', async () => {
    const a = await host(); const b = await join('u2', code(a));
    expect(await as('u1', () => a.claimRole('planner'))).toBe(true);
    expect(await as('u2', () => b.claimRole('planner'))).toBe(false);
    expect(await as('u2', () => b.claimRole('engineer'))).toBe(true);
    await expect(as('u2', () => b.releaseRole('planner'))).rejects.toThrow('NETWORK');
    await as('u1', () => a.releaseRole('engineer'));
    expect(b.getState().roles).toEqual({ planner: 'u1', engineer: null, science: null, comms: null });
  });

  it('changing the mission or difficulty in the lobby gives every screen that mission\'s starter design', async () => {
    const a = await host(); const b = await join('u2', code(a));
    await as('u1', () => a.setMeta({ scenarioId: 'red_relay' }));
    expect(b.getState().meta.scenarioId).toBe('red_relay');
    expect(b.getState().design).toEqual(defaultDesign('red_relay', 'cadet'));
    await as('u1', () => a.setMeta({ difficulty: 'director' }));
    expect(a.getState().design).toEqual(defaultDesign('red_relay', 'director'));
    await as('u1', () => a.setMeta({ teamName: 'Crew 7' }));   // unrelated lobby edits leave the design alone
    expect(b.getState().design).toEqual(defaultDesign('red_relay', 'director'));
  });

  it('only the host can change the mission, phase or speed', async () => {
    const a = await host(); const b = await join('u2', code(a));
    await expect(as('u2', () => b.setMeta({ phase: 'council' }))).rejects.toThrow('NETWORK');
    await expect(as('u2', () => b.setMeta({ scenarioId: 'red_relay' }))).rejects.toThrow('NETWORK');
    expect(a.getState().meta.phase).toBe('lobby');
    expect(a.getState().meta.scenarioId).toBe('nile_watch');
  });

  it('in the workshop a player edits only the roles they hold, and an edit clears every sign-off', async () => {
    const a = await host(); const b = await join('u2', code(a));
    await as('u1', () => a.claimRole('planner')); await as('u2', () => b.claimRole('engineer'));
    await as('u1', () => a.claimRole('science')); await as('u1', () => a.claimRole('comms'));
    await as('u1', () => a.setMeta({ phase: 'design' }));
    await as('u1', () => a.setSignoff('planner', true));
    await as('u2', () => b.updateDesign('engineer', { batteryWh: 450 }));
    expect(a.getState().design.engineer.batteryWh).toBe(450);
    expect(a.getState().signoffs.planner).toBe(false);
    await expect(as('u2', () => b.updateDesign('planner', { lifetimeYears: 5 }))).rejects.toThrow('NETWORK');
    await expect(as('u1', () => a.updateDesign('engineer', { batteryWh: 50 }))).rejects.toThrow('NETWORK');   // host, but not the holder
    await as('u1', () => a.updateDesign('science', { instrumentIds: [] }));   // an empty list survives the round trip
    expect(b.getState().design.science.instrumentIds).toEqual([]);
  });

  it('"Apply & retry": on the report the host may rewrite every role\'s design, then reopen the workshop', async () => {
    const a = await host(); const b = await join('u2', code(a));
    await as('u2', () => b.claimRole('engineer'));
    await as('u1', () => a.setMeta({ phase: 'report' }));
    const fix = defaultDesign('nile_watch', 'cadet');
    fix.engineer.batteryWh = 900;
    for (const r of ['planner', 'engineer', 'science', 'comms'] as const) await as('u1', () => a.updateDesign(r, fix[r]));
    await as('u1', () => a.setMeta({ phase: 'design', attempt: 1 }));
    expect(b.getState().design.engineer.batteryWh).toBe(900);
    expect(b.getState().meta.attempt).toBe(1);
  });

  it('the budget council, funds requests, chat and decisions work across players', async () => {
    const a = await host(); const b = await join('u2', code(a));
    await as('u1', () => a.claimRole('science')); await as('u2', () => b.claimRole('comms'));
    await as('u1', () => a.setAgreed(true));
    await as('u2', () => b.setSplit({ planner: 40, engineer: 30, science: 20, comms: 10 }));
    expect(a.getState().council.agreed).toEqual({});   // any change clears the agreements
    await as('u1', () => a.requestFunds('science', 'comms', 14.4, 'need a second imager'));
    const id = b.getState().requests[0].id;
    await expect(as('u1', () => a.answerRequest(id, true))).rejects.toThrow('NOT_OWNER');
    await as('u2', () => b.answerRequest(id, true));   // 14.4 of 144 = 10 points, comms → science
    expect(a.getState().council.split).toEqual({ planner: 40, engineer: 30, science: 30, comms: 0 });
    expect(a.getState().requests[0].status).toBe('accepted');
    await as('u2', () => b.sendChat('hello'));
    expect(a.getState().chat.map((m) => m.text)).toEqual(['hello']);
    await as('u1', () => a.submitDecision(0, 'first'));
    await as('u2', () => b.submitDecision(0, 'second'));   // first write wins
    await as('u2', () => b.suggest(1, 'maybe'));
    expect(b.getState().decisions[0].optionId).toBe('first');
    expect(a.getState().suggestions[1]).toEqual({ u2: 'maybe' });
  });

  it('someone who is not in the room cannot write to it, and chat is capped at 200 characters', async () => {
    const a = await host();
    const chat = database.ref({}, `rooms/${code(a)}/chat/x1`);
    await expect(as('u9', () => database.set(chat, { uid: 'u9', name: 'x', text: 'hi', at: 1 }))).rejects.toThrow('PERMISSION_DENIED');
    await expect(as('u9', () => database.set(database.ref({}, `rooms/${code(a)}/meta/phase`), 'report'))).rejects.toThrow('PERMISSION_DENIED');
    await expect(as('u1', () => database.set(chat, { uid: 'u1', name: 'x', text: 'x'.repeat(201), at: 1 }))).rejects.toThrow('PERMISSION_DENIED');
    await expect(as('u9', () => database.set(database.ref({}, 'rooms/ZZZZZ/players/u9'), { uid: 'u9' }))).rejects.toThrow('PERMISSION_DENIED');
  });
});

describe('online room: host handover', () => {
  it('a player cannot take the host seat while the host is connected', async () => {
    const a = await host(); await join('u2', code(a));
    const seat = database.ref({}, `rooms/${code(a)}/meta/hostUid`);
    await expect(as('u2', () => database.set(seat, 'u2'))).rejects.toThrow('PERMISSION_DENIED');
    expect(a.getState().meta.hostUid).toBe('u1');
  });

  it('when the host drops, the earliest-joined player takes over after 30 s without anyone touching the room', async () => {
    const a = await host();
    vi.advanceTimersByTime(1000);
    const b = await join('u2', code(a));
    vi.advanceTimersByTime(1000);
    const c = await join('u3', code(a), 'Layla');
    drop('u1');
    expect(b.getState().players.u1.connected).toBe(false);
    session.uid = 'u2';
    await vi.advanceTimersByTimeAsync(20000);
    expect(b.getState().meta.hostUid).toBe('u1');   // not yet
    await vi.advanceTimersByTimeAsync(15000);
    expect(b.getState().meta.hostUid).toBe('u2');
    expect(c.getState().meta.hostUid).toBe('u2');
    await as('u2', () => b.setMeta({ phase: 'council' }));   // the new host can run the room
    expect(c.getState().meta.phase).toBe('council');
  });
});

describe('keeping every screen on the same flight', () => {
  // A flight with at least two events that need a decision, and the decisions a crew would have stored in the room.
  function flight(): { input: SimInput; decisions: Record<number, string> } {
    for (let seed = 1; seed < 400; seed++) {
      const input: SimInput = { scenarioId: 'nile_watch', difficulty: 'director', seed, design: defaultDesign('nile_watch', 'director'),
        split: { planner: 35, engineer: 30, science: 25, comms: 10 } };
      const sim = createSimulation(input);
      const decisions: Record<number, string> = {};
      let guard = 0;
      while (!sim.done && guard++ < 1000) { sim.step(1e9); const p = sim.pendingEvent; if (p) { decisions[p.index] = goodChoice(p); sim.decide(decisions[p.index]); } }
      if (Object.keys(decisions).length >= 2 && sim.result().outcome !== 'launch_failure') return { input, decisions };
    }
    throw new Error('no seed with two decisions');
  }
  function roomWith(input: SimInput, decisions: Record<number, string>, attempt = 0): RoomState {
    const s = createLocalRoom({ name: 't', characterId: 'nour', scenarioId: input.scenarioId, difficulty: input.difficulty, seed: input.seed }).getState();
    const stored: RoomState['decisions'] = {};
    for (const [i, optionId] of Object.entries(decisions)) stored[attempt * 100 + Number(i)] = { optionId, byUid: 'u1', at: 1 };
    return { ...s, meta: { ...s.meta, attempt }, decisions: stored };
  }

  it('a screen that joins mid-flight replays the decisions already made and stops at the next open one', () => {
    const { input, decisions } = flight();
    const [firstIdx] = Object.keys(decisions).map(Number).sort((x, y) => x - y);
    const room = roomWith(input, { [firstIdx]: decisions[firstIdx] }, 2);   // third attempt: keys are offset by 200
    expect(currentDecisions(room)).toEqual({ [firstIdx]: decisions[firstIdx] });
    const sim = createSimulation(input);
    expect(simBehind(sim, room)).toBe(true);
    replayDecisions(sim, room);
    expect(simBehind(sim, room)).toBe(false);
    expect(sim.done).toBe(false);
    expect(sim.result().events.filter((e) => e.optionId !== null).map((e) => e.index)).toEqual([firstIdx]);
    expect(sim.pendingEvent).toBeNull();   // it does not run ahead of the crew to the next event
  });

  it('once the room is on the report, a lagging screen finishes with exactly the host\'s result', () => {
    const { input, decisions } = flight();
    const room = roomWith(input, decisions);
    const lagging = createSimulation(input);
    lagging.step(3);
    replayDecisions(lagging, room, true);
    expect(lagging.done).toBe(true);
    const mine = lagging.result(), hosts = simulateAll(input, decisions);
    expect(mine.outcome).toBe(hosts.outcome);
    expect(mine.endDay).toBe(hosts.endDay);
    expect(mine.scienceReturned).toBe(hosts.scienceReturned);
    expect(mine.finalTotalCostM).toBe(hosts.finalTotalCostM);
    expect(mine.events.map((e) => [e.index, e.optionId])).toEqual(hosts.events.map((e) => [e.index, e.optionId]));
  });
});
