import { parseVox, voxelModel, type VoxelObject } from "./voxel-data";
import { bakeVoxelModelSurfaces } from "./voxel-surface";

export interface VoxelDecodeSpec { pitch: number; pivot: readonly number[]; cutHeight?: number }
export function decodeVoxelAsset(buffer: ArrayBuffer, spec: VoxelDecodeSpec) {
  const grid = parseVox(buffer);
  const voxels: VoxelObject = { model: voxelModel(grid, spec.pitch, spec.pivot),
    depleted: spec.cutHeight === undefined ? undefined : voxelModel(grid, spec.pitch, spec.pivot, spec.cutHeight) };
  bakeVoxelModelSurfaces(grid, voxels.model, spec.pitch, spec.pivot);
  if (voxels.depleted) bakeVoxelModelSurfaces(grid, voxels.depleted, spec.pitch, spec.pivot, spec.cutHeight);
  return { size: grid.size, voxels };
}
