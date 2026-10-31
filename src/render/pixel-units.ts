import { authorUnitNormals } from "./unit-normals";
/** Authored, outline-free pixel units. Atlas pixels are source art, not a downsampled concept. */
export const UNIT_FRAME_SIZE = 32;
export const UNIT_FRAME_COUNT = 10;
export const UNIT_KINDS = [
  "prince", "woodcutter", "miner", "fisher", "smith", "builder", "cook", "merchant",
  "boar", "rock-mite", "bandit", "captain", "armoured-outlaw", "ranged-outlaw",
] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export interface UnitSheet {
  width: number;
  height: number;
  rgba: Uint8Array;
  normal: Uint8Array;
  frameSize: number;
  frameCount: number;
  /** Source-pixel ground pivot, common to every frame (bottom edge, not pixel centre). */
  footX: number;
  footY: number;
  /** Canonical person height; props raised during work may exceed this extent. */
  bodyHeight: number;
}

type Color = readonly [number, number, number];
type Painter = (x: number, y: number, w: number, h: number, color: Color, _legacyCurve?: number) => void;
export const UNIT_TOOLS = ["none", "sword", "axe", "pickaxe", "hammer", "rod", "bow"] as const;
export type UnitTool = (typeof UNIT_TOOLS)[number];

const C = {
  blue: [40, 91, 168], blueLight: [61, 115, 186], cream: [232, 219, 177],
  gold: [222, 171, 63], leather: [128, 80, 45], wood: [143, 95, 53],
  metal: [172, 183, 183], metalLight: [212, 215, 202], eye: [54, 40, 32],
  red: [164, 76, 56], sage: [91, 124, 69], moss: [76, 98, 62],
  ochre: [184, 134, 55], slate: [104, 125, 139], apron: [125, 89, 61],
  stone: [124, 140, 148], stoneLight: [157, 169, 168], stoneWarm: [181, 153, 103],
} as const satisfies Record<string, Color>;
const SKINS: readonly Color[] = [[242, 192, 139], [204, 145, 95], [164, 111, 72], [226, 168, 116]];
const HAIR: readonly Color[] = [[137, 74, 40], [106, 71, 43], [173, 121, 57], [125, 104, 79]];

interface Costume { cloth: Color; accent: Color; trousers: Color; cap?: Color; apron?: boolean; beard?: boolean }
const COSTUMES: Record<Exclude<UnitKind, "boar" | "rock-mite">, Costume> = {
  prince: { cloth: C.blue, accent: C.gold, trousers: C.cream },
  woodcutter: { cloth: C.sage, accent: C.ochre, trousers: C.sage },
  miner: { cloth: C.ochre, accent: C.cream, trousers: C.ochre, cap: C.ochre, beard: true },
  fisher: { cloth: C.slate, accent: C.cream, trousers: C.leather, cap: C.ochre },
  smith: { cloth: C.red, accent: C.metal, trousers: C.leather, apron: true },
  builder: { cloth: C.sage, accent: C.cream, trousers: C.ochre, cap: C.red },
  cook: { cloth: C.cream, accent: C.red, trousers: C.slate, cap: C.cream, apron: true },
  merchant: { cloth: [120, 105, 144], accent: C.gold, trousers: C.leather },
  bandit: { cloth: C.red, accent: C.ochre, trousers: C.leather, cap: C.leather },
  captain: { cloth: [142, 65, 54], accent: C.gold, trousers: C.slate, cap: C.metal },
  "armoured-outlaw": { cloth: C.slate, accent: C.metalLight, trousers: C.slate, cap: C.metal },
  "ranged-outlaw": { cloth: C.moss, accent: C.ochre, trousers: C.leather, cap: C.moss },
};

export function unitKindForActor(actor: { id: number; role: string; name: string }): UnitKind {
  if (actor.id === 0 || actor.role === "prince") return "prince";
  return (UNIT_KINDS as readonly string[]).includes(actor.role)
    ? actor.role as UnitKind : "merchant";
}

