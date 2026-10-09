import { describe, expect, it } from 'vitest';
import { BOSS_RULES, BOSSES, BossManager, bossForStage } from './boss';
import { Economy } from './economy';
import { SpawnManager } from './game';
import { applyBossHit, applyCookieHit } from './gameplay';
import { StageManager, stageConfig } from './stage';
import { UpgradeManager } from './upgrades';
import { cycleForStage } from './cycle';

function reachStage(number: number) {
  const stage = new StageManager();
  while (stage.stageNumber < number) {
    stage.recordReward(stage.target);
    if (stage.status === 'BOSS_FIGHT') stage.completeBoss();
    expect(stage.continue()).toBe(true);
  }
  return stage;
}

describe('BossManager', () => {
  it('configures four distinct bosses and rotates them across cycles', () => {
    expect(Object.values(BOSSES).map(boss => [boss.stage, boss.protectionHp, boss.bodyHp, boss.durationMs, boss.multiplier]))
      .toEqual([[3, 8, 14, 25_000, 20n], [6, 12, 22, 32_000, 35n],
        [9, 0, 34, 38_000, 60n], [12, 20, 48, 50_000, 100n]]);
    for (const number of [1, 2, 4, 5, 13, 14]) expect(bossForStage(number)).toBeUndefined();
    expect(stageConfig(15).isBossCheckpoint).toBe(true);
    expect(bossForStage(15)).toMatchObject({ id: 'barbarian', name: 'Cookie Barbarian 2', bodyHp: 22, protectionHp: 11, multiplier: 40n });
  });

  it('uses Click Power 0–2 and keeps HP nonnegative at all rates', () => {
    for (const boss of Object.values(BOSSES)) {
      let previousClicks = Infinity;
      for (const damage of [1, 2, 3]) {
        const upgrades = new UpgradeManager();
        const wallet = new Economy();
        wallet.recordHit(100n);
        for (let level = 1; level < damage; level++) expect(upgrades.buy('power', wallet)).toBe(true);
        expect(upgrades.damage).toBe(damage);
        const fight = new BossManager(boss.stage);
        let clicks = 0;
        while (!fight.defeated) {
          const hit = fight.hit(upgrades.damage, clicks * 500, 2n)!;
          expect(hit.damageDealt).toBeGreaterThan(0);
          expect(hit.hp).toBeGreaterThanOrEqual(0);
          expect(hit.protectionHp).toBeGreaterThanOrEqual(0);
          expect(hit.reward).toBe(hit.defeated ? 2n * boss.multiplier : null);
          clicks++;
        }
        expect(clicks).toBeLessThan(previousClicks);
        expect((clicks - 1) * 500).toBeLessThan(boss.durationMs);
        expect(fight.hit(damage, clicks * 500, 2n)).toBeUndefined();
        previousClicks = clicks;
      }
    }
  });

  it('rejects invalid damage, reward, and time', () => {
    const fight = new BossManager(3);
    for (const damage of [0, -1, 1.5, Infinity, NaN]) expect(() => fight.hit(damage, 0, 1n)).toThrow(RangeError);
    expect(() => fight.hit(1, -1, 1n)).toThrow(RangeError);
    expect(() => fight.hit(1, 0, 0n)).toThrow(RangeError);
    expect(() => fight.tick(NaN)).toThrow(RangeError);
    expect(() => new Economy().grantBossReward(0n)).toThrow(RangeError);
  });

  it('breaks Barbarian armor without damage carry and doubles only within 3 seconds', () => {
    const fight = new BossManager(3);
    expect(fight.phase).toBe('ARMOR');
    expect(fight.hit(3, 0, 1n)).toMatchObject({ damageDealt: 3, protectionHp: 5, hp: 14, reward: null });
    fight.hit(3, 500, 1n);
    expect(fight.hit(3, 1000, 1n)).toMatchObject({ damageDealt: 2, protectionHp: 0, hp: 14,
      phase: 'VULNERABLE', phaseChanged: true });
    expect(fight.hit(2, 3999, 1n)).toMatchObject({ damageDealt: 4, hp: 10, phase: 'VULNERABLE' });
    expect(fight.hit(2, 4000, 1n)).toMatchObject({ damageDealt: 2, hp: 8, phase: 'BODY', phaseChanged: true });
    expect(fight.tick(9000)).toBe(false);
  });

  it('keeps Knight body protected until shield breaks permanently', () => {
    const fight = new BossManager(6);
    expect(fight.hit(20, 0, 1n)).toMatchObject({ damageDealt: 12, hp: 22, protectionHp: 0,
      phase: 'BODY', phaseChanged: true, reward: null });
    expect(fight.hit(3, 100, 1n)).toMatchObject({ damageDealt: 3, hp: 19, protectionHp: 0, phase: 'BODY' });
    expect(fight.tick(10_000)).toBe(false);
    expect(fight.protectionHp).toBe(0);
  });

  it('activates Berserker Rage at half HP and awards every third timely rage hit', () => {
    const fight = new BossManager(9);
    expect(fight.hit(16, 0, 1n)).toMatchObject({ hp: 18, phase: 'NORMAL', rageActivated: false });
    expect(fight.hit(1, 100, 1n)).toMatchObject({ hp: 17, phase: 'RAGE', rageActivated: true });
    expect(fight.comboCount).toBe(0);
    expect(fight.hit(1, 200, 1n)).toMatchObject({ hp: 16, comboBonus: 0 });
    expect(fight.hit(1, 1500, 1n)).toMatchObject({ hp: 15, comboBonus: 0 });
    expect(fight.hit(1, 2800, 1n)).toMatchObject({ hp: 13, comboBonus: 1 });
    expect(fight.comboCount).toBe(0);
    fight.hit(1, 3000, 1n);
    expect(fight.tick(4301)).toBe(true);
    expect(fight.comboCount).toBe(0);
    expect(fight.hit(1, 4302, 1n)).toMatchObject({ comboBonus: 0 });
    expect(() => fight.hit(1, 4000, 1n)).toThrow(RangeError);
    expect(BOSS_RULES.comboWindowMs).toBe(1300);
  });

  it('makes Cookieng body invulnerable until Crown breaks, then enters Golden form', () => {
    const fight = new BossManager(12);
    expect(fight.hit(19, 0, 2n)).toMatchObject({ hp: 48, protectionHp: 1, phase: 'CROWN', reward: null });
    expect(fight.hit(3, 100, 2n)).toMatchObject({ damageDealt: 1, hp: 48, protectionHp: 0,
      phase: 'GOLDEN', phaseChanged: true, reward: null });
    expect(fight.hit(47, 200, 2n)).toMatchObject({ hp: 1, defeated: false, reward: null });
    expect(fight.hit(3, 300, 2n)).toMatchObject({ hp: 0, defeated: true, reward: 200n });
    expect(fight.hit(3, 400, 2n)).toBeUndefined();
  });
});

