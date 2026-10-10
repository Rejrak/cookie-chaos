import { cycleForStage } from './cycle';

export const RULES = {
  spawnMs: 1500,
  lifetimeMs: 3000,
  maxCookies: 7,
  radius: 40,
  gap: 12,
  hudHeight: 120,
  edge: 12,
} as const;

// SVG outer radius 46.5 plus half its 3px stroke; sprite hit circle uses this radius.
export const COOKIE_SOURCE_RADIUS = 48;

export const COOKIE_TYPES = {
  NORMAL: { hp: 1, multiplier: 1n, stagePoints: 1n, tough: false, weightBp: 8000, lifetimeMs: RULES.lifetimeMs, texture: 'cookie', asset: '/cookie.svg' },
  HARD: { hp: 3, multiplier: 6n, stagePoints: 3n, tough: true, weightBp: 1500, lifetimeMs: 4000, texture: 'hard-cookie', asset: '/hard-cookie.svg' },
  GOLDEN: { hp: 1, multiplier: 5n, stagePoints: 5n, tough: false, weightBp: 500, lifetimeMs: 1000, texture: 'golden-cookie', asset: '/golden-cookie.svg' },
  REINFORCED: { hp: 5, multiplier: 8n, stagePoints: 5n, tough: true, weightBp: 1000, lifetimeMs: 5000, texture: 'reinforced-cookie', asset: '/reinforced-cookie.svg' },
  TITAN: { hp: 9, multiplier: 14n, stagePoints: 8n, tough: true, weightBp: 500, lifetimeMs: 6000, texture: 'titan-cookie', asset: '/titan-cookie.svg' },
  BOMB: { hp: 1, multiplier: 0n, stagePoints: 0n, tough: false, weightBp: 500, lifetimeMs: 2500, texture: 'bomb-cookie', asset: '/bomb-cookie.svg' },
} as const;

export type CookieType = keyof typeof COOKIE_TYPES;
export type Cookie = {
  id: number; type: CookieType; x: number; y: number; radius: number;
  vx?: number; vy?: number;
  hp: number; maxHp: number; expiresAt: number; rewardMultiplier: bigint; stagePoints: bigint; tough: boolean;
};
export type Bounds = { width: number; height: number };
export type PlayArea = { left: number; top: number; right: number; bottom: number };

export function cookieReward(cookie: Cookie, baseReward: bigint): bigint {
  if (cookie.type === 'BOMB') return 0n;
  return baseReward * cookie.rewardMultiplier;
}

export function bombChanceBp(stageNumber: number): number {
  cycleForStage(stageNumber);
  return stageNumber < 4 ? 0 : stageNumber < 13 ? 500 : stageNumber < 25 ? 800 : 1000;
}

export function maxActiveBombs(stageNumber: number): number {
  cycleForStage(stageNumber);
  return stageNumber < 4 ? 0 : stageNumber < 25 ? 1 : 2;
}

export function cookieProbabilities(goldenBp: number = COOKIE_TYPES.GOLDEN.weightBp, stageNumber = 1) {
  if (!Number.isInteger(goldenBp) || goldenBp < 500 || goldenBp > 2500) throw new RangeError('Invalid Golden chance');
  cycleForStage(stageNumber);
  const reinforced = stageNumber >= 4 ? COOKIE_TYPES.REINFORCED.weightBp : 0;
  const titan = stageNumber >= 9 ? COOKIE_TYPES.TITAN.weightBp : 0;
  const hard = COOKIE_TYPES.HARD.weightBp;
  const bomb = bombChanceBp(stageNumber);
  return { NORMAL: 10_000 - hard - goldenBp - reinforced - titan - bomb, HARD: hard,
    GOLDEN: goldenBp, REINFORCED: reinforced, TITAN: titan, BOMB: bomb };
}

export function selectCookieType(roll: number, goldenBp: number = COOKIE_TYPES.GOLDEN.weightBp,
  stageNumber = 1): CookieType {
  const chances = cookieProbabilities(goldenBp, stageNumber);
  if (!Number.isInteger(roll) || roll < 0 || roll >= 10_000) throw new RangeError('Invalid spawn roll');
  if (roll < chances.NORMAL) return 'NORMAL';
  if (roll < chances.NORMAL + chances.HARD) return 'HARD';
  if (roll < chances.NORMAL + chances.HARD + chances.GOLDEN) return 'GOLDEN';
  if (roll < chances.NORMAL + chances.HARD + chances.GOLDEN + chances.REINFORCED) return 'REINFORCED';
  if (roll < chances.NORMAL + chances.HARD + chances.GOLDEN + chances.REINFORCED + chances.TITAN) return 'TITAN';
  return 'BOMB';
}

export function advanceGameTime(now: number, delta: number, paused: boolean): number {
  return paused ? now : now + delta;
}

