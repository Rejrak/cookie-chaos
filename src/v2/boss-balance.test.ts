import { describe, expect, it } from 'vitest';
import { P0Simulation, type Phase } from '../p0/sim';
import { type BossId } from './boss';
import { CAMPAIGN_FALL_SECONDS, KINGDOM_ONE } from './stages';

type Strategy = 'barrage' | 'focus' | 'adaptive';
const stageFor = { barbarian: 3, knight: 6, berserker: 9, cookieng: 12 } as const;
const profiles = [[0, 0], [2, 1], [4, 0], [0, 3], [4, 3]] as const;

function fight(id: BossId, damageLevel: number, fireRateLevel: number, strategy: Strategy, seed: number, width: number, height: number) {
  const stage = KINGDOM_ONE[stageFor[id] - 1];
  const sim = new P0Simulation(width, height, stage.arena, seed, 0n,
    { rules: { ...stage, bossCheckpoint: true, bossId: id, fallSeconds: CAMPAIGN_FALL_SECONDS }, maxHp: 20, hp: 20 });
  sim.damageLevel = damageLevel; sim.fireRateLevel = fireRateLevel; sim.phase = 'BOSS_INTRO'; sim.startBoss();
  const phase = (): Phase => sim.phase;
  for (let frame = 0; frame < 800 && (phase() === 'BOSS_FIGHT' || phase() === 'BOSS_CLEANUP'); frame++) {
    const boss = sim.boss!;
    let aim = boss.target;
    if (strategy === 'barrage') aim = { x: width - 1, y: sim.cannonY - 30, radius: 0 };
    if (strategy === 'adaptive' && boss.threats.length) {
      const threat = [...boss.threats].sort((a, b) => b.y - a.y || a.id - b.id)[0];
      const travel = Math.max(0, sim.cannonY - threat.y) / sim.projectileSpeed;
      aim = { x: threat.x + threat.vx * travel, y: threat.y + threat.vy * travel, radius: threat.radius };
    }
    sim.setAim(aim.x, aim.y, true);
    sim.advance(100);
  }
  const boss = sim.boss!;
  return { outcome: phase(), ms: Math.round(boss.timeMs), first: Math.round(boss.firstAttackMs), attacks: boss.attacks,
    intercepted: boss.intercepted, landed: boss.landed, hpLost: 20 - sim.hp,
    shots: sim.shots, hits: sim.hits, ricochets: sim.ricochetHits, phases: boss.phaseDurations.map(p => p.phase),
    damageDealt: boss.damageDealt, reward: sim.consolidated.toString() };
}

describe('boss projectile strategy measurements', () => {
  it('compares real projectile paths, upgrades, seeds and arena sizes without granting direct damage', () => {
    const samples = [];
    for (const id of Object.keys(stageFor) as BossId[])
      for (const [damage, rate] of profiles)
        for (const strategy of ['barrage', 'focus', 'adaptive'] as const)
          for (const [width, height, seed] of [[390, 550, 1207], [960, 614, 77]] as const)
            samples.push({ id, damage, rate, strategy, width, seed, ...fight(id, damage, rate, strategy, seed, width, height) });
    expect(samples).toHaveLength(120);
    expect(samples.every(sample => sample.first > 0 && sample.first <= 2_500)).toBe(true);
    expect(samples.every(sample => sample.attacks > 0)).toBe(true);
    expect(samples.every(sample => sample.shots > 0)).toBe(true);
    const elite = samples.filter(sample => sample.damage === 4 && sample.rate === 3);
    expect(elite.some(sample => sample.strategy === 'focus' && sample.outcome === 'WON')).toBe(true);
    expect(elite.some(sample => sample.strategy === 'barrage' && sample.outcome !== 'WON')).toBe(true);
    expect(elite.filter(sample => sample.id === 'cookieng' && sample.strategy === 'focus').every(sample => sample.ms > 4_000 && sample.attacks >= 2)).toBe(true);
    expect(samples.filter(sample => sample.damage === 0 && sample.rate === 0 && sample.strategy === 'adaptive' && sample.width === 390)
      .every(sample => sample.outcome === 'WON')).toBe(true);
    // This is a measurement harness. It deliberately does not assert that a robot's success means human balance.
  });
});
