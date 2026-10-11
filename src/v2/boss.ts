import { seededRandom, type CookieKind } from '../p0/config';

export type BossId = 'barbarian' | 'knight' | 'berserker' | 'cookieng';
export type BossThreat = { id: number; kind: CookieKind; x: number; y: number; vx: number; vy: number; hp: number; radius: number; damage: number; reward: bigint; signal: boolean };
export type BossConfig = { id: BossId; name: string; hp: number; guard: number; timerMs: number; intervalMs: number; warningMs: number; rewardBudget: bigint; victoryReward: bigint };
export const BOSSES: Record<BossId, BossConfig> = {
  barbarian: { id: 'barbarian', name: 'Cookie Barbarian', hp: 16, guard: 0, timerMs: 48_000, intervalMs: 5_000, warningMs: 1_200, rewardBudget: 30n, victoryReward: 35n },
  knight: { id: 'knight', name: 'Cookie Knight', hp: 20, guard: 8, timerMs: 58_000, intervalMs: 4_800, warningMs: 1_200, rewardBudget: 45n, victoryReward: 55n },
  berserker: { id: 'berserker', name: 'Cookie Berserker', hp: 26, guard: 0, timerMs: 62_000, intervalMs: 4_500, warningMs: 1_000, rewardBudget: 55n, victoryReward: 75n },
  cookieng: { id: 'cookieng', name: 'The Cookieng', hp: 32, guard: 10, timerMs: 78_000, intervalMs: 4_800, warningMs: 1_300, rewardBudget: 75n, victoryReward: 120n },
};

// Boss logic uses only the fixed simulation clock; Phaser draws this state without owning it.
export class BossEncounter {
  readonly config: BossConfig;
  readonly threats: BossThreat[] = [];
  hp: number;
  guard: number;
  timeMs = 0;
  warningMs = 0;
  nextAttackMs = 2_500;
  vulnerabilityMs = 0;
  attacks = 0;
  intercepted = 0;
  landed = 0;
  damageDealt = 0;
  blocked = 0;
  windows = 0;
  rewardPaid = 0n;
  phaseTimeMs = 0;
  cleanupMs = 0;
  readonly phaseDurations: { phase: string; ms: number }[] = [];
  private readonly random: () => number;
  private serial = 0;
  private pattern = 0;
  private phaseName = '';

  constructor(id: BossId, seed: number) {
    this.config = BOSSES[id];
    this.hp = this.config.hp;
    this.guard = this.config.guard;
    this.random = seededRandom(seed);
    this.phaseName = this.phase;
  }

