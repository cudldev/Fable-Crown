import { expect, test } from "vitest";
import { tileGeometry, gridAudit } from "../tools/voxel-terrain/preview";
import type { VoxelGrid } from "../src/render/three/voxel-data";

test("terrain baking removes interior faces, merges equal faces, preserves scale and outward winding", () => {
  const palette = new Uint8Array(1024); palette.set([128, 160, 80, 255]);
  const grid: VoxelGrid = { size: [2, 2, 2], cells: new Uint8Array(8).fill(1), palette };
  const geometry = tileGeometry(grid, .25, [1, 1, 2]);
  expect(geometry.getAttribute("position").count / 3).toBe(12);
  expect(geometry.boundingBox!.min.toArray()).toEqual([-.25, -.5, -.25]);
  expect(geometry.boundingBox!.max.toArray()).toEqual([.25, 0, .25]);
  const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal");
  for (let i = 0; i < p.count; i += 3) {
    const a = [p.getX(i + 1) - p.getX(i), p.getY(i + 1) - p.getY(i), p.getZ(i + 1) - p.getZ(i)];
    const b = [p.getX(i + 2) - p.getX(i), p.getY(i + 2) - p.getY(i), p.getZ(i + 2) - p.getZ(i)];
    const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    expect(cross[0] * n.getX(i) + cross[1] * n.getY(i) + cross[2] * n.getZ(i)).toBeGreaterThan(0);
  }
  expect(geometry.getAttribute("color").getX(0)).toBeCloseTo(.21586, 4); // 128 sRGB -> linear, once.
  geometry.dispose();
});

test("an open top/negative space remains open and audit reports actual column levels", () => {
  const palette = new Uint8Array(1024); palette.set([150, 150, 150, 255]);
  const cells = new Uint8Array(8).fill(1); cells[1] = 0;
  const grid: VoxelGrid = { size: [2, 2, 2], cells, palette };
  const geometry = tileGeometry(grid, .25, [1, 1, 2]);
  expect(geometry.getAttribute("position").count / 3).toBeGreaterThan(12);
  expect(gridAudit(grid, { id: "test", file: "test.vox", pitch: .25, pivot: [1, 1, 2] })).toMatchObject({ cells: 7, columnTopHeights: [-.25, 0] });
  geometry.dispose();
});
