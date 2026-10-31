import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { NearestFilter, NearestMipmapNearestFilter, SRGBColorSpace } from "three";
import { buildTerrainSurface, loadTerrainTiles, parseTerrainTiles, terrainTileChoice, type TerrainTiles, type TerrainWorld } from "../src/render/three/terrain-tiles";
import type { Terrain } from "../src/rpg/types";

const manifest = JSON.parse(readFileSync("public/art3d/terrain/manifest.json", "utf8"));
const bytes = readFileSync("public/art3d/terrain/tiles.bin");
const pack = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const tiles = parseTerrainTiles(manifest, pack);
const world = (width: number, height: number, terrain: Terrain[]): TerrainWorld => ({ width, height, terrain });
const neighbourWorld = (cards: number, diagonals = 0): TerrainWorld => {
  const data: Terrain[] = new Array(9).fill("grass"), cardinal = [1, 5, 7, 3], diagonal = [0, 2, 8, 6];
  for (let bit = 0; bit < 4; bit++) { if (cards & 1 << bit) data[cardinal[bit]] = "dirt"; if (diagonals & 1 << bit) data[diagonal[bit]] = "dirt"; }
  return world(3, 3, data);
};
const cloneTiles = (): TerrainTiles => ({ ...tiles, grids: new Map([...tiles.grids].map(([id, grid]) => [id, { ...grid, cells: grid.cells.slice(), palette: grid.palette.slice() }])) });
const topRGB = (id: string, x: number, y: number) => {
  const grid = tiles.grids.get(id)!, at = (grid.cells[(x * 16 + y) * 8 + 7] - 1) * 4;
  return Array.from(grid.palette.slice(at, at + 4));
};
const pixel = (surface: ReturnType<typeof buildTerrainSurface>, x: number, y: number, sourceX: number, sourceY: number) => {
  const [u, v] = surface.uvAt(x, y), width = surface.stats.width;
  const at = ((Math.round(v * surface.stats.height) + sourceY) * width + Math.round(u * width) + sourceX) * 4;
  return Array.from((surface.texture.image.data as Uint8Array).slice(at, at + 4));
};
afterEach(() => vi.unstubAllGlobals());

test("native terrain pack retains verified flat supports and rejects paths, ranges, missing phases and source frame edits", () => {
  expect(tiles.grids.size).toBe(288); expect(tiles.version).toBe(manifest.version);
  expect(tiles.meanColors.grass.r).toBeGreaterThan(0); expect(tiles.meanColors.grass.g).toBeGreaterThan(tiles.meanColors.grass.b);
  const malformed = (change: (value: typeof manifest) => void) => { const value = structuredClone(manifest); change(value); return value; };
  expect(() => parseTerrainTiles(malformed(value => { value.pack = "../remote.bin"; }), pack)).toThrow(/contract/);
  expect(() => parseTerrainTiles(malformed(value => { value.assets[0].byteOffset = 4; }), pack)).toThrow(/range/);
  expect(() => parseTerrainTiles(malformed(value => { value.variants.grass.pop(); }), pack)).toThrow(/phase/);
  expect(() => parseTerrainTiles(malformed(value => { value.assets[0].pivot = [8, 8, 0]; }), pack)).toThrow(/range/);
  expect(() => parseTerrainTiles(manifest, pack.slice(0, -1))).toThrow(/Truncated/);
  const changed = pack.slice(0); new Uint8Array(changed)[32] = 17;
  expect(() => parseTerrainTiles(manifest, changed)).toThrow(/frame/);
});

