import { decodeVoxelAsset } from "./voxel-decode";
import { composeVoxelModels } from "./voxel-data";
import type { VoxelAssetSpec } from "./voxel-assets";
import type { BakedVoxelAssets } from "./voxel-bake";

/** Build tools only. Gameplay imports the finished package, never this compiler. */
export function bakeVoxelAssets(sourceVersion: string, inputs: readonly { spec: VoxelAssetSpec; buffer: ArrayBuffer }[]): BakedVoxelAssets {
  const assets = inputs.map(({ spec, buffer }) => ({ id: spec.id, ...decodeVoxelAsset(buffer, spec) }));
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  for (const { spec } of inputs) if (spec.depletedAsset) {
    const asset = byId.get(spec.id)!, depleted = byId.get(spec.depletedAsset);
    if (!depleted || asset.size.some((n, i) => n !== depleted.size[i])) throw Error("Baked depleted asset frame differs.");
    asset.voxels.depleted = depleted.voxels.model;
  }
  const crate = byId.get("crate"), barrel = byId.get("barrel");
  if (crate && barrel) {
    if (byId.has("supplies")) throw Error("Native asset conflicts with the supplies binding.");
    const model = composeVoxelModels([{ model: crate.voxels.model, offset: [-.5, 0, -.125] }, { model: barrel.voxels.model, offset: [.5, 0, .125] }]);
    const { min, max } = model.surfaces![0].bounds;
    assets.push({ id: "supplies", size: min.map((n, axis) => Math.ceil((max[axis] - n) / model.pitch)) as [number, number, number], voxels: { model, depleted: undefined } });
  }
  return { sourceVersion, assets };
}
