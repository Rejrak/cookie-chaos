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
      step(a, 4_000); step(b, 4_000);
      expect(a.metrics()).toEqual(b.metrics());
      expect(a.attacks).toBeGreaterThan(0);
      expect(a.threats.length).toBeGreaterThan(0);
      expect(a.timeMs).toBeCloseTo(4_000);
    }
  });
  it('alternates Barbarian armored threats and Normal bursts', () => {
    const boss = new BossEncounter('barbarian', 2); boss.resize(390, 550);
    step(boss, 4_000); expect(boss.threats.map(t => t.kind)).toContain('HARD');
    step(boss, 6_100); expect(boss.threats.map(t => t.kind)).toContain('NORMAL');
  });
  it('Knight guard absorbs shots; interception opens a real damage window', () => {
    const boss = new BossEncounter('knight', 2); boss.resize(390, 550);
    expect(boss.takeHit(3)).toEqual({ dealt: 0, blocked: 3, defeated: false });
    expect(boss.hp).toBe(20); expect(boss.guard).toBe(5);
    step(boss, 4_000);
    const signal = boss.threats.find(t => t.signal)!;
    expect(boss.intercept(signal)).toBe(6n);
    expect(boss.vulnerabilityMs).toBeGreaterThan(0);
    expect(boss.takeHit(2).dealt).toBe(4);
    expect(boss.guard).toBe(5);
    step(boss, 3_300);
    expect(boss.takeHit(1).blocked).toBe(1);
  });
  it('Berserker rage changes the volley, and Cookieng crown gates Golden Form', () => {
    const berserker = new BossEncounter('berserker', 2); berserker.resize(390, 550);
    berserker.takeHit(13); expect(berserker.phase).toBe('RAGE');
    step(berserker, 3_800); expect(berserker.threats.length).toBe(3);
    const king = new BossEncounter('cookieng', 2); king.resize(390, 550);
    expect(king.takeHit(10).dealt).toBe(0);
    expect(king.hp).toBe(32); expect(king.phase).toBe('GOLDEN FORM');
    expect(king.takeHit(1).dealt).toBe(1);
  });
  it('caps hostile rewards, awards no SP and never duplicates interception', () => {
    const game = gameBoss(3), boss = game.sim.boss!;
    game.sim.sp = 34;
    step(boss, 4_000, game.sim.groundY);
    const threat = boss.threats[0];
    expect(boss.intercept(threat)).toBe(6n);
    expect(boss.intercept(threat)).toBe(0n);
    expect(game.sim.sp).toBe(34);
    expect(boss.rewardPaid).toBeLessThanOrEqual(boss.config.rewardBudget);
  });
  it('boss death waits for hostile cleanup; base death during cleanup wins priority', () => {
    const game = gameBoss(3), boss = game.sim.boss!;
    boss.threats.push({ id: 8, kind: 'HARD', x: 20, y: game.sim.groundY - 30, vx: 0, vy: 0,
      hp: 3, radius: 20, damage: 2, reward: 6n, signal: false });
    game.sim.hp = 1;
    shootBoss(game, 16);
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
    shootBoss(game, 16);
    expect(game.sim.phase).toBe('BOSS_CLEANUP');
    expect(game.balance).toBe(0n);
    boss.threats.length = 0;
    game.advance(P0.stepMs);
    expect(game.sim.phase).toBe('WON'); expect(game.balance).toBe(45n);
    expect(game.state.hp).toBe(4); expect(game.state.stage).toBe(4);
    game.advance(5_000); expect(game.balance).toBe(45n); expect(game.state.hp).toBe(4);
    expect(game.continue()).toBe(true); expect(game.stageId).toBe(4);
    expect(game.continue()).toBe(false);
  });
  it('times out independently of waves and allows Retry from the collection phase', () => {
    const game = gameBoss(6); game.sim.hp = 100;
    game.advance(BOSSES.knight.timerMs + 50);
    expect(game.sim.phase).toBe('LOST'); expect(game.retry()).toBe(true);
    expect(game.sim.phase).toBe('PREP'); expect(game.sim.wave).toBe(-1);
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
});