test("the loader fetches only the local manifest and native pack, preserving abort signal and rejecting remote pack references", async () => {
  const fetcher = vi.fn(async (input: URL) => new Response(input.pathname.endsWith("manifest.json") ? JSON.stringify(manifest) : bytes, { status: 200 }));
  vi.stubGlobal("fetch", fetcher); const signal = new AbortController().signal;
  expect((await loadTerrainTiles(new URL("http://local.test/Fable-Crown/art3d/terrain/"), signal)).grids.size).toBe(288);
  expect(fetcher.mock.calls.map(args => String(args[0]))).toEqual([`http://local.test/Fable-Crown/art3d/terrain/manifest.json?v=${manifest.version}`, `http://local.test/Fable-Crown/art3d/terrain/tiles.bin?v=${manifest.version}`]);
  expect(fetcher).toHaveBeenNthCalledWith(2, expect.any(URL), { signal });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...manifest, pack: "https://remote.test/tiles.bin" }))));
  await expect(loadTerrainTiles(new URL("http://local.test/"), signal)).rejects.toThrow(/contract/);
});

test("stale cached terrain metadata is rejected before mixing it with this build's native pack", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ ...manifest, version: "0000000000000000" })));
  vi.stubGlobal("fetch", fetcher);
  await expect(loadTerrainTiles(new URL("http://local.test/"), new AbortController().signal)).rejects.toThrow(/cache version/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("world phases preserve native pixel orientation, share repeated atlas variants and reject out-of-world coordinates", () => {
  const surface = buildTerrainSurface(tiles, world(64, 64, new Array(4096).fill("grass")));
  expect(surface.stats.paintedVariants).toBe(16); expect(surface.stats.tiles).toBe(4096);
  expect(surface.uvAt(0, 0)).toEqual(surface.uvAt(4, 4));
  expect(terrainTileChoice(world(2, 2, new Array(4).fill("grass")), 1, 1)!.phase).toBe(13); // mod(-1,4), never a negative array index.
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [3, 3]]) {
    const choice = terrainTileChoice(world(64, 64, new Array(4096).fill("grass")), x, y)!;
    expect(pixel(surface, x, y, 0, 15)).toEqual(topRGB(tiles.variants.grass[choice.phase], 0, 15));
    expect(pixel(surface, x, y, 15, 0)).toEqual(topRGB(tiles.variants.grass[choice.phase], 15, 0));
  }
  expect(terrainTileChoice(world(2, 2, new Array(4).fill("grass")), -1, 1)).toBe(null);
  expect(() => surface.uvAt(-1, 0)).toThrow(/outside/); surface.dispose();
});

test("cardinal/inside-corner rules are deterministic for crossings, opposing edges and multi-material junctions", () => {
  const center = 4;
  for (let cards = 0; cards < 16; cards++) for (let diagonals = 0; diagonals < 16; diagonals++) {
    const map = neighbourWorld(cards, diagonals), first = terrainTileChoice(map, 1, 1)!;
    expect(first.cards).toBe(cards); expect(first).toEqual(terrainTileChoice(map, 1, 1));
    expect(map.terrain[center]).toBe("grass");
  }
  const inside = terrainTileChoice(neighbourWorld(0, 1), 1, 1)!;
  expect(inside.diagonals).toBe(1); expect(terrainTileChoice(neighbourWorld(1, 1), 1, 1)!.diagonals).toBe(0);
  for (const cards of [3, 5, 7, 10, 15]) {
    const map = neighbourWorld(cards), surface = buildTerrainSurface(tiles, map), data = surface.texture.image.data as Uint8Array;
    const uv = surface.uvAt(1, 1);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(data[((Math.round(uv[1] * surface.stats.height) + y) * surface.stats.width + Math.round(uv[0] * surface.stats.width) + x) * 4 + 3]).toBe(255);
    surface.dispose();
  }
  const mixed = world(3, 3, ["grass", "sand", "grass", "grass", "grass", "stone", "grass", "grass", "grass"]);
  expect(terrainTileChoice(mixed, 1, 1)!.pair).toBe("grass-dirt"); // Cardinal earth/paving outranks shore.
});