export function unitKindForEnemy(definitionId: string): UnitKind {
  switch (definitionId) {
    case "boar": case "rock-mite": case "bandit": case "captain":
    case "armoured-outlaw": case "ranged-outlaw": return definitionId;
    default: return "bandit";
  }
}

/** Original flat pigment plus authored broad form normals; no inferred physical geometry. */
export function createUnitSheet(kind: UnitKind, variant = 0): UnitSheet {
  validateKind(kind);
  const id = variantId(variant);
  return authorUnitNormals(makeSheet((p) => {
    if (kind === "boar") boar(p, id);
    else if (kind === "rock-mite") rockMite(p, id);
    // The body, face and feet stay still: action animation belongs to the held layer.
    else person(p, kind, id);
  }), kind);
}

/** Separate hand/equipment pixels on the SAME source grid and pivot as the body. */
export function createHeldUnitSheet(kind: UnitKind, variant: number, tool: UnitTool): UnitSheet {
  validateKind(kind);
  if (!(UNIT_TOOLS as readonly string[]).includes(tool)) throw new Error(`Unknown unit tool: ${tool}`);
  const id = variantId(variant);
  const bodyHeight = createUnitSheet(kind, id).bodyHeight;
  return authorUnitNormals(makeSheet((p, frame) => {
    if (kind === "boar" || kind === "rock-mite") return;
    // One fine source pixel of hand movement; all other frames hold the rest pose.
    const dy = frame === 1 ? -1 : 0;
    const shifted: Painter = (x, y, w, h, color, curve) => p(x, y + dy, w, h, color, curve);
    if (kind === "prince" && tool === "sword") {
      paintAldenTrace(shifted, true); return;
    }
    const prince = kind === "prince", step = 2;
    const x = 24, y = 24;
    const skin = prince ? ALDEN_PIGMENTS.A! : SKINS[id % SKINS.length]!;
    paintHeldTool(shifted, tool, x, y, step, prince);
    shifted(x, y, step, step, skin, .12);
  }, bodyHeight), kind, tool);
}

function validateKind(kind: UnitKind): void {
  if (!(UNIT_KINDS as readonly string[]).includes(kind)) throw new Error(`Unknown pixel unit: ${kind}`);
}

function variantId(variant: number): number {
  return Number.isFinite(variant) ? Math.abs(Math.trunc(variant)) % 8 : 0;
}

function makeSheet(drawFrame: (p: Painter, frame: number) => void, bodyHeight?: number): UnitSheet {
  const width = UNIT_FRAME_SIZE * UNIT_FRAME_COUNT, height = UNIT_FRAME_SIZE;
  const rgba = new Uint8Array(width * height * 4), normal = new Uint8Array(rgba.length);
  for (let i = 0; i < normal.length; i += 4) { normal[i] = 128; normal[i + 1] = 128; normal[i + 2] = 255; }
  for (let frame = 0; frame < UNIT_FRAME_COUNT; frame++) {
    // Legacy pigment recipes retain their curve argument; broad form normals are authored afterward.
    const draw: Painter = (x, y, w, h, color) => {
      for (let py = Math.max(0, y); py < Math.min(32, y + h); py++) {
        for (let px = Math.max(0, x); px < Math.min(32, x + w); px++) {
          const at = (py * width + frame * 32 + px) * 4;
          rgba[at] = color[0]; rgba[at + 1] = color[1]; rgba[at + 2] = color[2]; rgba[at + 3] = 255;

        }
      }
    };
    drawFrame(draw, frame);
  }
  return { width, height, rgba, normal, frameSize: UNIT_FRAME_SIZE, frameCount: UNIT_FRAME_COUNT,
    footX: 16, footY: 28, bodyHeight: bodyHeight ?? idleHeight(rgba, width) };
}

