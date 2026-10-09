import { Economy } from './economy';
import { COOKIE_TYPES } from './game';

export const UPGRADES = {
  value: { name: 'Cookie Value', description: 'More cookies per hit', baseCost: 14n, quadraticCost: 1n, maxLevel: null, available: true },
  size: { name: 'Cookie Size', description: 'Larger cookies', baseCost: 16n, maxLevel: 4n, available: true },
  speed: { name: 'Spawn Speed', description: 'Faster spawns', baseCost: 20n, maxLevel: 10n, available: true },
  power: { name: 'Click Power', description: 'More damage per click', baseCost: 25n, maxLevel: 2n, available: true },
  luck: { name: 'Golden Luck', description: 'More Golden Cookies', baseCost: 40n, chanceStepBp: 200, maxLevel: 10n, available: true },
} as const;

export type UpgradeId = keyof typeof UPGRADES;
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export function valueCost(level: bigint): bigint {
  if (level < 0n) throw new RangeError('Level must be nonnegative');
  return UPGRADES.value.baseCost * (level + 1n) + UPGRADES.value.quadraticCost * level * level;
}

export class UpgradeManager {
  private levels = new Map<UpgradeId, bigint>();

  level(id: UpgradeId): bigint { return this.levels.get(id) ?? 0n; }

  cost(id: UpgradeId): bigint | null {
    const upgrade = UPGRADES[id];
    const level = this.level(id);
    if (!upgrade.available || (upgrade.maxLevel !== null && level >= upgrade.maxLevel)) return null;
    if (id === 'value') return valueCost(level);
    const denominator = 2n ** level;
    return (upgrade.baseCost * 3n ** level + denominator - 1n) / denominator;
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
}
