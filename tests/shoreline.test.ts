import { expect, test } from "vitest";
import { appendShoreSkirts } from "../src/render/three/shoreline";
import type { Terrain } from "../src/rpg/types";

test("shore faces close the full land/water gap with matching atlas edges and correct winding", () => {
  const world = { width: 3, height: 3, terrain: Array<Terrain>(9).fill("water") }; world.terrain[4] = "sand";
  const arrays = { positions: [] as number[], normals: [] as number[], uvs: [] as number[] };
  expect(appendShoreSkirts(arrays, world, 1, 1, -.055, [.2, .3, .4, .5])).toBe(24);
  expect(arrays.positions).toHaveLength(72); expect(arrays.normals).toHaveLength(72); expect(arrays.uvs).toHaveLength(48);
  const heights = arrays.positions.filter((_, i) => i % 3 === 1); expect(Math.min(...heights)).toBeCloseTo(-.18); expect(Math.max(...heights)).toBe(0);
  for (let at = 0; at < arrays.positions.length; at += 18) {
    const p = arrays.positions, ux = p[at + 3] - p[at], uy = p[at + 4] - p[at + 1], uz = p[at + 5] - p[at + 2], vx = p[at + 6] - p[at], vy = p[at + 7] - p[at + 1], vz = p[at + 8] - p[at + 2];
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    expect(normal.reduce((sum, n, axis) => sum + n * arrays.normals[at + axis], 0)).toBeGreaterThan(0);
  }
  expect(arrays.uvs.slice(0, 6)).toEqual([.4, .5, .4, .5, .2, .5]);
});
test("dry neighbours and world borders do not create faces", () => {
  const arrays = { positions: [] as number[], normals: [] as number[], uvs: [] as number[] };
  expect(appendShoreSkirts(arrays, { width: 1, height: 1, terrain: ["sand"] }, 0, 0, -.055, [0, 0, 1, 1])).toBe(0);
});
