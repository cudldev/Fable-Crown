import { Group } from "three";
import { parseVox, voxelModel, type VoxelObject } from "./voxel-data";

export interface VoxelAssetSpec { id: string; file: string; pitch: number; pivot: [number, number, number]; cutHeight?: number }
export function voxelAssetSpecs(value: unknown): VoxelAssetSpec[] {
  if (!value || typeof value !== "object" || !("assets" in value) || !Array.isArray(value.assets)) throw Error("Invalid voxel asset manifest.");
  const ids = new Set<string>();
  return value.assets.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw Error("Invalid voxel asset entry.");
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[a-z0-9-]+$/.test(row.id) || ids.has(row.id) || typeof row.file !== "string" || !/^[a-z0-9-]+\.vox$/.test(row.file)) throw Error("Invalid/repeated voxel asset or local path.");
    if (typeof row.pitch !== "number" || !Number.isFinite(row.pitch) || row.pitch <= 0 || !Array.isArray(row.pivot) || row.pivot.length !== 3 || !row.pivot.every(v => typeof v === "number" && Number.isFinite(v))) throw Error("Invalid voxel physical scale.");
    if (row.cutHeight !== undefined && (typeof row.cutHeight !== "number" || !Number.isFinite(row.cutHeight) || row.cutHeight <= 0)) throw Error("Invalid voxel depleted height.");
    ids.add(row.id); return row as unknown as VoxelAssetSpec;
  });
}

export async function loadVoxelAssets(base: URL, signal: AbortSignal): Promise<Map<string, VoxelObject>> {
  const response = await fetch(new URL("manifest.json", base), { signal });
  if (!response.ok) throw Error("Voxel asset manifest unavailable.");
  const specs = voxelAssetSpecs(await response.json()), result = new Map<string, VoxelObject>();
  for (const spec of specs) {
    const file = await fetch(new URL(spec.file, base), { signal }); if (!file.ok) throw Error(`${spec.id}: native VOX unavailable.`);
    const grid = parseVox(await file.arrayBuffer());
    result.set(spec.id, { model: voxelModel(grid, spec.pitch, spec.pivot), depleted: spec.cutHeight === undefined ? undefined : voxelModel(grid, spec.pitch, spec.pivot, spec.cutHeight) });
  }
  return result;
}

export function voxelObject(voxels: VoxelObject) {
  const group = new Group(), available = new Group(), depleted = new Group();
  available.name = "available"; depleted.name = "depleted"; depleted.visible = false;
  group.add(available, depleted); return { group, available, depleted, voxels, lights: [] };
}
