import { describe, expect, it } from 'vitest';
import { AbilityManager, autoTarget } from './abilities';
import { Economy } from './economy';
import { SpawnManager } from './game';
import { applyCookieHit } from './gameplay';
import { StageManager } from './stage';
import { TimeWarp } from './time-warp';

describe('Auto-clicker gameplay', () => {
  it('uses the human hit path for partial HP, rewards and concurrent input', () => {
    const abilities = new AbilityManager();
    const economy = new Economy();
    const stage = new StageManager(() => ({ target: 100n, durationMs: 30_000, isBossCheckpoint: false, toughRequired: 1 }));
    const spawns = new SpawnManager(() => 0.25);
    const bomb = spawns.spawn({ width: 800, height: 600 }, 0, 40, undefined,
      { stageNumber: 9, forcedType: 'BOMB' })!;
    const hard = spawns.spawn({ width: 800, height: 600 }, 0, 40, undefined,
      { stageNumber: 9, forcedType: 'HARD' })!;
    abilities.grant('AUTO', 'win:6'); abilities.activate('AUTO', true);
    expect(autoTarget(spawns.active.values())?.id).toBe(hard.id);
    expect(abilities.tick(600, 1500).auto).toBe(1);
    expect(applyCookieHit(spawns, economy, stage, hard.id, 1, 2n)?.hp).toBe(2);
    expect(economy.balance).toBe(0n);
    expect(applyCookieHit(spawns, economy, stage, hard.id, 1, 2n)?.hp).toBe(1);
    expect(abilities.tick(600, 1500).auto).toBe(1);
    expect(applyCookieHit(spawns, economy, stage, autoTarget(spawns.active.values())!.id, 1, 2n))
      .toMatchObject({ destroyed: true, currencyReward: 12n, stagePoints: 3n });
    expect(applyCookieHit(spawns, economy, stage, hard.id, 1, 2n)).toBeUndefined();
    expect(autoTarget(spawns.active.values())).toBeUndefined();
    expect(spawns.active.has(bomb.id)).toBe(true);
    expect([economy.balance, stage.pointsEarned, stage.toughDestroyed]).toEqual([12n, 3n, 1]);
  });

  it('keeps ability cadence on gameplay time while Time Warp slows expiry', () => {
    const abilities = new AbilityManager();
    const warp = new TimeWarp();
    abilities.grant('AUTO', 'auto'); abilities.grant('RAIN', 'rain');
    abilities.activate('AUTO', true); abilities.activate('RAIN', true);
    warp.charges = 1; warp.activate();
    let auto = 0, rain = 0;
    for (let step = 0; step < 60; step++) {
      warp.tick(100);
      const pulses = abilities.tick(100, 1500);
      auto += pulses.auto; rain += pulses.rain;
    }
    expect([auto, rain, warp.gameplayNow, warp.threatNow]).toEqual([10, 2, 6000, 3000]);
    abilities.endStage();
    expect(abilities.tick(6000, 1500)).toEqual({ auto: 0, rain: 0 });
  });
});
