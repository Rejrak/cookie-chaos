import { describe, expect, it } from 'vitest';
import { P0 } from './config';
import { P0Simulation } from './sim';

function game(seed = 7, credit = 0n, arena: 'FREE' | 'OBSTACLE' = 'FREE') {
  return new P0Simulation(390, 550, arena, seed, credit);
}
function clearWave(sim: P0Simulation) {
  for (let i = 0; i < 500 && sim.phase === 'RUNNING'; i++) {
    for (const body of sim.cookies) sim.bullets.push({ x: body.x, y: body.y, vx: 0, vy: 0, lifeMs: 100, bounces: 0 });
    sim.advance(50);
  }
  expect(sim.phase).not.toBe('RUNNING');
}

describe('P0 shooter simulation', () => {
  it('keeps visible sizes and hit geometry proportional and uses a bounded intercept time', () => {
    for (const [width, height] of [[320, 150], [390, 664], [960, 539], [960, 720]]) {
      const sim = new P0Simulation(width, height, 'FREE', 7);
      expect(sim.cookieRadius).toBeGreaterThanOrEqual(P0.cookieRadius);
      expect(sim.cookieRadius).toBeLessThanOrEqual(P0.maxCookieRadius);
      expect(sim.bulletRadius).toBeGreaterThanOrEqual(P0.bulletRadius);
      const topFlightMs = (sim.cannonY - sim.cookieRadius * 0.85 - sim.cookieRadius) / sim.projectileSpeed * 1000;
      expect(topFlightMs).toBeGreaterThan(250);
      expect(topFlightMs).toBeLessThan(P0.projectileTravelMs);
      sim.startWave();
      for (const body of sim.cookies) {
        expect(body.x).toBeGreaterThanOrEqual(sim.cookieRadius);
        expect(body.x).toBeLessThanOrEqual(sim.width - sim.cookieRadius);
      }
      sim.resize(320, 150);
      for (const body of sim.cookies) {
        expect(body.x).toBeGreaterThanOrEqual(sim.cookieRadius);
        expect(body.x).toBeLessThanOrEqual(sim.width - sim.cookieRadius);
      }
    }
  });
  it('uses the scaled desktop cookie and projectile radii for collision', () => {
    const inside = new P0Simulation(960, 539, 'FREE', 4);
    const outside = new P0Simulation(960, 539, 'FREE', 4);
    inside.startWave(); outside.startWave();
    for (const [sim, margin] of [[inside, -0.5], [outside, 1]] as const) {
      const body = sim.cookies[0];
      sim.bullets.push({ x: body.x + sim.cookieRadius + sim.bulletRadius + margin,
        y: body.y + 80, vx: 0, vy: -25_000, lifeMs: 100, bounces: 0 });
      sim.advance(P0.stepMs);
    }
    expect(inside.hits).toBe(1);
    expect(outside.hits).toBe(0);
  });
  it('rejects invalid setup rather than running a non-finite simulation', () => {
    expect(() => new P0Simulation(Number.NaN, 500, 'FREE', 1)).toThrow();
    expect(() => new P0Simulation(300, 500, 'FREE', -1)).toThrow();
  });
  it('uses a fixed step and seeded wave order at 30 and 60 FPS', () => {
    const a = game(), b = game(); a.startWave(); b.startWave();
    a.setAim(120, 20, true); b.setAim(120, 20, true);
    for (let i = 0; i < 180; i++) a.advance(1000 / 30);
    for (let i = 0; i < 360; i++) b.advance(1000 / 60);
    expect(a.cookies).toEqual(b.cookies);
    expect(a.hp).toBe(b.hp);
    expect(a.shots).toBe(b.shots);
    expect(a.hits).toBe(b.hits);
    expect(a.waveTimeMs).toBeCloseTo(b.waveTimeMs, 5);
  });

  it('fires only while held and uses Damage and Fire Rate purchases', () => {
    const sim = game(3, 50n);
    expect(sim.buy('damage')).toBe(true);
    expect(sim.buy('fireRate')).toBe(true);
    expect(sim.buy('damage')).toBe(false);
    expect(sim.consolidated).toBe(10n);
    expect(sim.damage).toBe(2); expect(sim.fireRate).toBe(4);
    sim.startWave(); sim.setAim(195, 0, true); sim.advance(1000);
    const fired = sim.shots;
    expect(fired).toBeGreaterThanOrEqual(4);
    sim.release(); sim.advance(500);
    expect(sim.shots).toBe(fired);
    expect(sim.buy('damage')).toBe(false);
  });

  it('rejects purchases without consolidated currency and counts one fast hit', () => {
    const sim = game();
    expect(sim.buy('damage')).toBe(false);
    sim.startWave();
    const body = sim.cookies[0];
    body.hp = 1;
    sim.bullets.push({ x: body.x, y: body.y + 100, vx: 0, vy: -30_000, lifeMs: 500, bounces: 0 });
    sim.advance(P0.stepMs);
    expect(sim.destroyed[body.kind]).toBe(1);
    expect(sim.hits).toBe(1);
    expect(sim.sp).toBe(P0.cookies[body.kind].sp);
    expect(sim.provisional).toBe(P0.cookies[body.kind].reward);
    expect(sim.consolidated).toBe(0n);
    sim.advance(P0.stepMs);
    expect(sim.destroyed[body.kind]).toBe(1);
  });

  it('reflects bullets at walls without losing speed and removes expired bullets', () => {
    const sim = game(); sim.startWave();
    sim.bullets.push({ x: 8, y: 250, vx: -400, vy: 0, lifeMs: 100, bounces: 0 });
    sim.advance(P0.stepMs);
    expect(sim.bullets[0].vx).toBe(400);
    expect(sim.bullets[0].bounces).toBe(1);
    sim.advance(200);
    expect(sim.bullets.length).toBe(0);
  });

  it('reflects cookies with energy loss, separates collisions, and handles resize', () => {
    const sim = game(); sim.startWave();
    const body = sim.cookies[0]; body.x = P0.cookieRadius; body.y = 300; body.vx = -100; body.vy = 0;
    sim.cookies.push({ ...body, id: 999, x: body.x + 1, vx: 0 });
    sim.advance(P0.stepMs);
    expect(body.vx).toBeGreaterThan(0);
    expect(Math.hypot(sim.cookies[0].x - sim.cookies[1].x, sim.cookies[0].y - sim.cookies[1].y)).toBeGreaterThan(30);
    const id = body.id, hp = body.hp;
    sim.resize(320, 210);
    expect(body.id).toBe(id); expect(body.hp).toBe(hp);
    expect(body.x).toBeGreaterThanOrEqual(P0.cookieRadius);
    expect(body.x).toBeLessThanOrEqual(320 - P0.cookieRadius);
  });

  it('keeps obstacle comparison isolated to the selected arena', () => {
    const a = game(2, 0n, 'FREE'), b = game(2, 0n, 'OBSTACLE');
    expect(a.obstacle).toBeNull(); expect(b.obstacle).not.toBeNull();
    a.startWave(); b.startWave();
    expect(a.cookies[0].kind).toBe(b.cookies[0].kind);
    expect(a.cookies[0].x).toBe(b.cookies[0].x);
  });

  it('deflects projectiles and cookies on the slanted obstacle', () => {
    const sim = game(2, 0n, 'OBSTACLE'); sim.startWave();
    const obstacle = sim.obstacle!;
    const x = (obstacle.ax + obstacle.bx) / 2, y = (obstacle.ay + obstacle.by) / 2;
    sim.cookies[0].x = 350; sim.cookies[0].y = 30;
    sim.bullets.push({ x, y: y - 50, vx: 0, vy: 12_000, lifeMs: 200, bounces: 0 });
    sim.advance(P0.stepMs);
    expect(sim.bullets[0].bounces).toBe(1);
    expect(Math.hypot(sim.bullets[0].vx, sim.bullets[0].vy)).toBeCloseTo(12_000, 5);
    const body = sim.cookies[0]; body.x = x; body.y = y - P0.cookieRadius + 1; body.vy = 100;
    sim.advance(P0.stepMs);
    expect(body.y).toBeLessThan(y);
  });

  it('catches a fast bullet that grazes the visible obstacle edge', () => {
    const sim = game(2, 0n, 'OBSTACLE'); sim.startWave();
    const o = sim.obstacle!, x = (o.ax + o.bx) / 2, y = (o.ay + o.by) / 2;
    const length = Math.hypot(o.bx - o.ax, o.by - o.ay);
    const nx = -(o.by - o.ay) / length, ny = (o.bx - o.ax) / length;
    sim.cookies[0].x = 350; sim.cookies[0].y = 30;
    sim.bullets.push({ x: x + nx * 13, y: y + ny * 13, vx: -nx * 600, vy: -ny * 600, lifeMs: 500, bounces: 0 });
    sim.advance(P0.stepMs);
    expect(sim.bullets[0].bounces).toBe(1);
    expect(Math.hypot(sim.bullets[0].vx, sim.bullets[0].vy)).toBeCloseTo(600, 5);
  });
  it('traces the reflected path and cannot hit through a slanted obstacle', () => {
    const blocked = game(2, 0n, 'OBSTACLE'), reflected = game(2, 0n, 'OBSTACLE');
    for (const [sim, targetSide] of [[blocked, -1], [reflected, 1]] as const) {
      sim.startWave();
      const o = sim.obstacle!, x = (o.ax + o.bx) / 2, y = (o.ay + o.by) / 2;
      const length = Math.hypot(o.bx - o.ax, o.by - o.ay);
      const nx = -(o.by - o.ay) / length, ny = (o.bx - o.ax) / length;
      const body = sim.cookies[0]; body.x = x + nx * (targetSide < 0 ? -45 : 75); body.y = y + ny * (targetSide < 0 ? -45 : 75);
      body.vx = 0; body.vy = 0; body.hp = 1;
      sim.bullets.push({ x: x + nx * 50, y: y + ny * 50, vx: -nx * 12_000, vy: -ny * 12_000, lifeMs: 500, bounces: 0 });
      sim.advance(P0.stepMs);
    }
    expect(blocked.hits).toBe(0);
    expect(reflected.hits).toBe(1);
    expect(reflected.ricochetHits).toBe(1);
  });
  it('resolves multiple fast wall bounces within one fixed step', () => {
    const sim = game(); sim.startWave();
    sim.cookies.length = 0;
    sim.bullets.push({ x: sim.width / 2, y: 250, vx: 180_000, vy: 0, lifeMs: 100, bounces: 0 });
    sim.advance(P0.stepMs);
    expect(sim.bullets[0].bounces).toBeGreaterThanOrEqual(2);
    expect(sim.bullets[0].x).toBeGreaterThanOrEqual(sim.bulletRadius);
    expect(sim.bullets[0].x).toBeLessThanOrEqual(sim.width - sim.bulletRadius);
    expect(Math.abs(sim.bullets[0].vx)).toBe(180_000);
  });

  it('requires all ordinary waves even when Stage Points reach target early', () => {
    const sim = game(); sim.sp = P0.targetSp;
    expect(sim.startWave()).toBe(true);
    clearWave(sim);
    expect(sim.phase).toBe('PREP');
    expect(sim.wave).toBe(0);
  });

  it('fails after at most two insufficient recovery waves and preserves purchases', () => {
    const sim = game(3, 25n); sim.buy('damage'); sim.hp = 100;
    for (let i = 0; i < 5; i++) {
      expect(sim.startWave()).toBe(true);
      sim.advance(40_000);
      if (i < 4) expect(sim.phase).toBe('PREP');
    }
    expect(sim.phase).toBe('LOST'); expect(sim.recoveryCount).toBe(2);
    expect(sim.provisional).toBe(0n);
    expect(sim.consolidated).toBe(5n);
    expect(sim.retry()).toBe(true);
    expect(sim.hp).toBe(5); expect(sim.damageLevel).toBe(1);
    expect(sim.wave).toBe(-1); expect(sim.retry()).toBe(false);
  });

  it('permits a deficit to be recovered without a third recovery wave', () => {
    const sim = game(); sim.hp = 100;
    for (let i = 0; i < 3; i++) { sim.startWave(); sim.advance(40_000); }
    expect(sim.phase).toBe('PREP'); expect(sim.sp).toBe(0);
    sim.startWave(); clearWave(sim);
    expect(sim.sp).toBeGreaterThanOrEqual(25);
    expect(sim.phase).toBe('WON'); expect(sim.recoveryCount).toBe(1);
  });

  it('stops spawning at the wave deadline but resolves enemies already present', () => {
    const sim = game(); sim.startWave(); sim.hp = 100;
    sim.waveTimeMs = P0.waveMs - 50;
    sim.advance(100);
    expect(sim.phase).toBe('RUNNING');
    expect(sim.cookies.length).toBeGreaterThan(0);
    const count = sim.cookies.length;
    sim.advance(100);
    expect(sim.cookies.length).toBe(count);
  });

  it('consolidates only on victory and cannot transition twice', () => {
    const sim = game(7, 9007199254740993n);
    for (let i = 0; i < 3; i++) { sim.startWave(); clearWave(sim); }
    expect(sim.phase).toBe('WON');
    expect(sim.sp).toBe(45);
    expect(sim.consolidated).toBe(9007199254740993n + BigInt(sim.destroyed.NORMAL) + 6n * BigInt(sim.destroyed.HARD) + 5n * BigInt(sim.destroyed.GOLDEN));
    expect(sim.provisional).toBe(0n);
    expect(sim.startWave()).toBe(false); expect(sim.retry()).toBe(false);
  });

  it('does not advance physics or wave timers while in Shop or terminal state', () => {
    const sim = game(); sim.advance(10_000); expect(sim.totalTimeMs).toBe(0);
    sim.startWave(); sim.hp = 1;
    sim.cookies[0].y = sim.groundY - P0.cookieRadius;
    sim.advance(P0.stepMs); expect(sim.phase).toBe('LOST');
    const time = sim.totalTimeMs;
    sim.advance(10_000); expect(sim.totalTimeMs).toBe(time);
    expect(sim.provisional).toBe(0n);
  });

  it('Golden missed causes zero damage', () => {
    const sim = game(); sim.startWave();
    sim.cookies.push({ id: 999, kind: 'GOLDEN', x: 100, y: sim.groundY - P0.cookieRadius, vx: 0, vy: 0, hp: 1, stuckMs: 0 });
    sim.advance(P0.stepMs);
    expect(sim.escaped.GOLDEN).toBe(1); expect(sim.hp).toBe(P0.maxHp);
  });

  it('keeps attempted movement finite when a cookie stalls', () => {
    const sim = game(); sim.startWave();
    const body = sim.cookies[0]; body.stuckMs = 2600; body.vx = 0; body.vy = 0;
    sim.advance(P0.stepMs);
    expect(Number.isFinite(body.x + body.y + body.vx + body.vy)).toBe(true);
    expect(body.vy).toBeGreaterThan(0);
  });
});
