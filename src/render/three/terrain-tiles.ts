import { ClampToEdgeWrapping, Color, DataTexture, NearestFilter, NearestMipmapNearestFilter, RGBAFormat, SRGBColorSpace } from "three";
import type { Terrain } from "../../rpg/types";
import { parseVox, type VoxelGrid } from "./voxel-data";
import { TERRAIN_VERSION } from "./terrain-version";

type DryTerrain = Exclude<Terrain, "water">;
type Family = "grass" | "dirt" | "cobble" | "sand";
interface TerrainAsset { id: string; file: string; pitch: number; pivot: number[]; shape: "flat" | "stair"; phase: number[]; byteOffset: number; byteLength: number; cells?: number }
interface TerrainManifest { version: string; style: string; pack: string; variantPeriod: number; variants: Record<string, string[]>; assets: TerrainAsset[] }
export interface TerrainTiles {
  version: string; style: string; variantPeriod: number; grids: Map<string, VoxelGrid>; variants: Record<string, string[]>;
  /** Linear diffuse averages, for the coarse GI ground field; no atlas-centre sampling. */
  meanColors: Record<DryTerrain, Color>;
}
export interface TerrainWorld { width: number; height: number; terrain: readonly Terrain[] }
export interface TerrainTileChoice { family: Family; phase: number; pair: string; cards: number; diagonals: number; key: string }
export interface TerrainSurface {
  texture: DataTexture;
  /** Optional visual cleanup only; never use this array for collision or simulation. */
  presentationTerrain: readonly Terrain[];
  /** Native source XY rectangle. World north (smaller world Y/Z) uses v1. */
  uvAt(x: number, y: number): [number, number, number, number];
  stats: { textureBytes: number; sourceModules: number; paintedVariants: number; width: number; height: number; tiles: number; quietedDirtTiles: number };
  dispose(): void;
}
const index = (x: number, y: number, z: number) => (x * 16 + y) * 8 + z;
const mod = (n: number, p: number) => ((n % p) + p) % p;
const families: Family[] = ["grass", "dirt", "cobble", "sand"];
const requiredFamilies = [...families, ...["grass-dirt", "grass-sand", "dirt-cobble"].flatMap(pair => ["edge", "edge-south", "outer", "inner"].map(shape => pair + "-" + shape))];
const materialFamily = (terrain: DryTerrain): Family => terrain === "stone" ? "cobble" : terrain;

function manifestValue(value: unknown): TerrainManifest {
  if (!value || typeof value !== "object") throw Error("Invalid native terrain manifest.");
  const manifest = value as TerrainManifest;
  if (typeof manifest.version !== "string" || !/^[a-z0-9-]{8,64}$/.test(manifest.version) || typeof manifest.style !== "string" || !/^[a-z0-9-]+$/.test(manifest.style) || manifest.pack !== "tiles.bin" || manifest.variantPeriod !== 4 || !Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.length > 1024 || !manifest.variants || typeof manifest.variants !== "object" || Array.isArray(manifest.variants)) throw Error("Invalid native terrain manifest contract.");
  const ids = new Set<string>(); let cursor = 0;
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.id !== "string" || !/^[a-z0-9-]+$/.test(asset.id) || ids.has(asset.id) || asset.file !== asset.id + ".vox" || asset.pitch !== .0625 || !["flat", "stair"].includes(asset.shape) || !Array.isArray(asset.pivot) || !asset.pivot.every(Number.isFinite) || asset.pivot.join(",") !== (asset.shape === "flat" ? "8,8,8" : "8,8,0") || !Array.isArray(asset.phase) || asset.phase.length !== 2 || asset.phase.some(n => !Number.isInteger(n) || n < 0 || n > 3) || !Number.isSafeInteger(asset.byteOffset) || asset.byteOffset !== cursor || !Number.isSafeInteger(asset.byteLength) || asset.byteLength < 20 || asset.byteLength > 20000) throw Error("Invalid native terrain asset/pack range.");
    ids.add(asset.id); cursor += asset.byteLength;
  }
  if (cursor > 32 * 1024 * 1024) throw Error("Native terrain pack is too large.");
  for (const family of requiredFamilies) {
    const variants = manifest.variants[family];
    if (!Array.isArray(variants) || variants.length !== 16 || new Set(variants).size !== 16 || variants.some((id, phase) => !ids.has(id) || manifest.assets.find(asset => asset.id === id)!.shape !== "flat" || manifest.assets.find(asset => asset.id === id)!.phase.join(",") !== [phase % 4, Math.floor(phase / 4)].join(","))) throw Error("Missing native terrain phase family: " + family);
  }
  return manifest;
}

