export function cycleForStage(stageNumber: number) {
  if (!Number.isSafeInteger(stageNumber) || stageNumber < 1) throw new RangeError('Invalid stage number');
  const cycleIndex = Math.floor((stageNumber - 1) / 12);
  return { cycleIndex, cycleNumber: cycleIndex + 1, stageInCycle: ((stageNumber - 1) % 12) + 1 };
}
