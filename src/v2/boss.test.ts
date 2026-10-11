import { describe, expect, it } from 'vitest';
import { P0 } from '../p0/config';
import { P0Simulation } from '../p0/sim';
import { BossEncounter, BOSSES } from './boss';
import { Campaign, SAVE_KEY } from './campaign';

const step = (boss: BossEncounter, ms: number, groundY = 500) => {
  for (let left = ms; left > 0; left -= P0.stepMs) boss.tick(Math.min(P0.stepMs, left), groundY);
};
const gameBoss = (stage: 3 | 6 | 9 | 12) => {
  const game = new Campaign(390, 550, null, stage);
  game.sim.phase = 'BOSS_INTRO';
  expect(game.startBoss()).toBe(true);
  return game;
};
const shootBoss = (game: Campaign, damage = 1) => {
  const boss = game.sim.boss!, spot = boss.target;
  game.sim.damageLevel = damage - 1;
  game.sim.bullets.push({ x: spot.x, y: spot.y + spot.radius + game.sim.bulletRadius + 5,
    vx: 0, vy: -game.sim.projectileSpeed, lifeMs: 100, bounces: 0 });
  game.advance(P0.stepMs);
};

describe('P2 boss encounters', () => {
  it('defines four distinct timed encounters and deterministic attacks', () => {
    expect(Object.keys(BOSSES)).toEqual(['barbarian', 'knight', 'berserker', 'cookieng']);
    for (const id of Object.keys(BOSSES) as (keyof typeof BOSSES)[]) {
      const a = new BossEncounter(id, 77), b = new BossEncounter(id, 77);
      a.resize(390, 550); b.resize(390, 550);
      step(a, 1_500); step(b, 1_500);
      expect(a.metrics()).toEqual(b.metrics());
      expect(a.attacks).toBeGreaterThan(0);
      expect(a.threats.length).toBeGreaterThan(0);
      expect(a.timeMs).toBeCloseTo(1_500);
      expect(a.firstAttackMs).toBeGreaterThanOrEqual(a.config.warningMs);
      expect(a.firstAttackMs).toBeLessThan(1_500);
    }
  });
  it('alternates Barbarian armored threats and Normal bursts', () => {
    const boss = new BossEncounter('barbarian', 2); boss.resize(390, 550);
    step(boss, 1_500); expect(boss.threats.map(t => t.kind)).toContain('HARD');
    step(boss, 5_100); expect(boss.threats.map(t => t.kind)).toContain('NORMAL');
  });
  it('Knight guard absorbs shots; interception opens a real damage window', () => {
    const boss = new BossEncounter('knight', 2); boss.resize(390, 550);
    expect(boss.takeHit(3)).toEqual({ dealt: 0, blocked: 3, defeated: false });
    expect(boss.hp).toBe(BOSSES.knight.hp); expect(boss.guard).toBe(BOSSES.knight.guard - 3);
    step(boss, 1_500);
    const signal = boss.threats.find(t => t.signal)!;
    expect(boss.intercept(signal)).toBe(6n);
    expect(boss.vulnerabilityMs).toBeGreaterThan(0);
    expect(boss.takeHit(2).dealt).toBe(4);
    expect(boss.guard).toBe(BOSSES.knight.guard - 3);
    step(boss, 3_300);
    expect(boss.takeHit(1).blocked).toBe(1);
  });
  it('Berserker rage changes the volley, and Cookieng crown gates Golden Form', () => {
    const berserker = new BossEncounter('berserker', 2); berserker.resize(390, 550);
    berserker.takeHit(Math.ceil(BOSSES.berserker.hp / 2)); expect(berserker.phase).toBe('RAGE');
    expect(berserker.nextAttackMs).toBe(0);
    step(berserker, 1_400); expect(berserker.threats.length).toBe(3);
    const king = new BossEncounter('cookieng', 2); king.resize(390, 550);
    expect(king.takeHit(BOSSES.cookieng.guard).dealt).toBe(0);
    expect(king.hp).toBe(BOSSES.cookieng.hp); expect(king.phase).toBe('GOLDEN FORM');
    expect(king.nextAttackMs).toBe(0);
    expect(king.takeHit(1).dealt).toBe(1);
  });
  it('caps hostile rewards, awards no SP and never duplicates interception', () => {
    const game = gameBoss(3), boss = game.sim.boss!;
    game.sim.sp = 34;
    step(boss, 1_500, game.sim.groundY);
    const threat = boss.threats[0];
    expect(boss.intercept(threat)).toBe(6n);
    expect(boss.intercept(threat)).toBe(0n);
    expect(game.sim.sp).toBe(34);
    expect(boss.rewardPaid).toBeLessThanOrEqual(boss.config.rewardBudget);
    for (let id = 200; id < 220; id++) {
      const extra = { ...threat, id, reward: 10n };
      boss.threats.push(extra);
      boss.intercept(extra);
    }
    expect(boss.rewardPaid).toBe(boss.config.rewardBudget);
  });
  it('intercepts hostile cookies with cannon bullets and never grants Stage Points', () => {
    const game = gameBoss(3), boss = game.sim.boss!;
    boss.threats.push({ id: 101, kind: 'NORMAL', x: 60, y: 260, vx: 0, vy: 0,
      hp: 1, radius: 18, damage: 1, reward: 1n, signal: false });
    const before = game.sim.sp;
    game.sim.bullets.push({ x: 60, y: 300, vx: 0, vy: -game.sim.projectileSpeed, lifeMs: 200, bounces: 0 });
    for (let i = 0; i < 5; i++) game.advance(P0.stepMs);
    expect(boss.intercepted).toBe(1);
    expect(boss.threats.length).toBe(0);
    expect(game.sim.provisional).toBe(1n);
    expect(game.sim.sp).toBe(before);
  });
  it('fires continuously during the boss fight and stops at release', () => {
    const game = gameBoss(3), target = game.sim.boss!.target;
    game.sim.setAim(target.x, target.y, true);
    game.advance(700);
    expect(game.sim.shots).toBeGreaterThan(1);
    const fired = game.sim.shots;
    game.sim.release(); game.advance(700);
    expect(game.sim.shots).toBe(fired);
  });
  it('uses the same fixed clock at 30 and 60 FPS', () => {
    const at30 = gameBoss(9), at60 = gameBoss(9);
    for (let i = 0; i < 120; i++) at30.advance(1000 / 30);
    for (let i = 0; i < 240; i++) at60.advance(1000 / 60);
    expect(at30.sim.boss?.metrics()).toEqual(at60.sim.boss?.metrics());
  });
  it('boss death waits for hostile cleanup; base death during cleanup wins priority', () => {
    const game = gameBoss(3), boss = game.sim.boss!;
    boss.threats.push({ id: 8, kind: 'HARD', x: 20, y: game.sim.groundY - 30, vx: 0, vy: 0,
      hp: 3, radius: 20, damage: 2, reward: 6n, signal: false });
    game.sim.hp = 1;
    boss.guard = 0; boss.hp = 1; shootBoss(game);
    expect(game.sim.phase).toBe('BOSS_CLEANUP');
    expect(game.balance).toBe(0n);
    const stopped = boss.timeMs;
    game.advance(300);
    expect(boss.timeMs).toBe(stopped);
    expect(boss.attacks).toBe(0);
    game.advance(2_000);
    expect(game.sim.phase).toBe('LOST'); expect(game.balance).toBe(0n);
    expect(game.state.highestCompleted).toBe(0);
  });
  it('settles victory once after cleanup, restores +2 HP and unlocks the next stage', () => {
    const game = gameBoss(3), boss = game.sim.boss!;
    game.sim.hp = 2; game.sim.provisional = 10n;
    boss.threats.push({ id: 8, kind: 'NORMAL', x: 20, y: game.sim.groundY - 90, vx: 0, vy: 10,
      hp: 1, radius: 14, damage: 1, reward: 1n, signal: false });
    boss.guard = 0; boss.hp = 1; shootBoss(game);
    expect(game.sim.phase).toBe('BOSS_CLEANUP');
    expect(game.balance).toBe(0n);
    boss.threats.length = 0;
    game.advance(P0.stepMs);
    expect(game.sim.phase).toBe('WON'); expect(game.balance).toBe(10n + boss.config.victoryReward);
    expect(game.state.hp).toBe(4); expect(game.state.stage).toBe(4);
    game.advance(5_000); expect(game.balance).toBe(45n); expect(game.state.hp).toBe(4);
    expect(game.continue()).toBe(true); expect(game.stageId).toBe(4);
    expect(game.continue()).toBe(false);
  });
  it('also confirms cleanup victory after a remaining threat lands while the base survives', () => {
    const game = gameBoss(3), boss = game.sim.boss!;
    boss.threats.push({ id: 9, kind: 'NORMAL', x: 20, y: game.sim.groundY - 15, vx: 0, vy: 100,
      hp: 1, radius: 14, damage: 1, reward: 1n, signal: false });
    boss.guard = 0; boss.hp = 1; shootBoss(game);
    expect(game.sim.phase).toBe('BOSS_CLEANUP');
    game.advance(100);
    expect(game.sim.phase).toBe('WON');
    expect(boss.landed).toBe(1);
    expect(game.state.hp).toBe(5);
    expect(game.balance).toBe(boss.config.victoryReward);
  });
  it('times out independently of waves and allows Retry from the collection phase', () => {
    const game = gameBoss(6); game.sim.hp = 100;
    expect(game.canShop).toBe(false);
    const paused = game.sim.boss!.timeMs;
    expect(game.sim.boss!.timeMs).toBe(paused);
    game.advance(BOSSES.knight.timerMs + 50);
    expect(game.sim.phase).toBe('LOST'); expect(game.retry()).toBe(true);
    expect(game.sim.phase).toBe('PREP'); expect(game.sim.wave).toBe(-1);
  });
  it('keeps hostiles in bounds across resize and gives compact screens time to intercept', () => {
    const boss = new BossEncounter('barbarian', 2); boss.resize(320, 175);
    step(boss, 1_500, 145);
    expect(boss.threats.length).toBe(1);
    let flightMs = 0;
    while (boss.threats.length && flightMs < 5_000) { boss.tick(P0.stepMs, 145); flightMs += P0.stepMs; }
    expect(flightMs).toBeGreaterThan(1_000);
    const knight = new BossEncounter('knight', 2); knight.resize(390, 550);
    step(knight, 1_500);
    const id = knight.threats[0].id, hp = knight.threats[0].hp;
    knight.resize(320, 175);
    expect(knight.threats[0].id).toBe(id); expect(knight.threats[0].hp).toBe(hp);
    expect(knight.threats[0].x).toBeGreaterThanOrEqual(0);
    expect(knight.target.x + knight.target.radius).toBeLessThanOrEqual(320);
  });
  it('migrates P1 saves without changing the key or losing a stage-3 checkpoint', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    const p1 = new Campaign(390, 550, storage);
    p1.state.stage = 3; p1.state.highestCompleted = 2; p1.state.balance = '9007199254740993';
    values.set(SAVE_KEY, JSON.stringify({ ...p1.state, version: 1, kingdomCompleted: undefined }));
    const p2 = new Campaign(390, 550, storage);
    expect(p2.state.version).toBe(2); expect(p2.stageId).toBe(3);
    expect(p2.balance).toBe(9007199254740993n);
    expect(p2.state.highestCompleted).toBe(2);
  });
  it('reloads interrupted boss and cleanup from the stage checkpoint without provisional awards', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    const seed = new Campaign(390, 550, storage);
    seed.state.stage = 3; seed.state.highestCompleted = 2; seed.state.balance = '120';
    values.set(SAVE_KEY, JSON.stringify(seed.state));
    const game = new Campaign(390, 550, storage);
    game.sim.phase = 'BOSS_INTRO'; game.startBoss();
    game.sim.provisional = 80n;
    game.sim.boss!.threats.push({ id: 7, kind: 'NORMAL', x: 10, y: game.sim.groundY - 12,
      vx: 0, vy: 0, hp: 1, radius: 12, damage: 1, reward: 1n, signal: false });
    game.advance(P0.stepMs);
    let loaded = new Campaign(390, 550, storage);
    expect(loaded.stageId).toBe(3); expect(loaded.sim.phase).toBe('PREP');
    expect(loaded.sim.provisional).toBe(0n); expect(loaded.balance).toBe(120n);
    expect(loaded.sim.hp).toBe(4);
    game.sim.boss!.takeHit(16); game.sim.phase = 'BOSS_CLEANUP';
    game.sim.boss!.threats.push({ id: 8, kind: 'NORMAL', x: 10, y: 100, vx: 0, vy: 0,
      hp: 1, radius: 12, damage: 1, reward: 1n, signal: false });
    game.advance(P0.stepMs);
    loaded = new Campaign(390, 550, storage);
    expect(loaded.stageId).toBe(3); expect(loaded.state.highestCompleted).toBe(2);
    expect(loaded.balance).toBe(120n);
  });
  it('progresses 1–12 through actual wave and projectile transitions, then reloads Kingdom completion', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    const game = new Campaign(390, 550, storage);
    for (let stage = 1; stage <= 12; stage++) {
      expect(game.stageId).toBe(stage);
      for (let wave = 0; wave < game.stage.waves.length; wave++) {
        expect(game.startWave()).toBe(true);
        for (let tick = 0; tick < 800 && game.sim.phase === 'RUNNING'; tick++) {
          for (const body of game.sim.cookies) for (let hit = 0; hit < body.hp; hit++)
            game.sim.bullets.push({ x: body.x, y: body.y, vx: 0, vy: 0, lifeMs: 100, bounces: 0 });
          game.advance(50);
        }
        expect(game.sim.phase).not.toBe('RUNNING');
      }
      if (game.stage.boss) {
        expect(game.sim.phase).toBe('BOSS_INTRO');
        expect(game.startBoss()).toBe(true);
        for (let tick = 0; tick < 300 && (game.sim.phase === 'BOSS_FIGHT' || game.sim.phase === 'BOSS_CLEANUP'); tick++) {
          const boss = game.sim.boss!;
          for (const threat of boss.threats) for (let hit = 0; hit < threat.hp; hit++)
            game.sim.bullets.push({ x: threat.x, y: threat.y, vx: 0, vy: 0, lifeMs: 100, bounces: 0 });
          if (boss.hp > 0) {
            const spot = boss.target;
            game.sim.bullets.push({ x: spot.x, y: spot.y, vx: 0, vy: 0, lifeMs: 100, bounces: 0 });
          }
          game.advance(50);
        }
      }
      expect(game.sim.phase).toBe('WON');
      expect(game.state.highestCompleted).toBe(stage);
      if (stage < 12) expect(game.continue()).toBe(true);
    }
    expect(game.state.kingdomCompleted).toBe(true);
    expect(game.continue()).toBe(false);
    const balance = game.balance;
    const loaded = new Campaign(390, 550, storage);
    expect(loaded.state.highestCompleted).toBe(12);
    expect(loaded.state.kingdomCompleted).toBe(true);
    expect(loaded.sim.phase).toBe('WON');
    expect(loaded.balance).toBe(balance);
  });
});