  get phase() {
    if (this.hp <= 0) return 'DEFEATED';
    if (this.config.id === 'berserker') return this.hp <= this.config.hp / 2 ? 'RAGE' : 'FIGHT';
    if (this.config.id === 'cookieng') return this.guard ? 'ROYAL CROWN' : 'GOLDEN FORM';
    if (this.config.id === 'knight') return this.vulnerabilityMs > 0 ? 'SHIELD OPEN' : this.guard ? 'SHIELDED' : 'EXPOSED';
    return this.vulnerabilityMs > 0 ? 'COUNTER WINDOW' : 'FIGHT';
  }
  get remainingMs() { return Math.max(0, this.config.timerMs - this.timeMs); }
  get warning() { return this.warningMs > 0; }
  get target() {
    const radius = Math.max(20, Math.min(55, this.width * 0.105, this.height * 0.13));
    const amplitude = this.width * (this.config.id === 'knight' ? 0.1 : this.config.id === 'berserker' ? 0.2 : 0.15);
    const speed = this.config.id === 'berserker' ? 0.0014 : 0.0008;
    return { x: this.width / 2 + Math.sin(this.timeMs * speed) * amplitude,
      y: Math.max(radius + 8, this.height * 0.19), radius };
  }
  width = 400;
  height = 500;
  resize(width: number, height: number) {
    const sx = width / this.width, sy = height / this.height;
    this.width = width; this.height = height;
    for (const threat of this.threats) { threat.x *= sx; threat.y *= sy; threat.vx *= sx; threat.vy *= sy; threat.radius *= Math.min(sx, sy); }
  }
  private recordPhase(ms: number) {
    this.phaseTimeMs += ms;
    if (this.phase !== this.phaseName) {
      this.phaseDurations.push({ phase: this.phaseName, ms: this.phaseTimeMs });
      this.phaseName = this.phase; this.phaseTimeMs = 0;
    }
  }
  takeHit(damage: number): { dealt: number; blocked: number; defeated: boolean } {
    if (!Number.isSafeInteger(damage) || damage < 1 || this.hp <= 0) return { dealt: 0, blocked: 0, defeated: this.hp <= 0 };
    const previousPhase = this.phase;
    let dealt = 0, blocked = 0;
    if (this.guard && this.vulnerabilityMs <= 0) {
      blocked = Math.min(this.guard, damage); this.guard -= blocked; this.blocked += blocked;
    } else {
      dealt = Math.min(this.hp, damage * (this.vulnerabilityMs > 0 ? 2 : 1));
      this.hp -= dealt; this.damageDealt += dealt;
    }
    if (this.hp > 0 && this.phase !== previousPhase && (this.phase === 'RAGE' || this.phase === 'GOLDEN FORM') && !this.warningMs)
      this.nextAttackMs = Math.min(this.nextAttackMs, this.timeMs + 300);
    this.recordPhase(0);
    return { dealt, blocked, defeated: this.hp <= 0 };
  }
  intercept(threat: BossThreat): bigint {
    const index = this.threats.indexOf(threat);
    if (index < 0) return 0n;
    this.threats.splice(index, 1); this.intercepted++;
    if (threat.signal && this.hp > 0) { this.vulnerabilityMs = this.config.id === 'knight' ? 3_200 : 2_000; this.windows++; }
    const paid = this.config.rewardBudget - this.rewardPaid;
    const reward = paid > 0n ? (threat.reward < paid ? threat.reward : paid) : 0n;
    this.rewardPaid += reward;
    this.recordPhase(0);
    return reward;
  }
  private spawn(kind: CookieKind, x: number, radius: number, signal: boolean, speed: number) {
    if (this.threats.length >= 7) return;
    const reward = kind === 'HARD' ? 6n : 1n;
    this.threats.push({ id: ++this.serial, kind, x, y: this.target.y + this.target.radius + radius + 7,
      vx: (this.random() - 0.5) * 22, vy: speed, hp: kind === 'HARD' ? 3 : 1,
      radius, damage: kind === 'HARD' ? 2 : 1, reward, signal });
  }
  private attack() {
    const { x } = this.target, r = Math.max(11, Math.min(24, this.width * 0.055));
    const travel = Math.max(20, this.height - 35 - (this.target.y + this.target.radius + r * 2 + 7));
    const speed = Math.min(this.height * 0.18, Math.max(12, travel / 2.4));
    const id = this.config.id, pattern = this.pattern++;
    if (id === 'barbarian') {
      if (pattern % 2 === 0) this.spawn('HARD', x + (this.random() - 0.5) * this.width * 0.4, r * 1.3, true, speed * 0.8);
      else for (const offset of [-0.22, 0, 0.22]) this.spawn('NORMAL', x + this.width * offset, r, false, speed * 1.15);
    } else if (id === 'knight') {
      this.spawn('HARD', x + (pattern % 2 ? -1 : 1) * this.width * 0.2, r, true, speed);
      if (pattern % 2) this.spawn('NORMAL', x + this.width * 0.1, r, false, speed * 1.1);
    } else if (id === 'berserker') {
      const offsets = this.phase === 'RAGE' ? [-0.25, 0, 0.25] : [-0.17, 0.17];
      for (const offset of offsets) this.spawn('NORMAL', x + this.width * offset, r * 0.85, false, speed * (this.phase === 'RAGE' ? 1.4 : 1.15));
      this.vulnerabilityMs = this.phase === 'RAGE' ? 1_000 : 1_600; this.windows++;
    } else if (this.phase === 'ROYAL CROWN') {
      this.spawn('HARD', x - this.width * 0.18, r, true, speed);
      this.spawn('NORMAL', x + this.width * 0.18, r, false, speed * 1.2);
    } else {
      if (pattern % 2 === 0) this.spawn('HARD', x, r * 1.15, true, speed * 1.1);
      for (const offset of [-0.21, 0.21]) this.spawn('NORMAL', x + this.width * offset, r * 0.85, false, speed * 1.35);
      this.vulnerabilityMs = 1_200; this.windows++;
    }
    this.attacks++;
  }
  tick(ms: number, groundY: number): { damage: number; timeout: boolean } {
    if (this.hp <= 0) { this.cleanupMs += ms; return this.moveThreats(ms, groundY); }
    this.timeMs += ms;
    if (this.timeMs >= this.config.timerMs) return { damage: 0, timeout: true };
    this.vulnerabilityMs = Math.max(0, this.vulnerabilityMs - ms);
    if (this.warningMs > 0) {
      this.warningMs -= ms;
      if (this.warningMs <= 0) { this.warningMs = 0; this.attack(); this.nextAttackMs = this.timeMs + (this.phase === 'RAGE' || this.phase === 'GOLDEN FORM' ? this.config.intervalMs * 0.72 : this.config.intervalMs); }
    } else if (this.timeMs >= this.nextAttackMs) this.warningMs = this.phase === 'RAGE' || this.phase === 'GOLDEN FORM' ? this.config.warningMs * 0.85 : this.config.warningMs;
    this.recordPhase(ms);
    return this.moveThreats(ms, groundY);
  }
  private moveThreats(ms: number, groundY: number) {
    const dt = ms / 1000;
    let damage = 0;
    for (let i = this.threats.length - 1; i >= 0; i--) {
      const threat = this.threats[i];
      threat.vy = Math.min(this.height * 0.42, threat.vy + this.height * 0.065 * dt);
      threat.x += threat.vx * dt; threat.y += threat.vy * dt;
      if (threat.x < threat.radius || threat.x > this.width - threat.radius) {
        threat.x = Math.min(this.width - threat.radius, Math.max(threat.radius, threat.x)); threat.vx *= -0.65;
      }
      if (threat.y + threat.radius >= groundY) { damage += threat.damage; this.landed++; this.threats.splice(i, 1); }
    }
    return { damage, timeout: false };
  }
  metrics() { return { id: this.config.id, phase: this.phase, hp: this.hp, guard: this.guard, timeMs: this.timeMs,
    cleanupMs: this.cleanupMs, attacks: this.attacks, intercepted: this.intercepted, landed: this.landed,
    damageDealt: this.damageDealt, blocked: this.blocked, windows: this.windows, rewardPaid: this.rewardPaid.toString(),
    rewardBudgetLeft: (this.config.rewardBudget - this.rewardPaid).toString(), phaseDurations: this.phaseDurations }; }
}