function idleHeight(rgba: Uint8Array, width: number): number {
  let top = 32, bottom = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (rgba[(y * width + x) * 4 + 3]) { top = Math.min(top, y); bottom = Math.max(bottom, y + 1); }
  }
  return bottom - top;
}

/** Measured fine-grid chart from the supplied401×423 Alden crop, not a guessed9×9 grid.
 * Each row spans two fine pixels vertically. Unequal one/two-cell offsets preserve the
 * reference's half-coarse-cell edges. Cols17+ are the separate holding-hand/tool layer.
 */
const ALDEN_TRACE = [
  ".....HHHHHHHH.......",
  "...HHHHHHHHHHHH..tt.",
  "...hhSSSSSSSShh..TT.",
  "...SSEESSSSEESS..TT.",
  ".DDBBSSSSSSSSBBDDTT.",
  "GGGDDBBBBBBBBDDGGGGG",
  "DDDDDDDGGGGDDDDDDKK.",
  "DDDWWWWWWWWWWWWDDAA.",
  "...FFFF....FFFF.....",
] as const;
const ALDEN_PIGMENTS: Record<string, Color> = {
  H: [140, 78, 54], h: [136, 76, 54], S: [253, 213, 155], E: [60, 38, 28],
  B: [66, 94, 191], D: [45, 67, 126], G: [249, 199, 101], W: [248, 238, 215],
  F: [128, 75, 58], T: [178, 172, 169], t: [208, 202, 196],
  K: [148, 84, 60], A: [253, 214, 155],
};

function paintAldenTrace(p: Painter, held: boolean): void {
  for (let row = 0; row < ALDEN_TRACE.length; row++) {
    const cells = ALDEN_TRACE[row]!;
    for (let col = 0; col < cells.length; col++) {
      if ((col >= 17) !== held) continue;
      const pigment = ALDEN_PIGMENTS[cells[col]!];
      if (pigment) p(7 + col, 10 + row * 2, 1, 2, pigment, .06);
    }
  }
}

function person(p: Painter, kind: Exclude<UnitKind, "boar" | "rock-mite">, id: number): void {
  if (kind === "prince") { paintAldenTrace(p, false); return; }
  const outfit = COSTUMES[kind], skin = SKINS[id % SKINS.length]!;
  const hair = HAIR[(id + Math.floor(id / 4)) % HAIR.length]!;
  const darkCloth: Color = [Math.round(outfit.cloth[0] * .8), Math.round(outfit.cloth[1] * .8), Math.round(outfit.cloth[2] * .8)];
  const pigments: Record<string, Color> = {
    H: outfit.cap ?? hair, h: hair, S: skin, E: ALDEN_PIGMENTS.E!,
    B: outfit.cloth, D: darkCloth, G: outfit.accent,
    W: outfit.trousers, F: ALDEN_PIGMENTS.F!,
  };
  for (let row = 0; row < ALDEN_TRACE.length; row++) {
    const cells = ALDEN_TRACE[row]!;
    for (let col = 0; col < 17; col++) {
      const token = cells[col]!;
      let pigment = pigments[token];
      if (!pigment) continue;
      // Workers have exposed left hands, short hems and practical waist belts.
      // All changes stay on the master's measured fine grid and keep the holding hand separate.
      if (row === 5 && col <= 2) pigment = skin;
      if (row === 6 && col >= 3 && col <= 14) pigment = col >= 7 && col <= 10 ? outfit.accent : C.leather;
      if (row === 7 && (col <= 2 || col >= 15) && kind !== "captain" && kind !== "merchant") continue;
      if (outfit.beard && row === 4 && col >= 5 && col <= 12) pigment = hair;
      if (outfit.apron && row === 5 && col >= 5 && col <= 12)
        pigment = kind === "cook" ? ALDEN_PIGMENTS.W! : C.apron;
      if (kind === "armoured-outlaw" && row === 5 && col >= 5 && col <= 12) pigment = C.metal;
      p(7 + col, 10 + row * 2, 1, 2, pigment, .06);
    }
  }
}

