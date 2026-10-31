import { DataUtils } from "three";
import { expect, test, vi } from "vitest";
import { interpolateGI, packRGB, rasterizeGI, solidAt, traceProbe, type GISolveConfig, type GIWorldSource, type V3 } from "../src/render/three/voxel-gi-core";
import { solveGISliced, type GIPhase } from "../src/render/three/voxel-gi-solve";
import { runSliced } from "../src/render/three/work-scheduler";

const config: GISolveConfig = { origin: [0, 0, 0], size: [8, 6, 8], stride: 2, pitch: .5, rays: 16,
  sunDirection: [-Math.SQRT1_2, Math.SQRT1_2, 0], sunColor: [1, .8, .6], skyColor: [.5, .6, .8], sunPower: 2, skyPower: .5, depleted: [], lamps: [] };
const world: GIWorldSource = { width: 8, height: 8, ground: new Uint32Array(64).fill(packRGB(.7, .5, .3)), objects: [{ id: "wall", bounds: [2, 0, 0, 2.5, 3, 4],
  triangles: new Float32Array([2.1, 0, 0, 2.1, 3, 0, 2.1, 0, 4, .8, .1, .1, .4, 0, 0]),
  availableTriangles: new Float32Array(), depletedTriangles: new Float32Array(), boxes: { available: new Float32Array([2.25, 1.5, 2, 1, .6, .3, .1]), depleted: new Float32Array() } }] };

/** Original uninterrupted atlas construction, independent of the sliced traversal/packing. */
function reference(settings: GISolveConfig) {
  const grid = rasterizeGI(world, settings), resolution = settings.size.map(n => Math.floor((n - 1) / settings.stride) + 1) as V3;
  let probes: (Float32Array | null)[] = [];
  for (let bounce = 0; bounce < (settings.bounces ?? 1); bounce++) {
    const previous = bounce ? { probes, resolution } : undefined;
    probes = [];
    for (let z = 0; z < resolution[2]; z++) for (let y = 0; y < resolution[1]; y++) for (let x = 0; x < resolution[0]; x++)
      probes.push(traceProbe(grid, [x, y, z].map((n, axis) => settings.origin[axis] + (n * settings.stride + .5) * settings.pitch) as V3, settings, previous));
  }
  const [nx, ny, nz] = settings.size, width = 2 * (nx + 2), depth = 2 * (nz + 2), atlas = new Float32Array(width * ny * depth * 4);
  const offset = (coefficient: number, x: number, y: number, z: number) => (((Math.floor(coefficient / 2) * (nz + 2) + z) * ny + y) * width + coefficient % 2 * (nx + 2) + x) * 4;
  const scratch = new Float32Array(13);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const point = [x, y, z].map((n, axis) => settings.origin[axis] + (n + .5) * settings.pitch) as V3;
    if (solidAt(grid, point)) continue;
    const value = interpolateGI(grid, point, probes, resolution, settings.stride, scratch);
    for (let c = 0; c < 4; c++) {
      const at = offset(c, x + 1, y, z + 1);
      atlas.set(value.subarray(c * 3, c * 3 + 3), at);
      if (c === 0) atlas[at + 3] = value[12];
    }
  }
  for (let c = 0; c < 4; c++) {
    for (let z = 1; z <= nz; z++) for (let y = 0; y < ny; y++) for (const x of [0, nx + 1]) {
      const from = offset(c, x ? nx : 1, y, z); atlas.set(atlas.subarray(from, from + 4), offset(c, x, y, z));
    }
    for (const z of [0, nz + 1]) for (let y = 0; y < ny; y++) {
      const from = offset(c, 0, y, z ? nz : 1); atlas.set(atlas.subarray(from, from + (nx + 2) * 4), offset(c, 0, y, z));
    }
  }
  return Uint16Array.from(atlas, value => DataUtils.toHalfFloat(value));
}

test("sliced transport preserves every half-float atlas value for 1/2/3 bounces and depletion", async () => {
  for (const bounces of [1, 2, 3]) for (const depleted of [[], ["wall"]]) {
    let clock = 0, yields = 0;
    const settings = { ...config, bounces, depleted };
    const result = await solveGISliced(world, settings, undefined, { budgetMs: 1, now: () => clock += .25, pause: async () => { yields++; } });
    expect(result?.data).toEqual(reference(settings));
    expect(yields).toBeGreaterThan(2);
    expect(result?.stats.yields).toBe(yields);
    expect(result?.stats.textureBytes).toBe(result?.data.byteLength);
    expect(result?.stats.maxSliceMs).toBeGreaterThan(0);
  }
});

test("obsolete solves stop during each expensive phase and never publish a partial field", async () => {
  for (const stopPhase of ["voxelize", "trace", "interpolate", "pack"] as const) {
    let clock = 0, phase: GIPhase = "voxelize", current = true, cancelled = false;
    const result = await solveGISliced(world, config, progress => { phase = progress.phase; }, {
      budgetMs: 1, now: () => clock += .25, isCurrent: () => current,
      pause: async () => { if (phase === stopPhase) { current = false; cancelled = true; } },
    });
    expect(cancelled).toBe(true); expect(result).toBeUndefined();
  }
});

test("scheduler closes cancelled generators and surfaces async errors", async () => {
  let released = false, current = true, clock = 0;
  function* steps() { try { while (true) yield; } finally { released = true; } }
  expect(await runSliced(steps(), { now: () => clock++, budgetMs: 1, isCurrent: () => current, pause: async () => { current = false; } })).toBeUndefined();
  expect(released).toBe(true);
  released = false;
  await expect(runSliced(steps(), { now: () => clock++, budgetMs: 1, pause: async () => { throw Error("yield failed"); } })).rejects.toThrow("yield failed");
  expect(released).toBe(true);
});

test("worker reports a rejected solve and accepts a following valid world", async () => {
  const scope: { onmessage?: (event: { data: unknown }) => void } = {};
  const sent: { type: string; version: number; data?: Uint16Array }[] = [];
  vi.stubGlobal("self", scope); vi.stubGlobal("postMessage", (message: typeof sent[number]) => { sent.push(message); });
  try {
    await import("../src/render/three/voxel-gi.worker");
    scope.onmessage?.({ data: { type: "world", world } });
    scope.onmessage?.({ data: { type: "solve", version: 1, config: { ...config, size: [-1, 1, 1] } } });
    await vi.waitFor(() => expect(sent.some(message => message.type === "error" && message.version === 1)).toBe(true));
    scope.onmessage?.({ data: { type: "world", world } });
    scope.onmessage?.({ data: { type: "solve", version: 2, config } });
    await vi.waitFor(() => expect(sent.some(message => message.type === "ready" && message.version === 2)).toBe(true));
    expect(sent.find(message => message.type === "ready")?.data).toEqual(reference(config));
    scope.onmessage?.({ data: { type: "solve", version: 3, config: { ...config, size: [80, 16, 80], rays: 128 } } });
    scope.onmessage?.({ data: { type: "world", world: { ...world, objects: [] } } });
    scope.onmessage?.({ data: { type: "solve", version: 4, config } });
    await vi.waitFor(() => expect(sent.some(message => message.type === "ready" && message.version === 4)).toBe(true));
    expect(sent.some(message => message.type === "ready" && message.version === 3)).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});
