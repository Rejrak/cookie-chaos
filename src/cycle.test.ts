import { describe, expect, it } from 'vitest';
import { cycleForStage, hardHpForStage } from './cycle';
import { bossForStage, BossManager } from './boss';
import { SpawnManager } from './game';

describe('endless cycle metadata and bosses', () => {
  it('maps global stages to cycles', () => {
    for (const [stage, cycle, position] of [[1, 1, 1], [12, 1, 12], [13, 2, 1], [15, 2, 3],
      [24, 2, 12], [25, 3, 1], [36, 3, 12], [240, 20, 12]]) {
      expect(cycleForStage(stage)).toMatchObject({ cycleNumber: cycle, stageInCycle: position });
    }
    for (const invalid of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => cycleForStage(invalid)).toThrow(RangeError);
    }
  });

  it('rotates and scales four bosses without changing the first cycle', () => {
    for (const [position, id, body, guard, bodyGrowth, guardGrowth, multiplier] of [
      [3, 'barbarian', 14, 8, 8, 3, 20], [6, 'knight', 22, 12, 12, 4, 35],
      [9, 'berserker', 34, 0, 16, 0, 60], [12, 'cookieng', 48, 20, 20, 5, 100],
    ] as const) {
      for (const cycle of [1, 2, 3, 20]) {
        const boss = bossForStage((cycle - 1) * 12 + position)!;
        expect(boss).toMatchObject({ id, bodyHp: body + bodyGrowth * (cycle - 1),
          protectionHp: guard + guardGrowth * (cycle - 1), multiplier: BigInt(multiplier * cycle) });
        expect(new BossManager(boss.stage).phase).toBe(id === 'barbarian' ? 'ARMOR' :
          id === 'knight' ? 'SHIELD' : id === 'cookieng' ? 'CROWN' : 'NORMAL');
      }
    }
    expect(bossForStage(13)).toBeUndefined();
    expect(() => bossForStage(Number.MAX_SAFE_INTEGER - 1)).toThrow(RangeError);
  });

  it('sets Hard HP at spawn without changing existing cookies or other types', () => {
    const spawns = new SpawnManager(() => 0);
    const first = spawns.spawn({ width: 900, height: 700 }, 0, 40, undefined,
      { forcedType: 'HARD', hardHp: hardHpForStage(12) })!;
    const second = spawns.spawn({ width: 900, height: 700 }, 0, 40, undefined,
      { forcedType: 'HARD', hardHp: hardHpForStage(24) })!;
    expect([first.maxHp, second.maxHp, hardHpForStage(36), hardHpForStage(48)]).toEqual([3, 4, 5, 6]);
    expect(spawns.hit(second.id, 2)).toEqual({ destroyed: false, hp: 2 });
    expect(spawns.resize({ width: 900, height: 700 })).toEqual([]);
    expect(spawns.active.get(second.id)).toMatchObject({ hp: 2, maxHp: 4 });
    expect(first.maxHp).toBe(3);
    expect(() => spawns.spawn({ width: 300, height: 300 }, 0, 40, undefined,
      { forcedType: 'HARD', hardHp: Infinity })).toThrow(RangeError);
  });
});