/** Parse the local delivery pack; each range is still an exact editable VOX150 source. */
export function parseTerrainTiles(value: unknown, pack: ArrayBuffer): TerrainTiles {
  const manifest = manifestValue(value), last = manifest.assets[manifest.assets.length - 1];
  if (last.byteOffset + last.byteLength !== pack.byteLength) throw Error("Truncated or surplus native terrain pack.");
  const grids = new Map<string, VoxelGrid>();
  for (const asset of manifest.assets) {
    const grid = parseVox(pack.slice(asset.byteOffset, asset.byteOffset + asset.byteLength));
    if (grid.size.join(",") !== "16,16,8") throw Error("Native terrain source frame changed: " + asset.id);
    let count = 0;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      let top = 0;
      for (let z = 0; z < 8; z++) {
        const id = grid.cells[index(x, y, z)]; if (!id) continue;
        count++; top = z + 1;
        if (grid.palette[(id - 1) * 4 + 3] !== 255) throw Error("Native terrain supports opaque pigment only.");
      }
      const expected = asset.shape === "flat" ? 8 : (Math.floor(x / 4) + 1) * 2;
      if (top !== expected) throw Error("Native terrain support plane changed: " + asset.id);
    }
    if (asset.cells !== undefined && asset.cells !== count) throw Error("Native terrain source metadata is stale.");
    grids.set(asset.id, grid);
  }
  const meanColors = {} as Record<DryTerrain, Color>;
  for (const terrain of ["grass", "dirt", "stone", "sand"] as const) {
    const mean = new Color(0, 0, 0), color = new Color();
    for (const id of manifest.variants[materialFamily(terrain)]) {
      const grid = grids.get(id)!;
      for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
        const at = (grid.cells[index(x, y, 7)] - 1) * 4;
        mean.add(color.setRGB(grid.palette[at] / 255, grid.palette[at + 1] / 255, grid.palette[at + 2] / 255, SRGBColorSpace));
      }
    }
    meanColors[terrain] = mean.multiplyScalar(1 / 4096);
  }
  return { version: manifest.version, style: manifest.style, variantPeriod: 4, grids, variants: manifest.variants, meanColors };
}

export async function loadTerrainTiles(base: URL, signal: AbortSignal): Promise<TerrainTiles> {
  const manifestURL = new URL("manifest.json", base); manifestURL.searchParams.set("v", TERRAIN_VERSION);
  const response = await fetch(manifestURL, { signal });
  if (!response.ok) throw Error("Native terrain manifest unavailable.");
  const value: unknown = await response.json(), manifest = manifestValue(value);
  if (manifest.version !== TERRAIN_VERSION) throw Error("Native terrain cache version differs from this build.");
  const packURL = new URL(manifest.pack, base); packURL.searchParams.set("v", TERRAIN_VERSION);
  const packed = await fetch(packURL, { signal });
  if (!packed.ok) throw Error("Native terrain VOX pack unavailable.");
  const buffer = await packed.arrayBuffer();
  return parseTerrainTiles(value, buffer);
}

/** N/E/S/W bits, followed by NW/NE/SE/SW. Only the latter need an inside-corner stamp. */
export function terrainTileChoice(world: TerrainWorld, x: number, y: number): TerrainTileChoice | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
  const centre = world.terrain[y * world.width + x];
  if (!centre || centre === "water") return null;
  const get = (dx: number, dy: number): Terrain => x + dx < 0 || y + dy < 0 || x + dx >= world.width || y + dy >= world.height ? centre : world.terrain[(y + dy) * world.width + x + dx];
  const around = [get(0, -1), get(1, 0), get(0, 1), get(-1, 0)], corners = [get(-1, -1), get(1, -1), get(1, 1), get(-1, 1)];
  const hardEarth = (kind: Terrain) => kind === "dirt" || kind === "stone", shore = (kind: Terrain) => kind === "sand" || kind === "water";
  let pair = "", target: (terrain: Terrain) => boolean = () => false;
  // Cardinal neighbours take precedence; within each tier earth/paving beats shore.
  if (centre === "grass") {
    const candidates = around.some(hardEarth) ? "earth" : around.some(shore) ? "shore" : corners.some(hardEarth) ? "earth" : corners.some(shore) ? "shore" : "";
    if (candidates) { pair = candidates === "earth" ? "grass-dirt" : "grass-sand"; target = candidates === "earth" ? hardEarth : shore; }
  } else if (centre === "dirt" && [...around, ...corners].includes("stone")) { pair = "dirt-cobble"; target = kind => kind === "stone"; }
  const cards = around.reduce((mask, kind, i) => mask | (target(kind) ? 1 << i : 0), 0);
  const adjacent = [9, 3, 6, 12];
  const diagonals = corners.reduce((mask, kind, i) => mask | (target(kind) && !(cards & adjacent[i]) ? 1 << i : 0), 0);
  const family = materialFamily(centre), phase = mod(-y, 4) * 4 + mod(x, 4);
  return { family, phase, pair, cards, diagonals, key: [family, phase, pair, cards, diagonals].join(":") };
}