export function defaultArea(bounds: Bounds): PlayArea {
  return { left: 0, top: RULES.hudHeight, right: bounds.width, bottom: bounds.height };
}

export function movementSpeed(stageNumber: number, area: PlayArea): number {
  const { stageInCycle, cycleIndex } = cycleForStage(stageNumber);
  const base = stageInCycle <= 3 ? 35 : stageInCycle <= 6 ? 52 : stageInCycle <= 9 ? 70 : 90;
  return Math.min(base + Math.min(cycleIndex * 3, 30), Math.max(25, (area.bottom - area.top) * 0.35));
}

export class SpawnManager {
  readonly active = new Map<number, Cookie>();
  private nextId = 0;
  private nonToughSpawns = 0;
  private movementRemainder = 0;

  constructor(private readonly random: () => number = Math.random) {}

  resetFairness() { this.nonToughSpawns = 0; }

  private fits(x: number, y: number, radius: number, area: PlayArea, others: Cookie[]): boolean {
    return x - radius >= area.left + RULES.edge && x + radius <= area.right - RULES.edge &&
      y - radius >= area.top && y + radius <= area.bottom - RULES.edge &&
      others.every(cookie => Math.hypot(cookie.x - x, cookie.y - y) >= cookie.radius + radius + RULES.gap);
  }

