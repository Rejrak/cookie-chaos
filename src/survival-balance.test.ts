import { describe, expect, it } from 'vitest';
import { BossAttackController } from './boss-attacks';
import { BossManager } from './boss';
import { Economy } from './economy';
import { SpawnManager } from './game';
import { applyBombHit, applyBossHit, applyCookieHit, applyDamage, applyExpiry } from './gameplay';
import { HealthManager } from './health';
import { StageManager } from './stage';
import { UpgradeManager } from './upgrades';

const CHECKPOINTS = [4, 6, 9, 12, 18, 24, 36];
const SEEDS = [1, 37, 911];
type Defense = { maxHealth: boolean; shield: boolean; parryChance: number };

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function advanceTo(stage: StageManager, number: number) {
  while (stage.stageNumber < number) {
    stage.recordCollection(stage.target, stage.target);
    while (stage.status === 'RUNNING') stage.recordCollection(1n, 1n, true);
    if (stage.status === 'BOSS_FIGHT') stage.completeBoss();
    stage.continue();
  }
}

function simulate(stageNumber: number, seed: number, defense: Defense) {
  const random = seeded(seed + 1009 * stageNumber);
  const stage = new StageManager();
  advanceTo(stage, stageNumber);
  const economy = new Economy();
  const upgrades = new UpgradeManager();
  const health = new HealthManager();
  // Representative prior earnings; M7's progression simulation checks acquisition costs separately.
  const priorBalance = stageNumber < 6 ? 400n : stageNumber < 9 ? 800n :
    stageNumber < 12 ? 1500n : stageNumber < 18 ? 3000n : 5000n;
  economy.recordHit(priorBalance);
  upgrades.unlockThroughStage(stageNumber - 1);
  for (let i = 0; i < 2; i++) expect(upgrades.buy('power', economy)).toBe(true);
  const speedTarget = stageNumber < 9 ? 4 : stageNumber < 18 ? 6 : 8;
  for (let i = 0; i < speedTarget; i++) expect(upgrades.buy('speed', economy)).toBe(true);
  if (defense.maxHealth) expect(upgrades.buy('health', economy)).toBe(true);
  if (defense.shield) expect(upgrades.buy('shield', economy)).toBe(true);
  let retries = 0;
  let bombsClicked = 0;
  let toughExpired = 0;
  let missedAttacks = 0;
  let parried = 0;
  let healthFailures = 0;
  let timeouts = 0;
  let collectionMs = 0;
  let bossMs = 0;
  while (stage.status !== 'COMPLETED' && retries < 4) {
    health.resetForStage(upgrades.maxHp, upgrades.stageShields);
    const spawns = new SpawnManager(random);
    let now = 0;
    let first = true;
    while (stage.status === 'RUNNING') {
      const cookie = spawns.spawn({ width: 900, height: 700 }, now, 40, undefined, {
        stageNumber, toughNeeded: stage.toughDestroyed < stage.toughRequired,
        forcedType: first ? 'NORMAL' : undefined });
      first = false;
      expect(cookie).toBeDefined();
      const ignored = cookie!.type === 'BOMB' ? random() >= 0.18 :
        random() < (cookie!.type === 'REINFORCED' || cookie!.type === 'TITAN' ? 0.08 : 0.03);
      if (ignored) {
        const delta = cookie!.expiresAt - now;
        stage.tick(delta);
        now += delta;
        if (stage.status === 'RUNNING') {
          for (const expired of spawns.expire(now)) {
            if (expired.type === 'REINFORCED' || expired.type === 'TITAN') toughExpired++;
            applyExpiry(expired, health, stage, now);
          }
        }
      } else {
        if (cookie!.type === 'BOMB') {
          stage.tick(500);
          now += 500;
          if (stage.status === 'RUNNING') {
            bombsClicked++;
            applyBombHit(spawns, health, stage, cookie!.id, now);
          }
        } else {
          while (stage.status === 'RUNNING' && spawns.active.has(cookie!.id)) {
            stage.tick(500);
            now += 500;
            if (stage.status !== 'RUNNING') break;
            if (random() >= 0.10) applyCookieHit(spawns, economy, stage, cookie!.id, upgrades.damage, upgrades.reward);
            if (now >= cookie!.expiresAt && spawns.active.has(cookie!.id)) {
              for (const expired of spawns.expire(now)) {
                if (expired.type === 'REINFORCED' || expired.type === 'TITAN') toughExpired++;
                applyExpiry(expired, health, stage, now);
              }
            }
          }
        }
        if (stage.status === 'RUNNING') {
          const wait = Math.max(0, upgrades.spawnMs - 500);
          stage.tick(wait);
          now += wait;
        }
      }
    }
    collectionMs = now;
    if (stage.status === 'BOSS_FIGHT') {
      const boss = new BossManager(stageNumber);
      const attack = new BossAttackController(stageNumber);
      now = 0;
      let decided = false;
      while (stage.status === 'BOSS_FIGHT') {
        stage.tick(500);
        now += 500;
        if (stage.status !== 'BOSS_FIGHT') break;
        const hits = attack.tick(500, boss.phase);
        for (let i = 0; i < hits; i++) {
          missedAttacks++;
          applyDamage(health, stage, 1, now);
        }
        if (stage.status !== 'BOSS_FIGHT') break;
        if (attack.state === 'PARRY_WINDOW' && !decided) {
          decided = true;
          if (random() < defense.parryChance && attack.attemptParry()) parried++;
        } else if (attack.state !== 'PARRY_WINDOW') decided = false;
        if (random() >= 0.10 && attack.state !== 'PARRY_WINDOW') {
          applyBossHit(boss, economy, stage, upgrades.damage, now, upgrades.reward);
        }
      }
      attack.stop();
      bossMs = now;
    }
    if (stage.status === 'FAILED') {
      retries++;
      if (stage.failureReason === 'HEALTH_DEPLETED') healthFailures++;
      else timeouts++;
      expect(stage.retry()).toBe(true);
    }
  }
  return { success: stage.status === 'COMPLETED', hp: health.hp, shields: health.shields,
    damage: health.damageEvents, blocked: health.blockedEvents, retries, bombsClicked,
    toughExpired, missedAttacks, parried, healthFailures, timeouts, collectionMs, bossMs, earned: economy.lifetimeEarned,
    spent: economy.lifetimeEarned - economy.balance };
}

