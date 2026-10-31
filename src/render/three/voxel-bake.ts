import type { VoxelLevel, VoxelModel, VoxelObject } from "./voxel-data";
import type { VoxelShadowData, VoxelSurfaceBounds, VoxelSurfaceData } from "./voxel-surface";

export interface BakedVoxelAssets {
  sourceVersion: string;
  assets: { id: string; size: readonly number[]; voxels: VoxelObject }[];
}

/** FCVB v1: 16-byte little-endian header, UTF-8 domain metadata, aligned raw buffers. */
const MAGIC = 0x42564346, FORMAT = 1, HEADER = 16, MAX_BYTES = 1_073_741_824;
type NumericArray = Float32Array | Int8Array | Uint8Array | Uint32Array;
type ArrayKind = "f32" | "i8" | "u8" | "u32";
interface ArrayRecord { kind: ArrayKind; buffer: number; offset: number; length: number }
interface LevelRecord { pitch: number; count: number; centers: number; colors: number; ao: number }
interface GeometryRecord {
  kind: "surface" | "shadow"; positions: number; indices: number; bounds: VoxelSurfaceBounds;
  quads: number; triangles: number; bytes: number; densityProxy?: { factor: number; minimumOccupancy: number };
  normals?: number; colors?: number; ao?: number; pitch?: number; exposedFaces?: number; shadow?: number;
}
interface ModelRecord {
  pitch: number; radius: number; levels: number[]; lighting: number;
  surfaces?: number[]; shadowSurfaces?: (number | null)[]; shadowBudgetExceeded?: boolean[];
}
interface Metadata {
  sourceVersion: string;
  assets: { id: string; size: number[]; model: number; depleted?: number }[];
  models: ModelRecord[]; levels: LevelRecord[]; geometries: GeometryRecord[];
  arrays: ArrayRecord[]; buffers: { offset: number; length: number }[];
}
const align = (value: number) => Math.ceil(value / 4) * 4;
const invalid = (): never => { throw Error("Invalid baked voxel asset pack."); };
const integer = (value: unknown, max = MAX_BYTES): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): value is unknown[] => Array.isArray(value) && value.length <= 100_000;
const reference = (value: unknown, table: readonly unknown[]): value is number => integer(value, table.length - 1);
const littleEndian = () => new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

export function encodeVoxelBake(value: BakedVoxelAssets): ArrayBuffer {
  if (!littleEndian()) throw Error("Baked voxel assets require little-endian typed arrays.");
  const meta: Metadata = { sourceVersion: value.sourceVersion, assets: [], models: [], levels: [], geometries: [], arrays: [], buffers: [] };
  const arrays = new Map<NumericArray, number>(), buffers = new Map<ArrayBufferLike, number>();
  const levels = new Map<VoxelLevel, number>(), models = new Map<VoxelModel, number>(), geometries = new Map<VoxelShadowData, number>();
  const raw: Uint8Array[] = [];
  let payloadBytes = 0;
  const array = (data: NumericArray) => {
    const existing = arrays.get(data); if (existing !== undefined) return existing;
    const kind: ArrayKind = data instanceof Float32Array ? "f32" : data instanceof Int8Array ? "i8" : data instanceof Uint8Array ? "u8" : data instanceof Uint32Array ? "u32" : invalid();
    let buffer = buffers.get(data.buffer);
    if (buffer === undefined) {
      buffer = meta.buffers.length; buffers.set(data.buffer, buffer);
      meta.buffers.push({ offset: payloadBytes, length: data.buffer.byteLength }); raw.push(new Uint8Array(data.buffer));
      payloadBytes = align(payloadBytes + data.buffer.byteLength);
    }
    const id = meta.arrays.length; arrays.set(data, id);
    meta.arrays.push({ kind, buffer, offset: data.byteOffset, length: data.length }); return id;
  };
  const level = (data: VoxelLevel) => {
    const existing = levels.get(data); if (existing !== undefined) return existing;
    const id = meta.levels.length; levels.set(data, id);
    meta.levels.push({ pitch: data.pitch, count: data.count, centers: array(data.centers), colors: array(data.colors), ao: array(data.ao) }); return id;
  };
  const geometry = (data: VoxelShadowData): number => {
    const existing = geometries.get(data); if (existing !== undefined) return existing;
    const id = meta.geometries.length; geometries.set(data, id);
    const row: GeometryRecord = { kind: "shadow", positions: array(data.positions), indices: array(data.indices), bounds: data.bounds,
      quads: data.quads, triangles: data.triangles, bytes: data.bytes, densityProxy: data.densityProxy };
    meta.geometries.push(row);
    if ("normals" in data) {
      const surface = data as VoxelSurfaceData;
      Object.assign(row, { kind: "surface", normals: array(surface.normals), colors: array(surface.colors), ao: array(surface.ao), pitch: surface.pitch, exposedFaces: surface.exposedFaces });
      if (surface.shadow) row.shadow = geometry(surface.shadow);
    }
    return id;
  };
  const model = (data: VoxelModel) => {
    const existing = models.get(data); if (existing !== undefined) return existing;
    const id = meta.models.length; models.set(data, id);
    meta.models.push({ pitch: data.pitch, radius: data.radius, levels: data.levels.map(level), lighting: level(data.lighting),
      surfaces: data.surfaces?.map(geometry), shadowSurfaces: data.shadowSurfaces?.map(item => item === undefined ? null : geometry(item)), shadowBudgetExceeded: data.shadowBudgetExceeded });
    return id;
  };
  meta.assets = value.assets.map(asset => ({ id: asset.id, size: [...asset.size], model: model(asset.voxels.model), depleted: asset.voxels.depleted ? model(asset.voxels.depleted) : undefined }));
  const json = new TextEncoder().encode(JSON.stringify(meta)), payloadAt = align(HEADER + json.byteLength), bytes = payloadAt + payloadBytes;
  if (bytes > MAX_BYTES) invalid();
  const output = new ArrayBuffer(bytes), view = new DataView(output), target = new Uint8Array(output);
  view.setUint32(0, MAGIC, true); view.setUint32(4, FORMAT, true); view.setUint32(8, json.byteLength, true); view.setUint32(12, payloadBytes, true);
  target.set(json, HEADER); raw.forEach((data, id) => target.set(data, payloadAt + meta.buffers[id].offset)); return output;
}

