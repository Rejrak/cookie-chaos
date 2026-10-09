import { describe, expect, it } from 'vitest';
import { COOKIE_TYPES, RULES, SpawnManager, advanceGameTime, cookieProbabilities, cookieReward, selectCookieType } from './game';
import { Economy } from './economy';
import { UpgradeManager } from './upgrades';

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
    expect(game.spawn({ width: 103, height: RULES.hudHeight + 91 }, 0)).toBeUndefined();
    expect(game.spawn({ width: 104, height: RULES.hudHeight + 92 }, 0)).toBeDefined();
    expect(game.spawn({ width: 104, height: RULES.hudHeight + 92 }, 0)).toBeUndefined();
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

  it('fits an upgraded cookie between the stage HUD and mobile shop strip at 320×320', () => {
    const game = new SpawnManager(() => 0);
    const area = { left: 0, top: RULES.hudHeight, right: 320, bottom: 320 - 72 };
    const cookie = game.spawn({ width: 320, height: 320 }, 0, 56, area)!;
    expect(cookie).toBeDefined();
    expect(cookie.y - cookie.radius).toBeGreaterThanOrEqual(RULES.hudHeight);
    expect(cookie.y + cookie.radius).toBeLessThanOrEqual(area.bottom - RULES.edge);
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
    const removed = game.resize({ width: 104, height: RULES.hudHeight + 92 });
    expect(removed).toEqual([second.id]);
    expect(game.active.get(first.id)).toBe(first);
    expect(first.expiresAt).toBe(10 + RULES.lifetimeMs);
    expect(economy.balance).toBe(0n);
    expect(economy.cookiesDestroyed).toBe(0);
  });
});

