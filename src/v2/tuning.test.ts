import { describe, expect, it } from 'vitest';
import { P0, type CookieKind, type ShooterRules } from '../p0/config';
import { P0Simulation } from '../p0/sim';
import { CAMPAIGN_FALL_SECONDS } from './stages';

function fallTime(kind: CookieKind, width: number, height: number, tuned: boolean) {
  const rules: ShooterRules = { targetSp: 100, waves: [{ NORMAL: Number(kind === 'NORMAL'),
    HARD: Number(kind === 'HARD'), GOLDEN: Number(kind === 'GOLDEN') }],
    spawnMs: 1_000, waveMs: 20_000, maxActive: 4, bossCheckpoint: false,
    ...(tuned ? { fallSeconds: CAMPAIGN_FALL_SECONDS } : {}) };
  const sim = new P0Simulation(width, height, 'FREE', 1207, 0n, { rules });
  sim.startWave(); sim.cookies[0].vx = 0;
  for (let i = 0; i < 2_000 && !sim.escaped[kind]; i++) sim.advance(1000 / 60);
  expect(sim.escaped[kind]).toBe(1);
  return sim.waveTimeMs;
}

describe('campaign-only experimental fall tuning', () => {
  it('shortens measured falls moderately on compact and desktop arenas without modifying P0', () => {
    expect(P0.fallSeconds).toEqual({ NORMAL: 4.5, HARD: 5.2, GOLDEN: 3.3 });
    for (const [width, height] of [[320, 175], [390, 720], [960, 614]]) {
      for (const kind of ['NORMAL', 'HARD', 'GOLDEN'] as const) {
        const before = fallTime(kind, width, height, false), after = fallTime(kind, width, height, true);
        const reduction = 1 - after / before;
        expect(reduction, `${kind} ${width}x${height}`).toBeGreaterThan(height < 200 ? 0.02 : kind === 'GOLDEN' ? 0.09 : 0.04);
        expect(reduction, `${kind} ${width}x${height}`).toBeLessThan(kind === 'GOLDEN' ? 0.21 : 0.12);
      }
    }
  });
});