function sourcePixel(top: Uint32Array, x: number, y: number, turns = 0, profile = 0): number {
  let a = turns === 1 ? 15 - y : turns === 2 ? 15 - x : turns === 3 ? y : x;
  let b = turns === 1 ? x : turns === 2 ? 15 - y : turns === 3 ? 15 - x : y;
  // Compress the authored six-cell pigment ramp into three native cells (0.1875m).
  // Nearest source samples retain its palette and uneven edge; tile interiors keep
  // their original pigment coordinates instead of stretching the entire artwork.
  if (profile === 1) b = b * 3 - 30; // North profile: 13,14,15 -> 9,12,15.
  else if (profile === 2) b *= 3; // Independently authored south profile.
  else if (profile === 3) { a *= 3; b = b * 3 - 30; } // Native NW corner.
  return top[b * 16 + a];
}
const edgeReach = (edge: number, x: number, y: number) => edge === 0 ? y : edge === 1 ? x : edge === 2 ? 15 - y : 15 - x;
const adjacentCorners = [9, 3, 6, 12];
const joinStart = 12;

/** Paint combinations by choosing authored native cells, never filtering or inventing colors. */
function paintTile(tiles: TerrainTiles, choice: TerrainTileChoice, topCache: Map<string, Uint32Array>): Uint8Array {
  const grid = (family: string) => {
    const id = tiles.variants[family][choice.phase]; let top = topCache.get(id);
    if (!top) {
      const source = tiles.grids.get(id)!; top = new Uint32Array(256);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const at = (source.cells[index(x, y, 7)] - 1) * 4;
        top[y * 16 + x] = (source.palette[at] | source.palette[at + 1] << 8 | source.palette[at + 2] << 16 | 255 << 24) >>> 0;
      }
      topCache.set(id, top);
    }
    return top;
  };
  const base = grid(choice.family), north = choice.pair ? grid(choice.pair + "-edge") : base, south = choice.pair ? grid(choice.pair + "-edge-south") : base;
  const outer = choice.pair ? grid(choice.pair + "-outer") : base, inner = choice.pair ? grid(choice.pair + "-inner") : base;
  const data = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let source = base, turns = 0, score = joinStart, profile = 0;
    for (let edge = 0; edge < 4; edge++) if (choice.cards & 1 << edge && edgeReach(edge, x, y) > score) {
      score = edgeReach(edge, x, y); source = edge === 2 ? south : north; turns = edge === 2 ? 0 : edge; profile = edge === 2 ? 2 : 1;
    }
    for (let corner = 0; corner < 4; corner++) {
      const a = corner < 2 ? 0 : 2, b = corner === 0 || corner === 3 ? 3 : 1;
      const cornerReach = Math.min(edgeReach(a, x, y), edgeReach(b, x, y));
      const isOuter = (choice.cards & adjacentCorners[corner]) === adjacentCorners[corner];
      if (cornerReach > joinStart && isOuter) { source = outer; turns = corner; profile = 3; }
      else if (cornerReach > score && choice.diagonals & 1 << corner) { score = cornerReach; source = inner; turns = corner; profile = 3; }
    }
    const pixel = sourcePixel(source, x, y, turns, profile), at = (y * 16 + x) * 4;
    data[at] = pixel & 255; data[at + 1] = pixel >>> 8 & 255; data[at + 2] = pixel >>> 16 & 255; data[at + 3] = 255;
  }
  return data;
}

const linear = Array.from({ length: 256 }, (_, n) => { const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
const encode = (v: number) => Math.round(255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055));
function shrink(data: Uint8Array, size: number): Uint8Array {
  const output = new Uint8Array(size * size);
  const small = size / 2;
  for (let y = 0; y < small; y++) for (let x = 0; x < small; x++) {
    for (let channel = 0; channel < 3; channel++) {
      let sum = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) sum += linear[data[((y * 2 + j) * size + x * 2 + i) * 4 + channel]];
      output[(y * small + x) * 4 + channel] = encode(sum / 4);
    }
    output[(y * small + x) * 4 + 3] = 255;
  }
  return output;
}
const power2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

