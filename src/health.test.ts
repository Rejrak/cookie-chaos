import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import { applyDamage } from './gameplay';
import { HealthManager } from './health';
import { StageManager } from './stage';
import { UpgradeManager } from './upgrades';

describe('survival core', () => {
  it('uses shields per event, then HP, with active-time invulnerability and clamping', () => {
    const health = new HealthManager();
    expect(health).toMatchObject({ hp: 5, maxHp: 5, shields: 0 });
    health.resetForStage(7, 2);
    expect(health.takeDamage(3, 0)).toBe('shield');
    expect(health.shields).toBe(1);
    expect(health.takeDamage(3, 749)).toBe('invulnerable');
    expect(health.takeDamage(3, 750)).toBe('shield');
    expect(health.takeDamage(3, 1500)).toBe('hp');
    expect(health.hp).toBe(4);
    health.heal(99);
    expect(health.hp).toBe(7);
    expect(health.takeDamage(99, 2250)).toBe('hp');
    expect(health.hp).toBe(0);
    expect(health.isDead).toBe(true);
    expect(health.takeDamage(1, 3000)).toBe('invulnerable');
    expect(health.damageEvents).toBe(2);
    expect(health.blockedEvents).toBe(2);
    health.resetForStage(6, 1);
    expect(health).toMatchObject({ hp: 6, maxHp: 6, shields: 1, invulnerableUntil: 0 });
    for (const value of [0, -1, 1.5, Infinity]) {
      expect(() => health.takeDamage(value, 0)).toThrow(RangeError);
      expect(() => health.heal(value)).toThrow(RangeError);
    }
  });

  it('fails once for health depletion, blocks terminal damage, then retries cleanly', () => {
    const health = new HealthManager();
    const stage = new StageManager();
    expect(applyDamage(health, stage, 5, 0)).toBe('hp');
    expect(stage).toMatchObject({ status: 'FAILED', failureReason: 'HEALTH_DEPLETED' });
    expect(applyDamage(health, stage, 1, 1000)).toBeUndefined();
    expect(stage.fail('TIMEOUT')).toBe(false);
    expect(stage.retry()).toBe(true);
    health.resetForStage(5, 0);
    expect(stage.failureReason).toBeNull();
    expect(applyDamage(health, stage, 1, 0, true)).toBeUndefined();
    expect(health.hp).toBe(5);
    expect(stage.tick(stage.remainingMs)).toBe('FAILED');
    expect(stage.failureReason).toBe('TIMEOUT');
    expect(stage.retry()).toBe(true);
    expect(() => stage.fail('BAD' as never)).toThrow(RangeError);
  });

  it('purchases defense only with funds and resets permanent upgrades on each stage', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    const health = new HealthManager();
    expect(upgrades.buy('health', economy)).toBe(false);
    expect(upgrades.buy('shield', economy)).toBe(false);
    economy.recordHit(2000n);
    for (const cost of [40n, 85n, 145n, 220n, 310n]) {
      expect(upgrades.cost('health')).toBe(cost);
      expect(upgrades.buy('health', economy)).toBe(true);
    }
    expect(upgrades.cost('health')).toBeNull();
    for (const cost of [60n, 135n, 240n]) {
      expect(upgrades.cost('shield')).toBe(cost);
      expect(upgrades.buy('shield', economy)).toBe(true);
    }
    expect(upgrades.cost('shield')).toBeNull();
    health.resetForStage(upgrades.maxHp, upgrades.stageShields);
    expect(health).toMatchObject({ maxHp: 10, hp: 10, shields: 3 });
    health.takeDamage(1, 0);
    health.resetForStage(upgrades.maxHp, upgrades.stageShields);
    expect(health.shields).toBe(3);
    expect(upgrades.level('shield')).toBe(3n);
    expect(economy.balance).toBe(765n);
  });

  it('applies mid-stage health and shield purchases once without exceeding caps', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    const health = new HealthManager();
    economy.recordHit(500n);
    health.takeDamage(2, 0);
    if (upgrades.buy('health', economy)) health.increaseMaxHealth();
    expect(health).toMatchObject({ maxHp: 6, hp: 4 });
    if (upgrades.buy('shield', economy)) health.addShield(upgrades.stageShields);
    expect(health.shields).toBe(1);
    health.addShield(upgrades.stageShields);
    expect(health.shields).toBe(1);
  });
});
