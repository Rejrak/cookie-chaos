import { describe, expect, it } from 'vitest';
import { COOKIE_TYPES, SpawnManager, cookieProbabilities, selectCookieType } from './game';
import { Economy } from './economy';
import { StageManager } from './stage';
import { applyCookieHit } from './gameplay';

describe('Reinforced and Titan cookies', () => {
  it('keeps Normal Stage Points fixed when Cookie Value exceeds safe number range', () => {
    const game = new SpawnManager(() => 0);
    const economy = new Economy();
    const stage = new StageManager(() => ({ target: 2n, durationMs: 30_000,
      isBossCheckpoint: false, toughRequired: 0 }));
    const cookie = game.spawn({ width: 300, height: 300 }, 0, 40, undefined,
      { forcedType: 'NORMAL' })!;
    const value = 2n ** 60n;
    expect(applyCookieHit(game, economy, stage, cookie.id, 1, value)).toMatchObject({
      currencyReward: value, stagePoints: 1n });
    expect(economy.balance).toBe(value);
    expect(stage.progress).toBe(1n);
    expect(stage.currencyEarned).toBe(value);
    expect(applyCookieHit(game, economy, stage, cookie.id, 1, value)).toBeUndefined();
  });

  it('preserves type and partial HP on expiry without granting rewards', () => {
    const game = new SpawnManager(() => 0);
    const cookie = game.spawn({ width: 300, height: 300 }, 100, 40, undefined,
      { stageNumber: 9, forcedType: 'TITAN' })!;
    game.hit(cookie.id, 2);
    expect(game.expire(cookie.expiresAt)).toEqual([cookie]);
    expect(cookie).toMatchObject({ type: 'TITAN', hp: 7, stagePoints: 8n });
    expect(game.active.size).toBe(0);
  });

  it('unlocks types at stages 4 and 9 with exact basis point weights', () => {
    expect(cookieProbabilities(500, 4)).toEqual({ NORMAL: 6500, HARD: 1500, GOLDEN: 500,
      REINFORCED: 1000, TITAN: 0, BOMB: 500 });
    expect(cookieProbabilities(500, 9)).toEqual({ NORMAL: 6000, HARD: 1500, GOLDEN: 500,
      REINFORCED: 1000, TITAN: 500, BOMB: 500 });
    expect(cookieProbabilities(2500, 9)).toEqual({ NORMAL: 4000, HARD: 1500, GOLDEN: 2500,
      REINFORCED: 1000, TITAN: 500, BOMB: 500 });
    for (const [stage, roll, type] of [[4, 8499, 'GOLDEN'], [4, 8500, 'REINFORCED'],
      [9, 8999, 'REINFORCED'], [9, 9000, 'TITAN']] as const) {
      expect(selectCookieType(roll, 500, stage)).toBe(type);
      const draws = [0, 0, roll / 10_000];
      expect(new SpawnManager(() => draws.shift() ?? 0).spawn({ width: 300, height: 300 }, 0, 40,
        undefined, { stageNumber: stage })?.type).toBe(type);
    }
    expect(() => new SpawnManager().spawn({ width: 300, height: 300 }, 0, 40, undefined,
      { stageNumber: 3, forcedType: 'REINFORCED' })).toThrow(RangeError);
    expect(() => new SpawnManager().spawn({ width: 300, height: 300 }, 0, 40, undefined,
      { stageNumber: 8, forcedType: 'TITAN' })).toThrow(RangeError);
    expect(Object.values(cookieProbabilities(2500, 9)).reduce((sum, n) => sum + n, 0)).toBe(10_000);
  });

  it('scales HP, preserves partial damage on resize, and pays only once on destruction', () => {
    for (const [stage, type, hp, multiplier, points] of [[4, 'REINFORCED', 5, 8n, 5n],
      [9, 'TITAN', 9, 14n, 8n], [16, 'REINFORCED', 6, 8n, 5n],
      [21, 'TITAN', 11, 14n, 8n]] as const) {
      const game = new SpawnManager(() => 0);
      const cookie = game.spawn({ width: 900, height: 700 }, 0, 40, undefined,
        { stageNumber: stage, forcedType: type })!;
      const economy = new Economy();
      const stageModel = new StageManager(() => ({ target: 100n, durationMs: 90_000, isBossCheckpoint: false, toughRequired: 0 }));
      expect(cookie).toMatchObject({ hp, maxHp: hp, rewardMultiplier: multiplier, stagePoints: points, tough: true });
      expect(applyCookieHit(game, economy, stageModel, cookie.id, 2, 3n)).toMatchObject({
        hp: hp - 2, currencyReward: null, stagePoints: null });
      const expiry = cookie.expiresAt;
      game.resize({ width: 320, height: 568 });
      expect(game.active.get(cookie.id)).toBe(cookie);
      expect(cookie).toMatchObject({ hp: hp - 2, maxHp: hp, expiresAt: expiry });
      while (game.active.has(cookie.id)) applyCookieHit(game, economy, stageModel, cookie.id, 2, 3n);
      expect(economy.balance).toBe(multiplier * 3n);
      expect(stageModel.progress).toBe(points);
      expect(applyCookieHit(game, economy, stageModel, cookie.id, 2, 3n)).toBeUndefined();
      expect(COOKIE_TYPES[type].stagePoints).toBe(points);
    }
  });

  it('forces an unlocked Tough cookie after six successful non-Tough spawns only when needed', () => {
    for (const [stage, expected] of [[1, 'HARD'], [4, 'REINFORCED'], [9, 'TITAN']] as const) {
      const game = new SpawnManager(() => 0.99);
      for (let i = 0; i < 6; i++) {
        const normal = game.spawn({ width: 300, height: 300 }, 0, 40, undefined,
          { stageNumber: stage, toughNeeded: true, forcedType: 'NORMAL' })!;
        game.hit(normal.id);
      }
      expect(game.spawn({ width: 103, height: 211 }, 0, 40, undefined,
        { stageNumber: stage, toughNeeded: true, forcedType: 'NORMAL' })).toBeUndefined();
      const guaranteed = game.spawn({ width: 300, height: 300 }, 0, 40, undefined,
        { stageNumber: stage, toughNeeded: true, forcedType: 'NORMAL' })!;
      expect(guaranteed.type).toBe(expected);
      game.hit(guaranteed.id, guaranteed.hp);
      const normal = game.spawn({ width: 300, height: 300 }, 0, 40, undefined,
        { stageNumber: stage, toughNeeded: false, forcedType: 'NORMAL' })!;
      expect(normal.type).toBe('NORMAL');
    }
  });
});
