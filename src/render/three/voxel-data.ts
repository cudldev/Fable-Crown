/** Native VOX150 is the editable source; render LODs are derived locally, never authoritative game data. */
import { Color, SRGBColorSpace } from "three";

export interface VoxelGrid { size: [number, number, number]; cells: Uint8Array; palette: Uint8Array }
export interface VoxelLevel { pitch: number; centers: Float32Array; colors: Float32Array; count: number; ao: Uint8Array }
export interface VoxelModel { levels: VoxelLevel[]; lighting: VoxelLevel; pitch: number; radius: number }
export interface VoxelObject { model: VoxelModel; depleted?: VoxelModel }
export const VOXEL_LOD_FACTORS = [1, 2, 4, 8, 16] as const;
const index = (x: number, y: number, z: number, size: readonly number[]) => (x * size[1] + y) * size[2] + z;
const aoOffsets = Array.from({length: 24}, (_, entry) => {
  const face = Math.floor(entry / 4), axis = Math.floor(face / 2), sign = face % 2 ? 1 : -1, corner = entry % 4;
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0]; a[axis] = b[axis] = c[axis] = sign;
  a[(axis + 1) % 3] = c[(axis + 1) % 3] = corner & 1 ? 1 : -1;
  b[(axis + 2) % 3] = c[(axis + 2) % 3] = corner & 2 ? 1 : -1;
  return {a, b, c};
});

export function parseVox(buffer: ArrayBuffer): VoxelGrid {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (buffer.byteLength < 20 || text(0) !== "VOX " || view.getUint32(4, true) !== 150 || text(8) !== "MAIN") throw Error("Expected a native single-model VOX150 file.");
  if (view.getUint32(12, true) !== 0 || 20 + view.getUint32(16, true) !== buffer.byteLength) throw Error("Invalid VOX root length.");
  let size: VoxelGrid["size"] | undefined, cells: Uint8Array | undefined, palette: Uint8Array | undefined;
  for (let at = 20; at < buffer.byteLength;) {
    if (at + 12 > buffer.byteLength) throw Error("Truncated VOX chunk.");
    const kind = text(at), length = view.getUint32(at + 4, true), children = view.getUint32(at + 8, true), data = at + 12;
    if (children || data + length > buffer.byteLength) throw Error("Unsupported nested/truncated VOX chunk.");
    if (kind === "PACK" && (length !== 4 || view.getUint32(data, true) !== 1)) throw Error("Partition multi-model VOX sources explicitly.");
    if (kind === "SIZE") {
      if (size || length !== 12) throw Error("Repeated/invalid VOX SIZE.");
      size = [0, 4, 8].map(offset => view.getUint32(data + offset, true)) as VoxelGrid["size"];
      if (size.some(n => n < 1 || n > 256)) throw Error("VOX dimensions outside 1..256.");
    } else if (kind === "XYZI") {
      if (!size || cells || length < 4) throw Error("Missing size or repeated VOX cells.");
      const count = view.getUint32(data, true);
      if (!count || 4 + count * 4 !== length || count > size[0] * size[1] * size[2]) throw Error("Invalid VOX cell count.");
      cells = new Uint8Array(size[0] * size[1] * size[2]);
      for (let i = 0; i < count; i++) {
        const p = data + 4 + i * 4, x = bytes[p], y = bytes[p + 1], z = bytes[p + 2], color = bytes[p + 3];
        if (x >= size[0] || y >= size[1] || z >= size[2] || !color) throw Error("Invalid VOX cell coordinate/color.");
        const key = index(x, y, z, size); if (cells[key]) throw Error("Repeated VOX cell."); cells[key] = color;
      }
    } else if (kind === "RGBA") {
      if (palette || length !== 1024) throw Error("Repeated/invalid VOX palette.");
      palette = bytes.slice(data, data + 1024);
    }
    at = data + length;
  }
  if (!size || !cells || !palette) throw Error("VOX source needs one SIZE, XYZI and explicit RGBA palette.");
  return { size, cells, palette };
}