export function buildTerrainSurface(tiles: TerrainTiles, world: TerrainWorld, options: { quietDirtSpeckles?: boolean } = {}): TerrainSurface {
  if (!Number.isInteger(world.width) || !Number.isInteger(world.height) || world.width < 1 || world.height < 1 || world.width * world.height > 1_048_576 || world.terrain.length !== world.width * world.height) throw Error("Invalid terrain surface dimensions.");
  let presentationTerrain = world.terrain, quietedDirtTiles = 0;
  if (options.quietDirtSpeckles) {
    const copy = world.terrain.slice();
    // Read only original neighbours, so the cleanup cannot spread or erase connected paths/plots.
    for (let y = 1; y < world.height - 1; y++) for (let x = 1; x < world.width - 1; x++) {
      if (world.terrain[y * world.width + x] !== "dirt") continue;
      let isolated = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && world.terrain[(y + dy) * world.width + x + dx] !== "grass") isolated = false;
      if (isolated) { copy[y * world.width + x] = "grass"; quietedDirtTiles++; }
    }
    presentationTerrain = copy;
  }
  const layout: TerrainWorld = presentationTerrain === world.terrain ? world : { width: world.width, height: world.height, terrain: presentationTerrain };
  const choices: TerrainTileChoice[] = [], lookup = new Map<string, number>(), slots = new Int32Array(world.terrain.length).fill(-1);
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    if (!["grass", "dirt", "stone", "sand", "water"].includes(world.terrain[y * world.width + x])) throw Error("Invalid terrain material.");
    const choice = terrainTileChoice(layout, x, y); if (!choice) continue;
    let slot = lookup.get(choice.key);
    if (slot === undefined) { slot = choices.length; choices.push(choice); lookup.set(choice.key, slot); }
    slots[y * world.width + x] = slot;
  }
  if (choices.length > 4096) throw Error("Too many native terrain atlas variants.");
  const cols = power2(Math.sqrt(Math.max(1, choices.length))), rows = power2(Math.ceil(Math.max(1, choices.length) / cols));
  const width = cols * 16, height = rows * 16;
  const mipmaps = Array.from({ length: 5 }, (_, level) => ({ data: new Uint8Array((width >> level) * (height >> level) * 4), width: width >> level, height: height >> level }));
  // Per-bake cache: editor changes to cells/palettes are visible to every fresh bake.
  const topCache = new Map<string, Uint32Array>();
  choices.forEach((choice, slot) => {
    let data = paintTile(tiles, choice, topCache), size = 16;
    for (let level = 0; level < 5; level++) {
      const cell = 16 >> level, mip = mipmaps[level];
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const at = (((Math.floor(slot / cols) * cell + y) * mip.width) + slot % cols * cell + x) * 4;
        const source = (y * size + x) * 4;
        mip.data[at] = data[source]; mip.data[at + 1] = data[source + 1]; mip.data[at + 2] = data[source + 2]; mip.data[at + 3] = data[source + 3];
      }
      if (size > 1) { data = shrink(data, size); size /= 2; }
    }
  });
  const texture = new DataTexture(mipmaps[0].data, width, height, RGBAFormat);
  texture.name = "native-vox-terrain-atlas"; texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter; texture.minFilter = NearestMipmapNearestFilter;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping; texture.generateMipmaps = false; texture.mipmaps = mipmaps;
  texture.needsUpdate = true;
  return {
    texture, presentationTerrain,
    uvAt(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= world.width || y >= world.height) throw Error("Terrain UV outside world.");
      const slot = slots[y * world.width + x]; if (slot < 0) throw Error("Water uses its own material.");
      // Nearest sampling needs a tiny guard, not8px gutters. Slots stay aligned at all five mips.
      const guard = 1 / 64, sx = slot % cols * 16, sy = Math.floor(slot / cols) * 16;
      return [(sx + guard) / width, (sy + guard) / height, (sx + 16 - guard) / width, (sy + 16 - guard) / height];
    },
    stats: { textureBytes: mipmaps.reduce((sum, mip) => sum + mip.data.byteLength, 0), sourceModules: tiles.grids.size, paintedVariants: choices.length, width, height, tiles: slots.reduce((count, slot) => count + Number(slot >= 0), 0), quietedDirtTiles },
    dispose() { texture.dispose(); },
  };
}