describe('survival balance at isolated checkpoints', () => {
  it('compares defense and parry across seeded bombs, expiry, misses and boss attacks', () => {
    const profiles: Record<string, Defense> = {
      base: { maxHealth: false, shield: false, parryChance: 0 },
      shield: { maxHealth: false, shield: true, parryChance: 0 },
      health: { maxHealth: true, shield: false, parryChance: 0 },
      parry50: { maxHealth: false, shield: false, parryChance: 0.5 },
      parry80: { maxHealth: false, shield: false, parryChance: 0.8 },
    };
    const results = new Map<string, ReturnType<typeof simulate>[]>();
    for (const [name, profile] of Object.entries(profiles)) {
      const runs = CHECKPOINTS.flatMap(stage => SEEDS.map(seed => simulate(stage, seed, profile)));
      results.set(name, runs);
      expect(runs.every(run => run.success)).toBe(true);
      expect(runs.every(run => run.retries <= 4)).toBe(true);
      expect(runs.every(run => run.healthFailures + run.timeouts === run.retries)).toBe(true);
      expect(runs.every(run => run.earned >= run.spent)).toBe(true);
    }
    expect(results.get('base')!.some(run => run.bombsClicked > 0)).toBe(true);
    expect(results.get('base')!.some(run => run.toughExpired > 0)).toBe(true);
    expect(results.get('parry80')!.reduce((sum, run) => sum + run.parried, 0))
      .toBeGreaterThan(results.get('parry50')!.reduce((sum, run) => sum + run.parried, 0));
    const totalRetries = (name: string) => results.get(name)!.reduce((sum, run) => sum + run.retries, 0);
    const totalDamage = (name: string) => results.get(name)!.reduce((sum, run) => sum + run.damage, 0);
    const totalDeaths = (name: string) => results.get(name)!.reduce((sum, run) => sum + run.healthFailures, 0);
    expect(totalRetries('base')).toBeGreaterThan(0);
    expect(totalDeaths('base')).toBeGreaterThan(totalDeaths('shield'));
    expect(totalDeaths('base')).toBeGreaterThan(totalDeaths('health'));
    expect(totalDamage('shield')).toBeLessThan(totalDamage('base'));
    expect(totalDamage('parry80')).toBeLessThan(totalDamage('parry50'));
    expect(totalRetries('shield')).toBeLessThanOrEqual(totalRetries('base'));
    expect(totalRetries('health')).toBeLessThanOrEqual(totalRetries('base'));
    expect(totalRetries('parry80')).toBeLessThanOrEqual(totalRetries('parry50'));
  });

  it('uses actual collected currency to buy Shield after death, then restores it on retry', () => {
    const stage = new StageManager();
    advanceTo(stage, 4);
    const spawns = new SpawnManager(() => 0);
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    const health = new HealthManager();
    for (let i = 0; i < 12; i++) {
      const golden = spawns.spawn({ width: 300, height: 300 }, i * 100, 40, undefined,
        { stageNumber: 4, forcedType: 'GOLDEN' })!;
      applyCookieHit(spawns, economy, stage, golden.id, 1, upgrades.reward);
    }
    expect(stage).toMatchObject({ status: 'RUNNING', toughDestroyed: 0 });
    expect(economy.balance).toBe(60n);
    expect(applyDamage(health, stage, 5, 2000)).toBe('hp');
    expect(stage.failureReason).toBe('HEALTH_DEPLETED');
    expect(upgrades.buy('shield', economy)).toBe(true);
    expect(economy.balance).toBe(0n);
    expect(stage.retry()).toBe(true);
    health.resetForStage(upgrades.maxHp, upgrades.stageShields);
    expect(health).toMatchObject({ hp: 5, shields: 1 });
    expect(applyDamage(health, stage, 1, 0)).toBe('shield');
    expect(stage.status).toBe('RUNNING');
  });
});
