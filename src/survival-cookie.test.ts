import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import { bombChanceBp, cookieProbabilities, maxActiveBombs, selectCookieType, SpawnManager } from './game';
import { applyBombHit, applyCookieHit, applyExpiry } from './gameplay';
import { HealthManager } from './health';
import { StageManager } from './stage';

const area = { width: 900, height: 700 };

describe('M8 cookie hazards', () => {
  it('uses exact bomb weights without changing Golden Luck or other special weights', () => {
    for (const [stage, bombs, cap] of [[1, 0, 0], [4, 500, 1], [12, 500, 1],
      [13, 800, 1], [24, 800, 1], [25, 1000, 2]] as const) {
      expect(bombChanceBp(stage)).toBe(bombs);
      expect(maxActiveBombs(stage)).toBe(cap);
      const base = cookieProbabilities(500, stage);
      const lucky = cookieProbabilities(2500, stage);
      expect(base.BOMB).toBe(bombs);
      expect(base.GOLDEN).toBe(500);
      expect(lucky.GOLDEN).toBe(2500);
      expect(lucky.NORMAL).toBe(base.NORMAL - 2000);
      expect(Object.values(base).reduce((sum, value) => sum + value)).toBe(10_000);
      expect(Object.values(lucky).reduce((sum, value) => sum + value)).toBe(10_000);
      if (bombs) expect(selectCookieType(9999, 500, stage)).toBe('BOMB');
    }
    expect(() => new SpawnManager().spawn(area, 0, 40, undefined,
      { stageNumber: 3, forcedType: 'BOMB' })).toThrow(RangeError);
  });

  it('limits active bombs, keeps geometry valid, and first forced Normal available', () => {
    const game = new SpawnManager(() => 0);
    const first = game.spawn(area, 0, 40, undefined, { stageNumber: 25, forcedType: 'NORMAL' })!;
    const bomb1 = game.spawn(area, 0, 40, undefined, { stageNumber: 25, forcedType: 'BOMB' })!;
    const bomb2 = game.spawn(area, 0, 40, undefined, { stageNumber: 25, forcedType: 'BOMB' })!;
    const fallback = game.spawn(area, 0, 40, undefined, { stageNumber: 25, forcedType: 'BOMB' })!;
    expect([first.type, bomb1.type, bomb2.type, fallback.type]).toEqual(['NORMAL', 'BOMB', 'BOMB', 'NORMAL']);
    expect(bomb1.expiresAt).toBe(5000);
    expect(Math.hypot(bomb1.x - first.x, bomb1.y - first.y)).toBeGreaterThanOrEqual(92);
    const stage4 = new SpawnManager(() => 0);
    expect(stage4.spawn(area, 0, 40, undefined, { stageNumber: 4, forcedType: 'BOMB' })?.type).toBe('BOMB');
    expect(stage4.spawn(area, 0, 40, undefined, { stageNumber: 4, forcedType: 'BOMB' })?.type).toBe('NORMAL');
  });

  it('removes a clicked bomb once and never gives points, currency, or hit statistics', () => {
    const game = new SpawnManager(() => 0);
    const health = new HealthManager();
    const economy = new Economy();
    const stage = new StageManager();
    const bomb = game.spawn(area, 0, 40, undefined, { stageNumber: 4, forcedType: 'BOMB' })!;
    expect(applyCookieHit(game, economy, stage, bomb.id, 1, 10n)).toBeUndefined();
    expect(applyBombHit(game, health, stage, bomb.id, 0)).toBe('hp');
    expect(health.hp).toBe(4);
    expect(applyBombHit(game, health, stage, bomb.id, 1000)).toBeUndefined();
    expect(economy).toMatchObject({ balance: 0n, cookiesDestroyed: 0, validHits: 0 });
    expect(stage.progress).toBe(0n);
    expect(bomb).toMatchObject({ stagePoints: 0n, rewardMultiplier: 0n });
  });

  it('damages only for expired Reinforced and Titan, once per model expiry', () => {
    const game = new SpawnManager(() => 0);
    const health = new HealthManager();
    const stage = new StageManager();
    for (const [index, type] of (['NORMAL', 'HARD', 'GOLDEN', 'BOMB', 'REINFORCED', 'TITAN'] as const).entries()) {
      const cookie = game.spawn(area, index * 1000, 40, undefined, { stageNumber: 9, forcedType: type })!;
      const expired = game.expire(cookie.expiresAt);
      expect(expired).toContain(cookie);
      expect(game.expire(cookie.expiresAt)).toEqual([]);
      const before = health.hp;
      applyExpiry(cookie, health, stage, cookie.expiresAt);
      expect(health.hp).toBe(before - (type === 'REINFORCED' || type === 'TITAN' ? 1 : 0));
    }
    expect(health.hp).toBe(3);
    expect(stage.status).toBe('RUNNING');
  });

  it('does not count Bomb toward Tough fairness and never damages on resize removal', () => {
    const game = new SpawnManager(() => 0);
    for (let n = 0; n < 5; n++) {
      const normal = game.spawn(area, 0, 40, undefined,
        { stageNumber: 4, toughNeeded: true, forcedType: 'NORMAL' })!;
      game.hit(normal.id);
    }
    const bomb = game.spawn(area, 0, 40, undefined,
      { stageNumber: 4, toughNeeded: true, forcedType: 'BOMB' })!;
    expect(bomb.type).toBe('BOMB');
    game.hit(bomb.id);
    const normal = game.spawn(area, 0, 40, undefined,
      { stageNumber: 4, toughNeeded: true, forcedType: 'NORMAL' })!;
    expect(normal.type).toBe('NORMAL');
    game.hit(normal.id);
    const tough = game.spawn(area, 0, 40, undefined,
      { stageNumber: 4, toughNeeded: true, forcedType: 'NORMAL' })!;
    expect(tough.tough).toBe(true);
    const health = new HealthManager();
    game.resize({ width: 30, height: 30 });
    expect(game.active.size).toBe(0);
    expect(health.hp).toBe(5);
  });
});
