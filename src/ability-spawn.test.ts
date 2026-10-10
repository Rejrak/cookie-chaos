import { describe, expect, it } from 'vitest';
import { SpawnManager, RULES } from './game';
import { AbilityManager } from './abilities';

describe('Cookie Rain spawning', () => {
  it('adds half as many spawn opportunities without altering the regular Bomb roll', () => {
    const abilities = new AbilityManager();
    abilities.grant('RAIN', 'earned'); abilities.activate('RAIN', true);
    let regular = 0, extra = 0;
    for (let time = 500; time <= 12_000; time += 500) {
      if (time % 1500 === 0) regular++;
      extra += abilities.tick(500, 1500).rain;
    }
    expect([regular, extra]).toEqual([8, 4]);
    const bombRoll = () => 0.9999;
    const ordinary = new SpawnManager(bombRoll).spawn({ width: 500, height: 500 }, 0, 40, undefined,
      { stageNumber: 25 });
    const rain = new SpawnManager(bombRoll).spawn({ width: 500, height: 500 }, 0, 40, undefined,
      { stageNumber: 25, excludeBomb: true, lifetimeBonusMs: 500 });
    expect(ordinary?.type).toBe('BOMB');
    expect(rain?.type).toBe('NORMAL');
    expect(rain?.expiresAt).toBe(3500);
  });

  it('keeps cap, geometry and Tough fairness on successful extra spawns', () => {
    const spawns = new SpawnManager(() => 0.99);
    const area = { left: 0, top: RULES.hudHeight, right: 800, bottom: 650 };
    for (let i = 0; i < 30; i++) spawns.spawn({ width: 800, height: 650 }, i, 40, area,
      { stageNumber: 4, toughNeeded: true, excludeBomb: true });
    expect(spawns.active.size).toBeLessThanOrEqual(RULES.maxCookies);
    const cookies = [...spawns.active.values()];
    expect(cookies.some(cookie => cookie.tough)).toBe(true);
    for (let i = 0; i < cookies.length; i++) for (let j = i + 1; j < cookies.length; j++) {
      expect(Math.hypot(cookies[i].x - cookies[j].x, cookies[i].y - cookies[j].y))
        .toBeGreaterThanOrEqual(cookies[i].radius + cookies[j].radius + RULES.gap);
    }
  });
});