test("artist-edited native pigment reaches the compact atlas unchanged, while guarded nearest mips never mix materials", () => {
  const edited = cloneTiles();
  for (const [id, grid] of edited.grids) {
    const color = id.startsWith("cobble-") ? [20, 40, 220, 255] : id.startsWith("sand-") ? [220, 200, 20, 255] : null;
    if (color) for (let at = 0; at < 1024; at += 4) grid.palette.set(color, at);
  }
  const surface = buildTerrainSurface(edited, world(2, 1, ["stone", "sand"]));
  expect(surface.texture.magFilter).toBe(NearestFilter); expect(surface.texture.minFilter).toBe(NearestMipmapNearestFilter);
  expect(surface.texture.colorSpace).toBe(SRGBColorSpace); expect(surface.texture.generateMipmaps).toBe(false);
  expect(pixel(surface, 0, 0, 2, 2)).toEqual([20, 40, 220, 255]);
  expect(surface.texture.mipmaps).toHaveLength(5);
  for (const mip of surface.texture.mipmaps as { data: Uint8Array; width: number; height: number }[]) {
    for (let y = 0; y < mip.height; y++) for (let x = 0; x < mip.width; x++) expect(Array.from(mip.data.slice((y * mip.width + x) * 4, (y * mip.width + x) * 4 + 4))).toEqual(x < mip.width / 2 ? [20, 40, 220, 255] : [220, 200, 20, 255]);
    // Even the exact polygon endpoints sample their own slot at every isolated mip.
    for (let tile = 0; tile < 2; tile++) {
      const [u0, v0, u1, v1] = surface.uvAt(tile, 0);
      for (const s of [0, .00001, .03125, .5, .96875, .99999, 1]) for (const t of [0, .5, 1]) {
        const x = Math.floor((u0 + (u1 - u0) * s) * mip.width), y = Math.floor((v0 + (v1 - v0) * t) * mip.height);
        expect(Array.from(mip.data.slice((y * mip.width + x) * 4, (y * mip.width + x) * 4 + 4))).toEqual(tile === 0 ? [20, 40, 220, 255] : [220, 200, 20, 255]);
      }
    }
  }
  expect(surface.stats.width).toBe(32); expect(surface.stats.height).toBe(16);
  expect(surface.stats.textureBytes).toBe(surface.texture.mipmaps.reduce((sum, mip) => sum + (mip as { data: Uint8Array }).data.byteLength, 0));
  let disposed = false; surface.texture.addEventListener("dispose", () => { disposed = true; }); surface.dispose(); expect(disposed).toBe(true);
});

test("fresh bakes observe later edits to the same native palette instead of reusing stale packed cells", () => {
  const edited = cloneTiles(), map = world(1, 1, ["stone"]), first = buildTerrainSurface(edited, map);
  const grid = edited.grids.get(edited.variants.cobble[0])!, at = (grid.cells[7] - 1) * 4;
  const original = pixel(first, 0, 0, 0, 0);
  grid.palette.set([17, 211, 199, 255], at);
  const second = buildTerrainSurface(edited, map);
  expect(pixel(second, 0, 0, 0, 0)).toEqual([17, 211, 199, 255]);
  expect(pixel(first, 0, 0, 0, 0)).toEqual(original);
  first.dispose(); second.dispose();
});

test("optional quiet dirt cleanup is presentation-only and preserves roads, plots and default behavior", () => {
  const data: Terrain[] = new Array(49).fill("grass"), set = (x: number, y: number) => { data[y * 7 + x] = "dirt"; };
  set(1, 1); // Only this isolated interior dirt speck may become visual grass.
  set(3, 1); set(4, 1); // Connected road.
  set(3, 3); set(4, 3); set(3, 4); set(4, 4); // Crop plot.
  set(0, 6); // Incomplete edge-neighbourhood stays unchanged.
  const map = world(7, 7, data), before = data.slice();
  const standard = buildTerrainSurface(tiles, map), quiet = buildTerrainSurface(tiles, map, { quietDirtSpeckles: true });
  expect(standard.presentationTerrain).toBe(data); expect(standard.stats.quietedDirtTiles).toBe(0);
  expect(quiet.presentationTerrain).not.toBe(data); expect(data).toEqual(before); expect(quiet.stats.quietedDirtTiles).toBe(1);
  expect(quiet.presentationTerrain[8]).toBe("grass");
  for (const [x, y] of [[3, 1], [4, 1], [3, 3], [4, 3], [3, 4], [4, 4], [0, 6]]) expect(quiet.presentationTerrain[y * 7 + x]).toBe("dirt");
  standard.dispose(); quiet.dispose();
});