export function decodeVoxelBake(buffer: ArrayBuffer, expectedSourceVersion: string): BakedVoxelAssets {
  if (!littleEndian()) throw Error("Baked voxel assets require little-endian typed arrays.");
  if (buffer.byteLength < HEADER || buffer.byteLength > MAX_BYTES) invalid();
  const header = new DataView(buffer), jsonBytes = header.getUint32(8, true), payloadBytes = header.getUint32(12, true), payloadAt = align(HEADER + jsonBytes);
  if (header.getUint32(0, true) !== MAGIC || header.getUint32(4, true) !== FORMAT || jsonBytes === 0 || jsonBytes > 16_777_216 || payloadAt + payloadBytes !== buffer.byteLength) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(buffer, HEADER, jsonBytes))); } catch { invalid(); }
  if (!record(parsed) || parsed.sourceVersion !== expectedSourceVersion || typeof parsed.sourceVersion !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(parsed.sourceVersion)) throw Error("Baked voxel source version differs from this build.");
  for (const key of ["assets", "models", "levels", "geometries", "arrays", "buffers"] as const) if (!list(parsed[key])) invalid();
  const meta = parsed as unknown as Metadata;
  let end = 0;
  for (const row of meta.buffers) {
    if (!record(row) || !integer(row.offset) || row.offset !== end || !integer(row.length) || row.offset + row.length > payloadBytes) invalid();
    end = align(row.offset + row.length);
  }
  if (end !== payloadBytes) invalid();
  const constructors = { f32: Float32Array, i8: Int8Array, u8: Uint8Array, u32: Uint32Array };
  const arrays = meta.arrays.map(row => {
    if (!record(row) || !["f32", "i8", "u8", "u32"].includes(row.kind as string) || !reference(row.buffer, meta.buffers) || !integer(row.offset) || !integer(row.length)) invalid();
    const ctor = constructors[row.kind], source = meta.buffers[row.buffer], size = ctor.BYTES_PER_ELEMENT;
    if (row.offset % size || row.offset + row.length * size > source.length) invalid();
    return new ctor(buffer, payloadAt + source.offset + row.offset, row.length);
  });
  const array = <T extends NumericArray>(id: unknown, ctor: { new (...args: never[]): T }): T => {
    if (!reference(id, arrays)) return invalid();
    const data = arrays[id]; if (!(data instanceof ctor)) return invalid(); return data as T;
  };
  const finiteArray = (data: Float32Array) => { for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i])) invalid(); };
  const levels: VoxelLevel[] = meta.levels.map(row => {
    if (!record(row) || !positive(row.pitch) || !integer(row.count)) invalid();
    const centers = array(row.centers, Float32Array), colors = array(row.colors, Float32Array), ao = array(row.ao, Uint8Array);
    if (centers.length !== row.count * 3 || colors.length !== centers.length || ao.length !== 0 && ao.length !== row.count * 24) invalid();
    finiteArray(centers); finiteArray(colors); return { pitch: row.pitch, count: row.count, centers, colors, ao };
  });
  const geometries: VoxelShadowData[] = meta.geometries.map(row => {
    if (!record(row) || row.kind !== "surface" && row.kind !== "shadow" || !integer(row.quads) || !integer(row.triangles) || !integer(row.bytes)) invalid();
    const positions = array(row.positions, Float32Array), indices = array(row.indices, Uint32Array), vertices = positions.length / 3;
    if (positions.length !== row.quads * 12 || indices.length !== row.triangles * 3 || indices.length !== row.quads * 6) invalid();
    finiteArray(positions); for (let i = 0; i < indices.length; i++) if (indices[i] >= vertices) invalid();
    if (!record(row.bounds) || !Array.isArray(row.bounds.min) || !Array.isArray(row.bounds.max) || row.bounds.min.length !== 3 || row.bounds.max.length !== 3 || !row.bounds.min.every(finite) || !row.bounds.max.every(finite) || row.bounds.min.some((value, axis) => value > row.bounds.max[axis])) invalid();
    const bounds: VoxelSurfaceBounds = { min: [...row.bounds.min], max: [...row.bounds.max] };
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3, tolerance = 1e-5 * Math.max(1, Math.abs(positions[i]));
      if (positions[i] < bounds.min[axis] - tolerance || positions[i] > bounds.max[axis] + tolerance) invalid();
    }
    const geometry: VoxelShadowData = { positions, indices, bounds, quads: row.quads, triangles: row.triangles, bytes: row.bytes };
    let expectedBytes = positions.byteLength + indices.byteLength;
    if (row.densityProxy !== undefined) {
      if (!record(row.densityProxy) || !integer(row.densityProxy.factor) || row.densityProxy.factor < 1 || !positive(row.densityProxy.minimumOccupancy) || row.densityProxy.minimumOccupancy > 1) invalid();
      geometry.densityProxy = { factor: row.densityProxy.factor, minimumOccupancy: row.densityProxy.minimumOccupancy };
    }
    if (row.kind === "surface") {
      const normals = array(row.normals, Int8Array), colors = array(row.colors, Float32Array), ao = array(row.ao, Uint8Array);
      if (!positive(row.pitch) || !integer(row.exposedFaces) || row.exposedFaces < row.quads || normals.length !== positions.length || colors.length !== positions.length || ao.length !== vertices) invalid();
      for (let i = 0; i < normals.length; i += 3) if (Math.abs(normals[i]) + Math.abs(normals[i + 1]) + Math.abs(normals[i + 2]) !== 1) invalid();
      finiteArray(colors); expectedBytes += normals.byteLength + colors.byteLength + ao.byteLength;
      Object.assign(geometry, { normals, colors, ao, pitch: row.pitch, exposedFaces: row.exposedFaces });
    } else if (row.shadow !== undefined) invalid();
    if (row.bytes !== expectedBytes) invalid(); return geometry;
  });
  meta.geometries.forEach((row, id) => {
    if (row.shadow !== undefined) {
      if (!reference(row.shadow, geometries) || meta.geometries[row.shadow].kind !== "shadow") invalid();
      (geometries[id] as VoxelSurfaceData).shadow = geometries[row.shadow];
    }
  });
  const models: VoxelModel[] = meta.models.map(row => {
    if (!record(row) || !positive(row.pitch) || !finite(row.radius) || row.radius < 0 || !Array.isArray(row.levels) || row.levels.length !== 5 || !row.levels.every(id => reference(id, levels)) || !reference(row.lighting, levels)) invalid();
    const model: VoxelModel = { pitch: row.pitch, radius: row.radius, levels: row.levels.map(id => levels[id]), lighting: levels[row.lighting] };
    if (model.levels.some(level => level.ao.length !== level.count * 24 || level.pitch < row.pitch)) invalid();
    if (row.surfaces !== undefined) {
      if (!Array.isArray(row.surfaces) || row.surfaces.length !== row.levels.length || !row.surfaces.every(id => reference(id, geometries) && meta.geometries[id].kind === "surface")) invalid();
      model.surfaces = row.surfaces.map(id => geometries[id] as VoxelSurfaceData);
      if (model.surfaces.some((surface, index) => surface.pitch !== model.levels[index].pitch)) invalid();
    }
    if (row.shadowSurfaces !== undefined) {
      if (!Array.isArray(row.shadowSurfaces) || row.shadowSurfaces.length !== row.levels.length || !row.shadowSurfaces.every(id => id === null || reference(id, geometries))) invalid();
      model.shadowSurfaces = row.shadowSurfaces.map(id => id === null ? undefined : geometries[id]);
    }
    if (row.shadowBudgetExceeded !== undefined) {
      if (!Array.isArray(row.shadowBudgetExceeded) || row.shadowBudgetExceeded.length !== row.levels.length || !row.shadowBudgetExceeded.every(value => typeof value === "boolean")) invalid();
      model.shadowBudgetExceeded = [...row.shadowBudgetExceeded];
    }
    return model;
  });
  const ids = new Set<string>();
  if (!meta.assets.length) invalid();
  const assets = meta.assets.map(row => {
    if (!record(row) || typeof row.id !== "string" || !/^[a-z0-9-]+$/.test(row.id) || ids.has(row.id) || !Array.isArray(row.size) || row.size.length !== 3 || !row.size.every(n => integer(n, 256) && n >= 1) || !reference(row.model, models) || row.depleted !== undefined && !reference(row.depleted, models)) invalid();
    ids.add(row.id); const voxels: VoxelObject = { model: models[row.model] };
    if (row.depleted !== undefined) voxels.depleted = models[row.depleted];
    return { id: row.id, size: [...row.size], voxels };
  });
  return { sourceVersion: meta.sourceVersion, assets };
}
