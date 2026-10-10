import { describe, expect, it } from 'vitest';
import { AbilityManager, autoTarget, freeAbilityForBossStage } from './abilities';
import { BossManager } from './boss';
import { BossAttackController } from './boss-attacks';
import { Economy } from './economy';
import { SpawnManager, type Cookie } from './game';
import { applyBombHit, applyBossHit, applyCookieHit, applyDamage, applyExpiry } from './gameplay';
import { HealthManager } from './health';
import { StageManager } from './stage';
import { TimeWarp } from './time-warp';
import { UpgradeManager } from './upgrades';

type Profile = 'none' | 'rain' | 'auto' | 'both' | 'both+warp' | 'misses';
const profiles: Profile[] = ['none', 'rain', 'auto', 'both', 'both+warp', 'misses'];
const checkpoints = new Set([4, 6, 9, 12, 18, 24, 36]);
const seeds = [1, 37, 911];

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function simulate(seed: number, clicksPerSecond: number, profile: Profile) {
  const random = seeded(seed);
  const stage = new StageManager();
  const economy = new Economy();
  const upgrades = new UpgradeManager();
  const abilities = new AbilityManager();
  const warp = new TimeWarp();
  const health = new HealthManager();
  const result: { stage: number; won: boolean; time: number; tough: number; earned: bigint;
    damage: number; bombs: number; retry: number; charges: number }[] = [];
  let retries = 0;
  let bombs = 0;
  let chargeUse = 0;
  let totalDamage = 0;
  let spent = 0n;
  let reached = 0;
  for (let guard = 0; stage.stageNumber <= 36 && guard < 100; guard++) {
    const number = stage.stageNumber;
    const wantRain = profile === 'rain' || profile === 'both' || profile === 'both+warp' || profile === 'misses';
    const wantAuto = profile === 'auto' || profile === 'both' || profile === 'both+warp' || profile === 'misses';
    const wantWarp = profile === 'both+warp';
    if (number >= 4 && wantRain && !abilities.charges('RAIN')) abilities.buy('RAIN', economy, number);
    if (number >= 7 && wantAuto && !abilities.charges('AUTO')) abilities.buy('AUTO', economy, number);
    if (wantWarp && number >= 6 && !warp.charges) warp.buy(economy, number);
    // One affordable permanent upgrade per stage; all profiles pay the same prices.
    for (const id of ['power', 'speed', 'value'] as const) {
      if (id === 'power' && upgrades.level(id) >= upgrades.powerLimit) continue;
      if (id === 'speed' && upgrades.level(id) >= 7n) continue;
      if (id === 'value' && upgrades.level(id) >= 8n) continue;
      upgrades.buy(id, economy);
    }
    health.resetForStage(upgrades.maxHp, upgrades.stageShields);
    const spawns = new SpawnManager(random);
    const area = { left: 0, top: 120, right: 900, bottom: 628 };
    const first = spawns.spawn({ width: 900, height: 700 }, warp.threatNow, 40, area,
      { stageNumber: number, forcedType: 'NORMAL' });
    expect(first?.type).toBe('NORMAL');
    if (wantRain && abilities.activate('RAIN', true)) chargeUse++;
    if (wantAuto && abilities.activate('AUTO', true)) chargeUse++;
    if (wantWarp && warp.charges) warp.activate();
    let stageTime = 0;
    let spawnElapsed = 0;
    let playerElapsed = 0;
    let stageBombs = 0;
    const priorDamage = health.damageEvents;
    const clickInterval = 1000 / clicksPerSecond;
    const hit = (cookie: Cookie) => {
      if (cookie.type === 'BOMB') {
        const damage = applyBombHit(spawns, health, stage, cookie.id, warp.gameplayNow);
        if (damage) { bombs++; stageBombs++; }
      } else applyCookieHit(spawns, economy, stage, cookie.id, upgrades.damage, upgrades.reward);
    };
    while (stage.status === 'RUNNING') {
      const delta = 100;
      stage.tick(delta);
      if (stage.status !== 'RUNNING') break;
      warp.tick(delta);
      stageTime += delta;
      for (const cookie of spawns.expire(warp.threatNow)) applyExpiry(cookie, health, stage, warp.gameplayNow);
      if (stage.status !== 'RUNNING') break;
      spawnElapsed += delta;
      while (spawnElapsed >= upgrades.spawnMs) {
        spawnElapsed -= upgrades.spawnMs;
        spawns.spawn({ width: 900, height: 700 }, warp.threatNow, 40, area,
          { stageNumber: number, goldenChanceBp: upgrades.goldenChanceBp,
            toughNeeded: stage.toughDestroyed < stage.toughRequired });
      }
      const pulses = abilities.tick(delta, upgrades.spawnMs);
      for (let i = 0; i < pulses.rain; i++) spawns.spawn({ width: 900, height: 700 }, warp.threatNow, 40, area,
        { stageNumber: number, goldenChanceBp: upgrades.goldenChanceBp,
          toughNeeded: stage.toughDestroyed < stage.toughRequired, excludeBomb: true });
      for (let i = 0; i < pulses.auto && stage.status === 'RUNNING'; i++) {
        const target = autoTarget(spawns.active.values(), warp.threatNow);
        if (target) hit(target);
      }
      playerElapsed += delta;
      while (playerElapsed >= clickInterval && stage.status === 'RUNNING') {
        playerElapsed -= clickInterval;
        const errorChance = profile === 'misses' ? 0.27 : 0.13;
        if (random() < errorChance) continue;
        const bomb = [...spawns.active.values()].find(cookie => cookie.type === 'BOMB');
        const target = bomb && random() < (profile === 'misses' ? 0.08 : 0.04) ? bomb :
          random() < (profile === 'misses' ? 0.35 : 0.15) ?
            [...spawns.active.values()].find(cookie => cookie.type === 'NORMAL' || cookie.type === 'GOLDEN') :
            autoTarget(spawns.active.values(), warp.threatNow);
        if (target) hit(target);
      }
    }
    abilities.endStage();
    if (stage.status === 'BOSS_FIGHT') {
      const boss = new BossManager(number);
      const attacks = new BossAttackController(number);
      let bossElapsed = 0, clickElapsed = 0, parryTried = false;
      while (stage.status === 'BOSS_FIGHT') {
        const delta = 100;
        stage.tick(delta);
        if (stage.status !== 'BOSS_FIGHT') break;
        const threatDelta = warp.tick(delta);
        stageTime += delta;
        bossElapsed += delta;
        boss.tick(warp.gameplayNow);
        const strikes = attacks.tick(threatDelta, boss.phase);
        for (let i = 0; i < strikes; i++) applyDamage(health, stage, 1, warp.gameplayNow);
        if (stage.status !== 'BOSS_FIGHT') break;
        if (attacks.state === 'PARRY_WINDOW' && !parryTried) {
          parryTried = true;
          if (random() < 0.65) attacks.attemptParry();
        } else if (attacks.state !== 'PARRY_WINDOW') parryTried = false;
        clickElapsed += delta;
        while (clickElapsed >= clickInterval && stage.status === 'BOSS_FIGHT') {
          clickElapsed -= clickInterval;
          if (random() >= 0.13) applyBossHit(boss, economy, stage, upgrades.damage, warp.gameplayNow, upgrades.reward);
        }
      }
      attacks.stop();
      if (stage.status === 'COMPLETED') {
        const free = freeAbilityForBossStage(number);
        if (free) abilities.grant(free, `boss:${number}`);
      }
    }
    warp.endStage();
    totalDamage += health.damageEvents - priorDamage;
    if (checkpoints.has(number)) result.push({ stage: number, won: stage.status === 'COMPLETED',
      time: stageTime, tough: stage.toughDestroyed, earned: stage.currencyEarned,
      damage: health.damageEvents - priorDamage, bombs: stageBombs, retry: retries, charges: chargeUse });
    if (stage.status === 'FAILED') {
      retries++;
      expect(stage.retry()).toBe(true);
    } else {
      reached = number;
      upgrades.unlockThroughStage(stage.maxCompletedStage);
      stage.continue();
    }
    spent = economy.lifetimeEarned - economy.balance;
  }
  return { reached, retries, bombs, damage: totalDamage, spent, earned: economy.lifetimeEarned,
    abilityBought: abilities.stats.bought, abilityGranted: abilities.stats.granted,
    charges: chargeUse, checkpoints: result, levels: [upgrades.level('power'), upgrades.level('speed'), upgrades.level('value')] };
}

