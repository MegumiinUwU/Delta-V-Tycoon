import { describe, expect, it } from 'vitest';
import { getCatalog } from '../../core';
import { losShuffle, MAX_PINS, POOL } from '../Poem';
import { STRIPS } from '../Stories';

describe('orbit poem', () => {
  it('moves free lines at loss of signal and never moves a pinned line', () => {
    const lines = POOL.slice(0, 6);
    const pinned = new Set([lines[1], lines[4]]);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 50; i++) {
      const next = losShuffle(lines, pinned, rnd);
      expect(next[1]).toBe(lines[1]);
      expect(next[4]).toBe(lines[4]);
      expect([...next].sort()).toEqual([...lines].sort());
      expect(next).not.toEqual(lines);
    }
    expect(pinned.size).toBe(MAX_PINS);
    expect(losShuffle(lines, new Set(lines.slice(1)))).toEqual(lines);   // one free line has nowhere to go
  });
});

describe('crew shorts', () => {
  it('uses real crew ids and four panels per strip', () => {
    const ids = new Set(getCatalog().characters.map((c) => c.id));
    for (const s of STRIPS) {
      expect(s.panels).toHaveLength(4);
      for (const p of s.panels) for (const who of [p.left, p.right]) if (who) expect(ids.has(who[0])).toBe(true);
    }
  });
});
