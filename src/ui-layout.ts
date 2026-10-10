import type { PlayArea } from './game';

export type GameLayout = {
  sideShop: boolean;
  compact: boolean;
  hudHeight: number;
  dockHeight: number;
  bossPanelHeight: number;
  fieldRight: number;
  playArea: PlayArea;
  shop: { x: number; y: number; width: number; height: number };
};

export const HUD_TOUGH_ROW = { textY: 132, iconY: 140, iconSize: 18 } as const;

/** The same bounds position the visible chrome and constrain cookie spawning. */
export function calculateGameLayout(width: number, height: number, bossFight = false): GameLayout {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Invalid viewport');
  }
  const sideShop = width >= 960 && height >= 480 && !bossFight;
  const compact = height < 420;
  const hudHeight = compact ? 94 : 160;
  const dockHeight = compact ? 60 : 76;
  const bossPanelHeight = bossFight ? 48 : 0;
  const fieldRight = sideShop ? width - 336 : width;
  return {
    sideShop, compact, hudHeight, dockHeight, bossPanelHeight, fieldRight,
    playArea: { left: 0, top: hudHeight, right: fieldRight, bottom: height - dockHeight - bossPanelHeight },
    shop: sideShop ? { x: fieldRight, y: 0, width: 336, height } : { x: 0, y: 0, width, height },
  };
}
