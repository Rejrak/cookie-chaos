import { describe, expect, it } from 'vitest';
import { RULES, SpawnManager } from './game';
import { Economy } from './economy';

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
    const economy = new Economy();
    const cookie = game.spawn({ width: 300, height: 300 }, 100)!;
    expect(game.expire(100 + RULES.lifetimeMs - 1)).toEqual([]);
    expect(game.expire(100 + RULES.lifetimeMs)).toEqual([cookie.id]);
    expect(game.active.size).toBe(0);
    expect(economy.balance).toBe(0n);
  });

  it('awards exactly once for repeated hits', () => {
    const game = new SpawnManager(() => 0);
    const economy = new Economy();
    const cookie = game.spawn({ width: 300, height: 300 }, 0)!;
    if (game.hit(cookie.id)?.destroyed) economy.recordHit(1n);
    expect(cookie.hp).toBe(0);
    if (game.hit(cookie.id)?.destroyed) economy.recordHit(1n);
    expect(economy.balance).toBe(1n);
    expect(economy.cookiesDestroyed).toBe(1);
    expect(game.active.size).toBe(0);
  });

  it('increments balance for each distinct cookie', () => {
    const game = new SpawnManager(seeded());
    const economy = new Economy();
    const first = game.spawn({ width: 900, height: 700 }, 0)!;
    const second = game.spawn({ width: 900, height: 700 }, 0)!;
    if (game.hit(first.id)?.destroyed) economy.recordHit(1n);
    if (game.hit(second.id)?.destroyed) economy.recordHit(1n);
    expect(economy.balance).toBe(2n);
    expect(economy.cookiesDestroyed).toBe(2);
  });

  it('repositions or removes active cookies on resize without changing balance', () => {
    const game = new SpawnManager(seeded());
    const economy = new Economy();
    game.spawn({ width: 900, height: 700 }, 0);
    game.spawn({ width: 900, height: 700 }, 0);
    game.resize({ width: 320, height: 568 });
    for (const cookie of game.active.values()) {
      expect(cookie.x).toBeLessThanOrEqual(320 - RULES.radius - RULES.edge);
      expect(cookie.y).toBeLessThanOrEqual(568 - RULES.radius - RULES.edge);
    }
    expect(economy.balance).toBe(0n);
  });

  it('uses each cookie radius and excludes the shop area', () => {
    const game = new SpawnManager(seeded());
    const bounds = { width: 1000, height: 700 };
    const area = { left: 0, top: 100, right: 700, bottom: 620 };
    const small = game.spawn(bounds, 0, 40, area)!;
    const large = game.spawn(bounds, 0, 56, area)!;
    expect(Math.hypot(small.x - large.x, small.y - large.y)).toBeGreaterThanOrEqual(40 + 56 + RULES.gap);
    expect(large.x + large.radius).toBeLessThanOrEqual(area.right - RULES.edge);
    expect(large.y - large.radius).toBeGreaterThanOrEqual(area.top);
    expect(large.y + large.radius).toBeLessThanOrEqual(area.bottom - RULES.edge);
  });

  it('keeps valid cookies and moves only invalid ones without changing identity or expiry', () => {
    const game = new SpawnManager(() => 0);
    const bounds = { width: 900, height: 700 };
    const first = game.spawn(bounds, 10)!;
    const second = game.spawn(bounds, 20, 56)!;
    const firstPosition = { x: first.x, y: first.y };
    const secondExpiry = second.expiresAt;
    const removed = game.resize({ width: 400, height: 500 }, { left: 0, top: 100, right: 250, bottom: 500 });
    expect(removed).toEqual([]);
    expect(game.active.get(first.id)).toBe(first);
    expect({ x: first.x, y: first.y }).toEqual(firstPosition);
    expect(game.active.get(second.id)).toBe(second);
    expect(second.expiresAt).toBe(secondExpiry);
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThanOrEqual(first.radius + second.radius + RULES.gap);
    expect(game.expire(secondExpiry)).toContain(second.id);
  });

  it('removes only cookies that cannot fit after resize without rewards', () => {
    const game = new SpawnManager(() => 0);
    const economy = new Economy();
    const first = game.spawn({ width: 900, height: 700 }, 10)!;
    const second = game.spawn({ width: 900, height: 700 }, 20)!;
    const removed = game.resize({ width: 104, height: 192 });
    expect(removed).toEqual([second.id]);
    expect(game.active.get(first.id)).toBe(first);
    expect(first.expiresAt).toBe(10 + RULES.lifetimeMs);
    expect(economy.balance).toBe(0n);
    expect(economy.cookiesDestroyed).toBe(0);
  });
});
