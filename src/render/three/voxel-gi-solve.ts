import { DataUtils } from "three";
import { interpolateGI, rasterizeGISteps, solidAt, traceProbe, type GISolveConfig, type GIWorldSource, type V3 } from "./voxel-gi-core";
import { runSliced, type SliceOptions } from "./work-scheduler";

export type GIPhase = "voxelize" | "trace" | "interpolate" | "pack";
export interface GIProgress { phase: GIPhase; done: number; total: number }

/** Yield points change scheduling only; transport order, precision and atlas layout stay identical. */
export function* solveGISteps(world: GIWorldSource, config: GISolveConfig, progress: (value: GIProgress) => void = () => {}, now = () => performance.now()) {
  const started = now();
  progress({ phase: "voxelize", done: 0, total: 1 });
  const grid = yield* rasterizeGISteps(world, config), voxelizeMs = now() - started;
  const resolution = config.size.map(n => Math.floor((n - 1) / config.stride) + 1) as V3;
  let probes: (Float32Array | null)[] = [];
  const probeStart = now(), bounces = Math.max(1, Math.min(3, Math.floor(config.bounces ?? 1)));
  for (let bounce = 0; bounce < bounces; bounce++) {
    const previous = bounce ? { probes, resolution } : undefined;
    probes = [];
    for (let z = 0; z < resolution[2]; z++) {
      for (let y = 0; y < resolution[1]; y++) for (let x = 0; x < resolution[0]; x++) {
        const p = [x, y, z].map((n, axis) => config.origin[axis] + (n * config.stride + .5) * config.pitch) as V3;
        probes.push(traceProbe(grid, p, config, previous));
        yield;
      }
      progress({ phase: "trace", done: bounce * resolution[2] + z + 1, total: bounces * resolution[2] });
    }
  }
  const probesMs = now() - probeStart, interpolationStart = now();
  // 2x2 sub-volumes with gutters fit WebGL2's minimum 256-texel 3D texture limit.
  const [nx, ny, nz] = config.size, width = 2 * (nx + 2), depth = 2 * (nz + 2), atlas = new Float32Array(width * ny * depth * 4);
  const offset = (coefficient: number, x: number, y: number, z: number) => (((Math.floor(coefficient / 2) * (nz + 2) + z) * ny + y) * width + coefficient % 2 * (nx + 2) + x) * 4;
  const scratch = new Float32Array(13);
  let cells = 0;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      if (++cells % 32 === 0) yield;
      const point = [x, y, z].map((n, axis) => config.origin[axis] + (n + .5) * config.pitch) as V3;
      if (solidAt(grid, point)) continue;
      const value = interpolateGI(grid, point, probes, resolution, config.stride, scratch);
      for (let coefficient = 0; coefficient < 4; coefficient++) {
        const at = offset(coefficient, x + 1, y, z + 1);
        atlas[at] = value[coefficient * 3]; atlas[at + 1] = value[coefficient * 3 + 1]; atlas[at + 2] = value[coefficient * 3 + 2];
        if (coefficient === 0) atlas[at + 3] = value[12];
      }
    }
    progress({ phase: "interpolate", done: z + 1, total: nz });
  }
  for (let coefficient = 0; coefficient < 4; coefficient++) {
    for (let z = 1; z <= nz; z++) {
      for (let y = 0; y < ny; y++) for (const side of [0, nx + 1]) {
        const from = offset(coefficient, side === 0 ? 1 : nx, y, z), to = offset(coefficient, side, y, z);
        atlas.set(atlas.subarray(from, from + 4), to);
      }
      yield;
    }
    for (const side of [0, nz + 1]) for (let y = 0; y < ny; y++) {
      const from = offset(coefficient, 0, y, side === 0 ? 1 : nz), to = offset(coefficient, 0, y, side);
      atlas.set(atlas.subarray(from, from + (nx + 2) * 4), to);
      yield;
    }
  }
  const interpolateMs = now() - interpolationStart, packStart = now();
  const half = new Uint16Array(atlas.length);
  for (let i = 0; i < atlas.length; i += 4096) {
    const end = Math.min(i + 4096, atlas.length);
    for (let at = i; at < end; at++) half[at] = DataUtils.toHalfFloat(atlas[at]);
    progress({ phase: "pack", done: end, total: atlas.length });
    yield;
  }
  let occupied = 0;
  for (let i = 0; i < grid.albedo.length; i++) {
    occupied += Number(grid.albedo[i] !== 0);
    if (i % 4096 === 4095) yield;
  }
  return { data: half, origin: config.origin, size: config.size, pitch: config.pitch,
    stats: { bounces, voxelizeMs, probesMs, interpolateMs, packMs: now() - packStart, totalMs: now() - started, probes: probes.length,
      validProbes: probes.filter(Boolean).length, depletedCount: config.depleted.length, rays: grid.rays, occupied, textureBytes: half.byteLength } };
}

export async function solveGISliced(world: GIWorldSource, config: GISolveConfig, progress?: (value: GIProgress) => void, options: SliceOptions = {}) {
  const result = await runSliced(solveGISteps(world, config, progress, options.now), options);
  if (!result) return;
  return { ...result.value, stats: { ...result.value.stats, ...result.timing } };
}
