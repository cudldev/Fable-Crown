import { Group } from "three";
import { type VoxelModel, type VoxelObject } from "./voxel-data";
import { VoxelAssetDecoder } from "./voxel-decoder";
import { VOXEL_VERSION } from "./voxel-version";
import type { WorldObject } from "../../rpg/types";

export interface VoxelAssetSpec { id: string; file: string; pitch: number; pivot: [number, number, number]; cutHeight?: number; depletedAsset?: string }
export function voxelAssetSpecs(value: unknown): VoxelAssetSpec[] {
  if (!value || typeof value !== "object" || !("assets" in value) || !Array.isArray(value.assets)) throw Error("Invalid voxel asset manifest.");
  const ids = new Set<string>();
  const specs = value.assets.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw Error("Invalid voxel asset entry.");
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[a-z0-9-]+$/.test(row.id) || ids.has(row.id) || typeof row.file !== "string" || !/^[a-z0-9-]+\.vox$/.test(row.file)) throw Error("Invalid/repeated voxel asset or local path.");
    if (typeof row.pitch !== "number" || !Number.isFinite(row.pitch) || row.pitch <= 0 || !Array.isArray(row.pivot) || row.pivot.length !== 3 || !row.pivot.every(v => typeof v === "number" && Number.isFinite(v))) throw Error("Invalid voxel physical scale.");
    if (row.cutHeight !== undefined && (typeof row.cutHeight !== "number" || !Number.isFinite(row.cutHeight) || row.cutHeight <= 0)) throw Error("Invalid voxel depleted height.");
    if (row.depletedAsset !== undefined && (typeof row.depletedAsset !== "string" || !/^[a-z0-9-]+$/.test(row.depletedAsset) || row.cutHeight !== undefined)) throw Error("Invalid voxel depleted asset.");
    ids.add(row.id); return row as unknown as VoxelAssetSpec;
  });
  const byId = new Map(specs.map(spec => [spec.id, spec]));
  for (const spec of specs) {
    const visited = new Set<string>([spec.id]); let current = spec;
    while (current.depletedAsset) {
      const next = byId.get(current.depletedAsset);
      if (!next || visited.has(next.id)) throw Error("Missing or cyclic voxel depleted asset.");
      if (next.pitch !== spec.pitch || next.pivot.some((value, i) => value !== spec.pivot[i])) throw Error("Depleted voxel asset must share scale and pivot.");
      visited.add(next.id); current = next;
    }
  }
  return specs;
}

export async function loadVoxelAssets(base: URL, signal: AbortSignal): Promise<Map<string, VoxelObject>> {
  const manifestURL = new URL("manifest.json", base); manifestURL.searchParams.set("v", VOXEL_VERSION);
  const response = await fetch(manifestURL, { signal });
  if (!response.ok) throw Error("Voxel asset manifest unavailable.");
  const manifest = await response.json();
  if (manifest.version !== VOXEL_VERSION) throw Error("Native voxel cache version differs from this build.");
  const specs = voxelAssetSpecs(manifest), result = new Map<string, VoxelObject>();
  const models = new Map<string, VoxelModel>();
  const sizes = new Map<string, readonly number[]>();
  const decoder = new VoxelAssetDecoder(signal);
  try {
  for (const spec of specs) {
    const url = new URL(spec.file, base); url.searchParams.set("v", VOXEL_VERSION);
    const file = await fetch(url, { signal }); if (!file.ok) throw Error(`${spec.id}: native VOX unavailable.`);
    const decoded = await decoder.decode(await file.arrayBuffer(), spec); signal.throwIfAborted();
    sizes.set(spec.id, decoded.size); models.set(spec.id, decoded.voxels.model);
    result.set(spec.id, decoded.voxels);
  }
  } finally { decoder.dispose(); }
  for (const spec of specs) if (spec.depletedAsset) {
    const depletedSize = sizes.get(spec.depletedAsset)!;
    if (sizes.get(spec.id)!.some((size, i) => size !== depletedSize[i])) throw Error("Depleted voxel asset must share its native coordinate frame.");
    result.get(spec.id)!.depleted = models.get(spec.depletedAsset)!;
  }
  return result;
}

/** Native prop bindings precede legacy templates; resource identity stays authoritative. */
export function voxelBindingId(object: Pick<WorldObject, "kind" | "art" | "resourceId">): string | undefined {
  if (object.kind === "tree") return "tree";
  if (object.kind === "anvil") return "anvil";
  if (object.kind === "rock" && object.resourceId && ["copper", "tin", "iron", "coal"].includes(object.resourceId)) return "ore-" + object.resourceId;
  if (object.art === "prop-supplies") return "supplies";
  if (object.art === "crate" || object.art === "prop-crate") return "crate";
  if (object.art === "barrel" || object.art === "prop-barrel") return "barrel";
  return undefined;
}

export function voxelObject(voxels: VoxelObject) {
  const group = new Group(), available = new Group(), depleted = new Group();
  available.name = "available"; depleted.name = "depleted"; depleted.visible = false;
  group.add(available, depleted); return { group, available, depleted, voxels, lights: [] };
}
