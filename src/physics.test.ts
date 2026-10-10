import { describe, expect, it } from 'vitest';
import { SpawnManager, COOKIE_TYPES, RULES, movementSpeed, type PlayArea } from './game';
import { Economy } from './economy';
import { UpgradeManager } from './upgrades';
import { TimeWarp } from './time-warp';
import { autoTarget } from './abilities';

const area: PlayArea = { left: 0, top: 160, right: 390, bottom: 768 };
const compact: PlayArea = { left: 0, top: 94, right: 320, bottom: 260 };

describe('R1 cookie lifetimes and movement', () => {
  it('raises movement speed by stage while limiting compact fields', () => {
    expect([1, 4, 7, 10, 13].map(stage => movementSpeed(stage, area))).toEqual([35, 52, 70, 90, 38]);
    expect(movementSpeed(10, compact)).toBeCloseTo(58.1);
  });

  it('uses per-type lifetimes, with a permanent bonus for collectible cookies only', () => {
    expect(Object.fromEntries(Object.entries(COOKIE_TYPES).map(([type, rule]) => [type, rule.lifetimeMs])))
      .toEqual({ NORMAL: 3000, GOLDEN: 1000, HARD: 4000, REINFORCED: 5000, TITAN: 6000, BOMB: 2500 });
    for (const type of Object.keys(COOKIE_TYPES) as (keyof typeof COOKIE_TYPES)[]) {
      const model = new SpawnManager(() => 0.5);
      const cookie = model.spawn({ width: 390, height: 844 }, 100, 40, area,
        { stageNumber: 9, forcedType: type, lifetimeBonusMs: 2000 })!;
      expect(cookie.expiresAt).toBe(100 + COOKIE_TYPES[type].lifetimeMs + (type === 'BOMB' ? 0 : 2000));
      expect(model.expire(cookie.expiresAt - 1)).toEqual([]);
      expect(model.expire(cookie.expiresAt)).toEqual([cookie]);
    }
  });

  it('prices Lifetime exactly, blocks insufficient funds and preserves purchased levels', () => {
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    expect(upgrades.cost('lifetime')).toBe(30n);
    expect(upgrades.buy('lifetime', economy)).toBe(false);
    economy.grantBossReward(250n);
    for (const [level, cost] of [30n, 45n, 70n, 105n].entries()) {
      expect(upgrades.cost('lifetime')).toBe(cost);
      expect(upgrades.buy('lifetime', economy)).toBe(true);
      expect(upgrades.level('lifetime')).toBe(BigInt(level + 1));
      expect(upgrades.lifetimeBonusMs).toBe((level + 1) * 500);
    }
    expect(upgrades.cost('lifetime')).toBeNull();
    expect(upgrades.buy('lifetime', economy)).toBe(false);
    expect(economy.balance).toBe(0n);
  });

  it('leaves existing expiries unchanged after a Lifetime purchase', () => {
    const model = new SpawnManager(() => 0.5);
    const economy = new Economy(); economy.grantBossReward(30n);
    const upgrades = new UpgradeManager();
    const old = model.spawn({ width: 390, height: 844 }, 0, 40, area, { forcedType: 'GOLDEN' })!;
    expect(upgrades.buy('lifetime', economy)).toBe(true);
    const next = model.spawn({ width: 390, height: 844 }, 100, 40, area,
      { forcedType: 'GOLDEN', lifetimeBonusMs: upgrades.lifetimeBonusMs })!;
    expect(old.expiresAt).toBe(1000);
    expect(next.expiresAt).toBe(1600);
  });

  it('moves deterministically across 30/60 FPS and never crosses the play area', () => {
    const setup = () => {
      const model = new SpawnManager(() => 0.5);
      model.spawn({ width: 320, height: 320 }, 0, 40, compact, { stageNumber: 12, forcedType: 'NORMAL' });
      return model;
    };
    const slow = setup(), fast = setup();
    for (let i = 0; i < 300; i++) slow.move(1000 / 30, compact);
    for (let i = 0; i < 600; i++) fast.move(1000 / 60, compact);
    const a = [...slow.active.values()][0], b = [...fast.active.values()][0];
    expect([a.x, a.y, a.vx, a.vy]).toEqual([b.x, b.y, b.vx, b.vy]);
    expect(a.x - a.radius).toBeGreaterThanOrEqual(RULES.edge);
    expect(a.x + a.radius).toBeLessThanOrEqual(compact.right - RULES.edge);
    expect(a.y - a.radius).toBeGreaterThanOrEqual(compact.top);
    expect(a.y + a.radius).toBeLessThanOrEqual(compact.bottom - RULES.edge);
    expect(movementSpeed(12, compact)).toBeLessThan(movementSpeed(12, area));
  });

  it('does not consume spawn RNG during movement or a paused frame', () => {
    let calls = 0;
    const model = new SpawnManager(() => { calls++; return 0.5; });
    const cookie = model.spawn({ width: 390, height: 844 }, 0, 40, area)!;
    const afterSpawn = calls, original = [cookie.x, cookie.y];
    model.move(0, area);
    expect([cookie.x, cookie.y]).toEqual(original);
    model.move(1000, area);
    expect(calls).toBe(afterSpawn);
  });

  it('separates moving cookies with different radii without persistent overlap', () => {
    const model = new SpawnManager(() => 0.5);
    const a = model.spawn({ width: 390, height: 844 }, 0, 40, area, { forcedType: 'NORMAL' })!;
    const b = model.spawn({ width: 390, height: 844 }, 0, 56, area, { forcedType: 'HARD' })!;
    a.x = 150; a.y = 350; a.vx = 80; a.vy = 0;
    b.x = 260; b.y = 350; b.vx = -80; b.vy = 0;
    for (let i = 0; i < 240; i++) {
      model.move(16, area);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius + RULES.gap - 0.01);
    }
  });

  it.each([[320, 320, compact], [390, 844, area]] as const)('keeps a moving crowd in bounds without overlap at %i×%i', (width, height, field) => {
    let seed = 1;
    const model = new SpawnManager(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32));
    for (let i = 0; i < RULES.maxCookies; i++) model.spawn({ width, height }, 0, i % 2 ? 56 : 40, field,
      { stageNumber: 9, forcedType: i % 2 ? 'HARD' : 'NORMAL' });
    expect(model.active.size).toBeGreaterThan(0);
    for (let step = 0; step < 300; step++) {
      model.move(16, field);
      const cookies = [...model.active.values()];
      for (const a of cookies) {
        expect(a.x - a.radius).toBeGreaterThanOrEqual(field.left + RULES.edge - 0.01);
        expect(a.x + a.radius).toBeLessThanOrEqual(field.right - RULES.edge + 0.01);
        expect(a.y - a.radius).toBeGreaterThanOrEqual(field.top - 0.01);
        expect(a.y + a.radius).toBeLessThanOrEqual(field.bottom - RULES.edge + 0.01);
        for (const b of cookies) if (a.id < b.id)
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius + RULES.gap - 0.01);
      }
    }
  });

  it('preserves velocity, HP, ID and expiry through resize and supports Auto targeting', () => {
    const model = new SpawnManager(() => 0.5);
    const cookie = model.spawn({ width: 390, height: 844 }, 0, 40, area, { stageNumber: 9, forcedType: 'TITAN' })!;
    model.hit(cookie.id, 2);
    const before = { id: cookie.id, hp: cookie.hp, expiresAt: cookie.expiresAt };
    const direction = Math.atan2(cookie.vy!, cookie.vx!);
    model.resize({ width: 320, height: 320 }, compact);
    expect(cookie).toMatchObject(before);
    expect(Math.atan2(cookie.vy!, cookie.vx!)).toBeCloseTo(direction);
    expect(Math.hypot(cookie.vx!, cookie.vy!)).toBeLessThanOrEqual((compact.bottom - compact.top) * 0.35);
    expect(autoTarget(model.active.values(), 0)).toBe(cookie);
    expect(cookie.x - cookie.radius).toBeGreaterThanOrEqual(RULES.edge);
    expect(cookie.y - cookie.radius).toBeGreaterThanOrEqual(compact.top);
  });

  it('uses threat time for movement and expiry while stage time keeps its rate', () => {
    const full = new SpawnManager(() => 0.5), slow = new SpawnManager(() => 0.5);
    full.spawn({ width: 390, height: 844 }, 0, 40, area, { forcedType: 'GOLDEN' });
    slow.spawn({ width: 390, height: 844 }, 0, 40, area, { forcedType: 'GOLDEN' });
    const warp = new TimeWarp(); warp.charges = 1; expect(warp.activate()).toBe(true);
    full.move(800, area);
    slow.move(warp.tick(800), area);
    expect(warp.gameplayNow).toBe(800);
    expect(warp.threatNow).toBe(400);
    expect(slow.active.values().next().value!.x).not.toBe(full.active.values().next().value!.x);
    expect(slow.expire(warp.threatNow)).toEqual([]);
    expect(warp.tick(1000, true)).toBe(0);
    expect(warp.threatNow).toBe(400);
  });
});
