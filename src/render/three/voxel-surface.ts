import { Color, SRGBColorSpace } from "three";
import { coarseGrid, VOXEL_SHADOW_TRIANGLE_BUDGET, VOXEL_AO_OFFSETS, type VoxelGrid, type VoxelLevel, type VoxelModel } from "./voxel-data";

type V3 = [number, number, number];
export interface VoxelSurfaceBounds { min: V3; max: V3 }
export interface VoxelShadowData {
  positions: Float32Array;
  indices: Uint32Array;
  bounds: VoxelSurfaceBounds;
  quads: number;
  triangles: number;
  bytes: number;
  /** Shadow-only density approximation; omitted for exact occupied silhouettes. */
  densityProxy?: { factor: number; minimumOccupancy: number };
}
export interface VoxelSurfaceData extends VoxelShadowData {
  /** Signed unit components, supplied as an unnormalized normal attribute. */
  normals: Int8Array;
  colors: Float32Array;
  /** Four authored corner values per quad, supplied as normalized Uint8 scalars. */
  ao: Uint8Array;
  pitch: number;
  exposedFaces: number;
  /** Additional position/index buffers only when they save shadow triangles. */
  shadow?: VoxelShadowData;
}

const cellIndex = (x: number, y: number, z: number, size: readonly number[]) => (x * size[1] + y) * size[2] + z;

function sourceIndices(grid: VoxelGrid, pitch: number, pivot: readonly number[], level?: VoxelLevel) {
  if (!level) return;
  if (level.pitch !== pitch || level.ao.length !== level.count * 24) throw Error("Surface baking needs the matching exterior voxel level.");
  const result = new Int32Array(grid.cells.length).fill(-1);
  for (let i = 0; i < level.count; i++) {
    const x = Math.round(level.centers[i * 3] / pitch + pivot[0] - .5);
    const y = Math.round(-level.centers[i * 3 + 2] / pitch + pivot[1] - .5);
    const z = Math.round(level.centers[i * 3 + 1] / pitch + pivot[2] - .5);
    if (x < 0 || y < 0 || z < 0 || x >= grid.size[0] || y >= grid.size[1] || z >= grid.size[2]) throw Error("Voxel level and dense surface grid disagree.");
    result[cellIndex(x, y, z, grid.size)] = i;
  }
  return result;
}