function paintHeldTool(p: Painter, tool: UnitTool, x: number, y: number, step: number, prince: boolean): void {
  const wood = prince ? ALDEN_PIGMENTS.K! : C.wood;
  const metal = prince ? ALDEN_PIGMENTS.T! : C.metal;
  const gold = prince ? ALDEN_PIGMENTS.G! : C.gold;
  if (tool === "none") return;
  if (tool === "sword") {
    p(x, y - 6 * step, step, 4 * step, metal);
    p(x - step, y - 2 * step, 3 * step, step, gold);
    p(x, y - 2 * step, step, 2 * step, wood);
  } else if (tool === "axe") {
    p(x, y - 5 * step, step, 5 * step, wood);
    p(x + step, y - 5 * step, 2 * step, 2 * step, metal);
  } else if (tool === "pickaxe") {
    p(x, y - 5 * step, step, 5 * step, wood);
    p(x - 2 * step, y - 5 * step, 5 * step, step, metal);
    p(x - 2 * step, y - 4 * step, step, step, metal);
    p(x + 2 * step, y - 4 * step, step, step, metal);
  } else if (tool === "hammer") {
    p(x, y - 4 * step, step, 4 * step, wood);
    p(x - step, y - 5 * step, 3 * step, 2 * step, metal);
  } else if (tool === "rod") {
    p(x, y - 7 * step, 1, 7 * step, wood);
    p(x + 1, y - 7 * step, 2 * step, 1, C.cream, 0);
    p(x + 2 * step, y - 7 * step + 1, 1, 4 * step, C.cream, 0);
  } else if (tool === "bow") {
    p(x + step, y - 5 * step, step, 5 * step, wood);
    p(x, y - 6 * step, step, step, wood);
    p(x, y - 5 * step, 1, 5 * step, C.cream, 0);
  }
}

function boar(p: Painter, id: number): void {
  const fur: Color = id % 2 ? [140, 109, 79] : [148, 102, 66];
  const snout: Color = [205, 152, 116];
  // A broad front-facing animal, at the same fine-pixel density as the people.
  p(9, 16, 14, 10, fur, .18); p(8, 18, 16, 8, fur, .2);
  p(11, 14, 10, 2, fur); p(8, 14, 4, 4, fur); p(20, 14, 4, 4, fur);
  p(10, 16, 2, 2, snout); p(20, 16, 2, 2, snout);
  p(12, 17, 8, 2, [164, 120, 80]);
  p(11, 19, 2, 2, C.eye, 0); p(19, 19, 2, 2, C.eye, 0);
  p(13, 21, 6, 4, snout, .2);
  p(14, 22, 1, 1, C.leather, 0); p(17, 22, 1, 1, C.leather, 0);
  p(11, 23, 2, 2, C.cream); p(19, 23, 2, 2, C.cream);
  p(10, 26, 4, 2, ALDEN_PIGMENTS.F!); p(18, 26, 4, 2, ALDEN_PIGMENTS.F!);
}

function rockMite(p: Painter, id: number): void {
  const stone: Color = id % 2 ? [127, 143, 135] : C.stone;
  // Six short block legs and a broad mineral shell, without a human head/body template.
  p(6, 18, 2, 2, C.moss); p(6, 22, 2, 2, C.moss);
  p(24, 18, 2, 2, C.moss); p(24, 22, 2, 2, C.moss);
  p(8, 26, 4, 2, C.moss); p(20, 26, 4, 2, C.moss);
  p(10, 16, 12, 2, C.stoneLight, .18); p(8, 18, 16, 8, stone, .2);
  p(10, 18, 6, 4, C.stoneLight); p(18, 18, 4, 2, C.stoneWarm);
  p(11, 22, 2, 2, C.eye, 0); p(19, 22, 2, 2, C.eye, 0);
}
