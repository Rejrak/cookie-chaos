import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import { SpawnManager, advanceGameTime } from './game';
import { applyCookieHit } from './gameplay';
import { StageManager, stageConfig } from './stage';
import { UpgradeManager } from './upgrades';

describe('StageManager', () => {
  it('starts stage 1 with isolated progress and time', () => {
    const stage = new StageManager();
    expect(stage).toMatchObject({ stageNumber: 1, target: 12n, progress: 0n, earned: 0n,
      durationMs: 30_000, remainingMs: 30_000, status: 'RUNNING', maxCompletedStage: 0 });
    expect(stage.progressPercent).toBe(0);
  });

  it('uses the twelve configured stages and deterministic later stages', () => {
    const targets = [12n, 20n, 30n, 40n, 55n, 70n, 85n, 105n, 130n, 160n, 190n, 220n];
    const durations = [30, 40, 50, 55, 60, 65, 70, 75, 80, 85, 90, 90];
    targets.forEach((target, index) => expect(stageConfig(index + 1)).toEqual({ target,
      durationMs: durations[index] * 1000, isBossCheckpoint: (index + 1) % 3 === 0 }));
    expect(stageConfig(13)).toEqual({ target: 240n, durationMs: 90_000, isBossCheckpoint: false });
    expect(stageConfig(100_000).target).toBe(220n + 20n * 99_988n);
    for (const invalid of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => stageConfig(invalid)).toThrow(RangeError);
    }
  });

  it('advances only on active simulation time and fails at the exact boundary', () => {
    const stage = new StageManager();
    expect(stage.tick(1000)).toBe('RUNNING');
    expect(stage.remainingMs).toBe(29_000);
    expect(stage.tick(9000, true)).toBe('RUNNING');
    expect(stage.remainingMs).toBe(29_000);
    expect(stage.tick(28_999)).toBe('RUNNING');
    expect(stage.remainingMs).toBe(1);
    expect(stage.tick(1)).toBe('FAILED');
    expect(stage.remainingMs).toBe(0);
    expect(stage.recordReward(12n)).toBe(false);
    expect(stage.tick(5000)).toBe('FAILED');
    for (const invalid of [-1, Infinity, NaN]) expect(() => stage.tick(invalid)).toThrow(RangeError);
  });

  it('completes once, caps display progress, and continues exactly one stage', () => {
    const stage = new StageManager();
    expect(stage.recordReward(5n)).toBe(true);
    expect(stage.recordReward(10n)).toBe(true);
    expect(stage).toMatchObject({ status: 'COMPLETED', progress: 12n, earned: 15n, maxCompletedStage: 1 });
    expect(stage.progressPercent).toBe(100);
    expect(stage.recordReward(1n)).toBe(false);
    expect(stage.tick(100_000)).toBe('COMPLETED');
    expect(stage.retry()).toBe(false);
    expect(stage.continue()).toBe(true);
    expect(stage).toMatchObject({ stageNumber: 2, target: 20n, progress: 0n, earned: 0n,
      remainingMs: 40_000, status: 'RUNNING', maxCompletedStage: 1 });
    expect(stage.continue()).toBe(false);
    expect(() => stage.recordReward(0n)).toThrow(RangeError);
  });

  it('retries only failed stage and preserves completed-stage record', () => {
    const stage = new StageManager();
    expect(stage.retry()).toBe(false);
    stage.recordReward(3n);
    stage.tick(30_000);
    expect(stage.continue()).toBe(false);
    expect(stage.retry()).toBe(true);
    expect(stage).toMatchObject({ stageNumber: 1, target: 12n, progress: 0n, earned: 0n,
      remainingMs: 30_000, status: 'RUNNING' });
    expect(stage.retry()).toBe(false);
  });

  it('keeps huge bigint rewards exact and converts only bounded percentage', () => {
    const huge = 2n ** 70n;
    const stage = new StageManager(() => ({ target: huge, durationMs: 30_000, isBossCheckpoint: false }));
    stage.recordReward(huge / 2n);
    expect(stage.progress).toBe(huge / 2n);
    expect(stage.progressPercent).toBe(50);
    stage.recordReward(huge);
    expect(stage.earned).toBe(huge + huge / 2n);
    expect(stage.progress).toBe(huge);
    expect(stage.progressPercent).toBe(100);
    expect(() => new StageManager(() => ({ target: 0n, durationMs: 30_000, isBossCheckpoint: false }))).toThrow(RangeError);
  });

  it('keeps early normal-only stages possible and Cookie Value useful later', () => {
    const scenarios = [[1, 1n], [3, 1n], [6, 2n], [12, 4n]] as const;
    let previousTarget = 0n;
    for (const [number, reward] of scenarios) {
      const { target, durationMs } = stageConfig(number);
      const needed = (target + reward - 1n) / reward;
      const timeMs = Number(needed - 1n) * 1500;
      expect(target).toBeGreaterThan(previousTarget);
      expect(timeMs).toBeLessThan(durationMs);
      previousTarget = target;
    }
    expect((Number(stageConfig(12).target) - 1) * 1500).toBeGreaterThan(stageConfig(12).durationMs);
  });
});