/** Face masks are built from all occupied cells, never from an exterior-only point cloud. */
function bake(grid: VoxelGrid, pitch: number, pivot: readonly number[], shadowOnly: boolean, level?: VoxelLevel) {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], ao: number[] = [], indices: number[] = [];
  const bounds: VoxelSurfaceBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const lookup = shadowOnly ? undefined : sourceIndices(grid, pitch, pivot, level);
  const palette = new Float32Array(256 * 3), canonical = new Uint16Array(256), ids = new Map<number, number>(), color = new Color();
  if (!shadowOnly) for (let id = 1; id <= Math.min(255, grid.palette.length / 4); id++) {
    const at = (id - 1) * 4, rgb = grid.palette[at] | grid.palette[at + 1] << 8 | grid.palette[at + 2] << 16;
    if (!ids.has(rgb)) ids.set(rgb, ids.size + 1);
    canonical[id] = ids.get(rgb)!;
    color.setRGB(grid.palette[at] / 255, grid.palette[at + 1] / 255, grid.palette[at + 2] / 255, SRGBColorSpace);
    palette.set([color.r, color.g, color.b], id * 3);
  }
  const occupied = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < grid.size[0] && y < grid.size[1] && z < grid.size[2] && grid.cells[cellIndex(x, y, z, grid.size)] !== 0;
  let exposedFaces = 0;
  const stride = [grid.size[1] * grid.size[2], grid.size[2], 1];
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3, width = grid.size[u], height = grid.size[v];
    const mask = new Int32Array(width * height), sourceCells = new Int32Array(mask.length), faceAO = new Uint8Array(mask.length * 4);
    const point = [0, 0, 0];
    for (const sign of [-1, 1]) for (let slice = 0; slice < grid.size[axis]; slice++) {
      mask.fill(0); const face = axis * 2 + Number(sign > 0);
      point[axis] = slice;
      for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
        point[u] = i; point[v] = j;
        const at = cellIndex(point[0], point[1], point[2], grid.size), id = grid.cells[at];
        if (!id || slice + sign >= 0 && slice + sign < grid.size[axis] && grid.cells[at + sign * stride[axis]]) continue;
        const cell = j * width + i; sourceCells[cell] = at; exposedFaces++;
        if (shadowOnly) { mask[cell] = 1; continue; }
        const source = lookup?.[at];
        if (source !== undefined && source < 0) throw Error("Exterior voxel missing from its source level.");
        for (let corner = 0; corner < 4; corner++) {
          let value: number;
          if (source !== undefined) value = level!.ao[source * 24 + face * 4 + corner];
          else {
            const { a, b, c } = VOXEL_AO_OFFSETS[face * 4 + corner];
            const sideA = Number(occupied(point[0] + a[0], point[1] + a[1], point[2] + a[2]));
            const sideB = Number(occupied(point[0] + b[0], point[1] + b[1], point[2] + b[2]));
            const occlusion = sideA && sideB ? 0 : 3 - sideA - sideB - Number(occupied(point[0] + c[0], point[1] + c[1], point[2] + c[2]));
            value = Math.round(255 * (.45 + .55 * occlusion / 3));
          }
          faceAO[cell * 4 + corner] = value;
        }
        const first = faceAO[cell * 4], uniform = faceAO[cell * 4 + 1] === first && faceAO[cell * 4 + 2] === first && faceAO[cell * 4 + 3] === first;
        // Every nonuniform face gets its own key: keep the original quad and diagonal.
        mask[cell] = uniform ? canonical[id] | first << 8 : -(cell + 1);
      }
      for (let j = 0; j < height; j++) for (let i = 0; i < width;) {
        const cell = j * width + i, key = mask[cell];
        if (!key) { i++; continue; }
        let w = 1, h = 1;
        if (key > 0) {
          while (i + w < width && mask[cell + w] === key) w++;
          outer: while (j + h < height) {
            for (let x = 0; x < w; x++) if (mask[(j + h) * width + i + x] !== key) break outer;
            h++;
          }
        }
        const start = positions.length / 3, at = sourceCells[cell], id = grid.cells[at], source = lookup?.[at];
        const normal: V3 = axis === 0 ? [sign, 0, 0] : axis === 1 ? [0, 0, -sign] : [0, sign, 0];
        for (let corner = 0; corner < 4; corner++) {
          point[axis] = slice + Number(sign > 0); point[u] = i + (corner & 1 ? w : 0); point[v] = j + (corner & 2 ? h : 0);
          const position: V3 = [Math.fround((point[0] - pivot[0]) * pitch) || 0, Math.fround((point[2] - pivot[2]) * pitch) || 0, Math.fround(-(point[1] - pivot[1]) * pitch) || 0];
          positions.push(...position);
          for (let a = 0; a < 3; a++) { bounds.min[a] = Math.min(bounds.min[a], position[a]); bounds.max[a] = Math.max(bounds.max[a], position[a]); }
          if (!shadowOnly) {
            normals.push(...normal);
            for (let channel = 0; channel < 3; channel++) colors.push(source === undefined ? palette[id * 3 + channel] : level!.colors[source * 3 + channel]);
            ao.push(faceAO[cell * 4 + corner]);
          }
        }
        // Three's BoxGeometry uses these source-space diagonals after its Y-up conversion.
        const diagonal03 = face === 1 || face === 2 || face === 5;
        const triangles = diagonal03 ? [0, 1, 3, 0, 3, 2] : [0, 1, 2, 1, 3, 2];
        for (let t = 0; t < 6; t += 3) {
          indices.push(start + triangles[t], start + triangles[t + (sign > 0 ? 1 : 2)], start + triangles[t + (sign > 0 ? 2 : 1)]);
        }
        for (let y = 0; y < h; y++) mask.fill(0, (j + y) * width + i, (j + y) * width + i + w);
        i += w;
      }
    }
  }
  if (!positions.length) { bounds.min = [0, 0, 0]; bounds.max = [0, 0, 0]; }
  return { positions: new Float32Array(positions), normals: new Int8Array(normals), colors: new Float32Array(colors), ao: new Uint8Array(ao),
    indices: new Uint32Array(indices), bounds, pitch, exposedFaces, quads: indices.length / 6, triangles: indices.length / 3, bytes: 0 };
}

/** Shared local geometry; greedy joins never cross a pigment or nonuniform AO boundary. */
export function bakeVoxelSurface(grid: VoxelGrid, pitch: number, pivot: readonly number[], source?: VoxelLevel): VoxelSurfaceData {
  if (!Number.isFinite(pitch) || pitch <= 0 || pivot.length !== 3 || pivot.some(value => !Number.isFinite(value))) throw Error("Invalid voxel surface scale/pivot.");
  const visible: VoxelSurfaceData = bake(grid, pitch, pivot, false, source), shadow = bake(grid, pitch, pivot, true);
  visible.bytes = visible.positions.byteLength + visible.normals.byteLength + visible.colors.byteLength + visible.ao.byteLength + visible.indices.byteLength;
  if (shadow.triangles < visible.triangles) visible.shadow = { positions: shadow.positions, indices: shadow.indices, bounds: shadow.bounds,
    quads: shadow.quads, triangles: shadow.triangles, bytes: shadow.positions.byteLength + shadow.indices.byteLength };
  return visible;
}

