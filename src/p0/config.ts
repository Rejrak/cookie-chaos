export type CookieKind = 'NORMAL' | 'HARD' | 'GOLDEN';
export type ArenaKind = 'FREE' | 'OBSTACLE';

export const P0 = {
  stepMs: 1000 / 120,
  targetSp: 25,
  maxHp: 5,
  waveMs: 14_000,
  spawnMs: 1_250,
  bulletLifeMs: 1_500,
  bulletRadius: 5,
  cookieRadius: 19,
  fallSeconds: { NORMAL: 4.5, HARD: 5.2, GOLDEN: 3.3 },
  damageCost: 20n,
  fireRateCost: 20n,
  waves: [
    { NORMAL: 5, HARD: 1, GOLDEN: 0 },
    { NORMAL: 6, HARD: 2, GOLDEN: 1 },
    { NORMAL: 6, HARD: 3, GOLDEN: 1 },
  ],
  cookies: {
    NORMAL: { hp: 1, sp: 1, reward: 1n, groundDamage: 1 },
    HARD: { hp: 3, sp: 3, reward: 6n, groundDamage: 1 },
    GOLDEN: { hp: 1, sp: 5, reward: 5n, groundDamage: 0 },
  },
} as const;

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
