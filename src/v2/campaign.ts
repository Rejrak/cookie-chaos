import { P0Simulation } from '../p0/sim';
import { CAMPAIGN_FALL_SECONDS, KINGDOM_ONE } from './stages';

export const SAVE_KEY = 'cookie-chaos-v2-campaign-v1';
export type UpgradeKind = 'damage' | 'fireRate' | 'maxHp' | 'repair';
export const SHOP = {
  damage: { costs: [20n, 35n, 55n, 80n], effect: '+1 projectile damage' },
  fireRate: { costs: [20n, 40n, 65n], effect: '+1 shot per second' },
  maxHp: { costs: [35n, 55n, 80n, 110n, 145n], effect: '+1 maximum and current HP' },
  repair: { cost: 25n, percent: 50 },
} as const;
type Save = {
  version: 2; stage: number; highestCompleted: number; kingdomCompleted: boolean; balance: string;
  hp: number; maxHp: number; retryReference: number; repairUsed: boolean;
  damageLevel: number; fireRateLevel: number; maxHpLevel: number;
  seed: number; control: 'DIRECT' | 'OFFSET'; transactions: string[]; retries: number;
};
type SaveV1 = Omit<Save, 'version' | 'kingdomCompleted'> & { version: 1 };
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const initial = (): Save => ({ version: 2, stage: 1, highestCompleted: 0, kingdomCompleted: false, balance: '0',
  hp: 5, maxHp: 5, retryReference: 5, repairUsed: false, damageLevel: 0, fireRateLevel: 0,
  maxHpLevel: 0, seed: 1207, control: 'DIRECT', transactions: [], retries: 0 });
export const recoveredHp = (hp: number, maxHp: number, boss: boolean) => Math.min(maxHp, hp + (boss ? 2 : 1));

function validSave(value: unknown): value is Save | SaveV1 {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<Omit<Save, 'version'>> & { version?: 1 | 2 };
  const integer = (n: unknown, min: number, max: number) => Number.isSafeInteger(n) && (n as number) >= min && (n as number) <= max;
  const legacy = s.version === 1;
  const finished = s.version === 2 && s.kingdomCompleted === true;
  return (legacy || s.version === 2) && integer(s.stage, 1, 12) && integer(s.highestCompleted, 0, finished ? 12 : 11) &&
    (finished ? s.stage === 12 && s.highestCompleted === 12 : (s.stage as number) === (s.highestCompleted as number) + 1 && (legacy || s.kingdomCompleted === false)) &&
    typeof s.balance === 'string' && /^(0|[1-9]\d*)$/.test(s.balance) &&
    integer(s.maxHp, 5, 10) && integer(s.maxHpLevel, 0, 5) && s.maxHp === 5 + (s.maxHpLevel as number) &&
    integer(s.hp, 1, s.maxHp as number) && integer(s.retryReference, 1, s.maxHp as number) &&
    typeof s.repairUsed === 'boolean' && integer(s.damageLevel, 0, SHOP.damage.costs.length) &&
    integer(s.fireRateLevel, 0, SHOP.fireRate.costs.length) && integer(s.seed, 0, 0xffffffff) &&
    (s.control === 'DIRECT' || s.control === 'OFFSET') && integer(s.retries, 0, Number.MAX_SAFE_INTEGER) &&
    Array.isArray(s.transactions) && s.transactions.length <= 1000 &&
    s.transactions.every(id => typeof id === 'string' && id.length > 0 && id.length < 100);
}

export class Campaign {
  readonly preview: boolean;
  storage: StoragePort | null;
  state: Save;
  sim: P0Simulation;
  stageId: number;
  persistenceWarning = '';

  constructor(width: number, height: number, storage: StoragePort | null = null, previewStage = 0) {
    this.preview = previewStage > 0;
    this.storage = this.preview ? null : storage;
    this.state = initial();
    if (this.storage) {
      try {
        const raw = this.storage.getItem(SAVE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (!validSave(parsed)) throw new Error('invalid save data');
          this.state = parsed.version === 1 ? { ...parsed, version: 2, kingdomCompleted: false } : parsed;
        }
      } catch { this.persistenceWarning = 'Save unavailable or invalid; progress is in memory only.'; this.storage = null; }
    } else if (!this.preview) this.persistenceWarning = 'Local storage unavailable; progress is in memory only.';
    if (this.preview) {
      if (!Number.isInteger(previewStage) || previewStage < 1 || previewStage > 12) throw new RangeError('Invalid preview stage');
      this.state.stage = previewStage;
    }
    this.stageId = this.state.stage;
    this.sim = this.createSim(width, height);
    if (this.state.kingdomCompleted) this.sim.phase = 'WON';
  }

  get stage() { return KINGDOM_ONE[this.stageId - 1]; }
  get balance() { return BigInt(this.state.balance); }
  get canShop() { return !this.state.kingdomCompleted && (this.sim.phase === 'PREP' || this.sim.phase === 'LOST' || this.sim.phase === 'BOSS_INTRO'); }
  get nextStage() { return this.state.stage; }