  private position(radius: number, area: PlayArea, others: Cookie[]): { x: number; y: number } | undefined {
    const minX = area.left + RULES.edge + radius;
    const maxX = area.right - RULES.edge - radius;
    const minY = area.top + radius;
    const maxY = area.bottom - RULES.edge - radius;
    if (maxX < minX || maxY < minY) return;
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = minX + this.random() * (maxX - minX);
      const y = minY + this.random() * (maxY - minY);
      if (this.fits(x, y, radius, area, others)) return { x, y };
    }
    // A grid fallback finds space when a deterministic RNG repeats one blocked point.
    for (let y = minY; y <= maxY; y += Math.max(1, radius / 2)) {
      for (let x = minX; x <= maxX; x += Math.max(1, radius / 2)) {
        if (this.fits(x, y, radius, area, others)) return { x, y };
      }
    }
  }

  spawn(bounds: Bounds, now: number, radius: number = RULES.radius, area = defaultArea(bounds),
    options: { goldenChanceBp?: number; forcedType?: CookieType; excludeBomb?: boolean; hardHp?: number;
      stageNumber?: number; toughNeeded?: boolean; lifetimeBonusMs?: number } = {}): Cookie | undefined {
    const stageNumber = options.stageNumber ?? 1;
    const { cycleIndex } = cycleForStage(stageNumber);
    const hardHp = options.hardHp ?? COOKIE_TYPES.HARD.hp + cycleIndex;
    if (!Number.isSafeInteger(hardHp) || hardHp < 1) throw new RangeError('Invalid Hard HP');
    const lifetimeBonusMs = options.lifetimeBonusMs ?? 0;
    if (!Number.isSafeInteger(lifetimeBonusMs) || lifetimeBonusMs < 0) throw new RangeError('Invalid lifetime bonus');
    if (this.active.size >= RULES.maxCookies) return;
    const position = this.position(radius, area, [...this.active.values()]);
    if (!position) return;
    let type = options.forcedType ?? selectCookieType(Math.floor(this.random() * 10_000), options.goldenChanceBp, stageNumber);
    if (options.excludeBomb && type === 'BOMB') type = 'NORMAL';
    if (options.toughNeeded && this.nonToughSpawns >= 6 && !COOKIE_TYPES[type].tough) {
      const unlocked: CookieType[] = stageNumber < 4 ? ['HARD'] : stageNumber < 9 ? ['HARD', 'REINFORCED'] :
        ['HARD', 'REINFORCED', 'TITAN'];
      type = unlocked[Math.floor(this.random() * unlocked.length)];
    }
    if ((type === 'REINFORCED' && stageNumber < 4) || (type === 'TITAN' && stageNumber < 9) ||
      (type === 'BOMB' && stageNumber < 4)) {
      throw new RangeError('Cookie type locked');
    }
    if (type === 'BOMB' && [...this.active.values()].filter(cookie => cookie.type === 'BOMB').length >= maxActiveBombs(stageNumber)) {
      type = 'NORMAL';
    }
    const definition = COOKIE_TYPES[type];
    const hp = type === 'HARD' ? hardHp : type === 'REINFORCED' ? 5 + cycleIndex :
      type === 'TITAN' ? 9 + 2 * cycleIndex : definition.hp;
    if (!Number.isSafeInteger(hp)) throw new RangeError('Cookie HP exceeds safe integer');
    const speed = movementSpeed(stageNumber, area);
    const angle = (this.nextId * 2.399963229728653 + stageNumber * 0.31) % (2 * Math.PI);
    const cookie = { id: this.nextId++, type, ...position, radius, hp, maxHp: hp,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      expiresAt: now + definition.lifetimeMs + (type === 'BOMB' ? 0 : lifetimeBonusMs), rewardMultiplier: definition.multiplier,
      stagePoints: definition.stagePoints, tough: definition.tough };
    this.active.set(cookie.id, cookie);
    this.nonToughSpawns = !options.toughNeeded || cookie.tough ? 0 :
      cookie.type === 'BOMB' ? this.nonToughSpawns : this.nonToughSpawns + 1;
    return cookie;
  }

  hit(id: number, damage = 1): { destroyed: boolean; hp: number } | undefined {
    if (!Number.isSafeInteger(damage) || damage < 1) throw new RangeError('Damage must be a positive integer');
    const cookie = this.active.get(id);
    if (!cookie) return;
    cookie.hp = Math.max(0, cookie.hp - damage);
    if (cookie.hp > 0) return { destroyed: false, hp: cookie.hp };
    this.active.delete(id);
    return { destroyed: true, hp: 0 };
  }

  expire(now: number): Cookie[] {
    const expired: Cookie[] = [];
    for (const cookie of this.active.values()) {
      if (cookie.expiresAt <= now) {
        this.active.delete(cookie.id);
        expired.push(cookie);
      }
    }
    return expired;
  }

  move(deltaMs: number, area: PlayArea): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Invalid movement delta');
    this.movementRemainder += deltaMs;
    const cookies = [...this.active.values()];
    while (this.movementRemainder >= 16) {
      this.movementRemainder -= 16;
      for (const cookie of cookies) {
        const left = area.left + RULES.edge + cookie.radius;
        const right = area.right - RULES.edge - cookie.radius;
        const top = area.top + cookie.radius;
        const bottom = area.bottom - RULES.edge - cookie.radius;
        if (right < left || bottom < top) continue;
        cookie.x += (cookie.vx ?? 0) * 0.016;
        cookie.y += (cookie.vy ?? 0) * 0.016;
        if (cookie.x < left || cookie.x > right) { cookie.x = Math.max(left, Math.min(right, cookie.x)); cookie.vx = -(cookie.vx ?? 0); }
        if (cookie.y < top || cookie.y > bottom) { cookie.y = Math.max(top, Math.min(bottom, cookie.y)); cookie.vy = -(cookie.vy ?? 0); }
      }
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 0; i < cookies.length; i++) for (let j = i + 1; j < cookies.length; j++) {
          const a = cookies[i], b = cookies[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const distance = Math.hypot(dx, dy);
          const minimum = a.radius + b.radius + RULES.gap;
          if (distance >= minimum) continue;
          const nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0;
          const shift = (minimum - distance) / 2;
          a.x -= nx * shift; a.y -= ny * shift;
          b.x += nx * shift; b.y += ny * shift;
          const relative = (b.vx ?? 0) * nx + (b.vy ?? 0) * ny - (a.vx ?? 0) * nx - (a.vy ?? 0) * ny;
          if (relative < 0) {
            a.vx = (a.vx ?? 0) + relative * nx; a.vy = (a.vy ?? 0) + relative * ny;
            b.vx = (b.vx ?? 0) - relative * nx; b.vy = (b.vy ?? 0) - relative * ny;
          }
        }
        for (const cookie of cookies) {
          cookie.x = Math.max(area.left + RULES.edge + cookie.radius, Math.min(area.right - RULES.edge - cookie.radius, cookie.x));
          cookie.y = Math.max(area.top + cookie.radius, Math.min(area.bottom - RULES.edge - cookie.radius, cookie.y));
        }
      }
    }
  }

  resize(bounds: Bounds, area = defaultArea(bounds)): number[] {
    const cookies = [...this.active.values()];
    const kept = cookies.filter(cookie => this.fits(cookie.x, cookie.y, cookie.radius, area, []));
    const removed: number[] = [];
    for (const cookie of cookies) {
      if (kept.includes(cookie)) continue;
      const position = this.position(cookie.radius, area, kept);
      if (position) {
        Object.assign(cookie, position);
        kept.push(cookie);
      } else {
        this.active.delete(cookie.id);
        removed.push(cookie.id);
      }
    }
    const speedLimit = Math.max(25, (area.bottom - area.top) * 0.35);
    for (const cookie of this.active.values()) {
      const speed = Math.hypot(cookie.vx ?? 0, cookie.vy ?? 0);
      if (speed > speedLimit) {
        cookie.vx = cookie.vx! * speedLimit / speed;
        cookie.vy = cookie.vy! * speedLimit / speed;
      }
    }
    return removed;
  }
}