describe('stage gameplay integration', () => {
  it('uses actual Normal, Golden, and Hard rewards once', () => {
    const spawns = new SpawnManager(() => 0);
    const economy = new Economy();
    const stage = new StageManager();
    const normal = spawns.spawn({ width: 900, height: 700 }, 0, 40, undefined, { forcedType: 'NORMAL' })!;
    const golden = spawns.spawn({ width: 900, height: 700 }, 0, 40, undefined, { forcedType: 'GOLDEN' })!;
    const hard = spawns.spawn({ width: 900, height: 700 }, 0, 40, undefined, { forcedType: 'HARD' })!;
    expect(applyCookieHit(spawns, economy, stage, normal.id, 1, 2n)?.reward).toBe(2n);
    expect(applyCookieHit(spawns, economy, stage, golden.id, 1, 2n)?.reward).toBe(10n);
    expect(stage).toMatchObject({ status: 'COMPLETED', progress: 12n, earned: 12n });
    expect(applyCookieHit(spawns, economy, stage, hard.id, 3, 2n)).toBeUndefined();
    expect(applyCookieHit(spawns, economy, stage, golden.id, 1, 2n)).toBeUndefined();
    expect(economy).toMatchObject({ balance: 12n, cookiesDestroyed: 2, validHits: 2 });
  });

  it('counts Hard partial hits but neither pays nor advances stage until death', () => {
    const spawns = new SpawnManager(() => 0);
    const economy = new Economy();
    const stage = new StageManager();
    const hard = spawns.spawn({ width: 300, height: 300 }, 0, 40, undefined, { forcedType: 'HARD' })!;
    for (const hp of [2, 1]) {
      expect(applyCookieHit(spawns, economy, stage, hard.id, 1, 1n)).toMatchObject({ hp, reward: null });
      expect(stage.progress).toBe(0n);
      expect(economy.balance).toBe(0n);
    }
    expect(applyCookieHit(spawns, economy, stage, hard.id, 1, 1n)?.reward).toBe(6n);
    expect(stage.progress).toBe(6n);
    expect(economy).toMatchObject({ balance: 6n, validHits: 3, cookiesDestroyed: 1 });
  });

  it('does not subtract stage progress on purchase, failure, or retry', () => {
    const spawns = new SpawnManager(() => 0);
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    const stage = new StageManager();
    const golden = spawns.spawn({ width: 300, height: 300 }, 0, 40, undefined, { forcedType: 'GOLDEN' })!;
    applyCookieHit(spawns, economy, stage, golden.id, 1, 3n);
    expect(stage.earned).toBe(15n);
    expect(upgrades.buy('value', economy)).toBe(true);
    expect(economy.balance).toBe(1n);
    expect(stage.earned).toBe(15n);
    expect(stage.status).toBe('COMPLETED');
    expect(upgrades.reward).toBe(2n);
  });

  it('preserves economy and upgrades through failure and repeated retry', () => {
    const spawns = new SpawnManager(() => 0);
    const economy = new Economy();
    const upgrades = new UpgradeManager();
    const stage = new StageManager();
    economy.recordHit(30n);
    upgrades.buy('value', economy);
    const normal = spawns.spawn({ width: 300, height: 300 }, 0, 40, undefined, { forcedType: 'NORMAL' })!;
    applyCookieHit(spawns, economy, stage, normal.id, upgrades.damage, upgrades.reward);
    stage.tick(stage.remainingMs);
    expect(applyCookieHit(spawns, economy, stage, normal.id, 1, 1n)).toBeUndefined();
    expect(stage.retry()).toBe(true);
    expect(stage.retry()).toBe(false);
    expect(stage.progress).toBe(0n);
    expect(economy.balance).toBe(18n);
    expect(upgrades.reward).toBe(2n);
    expect(economy.lifetimeEarned).toBe(32n);
  });

  it('keeps cookie expiry and stage time aligned through modal pause', () => {
    const spawns = new SpawnManager(() => 0);
    const stage = new StageManager();
    const cookie = spawns.spawn({ width: 300, height: 300 }, 0)!;
    let now = advanceGameTime(0, 3000, false);
    stage.tick(3000);
    now = advanceGameTime(now, 10_000, true);
    stage.tick(10_000, true);
    expect(spawns.expire(now)).toEqual([]);
    expect(stage.remainingMs).toBe(27_000);
    now = advanceGameTime(now, 5000, false);
    stage.tick(5000);
    expect(spawns.expire(now)).toEqual([cookie.id]);
    expect(stage.remainingMs).toBe(22_000);
  });
});
