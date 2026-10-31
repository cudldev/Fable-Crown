import type { UnitKind, UnitSheet, UnitTool } from './pixel-units';

type Form = readonly [cx: number, cy: number, rx: number, ry: number, side: number, rise: number];
const clamp = (n: number) => Math.max(-1, Math.min(1, n));
/** Authored convex forms in sprite coordinates (X right, Y up), independent of pigment patches.
 * This is lighting relief, not reconstructed geometry. Silhouette/albedo never change. */
export function authorUnitNormals(sheet: UnitSheet, kind: UnitKind, tool?: UnitTool): UnitSheet {
  for (let frame = 0; frame < sheet.frameCount; frame++) {
    for (let y = 0; y < sheet.frameSize; y++) for (let x = 0; x < sheet.frameSize; x++) {
      const at = (y * sheet.width + frame * sheet.frameSize + x) * 4;
      if (!sheet.rgba[at + 3]) continue;
      const held = tool !== undefined, sy = y + (held && frame === 1 ? 1 : 0);
      // Broad two-cell surface facets preserve the coarse pixel clusters. Narrow tools
      // retain single-cell bevels; movement translates the entire authored form together.
      const px = held ? x + .5 : Math.floor(x / 2) * 2 + 1;
      const py = held ? sy + .5 : Math.floor(sy / 2) * 2 + 1;
      let form: Form;
      if (held) {
        form = heldForm(tool, px, py);
      } else if (kind === 'boar') {
        form = py >= 26 ? [px < 16 ? 12 : 20, 27, 2, 1, .5, .3]
          : px >= 13 && px < 19 && py >= 21 ? [16, 23, 3, 2, .65, .5]
          : [16, 20, 8, 6, .72, .62];
      } else if (kind === 'rock-mite') {
        form = px < 8 || px >= 24 || py >= 26 ? [px < 16 ? 9 : 23, 24, 3, 4, .55, .3]
          : [16, 21, 8, 5, .75, .65];
      } else {
        form = py >= 26 ? [px < 16 ? 12 : 20, 27, 2, 1, .5, .32]
          : px < 10 ? [8.5, 22, 1.5, 4, .55, .55]
          : px >= 22 ? [23, 22, 1, 4, .55, .55]
          : py < 20 ? [16, 15, 6, 5, .72, .62]
          : [16, 23, 6, 3, .68, .55];
      }
      let nx = clamp((px - form[0]) / form[2]) * form[4];
      let ny = clamp((form[1] - py) / form[3]) * form[5];
      // Keep all surfaces facing outward, with enough slope to catch side lights.
      const sideLength = Math.hypot(nx, ny);
      if (sideLength > .85) { nx *= .85 / sideLength; ny *= .85 / sideLength; }
      const nz = Math.sqrt(1 - nx * nx - ny * ny);
      sheet.normal[at] = Math.round((nx * .5 + .5) * 255);
      sheet.normal[at + 1] = Math.round((ny * .5 + .5) * 255);
      sheet.normal[at + 2] = Math.round((nz * .5 + .5) * 255);
      sheet.normal[at + 3] = 255;
    }
  }
  return sheet;
}
function heldForm(tool: UnitTool, x: number, y: number): Form {
  if (x >= 24 && x < 26 && y >= 24) return [25, 25, 1, 1, .6, .5];
  if (tool === 'sword') {
    if (y < 20) return [25, 16, 1, 4, .7, .25];
    if (y < 22) return [25.5, 21, 3, 1, .55, .45];
  }
  if (tool === 'axe' && x >= 26 && y < 18) return [28, 16, 2, 2, .7, .55];
  if (tool === 'pickaxe' && y < 18) return [25, 15, 5, 1, .55, .6];
  if (tool === 'hammer' && y < 18) return [25, 16, 3, 2, .7, .55];
  if (tool === 'rod' && x > 25) return [x, y, 1, 1, 0, 0];
  if (tool === 'bow') return [27, 19, 2, 6, .65, .3];
  return [25, 21, 1, 5, .65, .2];
}
