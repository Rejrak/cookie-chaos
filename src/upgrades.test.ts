import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import { UpgradeManager, powerCost, valueCost } from './upgrades';

describe('UpgradeManager', () => {
  it('grows integer costs, increases reward, and deducts only successful purchases', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    expect(upgrades.cost('value')).toBe(14n);
    expect(upgrades.buy('value', economy)).toBe(false);
    expect(upgrades.level('value')).toBe(0n);
    economy.recordHit(43n);
    expect(upgrades.buy('value', economy)).toBe(true);
    expect(upgrades.level('value')).toBe(1n);
    expect(upgrades.cost('value')).toBe(29n);
    expect(upgrades.reward).toBe(2n);
    expect(economy.balance).toBe(29n);
    expect(upgrades.buy('value', economy)).toBe(true);
    expect(upgrades.cost('value')).toBe(46n);
    expect(economy.balance).toBe(0n);
    expect(economy.lifetimeEarned).toBe(43n);
  });

  it('caps cookie radius and refuses purchases without benefit', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.recordHit(1_000n);
    for (let i = 0; i < 4; i++) expect(upgrades.buy('size', economy)).toBe(true);
    expect(upgrades.radius).toBe(56);
    expect(upgrades.cost('size')).toBeNull();
    const balance = economy.balance;
    expect(upgrades.buy('size', economy)).toBe(false);
    expect(economy.balance).toBe(balance);
  });

  it('caps spawn interval at 500 ms', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.recordHit(10_000n);
    for (let i = 0; i < 10; i++) expect(upgrades.buy('speed', economy)).toBe(true);
    expect(upgrades.spawnMs).toBe(500);
    expect(upgrades.cost('speed')).toBeNull();
    const balance = economy.balance;
    expect(upgrades.buy('speed', economy)).toBe(false);
    expect(economy.balance).toBe(balance);
  });

  it('unlocks M2 placeholders with useful levels and capped purchases', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    expect(upgrades.damage).toBe(1);
    expect(upgrades.goldenChanceBp).toBe(500);
    expect(upgrades.buy('power', economy)).toBe(false);
    expect(upgrades.buy('luck', economy)).toBe(false);
    economy.recordHit(1_000n);
    // M3 unlocks these M2 placeholders; failed purchases at their caps still cost nothing.
    expect(upgrades.cost('power')).toBe(25n);
    expect(upgrades.cost('luck')).toBe(40n);
    expect(upgrades.buy('power', economy)).toBe(true);
    expect(upgrades.damage).toBe(2);
    expect(upgrades.cost('power')).toBe(38n);
    expect(upgrades.buy('power', economy)).toBe(true);
    expect(upgrades.damage).toBe(3);
    expect(upgrades.cost('power')).toBeNull();
    const balance = economy.balance;
    expect(upgrades.buy('power', economy)).toBe(false);
    expect(economy.balance).toBe(balance);
    expect(upgrades.buy('luck', economy)).toBe(true);
    expect(upgrades.goldenChanceBp).toBe(700);
    expect(upgrades.cost('luck')).toBe(60n);
  });

  it('keeps value upgrade arithmetic exact at large levels', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.recordHit(10n ** 100n);
    for (let i = 0; i < 100; i++) expect(upgrades.buy('value', economy)).toBe(true);
    expect(upgrades.reward).toBe(101n);
    expect(upgrades.cost('value')).toBe(239_694n);
    const hugeLevel = 10n ** 10n;
    expect(valueCost(hugeLevel)).toBe((14n * (hugeLevel + 1n) + hugeLevel * hugeLevel) * (1n + hugeLevel / 5n));
    expect(() => valueCost(-1n)).toThrow(RangeError);
  });

  it('makes the first purchase available near 20 seconds with perfect base-rate clicks', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    let firstAffordableAt = -1;
    for (let time = 0; time <= 30_000; time += 1500) {
      economy.recordHit(1n);
      if (upgrades.cost('value')! <= economy.balance) { firstAffordableAt = time; break; }
    }
    expect(firstAffordableAt).toBe(19_500);
  });

  it('simulates each zero-balance purchase at two cookies per second', () => {
    const samples = [
      [0n, 14n, 700n], [5n, 218n, 1817n], [10n, 762n, 3464n],
      [20n, 3470n, 8262n], [30n, 9338n, 15062n],
      [50n, 35354n, 34661n], [100n, 239694n, 118661n],
    ] as const;
    let previousCost = 0n;
    let previousTime = 0n;
    for (const [level, expectedCost, expectedHundredths] of samples) {
      const cost = valueCost(level);
      const reward = level + 1n;
      const timeHundredths = (cost * 100n + 2n * reward - 1n) / (2n * reward);
      expect(cost).toBe(expectedCost);
      expect(timeHundredths).toBe(expectedHundredths);
      expect(cost).toBeGreaterThan(previousCost);
      expect(timeHundredths).toBeGreaterThan(previousTime);
      previousCost = cost;
      previousTime = timeHundredths;
    }
    expect(previousTime).toBeLessThan(120000n);
  });

  it('unlocks two Click Power levels only after each completed cycle', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.grantBossReward(10_000n);
    expect([0n, 1n, 2n, 3n, 4n].map(powerCost)).toEqual([25n, 38n, 55n, 76n, 101n]);
    expect(powerCost(10n ** 20n)).toBe(2n * 10n ** 40n + 11n * 10n ** 20n + 25n);
    expect(() => powerCost(-1n)).toThrow(RangeError);
    upgrades.unlockThroughStage(11);
    expect(upgrades.powerLimit).toBe(2n);
    expect(upgrades.buy('power', economy)).toBe(true);
    expect(upgrades.buy('power', economy)).toBe(true);
    expect(upgrades.cost('power')).toBeNull();
    const balance = economy.balance;
    expect(upgrades.buy('power', economy)).toBe(false);
    expect(economy.balance).toBe(balance);
    upgrades.unlockThroughStage(12);
    expect(upgrades.powerLimit).toBe(4n);
    expect(upgrades.cost('power')).toBe(55n);
    expect(upgrades.buy('power', economy)).toBe(true);
    expect(upgrades.buy('power', economy)).toBe(true);
    expect(upgrades.damage).toBe(5);
    expect(upgrades.cost('power')).toBeNull();
    upgrades.unlockThroughStage(24);
    expect(upgrades.powerLimit).toBe(6n);
    expect(upgrades.cost('power')).toBe(101n);
    expect(() => upgrades.unlockThroughStage(23)).toThrow(RangeError);
    for (const invalid of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => upgrades.unlockThroughStage(invalid)).toThrow(RangeError);
    }
  });

  it('rejects an unlocked purchase without enough currency', () => {
    const upgrades = new UpgradeManager();
    const economy = new Economy();
    economy.grantBossReward(63n);
    upgrades.buy('power', economy);
    upgrades.buy('power', economy);
    upgrades.unlockThroughStage(12);
    expect(upgrades.buy('power', economy)).toBe(false);
    expect(upgrades.level('power')).toBe(2n);
    expect(economy.balance).toBe(0n);
  });

  it('raises only later Value and Spawn Speed prices while keeping Click Power costs', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.recordHit(100_000n);
    expect([0n, 1n, 2n, 3n, 4n, 5n, 15n].map(valueCost))
      .toEqual([14n, 29n, 46n, 65n, 86n, 218n, 1796n]);
    const speedPrices = [];
    for (let level = 0; level <= 7; level++) {
      speedPrices.push(upgrades.cost('speed'));
      expect(upgrades.buy('speed', economy)).toBe(true);
    }
    expect(speedPrices).toEqual([20n, 30n, 45n, 68n, 204n, 304n, 456n, 684n]);
    expect(upgrades.cost('power')).toBe(25n);
    expect(upgrades.buy('power', economy)).toBe(true);
    expect(upgrades.cost('power')).toBe(38n);
  });
});
