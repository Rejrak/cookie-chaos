export function cycleForStage(stageNumber: number) {
  if (!Number.isSafeInteger(stageNumber) || stageNumber < 1) throw new RangeError('Invalid stage number');
  const cycleIndex = Math.floor((stageNumber - 1) / 12);
  return { cycleIndex, cycleNumber: cycleIndex + 1, stageInCycle: ((stageNumber - 1) % 12) + 1 };
}

export function hardHpForStage(stageNumber: number): number {
  const hp = 3 + cycleForStage(stageNumber).cycleIndex;
  if (!Number.isSafeInteger(hp)) throw new RangeError('Hard HP exceeds safe integer');
  return hp;
}

export function cycleLabel(cycleNumber: number): string {
  if (!Number.isSafeInteger(cycleNumber) || cycleNumber < 1) throw new RangeError('Invalid cycle number');
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return roman[cycleNumber - 1] ?? String(cycleNumber);
}

export function kingdomName(cycleNumber: number): string { return `Kingdom ${cycleLabel(cycleNumber)}`; }
