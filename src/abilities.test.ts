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

  it('grants once per event and preserves a full-cap award until consumption', () => {
    const abilities = new AbilityManager();
    for (let i = 0; i < 3; i++) expect(abilities.grant('RAIN', `award:${i}`)).toBe(true);
    expect(abilities.grant('RAIN', 'award:3')).toBe(true);
    expect(abilities.grant('RAIN', 'award:3')).toBe(false);
    expect(abilities.activate('RAIN', true)).toBe(true);
    expect(abilities.charges('RAIN')).toBe(3);
    abilities.endStage();
    expect(abilities.charges('RAIN')).toBe(3);
  });

  it('ticks exact durations and cadences on the gameplay clock, pauses and stops', () => {
    const abilities = new AbilityManager();
    abilities.grant('RAIN', 'rain'); abilities.grant('AUTO', 'auto');
    expect(abilities.activate('RAIN', false)).toBe(false);
    expect(abilities.activate('RAIN', true)).toBe(true);
    expect(abilities.activate('AUTO', true)).toBe(true);
    expect(abilities.activate('AUTO', true)).toBe(false);
    expect(abilities.tick(5000, 1500, true)).toEqual({ rain: 0, auto: 0 });
    expect(abilities.tick(799, 1500)).toEqual({ rain: 0, auto: 0 });
    expect(abilities.tick(1, 1500)).toEqual({ rain: 0, auto: 1 });
    expect(abilities.tick(11_200, 1500)).toEqual({ rain: 4, auto: 10 });
    expect(abilities.remainingMs('RAIN')).toBe(0);
    expect(abilities.remainingMs('AUTO')).toBe(0);
    expect(abilities.tick(10_000, 1500)).toEqual({ rain: 0, auto: 0 });
    abilities.grant('AUTO', 'again');
    expect(abilities.activate('AUTO', true)).toBe(true);
    abilities.endStage();
    expect(abilities.tick(20_000, 1500)).toEqual({ rain: 0, auto: 0 });
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
