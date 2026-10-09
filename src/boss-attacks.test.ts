import { describe, expect, it } from 'vitest';
import { ATTACKS, BossAttackController } from './boss-attacks';
import { BossManager } from './boss';
import { applyDamage } from './gameplay';
import { HealthManager } from './health';
import { StageManager } from './stage';

describe('boss attacks and parry', () => {
  it('configures four rotated bosses, with a two-second first delay', () => {
    for (const [stage, id] of [[3, 'barbarian'], [6, 'knight'], [9, 'berserker'],
      [12, 'cookieng'], [15, 'barbarian'], [24, 'cookieng']] as const) {
      const attack = new BossAttackController(stage);
      expect(attack.name).toBe(ATTACKS[id].name);
      expect(attack.tick(1999, 'NORMAL')).toBe(0);
      expect(attack.state).toBe('IDLE');
      expect(attack.tick(1, 'NORMAL')).toBe(0);
      expect(attack.state).toBe('WARNING');
      expect(attack.attemptParry()).toBe(false);
    }
    expect(() => new BossAttackController(4)).toThrow(RangeError);
  });

  it('permits one parry only within the window and stuns for 800 ms', () => {
    const attack = new BossAttackController(3);
    attack.tick(2000, 'ARMOR');
    attack.tick(1599, 'ARMOR');
    expect(attack.attemptParry()).toBe(false);
    attack.tick(1, 'ARMOR');
    expect(attack.state).toBe('PARRY_WINDOW');
    expect(attack.attemptParry()).toBe(true);
    expect(attack.attemptParry()).toBe(false);
    expect(attack.tick(799, 'ARMOR')).toBe(0);
    expect(attack.state).toBe('RESOLVED');
    expect(attack.tick(1, 'ARMOR')).toBe(0);
    expect(attack.state).toBe('IDLE');
    expect(attack.tick(7999, 'BODY')).toBe(0);
    expect(attack.tick(1, 'BODY')).toBe(0);
    expect(attack.state).toBe('WARNING');
  });

  it('missed Barbarian and Knight attacks resolve once; shields protect HP', () => {
    for (const [stageNumber, phase, warning, window] of [[3, 'ARMOR', 1600, 800],
      [6, 'SHIELD', 1400, 750]] as const) {
      const attack = new BossAttackController(stageNumber);
      const health = new HealthManager();
      const stage = new StageManager();
      health.resetForStage(5, 1);
      attack.tick(2000 + warning, phase);
      expect(attack.tick(window - 1, phase)).toBe(0);
      expect(attack.tick(1, phase)).toBe(1);
      expect(applyDamage(health, stage, 1, 0)).toBe('shield');
      expect(health.hp).toBe(5);
      expect(attack.attemptParry()).toBe(false);
      attack.stop();
      expect(attack.tick(100_000, phase)).toBe(0);
    }
  });

  it('Berserker Rage uses two independent touch-size windows', () => {
    const attack = new BossAttackController(9);
    attack.tick(3200, 'RAGE');
    expect(attack).toMatchObject({ state: 'PARRY_WINDOW', strike: 1, strikesTotal: 2 });
    expect(attack.tick(750, 'RAGE')).toBe(1);
    expect(attack).toMatchObject({ state: 'WARNING', strike: 2 });
    expect(attack.tick(350, 'RAGE')).toBe(0);
    expect(attack.attemptParry()).toBe(true);
    expect(attack.tick(800, 'RAGE')).toBe(0);
    expect(attack.state).toBe('IDLE');
    const normal = new BossAttackController(9);
    normal.tick(3200, 'NORMAL');
    expect(normal.strikesTotal).toBe(1);
    expect(normal.tick(750, 'NORMAL')).toBe(1);
  });

  it('Golden Cookieng warns sooner and attacks more often without changing boss rewards', () => {
    const crown = new BossAttackController(12);
    crown.tick(2000, 'CROWN');
    expect(crown.remainingMs).toBe(1500);
    crown.tick(1500, 'CROWN');
    expect(crown.remainingMs).toBe(800);
    const golden = new BossAttackController(12);
    golden.tick(2000, 'GOLDEN');
    expect(golden.remainingMs).toBe(1200);
    golden.tick(1200, 'GOLDEN');
    expect(golden.remainingMs).toBe(700);
    expect(golden.tick(700, 'GOLDEN')).toBe(1);
    expect(golden.remainingMs).toBe(4500);
    const boss = new BossManager(12);
    expect(boss.config.multiplier).toBe(100n);
    expect(boss.hp).toBe(48);
  });

  it('rejects invalid time and never attacks after stop', () => {
    const attack = new BossAttackController(3);
    for (const delta of [-1, NaN, Infinity]) expect(() => attack.tick(delta, 'ARMOR')).toThrow(RangeError);
    attack.stop();
    expect(attack.attemptParry()).toBe(false);
    expect(attack.tick(100_000, 'ARMOR')).toBe(0);
  });
});
