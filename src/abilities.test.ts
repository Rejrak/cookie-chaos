import { describe, expect, it } from 'vitest';
import { AbilityManager, abilityCost, autoTarget, freeAbilityForBossStage } from './abilities';
import { Economy } from './economy';
import type { Cookie } from './game';

describe('AbilityManager', () => {
  it('uses exact bigint costs, respects funds and charge cap', () => {
    const abilities = new AbilityManager();
    const economy = new Economy();
    const stage = Number.MAX_SAFE_INTEGER;
    expect(abilityCost('RAIN', stage)).toBe(110n + 4n * BigInt(stage));
    expect(abilities.buy('RAIN', economy, stage)).toBe(false);
    economy.balance = abilityCost('RAIN', stage) * 4n;
    expect([1, 2, 3].map(() => abilities.buy('RAIN', economy, stage))).toEqual([true, true, true]);
    expect(abilities.buy('RAIN', economy, stage)).toBe(false);
    expect(economy.balance).toBe(abilityCost('RAIN', stage));
  });

  it('grants once per event, respects cap and keeps unused charges across stages', () => {
    const abilities = new AbilityManager();
    for (let i = 0; i < 3; i++) expect(abilities.grant('RAIN', `award:${i}`)).toBe(true);
    expect(abilities.grant('RAIN', 'award:3')).toBe(false);
    expect(abilities.grant('RAIN', 'award:3')).toBe(false);
    expect(abilities.activate('RAIN', true)).toBe(true);
    expect(abilities.charges('RAIN')).toBe(2);
    abilities.endStage();
    expect(abilities.charges('RAIN')).toBe(2);
  });

  it('ticks exact durations and cadences on the gameplay clock, pauses and stops', () => {
    const abilities = new AbilityManager();
    abilities.grant('RAIN', 'rain'); abilities.grant('AUTO', 'auto');
    expect(abilities.activate('RAIN', false)).toBe(false);
    expect(abilities.activate('RAIN', true)).toBe(true);
    expect(abilities.activate('AUTO', true)).toBe(true);
    expect(abilities.activate('AUTO', true)).toBe(false);
    expect(abilities.tick(5000, 1500, true)).toEqual({ rain: 0, auto: 0 });
    expect(abilities.tick(599, 1500)).toEqual({ rain: 0, auto: 0 });
    expect(abilities.tick(1, 1500)).toEqual({ rain: 0, auto: 1 });
    expect(abilities.tick(11_400, 1500)).toEqual({ rain: 4, auto: 14 });
    expect(abilities.remainingMs('RAIN')).toBe(0);
    expect(abilities.remainingMs('AUTO')).toBe(0);
    expect(abilities.tick(10_000, 1500)).toEqual({ rain: 0, auto: 0 });
    abilities.grant('AUTO', 'again');
    expect(abilities.activate('AUTO', true)).toBe(true);
    abilities.endStage();
    expect(abilities.tick(20_000, 1500)).toEqual({ rain: 0, auto: 0 });
  });

  it('expires and cools down correctly when one frame crosses the whole effect', () => {
    const abilities = new AbilityManager();
    abilities.grant('AUTO', 'first'); abilities.grant('AUTO', 'second');
    expect(abilities.activate('AUTO', true)).toBe(true);
    expect(abilities.tick(9500, 1500).auto).toBe(15);
    expect(abilities.cooldownMs('AUTO')).toBe(500);
    expect(abilities.activate('AUTO', true)).toBe(false);
    abilities.tick(500, 1500);
    expect(abilities.activate('AUTO', true)).toBe(true);
  });

  it('produces the same opportunities for variable frame deltas and rejects invalid input', () => {
    const one = new AbilityManager();
    const split = new AbilityManager();
    for (const manager of [one, split]) {
      manager.grant('RAIN', 'r'); manager.grant('AUTO', 'a');
      manager.activate('RAIN', true); manager.activate('AUTO', true);
    }
    const total = one.tick(9000, 1500);
    const pieces = [17, 283, 700, 1000, 2000, 5000].map(delta => split.tick(delta, 1500));
    expect(pieces.reduce((sum, part) => ({ rain: sum.rain + part.rain, auto: sum.auto + part.auto }),
      { rain: 0, auto: 0 })).toEqual(total);
    expect(() => one.tick(Infinity, 1500)).toThrow(RangeError);
    expect(() => one.tick(-1, 1500)).toThrow(RangeError);
  });

  it('targets collectible Tough near expiry, then other cookies by stable order', () => {
    const cookie = (id: number, type: Cookie['type'], expiresAt: number): Cookie =>
      ({ id, type, expiresAt, hp: 2, maxHp: 2, x: 0, y: 0, radius: 40, rewardMultiplier: 1n,
        stagePoints: 1n, tough: type === 'HARD' });
    expect(autoTarget([cookie(1, 'NORMAL', 1), cookie(2, 'BOMB', 0), cookie(4, 'HARD', 9), cookie(3, 'HARD', 9)])?.id).toBe(3);
    expect(autoTarget([cookie(2, 'BOMB', 0)])).toBeUndefined();
    expect(autoTarget([cookie(1, 'HARD', 4)], 4)).toBeUndefined();
    expect([3, 6, 9, 12, 15, 18].map(freeAbilityForBossStage))
      .toEqual(['RAIN', 'AUTO', undefined, undefined, 'RAIN', 'AUTO']);
  });
});
