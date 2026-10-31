/** Original chunky pixel cards. One painted pixel matches one scenery voxel. */
export const FOLIAGE_PIXEL_METRES = .0625;
export type FoliageArtKind = "grass" | "fern" | "flower" | "reed" | "groundcover" | "bush" | "shortgrass";
const PALETTE: Record<string, number> = {
  d: 0x596f39, g: 0x7d944b, l: 0x94a55e, s: 0x819052,
  p: 0xe1dcb5, c: 0xc6a35a, b: 0x9b8359, v: 0xb8a2b9,
  m: 0x6e8749, o: 0x768d4d, u: 0x7f9454,
};
// Top to bottom; dots are empty. Padding retains a ground-centred card pivot.
export const FOLIAGE_ART: Record<FoliageArtKind, readonly string[]> = {
  grass: [
    "........", "........", "...l....", ".l.gl...",
    ".g.gg.l.", "lglgg.g.", "ggggggg.", ".g.gg.g.",
  ],
  fern: [
    "................", "................", ".......l........", "....l..g..l.....",
    "...lgl.g.lgl....", "...lgggggggl....", "..lgggggggggl...", ".....g.gg.g.....",
  ],
  flower: [
    "........", "..p.....", ".pcp....", "..p..v..",
    "..s.vcv.", "..s..s..", "..s..s..", "..s..s..",
  ],
  reed: [
    "........", "........", "........", "....b...",
    "....b...", "..b.g...", "..b.g...", "..b.g...",
    "..g.g...", "..g.g...", "..g.gl..", "..gggl..",
    "..gggg..", "..gggg..", "..g.gg..", "..g.gg..",
  ],
  groundcover: [
    "................", "......mmm.......", ".....mouom......", "..mm.mouom.mm...",
    ".moum.mmm.moum..", ".muuom...mouuom.", "..moum.mmm.moum.", "...mm.mouom.mm..",
    "......muuom.....", "..mmm.mouom.mmm.", ".mouom.mmm.mouom", ".muuom.....muuom",
    "..moum.mmm.moum.", "...mm.mouom.mm..", "......mmm.......", "................",
  ],
  bush: [
    "................", "................", "................", "................",
    "................", ".......ll.......", ".....llggll.....", "...llgglgggll...",
    "..lggggggggggl..", ".lgggglgggggggl.", ".ggglgggglggggg.", ".gggggggggggggg.",
    "..gggggggggggg..", "...gggggggggg...", ".....gggggg.....", "......g..g......",
  ],
  shortgrass: [
    "........", "........", "........", "........",
    "........", "..l..l..", ".lgglgg.", ".g.gg.g.",
  ],
};
const GRASS_VARIANTS: Partial<Record<FoliageArtKind, readonly (readonly string[])[]>> = {
  grass: [FOLIAGE_ART.grass,
    ["........", "........", "..l.....", "..g..l..", "l.gg.g..", "g.gg.gl.", "ggggggg.", ".g.gg.g."],
    ["........", "........", ".....l..", ".l...g..", ".g.lgg..", ".g.gggl.", ".gggggg.", ".g.gg.g."],
    ["........", "........", "..l.....", "..gg.l..", ".lgg.g..", ".ggg.gl.", ".gggggg.", ".g.gg.g."],
  ],
  shortgrass: [FOLIAGE_ART.shortgrass,
    ["........", "........", "........", "........", "........", ".l...l..", ".gglggg.", ".g.gg.g."],
    ["........", "........", "........", "........", "........", "...l....", ".glgg.l.", ".g.gg.g."],
    ["........", "........", "........", "........", "........", "....l...", ".lggggl.", ".g.gg.g."],
  ],
};
export const foliageVariantCount = (kind: FoliageArtKind) => GRASS_VARIANTS[kind]?.length ?? 1;
const cardSize = (kind: FoliageArtKind): readonly [number, number] => [
  FOLIAGE_ART[kind][0].length * FOLIAGE_PIXEL_METRES, FOLIAGE_ART[kind].length * FOLIAGE_PIXEL_METRES,
];
export const FOLIAGE_CARD_SIZE: Record<FoliageArtKind, readonly [number, number]> = {
  grass: cardSize("grass"), fern: cardSize("fern"), flower: cardSize("flower"), reed: cardSize("reed"),
  groundcover: cardSize("groundcover"), bush: cardSize("bush"), shortgrass: cardSize("shortgrass"),
};

export function foliagePixels(kind: FoliageArtKind, variant = 0): Uint8Array {
  const rows = GRASS_VARIANTS[kind]?.[variant % foliageVariantCount(kind)] ?? FOLIAGE_ART[kind];
  const width = rows[0].length, rgba = new Uint8Array(width * rows.length * 4);
  rows.forEach((row, y) => {
    if (row.length !== width) throw Error("Foliage pixel rows must share one width.");
    [...row].forEach((symbol, x) => {
      if (symbol === ".") return;
      const color = PALETTE[symbol]; if (color === undefined) throw Error("Unknown foliage pigment.");
      rgba.set([color >> 16 & 255, color >> 8 & 255, color & 255, 255], (y * width + x) * 4);
    });
  });
  return rgba;
}

/** Four small silhouettes share one texture/material; no extra per-card buffers. */
export function foliageAtlas(kind: FoliageArtKind): { data: Uint8Array; width: number; height: number } {
  const rows = FOLIAGE_ART[kind], frameWidth = rows[0].length, height = rows.length, width = frameWidth * foliageVariantCount(kind);
  const data = new Uint8Array(width * height * 4);
  for (let variant = 0; variant < foliageVariantCount(kind); variant++) {
    const pixels = foliagePixels(kind, variant);
    for (let y = 0; y < height; y++) data.set(pixels.subarray(y * frameWidth * 4, (y + 1) * frameWidth * 4), (y * width + variant * frameWidth) * 4);
  }
  return { data, width, height };
}
