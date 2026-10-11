import { describe, expect, it } from 'vitest';
import { P0Simulation } from '../p0/sim';
import { SHOP } from './campaign';
import { CAMPAIGN_FALL_SECONDS, KINGDOM_ONE } from './stages';

type Plan = 'rush' | 'balanced' | 'conservative';
const old = { damage: [20n, 35n, 55n, 80n], fireRate: [20n, 40n, 65n] };

function run(plan: Plan, costs: { damage: readonly bigint[]; fireRate: readonly bigint[] }, seed = 1207) {
  let wallet = 0n, spent = 0n, damage = 0, rate = 0, defense = 0;
  const stages = [];
  const buy = (kind: 'damage' | 'fireRate' | 'maxHp') => {
    const price = kind === 'maxHp' ? SHOP.maxHp.costs[defense] : costs[kind][kind === 'damage' ? damage : rate];
    if (price === undefined || wallet < price) return false;
    wallet -= price; spent += price;
    if (kind === 'damage') damage++; else if (kind === 'fireRate') rate++; else defense++;
    return true;
  };
  for (const stage of KINGDOM_ONE) {
    const order: ('damage' | 'fireRate' | 'maxHp')[] = plan === 'rush' ? ['damage', 'fireRate'] :
      plan === 'balanced' ? ['damage', 'maxHp', 'fireRate'] : stage.id >= 6 ? ['maxHp', 'damage'] : ['maxHp'];
    for (let purchase = 0; purchase < 8; purchase++) {
      const selected = order.find(kind => kind === 'maxHp' ? defense < SHOP.maxHp.costs.length && wallet >= SHOP.maxHp.costs[defense] :
        (kind === 'damage' ? damage : rate) < costs[kind].length && wallet >= costs[kind][kind === 'damage' ? damage : rate]);
      if (!selected || !buy(selected)) break;
    }
    const sim = new P0Simulation(390, 550, stage.arena, (seed + stage.id * 2654435761) >>> 0, 0n,
      { rules: { ...stage, bossCheckpoint: !!stage.boss,
        bossId: stage.boss ? ({ 3: 'barbarian', 6: 'knight', 9: 'berserker', 12: 'cookieng' } as const)[stage.id as 3 | 6 | 9 | 12] : undefined,
        fallSeconds: CAMPAIGN_FALL_SECONDS }, maxHp: 100, hp: 100 });
    sim.damageLevel = damage; sim.fireRateLevel = rate;
    for (let section = 0; section < 6 && sim.phase !== 'WON' && sim.phase !== 'LOST'; section++) {
      if (sim.phase === 'PREP') sim.startWave();
      else if (sim.phase === 'BOSS_INTRO') sim.startBoss();
      for (let frame = 0; frame < 900 && (sim.phase === 'RUNNING' || sim.phase === 'BOSS_FIGHT' || sim.phase === 'BOSS_CLEANUP'); frame++) {
        const threat = sim.boss?.threats.slice().sort((a, b) => b.y - a.y || a.id - b.id)[0];
        const cookie = sim.cookies.slice().sort((a, b) => b.y - a.y || a.id - b.id)[0];
        const target = threat && threat.y > sim.height * 0.5 ? threat : cookie ?? sim.boss?.target ?? threat;
        if (target) {
          const travel = Math.max(0, sim.cannonY - target.y) / sim.projectileSpeed;
          sim.setAim(target.x + ('vx' in target ? target.vx * travel : 0), target.y + ('vy' in target ? target.vy * travel : 0), true);
        } else sim.release();
        sim.advance(100);
      }
    }
    const earned = sim.phase === 'WON' ? sim.consolidated : 0n;
    wallet += earned;
    stages.push({ stage: stage.id, outcome: sim.phase, earned, wallet, damage, rate, defense,
      sp: sim.sp, targetSp: stage.targetSp, hpLost: 100 - sim.hp, attacks: sim.boss?.attacks ?? 0 });
    if (sim.phase !== 'WON') break;
  }
  return { stages, wallet, spent, damage, rate, defense };
}

describe('projectile-based economic strategy sample', () => {
  it('compares real earned Cookies and purchase timing without free upgrades', () => {
    const current = { damage: SHOP.damage.costs, fireRate: SHOP.fireRate.costs };
    const before = run('rush', old), after = run('rush', current), balanced = run('balanced', current), conservative = run('conservative', current);
    expect(before.stages.length).toBeGreaterThan(0);
    expect(after.stages.length).toBeGreaterThan(0);
    expect(after.spent).toBeGreaterThanOrEqual(0n);
    expect(after.damage).toBeLessThanOrEqual(4);
    expect(after.rate).toBeLessThanOrEqual(3);
    expect(balanced.defense).toBeGreaterThanOrEqual(0);
    expect(conservative.damage).toBeLessThanOrEqual(after.damage);
    const fullAt = (result: ReturnType<typeof run>) => result.stages.find(stage => stage.damage === 4 && stage.rate === 3)?.stage ?? 13;
    expect(fullAt(before)).toBeLessThanOrEqual(6);
    expect(fullAt(after)).toBeGreaterThanOrEqual(9);
    for (const result of [before, after, balanced, conservative]) {
      expect(result.stages).toHaveLength(12);
      expect(result.stages.every(stage => stage.outcome === 'WON')).toBe(true);
      expect(result.wallet + result.spent).toBe(result.stages.reduce((sum, stage) => sum + stage.earned, 0n));
    }
    // The bot is an optimistic, 100-HP economic sample; its stage reach is not a human completion claim.
  });
});
