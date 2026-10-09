import { Economy } from './economy';
import { SpawnManager, cookieReward } from './game';
import { StageManager } from './stage';
import { BossManager } from './boss';

export function applyCookieHit(spawns: SpawnManager, economy: Economy, stage: StageManager,
  id: number, damage: number, baseReward: bigint) {
  if (stage.status !== 'RUNNING') return;
  const cookie = spawns.active.get(id);
  if (!cookie) return;
  const hit = spawns.hit(id, damage);
  if (!hit) return;
  const currencyReward = hit.destroyed ? cookieReward(cookie, baseReward) : null;
  const stagePoints = hit.destroyed ? cookie.stagePoints : null;
  economy.recordHit(currencyReward);
  if (currencyReward !== null && stagePoints !== null) stage.recordCollection(stagePoints, currencyReward);
  return { ...hit, currencyReward, stagePoints };
}

export function applyBossHit(boss: BossManager, economy: Economy, stage: StageManager,
  damage: number, now: number, baseReward: bigint) {
  if (stage.status !== 'BOSS_FIGHT') return;
  const hit = boss.hit(damage, now, baseReward);
  if (hit?.defeated && hit.reward !== null && stage.completeBoss()) economy.grantBossReward(hit.reward);
  return hit;
}
