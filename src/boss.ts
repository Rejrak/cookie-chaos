import { cycleForStage, cycleLabel } from './cycle';

export const BOSSES = {
  3: { id: 'barbarian', stage: 3, name: 'Cookie Barbarian', protection: 'Armor', protectionHp: 8, bodyHp: 14,
    protectionGrowth: 3, bodyGrowth: 8, durationMs: 25_000, multiplier: 20n, texture: 'boss-barbarian' },
  6: { id: 'knight', stage: 6, name: 'Cookie Knight', protection: 'Shield', protectionHp: 12, bodyHp: 22,
    protectionGrowth: 4, bodyGrowth: 12, durationMs: 32_000, multiplier: 35n, texture: 'boss-knight' },
  9: { id: 'berserker', stage: 9, name: 'Cookie Berserker', protection: null, protectionHp: 0, bodyHp: 34,
    protectionGrowth: 0, bodyGrowth: 16, durationMs: 38_000, multiplier: 60n, texture: 'boss-berserker' },
  12: { id: 'cookieng', stage: 12, name: 'The Cookieng', protection: 'Crown', protectionHp: 20, bodyHp: 48,
    protectionGrowth: 5, bodyGrowth: 20, durationMs: 50_000, multiplier: 100n, texture: 'boss-cookieng' },
} as const;

export const BOSS_RULES = { vulnerabilityMs: 3000, comboWindowMs: 1300, comboHits: 3, comboBonus: 1 } as const;
export type BossDefinition = Omit<typeof BOSSES[keyof typeof BOSSES], 'stage' | 'name' | 'protectionHp' | 'bodyHp' | 'multiplier'> & {
  stage: number; name: string; protectionHp: number; bodyHp: number; multiplier: bigint;
};
export type BossPhase = 'ARMOR' | 'VULNERABLE' | 'BODY' | 'SHIELD' | 'NORMAL' | 'RAGE' | 'CROWN' | 'GOLDEN';

export function bossForStage(stageNumber: number): BossDefinition | undefined {
  const { cycleIndex, cycleNumber, stageInCycle } = cycleForStage(stageNumber);
  const base = BOSSES[stageInCycle as keyof typeof BOSSES];
  if (!base) return;
  const bodyHp = base.bodyHp + base.bodyGrowth * cycleIndex;
  const protectionHp = base.protectionHp + base.protectionGrowth * cycleIndex;
  if (!Number.isSafeInteger(bodyHp) || !Number.isSafeInteger(protectionHp)) throw new RangeError('Boss HP exceeds safe integer');
  return { ...base, stage: stageNumber, name: cycleNumber === 1 ? base.name : `${base.name} ${cycleLabel(cycleNumber)}`,
    bodyHp, protectionHp, multiplier: base.multiplier * BigInt(cycleNumber) };
}

export class BossManager {
  readonly config: BossDefinition;
  hp: number;
  protectionHp: number;
  phase: BossPhase;
  defeated = false;
  comboCount = 0;
  private vulnerableUntil = 0;
  private lastRageHitAt: number | null = null;

  constructor(stageNumber: number) {
    const config = bossForStage(stageNumber);
    if (!config) throw new RangeError('No boss for stage');
    this.config = config;
    this.hp = config.bodyHp;
    this.protectionHp = config.protectionHp;
    this.phase = config.id === 'barbarian' ? 'ARMOR' : config.id === 'knight' ? 'SHIELD' :
      config.id === 'cookieng' ? 'CROWN' : 'NORMAL';
  }

  tick(now: number): boolean {
    if (!Number.isFinite(now) || now < 0) throw new RangeError('Invalid boss time');
    if (this.defeated) return false;
    if (this.phase === 'VULNERABLE' && now >= this.vulnerableUntil) {
      this.phase = 'BODY';
      return true;
    }
    if (this.phase === 'RAGE' && this.comboCount && this.lastRageHitAt !== null &&
      now - this.lastRageHitAt > BOSS_RULES.comboWindowMs) {
      this.comboCount = 0;
      return true;
    }
    return false;
  }

  hit(baseDamage: number, now: number, baseReward: bigint) {
    if (!Number.isSafeInteger(baseDamage) || baseDamage <= 0) throw new RangeError('Invalid boss damage');
    if (!Number.isFinite(now) || now < 0) throw new RangeError('Invalid boss time');
    if (baseReward <= 0n) throw new RangeError('Reward must be positive');
    if (this.lastRageHitAt !== null && now < this.lastRageHitAt) throw new RangeError('Boss time moved backward');
    if (this.defeated) return;
    let phaseChanged = this.tick(now);
    let comboBonus = 0;
    let damageDealt: number;

    if (this.protectionHp > 0) {
      // Protection consumes the whole hit; excess never carries into body HP.
      damageDealt = Math.min(this.protectionHp, baseDamage);
      this.protectionHp -= damageDealt;
      if (this.protectionHp === 0) {
        this.phase = this.config.id === 'barbarian' ? 'VULNERABLE' : this.config.id === 'cookieng' ? 'GOLDEN' : 'BODY';
        if (this.phase === 'VULNERABLE') this.vulnerableUntil = now + BOSS_RULES.vulnerabilityMs;
        phaseChanged = true;
      }
    } else {
      if (this.phase === 'RAGE') {
        this.comboCount = this.lastRageHitAt !== null && now - this.lastRageHitAt <= BOSS_RULES.comboWindowMs
          ? this.comboCount + 1 : 1;
        this.lastRageHitAt = now;
        if (this.comboCount === BOSS_RULES.comboHits) { comboBonus = BOSS_RULES.comboBonus; this.comboCount = 0; }
      }
      const damage = baseDamage * (this.phase === 'VULNERABLE' ? 2 : 1) + comboBonus;
      damageDealt = Math.min(this.hp, damage);
      this.hp -= damageDealt;
      if (this.config.id === 'berserker' && this.phase === 'NORMAL' && this.hp <= this.config.bodyHp / 2 && this.hp > 0) {
        this.phase = 'RAGE';
        phaseChanged = true;
      }
    }

    this.defeated = this.hp === 0;
    return { damageDealt, hp: this.hp, protectionHp: this.protectionHp, phase: this.phase, phaseChanged,
      rageActivated: phaseChanged && this.phase === 'RAGE', comboBonus, defeated: this.defeated,
      reward: this.defeated ? baseReward * this.config.multiplier : null };
  }
}
