import { describe, expect, it } from 'vitest';
import { RULES, SpawnManager } from './game';
import { calculateGameLayout } from './ui-layout';

const viewports = [[320, 320], [360, 640], [390, 844], [568, 320], [1280, 720]] as const;

describe('Cookie Kingdom layout', () => {
  it.each(viewports)('keeps the first interactive cookie clear of chrome at %i×%i', (width, height) => {
    const frame = calculateGameLayout(width, height);
    const cookie = new SpawnManager(() => 0.5).spawn({ width, height }, 0, RULES.radius, frame.playArea,
      { forcedType: 'NORMAL' });
    expect(cookie).toBeDefined();
    expect(cookie!.x - cookie!.radius).toBeGreaterThanOrEqual(frame.playArea.left + RULES.edge);
    expect(cookie!.x + cookie!.radius).toBeLessThanOrEqual(frame.playArea.right - RULES.edge);
    expect(cookie!.y - cookie!.radius).toBeGreaterThanOrEqual(frame.hudHeight);
    expect(cookie!.y + cookie!.radius).toBeLessThanOrEqual(height - frame.dockHeight - frame.bossPanelHeight - RULES.edge);
  });

  it('uses modal shop on compact landscape and square, sidebar only on desktop', () => {
    expect(calculateGameLayout(320, 320).sideShop).toBe(false);
    expect(calculateGameLayout(568, 320).sideShop).toBe(false);
    const desktop = calculateGameLayout(1280, 720);
    expect(desktop.sideShop).toBe(true);
    expect(desktop.playArea.right).toBe(desktop.shop.x);
    expect(desktop.shop.x + desktop.shop.width).toBe(1280);
  });

  it('reserves the boss panel without hiding the parry field', () => {
    const frame = calculateGameLayout(320, 320, true);
    expect(frame.playArea.bottom - frame.playArea.top).toBeGreaterThanOrEqual(100);
    expect(frame.bossPanelHeight).toBe(48);
    expect(frame.sideShop).toBe(false);
  });

  it('moves only cookies that no longer fit after desktop to square resize', () => {
    const model = new SpawnManager(() => 0.5);
    const desktop = calculateGameLayout(1280, 720).playArea;
    for (let i = 0; i < 5; i++) model.spawn({ width: 1280, height: 720 }, 0, 40, desktop);
    model.resize({ width: 320, height: 320 }, calculateGameLayout(320, 320).playArea);
    expect(model.active.size).toBeGreaterThan(0);
    for (const cookie of model.active.values()) {
      expect(cookie.x - cookie.radius).toBeGreaterThanOrEqual(RULES.edge);
      expect(cookie.x + cookie.radius).toBeLessThanOrEqual(320 - RULES.edge);
      expect(cookie.y - cookie.radius).toBeGreaterThanOrEqual(94);
      expect(cookie.y + cookie.radius).toBeLessThanOrEqual(260 - RULES.edge);
    }
  });

  it('rejects invalid viewport dimensions', () => {
    expect(() => calculateGameLayout(0, 320)).toThrow(RangeError);
    expect(() => calculateGameLayout(320, Number.NaN)).toThrow(RangeError);
  });
});