/** Shadow-only occupancy threshold; visible LODs and native cells stay untouched. */
export function bakeDensityShadowProxy(grid: VoxelGrid, pitch: number, pivot: readonly number[], factor = 4, minimumOccupancy = .25): VoxelShadowData {
  if (!Number.isInteger(factor) || factor < 1 || !Number.isFinite(minimumOccupancy) || minimumOccupancy <= 0 || minimumOccupancy > 1 || !Number.isFinite(pitch) || pitch <= 0 || pivot.length !== 3 || pivot.some(value => !Number.isFinite(value))) throw Error("Invalid shadow-only density settings.");
  const size = grid.size.map(value => Math.ceil(value / factor)) as V3, counts = new Uint32Array(size[0] * size[1] * size[2]);
  for (let x = 0; x < grid.size[0]; x++) for (let y = 0; y < grid.size[1]; y++) for (let z = 0; z < grid.size[2]; z++)
    if (grid.cells[cellIndex(x, y, z, grid.size)]) counts[cellIndex(Math.floor(x / factor), Math.floor(y / factor), Math.floor(z / factor), size)]++;
  const cells = new Uint8Array(counts.length);
  for (let x = 0; x < size[0]; x++) for (let y = 0; y < size[1]; y++) for (let z = 0; z < size[2]; z++) {
    const available = Math.min(factor, grid.size[0] - x * factor) * Math.min(factor, grid.size[1] - y * factor) * Math.min(factor, grid.size[2] - z * factor);
    const index = cellIndex(x, y, z, size); if (counts[index] / available >= minimumOccupancy) cells[index] = 1;
  }
  const geometry = bake({ size, cells, palette: grid.palette }, pitch * factor, pivot.map(value => value / factor), true);
  return { positions: geometry.positions, indices: geometry.indices, bounds: geometry.bounds, quads: geometry.quads, triangles: geometry.triangles,
    bytes: geometry.positions.byteLength + geometry.indices.byteLength, densityProxy: { factor, minimumOccupancy } };
}

/** Derive from the original occupied grid with exactly the model's cut, coarse origin and cap. */
export function bakeVoxelModelSurfaces(grid: VoxelGrid, model: VoxelModel, pitch: number, pivot: readonly number[], cutHeight?: number): VoxelSurfaceData[] {
  const source = cutHeight === undefined ? grid : { ...grid, cells: grid.cells.slice() };
  if (cutHeight !== undefined) for (let x = 0; x < grid.size[0]; x++) for (let y = 0; y < grid.size[1]; y++) for (let z = 0; z < grid.size[2]; z++)
    if ((z + .5 - pivot[2]) * pitch >= cutHeight) source.cells[cellIndex(x, y, z, grid.size)] = 0;
  const cache = new Map<VoxelLevel, VoxelSurfaceData>();
  const surfaces = model.levels.map(level => {
    const existing = cache.get(level); if (existing) return existing;
    const factor = level.pitch / pitch;
    if (!Number.isInteger(factor) || factor < 1) throw Error("Voxel surface LOD pitch differs from the native grid.");
    const coarse = factor === 1 ? { grid: source, pivot } : coarseGrid(source, pivot, factor);
    const surface = bakeVoxelSurface(coarse.grid, level.pitch, coarse.pivot, level); cache.set(level, surface); return surface;
  });
  model.surfaces = surfaces;
  const density = new Map<number, VoxelShadowData>(), selected = new Map<VoxelSurfaceData, VoxelShadowData>(), exceeded: boolean[] = [];
  const shadows = surfaces.map((surface, index) => {
    const exact = surface.shadow ?? surface;
    let shadow = selected.get(surface);
    if (!shadow) {
      shadow = exact;
      // Factors beyond four have no validated shape gate. Keep a fine fallback
      // rather than keep coarsening until an arbitrarily small silhouette fits.
      if (exact.triangles > VOXEL_SHADOW_TRIANGLE_BUDGET) for (let factor = Math.max(2, model.levels[index].pitch / pitch); factor <= 4; factor *= 2) {
        let candidate = density.get(factor);
        if (!candidate) { candidate = bakeDensityShadowProxy(source, pitch, pivot, factor, .375); density.set(factor, candidate); }
        // Density filtering must not erase a model or lift its ground contact.
        if (candidate.triangles > 0 && candidate.triangles <= VOXEL_SHADOW_TRIANGLE_BUDGET && candidate.bounds.min[1] <= exact.bounds.min[1] && candidate.bounds.max[1] >= exact.bounds.max[1] - pitch) {
          shadow = candidate; break;
        }
      }
      selected.set(surface, shadow);
    }
    exceeded[index] = shadow.triangles > VOXEL_SHADOW_TRIANGLE_BUDGET;
    return shadow === surface ? undefined : shadow;
  });
  model.shadowSurfaces = shadows.some(Boolean) ? shadows : undefined;
  model.shadowBudgetExceeded = exceeded.some(Boolean) ? exceeded : undefined;
  return surfaces;
}
