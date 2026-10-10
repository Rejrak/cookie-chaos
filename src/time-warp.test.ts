import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import { StageManager } from './stage';
import { TimeWarp, timeWarpCost } from './time-warp';
import { BossAttackController } from './boss-attacks';

describe('Time Warp', () => {
  it('buys up to three persistent charges using exact bigint stage prices', () => {
    const economy = new Economy();
    const warp = new TimeWarp();
    expect(timeWarpCost(1)).toBe(124n);
    expect(timeWarpCost(240)).toBe(1080n);
    expect(timeWarpCost(Number.MAX_SAFE_INTEGER)).toBe(120n + 4n * BigInt(Number.MAX_SAFE_INTEGER));
    expect(warp.buy(economy, 12)).toBe(false);
    economy.recordHit(1000n);
    for (let i = 0; i < 3; i++) expect(warp.buy(economy, 12)).toBe(true);
    expect(warp.charges).toBe(3);
    expect(warp.buy(economy, 12)).toBe(false);
    expect(economy.balance).toBe(496n);
    expect(() => timeWarpCost(0)).toThrow(RangeError);
  });

  it('slows only threat time for six seconds, suspends in modal, and cannot stack', () => {
    const economy = new Economy();
    const warp = new TimeWarp();
    const stage = new StageManager();
    economy.recordHit(1000n);
    warp.buy(economy, 1);
    expect(warp.activate()).toBe(true);
    expect(warp.activate()).toBe(false);
    expect(warp.tick(3000)).toBe(1500);
    stage.tick(3000);
    expect(warp).toMatchObject({ gameplayNow: 3000, threatNow: 1500, remainingMs: 3000 });
    expect(stage.remainingMs).toBe(27_000);
    expect(warp.tick(5000, true)).toBe(0);
    stage.tick(5000, true);
    expect(warp.remainingMs).toBe(3000);
    expect(stage.remainingMs).toBe(27_000);
    expect(warp.tick(5000)).toBe(3500);
    stage.tick(5000);
    expect(warp).toMatchObject({ gameplayNow: 8000, threatNow: 5000, remainingMs: 0 });
    expect(stage.remainingMs).toBe(22_000);
    expect(warp.tick(1000)).toBe(1000);
    expect(warp.threatNow).toBe(6000);
    warp.endStage();
    expect(warp.charges).toBe(0);
    expect(() => warp.tick(-1)).toThrow(RangeError);
  });

  it('keeps unused charges after end of stage and retry', () => {
    const economy = new Economy();
    const warp = new TimeWarp();
    economy.recordHit(1000n);
    warp.buy(economy, 4);
    warp.buy(economy, 4);
    warp.activate();
    warp.endStage();
    expect(warp).toMatchObject({ charges: 1, remainingMs: 0 });
    expect(warp.activate()).toBe(true);
  });

  it('doubles a parry reaction window while the boss timer keeps its normal rate', () => {
    const stage = new StageManager();
    const attack = new BossAttackController(3);
    const warp = new TimeWarp();
    attack.tick(3600, 'ARMOR');
    expect(attack.state).toBe('PARRY_WINDOW');
    const economy = new Economy();
    economy.recordHit(124n);
    expect(warp.buy(economy, 1)).toBe(true);
    expect(warp.activate()).toBe(true);
    stage.tick(1000);
    expect(attack.tick(warp.tick(1000), 'ARMOR')).toBe(0);
    expect(attack.remainingMs).toBe(300);
    expect(stage.remainingMs).toBe(29_000);
    expect(attack.tick(warp.tick(599), 'ARMOR')).toBe(0);
    expect(attack.canParry).toBe(true);
    expect(attack.attemptParry()).toBe(true);
  });
});
