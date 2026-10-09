export const HEALTH_RULES = { baseHp: 5, invulnerabilityMs: 750 } as const;

export type DamageResult = 'invulnerable' | 'shield' | 'hp';

export class HealthManager {
  maxHp: number = HEALTH_RULES.baseHp;
  hp: number = HEALTH_RULES.baseHp;
  shields = 0;
  invulnerableUntil = 0;
  damageEvents = 0;
  blockedEvents = 0;

  get isDead() { return this.hp === 0; }
  isInvulnerable(now: number) { return now < this.invulnerableUntil; }

  resetForStage(maxHp: number, shields: number) {
    if (!Number.isSafeInteger(maxHp) || maxHp < 1 || !Number.isSafeInteger(shields) || shields < 0) {
      throw new RangeError('Invalid health reset');
    }
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.shields = shields;
    this.invulnerableUntil = 0;
  }

  takeDamage(amount: number, now: number): DamageResult {
    if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isFinite(now) || now < 0) {
      throw new RangeError('Invalid damage event');
    }
    if (this.isDead || this.isInvulnerable(now)) return 'invulnerable';
    this.invulnerableUntil = now + HEALTH_RULES.invulnerabilityMs;
    if (this.shields > 0) {
      this.shields--;
      this.blockedEvents++;
      return 'shield';
    }
    this.hp = Math.max(0, this.hp - amount);
    this.damageEvents++;
    return 'hp';
  }

  heal(amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 1) throw new RangeError('Invalid healing');
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  increaseMaxHealth(healCurrent = true) {
    if (!Number.isSafeInteger(this.maxHp + 1)) throw new RangeError('Health exceeds safe integer');
    this.maxHp++;
    if (healCurrent) this.heal(1);
  }

  addShield(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('Invalid shield limit');
    this.shields = Math.min(limit, this.shields + 1);
  }
}
