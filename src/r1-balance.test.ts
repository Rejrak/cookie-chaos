import { describe, expect, it } from 'vitest';
import { SpawnManager, COOKIE_TYPES, type Cookie, type PlayArea } from './game';
import { Economy } from './economy';
import { UpgradeManager, type UpgradeId } from './upgrades';
import { StageManager } from './stage';
import { HealthManager } from './health';
import { applyBombHit, applyCookieHit, applyExpiry } from './gameplay';

type Profile = 'none' | 'power' | 'lifetime' | 'power+lifetime' | 'speed+lifetime' | 'balanced';
type Result = { reached: number; timeMs: number; retries: number; damage: number; expired: number;
  toughExpired: number; goldenSpawned: number; goldenCollected: number; currency: bigint; points: bigint;
  spent: bigint; bought: number; firstLifetimeStage: number; levels: [bigint, bigint, bigint, bigint];
  hits: number; attempts: number; rejectedSpawns: number; bombClicks: number };
const profiles: Profile[] = ['none', 'power', 'lifetime', 'power+lifetime', 'speed+lifetime', 'balanced'];
const seeds = [1, 37, 911];
const field: PlayArea = { left: 0, top: 160, right: 390, bottom: 768 };

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function simulate(mode: 'before' | 'R1', profile: Profile, cps: number, seed: number): Result {
  const random = seeded(seed);
  const stage = new StageManager();
  const economy = new Economy();
  const upgrades = new UpgradeManager();
  const health = new HealthManager();
  const result: Result = { reached: 0, timeMs: 0, retries: 0, damage: 0, expired: 0,
    toughExpired: 0, goldenSpawned: 0, goldenCollected: 0, currency: 0n, points: 0n,
    spent: 0n, bought: 0, firstLifetimeStage: 0, levels: [0n, 0n, 0n, 0n],
    hits: 0, attempts: 0, rejectedSpawns: 0, bombClicks: 0 };
  const priorities: Record<Profile, UpgradeId[]> = {
    none: [], power: ['power'], lifetime: ['lifetime'],
    'power+lifetime': ['power', 'lifetime'], 'speed+lifetime': ['speed', 'lifetime'],
    balanced: ['power', 'lifetime', 'speed', 'value'],
  };
  let now = 0;
  let stageRetries = 0;
  while (stage.stageNumber <= 12 && stageRetries < 4) {
    for (const id of priorities[profile]) {
      // Spend earned currency only; a maximum of one level of each upgrade per attempt.
      if (mode === 'before' && id === 'lifetime') continue;
      if (upgrades.buy(id, economy)) {
        result.bought++;
        if (id === 'lifetime' && !result.firstLifetimeStage) result.firstLifetimeStage = stage.stageNumber;
      }
    }
    health.resetForStage(upgrades.maxHp, upgrades.stageShields);
    const damageBefore = health.damageEvents;
    const model = new SpawnManager(random);
    const born = new Map<number, number>();
    const spawn = (first = false) => {
      const cookie = model.spawn({ width: 390, height: 844 }, now, 40, field, {
        stageNumber: stage.stageNumber, forcedType: first ? 'NORMAL' : undefined,
        toughNeeded: stage.toughDestroyed < stage.toughRequired,
        lifetimeBonusMs: mode === 'R1' ? upgrades.lifetimeBonusMs : 0,
      });
      if (!cookie) { result.rejectedSpawns++; return; }
      if (mode === 'before') { cookie.expiresAt = now + (cookie.type === 'BOMB' ? 5000 : 8000); cookie.vx = 0; cookie.vy = 0; }
      born.set(cookie.id, now);
      if (cookie.type === 'GOLDEN') result.goldenSpawned++;
    };
    spawn(true);
    let spawnElapsed = 0, clickElapsed = 0, cursorX = 195, cursorY = 464;
    let aimed: { id: number; x: number; y: number; readyAt: number } | null = null;
    while (stage.status === 'RUNNING') {
      const delta = 100;
      stage.tick(delta);
      now += delta; result.timeMs += delta;
      if (stage.status !== 'RUNNING') break;
      if (mode === 'R1') model.move(delta, field);
      for (const cookie of model.expire(now)) {
        result.expired++;
        if (cookie.tough) result.toughExpired++;
        applyExpiry(cookie, health, stage, now);
      }
      if (stage.status !== 'RUNNING') break;
      spawnElapsed += delta;
      while (spawnElapsed >= upgrades.spawnMs) { spawnElapsed -= upgrades.spawnMs; spawn(); }
      clickElapsed += delta;
      while (clickElapsed >= 1000 / cps && stage.status === 'RUNNING') {
        clickElapsed -= 1000 / cps;
        if (!aimed || !model.active.has(aimed.id)) {
          const eligible = [...model.active.values()].filter(cookie => cookie.type !== 'BOMB' &&
            now - (born.get(cookie.id) ?? now) >= 250);
          eligible.sort((a, b) => Number(b.tough && stage.toughDestroyed < stage.toughRequired) -
            Number(a.tough && stage.toughDestroyed < stage.toughRequired) ||
            Number(b.type === 'GOLDEN') - Number(a.type === 'GOLDEN') || a.expiresAt - b.expiresAt || a.id - b.id);
          const target = eligible[0];
          if (!target) continue;
          aimed = { id: target.id, x: target.x, y: target.y,
            readyAt: now + Math.hypot(target.x - cursorX, target.y - cursorY) / 900 * 1000 };
        }
        if (now < aimed.readyAt) continue;
        const target = model.active.get(aimed.id);
        if (!target) { aimed = null; continue; }
        result.attempts++;
        const aimError = mode === 'R1' ? 0.1 + Math.hypot(target.vx ?? 0, target.vy ?? 0) / 650 : 0.1;
        const struck = random() >= aimError && Math.hypot(target.x - aimed.x, target.y - aimed.y) <= target.radius * 0.8;
        cursorX = aimed.x; cursorY = aimed.y; aimed = null;
        if (!struck) {
          const bomb = [...model.active.values()].find(cookie => cookie.type === 'BOMB');
          if (bomb && random() < 0.025 && applyBombHit(model, health, stage, bomb.id, now)) result.bombClicks++;
          continue;
        }
        result.hits++;
        const hit = applyCookieHit(model, economy, stage, target.id, upgrades.damage, upgrades.reward);
        if (hit?.destroyed && target.type === 'GOLDEN') result.goldenCollected++;
      }
    }
    result.damage += health.damageEvents - damageBefore;
    result.points += stage.pointsEarned;
    if (stage.status === 'BOSS_FIGHT') stage.completeBoss(); // R1 measures collection; boss combat remains M8.
    if (stage.status === 'COMPLETED') {
      result.reached = stage.stageNumber;
      stageRetries = 0;
      upgrades.unlockThroughStage(stage.maxCompletedStage);
      stage.continue();
    } else {
      result.retries++;
      stageRetries++;
      stage.retry();
    }
  }
  result.currency = economy.lifetimeEarned;
  result.spent = economy.lifetimeEarned - economy.balance;
  result.levels = [upgrades.level('power'), upgrades.level('speed'), upgrades.level('lifetime'), upgrades.level('value')];
  return result;
}

