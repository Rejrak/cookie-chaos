import { Economy } from './economy';
import { SpawnManager, cookieReward } from './game';
import { StageManager } from './stage';

export function applyCookieHit(spawns: SpawnManager, economy: Economy, stage: StageManager,
  id: number, damage: number, baseReward: bigint) {
  if (stage.status !== 'RUNNING') return;
  const cookie = spawns.active.get(id);
  if (!cookie) return;
  const hit = spawns.hit(id, damage);
  if (!hit) return;
  const reward = hit.destroyed ? cookieReward(cookie, baseReward) : null;
  economy.recordHit(reward);
  if (reward !== null) stage.recordReward(reward);
  return { ...hit, reward };
}
