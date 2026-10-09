import { describe, expect, it } from 'vitest';
import { BossManager, bossForStage } from './boss';
import { cycleForStage } from './cycle';
import { Economy } from './economy';
import { RULES, SpawnManager, type CookieType } from './game';
import { applyBossHit, applyCookieHit } from './gameplay';
import { StageManager, stageConfig } from './stage';
import { UpgradeManager, type UpgradeId } from './upgrades';

const CHECKPOINTS = [1, 3, 6, 9, 12, 18, 24, 36, 60, 120, 240];
type Strategy = 'economy' | 'combat' | 'balanced';

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 2 ** 32);
}

function bossTime(stageNumber: number, damage: number, rate: number) {
  const boss = new BossManager(stageNumber);
  let clicks = 0;
  while (!boss.defeated) boss.hit(damage, clicks++ * 1000 / rate, 1n);
  return (clicks - 1) * 1000 / rate;
}

function simulate(strategy: Strategy, rate: number, seed: number) {
  const random = seeded(seed);
  const stage = new StageManager();
  const economy = new Economy();
  const upgrades = new UpgradeManager();
  const checkpoints = [];
  let spent = 0n;
  let retries = 0;
  let expired = 0;
  let misses = 0;
  let toughTotal = 0;
  const missChance = rate === 2 ? 0.08 : 0.12;
  const interval = 1000 / rate;

  const buyTo = (id: UpgradeId, target: bigint) => {
    while (upgrades.level(id) < target) {
      const cost = upgrades.cost(id);
      if (cost === null || economy.balance < cost) return;
      expect(upgrades.buy(id, economy)).toBe(true);
      spent += cost;
    }
  };

  for (let number = 1; number <= 240; number++) {
    expect(stage.stageNumber).toBe(number);
    let attempts = 0;
    let collectionMs = 0;
    let bossMs = 0;
    while (stage.status !== 'COMPLETED' && attempts < 10) {
      attempts++;
      const cycle = cycleForStage(number);
      if (strategy === 'economy') {
        if (number % 2 === 0) {
          buyTo('value', BigInt(Math.min(15, number - 1)));
          buyTo('speed', BigInt(Math.min(7, Math.floor(number / 3))));
          buyTo('luck', BigInt(Math.min(2, Math.floor(number / 12))));
        }
      } else if (strategy === 'combat') {
        buyTo('power', upgrades.powerLimit);
        buyTo('speed', BigInt(Math.min(10, Math.floor(number / 5))));
        buyTo('value', BigInt(Math.min(10, Math.floor(number / 10))));
      } else {
        buyTo('power', BigInt(Math.min(Number(upgrades.powerLimit), 1 + Math.floor(number / 12))));
        buyTo('speed', BigInt(Math.min(10, Math.floor(number / 8))));
        buyTo('value', BigInt(Math.min(20, Math.floor(number / 5))));
        buyTo('luck', BigInt(Math.min(5, Math.floor(number / 24))));
      }
      // Extra power is purchased only if Tough lifetimes or this boss timer require it.
      const toughHp = number >= 9 ? 9 + 2 * cycle.cycleIndex : number >= 4 ? 5 + cycle.cycleIndex : 3 + cycle.cycleIndex;
      const bossConfig = bossForStage(number);
      while ((Math.ceil(toughHp / upgrades.damage) * interval > RULES.lifetimeMs - 1000 ||
        (bossConfig && bossTime(number, upgrades.damage, rate) > bossConfig.durationMs * 0.75)) &&
        upgrades.cost('power') !== null && economy.balance >= upgrades.cost('power')!) {
        buyTo('power', upgrades.level('power') + 1n);
      }

      const spawns = new SpawnManager(random);
      let now = 0;
      let nextSpawnAt = 0;
      let nextClickAt = 0;
      let spawned = 0;
      while (stage.status === 'RUNNING') {
        const spawnAt = Math.max(nextSpawnAt, nextClickAt);
        stage.tick(spawnAt - now);
        now = spawnAt;
        if (stage.status !== 'RUNNING') break;
        const bounds = number % 10 === 0 ? { width: 320, height: 320 } : { width: 900, height: 700 };
        const area = number % 10 === 0 ? { left: 0, top: RULES.hudHeight, right: 320, bottom: 248 } : undefined;
        const cookie = spawns.spawn(bounds, now, 40, area, { stageNumber: number,
          goldenChanceBp: upgrades.goldenChanceBp,
          toughNeeded: stage.toughDestroyed < stage.toughRequired,
          forcedType: spawned === 0 ? 'NORMAL' : undefined });
        if (!cookie) { nextSpawnAt = now + upgrades.spawnMs; continue; }
        spawned++;
        if (random() < 0.02) {
          stage.tick(RULES.lifetimeMs);
          now += RULES.lifetimeMs;
          expired += spawns.expire(now).length;
        } else {
          while (stage.status === 'RUNNING' && spawns.active.has(cookie.id)) {
            if (now >= cookie.expiresAt) { expired += spawns.expire(now).length; break; }
            if (random() < missChance) misses++;
            else {
              const hit = applyCookieHit(spawns, economy, stage, cookie.id, upgrades.damage, upgrades.reward);
              if (hit?.toughDestroyed) toughTotal++;
            }
            if (spawns.active.has(cookie.id) && stage.status === 'RUNNING') {
              stage.tick(interval);
              now += interval;
            }
          }
        }
        nextSpawnAt = spawnAt + upgrades.spawnMs;
        nextClickAt = now + interval;
      }
      collectionMs = now;
      if (stage.status === 'BOSS_FIGHT') {
        const boss = new BossManager(number);
        now = 0;
        while (stage.status === 'BOSS_FIGHT') {
          if (random() < missChance) misses++;
          else applyBossHit(boss, economy, stage, upgrades.damage, now, upgrades.reward);
          if (stage.status === 'BOSS_FIGHT') { stage.tick(interval); now += interval; }
        }
        bossMs = now;
      }
      if (stage.status === 'FAILED') {
        retries++;
        expect(stage.retry()).toBe(true);
      }
    }
    if (stage.status !== 'COMPLETED') return { reached: number - 1, checkpoints, retries, economy, upgrades, spent,
      expired, misses, toughTotal };
    upgrades.unlockThroughStage(stage.maxCompletedStage);
    if (CHECKPOINTS.includes(number)) checkpoints.push({ stage: number, points: stage.progress,
      target: stage.target, tough: stage.toughDestroyed, required: stage.toughRequired,
      collectionMs, collectionLimitMs: stageConfig(number).durationMs, bossMs,
      bossLimitMs: bossForStage(number)?.durationMs ?? 0, value: upgrades.level('value'),
      speed: upgrades.level('speed'), power: upgrades.level('power'), luck: upgrades.level('luck'),
      destroyed: economy.cookiesDestroyed, bosses: economy.bossesDefeated,
      earned: economy.lifetimeEarned, spent, retries });
    if (number < 240) expect(stage.continue()).toBe(true);
  }
  return { reached: 240, checkpoints, retries, economy, upgrades, spent, expired, misses, toughTotal };
}

