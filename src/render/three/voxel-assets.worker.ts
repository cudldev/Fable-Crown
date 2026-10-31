import { decodeVoxelAsset } from "./voxel-decode";

self.onmessage = event => {
  try {
    const result = decodeVoxelAsset(event.data.buffer, event.data.spec);
    const buffers = new Set<ArrayBuffer>();
    for (const model of [result.voxels.model, result.voxels.depleted]) if (model) {
      for (const level of [...model.levels, model.lighting]) for (const array of [level.centers, level.colors, level.ao]) buffers.add(array.buffer as ArrayBuffer);
    }
    postMessage(result, { transfer: [...buffers] });
  } catch (error) { postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
