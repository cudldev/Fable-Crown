import { parseVox, voxelModel, type VoxelObject } from "./voxel-data";

export interface VoxelDecodeSpec { pitch: number; pivot: readonly number[]; cutHeight?: number }
export function decodeVoxelAsset(buffer: ArrayBuffer, spec: VoxelDecodeSpec) {
  const grid = parseVox(buffer);
  const voxels: VoxelObject = { model: voxelModel(grid, spec.pitch, spec.pivot),
    depleted: spec.cutHeight === undefined ? undefined : voxelModel(grid, spec.pitch, spec.pivot, spec.cutHeight) };
  return { size: grid.size, voxels };
}
