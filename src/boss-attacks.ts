import { bossForStage, type BossPhase } from './boss';

export const ATTACKS = {
  barbarian: { name: 'CLUB SMASH', warningMs: 1600, parryMs: 800, cooldownMs: 8000 },
  knight: { name: 'SHIELD BASH', warningMs: 1400, parryMs: 750, cooldownMs: 7000 },
  berserker: { name: 'DOUBLE STRIKE', warningMs: 1200, parryMs: 750, cooldownMs: 6000 },
  cookieng: { name: 'ROYAL DECREE', warningMs: 1500, parryMs: 800, cooldownMs: 7000 },
} as const;

export type AttackState = 'IDLE' | 'WARNING' | 'PARRY_WINDOW' | 'RESOLVED';

export class BossAttackController {
  readonly name: string;
  state: AttackState = 'IDLE';
  remainingMs = 2000;
  strike = 0;
  strikesTotal = 1;
  private active = true;
  private id: keyof typeof ATTACKS;
  private parryMs = 0;
  private cooldownMs = 0;

  constructor(stageNumber: number) {
    const boss = bossForStage(stageNumber);
    if (!boss) throw new RangeError('No boss at stage');
    this.id = boss.id;
    this.name = ATTACKS[this.id].name;
  }

  get canParry() { return this.active && this.state === 'PARRY_WINDOW'; }
  get stopped() { return !this.active; }

  attemptParry(): boolean {
    if (!this.canParry) return false;
    this.state = 'RESOLVED';
    this.remainingMs = 800; // Stun delays the next strike or attack.
    return true;
  }

  stop() { this.active = false; this.state = 'IDLE'; this.remainingMs = 0; }

  tick(deltaMs: number, phase: BossPhase): number {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Invalid attack delta');
    if (!this.active) return 0;
    let hits = 0;
    let left = deltaMs;
    while (left >= this.remainingMs) {
      left -= this.remainingMs;
      if (this.state === 'IDLE') {
        const config = this.id === 'cookieng' && phase === 'GOLDEN' ?
          { ...ATTACKS.cookieng, warningMs: 1200, parryMs: 700, cooldownMs: 4500 } : ATTACKS[this.id];
        this.strikesTotal = this.id === 'berserker' && phase === 'RAGE' ? 2 : 1;
        this.strike = 1;
        this.parryMs = config.parryMs;
        this.cooldownMs = config.cooldownMs;
        this.state = 'WARNING';
        this.remainingMs = config.warningMs;
      } else if (this.state === 'WARNING') {
        this.state = 'PARRY_WINDOW';
        this.remainingMs = this.parryMs;
      } else if (this.state === 'PARRY_WINDOW') {
        hits++;
        this.state = 'RESOLVED';
        this.remainingMs = 0;
      } else if (this.strike < this.strikesTotal) {
        this.strike++;
        this.state = 'WARNING';
        this.remainingMs = 350;
      } else {
        this.state = 'IDLE';
        this.remainingMs = this.cooldownMs;
      }
      if (left === 0 && this.remainingMs > 0) break;
    }
    this.remainingMs -= left;
    return hits;
  }
}