describe('R1 comparative collection simulation', () => {
  it('records imperfect 2/4/6/8-click profiles before and after movement', () => {
    const rows = [];
    for (const mode of ['before', 'R1'] as const) for (const profile of profiles)
      for (const cps of [2, 4, 6, 8]) for (const seed of seeds)
        rows.push({ mode, profile, cps, seed, ...simulate(mode, profile, cps, seed) });
    expect(rows).toHaveLength(144);
    expect(rows.every(row => row.currency >= 0n && row.points >= 0n && row.hits <= row.attempts)).toBe(true);
    for (const mode of ['before', 'R1'] as const) for (const profile of profiles) for (const cps of [2, 4, 6, 8]) {
      const group = rows.filter(row => row.mode === mode && row.profile === profile && row.cps === cps);
      const sum = (key: 'timeMs' | 'retries' | 'damage' | 'expired' | 'toughExpired' | 'goldenSpawned' |
        'goldenCollected' | 'bought' | 'hits' | 'attempts' | 'rejectedSpawns' | 'bombClicks') =>
        group.reduce((total, row) => total + row[key], 0);
      console.log(`R1 ${mode} ${profile} ${cps}cps reached=${group.map(row => row.reached).join('/')} ` +
        `time=${Math.round(sum('timeMs') / 3000)}s retry=${sum('retries')} damage=${sum('damage')} ` +
        `expired=${sum('expired')} toughExpired=${sum('toughExpired')} golden=${sum('goldenCollected')}/${sum('goldenSpawned')} ` +
        `currency=${group.reduce((total, row) => total + row.currency, 0n)} points=${group.reduce((total, row) => total + row.points, 0n)} ` +
        `spent=${group.reduce((total, row) => total + row.spent, 0n)} bought=${sum('bought')} ` +
        `lifetimeFirst=${group.map(row => row.firstLifetimeStage).join('/')} ` +
        `levels=${group.map(row => row.levels.join(',')).join('/')} ` +
        `hit=${sum('hits')}/${sum('attempts')} rejected=${sum('rejectedSpawns')} bombs=${sum('bombClicks')}`);
    }
    expect(rows.some(row => row.mode === 'R1' && row.profile === 'none' && row.retries > 0)).toBe(true);
    expect(rows.some(row => row.mode === 'R1' && row.profile !== 'none' && row.reached === 12)).toBe(true);
  });
});