  private createSim(width: number, height: number) {
    const stage = KINGDOM_ONE[this.stageId - 1];
    const sim = new P0Simulation(width, height, stage.arena, (this.state.seed + stage.id * 2654435761) >>> 0,
      BigInt(this.state.balance), { rules: { ...stage, bossCheckpoint: !!stage.boss,
        bossId: stage.boss ? ({ 3: 'barbarian', 6: 'knight', 9: 'berserker', 12: 'cookieng' } as const)[stage.id as 3 | 6 | 9 | 12] : undefined,
        fallSeconds: CAMPAIGN_FALL_SECONDS }, maxHp: this.state.maxHp, hp: this.state.hp });
    sim.damageLevel = this.state.damageLevel; sim.fireRateLevel = this.state.fireRateLevel;
    return sim;
  }
  private save() {
    if (!this.storage) return;
    try { this.storage.setItem(SAVE_KEY, JSON.stringify(this.state)); }
    catch { this.persistenceWarning = 'Save failed; progress is in memory only.'; this.storage = null; }
  }
  setControl(mode: 'DIRECT' | 'OFFSET') { this.state.control = mode; this.save(); }
  startWave() { return this.sim.startWave(); }
  startBoss() { return this.sim.startBoss(); }
  resize(width: number, height: number) { this.sim.resize(width, height); }
  advance(deltaMs: number) {
    const previous = this.sim.phase, previousHp = this.sim.hp;
    this.sim.advance(deltaMs);
    if (this.sim.hp !== previousHp && (this.sim.phase === 'RUNNING' || this.sim.phase === 'BOSS_FIGHT' || this.sim.phase === 'BOSS_CLEANUP')) {
      this.state.hp = this.sim.hp; this.save();
    }
    if (previous !== 'LOST' && this.sim.phase === 'LOST') {
      // Normalize once before the pre-Retry shop, as explicitly approved.
      this.state.hp = Math.min(this.state.maxHp, Math.max(this.state.retryReference, Math.ceil(this.state.maxHp / 2)));
      this.state.retryReference = this.state.hp;
      this.save();
    }
    if (previous !== 'WON' && this.sim.phase === 'WON') {
      const awardId = `stage-${this.stageId}-victory`;
      if (!this.state.transactions.includes(awardId)) {
        this.state.transactions.push(awardId);
        this.state.balance = this.sim.consolidated.toString();
        this.state.highestCompleted = this.stageId;
        this.state.stage = Math.min(12, this.stageId + 1);
        this.state.kingdomCompleted = this.stageId === 12;
        this.state.hp = recoveredHp(this.sim.hp, this.state.maxHp, !!this.stage.boss);
        this.state.retryReference = this.state.hp;
        this.state.repairUsed = false;
        this.save();
      }
    }
    if (previous === 'RUNNING' && this.sim.phase === 'BOSS_INTRO') {
      this.state.hp = this.sim.hp; this.save();
    }
  }
  price(kind: UpgradeKind): bigint | null {
    if (kind === 'repair') return !this.state.repairUsed && this.state.hp < this.state.maxHp ? SHOP.repair.cost : null;
    return SHOP[kind].costs[this.state[`${kind}Level`]] ?? null;
  }
  buy(kind: UpgradeKind, transactionId: string): boolean {
    if (!this.canShop || !transactionId || transactionId.length >= 100 || this.state.transactions.includes(transactionId)) return false;
    const cost = this.price(kind);
    if (cost === null || this.balance < cost) return false;
    const next = { ...this.state, balance: (this.balance - cost).toString(), transactions: [...this.state.transactions, transactionId] };
    if (kind === 'damage') next.damageLevel++;
    else if (kind === 'fireRate') next.fireRateLevel++;
    else if (kind === 'maxHp') {
      next.maxHpLevel++; next.maxHp++; next.hp++; next.retryReference++;
    } else {
      const missing = next.maxHp - next.hp;
      const heal = Math.min(missing, Math.max(1, Math.ceil(missing * SHOP.repair.percent / 100)));
      next.hp += heal; next.retryReference = Math.min(next.maxHp, next.retryReference + heal);
      next.repairUsed = true;
    }
    this.state = next;
    this.sim.consolidated = BigInt(next.balance);
    this.sim.damageLevel = next.damageLevel; this.sim.fireRateLevel = next.fireRateLevel;
    this.sim.maxHp = next.maxHp;
    if (this.sim.phase === 'PREP' || this.sim.phase === 'BOSS_INTRO') this.sim.hp = next.hp;
    this.save();
    return true;
  }
  retry() {
    if (this.sim.phase !== 'LOST') return false;
    this.state.retries++;
    this.sim = this.createSim(this.sim.width, this.sim.height);
    this.save();
    return true;
  }
  continue() {
    if (this.sim.phase !== 'WON' || this.state.kingdomCompleted || this.state.stage !== this.stageId + 1 || this.state.stage > 12) return false;
    this.stageId = this.state.stage;
    this.sim = this.createSim(this.sim.width, this.sim.height);
    return true;
  }
  metrics() { return { campaign: { ...this.state, preview: this.preview, persistenceWarning: this.persistenceWarning }, simulation: this.sim.metrics() }; }
}
