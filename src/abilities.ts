import { Economy } from './economy';
import type { Cookie } from './game';
import { cycleForStage } from './cycle';

export const ABILITIES = {
  RAIN: { name: 'Cookie Rain', durationMs: 12_000, baseCost: 110n, stageCost: 4n },
  AUTO: { name: 'Auto-clicker', durationMs: 9_000, baseCost: 180n, stageCost: 6n },
} as const;
export type AbilityId = keyof typeof ABILITIES;
export const ABILITY_IDS = Object.keys(ABILITIES) as AbilityId[];
export const ABILITY_RULES = { maxCharges: 3, cooldownMs: 1000, autoHitMs: 600, rainIntervalFactor: 2 } as const;

export function abilityCost(id: AbilityId, stageNumber: number): bigint {
  if (!Number.isSafeInteger(stageNumber) || stageNumber < 1) throw new RangeError('Invalid stage number');
  return ABILITIES[id].baseCost + ABILITIES[id].stageCost * BigInt(stageNumber);
}

export function freeAbilityForBossStage(stageNumber: number): AbilityId | undefined {
  const stage = cycleForStage(stageNumber).stageInCycle;
  return stage === 3 ? 'RAIN' : stage === 6 ? 'AUTO' : undefined;
}

export function autoTarget(cookies: Iterable<Cookie>, now = -Infinity): Cookie | undefined {
  return [...cookies].filter(cookie => cookie.type !== 'BOMB' && cookie.hp > 0 && cookie.expiresAt > now)
    .sort((a, b) => Number(b.tough) - Number(a.tough) || a.expiresAt - b.expiresAt || a.id - b.id)[0];
}

export class AbilityManager {
  private owned = { RAIN: 0, AUTO: 0 };
  private remaining = { RAIN: 0, AUTO: 0 };
  private cooldown = { RAIN: 0, AUTO: 0 };
  private elapsed = { RAIN: 0, AUTO: 0 };
  private granted = new Set<string>();
  readonly stats = { bought: 0, granted: 0, activated: 0, rainOpportunities: 0, autoOpportunities: 0 };

  charges(id: AbilityId) { return this.owned[id]; }
  remainingMs(id: AbilityId) { return this.remaining[id]; }
  cooldownMs(id: AbilityId) { return this.cooldown[id]; }
  active(id: AbilityId) { return this.remaining[id] > 0; }

  buy(id: AbilityId, economy: Economy, stageNumber: number): boolean {
    const cost = abilityCost(id, stageNumber);
    if (this.owned[id] >= ABILITY_RULES.maxCharges || !economy.spend(cost)) return false;
    this.owned[id]++;
    this.stats.bought++;
    return true;
  }

  grant(id: AbilityId, eventKey: string): boolean {
    if (!eventKey || this.granted.has(eventKey)) return false;
    this.granted.add(eventKey);
    if (this.owned[id] >= ABILITY_RULES.maxCharges) return false;
    this.owned[id]++;
    this.stats.granted++;
    return true;
  }

  activate(id: AbilityId, running: boolean): boolean {
    if (!running || this.owned[id] === 0 || this.active(id) || this.cooldown[id] > 0) return false;
    this.owned[id]--;
    this.remaining[id] = ABILITIES[id].durationMs;
    this.elapsed[id] = 0;
    this.stats.activated++;
    return true;
  }

  endStage() {
    for (const id of ABILITY_IDS) {
      this.remaining[id] = 0;
      this.elapsed[id] = 0;
      this.cooldown[id] = 0;
    }
  }

  tick(deltaMs: number, spawnMs: number, paused = false): { rain: number; auto: number } {
    if (!Number.isFinite(deltaMs) || deltaMs < 0 || !Number.isFinite(spawnMs) || spawnMs <= 0) {
      throw new RangeError('Invalid ability clock');
    }
    if (paused) return { rain: 0, auto: 0 };
    const pulses = { rain: 0, auto: 0 };
    for (const id of ABILITY_IDS) {
      const activeTime = Math.min(deltaMs, this.remaining[id]);
      this.remaining[id] -= activeTime;
      this.cooldown[id] = Math.max(0, this.cooldown[id] - deltaMs);
      if (!activeTime) continue;
      const interval = id === 'RAIN' ? spawnMs * ABILITY_RULES.rainIntervalFactor : ABILITY_RULES.autoHitMs;
      this.elapsed[id] += activeTime;
      const count = Math.floor(this.elapsed[id] / interval);
      this.elapsed[id] -= count * interval;
      if (id === 'RAIN') { pulses.rain = count; this.stats.rainOpportunities += count; }
      else { pulses.auto = count; this.stats.autoOpportunities += count; }
      if (!this.remaining[id]) {
        this.elapsed[id] = 0;
        this.cooldown[id] = Math.max(0, ABILITY_RULES.cooldownMs - (deltaMs - activeTime));
      }
    }
    return pulses;
  }
}