describe('special cookies', () => {
  it('selects each type at exact weighted boundaries through the injected RNG', () => {
    expect(cookieProbabilities()).toEqual({ NORMAL: 8000, HARD: 1500, GOLDEN: 500, REINFORCED: 0, TITAN: 0 });
    for (const [roll, expected] of [[0, 'NORMAL'], [7999, 'NORMAL'], [8000, 'HARD'],
      [9499, 'HARD'], [9500, 'GOLDEN'], [9999, 'GOLDEN']] as const) {
      expect(selectCookieType(roll)).toBe(expected);
      const values = [0, 0, roll / 10_000];
      const game = new SpawnManager(() => values.shift() ?? 0);
      expect(game.spawn({ width: 300, height: 300 }, 0)?.type).toBe(expected);
    }
    expect(() => selectCookieType(10_000)).toThrow(RangeError);
    expect(new SpawnManager(() => 0.99).spawn({ width: 300, height: 300 }, 0, 40, undefined,
      { forcedType: 'NORMAL' })?.type).toBe('NORMAL');
  });

  it('uses Golden Luck only for subsequent spawns and keeps probabilities at 100%', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.recordHit(10_000n);
    const before = new SpawnManager(() => 0).spawn({ width: 300, height: 300 }, 0, 40, undefined,
      { forcedType: 'HARD' })!;
    for (let i = 0; i < 10; i++) expect(upgrades.buy('luck', economy)).toBe(true);
    expect(upgrades.goldenChanceBp).toBe(2500);
    const chances = cookieProbabilities(upgrades.goldenChanceBp);
    expect(chances).toEqual({ NORMAL: 6000, HARD: 1500, GOLDEN: 2500, REINFORCED: 0, TITAN: 0 });
    expect(Object.values(chances).reduce((sum, value) => sum + value, 0)).toBe(10_000);
    expect(selectCookieType(8000)).toBe('HARD');
    expect(selectCookieType(8000, upgrades.goldenChanceBp)).toBe('GOLDEN');
    expect(before.type).toBe('HARD');
    expect(upgrades.cost('luck')).toBeNull();
    expect(upgrades.buy('luck', economy)).toBe(false);
    expect(() => cookieProbabilities(8501)).toThrow(RangeError);
  });

  it('applies partial Hard damage, pays only on death, and never pays twice', () => {
    const game = new SpawnManager(() => 0);
    const economy = new Economy();
    const hard = game.spawn({ width: 300, height: 300 }, 0, 40, undefined, { forcedType: 'HARD' })!;
    expect(hard.maxHp).toBe(3);
    for (const hp of [2, 1]) {
      const hit = game.hit(hard.id, 1)!;
      expect(hit).toEqual({ destroyed: false, hp });
      economy.recordHit(null);
      expect(economy.balance).toBe(0n);
    }
    if (game.hit(hard.id, 1)?.destroyed) economy.recordHit(cookieReward(hard, 1n));
    expect(hard.hp).toBe(0);
    expect(game.hit(hard.id, 1)).toBeUndefined();
    expect(economy.balance).toBe(6n);
    expect(economy.validHits).toBe(3);
    expect(economy.cookiesDestroyed).toBe(1);
  });

  it('needs three, two, or one hit as Click Power rises', () => {
    for (const [powerLevel, expectedHits] of [[0, 3], [1, 2], [2, 1]] as const) {
      const economy = new Economy();
      const upgrades = new UpgradeManager();
      economy.recordHit(100n);
      for (let i = 0; i < powerLevel; i++) expect(upgrades.buy('power', economy)).toBe(true);
      expect(upgrades.damage).toBe(powerLevel + 1);
      const game = new SpawnManager(() => 0);
      const hard = game.spawn({ width: 300, height: 300 }, 0, 40, undefined, { forcedType: 'HARD' })!;
      let hits = 0;
      while (game.hit(hard.id, upgrades.damage)) hits++;
      expect(hits).toBe(expectedHits);
      expect(hard.hp).toBe(0);
    }
    expect(() => new SpawnManager().hit(1, 0)).toThrow(RangeError);
  });

  it('multiplies current Cookie Value using exact bigint for Golden and Hard', () => {
    const huge = 2n ** 60n;
    for (const [type, multiplier] of [['NORMAL', 1n], ['GOLDEN', 5n], ['HARD', 6n]] as const) {
      const game = new SpawnManager(() => 0);
      const economy = new Economy();
      const cookie = game.spawn({ width: 300, height: 300 }, 0, 40, undefined, { forcedType: type })!;
      expect(cookie.rewardMultiplier).toBe(multiplier);
      expect(cookieReward(cookie, huge)).toBe(huge * multiplier);
      expect(COOKIE_TYPES[type].multiplier).toBe(multiplier);
      if (game.hit(cookie.id, cookie.maxHp)?.destroyed) economy.recordHit(cookieReward(cookie, huge));
      if (game.hit(cookie.id, cookie.maxHp)?.destroyed) economy.recordHit(cookieReward(cookie, huge));
      expect(economy.balance).toBe(huge * multiplier);
    }
  });

  it('preserves type, partial HP, radius, reward and expiry on resize', () => {
    const game = new SpawnManager(() => 0);
    const hard = game.spawn({ width: 900, height: 700 }, 123, 56, undefined, { forcedType: 'HARD' })!;
    game.hit(hard.id, 1);
    const expiresAt = hard.expiresAt;
    expect(game.resize({ width: 320, height: 568 })).toEqual([]);
    expect(game.active.get(hard.id)).toBe(hard);
    expect(hard).toMatchObject({ type: 'HARD', hp: 2, maxHp: 3, radius: 56, expiresAt, rewardMultiplier: 6n });
  });

  it('expires special cookies without reward and pauses lifetimes with the modal shop', () => {
    const game = new SpawnManager(() => 0);
    const economy = new Economy();
    const golden = game.spawn({ width: 300, height: 300 }, 0, 40, undefined, { forcedType: 'GOLDEN' })!;
    let now = advanceGameTime(0, 3000, false);
    now = advanceGameTime(now, 10_000, true);
    expect(now).toBe(3000);
    expect(game.expire(now)).toEqual([]);
    now = advanceGameTime(now, 5000, false);
    expect(game.expire(now)).toEqual([golden.id]);
    expect(economy.balance).toBe(0n);
    expect(economy.cookiesDestroyed).toBe(0);
  });
});
