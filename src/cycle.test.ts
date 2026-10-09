import { describe, expect, it } from 'vitest';
import { cycleForStage, hardHpForStage } from './cycle';
import { bossForStage, BossManager } from './boss';
import { SpawnManager } from './game';
import { StageManager } from './stage';
import { Economy } from './economy';
import { UpgradeManager } from './upgrades';
import { applyBossHit } from './gameplay';

function fillStage(stage: StageManager) {
  stage.recordCollection(stage.target, stage.target);
  while (stage.status === 'RUNNING' && stage.toughDestroyed < stage.toughRequired) {
    stage.recordCollection(1n, 1n, true);
  }
}

describe('endless cycle metadata and bosses', () => {
  it('maps global stages to cycles', () => {
    for (const [stage, cycle, position] of [[1, 1, 1], [12, 1, 12], [13, 2, 1], [15, 2, 3],
      [24, 2, 12], [25, 3, 1], [36, 3, 12], [240, 20, 12]]) {
      expect(cycleForStage(stage)).toMatchObject({ cycleNumber: cycle, stageInCycle: position });
    }
    for (const invalid of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => cycleForStage(invalid)).toThrow(RangeError);
    }
  });

  it('rotates and scales four bosses without changing the first cycle', () => {
    for (const [position, id, body, guard, bodyGrowth, guardGrowth, multiplier] of [
      [3, 'barbarian', 14, 8, 8, 3, 20], [6, 'knight', 22, 12, 12, 4, 35],
      [9, 'berserker', 34, 0, 16, 0, 60], [12, 'cookieng', 48, 20, 20, 5, 100],
    ] as const) {
      for (const cycle of [1, 2, 3, 20]) {
        const boss = bossForStage((cycle - 1) * 12 + position)!;
        expect(boss).toMatchObject({ id, bodyHp: body + bodyGrowth * (cycle - 1),
          protectionHp: guard + guardGrowth * (cycle - 1), multiplier: BigInt(multiplier * cycle) });
        expect(new BossManager(boss.stage).phase).toBe(id === 'barbarian' ? 'ARMOR' :
          id === 'knight' ? 'SHIELD' : id === 'cookieng' ? 'CROWN' : 'NORMAL');
      }
    }
    expect(bossForStage(13)).toBeUndefined();
    expect(() => bossForStage(Number.MAX_SAFE_INTEGER - 1)).toThrow(RangeError);
  });

  it('sets Hard HP at spawn without changing existing cookies or other types', () => {
    const spawns = new SpawnManager(() => 0);
    const first = spawns.spawn({ width: 900, height: 700 }, 0, 40, undefined,
      { forcedType: 'HARD', hardHp: hardHpForStage(12) })!;
    const second = spawns.spawn({ width: 900, height: 700 }, 0, 40, undefined,
      { forcedType: 'HARD', hardHp: hardHpForStage(24) })!;
    expect([first.maxHp, second.maxHp, hardHpForStage(36), hardHpForStage(48)]).toEqual([3, 4, 5, 6]);
    expect(spawns.hit(second.id, 2)).toEqual({ destroyed: false, hp: 2 });
    expect(spawns.resize({ width: 900, height: 700 })).toEqual([]);
    expect(spawns.active.get(second.id)).toMatchObject({ hp: 2, maxHp: 4 });
    expect(first.maxHp).toBe(3);
    expect(() => spawns.spawn({ width: 300, height: 300 }, 0, 40, undefined,
      { forcedType: 'HARD', hardHp: Infinity })).toThrow(RangeError);
  });

  it('continues from Cookieng I to Stage 13 and unlocks power only after victory', () => {
    const stage = new StageManager();
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    for (let number = 1; number <= 12; number++) {
      expect(stage.stageNumber).toBe(number);
      fillStage(stage);
      if (stage.status === 'BOSS_FIGHT') {
        const boss = new BossManager(number);
        const now = 0;
        while (!boss.defeated) applyBossHit(boss, economy, stage, 100, now, upgrades.reward);
      }
      if (number < 12) expect(upgrades.powerLimit).toBe(2n);
      upgrades.unlockThroughStage(stage.maxCompletedStage);
      expect(stage.continue()).toBe(true);
    }
    expect(stage).toMatchObject({ stageNumber: 13, maxCompletedStage: 12, target: 15n, status: 'RUNNING' });
    expect(stage.cycle).toMatchObject({ cycleNumber: 2, stageInCycle: 1 });
    expect(upgrades.powerLimit).toBe(4n);
    expect(economy.bossesDefeated).toBe(4);
    expect(stage.continue()).toBe(false);
  });

  it('retries global stage 24 with fresh collection and boss timers', () => {
    const stage = new StageManager();
    while (stage.stageNumber < 24) {
      fillStage(stage);
      if (stage.status === 'BOSS_FIGHT') stage.completeBoss();
      stage.continue();
    }
    expect(stage.cycle).toMatchObject({ cycleNumber: 2, stageInCycle: 12 });
    fillStage(stage);
    expect(stage).toMatchObject({ status: 'BOSS_FIGHT', remainingMs: 50_000, progress: 93n });
    stage.tick(50_000);
    expect(stage.retry()).toBe(true);
    expect(stage).toMatchObject({ stageNumber: 24, status: 'RUNNING', remainingMs: 90_000, progress: 0n });
    fillStage(stage);
    expect(stage.completeBoss()).toBe(true);
    expect(stage.maxCompletedStage).toBe(24);
    expect(stage.continue()).toBe(true);
    expect(stage.stageNumber).toBe(25);
  });

  it('keeps scaled boss phases and pays the cycle bonus once', () => {
    const barbarian = new BossManager(15);
    expect(barbarian.hit(11, 0, 1n)).toMatchObject({ phase: 'VULNERABLE', hp: 22 });
    expect(barbarian.hit(2, 2999, 1n)).toMatchObject({ damageDealt: 4, hp: 18 });
    expect(barbarian.hit(2, 3000, 1n)).toMatchObject({ damageDealt: 2, phase: 'BODY' });
    const knight = new BossManager(18);
    expect(knight.hit(16, 0, 1n)).toMatchObject({ protectionHp: 0, hp: 34, phase: 'BODY' });
    const berserker = new BossManager(21);
    expect(berserker.hit(25, 0, 1n)).toMatchObject({ hp: 25, phase: 'RAGE' });
    expect(berserker.hit(1, 1, 1n)?.comboBonus).toBe(0);
    const stage = new StageManager();
    while (stage.stageNumber < 24) {
      fillStage(stage);
      if (stage.status === 'BOSS_FIGHT') stage.completeBoss();
      stage.continue();
    }
    fillStage(stage);
    const economy = new Economy();
    const cookieng = new BossManager(24);
    expect(applyBossHit(cookieng, economy, stage, 25, 0, 2n)).toMatchObject({ phase: 'GOLDEN', hp: 68, reward: null });
    expect(applyBossHit(cookieng, economy, stage, 68, 1, 2n)).toMatchObject({ defeated: true, reward: 400n });
    expect(applyBossHit(cookieng, economy, stage, 68, 2, 2n)).toBeUndefined();
    expect(economy).toMatchObject({ balance: 400n, lifetimeEarned: 400n, bossesDefeated: 1,
      cookiesDestroyed: 0, validHits: 0 });
  });
});
