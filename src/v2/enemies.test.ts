import { describe, expect, it } from 'vitest';
import { P0, type CookieKind, type ShooterRules } from '../p0/config';
import { P0Simulation, type Body } from '../p0/sim';
import { CAMPAIGN_FALL_SECONDS, KINGDOM_ONE } from './stages';

const rules = (wave: Partial<Record<CookieKind, number>>): ShooterRules => ({ targetSp: 100,
  waves: [wave], spawnMs: 1_000, waveMs: 20_000, maxActive: 9, bossCheckpoint: false, fallSeconds: CAMPAIGN_FALL_SECONDS });
const make = (wave: Partial<Record<CookieKind, number>>, arena: 'FREE' | 'OBSTACLE' = 'FREE') =>
  new P0Simulation(390, 550, arena, 1207, 0n, { rules: rules(wave), maxHp: 20, hp: 20 });
const add = (sim: P0Simulation, kind: CookieKind, id: number, x: number, y: number): Body => {
  const body: Body = { id, kind, x, y, vx: 0, vy: 0, hp: P0.cookies[kind].hp, stuckMs: 0,
    radius: kind === 'TITAN' ? sim.cookieRadius * 1.42 : kind === 'REINFORCED' ? sim.cookieRadius * 1.15 : sim.cookieRadius };
  sim.cookies.push(body); return body;
};
const shoot = (sim: P0Simulation, target: Body) => {
  sim.bullets.push({ x: target.x, y: target.y, vx: 0, vy: 0, lifeMs: 100, bounces: 0 });
  sim.advance(P0.stepMs);
};

describe('P3-A campaign cookies', () => {
  it('introduces Reinforced at 4, Bomb at 7 and Titan at 9 without changing P0 waves', () => {
    expect(P0.waves.every(wave => !('REINFORCED' in wave || 'TITAN' in wave || 'BOMB' in wave))).toBe(true);
    for (const [kind, first] of [['REINFORCED', 4], ['BOMB', 7], ['TITAN', 9]] as const) {
      expect(KINGDOM_ONE.slice(0, first - 1).every(stage => stage.waves.every(wave => !(wave[kind] ?? 0)))).toBe(true);
      expect(KINGDOM_ONE[first - 1].waves.some(wave => (wave[kind] ?? 0) > 0)).toBe(true);
    }
  });
  it('uses distinct HP, size, points and ground damage for the two tough types', () => {
    const sim = make({ REINFORCED: 1, TITAN: 1 }); sim.startWave(); sim.advance(1_100);
    const tough = sim.cookies.find(body => body.kind === 'REINFORCED')!, titan = sim.cookies.find(body => body.kind === 'TITAN')!;
    expect(tough.hp).toBe(6); expect(titan.hp).toBe(12);
    expect(titan.radius!).toBeGreaterThan(tough.radius!);
    sim.damageLevel = 4;
    shoot(sim, tough); expect(tough.hp).toBe(1); expect(sim.sp).toBe(0);
    shoot(sim, tough); expect(sim.sp).toBe(5); expect(sim.provisional).toBe(9n);
    shoot(sim, titan); expect(titan.hp).toBe(7);
    sim.resize(320, 175); expect(titan.hp).toBe(7);
    expect(titan.x).toBeGreaterThanOrEqual(titan.radius!);
    expect(titan.x).toBeLessThanOrEqual(sim.width - titan.radius!);
    titan.y = sim.groundY - titan.radius!;
    sim.advance(P0.stepMs);
    expect(sim.escaped.TITAN).toBe(1); expect(sim.damageTaken).toBe(2);
  });
  it('releases a large cookie trapped against the compact obstacle instead of blocking the wave', () => {
    const sim = new P0Simulation(320, 175, 'OBSTACLE', 1, 0n,
      { rules: rules({ TITAN: 1 }), maxHp: 20, hp: 20 });
    sim.startWave(); sim.advance(30_000);
    expect(sim.phase).toBe('PREP');
    expect(sim.escaped.TITAN).toBe(1);
    expect(sim.waveBudgets[0].generated).toBe(1);
  });

  it('Bomb ground impact deals three HP once, with no blast or award', () => {
    const sim = make({ BOMB: 1 }); sim.startWave(); sim.advance(10_000);
    expect(sim.escaped.BOMB).toBe(1); expect(sim.hp).toBe(17);
    expect(sim.sp).toBe(0); expect(sim.provisional).toBe(0n);
    expect(sim.explosions).toHaveLength(0);
    sim.advance(10_000); expect(sim.hp).toBe(17);
  });
  it('a shot detonates one Bomb, awards full indirect rewards and leaves the base safe', () => {
    const sim = make({ BOMB: 1 }); sim.startWave();
    const bomb = sim.cookies[0]; bomb.x = 100; bomb.y = 140; bomb.vx = bomb.vy = 0;
    const normal = add(sim, 'NORMAL', 50, 130, 140), reinforced = add(sim, 'REINFORCED', 51, 80, 170);
    const titan = add(sim, 'TITAN', 52, 145, 160);
    shoot(sim, bomb);
    expect(sim.destroyed.BOMB).toBe(1); expect(sim.destroyed.NORMAL).toBe(1);
    expect(sim.destroyed.REINFORCED).toBe(1); expect(titan.hp).toBe(6);
    expect(sim.sp).toBe(6); expect(sim.provisional).toBe(10n);
    expect(sim.hp).toBe(20); expect(sim.explosions).toHaveLength(1);
    expect(sim.events.find(event => event.type === 'explosion')?.radius).toBe(sim.cookieRadius * 3.2);
    expect(sim.cookies.includes(normal) || sim.cookies.includes(reinforced)).toBe(false);
  });
  it('chains multiple Bombs exactly once in stable ID order with no duplicate points or currency', () => {
    const sim = make({ BOMB: 1 }); sim.startWave();
    const first = sim.cookies[0]; first.x = 100; first.y = 140; first.vx = first.vy = 0;
    for (let i = 0; i < 6; i++) add(sim, 'BOMB', 100 + i, 145 + i * 35, 140);
    add(sim, 'NORMAL', 200, 210, 140);
    shoot(sim, first);
    expect(sim.destroyed.BOMB).toBe(7); expect(sim.destroyed.NORMAL).toBe(1);
    expect(sim.sp).toBe(1); expect(sim.provisional).toBe(1n);
    expect(sim.explosions).toHaveLength(7);
    expect(sim.hp).toBe(20);
    const awarded = sim.provisional;
    sim.advance(100); expect(sim.provisional).toBe(awarded);
  });
  it('blast near obstacle and wall uses the same radius and does not affect boss rewards', () => {
    const sim = make({ BOMB: 1 }, 'OBSTACLE'); sim.startWave();
    const bomb = sim.cookies[0]; bomb.x = sim.cookieRadius; bomb.y = 110; bomb.vx = bomb.vy = 0;
    add(sim, 'HARD', 50, 55, 110);
    shoot(sim, bomb);
    expect(sim.destroyed.BOMB).toBe(1); expect(sim.destroyed.HARD).toBe(1);
    expect(sim.provisional).toBe(6n); expect(sim.sp).toBe(3);
  });
});
