import { describe, expect, it } from 'vitest';
import { BossManager, bossForStage } from './boss';
import { hardHpForStage } from './cycle';
import { Economy } from './economy';
import { SpawnManager } from './game';
import { applyBossHit, applyCookieHit } from './gameplay';
import { StageManager, stageConfig } from './stage';
import { UpgradeManager } from './upgrades';

const CHECKPOINTS = [1, 12, 13, 15, 24, 36, 60, 120, 240];

function fightTime(stageNumber: number, damage: number, clicksPerSecond: number) {
  const fight = new BossManager(stageNumber);
  const interval = 1000 / clicksPerSecond;
  let clicks = 0;
  while (!fight.defeated) {
    fight.hit(damage, clicks * interval, 1n);
    clicks++;
  }
  return { clicks, ms: (clicks - 1) * interval };
}

function simulate(clicksPerSecond: number) {
  const stage = new StageManager();
  const economy = new Economy();
  const upgrades = new UpgradeManager();
  const checkpoints = [];
  for (let number = 1; number <= 240; number++) {
    expect(stage.stageNumber).toBe(number);
    // One Spawn Speed level per cycle until its cap. Purchases use only earned currency.
    const desiredSpeed = Math.min(10, Math.floor((number - 1) / 12));
    while (upgrades.level('speed') < BigInt(desiredSpeed)) {
      expect(upgrades.buy('speed', economy), `Stage ${number}: Spawn Speed funding`).toBe(true);
    }
    const spawnInterval = Math.max(upgrades.spawnMs, 1000 / clicksPerSecond);
    const normalCount = () => (stage.target + upgrades.reward - 1n) / upgrades.reward;
    while (Number(normalCount() - 1n) * spawnInterval > stage.durationMs * 0.8) {
      expect(upgrades.buy('value', economy), `Stage ${number}: Cookie Value funding`).toBe(true);
    }
    const bossConfig = bossForStage(number);
    if (bossConfig) {
      while (fightTime(number, upgrades.damage, clicksPerSecond).ms > bossConfig.durationMs * 0.8) {
        expect(upgrades.buy('power', economy), `Stage ${number}: Click Power funding or unlock`).toBe(true);
      }
    }
    const spawns = new SpawnManager(() => 0);
    let collectionMs = 0;
    let cookies = 0;
    let nextSpawnAt = 0;
    let nextClickAt = 0;
    const clickInterval = 1000 / clicksPerSecond;
    while (stage.status === 'RUNNING') {
      const spawnAt = Math.max(nextSpawnAt, nextClickAt);
      stage.tick(spawnAt - collectionMs);
      collectionMs = spawnAt;
      expect(stage.status, `Stage ${number}: collection timeout`).toBe('RUNNING');
      // Deterministic 1-in-7 Hard mix; no Golden cookie is needed for feasibility.
      const cookie = spawns.spawn({ width: 300, height: 300 }, collectionMs, 40, undefined,
        { forcedType: (cookies + 1) % 7 === 0 ? 'HARD' : 'NORMAL', hardHp: hardHpForStage(number) })!;
      let hit;
      do {
        if (hit) { stage.tick(clickInterval); collectionMs += clickInterval; }
        expect(stage.status, `Stage ${number}: Hard cookie timeout`).toBe('RUNNING');
        hit = applyCookieHit(spawns, economy, stage, cookie.id, upgrades.damage, upgrades.reward);
      } while (hit && !hit.destroyed);
      nextSpawnAt = spawnAt + upgrades.spawnMs;
      nextClickAt = collectionMs + clickInterval;
      cookies++;
    }
    let bossMs = 0;
    if (bossConfig) {
      const boss = new BossManager(number);
      let hits = 0;
      const interval = 1000 / clicksPerSecond;
      while (stage.status === 'BOSS_FIGHT') {
        if (hits) { stage.tick(interval); bossMs += interval; }
        expect(stage.status, `Stage ${number}: boss timeout`).toBe('BOSS_FIGHT');
        applyBossHit(boss, economy, stage, upgrades.damage, bossMs, upgrades.reward);
        hits++;
      }
    }
    expect(stage.status).toBe('COMPLETED');
    expect(economy.balance).toBeGreaterThanOrEqual(0n);
    upgrades.unlockThroughStage(stage.maxCompletedStage);
    if (CHECKPOINTS.includes(number)) checkpoints.push({ stage: number, cycle: stage.cycle.cycleNumber,
      target: stage.target, hardHp: hardHpForStage(number), value: upgrades.level('value'),
      speed: upgrades.level('speed'), power: upgrades.level('power'), powerLimit: upgrades.powerLimit,
      collectionMs, normalOnlyMs: Number(normalCount() - 1n) * spawnInterval,
      collectionLimitMs: stageConfig(number).durationMs,
      bossMs, bossLimitMs: bossConfig?.durationMs ?? 0, bossReward: bossConfig ? bossConfig.multiplier * upgrades.reward : 0n,
      balance: economy.balance });
    if (number < 240) expect(stage.continue()).toBe(true);
  }
  return { checkpoints, economy, upgrades };
}

describe('deterministic endless balance', () => {
  for (const rate of [2, 4]) it(`reaches every checkpoint at ${rate} clicks/s with paid upgrades and no Golden cookies`, () => {
    const { checkpoints, economy } = simulate(rate);
    expect(checkpoints.map(point => point.stage)).toEqual(CHECKPOINTS);
    expect(checkpoints.map(point => point.cycle)).toEqual([1, 1, 2, 2, 2, 3, 5, 10, 20]);
    for (const point of checkpoints) {
      expect(point.collectionMs).toBeLessThanOrEqual(point.collectionLimitMs * 0.8);
      expect(point.normalOnlyMs).toBeLessThanOrEqual(point.collectionLimitMs * 0.8);
      if (point.bossLimitMs) expect(point.bossMs).toBeLessThanOrEqual(point.bossLimitMs * 0.8);
      expect(point.power).toBeLessThanOrEqual(point.powerLimit);
      expect(point.hardHp).toBe(2 + point.cycle);
    }
    expect(economy.bossesDefeated).toBe(80);
    expect(economy.lifetimeEarned).toBeGreaterThan(economy.balance);
  });
});
