import { describe, expect, test } from "vitest";
import { interpolateGI, packRGB, rasterizeGI, solidAt, traceGI, traceProbe, triangleBoxOverlap, visibleGI, type GIObjectSource, type GISolveConfig, type GIWorldSource } from "../src/render/three/voxel-gi-core";
import { surfaceLevel, type VoxelGrid } from "../src/render/three/voxel-data";

const config = (changes: Partial<GISolveConfig> = {}): GISolveConfig => ({ origin: [-4, 0, -4], size: [16, 12, 16], pitch: .5, stride: 4, rays: 128, sunDirection: [-Math.SQRT1_2, Math.SQRT1_2, 0], sunColor: [1, 1, 1], skyColor: [1, 1, 1], sunPower: 0, skyPower: 0, lamps: [], depleted: [], ...changes });
const source = (boxes: number[], depleted?: number[]): GIObjectSource => ({ id: "test", bounds: [-4, 0, -4, 4, 6, 4], triangles: new Float32Array(), availableTriangles: new Float32Array(), depletedTriangles: new Float32Array(), boxes: { available: new Float32Array(boxes), depleted: depleted ? new Float32Array(depleted) : undefined } });
const world = (objects: GIObjectSource[]): GIWorldSource => ({ objects, ground: new Uint32Array(64).fill(packRGB(.2, .2, .2)), width: 8, height: 8 });

