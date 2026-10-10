import { Economy } from './economy';
import { SpawnManager, cookieReward, type Cookie } from './game';
import { StageManager } from './stage';
import { BossManager } from './boss';
import { HealthManager } from './health';

export function applyDamage(health: HealthManager, stage: StageManager, amount: number, now: number,
  paused = false) {
  if (paused || (stage.status !== 'RUNNING' && stage.status !== 'BOSS_FIGHT')) return;
  const result = health.takeDamage(amount, now);
  if (health.isDead) stage.fail('HEALTH_DEPLETED');
  return result;
}

export function applyCookieHit(spawns: SpawnManager, economy: Economy, stage: StageManager,
  id: number, damage: number, baseReward: bigint) {
  if (stage.status !== 'RUNNING') return;
  const cookie = spawns.active.get(id);
  if (!cookie) return;
  if (cookie.type === 'BOMB') return;
  const hit = spawns.hit(id, damage);
  if (!hit) return;
  const currencyReward = hit.destroyed ? cookieReward(cookie, baseReward) : null;
  const stagePoints = hit.destroyed ? cookie.stagePoints : null;
  const toughDestroyed = hit.destroyed && cookie.tough;
  economy.recordHit(currencyReward);
  if (currencyReward !== null && stagePoints !== null) stage.recordCollection(stagePoints, currencyReward, toughDestroyed);
  return { ...hit, currencyReward, stagePoints, toughDestroyed };
}

export function applyBombHit(spawns: SpawnManager, health: HealthManager, stage: StageManager,
  id: number, now: number, paused = false) {
  if (paused || stage.status !== 'RUNNING' || spawns.active.get(id)?.type !== 'BOMB') return;
  const hit = spawns.hit(id);
  if (!hit?.destroyed) return;
  return applyDamage(health, stage, 1, now);
}

export function applyExpiry(cookie: Cookie, health: HealthManager, stage: StageManager,
  now: number, paused = false) {
  if (cookie.type !== 'REINFORCED' && cookie.type !== 'TITAN') return;
  return applyDamage(health, stage, 1, now, paused);
}

export function applyBossHit(boss: BossManager, economy: Economy, stage: StageManager,
  damage: number, now: number, baseReward: bigint) {
  if (stage.status !== 'BOSS_FIGHT') return;
  const hit = boss.hit(damage, now, baseReward);
  if (hit?.defeated && hit.reward !== null && stage.completeBoss()) economy.grantBossReward(hit.reward);
  return hit;
}
