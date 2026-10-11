import { describe, expect, it } from 'vitest';
import { P0Simulation } from '../p0/sim';
import { CAMPAIGN_FALL_SECONDS, KINGDOM_ONE } from './stages';

// The near-horizontal lane is the P1 player's discovered strategy; this is a repeatable proxy, not a human playtest.
function lane(damageLevel: number, fireRateLevel: number) {
  const stage = KINGDOM_ONE[2];
  const sim = new P0Simulation(390, 720, 'FREE', 1207, 0n,
    { rules: { ...stage, bossCheckpoint: true, fallSeconds: CAMPAIGN_FALL_SECONDS }, maxHp: 100, hp: 100 });
  sim.damageLevel = damageLevel; sim.fireRateLevel = fireRateLevel;
  for (let i = 0; i < stage.waves.length; i++) {
    sim.startWave(); sim.setAim(sim.width - 1, sim.cannonY - 30, true);
    sim.advance(40_000);
  }
  return { shots: sim.shots, hits: sim.hits, hardDestroyed: sim.destroyed.HARD,
    hardEscaped: sim.escaped.HARD, hpLost: 100 - sim.hp, sp: sim.sp };
}

describe('P2 Fire Rate lane comparison', () => {
  it('records the P1 horizontal barrage without suppressing it or changing upgrade behavior', () => {
    const base = lane(0, 0), rate = lane(0, 3), damage = lane(2, 0);
    expect(rate.shots).toBeGreaterThan(base.shots);
    expect(damage.hits).toBeLessThanOrEqual(base.hits);
    expect(base.hpLost).toBeGreaterThan(0);
    expect(rate.hpLost).toBeLessThan(base.hpLost);
    expect(damage.hardDestroyed).toBeGreaterThan(base.hardDestroyed);
    expect(base.hardEscaped + base.hardDestroyed).toBe(9);
    expect(rate.hardEscaped + rate.hardDestroyed).toBe(9);
    expect(damage.hardEscaped + damage.hardDestroyed).toBe(9);
  });
});