describe('stage and economy boss integration', () => {
  it('finishes ordinary stages directly, starts boss timer fresh, and never carries collection time', () => {
    const ordinary = reachStage(2);
    ordinary.recordReward(ordinary.target);
    expect(ordinary.status).toBe('COMPLETED');
    const stage = reachStage(3);
    stage.tick(stage.remainingMs - 1);
    stage.recordReward(stage.target);
    expect(stage).toMatchObject({ status: 'BOSS_FIGHT', remainingMs: 25_000, durationMs: 25_000,
      progress: 30n, maxCompletedStage: 2 });
    expect(stage.recordReward(1n)).toBe(false);
    expect(stage.continue()).toBe(false);
    expect(stage.retry()).toBe(false);
    expect(stage.tick(25_000, true)).toBe('BOSS_FIGHT');
    expect(stage.tick(24_999)).toBe('BOSS_FIGHT');
    expect(stage.tick(1)).toBe('FAILED');
    expect(stage.completeBoss()).toBe(false);
    expect(stage.retry()).toBe(true);
    expect(stage).toMatchObject({ stageNumber: 3, status: 'RUNNING', progress: 0n, remainingMs: 50_000 });
    expect(stage.retry()).toBe(false);
  });

  it('fails collection at exact timeout and gives no boss', () => {
    const stage = reachStage(3);
    expect(stage.tick(stage.remainingMs)).toBe('FAILED');
    expect(stage.recordReward(stage.target)).toBe(false);
    expect(stage.completeBoss()).toBe(false);
  });

  it('ignores normal cookie hits during boss, pays boss once, and advances once', () => {
    const stage = reachStage(3);
    const spawns = new SpawnManager(() => 0);
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.recordHit(100n);
    expect(upgrades.buy('power', economy)).toBe(true);
    const cookie = spawns.spawn({ width: 300, height: 300 }, 0)!;
    stage.recordReward(stage.target);
    expect(applyCookieHit(spawns, economy, stage, cookie.id, upgrades.damage, upgrades.reward)).toBeUndefined();
    const fight = new BossManager(3);
    let now = 0;
    while (!fight.defeated) {
      applyBossHit(fight, economy, stage, upgrades.damage, now, upgrades.reward);
      now += 500;
    }
    expect(stage.status).toBe('COMPLETED');
    expect(stage.maxCompletedStage).toBe(3);
    expect(economy).toMatchObject({ balance: 95n, lifetimeEarned: 120n, bossesDefeated: 1,
      cookiesDestroyed: 1, validHits: 1 });
    expect(applyBossHit(fight, economy, stage, 1, now, 1n)).toBeUndefined();
    expect(stage.continue()).toBe(true);
    expect(stage.stageNumber).toBe(4);
    expect(stage.continue()).toBe(false);
  });

  it('uses exact bigint bonus and preserves balance/upgrades after boss timeout and retry', () => {
    const stage = reachStage(12);
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    const huge = 2n ** 65n;
    economy.recordHit(huge);
    expect(upgrades.buy('value', economy)).toBe(true);
    stage.recordReward(stage.target);
    const fight = new BossManager(12);
    fight.hit(20, 0, huge);
    expect(fight.hit(48, 1, huge)?.reward).toBe(huge * 100n);
    const fresh = new BossManager(12);
    stage.tick(50_000);
    expect(applyBossHit(fresh, economy, stage, 100, 50_000, huge)).toBeUndefined();
    const balance = economy.balance;
    expect(stage.retry()).toBe(true);
    expect(stage.status).toBe('RUNNING');
    expect(economy.balance).toBe(balance);
    expect(upgrades.reward).toBe(2n);
    expect(economy.bossesDefeated).toBe(0);
  });

  it('credits a huge boss bonus once without changing stage progress or cookie counters', () => {
    const stage = reachStage(12);
    const economy = new Economy();
    const huge = 2n ** 65n;
    stage.recordReward(stage.target);
    const fight = new BossManager(12);
    applyBossHit(fight, economy, stage, 20, 0, huge);
    const final = applyBossHit(fight, economy, stage, 48, 1, huge);
    expect(final?.reward).toBe(huge * 100n);
    expect(stage).toMatchObject({ status: 'COMPLETED', progress: 220n, earned: 220n });
    expect(economy).toMatchObject({ balance: huge * 100n, lifetimeEarned: huge * 100n,
      bossesDefeated: 1, cookiesDestroyed: 0, validHits: 0 });
    expect(applyBossHit(fight, economy, stage, 1, 2, huge)).toBeUndefined();
    expect(economy.balance).toBe(huge * 100n);
  });

  it('routes stage 15 through a scaled boss and continues to stage 16', () => {
    const stage = reachStage(15);
    expect(stage.isBossCheckpoint).toBe(true);
    stage.recordReward(stage.target);
    expect(stage.status).toBe('BOSS_FIGHT');
    expect(stage.completeBoss()).toBe(true);
    expect(stage.continue()).toBe(true);
    expect(stage.stageNumber).toBe(16);
  });

  it('simulates every boss at 2 and 4 clicks/s with Click Power 0–2', () => {
    for (const boss of Object.values(BOSSES)) {
      for (const rate of [2, 4]) {
        let previousClicks = Infinity;
        for (const damage of [1, 2, 3]) {
          const fight = new BossManager(boss.stage);
          let clicks = 0;
          while (!fight.defeated) {
            fight.hit(damage, clicks * 1000 / rate, 1n);
            clicks++;
          }
          expect(clicks).toBeLessThan(previousClicks);
          expect((clicks - 1) * 1000 / rate).toBeLessThan(boss.durationMs);
          previousClicks = clicks;
        }
      }
    }
    const withoutCombo = [1, 2, 3].map(damage => Math.ceil(BOSSES[9].bodyHp / damage));
    expect(withoutCombo).toEqual([34, 17, 12]);
    for (const rate of [2, 4]) for (const clicks of withoutCombo) {
      expect((clicks - 1) * 1000 / rate).toBeLessThan(BOSSES[9].durationMs);
    }
  });

  it('makes boss bonuses useful without changing Cookie Value costs', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    economy.grantBossReward(20n);
    expect(upgrades.cost('value')).toBe(14n);
    expect(upgrades.buy('value', economy)).toBe(true);
    expect(upgrades.reward).toBe(2n);
    expect(economy.balance).toBe(6n);
    expect((stageConfig(4).target + upgrades.reward - 1n) / upgrades.reward).toBe(20n);
  });
});
