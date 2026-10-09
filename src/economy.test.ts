import { describe, expect, it } from 'vitest';
import { Economy, formatAmount } from './economy';

describe('Economy', () => {
  it('tracks earned currency, valid hits, destruction, and spending separately', () => {
    const economy = new Economy();
    economy.recordHit(null);
    economy.recordHit(12n);
    expect(economy.spend(8n)).toBe(true);
    expect(economy.balance).toBe(4n);
    expect(economy.lifetimeEarned).toBe(12n);
    expect(economy.cookiesDestroyed).toBe(1);
    expect(economy.validHits).toBe(2);
  });

  it('refuses unaffordable purchases without negative balance', () => {
    const economy = new Economy();
    economy.recordHit(7n);
    expect(economy.spend(8n)).toBe(false);
    expect(economy.balance).toBe(7n);
    expect(() => economy.spend(0n)).toThrow(RangeError);
  });

  it('keeps currency exact beyond Number.MAX_SAFE_INTEGER', () => {
    const economy = new Economy();
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + 12_345n;
    economy.recordHit(huge);
    expect(economy.spend(huge - 1n)).toBe(true);
    expect(economy.balance).toBe(1n);
    expect(economy.lifetimeEarned).toBe(huge);
  });

  it('formats thousands through trillions and larger values without changing them', () => {
    expect(formatAmount(999n)).toBe('999');
    expect(formatAmount(1_250n)).toBe('1.2K');
    expect(formatAmount(2_500_000n)).toBe('2.5M');
    expect(formatAmount(3_000_000_000n)).toBe('3B');
    expect(formatAmount(4_100_000_000_000n)).toBe('4.1T');
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
    expect(formatAmount(huge)).toBe('9.00e+15');
    expect(huge).toBe(9_007_199_254_740_993n);
  });
});
