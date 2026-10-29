export const TILE_WIDTH = 64,
  TILE_HEIGHT = 32;
export function tileToScreen(p: { x: number; y: number }) {
  return {
    x: ((p.x - p.y) * TILE_WIDTH) / 2,
    y: ((p.x + p.y) * TILE_HEIGHT) / 2,
  };
}
export function screenToTile(p: { x: number; y: number }) {
  return {
    x: p.x / TILE_WIDTH + p.y / TILE_HEIGHT,
    y: p.y / TILE_HEIGHT - p.x / TILE_WIDTH,
  };
}
