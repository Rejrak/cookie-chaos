import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import { UpgradeManager } from './upgrades';

describe('UpgradeManager', () => {
  it('grows integer costs, increases reward, and deducts only successful purchases', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    expect(upgrades.cost('value')).toBe(14n);
    expect(upgrades.buy('value', economy)).toBe(false);
    expect(upgrades.level('value')).toBe(0n);
    economy.recordHit(35n);
    expect(upgrades.buy('value', economy)).toBe(true);
    expect(upgrades.level('value')).toBe(1n);
    expect(upgrades.cost('value')).toBe(21n);
    expect(upgrades.reward).toBe(2n);
    expect(economy.balance).toBe(21n);
    expect(upgrades.buy('value', economy)).toBe(true);
    expect(upgrades.cost('value')).toBe(32n);
    expect(economy.balance).toBe(0n);
    expect(economy.lifetimeEarned).toBe(35n);
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

  it('keeps future upgrades locked without charging currency', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.recordHit(1_000n);
    expect(upgrades.cost('power')).toBeNull();
    expect(upgrades.cost('luck')).toBeNull();
    expect(upgrades.buy('power', economy)).toBe(false);
    expect(upgrades.buy('luck', economy)).toBe(false);
    expect(economy.balance).toBe(1_000n);
  });

  it('keeps value upgrade arithmetic exact at large levels', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.recordHit(10n ** 100n);
    for (let i = 0; i < 100; i++) expect(upgrades.buy('value', economy)).toBe(true);
    expect(upgrades.reward).toBe(101n);
    expect(upgrades.cost('value')).toBe((14n * 3n ** 100n + 2n ** 100n - 1n) / 2n ** 100n);
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
});
