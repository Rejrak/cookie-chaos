import { P0, type ArenaKind, type CookieKind } from '../p0/config';

export type Wave = Record<CookieKind, number>;
export type StageConfig = {
  id: number; name: string; targetSp: number; arena: ArenaKind;
  waves: Wave[]; spawnMs: number; waveMs: number; maxActive: number;
  boss?: 'Cookie Barbarian' | 'Cookie Knight' | 'Cookie Berserker' | 'The Cookieng';
};
const wave = (normal: number, hard: number, golden = 0): Wave => ({ NORMAL: normal, HARD: hard, GOLDEN: golden });

// Explicit Kingdom I encounters. Values remain experimental pending campaign playtest.
export const KINGDOM_ONE: readonly StageConfig[] = [
  { id: 1, name: 'First Crumbs', targetSp: 25, arena: 'FREE', spawnMs: 1250, waveMs: 14000, maxActive: 6, waves: [wave(5, 1), wave(6, 2, 1), wave(6, 3, 1)] },
  { id: 2, name: 'Sugar Drift', targetSp: 30, arena: 'FREE', spawnMs: 1200, waveMs: 16000, maxActive: 6, waves: [wave(6, 1, 1), wave(6, 3), wave(6, 3, 1)] },
  { id: 3, name: 'Barbarian Gate', targetSp: 34, arena: 'FREE', spawnMs: 1200, waveMs: 17000, maxActive: 7, waves: [wave(6, 2), wave(7, 3, 1), wave(6, 4, 1)], boss: 'Cookie Barbarian' },
  { id: 4, name: 'Caramel Bridge', targetSp: 36, arena: 'OBSTACLE', spawnMs: 1200, waveMs: 18000, maxActive: 7, waves: [wave(6, 2), wave(7, 3, 1), wave(7, 4, 1)] },
  { id: 5, name: 'Ricochet Row', targetSp: 39, arena: 'OBSTACLE', spawnMs: 1150, waveMs: 18000, maxActive: 7, waves: [wave(6, 3), wave(7, 3, 1), wave(7, 4, 1)] },
  { id: 6, name: 'Knight Watch', targetSp: 42, arena: 'OBSTACLE', spawnMs: 1150, waveMs: 19000, maxActive: 8, waves: [wave(7, 3), wave(7, 4, 1), wave(7, 4, 1)], boss: 'Cookie Knight' },
  { id: 7, name: 'Midnight Bakery', targetSp: 44, arena: 'FREE', spawnMs: 1100, waveMs: 19000, maxActive: 8, waves: [wave(7, 3, 1), wave(7, 4, 1), wave(8, 4, 1)] },
  { id: 8, name: 'Crossfire Crumbs', targetSp: 47, arena: 'OBSTACLE', spawnMs: 1100, waveMs: 20000, maxActive: 8, waves: [wave(7, 4), wave(8, 4, 1), wave(8, 4, 1)] },
  { id: 9, name: 'Berserker Road', targetSp: 50, arena: 'FREE', spawnMs: 1100, waveMs: 20000, maxActive: 8, waves: [wave(8, 4), wave(8, 4, 1), wave(8, 5, 1)], boss: 'Cookie Berserker' },
  { id: 10, name: 'Royal Approach', targetSp: 53, arena: 'OBSTACLE', spawnMs: 1050, waveMs: 20000, maxActive: 9, waves: [wave(8, 4, 1), wave(8, 5, 1), wave(8, 5, 1)] },
  { id: 11, name: 'Crown Shadows', targetSp: 56, arena: 'OBSTACLE', spawnMs: 1050, waveMs: 21000, maxActive: 9, waves: [wave(8, 5, 1), wave(9, 5, 1), wave(9, 5, 1)] },
  { id: 12, name: 'The Cookieng', targetSp: 60, arena: 'OBSTACLE', spawnMs: 1000, waveMs: 21000, maxActive: 9, waves: [wave(9, 5, 1), wave(9, 5, 1), wave(9, 6, 1)], boss: 'The Cookieng' },
];

export function validateStage(stage: StageConfig): void {
  if (!Number.isInteger(stage.id) || stage.id < 1 || !Number.isInteger(stage.targetSp) || stage.targetSp < 1 ||
    !Number.isInteger(stage.spawnMs) || stage.spawnMs < 100 || !Number.isInteger(stage.waveMs) || stage.waveMs < stage.spawnMs ||
    !Number.isInteger(stage.maxActive) || stage.maxActive < 1 || !stage.waves.length ||
    (stage.arena !== 'FREE' && stage.arena !== 'OBSTACLE')) throw new RangeError('Invalid stage configuration');
  let potential = 0;
  for (const counts of stage.waves) {
    let scheduled = 0;
    for (const kind of ['NORMAL', 'HARD', 'GOLDEN'] as const) {
      if (!Number.isInteger(counts[kind]) || counts[kind] < 0) throw new RangeError('Invalid wave budget');
      scheduled += counts[kind]; potential += counts[kind] * P0.cookies[kind].sp;
    }
    if (!scheduled || scheduled > 1 + Math.floor((stage.waveMs - 1) / stage.spawnMs))
      throw new RangeError(`Stage ${stage.id}: spawn window cannot schedule wave budget`);
  }
  if (potential <= stage.targetSp) throw new RangeError(`Stage ${stage.id}: insufficient potential SP`);
}
KINGDOM_ONE.forEach(validateStage);