describe('realistic endless balance', () => {
  for (const rate of [2, 4]) for (const strategy of ['economy', 'combat', 'balanced'] as const) {
    it(`${strategy} at ${rate} clicks/s reaches stage 240 with paid upgrades across seeded misses and expiry`, () => {
      for (const seed of [1, 37, 911]) {
        const result = simulate(strategy, rate, seed);
        expect(result.reached, `${strategy} ${rate}/s seed ${seed} stalled`).toBe(240);
        expect(result.checkpoints.map(point => point.stage)).toEqual(CHECKPOINTS);
        expect(result.economy.balance).toBeGreaterThanOrEqual(0n);
        expect(result.economy.lifetimeEarned - result.spent).toBe(result.economy.balance);
        expect(result.economy.bossesDefeated).toBe(80);
        expect(result.expired).toBeGreaterThan(0);
        expect(result.misses).toBeGreaterThan(0);
        for (const point of result.checkpoints) {
          expect(point.points).toBe(point.target);
          expect(point.tough).toBeGreaterThanOrEqual(point.required);
          expect(point.collectionMs).toBeLessThan(point.collectionLimitMs);
          if (point.bossLimitMs) expect(point.bossMs).toBeLessThan(point.bossLimitMs);
        }
      }
    });
  }

  it('makes Click Power reduce clicks on every Tough type', () => {
    for (const [type, hp] of [['HARD', 4], ['REINFORCED', 6], ['TITAN', 11]] as const) {
      const clicks = (damage: number) => {
        const game = new SpawnManager(() => 0);
        const cookie = game.spawn({ width: 300, height: 300 }, 0, 40, undefined,
          { stageNumber: 18, forcedType: type as CookieType })!;
        let count = 0;
        while (game.active.has(cookie.id)) { game.hit(cookie.id, damage); count++; }
        expect(cookie.maxHp).toBe(hp);
        return count;
      };
      expect(clicks(3)).toBeLessThan(clicks(1));
    }
  });
});
