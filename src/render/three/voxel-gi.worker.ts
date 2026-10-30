import { DataUtils } from "three";
import { giIndex, interpolateGI, rasterizeGI, solidAt, traceProbe, type GISolveConfig, type GIWorldSource, type V3 } from "./voxel-gi-core";

let world: GIWorldSource | undefined, generation = 0;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));

async function solve(config: GISolveConfig, version: number, epoch: number) {
  if (!world) return;
  const started = performance.now(), grid = rasterizeGI(world, config), voxelizeMs = performance.now() - started;
  const resolution = config.size.map(n => Math.floor((n - 1) / config.stride) + 1) as V3;
  const probes: (Float32Array | null)[] = [], probeStart = performance.now();
  for (let z = 0; z < resolution[2]; z++) {
    for (let y = 0; y < resolution[1]; y++) for (let x = 0; x < resolution[0]; x++) {
      const p = [x, y, z].map((n, axis) => config.origin[axis] + (n * config.stride + .5) * config.pitch) as V3;
      probes.push(traceProbe(grid, p, config));
    }
    postMessage({ type: "progress", version, phase: "trace", done: z + 1, total: resolution[2] });
    await pause(); if (epoch !== generation) return;
  }
  const probesMs = performance.now() - probeStart, interpolationStart = performance.now();
  // 2x2 sub-volumes with gutters fit WebGL2's minimum 256-texel 3D texture limit.
  const [nx, ny, nz] = config.size, width = 2 * (nx + 2), depth = 2 * (nz + 2), atlas = new Float32Array(width * ny * depth * 4);
  const offset = (coefficient: number, x: number, y: number, z: number) => (((Math.floor(coefficient / 2) * (nz + 2) + z) * ny + y) * width + coefficient % 2 * (nx + 2) + x) * 4;
  const scratch = new Float32Array(13);
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const point = [x, y, z].map((n, axis) => config.origin[axis] + (n + .5) * config.pitch) as V3;
      if (solidAt(grid, point)) continue;
      const value = interpolateGI(grid, point, probes, resolution, config.stride, scratch);
      for (let coefficient = 0; coefficient < 4; coefficient++) {
        const at = offset(coefficient, x + 1, y, z + 1);
        atlas[at] = value[coefficient * 3]; atlas[at + 1] = value[coefficient * 3 + 1]; atlas[at + 2] = value[coefficient * 3 + 2];
        if (coefficient === 0) atlas[at + 3] = value[12];
      }
    }
    if (z % 4 === 3) { postMessage({ type: "progress", version, phase: "interpolate", done: z + 1, total: nz }); await pause(); if (epoch !== generation) return; }
  }
  for (let coefficient = 0; coefficient < 4; coefficient++) {
    for (let z = 1; z <= nz; z++) for (let y = 0; y < ny; y++) for (const side of [0, nx + 1]) {
      const from = offset(coefficient, side === 0 ? 1 : nx, y, z), to = offset(coefficient, side, y, z);
      atlas.set(atlas.subarray(from, from + 4), to);
    }
    for (const side of [0, nz + 1]) for (let y = 0; y < ny; y++) {
      const from = offset(coefficient, 0, y, side === 0 ? 1 : nz), to = offset(coefficient, 0, y, side);
      atlas.set(atlas.subarray(from, from + (nx + 2) * 4), to);
    }
  }
  const interpolateMs = performance.now() - interpolationStart, packStart = performance.now();
  const half = new Uint16Array(atlas.length); for (let i = 0; i < atlas.length; i++) half[i] = DataUtils.toHalfFloat(atlas[i]);
  if (epoch !== generation) return;
  postMessage({ type: "ready", version, data: half, origin: config.origin, size: config.size, pitch: config.pitch,
    stats: { voxelizeMs, probesMs, interpolateMs, packMs: performance.now() - packStart, totalMs: performance.now() - started, probes: probes.length,
      validProbes: probes.filter(Boolean).length, depletedCount: config.depleted.length, rays: grid.rays, occupied: grid.albedo.reduce((sum, value) => sum + Number(value !== 0), 0), textureBytes: half.byteLength } }, { transfer: [half.buffer] });
}

self.onmessage = event => {
  if (event.data.type === "world") { world = event.data.world; generation++; return; }
  if (event.data.type === "solve") {
    const epoch = ++generation;
    void solve(event.data.config, event.data.version, epoch).catch(error => postMessage({ type: "error", version: event.data.version, message: String(error) }));
  }
};