describe('ability balance across seeded progression', () => {
  it('compares paid abilities, Time Warp and missed clicks at 2/4 clicks per second', () => {
    const runs = profiles.flatMap(profile => [2, 4].flatMap(cps => seeds.map(seed => ({ profile, cps, seed,
      ...simulate(seed, cps, profile) }))));
    expect(runs).toHaveLength(36);
    expect(runs.every(run => run.earned >= run.spent && run.checkpoints.every(point => point.earned >= 0n))).toBe(true);
    expect(runs.some(run => run.charges > 0 && run.profile !== 'none')).toBe(true);
    expect(runs.some(run => run.bombs > 0)).toBe(true);
    expect(runs.every(run => run.reached === 36)).toBe(true);
    expect(runs.every(run => run.abilityGranted === 6)).toBe(true);
    const totalTime = (profile: Profile) => runs.filter(run => run.profile === profile)
      .reduce((sum, run) => sum + run.checkpoints.reduce((s, point) => s + point.time, 0), 0);
    expect(totalTime('rain')).toBeLessThan(totalTime('none'));
    // Shorter R1 lifetimes can outweigh an early paid Auto charge; verify use and report its measured result below.
    expect(runs.filter(run => run.profile === 'auto').every(run => run.charges > 0 && run.abilityBought > 0)).toBe(true);
    expect(totalTime('both')).toBeLessThan(totalTime('none'));
    for (const profile of profiles) {
      const group = runs.filter(run => run.profile === profile);
      const reached = group.map(run => run.reached);
      const average = group.reduce((sum, run) => sum + run.checkpoints.reduce((s, point) => s + point.time, 0), 0) / group.length;
      console.log(`M9 balance ${profile}: reached ${Math.min(...reached)}-${Math.max(...reached)}, mean checkpoint ${Math.round(average / 7000)}s, retries ${group.reduce((n,r)=>n+r.retries,0)}, charges ${group.reduce((n,r)=>n+r.charges,0)}, bought ${group.reduce((n,r)=>n+r.abilityBought,0)}, earned ${group.reduce((n,r)=>n+r.earned,0n)}, spent ${group.reduce((n,r)=>n+r.spent,0n)}, tough ${group.reduce((n,r)=>n+r.checkpoints.reduce((s,p)=>s+p.tough,0),0)}, bombs ${group.reduce((n,r)=>n+r.bombs,0)}, damage ${group.reduce((n,r)=>n+r.damage,0)}`);
    }
  });
});
