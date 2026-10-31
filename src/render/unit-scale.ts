import { TILE_WIDTH } from "./iso";
/** World contract: one tile/metre, 16 native voxel cells/metre. */
export const UNIT_PIXEL_METRES = 1 / 16;
export const UNIT_CANVAS_PIXELS_PER_METRE = TILE_WIDTH / Math.SQRT2;
export const UNIT_CANVAS_CELL_PIXELS = UNIT_PIXEL_METRES * UNIT_CANVAS_PIXELS_PER_METRE;
/** Body rows, not atlas padding or projecting equipment, determine physical height. */
export function unitCanvasHeight(bodyRows: number): number { return bodyRows * UNIT_CANVAS_CELL_PIXELS; }
export function unitWorldFrame(sheet: { frameSize: number; footX: number; footY: number; bodyHeight: number }) {
  return { pitch: UNIT_PIXEL_METRES, span: sheet.frameSize * UNIT_PIXEL_METRES,
    x: (sheet.frameSize / 2 - sheet.footX) * UNIT_PIXEL_METRES,
    y: (sheet.footY - sheet.frameSize / 2) * UNIT_PIXEL_METRES,
    bodyHeight: sheet.bodyHeight * UNIT_PIXEL_METRES };
}
