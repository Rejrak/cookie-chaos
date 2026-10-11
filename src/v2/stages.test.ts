import { describe, expect, it } from 'vitest';
import { P0Simulation } from '../p0/sim';
import { COOKIE_KINDS } from '../p0/config';
import { KINGDOM_ONE, validateStage } from './stages';

describe('Kingdom I configurations', () => {
  it('defines 12 distinct, feasible stages and only four boss gates', () => {
    expect(KINGDOM_ONE.map(stage => stage.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(KINGDOM_ONE.filter(stage => stage.boss).map(stage => stage.id)).toEqual([3, 6, 9, 12]);
    expect(KINGDOM_ONE.slice(0, 3).every(stage => stage.arena === 'FREE')).toBe(true);
    expect(KINGDOM_ONE.slice(3, 6).some(stage => stage.arena === 'OBSTACLE')).toBe(true);
    KINGDOM_ONE.forEach(validateStage);
  });

  it('rejects a budget that cannot spawn before its deadline', () => {
    const stage = KINGDOM_ONE[0];
    expect(() => validateStage({ ...stage, waveMs: 1000 })).toThrow();
  });

  it('reports scheduled, generated and unspawned enemies without silently losing budget', () => {
    const stage = KINGDOM_ONE[0];
    const sim = new P0Simulation(320, 169, stage.arena, 7, 0n, { rules: { ...stage, bossCheckpoint: false } });
    sim.hp = 100;
    sim.startWave();
    sim.advance(40_000);
    const budget = sim.waveBudgets[0];
    expect(budget.scheduled).toBe(COOKIE_KINDS.reduce((sum, kind) => sum + (stage.waves[0][kind] ?? 0), 0));
    expect(budget.generated + budget.unspawned).toBe(budget.scheduled);
    expect(budget.potentialSp).toBe(sim.generatedPotentialSp);
    expect(sim.unspawned.NORMAL + sim.unspawned.HARD + sim.unspawned.GOLDEN).toBe(budget.unspawned);
  });
  it('puts enough potential SP in play across compact and desktop arenas', () => {
    for (const stage of KINGDOM_ONE) for (const width of [320, 390, 960]) for (const seed of [1, 1207, 99_991]) {
      const sim = new P0Simulation(width, width === 320 ? 169 : 550, stage.arena, seed, 0n,
        { rules: { ...stage, bossCheckpoint: !!stage.boss } });
      sim.hp = 1000;
      for (let i = 0; i < stage.waves.length; i++) {
        sim.startWave(); sim.advance(60_000);
      }
      expect(sim.generatedPotentialSp, `stage ${stage.id}, width ${width}, seed ${seed}: ${JSON.stringify({ phase: sim.phase, wave: sim.wave, queue: sim.unspawned, cookies: sim.cookies, budgets: sim.waveBudgets })}`).toBeGreaterThan(stage.targetSp);
      expect(sim.waveBudgets.reduce((sum, wave) => sum + wave.generated + wave.unspawned, 0))
        .toBe(stage.waves.reduce((sum, wave) => sum + COOKIE_KINDS.reduce((total, kind) => total + (wave[kind] ?? 0), 0), 0));
    }
  });

  it('does not grant victory or wallet consolidation at a boss checkpoint', () => {
    const stage = KINGDOM_ONE[2];
    const sim = new P0Simulation(390, 550, stage.arena, 7, 0n, { rules: { ...stage, bossCheckpoint: true } });
    sim.hp = 100; sim.sp = stage.targetSp; sim.provisional = 12n;
    for (const wave of stage.waves) {
      expect(sim.startWave()).toBe(true);
      sim.advance(60_000);
    }
    expect(sim.phase).toBe('AWAITING_BOSS_IMPLEMENTATION');
    expect(sim.consolidated).toBe(0n);
    expect(sim.provisional).toBeGreaterThanOrEqual(12n);
    expect(sim.startWave()).toBe(false);
  });
});
