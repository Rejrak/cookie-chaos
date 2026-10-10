import { Economy } from './economy';
import { COOKIE_TYPES } from './game';

export const UPGRADES = {
  value: { name: 'Cookie Value', description: 'More cookies per hit', baseCost: 14n, quadraticCost: 1n, maxLevel: null, available: true },
  size: { name: 'Cookie Size', description: 'Larger cookies', baseCost: 16n, maxLevel: 4n, available: true },
  speed: { name: 'Spawn Speed', description: 'Faster spawns', baseCost: 20n, maxLevel: 10n, available: true },
  power: { name: 'Click Power', description: 'More damage per click', baseCost: 25n, maxLevel: null, available: true },
  luck: { name: 'Golden Luck', description: 'More Golden Cookies', baseCost: 40n, chanceStepBp: 200, maxLevel: 10n, available: true },
  health: { name: 'Max Health', description: 'One more maximum HP', costs: [40n, 85n, 145n, 220n, 310n], maxLevel: 5n, available: true },
  shield: { name: 'Shield', description: 'One shield each stage', costs: [60n, 135n, 240n], maxLevel: 3n, available: true },
  lifetime: { name: 'Cookie Lifetime', description: 'More time to catch cookies', costs: [30n, 45n, 70n, 105n], maxLevel: 4n, available: true },
} as const;

export type UpgradeId = keyof typeof UPGRADES;
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export function valueCost(level: bigint): bigint {
  if (level < 0n) throw new RangeError('Level must be nonnegative');
  return (UPGRADES.value.baseCost * (level + 1n) + UPGRADES.value.quadraticCost * level * level) * (1n + level / 5n);
}

export function powerCost(level: bigint): bigint {
  if (level < 0n) throw new RangeError('Level must be nonnegative');
  return 25n + 13n * level + 2n * level * (level - 1n);
}

export class UpgradeManager {
  private levels = new Map<UpgradeId, bigint>();
  private completedCycles = 0n;

  unlockThroughStage(maxCompletedStage: number) {
    if (!Number.isSafeInteger(maxCompletedStage) || maxCompletedStage < 0 ||
      BigInt(Math.floor(maxCompletedStage / 12)) < this.completedCycles) throw new RangeError('Invalid completed stage');
    this.completedCycles = BigInt(Math.floor(maxCompletedStage / 12));
  }

  get powerLimit(): bigint { return 2n + 2n * this.completedCycles; }

  level(id: UpgradeId): bigint { return this.levels.get(id) ?? 0n; }

  cost(id: UpgradeId): bigint | null {
    const upgrade = UPGRADES[id];
    const level = this.level(id);
    if (!upgrade.available || (upgrade.maxLevel !== null && level >= upgrade.maxLevel) ||
      (id === 'power' && level >= this.powerLimit)) return null;
    if (id === 'value') return valueCost(level);
    if (id === 'power') return powerCost(level);
    if (id === 'health') return UPGRADES.health.costs[Number(level)];
    if (id === 'shield') return UPGRADES.shield.costs[Number(level)];
    if (id === 'lifetime') return UPGRADES.lifetime.costs[Number(level)];
    const denominator = 2n ** level;
    const cost = (UPGRADES[id].baseCost * 3n ** level + denominator - 1n) / denominator;
    return id === 'speed' ? cost * (1n + level / 4n) : cost;
  }

  buy(id: UpgradeId, economy: Economy): boolean {
    const cost = this.cost(id);
    if (cost === null || !economy.spend(cost)) return false;
    this.levels.set(id, this.level(id) + 1n);
    return true;
  }

  get reward(): bigint { return 1n + this.level('value'); }
  get radius(): number { return 40 + Number(this.level('size')) * 4; }
  get spawnMs(): number { return 1500 - Number(this.level('speed')) * 100; }
  get damage(): number { return 1 + Number(this.level('power')); }
  get goldenChanceBp(): number { return COOKIE_TYPES.GOLDEN.weightBp + Number(this.level('luck')) * UPGRADES.luck.chanceStepBp; }
  get maxHp(): number { return 5 + Number(this.level('health')); }
  get stageShields(): number { return Number(this.level('shield')); }
  get lifetimeBonusMs(): number { return Number(this.level('lifetime')) * 500; }
}
