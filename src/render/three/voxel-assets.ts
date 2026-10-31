import { Group } from "three";
import { type VoxelObject } from "./voxel-data";
import { VoxelBakeDecoder } from "./voxel-bake-decoder";
import { VOXEL_BAKE_VERSION } from "./voxel-bake-version";
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
  const manifestURL = new URL("baked.json", base); manifestURL.searchParams.set("v", VOXEL_BAKE_VERSION);
  const response = await fetch(manifestURL, { signal });
  if (!response.ok) throw Error("Voxel asset manifest unavailable.");
  const manifest = await response.json();
  if (manifest.version !== VOXEL_BAKE_VERSION || manifest.sourceVersion !== VOXEL_VERSION) throw Error("Baked voxel cache version differs from this build.");
  if (manifest.format !== 1 || manifest.pack !== "meshes.bin" || manifest.encoding !== "gzip" || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 16 * 1024 * 1024 || !Number.isSafeInteger(manifest.decodedBytes) || manifest.decodedBytes < 1 || manifest.decodedBytes > 64 * 1024 * 1024 || typeof manifest.packSha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.packSha256) || !Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.length > 256) throw Error("Invalid baked voxel manifest.");
  const ids = new Set<string>();
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.id !== "string" || !/^[a-z0-9-]+$/.test(asset.id) || ids.has(asset.id) || !Array.isArray(asset.size) || asset.size.length !== 3 || asset.size.some((n: number) => !Number.isInteger(n) || n < 1 || n > 256)) throw Error("Invalid baked voxel binding.");
    ids.add(asset.id);
  }
  const url = new URL(manifest.pack, base); url.searchParams.set("v", VOXEL_BAKE_VERSION);
  const packed = await fetch(url, { signal }); if (!packed.ok) throw Error("Baked voxel meshes unavailable.");
  const buffer = await packed.arrayBuffer(); signal.throwIfAborted();
  if (buffer.byteLength !== manifest.bytes) throw Error("Baked voxel download size differs from this build.");
  const decoder = new VoxelBakeDecoder(signal);
  try {
    const decoded = await decoder.decode(buffer, VOXEL_VERSION, manifest.decodedBytes, manifest.packSha256); signal.throwIfAborted();
    if (decoded.assets.length !== ids.size) throw Error("Baked voxel binding count differs.");
    const result = new Map<string, VoxelObject>();
    for (const asset of decoded.assets) {
      const spec = manifest.assets.find((entry: { id: string }) => entry.id === asset.id);
      if (!spec || result.has(asset.id) || asset.size.some((n, i) => n !== spec.size[i])) throw Error("Baked voxel binding differs from the manifest.");
      for (const model of [asset.voxels.model, asset.voxels.depleted]) if (model && model.surfaces?.length !== model.levels.length) throw Error("A voxel binding is missing baked surfaces.");
      result.set(asset.id, asset.voxels);
    }
    return result;
  } finally { decoder.dispose(); }
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
