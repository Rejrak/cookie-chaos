import { bossForStage } from './boss';
import { cycleForStage } from './cycle';

const TARGETS = [12n, 18n, 23n, 29n, 35n, 42n, 48n, 55n, 63n, 72n, 82n, 90n] as const;
const DURATIONS_MS = [30_000, 40_000, 50_000, 55_000, 60_000, 65_000, 70_000, 75_000, 80_000, 85_000, 90_000, 90_000] as const;

export type StageStatus = 'RUNNING' | 'BOSS_FIGHT' | 'COMPLETED' | 'FAILED';

export function stageConfig(stageNumber: number) {
  if (!Number.isSafeInteger(stageNumber) || stageNumber < 1) throw new RangeError('Invalid stage number');
  const { cycleIndex, stageInCycle } = cycleForStage(stageNumber);
  const index = stageInCycle - 1;
  return {
    target: TARGETS[index] + BigInt(Math.min(3 * cycleIndex, 30)),
    durationMs: cycleIndex === 0 ? DURATIONS_MS[index] : 90_000,
    isBossCheckpoint: stageNumber % 3 === 0,
    toughRequired: stageInCycle <= 3 ? 0 : stageInCycle <= 6 ? 1 : stageInCycle <= 9 ? 2 : 3,
  };
}

export class StageManager {
  stageNumber = 1;
  target = 0n;
  progress = 0n;
  pointsEarned = 0n;
  currencyEarned = 0n;
  toughRequired = 0;
  toughDestroyed = 0;
  durationMs = 0;
  remainingMs = 0;
  status: StageStatus = 'RUNNING';
  maxCompletedStage = 0;

  constructor(private readonly config: typeof stageConfig = stageConfig) { this.start(1); }

  get isBossCheckpoint() { return this.stageNumber % 3 === 0; }
  get cycle() { return cycleForStage(this.stageNumber); }
  get progressPercent() { return Number(this.progress * 100n / this.target); }

  private start(stageNumber: number) {
    const config = this.config(stageNumber);
    bossForStage(stageNumber); // Reject unsafe scaled boss HP before entering the stage.
    if (config.target <= 0n || !Number.isSafeInteger(config.durationMs) || config.durationMs <= 0) {
      throw new RangeError('Invalid stage config');
    }
    this.stageNumber = stageNumber;
    this.target = config.target;
    if (!Number.isSafeInteger(config.toughRequired) || config.toughRequired < 0) throw new RangeError('Invalid Tough requirement');
    this.toughRequired = config.toughRequired;
    this.durationMs = config.durationMs;
    this.remainingMs = config.durationMs;
    this.progress = 0n;
    this.pointsEarned = 0n;
    this.currencyEarned = 0n;
    this.toughDestroyed = 0;
    this.status = 'RUNNING';
  }

  tick(deltaMs: number, paused = false): StageStatus {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Invalid stage delta');
    if ((this.status !== 'RUNNING' && this.status !== 'BOSS_FIGHT') || paused) return this.status;
    this.remainingMs = Math.max(0, this.remainingMs - deltaMs);
    if (this.remainingMs === 0) this.status = 'FAILED';
    return this.status;
  }

  recordCollection(stagePoints: bigint, currencyReward: bigint, tough = false): boolean {
    if (stagePoints <= 0n || currencyReward <= 0n) throw new RangeError('Collection rewards must be positive');
    if (this.status !== 'RUNNING') return false;
    this.pointsEarned += stagePoints;
    this.currencyEarned += currencyReward;
    if (tough) this.toughDestroyed++;
    this.progress = this.pointsEarned < this.target ? this.pointsEarned : this.target;
    if (this.progress === this.target && this.toughDestroyed >= this.toughRequired) {
      const boss = bossForStage(this.stageNumber);
      if (boss) {
        this.status = 'BOSS_FIGHT';
        this.durationMs = boss.durationMs;
        this.remainingMs = boss.durationMs;
      } else {
        this.status = 'COMPLETED';
        this.maxCompletedStage = Math.max(this.maxCompletedStage, this.stageNumber);
      }
    }
    return true;
  }

  completeBoss(): boolean {
    if (this.status !== 'BOSS_FIGHT') return false;
    this.status = 'COMPLETED';
    this.maxCompletedStage = Math.max(this.maxCompletedStage, this.stageNumber);
    return true;
  }

  retry(): boolean {
    if (this.status !== 'FAILED') return false;
    this.start(this.stageNumber);
    return true;
  }

  continue(): boolean {
    if (this.status !== 'COMPLETED') return false;
    this.start(this.stageNumber + 1);
    return true;
  }
}
