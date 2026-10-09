export const RULES = {
  spawnMs: 1500,
  lifetimeMs: 8000,
  maxCookies: 7,
  hp: 1,
  radius: 40,
  gap: 12,
  hudHeight: 100,
  edge: 12,
} as const;

// SVG outer radius 46.5 plus half its 3px stroke; sprite hit circle uses this radius.
export const COOKIE_SOURCE_RADIUS = 48;

export type Cookie = { id: number; x: number; y: number; radius: number; hp: number; expiresAt: number };
export type Bounds = { width: number; height: number };
export type PlayArea = { left: number; top: number; right: number; bottom: number };

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

  spawn(bounds: Bounds, now: number, radius: number = RULES.radius, area = defaultArea(bounds)): Cookie | undefined {
    if (this.active.size >= RULES.maxCookies) return;
    const position = this.position(radius, area, [...this.active.values()]);
    if (!position) return;
    const cookie = { id: this.nextId++, ...position, radius, hp: RULES.hp, expiresAt: now + RULES.lifetimeMs };
    this.active.set(cookie.id, cookie);
    return cookie;
  }

  hit(id: number): { destroyed: boolean } | undefined {
    const cookie = this.active.get(id);
    if (!cookie) return;
    cookie.hp--;
    if (cookie.hp > 0) return { destroyed: false };
    this.active.delete(id);
    return { destroyed: true };
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
