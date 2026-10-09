export const RULES = {
  spawnMs: 1500,
  lifetimeMs: 8000,
  maxCookies: 7,
  hp: 1,
  reward: 1,
  radius: 40,
  gap: 12,
  hudHeight: 100,
  edge: 12,
} as const;

export type Cookie = { id: number; x: number; y: number; hp: number; expiresAt: number };
export type Bounds = { width: number; height: number };

export class SpawnManager {
  readonly active = new Map<number, Cookie>();
  balance = 0;
  destroyed = 0;
  private nextId = 0;

  constructor(private readonly random: () => number = Math.random) {}

  spawn(bounds: Bounds, now: number): Cookie | undefined {
    if (this.active.size >= RULES.maxCookies) return;
    const minX = RULES.edge + RULES.radius;
    const maxX = bounds.width - minX;
    const minY = RULES.hudHeight + RULES.radius;
    const maxY = bounds.height - minX;
    if (maxX < minX || maxY < minY) return;

    for (let attempt = 0; attempt < 60; attempt++) {
      const x = minX + this.random() * (maxX - minX);
      const y = minY + this.random() * (maxY - minY);
      if (![...this.active.values()].every(cookie =>
        Math.hypot(cookie.x - x, cookie.y - y) >= RULES.radius * 2 + RULES.gap)) continue;
      const cookie = { id: this.nextId++, x, y, hp: RULES.hp, expiresAt: now + RULES.lifetimeMs };
      this.active.set(cookie.id, cookie);
      return cookie;
    }
  }

  hit(id: number): number {
    const cookie = this.active.get(id);
    if (!cookie) return 0;
    cookie.hp--;
    if (cookie.hp > 0) return 0;
    this.active.delete(id);
    this.balance += RULES.reward;
    this.destroyed++;
    return RULES.reward;
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

  resize(bounds: Bounds, now: number): number[] {
    const removed = [...this.active.keys()];
    this.active.clear();
    // A fresh layout keeps every cookie reachable after orientation changes.
    for (let i = 0; i < removed.length; i++) this.spawn(bounds, now);
    return removed;
  }
}