test("authored north and south profiles are preserved without image-space rotation", () => {
  for (const cards of [1, 4]) {
    const map = neighbourWorld(cards), choice = terrainTileChoice(map, 1, 1)!, surface = buildTerrainSurface(tiles, map);
    const id = tiles.variants[cards === 1 ? "grass-dirt-edge" : "grass-dirt-edge-south"][choice.phase];
    const sourceY = cards === 1 ? 15 : 0;
    expect(pixel(surface, 1, 1, 7, sourceY)).toEqual(topRGB(id, 7, sourceY));
    surface.dispose();
  }
});

test("material joins occupy only three native cells and retain authored endpoint and ramp pigment in every direction", () => {
  const samples = [
    { cards: 1, family: "grass-dirt-edge", pixels: [[7, 13, 7, 9], [7, 14, 7, 12], [7, 15, 7, 15]] },
    { cards: 2, family: "grass-dirt-edge", pixels: [[13, 7, 8, 9], [14, 7, 8, 12], [15, 7, 8, 15]] },
    { cards: 4, family: "grass-dirt-edge-south", pixels: [[7, 2, 7, 6], [7, 1, 7, 3], [7, 0, 7, 0]] },
    { cards: 8, family: "grass-dirt-edge", pixels: [[2, 7, 7, 9], [1, 7, 7, 12], [0, 7, 7, 15]] },
  ];
  for (const { cards, family, pixels } of samples) {
    const map = neighbourWorld(cards), choice = terrainTileChoice(map, 1, 1)!, surface = buildTerrainSurface(tiles, map);
    const base = tiles.variants.grass[choice.phase], source = tiles.variants[family][choice.phase];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const inside = cards === 1 ? y < 13 : cards === 2 ? x < 13 : cards === 4 ? y >= 3 : x >= 3;
      if (inside) expect(pixel(surface, 1, 1, x, y)).toEqual(topRGB(base, x, y));
    }
    for (const [x, y, sx, sy] of pixels) expect(pixel(surface, 1, 1, x, y)).toEqual(topRGB(source, sx, sy));
    surface.dispose();
  }
});

test("tight joins meet at all outer and diagonal corners without replacing interior pigment or inventing colors", () => {
  const edited = cloneTiles(), colors: Record<string, number[]> = {
    grass: [21, 51, 31, 255], "grass-dirt-edge": [101, 71, 41, 255], "grass-dirt-edge-south": [111, 81, 51, 255],
    "grass-dirt-outer": [121, 91, 61, 255], "grass-dirt-inner": [131, 101, 71, 255],
  };
  for (const [family, color] of Object.entries(colors)) for (const id of edited.variants[family]) {
    const grid = edited.grids.get(id)!;
    for (let at = 0; at < grid.palette.length; at += 4) grid.palette.set(color, at);
  }
  const corners = [[0, 15], [15, 15], [15, 0], [0, 0]];
  for (let corner = 0; corner < 4; corner++) {
    const map = neighbourWorld(0, 1 << corner), surface = buildTerrainSurface(edited, map);
    let changed = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const color = pixel(surface, 1, 1, x, y);
      if (color.join() !== colors.grass.join()) { changed++; expect(color).toEqual(colors["grass-dirt-inner"]); }
    }
    expect(changed).toBe(9);
    expect(pixel(surface, 1, 1, ...corners[corner] as [number, number])).toEqual(colors["grass-dirt-inner"]);
    surface.dispose();
  }
  const surface = buildTerrainSurface(edited, neighbourWorld(15));
  for (const [x, y] of corners) expect(pixel(surface, 1, 1, x, y)).toEqual(colors["grass-dirt-outer"]);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) expect(pixel(surface, 1, 1, x, y)).toEqual(colors.grass);
  surface.dispose();
});
