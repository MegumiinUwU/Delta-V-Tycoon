import { describe, expect, it } from 'vitest';
import { createLocalRoom } from '../../net/localRoom';
import { makeCode, normalizeCode } from '../../net/roomCodes';
import { toRoomState } from '../../net/firebaseRoom';
import { defaultDesign } from '../design';

const room = () => createLocalRoom({ name: 'Solo', characterId: 'nour', scenarioId: 'nile_watch', difficulty: 'cadet', seed: 7 });

describe('LocalRoom', () => {
  it('starts in council with all roles owned by "local"', () => {
    const s = room().getState();
    expect(s.meta.phase).toBe('council');
    expect(Object.values(s.roles)).toEqual(['local', 'local', 'local', 'local']);
    expect(s.council.split).toEqual({ planner: 35, engineer: 30, science: 25, comms: 10 });
  });
  it('design update clears sign-offs; setSplit clears agreed; notifies synchronously', async () => {
    const r = room();
    let calls = 0;
    r.subscribe(() => calls++);
    await r.setSignoff('science', true);
    await r.setAgreed(true);
    expect(r.getState().council.agreed.local).toBe(true);
    await r.updateDesign('science', { instrumentIds: ['imager_ms', 'imager_tir'] });
    expect(r.getState().signoffs.science).toBe(false);
    expect(r.getState().design.science.instrumentIds).toEqual(['imager_ms', 'imager_tir']);
    await r.setSplit({ planner: 40, engineer: 30, science: 20, comms: 10 });
    expect(r.getState().council.agreed).toEqual({});
    expect(calls).toBe(5); // 1 immediate + 4 mutations
  });
  it('accepting a funds request moves split points (clamped at 0)', async () => {
    const r = room();
    // budget nile_watch cadet = 120 × 1.2 = 144 → $14.4M = 10 points
    await r.requestFunds('science', 'comms', 14.4, 'need a second imager');
    const id = r.getState().requests[0].id;
    await r.answerRequest(id, true);
    expect(r.getState().council.split.comms).toBeCloseTo(0, 6);
    expect(r.getState().council.split.science).toBeCloseTo(35, 6);
    expect(r.getState().requests[0].status).toBe('accepted');
  });
  it('first decision wins; chat trims to 200 chars and ignores empty', async () => {
    const r = room();
    await r.submitDecision(0, 'safe_mode');
    await r.submitDecision(0, 'keep_observing');
    expect(r.getState().decisions[0].optionId).toBe('safe_mode');
    await r.sendChat('   ');
    await r.sendChat('x'.repeat(300));
    expect(r.getState().chat).toHaveLength(1);
    expect(r.getState().chat[0].text).toHaveLength(200);
  });
});

describe('room codes', () => {
  it('makes 5-char codes from the safe alphabet and normalizes input', () => {
    for (let i = 0; i < 100; i++) expect(normalizeCode(makeCode())).not.toBeNull();
    expect(normalizeCode(' ab cd e ')).toBe('ABCDE');
    expect(normalizeCode('ABCD0')).toBeNull();
    expect(normalizeCode('ABCDL')).toBeNull();
    expect(normalizeCode('ABCD')).toBeNull();
  });
});

describe('online state conversion', () => {
  it('fills defaults and treats a missing instrument list as empty once a design exists', () => {
    const fb = defaultDesign('nile_watch', 'cadet');
    const s = toRoomState({ meta: { code: 'ABCDE' }, design: { planner: fb.planner, engineer: fb.engineer, comms: fb.comms },
      chat: { b: { text: 'two', at: 2 }, a: { text: 'one', at: 1 } }, decisions: { 1: { optionId: 'x', byUid: 'u', at: 1 } } }, fb);
    expect(s.design.science.instrumentIds).toEqual([]);
    expect(s.chat.map((c) => c.text)).toEqual(['one', 'two']);
    expect(s.decisions[1].optionId).toBe('x');
    expect(s.roles.planner).toBeNull();
  });
});
