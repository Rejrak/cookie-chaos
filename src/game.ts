export const RULES = {
  spawnMs: 1500,
  lifetimeMs: 8000,
  maxCookies: 7,
  radius: 40,
  gap: 12,
  hudHeight: 120,
  edge: 12,
} as const;

// SVG outer radius 46.5 plus half its 3px stroke; sprite hit circle uses this radius.
export const COOKIE_SOURCE_RADIUS = 48;

export const COOKIE_TYPES = {
  NORMAL: { hp: 1, multiplier: 1n, weightBp: 8000, texture: 'cookie', asset: '/cookie.svg' },
  HARD: { hp: 3, multiplier: 6n, weightBp: 1500, texture: 'hard-cookie', asset: '/hard-cookie.svg' },
  GOLDEN: { hp: 1, multiplier: 5n, weightBp: 500, texture: 'golden-cookie', asset: '/golden-cookie.svg' },
} as const;

export type CookieType = keyof typeof COOKIE_TYPES;
export type Cookie = {
  id: number; type: CookieType; x: number; y: number; radius: number;
  hp: number; maxHp: number; expiresAt: number; rewardMultiplier: bigint;
};
export type Bounds = { width: number; height: number };
export type PlayArea = { left: number; top: number; right: number; bottom: number };

export function cookieReward(cookie: Cookie, baseReward: bigint): bigint {
  return baseReward * cookie.rewardMultiplier;
}

export function cookieProbabilities(goldenBp: number = COOKIE_TYPES.GOLDEN.weightBp) {
  const hard = COOKIE_TYPES.HARD.weightBp;
  if (!Number.isInteger(goldenBp) || goldenBp < 0 || goldenBp + hard > 10_000) throw new RangeError('Invalid Golden chance');
  return { NORMAL: 10_000 - hard - goldenBp, HARD: hard, GOLDEN: goldenBp };
}

export function selectCookieType(roll: number, goldenBp: number = COOKIE_TYPES.GOLDEN.weightBp): CookieType {
  const chances = cookieProbabilities(goldenBp);
  if (!Number.isInteger(roll) || roll < 0 || roll >= 10_000) throw new RangeError('Invalid spawn roll');
  if (roll < chances.NORMAL) return 'NORMAL';
  if (roll < chances.NORMAL + chances.HARD) return 'HARD';
  return 'GOLDEN';
}

export function advanceGameTime(now: number, delta: number, paused: boolean): number {
  return paused ? now : now + delta;
}

export function defaultArea(bounds: Bounds): PlayArea {
  return { left: 0, top: RULES.hudHeight, right: bounds.width, bottom: bounds.height };
}

export class SpawnManager {
  readonly active = new Map<number, Cookie>();
  private nextId = 0;

  constructor(private readonly random: () => number = Math.random) {}

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
    options: { goldenChanceBp?: number; forcedType?: CookieType } = {}): Cookie | undefined {
    if (this.active.size >= RULES.maxCookies) return;
    const position = this.position(radius, area, [...this.active.values()]);
    if (!position) return;
    const type = options.forcedType ?? selectCookieType(Math.floor(this.random() * 10_000), options.goldenChanceBp);
    const definition = COOKIE_TYPES[type];
    const cookie = { id: this.nextId++, type, ...position, radius, hp: definition.hp, maxHp: definition.hp,
      expiresAt: now + RULES.lifetimeMs, rewardMultiplier: definition.multiplier };
    this.active.set(cookie.id, cookie);
    return cookie;
  }

  hit(id: number, damage = 1): { destroyed: boolean; hp: number } | undefined {
    if (!Number.isInteger(damage) || damage < 1) throw new RangeError('Damage must be a positive integer');
    const cookie = this.active.get(id);
    if (!cookie) return;
    cookie.hp = Math.max(0, cookie.hp - damage);
    if (cookie.hp > 0) return { destroyed: false, hp: cookie.hp };
    this.active.delete(id);
    return { destroyed: true, hp: 0 };
  }

  expire(now: number): number[] {
    const expired: number[] = [];
    for (const cookie of this.active.values()) {
      if (cookie.expiresAt <= now) {
        this.active.delete(cookie.id);
        expired.push(cookie.id);
      }
    }
    return expired;
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
    return removed;
  }
}
