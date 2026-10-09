export class Economy {
  balance = 0n;
  lifetimeEarned = 0n;
  cookiesDestroyed = 0;
  validHits = 0;

  recordHit(reward: bigint | null) {
    if (reward !== null && reward <= 0n) throw new RangeError('Reward must be positive');
    this.validHits++;
    if (reward === null) return;
    this.balance += reward;
    this.lifetimeEarned += reward;
    this.cookiesDestroyed++;
  }

  spend(cost: bigint): boolean {
    if (cost <= 0n) throw new RangeError('Cost must be positive');
    if (this.balance < cost) return false;
    this.balance -= cost;
    return true;
  }
}

export function formatAmount(value: bigint): string {
  if (value < 1000n) return value.toString();
  const units = ['K', 'M', 'B', 'T'];
  let divisor = 1000n;
  for (const unit of units) {
    if (value < divisor * 1000n) {
      const whole = value / divisor;
      const tenth = value % divisor * 10n / divisor;
      return `${whole}${whole < 100n && tenth ? `.${tenth}` : ''}${unit}`;
    }
    divisor *= 1000n;
  }
  const digits = value.toString();
  return `${digits[0]}.${digits.slice(1, 3)}e+${digits.length - 1}`;
}