/** Aggregate from the same asset origin/pivot. Majority material; preserve occupied thin features. */
export function coarseGrid(source: VoxelGrid, pivot: readonly number[], factor: number): { grid: VoxelGrid; pivot: number[] } {
  const size = source.size.map(n => Math.ceil(n / factor)) as VoxelGrid["size"];
  const votes = new Map<number, Map<number, number>>();
  for (let x = 0; x < source.size[0]; x++) for (let y = 0; y < source.size[1]; y++) for (let z = 0; z < source.size[2]; z++) {
    const color = source.cells[index(x, y, z, source.size)]; if (!color) continue;
    const key = index(Math.floor(x / factor), Math.floor(y / factor), Math.floor(z / factor), size);
    let tally = votes.get(key); if (!tally) { tally = new Map(); votes.set(key, tally); }
    tally.set(color, (tally.get(color) ?? 0) + 1);
  }
  const cells = new Uint8Array(size[0] * size[1] * size[2]);
  for (const [key, tally] of votes) {
    let best = 0, count = 0;
    for (const [color, n] of tally) if (n > count || n === count && color < best) { best = color; count = n; }
    cells[key] = best;
  }
  return { grid: { size, cells, palette: source.palette }, pivot: pivot.map(v => v / factor) };
}

export function surfaceLevel(grid: VoxelGrid, pitch: number, pivot: readonly number[], includeInterior = false): VoxelLevel {
  const centers: number[] = [], colors: number[] = [], ao: number[] = [], color = new Color();
  const { size, cells, palette } = grid;
  const occupied = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < size[0] && y < size[1] && z < size[2] && cells[index(x, y, z, size)] > 0;
  for (let x = 0; x < size[0]; x++) for (let y = 0; y < size[1]; y++) for (let z = 0; z < size[2]; z++) {
    const id = cells[index(x, y, z, size)]; if (!id) continue;
    if (!includeInterior && occupied(x - 1, y, z) && occupied(x + 1, y, z) && occupied(x, y - 1, z) && occupied(x, y + 1, z) && occupied(x, y, z - 1) && occupied(x, y, z + 1)) continue;
    centers.push((x + .5 - pivot[0]) * pitch, (z + .5 - pivot[2]) * pitch, -(y + .5 - pivot[1]) * pitch);
    const at = (id - 1) * 4;
    color.setRGB(palette[at] / 255, palette[at + 1] / 255, palette[at + 2] / 255, SRGBColorSpace);
    colors.push(color.r, color.g, color.b);
    if (!includeInterior) for (const {a, b, c} of aoOffsets) {
      const sideA = Number(occupied(x + a[0], y + a[1], z + a[2])), sideB = Number(occupied(x + b[0], y + b[1], z + b[2]));
      const occlusion = sideA && sideB ? 0 : 3 - sideA - sideB - Number(occupied(x + c[0], y + c[1], z + c[2]));
      ao.push(Math.round(255 * (.45 + .55 * occlusion / 3)));
    }
  }
  return { pitch, centers: new Float32Array(centers), colors: new Float32Array(colors), count: centers.length / 3, ao: new Uint8Array(ao) };
}

export function voxelModel(grid: VoxelGrid, pitch: number, pivot: readonly number[], cutHeight?: number): VoxelModel {
  if (!Number.isFinite(pitch) || pitch <= 0 || pivot.length !== 3 || pivot.some(v => !Number.isFinite(v))) throw Error("Invalid voxel physical scale/pivot.");
  const source = cutHeight === undefined ? grid : { ...grid, cells: grid.cells.slice() };
  if (cutHeight !== undefined) for (let x = 0; x < grid.size[0]; x++) for (let y = 0; y < grid.size[1]; y++) for (let z = 0; z < grid.size[2]; z++) {
    if ((z + .5 - pivot[2]) * pitch >= cutHeight) source.cells[index(x, y, z, grid.size)] = 0;
  }
  // Never inflate a tiny model or a harvested stump beyond its entire height.
  const maxFactor = 2 ** Math.max(0, Math.floor(Math.log2(Math.min(Math.max(...grid.size), cutHeight === undefined ? Infinity : cutHeight / pitch))));
  const levels = VOXEL_LOD_FACTORS.map(requested => {
    const factor = Math.min(requested, maxFactor);
    const coarse = factor === 1 ? { grid: source, pivot } : coarseGrid(source, pivot, factor);
    return surfaceLevel(coarse.grid, pitch * factor, coarse.pivot);
  });
  const coarse = coarseGrid(source, pivot, 8);
  return { pitch, levels, lighting: surfaceLevel(coarse.grid, pitch * 8, coarse.pivot, true), radius: Math.hypot(...grid.size.map((n, axis) => Math.max(Math.abs(pivot[axis]), Math.abs(n - pivot[axis])) * pitch)) };
}