describe("cached voxel diffuse GI and AO", () => {
  test("AO distance ignores distant blockers without shortening colored-light transport", () => {
    const boxes: number[] = [];
    for (let y = 0; y < 6; y++) for (let z = -3; z <= 3; z++) boxes.push(2.25, (y + .5) * .5, z * .5, .5, 1, .05, .05);
    const geometry = world([source(boxes)]), short = config({ aoDistance: .5, sunPower: 2 }), long = config({ aoDistance: 8, sunPower: 2 });
    const a = traceProbe(rasterizeGI(geometry, short), [0, 1, 0], short)!, b = traceProbe(rasterizeGI(geometry, long), [0, 1, 0], long)!;
    expect(a[12]).toBeGreaterThan(b[12]); expect(a[12]).toBeCloseTo(1);
    expect([...a.slice(0, 12)]).toEqual([...b.slice(0, 12)]);
  });
  test("triangle rasterization tests the actual surface rather than filling its whole AABB", () => {
    const triangle = [0, 0, 0, 2, 0, 0, 0, 2, 0];
    expect(triangleBoxOverlap(triangle, [.5, .5, 0], .1)).toBe(true);
    expect(triangleBoxOverlap(triangle, [1.9, 1.9, 0], .1)).toBe(false);
    expect(triangleBoxOverlap(triangle, [.5, .5, .3], .1)).toBe(false);
  });

  test("DDA finds walls, ground and rays starting outside the field", () => {
    const grid = rasterizeGI(world([source([1.25, 1.25, .25, .5, 1, .1, .1])]), config());
    const hit = traceGI(grid, [0, 1.25, .25], [1, 0, 0]);
    expect(hit?.distance).toBeCloseTo(1); expect(hit?.normal).toEqual([-1, 0, 0]); expect(hit?.color[0]).toBe(1);
    expect(traceGI(grid, [0, 2, 0], [0, -1, 0])?.distance).toBeCloseTo(2);
    expect(traceGI(grid, [6, 1.25, .25], [-1, 0, 0])?.normal).toEqual([1, 0, 0]);
  });

  test("a sealed room blocks sky and sun; opening the roof admits light", () => {
    const walls: number[] = [], roof: number[] = [];
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 0; y < 6; y++) {
      const cell = [x * .5, (y + .5) * .5, z * .5, .5, .5, .5, .5];
      if (Math.abs(x) === 3 || Math.abs(z) === 3) walls.push(...cell);
      else if (y === 5) roof.push(...cell);
    }
    const settings = config({ sunPower: 2, skyPower: 1 });
    const closed = traceProbe(rasterizeGI(world([source([...walls, ...roof])]), settings), [0, 1, 0], settings)!;
    const open = traceProbe(rasterizeGI(world([source(walls)]), settings), [0, 1, 0], settings)!;
    expect(closed[12]).toBe(0); expect(Math.max(...closed.slice(0, 12))).toBeLessThan(.00001);
    expect(open[12]).toBeGreaterThan(.2); expect(open[0]).toBeGreaterThan(0);
  });

  test("colored sun bounce is transported through geometry, not a painted ambient tint", () => {
    const boxes: number[] = [];
    for (let y = 0; y < 5; y++) for (let z = -2; z <= 2; z++) boxes.push(1.25, (y + .5) * .5, z * .5, .5, 1, .02, .02);
    const geometry = world([source(boxes)]), lit = config({ sunPower: 3 }), dark = config(); geometry.ground.fill(packRGB(0, 0, 0));
    const a = traceProbe(rasterizeGI(geometry, lit), [0, 1, 0], lit)!;
    const b = traceProbe(rasterizeGI(geometry, dark), [0, 1, 0], dark)!;
    const control = world([source(boxes.map((value, i) => i % 7 >= 4 ? 0 : value))]); control.ground.fill(packRGB(0, 0, 0));
    const neutral = traceProbe(rasterizeGI(control, lit), [0, 1, 0], lit)!;
    expect(a[0] - neutral[0]).toBeGreaterThan(.1); expect(a[0] - neutral[0]).toBeGreaterThan((a[1] - neutral[1]) * 10); expect(b[0]).toBe(0);
    const lamp = config({ lamps: [{ position: [-.5, 2, 0], color: [1, 1, 1], intensity: 25, distance: 6 }] });
    expect(traceProbe(rasterizeGI(geometry, lamp), [0, 1, 0], lamp)![0]).toBeGreaterThan(.05);
  });

  test("visibility-weighted interpolation rejects a bright probe through a wall", () => {
    const settings = config({ origin: [-2, 0, -2], size: [8, 8, 8] });
    const grid = rasterizeGI(world([source([-.25, .25, -1.75, .5, 1, 1, 1])]), settings);
    const dark = new Float32Array(13), bright = new Float32Array(13).fill(1);
    expect(visibleGI(grid, [-.6, .25, -1.75], [.25, .25, -1.75])).toBe(false);
    const sample = interpolateGI(grid, [-.6, .25, -1.75], [dark, bright], [2, 1, 1], 4);
    expect(Math.max(...sample)).toBe(0);
  });

  test("harvest invalidation changes the lighting occupancy with the same source", () => {
    const geometry = world([source([.25, 1.25, .25, .5, .5, .3, .1], [.25, .25, .25, .5, .5, .3, .1])]);
    expect(solidAt(rasterizeGI(geometry, config()), [.25, 1.25, .25])).toBe(true);
    const cut = rasterizeGI(geometry, config({ depleted: ["test"] }));
    expect(solidAt(cut, [.25, 1.25, .25])).toBe(false); expect(solidAt(cut, [.25, .25, .25])).toBe(true);
  });

  test("local AO darkens only obstructed corners and leaves diffuse values untouched", () => {
    const grid: VoxelGrid = { size: [3, 3, 3], cells: new Uint8Array(27), palette: new Uint8Array([160, 100, 50, 255]) };
    const at = (x: number, y: number, z: number) => (x * 3 + y) * 3 + z;
    grid.cells[at(1, 1, 1)] = 1;
    const isolated = surfaceLevel(grid, 1, [0, 0, 0]); expect([...isolated.ao].every(value => value === 255)).toBe(true);
    grid.cells[at(2, 1, 2)] = 1; grid.cells[at(1, 2, 2)] = 1;
    const crowded = surfaceLevel(grid, 1, [0, 0, 0]), cell = Array.from({ length: crowded.count }, (_, i) => i).find(i => crowded.centers[i * 3] === 1.5 && crowded.centers[i * 3 + 1] === 1.5 && crowded.centers[i * 3 + 2] === -1.5)!;
    expect(crowded.ao[cell * 24 + 5 * 4 + 3]).toBeLessThan(128);
    expect([...crowded.colors.slice(cell * 3, cell * 3 + 3)]).toEqual([...isolated.colors]);
  });
});
