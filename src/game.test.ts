import { describe, expect, it } from 'vitest';
import { RULES, SpawnManager } from './game';

function seeded(seed = 1) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('SpawnManager', () => {
  it('keeps spawned cookies within screen and below HUD', () => {
    const game = new SpawnManager(seeded());
    for (let i = 0; i < 7; i++) game.spawn({ width: 900, height: 700 }, 0);
    expect(game.active.size).toBe(7);
    for (const cookie of game.active.values()) {
      expect(cookie.x).toBeGreaterThanOrEqual(RULES.edge + RULES.radius);
      expect(cookie.x).toBeLessThanOrEqual(900 - RULES.edge - RULES.radius);
      expect(cookie.y).toBeGreaterThanOrEqual(RULES.hudHeight + RULES.radius);
      expect(cookie.y).toBeLessThanOrEqual(700 - RULES.edge - RULES.radius);
    }
  });

  it('keeps cookies apart and enforces the maximum', () => {
    const game = new SpawnManager(seeded());
    for (let i = 0; i < 20; i++) game.spawn({ width: 900, height: 700 }, 0);
    const cookies = [...game.active.values()];
    expect(cookies).toHaveLength(RULES.maxCookies);
    for (let i = 0; i < cookies.length; i++) {
      for (let j = i + 1; j < cookies.length; j++) {
        expect(Math.hypot(cookies[i].x - cookies[j].x, cookies[i].y - cookies[j].y))
          .toBeGreaterThanOrEqual(RULES.radius * 2 + RULES.gap);
      }
    }
  });

  it('skips impossible geometry and crowded space', () => {
    const game = new SpawnManager(() => 0);
    expect(game.spawn({ width: 103, height: 191 }, 0)).toBeUndefined();
    expect(game.spawn({ width: 104, height: 192 }, 0)).toBeDefined();
    expect(game.spawn({ width: 104, height: 192 }, 0)).toBeUndefined();
    expect(game.active.size).toBe(1);
  });

  it('expires cookies without reward', () => {
    const game = new SpawnManager(() => 0);
    const cookie = game.spawn({ width: 300, height: 300 }, 100)!;
    expect(game.expire(100 + RULES.lifetimeMs - 1)).toEqual([]);
    expect(game.expire(100 + RULES.lifetimeMs)).toEqual([cookie.id]);
    expect(game.active.size).toBe(0);
    expect(game.balance).toBe(0);
  });

  it('awards exactly once for repeated hits', () => {
    const game = new SpawnManager(() => 0);
    const cookie = game.spawn({ width: 300, height: 300 }, 0)!;
    expect(game.hit(cookie.id)).toBe(1);
    expect(cookie.hp).toBe(0);
    expect(game.hit(cookie.id)).toBe(0);
    expect(game.balance).toBe(1);
    expect(game.destroyed).toBe(1);
    expect(game.active.size).toBe(0);
  });

  it('increments balance for each distinct cookie', () => {
    const game = new SpawnManager(seeded());
    const first = game.spawn({ width: 900, height: 700 }, 0)!;
    const second = game.spawn({ width: 900, height: 700 }, 0)!;
    game.hit(first.id);
    game.hit(second.id);
    expect(game.balance).toBe(2);
    expect(game.destroyed).toBe(2);
  });

  it('repositions or removes active cookies on resize without changing balance', () => {
    const game = new SpawnManager(seeded());
    game.spawn({ width: 900, height: 700 }, 0);
    game.spawn({ width: 900, height: 700 }, 0);
    game.resize({ width: 320, height: 568 }, 1);
    for (const cookie of game.active.values()) {
      expect(cookie.x).toBeLessThanOrEqual(320 - RULES.radius - RULES.edge);
      expect(cookie.y).toBeLessThanOrEqual(568 - RULES.radius - RULES.edge);
    }
    expect(game.balance).toBe(0);
  });
});
