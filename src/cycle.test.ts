import { describe, expect, it } from 'vitest';
import { cycleForStage } from './cycle';
import { bossForStage, BossManager } from './boss';

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
});
