import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import { UpgradeManager, valueCost } from './upgrades';

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
    expect(upgrades.cost('value')).toBe(11_414n);
    expect(valueCost(10n ** 10n)).toBe(100_000_000_140_000_000_014n);
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
      [0n, 14n, 700n], [5n, 109n, 909n], [10n, 254n, 1155n],
      [20n, 694n, 1653n], [30n, 1334n, 2152n],
      [50n, 3214n, 3151n], [100n, 11414n, 5651n],
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
    expect(previousTime).toBeLessThan(6000n);
  });
});
