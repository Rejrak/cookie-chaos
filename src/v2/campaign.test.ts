import { describe, expect, it } from 'vitest';
import { P0 } from '../p0/config';
import { Campaign, SAVE_KEY, recoveredHp } from './campaign';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function clearWave(game: Campaign) {
  for (let i = 0; i < 700 && game.sim.phase === 'RUNNING'; i++) {
    for (const body of game.sim.cookies) game.sim.bullets.push({ x: body.x, y: body.y, vx: 0, vy: 0, lifeMs: 100, bounces: 0 });
    game.advance(50);
  }
  expect(game.sim.phase).not.toBe('RUNNING');
}

describe('V2 campaign', () => {
  it('completes ordinary stages once, consolidates pending Cookies and restores HP', () => {
    const db = storage(), game = new Campaign(390, 550, db);
    game.sim.hp = 2;
    for (let i = 0; i < 3; i++) { expect(game.startWave()).toBe(true); clearWave(game); }
    expect(game.sim.phase).toBe('WON');
    expect(game.state.stage).toBe(2);
    expect(game.state.highestCompleted).toBe(1);
    expect(game.state.hp).toBe(3);
    const balance = game.balance;
    expect(balance).toBeGreaterThan(0n);
    game.advance(1000); expect(game.balance).toBe(balance);
    expect(new Campaign(390, 550, db).state.stage).toBe(2);
    expect(new Campaign(390, 550, db).balance).toBe(balance);
    expect(game.continue()).toBe(true); expect(game.stageId).toBe(2);
    expect(game.continue()).toBe(false);
  });

  it('prepares stage 3 boss without awarding victory or unlocking stage 4', () => {
    const game = new Campaign(390, 550, null, 3);
    for (let i = 0; i < 3; i++) { game.startWave(); clearWave(game); }
    expect(game.sim.phase).toBe('BOSS_INTRO');
    expect(game.state.stage).toBe(3);
    expect(game.state.highestCompleted).toBe(0);
    expect(game.balance).toBe(0n);
    expect(game.continue()).toBe(false);
  });

  it('fails after two insufficient recovery waves without granting pending currency', () => {
    const game = new Campaign(390, 550);
    game.sim.hp = 100;
    for (let i = 0; i < 5; i++) {
      expect(game.startWave()).toBe(true);
      game.advance(60_000);
    }
    expect(game.sim.phase).toBe('LOST');
    expect(game.sim.recoveryCount).toBe(2);
    expect(game.balance).toBe(0n);
    expect(game.sim.provisional).toBe(0n);
    expect(game.startWave()).toBe(false);
  });
  it('advances 1 → 2 → 3 without a skip, then requires the boss fight', () => {
    const game = new Campaign(390, 550);
    for (const stageId of [1, 2]) {
      expect(game.stageId).toBe(stageId);
      for (let i = 0; i < 3; i++) { game.startWave(); clearWave(game); }
      expect(game.sim.phase).toBe('WON');
      expect(game.continue()).toBe(true);
      expect(game.continue()).toBe(false);
    }
    expect(game.stageId).toBe(3);
    expect(game.state.highestCompleted).toBe(2);
    for (let i = 0; i < 3; i++) { game.startWave(); clearWave(game); }
    expect(game.sim.phase).toBe('BOSS_INTRO');
    expect(game.state.stage).toBe(3);
    expect(game.canShop).toBe(true);
    expect(game.continue()).toBe(false);
  });

  it('uses consolidated currency only and treats transaction IDs as idempotency keys', () => {
    const db = storage(), game = new Campaign(390, 550, db);
    game.sim.provisional = 900n;
    expect(game.buy('damage', 'tx1')).toBe(false);
    game.state.balance = '9007199254740993'; game.sim.consolidated = game.balance;
    expect(game.buy('damage', 'tx1')).toBe(true);
    expect(game.buy('damage', 'tx1')).toBe(false);
    expect(game.sim.damage).toBe(2);
    expect(game.balance).toBe(9007199254740963n);
    const loaded = new Campaign(390, 550, db);
    expect(loaded.state.damageLevel).toBe(1);
    expect(loaded.balance).toBe(game.balance);
    expect(loaded.buy('damage', 'tx1')).toBe(false);
  });

  it('normalizes Retry HP before pre-Retry repair and persists the one-time cure', () => {
    const db = storage(), game = new Campaign(390, 550, db);
    game.state.balance = '100'; game.sim.consolidated = 100n;
    game.state.hp = 2; game.state.retryReference = 2; game.sim.hp = 1;
    game.startWave(); game.sim.cookies[0].y = game.sim.groundY - game.sim.cookieRadius;
    game.advance(P0.stepMs);
    expect(game.sim.phase).toBe('LOST');
    expect(game.state.hp).toBe(3); expect(game.state.retryReference).toBe(3);
    expect(game.buy('repair', 'repair-1')).toBe(true);
    expect(game.state.hp).toBe(4); expect(game.state.retryReference).toBe(4);
    expect(game.state.repairUsed).toBe(true);
    expect(game.buy('repair', 'repair-2')).toBe(false);
    expect(game.retry()).toBe(true); expect(game.sim.hp).toBe(4);
    expect(new Campaign(390, 550, db).sim.hp).toBe(4);
  });

  it('applies MaxHP once and retains upgrades after a failed attempt', () => {
    const game = new Campaign(390, 550);
    game.state.balance = '200'; game.sim.consolidated = 200n;
    expect(game.buy('maxHp', 'max-1')).toBe(true);
    expect(game.state.maxHp).toBe(6); expect(game.state.hp).toBe(6);
    expect(game.state.retryReference).toBe(6);
    expect(game.buy('fireRate', 'rate-1')).toBe(true);
    expect(game.sim.fireRate).toBe(4);
    game.startWave(); game.sim.hp = 1;
    game.sim.cookies[0].y = game.sim.groundY - game.sim.cookieRadius;
    game.advance(P0.stepMs);
    expect(game.retry()).toBe(true);
    expect(game.sim.maxHp).toBe(6); expect(game.sim.fireRate).toBe(4);
  });

  it('keeps current damage on reload but discards provisional rewards from an interrupted wave', () => {
    const db = storage(), game = new Campaign(390, 550, db);
    game.startWave(); game.sim.provisional = 50n;
    game.sim.cookies[0].y = game.sim.groundY - game.sim.cookieRadius;
    game.advance(P0.stepMs);
    const loaded = new Campaign(390, 550, db);
    expect(loaded.sim.phase).toBe('PREP');
    expect(loaded.sim.hp).toBe(4);
    expect(loaded.sim.provisional).toBe(0n);
    expect(loaded.balance).toBe(0n);
    expect(new Campaign(390, 550, db).sim.hp).toBe(4);
  });

  it('keeps repair and payment after another loss and uses the approved retry reference', () => {
    const game = new Campaign(390, 550);
    game.state.balance = '100'; game.sim.consolidated = 100n;
    game.state.hp = 2; game.state.retryReference = 2; game.sim.hp = 2;
    for (let attempt = 0; attempt < 2; attempt++) {
      game.startWave(); game.sim.hp = 1;
      game.sim.cookies[0].y = game.sim.groundY - game.sim.cookieRadius;
      game.advance(P0.stepMs);
      expect(game.state.hp).toBe(attempt === 0 ? 3 : 4);
      if (attempt === 0) {
        expect(game.buy('repair', 'r')).toBe(true);
        expect(game.state.hp).toBe(4);
      }
      game.retry();
    }
    expect(game.sim.hp).toBe(4);
    expect(game.state.balance).toBe('75');
    expect(game.state.repairUsed).toBe(true);
  });

  it('has distinct normal and future boss recovery amounts', () => {
    expect(recoveredHp(2, 5, false)).toBe(3);
    expect(recoveredHp(2, 5, true)).toBe(4);
    expect(recoveredHp(5, 5, true)).toBe(5);
  });
  it('applies rising Damage and Fire Rate costs without passing their caps', () => {
    const game = new Campaign(390, 550);
    game.state.balance = '1100'; game.sim.consolidated = 1100n;
    for (let level = 0; level < 4; level++) {
      expect(game.buy('damage', `damage-${level}`)).toBe(true);
      expect(game.sim.damage).toBe(level + 2);
    }
    expect(game.buy('damage', 'damage-extra')).toBe(false);
    for (let level = 0; level < 3; level++) {
      expect(game.buy('fireRate', `rate-${level}`)).toBe(true);
      expect(game.sim.fireRate).toBe(level + 4);
    }
    expect(game.buy('fireRate', 'rate-extra')).toBe(false);
    expect(game.balance).toBe(1100n - 30n - 80n - 180n - 360n - 30n - 100n - 250n);
  });

  it('handles unavailable storage and failed writes without touching the old save', () => {
    const broken = { getItem: (_key: string) => null, setItem: (_key: string, _value: string) => { throw Error('quota'); } };
    const game = new Campaign(390, 550, broken);
    game.state.balance = '30'; game.sim.consolidated = 30n;
    expect(game.buy('damage', 'one')).toBe(true);
    expect(game.persistenceWarning).toContain('Save failed');
    expect(game.storage).toBeNull();
  });

  it('rejects corrupted saves without reading or changing the old clicker key', () => {
    const db = storage();
    db.values.set(SAVE_KEY, '{broken'); db.values.set('cookie-chaos-save', 'old-clicker');
    const game = new Campaign(390, 550, db);
    expect(game.state.stage).toBe(1);
    expect(game.persistenceWarning).toContain('invalid');
    expect(db.values.get('cookie-chaos-save')).toBe('old-clicker');
  });
  it('isolates diagnostic seeds and previews from official saves', () => {
    const db = storage(), official = new Campaign(390, 550, db);
    const preview = new Campaign(390, 550, db, 9);
    expect(preview.setPreviewSeed(77)).toBe(true);
    expect(preview.sim.seed).not.toBe(official.sim.seed);
    expect(preview.setPreviewSeed(-1)).toBe(false);
    expect(official.setPreviewSeed(77)).toBe(false);
    expect(db.values.has(SAVE_KEY)).toBe(false);
  });
});
