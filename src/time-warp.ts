import { Economy } from './economy';

export const WARP_RULES = { durationMs: 6000, maxCharges: 3 } as const;

export function timeWarpCost(stageNumber: number): bigint {
  if (!Number.isSafeInteger(stageNumber) || stageNumber < 1) throw new RangeError('Invalid stage number');
  return 120n + 4n * BigInt(stageNumber);
}

export class TimeWarp {
  gameplayNow = 0;
  threatNow = 0;
  remainingMs = 0;
  charges = 0;

  get active() { return this.remainingMs > 0; }

  buy(economy: Economy, stageNumber: number): boolean {
    const cost = timeWarpCost(stageNumber);
    if (this.charges >= WARP_RULES.maxCharges || !economy.spend(cost)) return false;
    this.charges++;
    return true;
  }

  activate(): boolean {
    if (this.charges === 0 || this.active) return false;
    this.charges--;
    this.remainingMs = WARP_RULES.durationMs;
    return true;
  }

  endStage() { this.remainingMs = 0; }

  tick(deltaMs: number, paused = false): number {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Invalid clock delta');
    if (paused) return 0;
    const slow = Math.min(deltaMs, this.remainingMs);
    this.gameplayNow += deltaMs;
    const threatDelta = slow / 2 + deltaMs - slow;
    this.threatNow += threatDelta;
    this.remainingMs -= slow;
    return threatDelta;
  }
}
