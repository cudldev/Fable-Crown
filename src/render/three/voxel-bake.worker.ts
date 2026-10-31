import { unpackVoxelBake } from "./voxel-bake-unpack";

self.onmessage = async event => {
  try {
    const { buffer, sourceVersion, decodedBytes, sha256 } = event.data;
    const result = await unpackVoxelBake(buffer, sourceVersion, decodedBytes, sha256);
    const buffers = new Set<ArrayBuffer>();
    for (const asset of result.assets) for (const model of [asset.voxels.model, asset.voxels.depleted]) if (model) {
      for (const level of [...model.levels, model.lighting]) for (const array of [level.centers, level.colors, level.ao]) buffers.add(array.buffer as ArrayBuffer);
      for (const surface of model.surfaces ?? []) {
        for (const array of [surface.positions, surface.normals, surface.colors, surface.ao, surface.indices]) buffers.add(array.buffer as ArrayBuffer);
        if (surface.shadow) for (const array of [surface.shadow.positions, surface.shadow.indices]) buffers.add(array.buffer as ArrayBuffer);
      }
      for (const shadow of model.shadowSurfaces ?? []) if (shadow) for (const array of [shadow.positions, shadow.indices]) buffers.add(array.buffer as ArrayBuffer);
    }
    postMessage(result, { transfer: [...buffers] });
  } catch (error) { postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
