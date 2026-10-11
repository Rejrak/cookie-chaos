import { describe, expect, it } from 'vitest';
import { P0 } from '../p0/config';
import { BOSSES } from './boss';
import { Campaign, SHOP, SAVE_KEY } from './campaign';
import { KINGDOM_ONE } from './stages';

const waveReward = (counts: Record<'NORMAL' | 'HARD' | 'GOLDEN', number>) =>
  BigInt(counts.NORMAL) * P0.cookies.NORMAL.reward + BigInt(counts.HARD) * P0.cookies.HARD.reward + BigInt(counts.GOLDEN) * P0.cookies.GOLDEN.reward;
const potentialThrough = (stageId: number) => KINGDOM_ONE.slice(0, stageId).reduce((sum, stage) => {
  const waves = stage.waves.reduce((value, counts) => value + waveReward(counts), 0n);
  const boss = stage.boss ? BOSSES[({ 3: 'barbarian', 6: 'knight', 9: 'berserker', 12: 'cookieng' } as const)[stage.id as 3 | 6 | 9 | 12]] : null;
  return sum + waves + (boss ? boss.victoryReward + boss.rewardBudget : 0n);
}, 0n);

describe('experimental offensive economy', () => {
  it('keeps first purchases accessible and spreads the full offensive cost through Kingdom I', () => {
    expect(SHOP.damage.costs).toEqual([30n, 80n, 180n, 360n]);
    expect(SHOP.fireRate.costs).toEqual([30n, 100n, 250n]);
    const full = [...SHOP.damage.costs, ...SHOP.fireRate.costs].reduce((sum, cost) => sum + cost, 0n);
    expect(full).toBe(1030n);
    expect(potentialThrough(1)).toBeGreaterThan(30n);
    expect(potentialThrough(6)).toBeLessThan(full);
    expect(potentialThrough(12)).toBeGreaterThan(full);
  });
  it('loads a previously maxed P2 save without charging the new prices', () => {
    const original = new Campaign(390, 550);
    original.state = { ...original.state, stage: 12, highestCompleted: 12, kingdomCompleted: true,
      balance: '9007199254740993', damageLevel: 4, fireRateLevel: 3 };
    const storage = { getItem: (key: string) => key === SAVE_KEY ? JSON.stringify(original.state) : null,
      setItem: () => { throw Error('read-only fixture'); } };
    const loaded = new Campaign(390, 550, storage);
    expect(loaded.sim.damage).toBe(5);
    expect(loaded.sim.fireRate).toBe(6);
    expect(loaded.balance).toBe(9007199254740993n);
  });
});
