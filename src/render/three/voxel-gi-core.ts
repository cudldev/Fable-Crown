/** Presentation-only, deterministic first-bounce diffuse transport on a coarse occupancy field. */
export type V3 = [number, number, number];
export interface GIObjectSource { id: string; triangles: Float32Array; availableTriangles: Float32Array; depletedTriangles: Float32Array; boxes?: { available: Float32Array; depleted?: Float32Array }; bounds: number[] }
export interface GILamp { position: V3; color: V3; intensity: number; distance: number }
export interface GIWorldSource { objects: GIObjectSource[]; ground: Uint32Array; width: number; height: number }
export interface GISolveConfig { origin: V3; size: V3; pitch: number; stride: number; rays: number; sunDirection: V3; sunColor: V3; skyColor: V3; sunPower: number; skyPower: number; lamps: GILamp[]; depleted: string[]; aoDistance?: number }
export interface GIGrid { origin: V3; size: V3; pitch: number; albedo: Uint32Array; emission: Uint32Array; world: GIWorldSource; rays: number }
export interface GIHit { position: V3; normal: V3; color: V3; emission: V3; distance: number }
export const giIndex = (x: number, y: number, z: number, size: V3) => (z * size[1] + y) * size[0] + x;
export const packRGB = (r: number, g: number, b: number) => ((255 << 24) | Math.round(Math.min(1, Math.max(0, r)) * 255) | (Math.round(Math.min(1, Math.max(0, g)) * 255) << 8) | (Math.round(Math.min(1, Math.max(0, b)) * 255) << 16)) >>> 0;
const unpack = (n: number): V3 => [(n & 255) / 255, ((n >>> 8) & 255) / 255, ((n >>> 16) & 255) / 255];

export function triangleBoxOverlap(triangle: readonly number[], center: V3, half: number): boolean {
  const p = [0, 3, 6].map(i => [triangle[i] - center[0], triangle[i + 1] - center[1], triangle[i + 2] - center[2]]);
  const edges = [0, 1, 2].map(i => p[(i + 1) % 3].map((v, axis) => v - p[i][axis]));
  const overlap = (axis: number[]) => {
    const radius = half * (Math.abs(axis[0]) + Math.abs(axis[1]) + Math.abs(axis[2]));
    const projected = p.map(v => v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]);
    return Math.min(...projected) <= radius + 1e-7 && Math.max(...projected) >= -radius - 1e-7;
  };
  if (![0, 1, 2].every(axis => overlap([Number(axis === 0), Number(axis === 1), Number(axis === 2)]))) return false;
  const a = edges[0], b = edges[1];
  if (!overlap([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]])) return false;
  return edges.every(e => overlap([0, e[2], -e[1]]) && overlap([-e[2], 0, e[0]]) && overlap([e[1], -e[0], 0]));
}

export function rasterizeGI(world: GIWorldSource, config: GISolveConfig): GIGrid {
  const { origin, size, pitch } = config, count = size[0] * size[1] * size[2];
  const grid: GIGrid = { origin, size, pitch, albedo: new Uint32Array(count), emission: new Uint32Array(count), world, rays: 0 };
  const paint = (bounds: number[], color: number, emission: number, triangle?: number[]) => {
    const low = origin.map((v, axis) => Math.max(0, Math.floor((bounds[axis] - v) / pitch))) as V3;
    const high = origin.map((v, axis) => Math.min(size[axis] - 1, Math.floor((bounds[axis + 3] - v) / pitch))) as V3;
    for (let z = low[2]; z <= high[2]; z++) for (let y = low[1]; y <= high[1]; y++) for (let x = low[0]; x <= high[0]; x++) {
      const center: V3 = [origin[0] + (x + .5) * pitch, origin[1] + (y + .5) * pitch, origin[2] + (z + .5) * pitch];
      if (triangle && !triangleBoxOverlap(triangle, center, pitch / 2)) continue;
      const at = giIndex(x, y, z, size); grid.albedo[at] = color;
      if (emission) grid.emission[at] = emission;
    }
  };
  const depleted = new Set(config.depleted);
  for (const object of world.objects) {
    if ([0, 1, 2].some(axis => object.bounds[axis] > origin[axis] + size[axis] * pitch || object.bounds[axis + 3] < origin[axis])) continue;
    for (const triangles of [object.triangles, depleted.has(object.id) ? object.depletedTriangles : object.availableTriangles]) for (let i = 0; i < triangles.length; i += 15) {
      const triangle = [...triangles.subarray(i, i + 9)];
      const low = [0, 1, 2].map(axis => Math.min(triangle[axis], triangle[axis + 3], triangle[axis + 6]));
      const high = [0, 1, 2].map(axis => Math.max(triangle[axis], triangle[axis + 3], triangle[axis + 6]));
      const color = packRGB(triangles[i + 9], triangles[i + 10], triangles[i + 11]);
      const emit = triangles[i + 12] + triangles[i + 13] + triangles[i + 14] > 0 ? packRGB(triangles[i + 12] / 4, triangles[i + 13] / 4, triangles[i + 14] / 4) : 0;
      paint([...low, ...high], color, emit, triangle);
    }
    const boxes = depleted.has(object.id) ? object.boxes?.depleted : object.boxes?.available;
    if (boxes) for (let i = 0; i < boxes.length; i += 7) {
      const h = boxes[i + 3] / 2 - 1e-5;
      paint([boxes[i] - h, boxes[i + 1] - h, boxes[i + 2] - h, boxes[i] + h, boxes[i + 1] + h, boxes[i + 2] + h], packRGB(boxes[i + 4], boxes[i + 5], boxes[i + 6]), 0);
    }
  }
  return grid;
}

export function solidAt(grid: GIGrid, point: V3): boolean {
  const c = point.map((v, axis) => Math.floor((v - grid.origin[axis]) / grid.pitch));
  return c.every((n, axis) => n >= 0 && n < grid.size[axis]) && grid.albedo[giIndex(c[0], c[1], c[2], grid.size)] !== 0;
}

/** Exact grid DDA, including blockers between sample endpoints and an implicit ground plane. */
export function traceGI(grid: GIGrid, start: V3, direction: V3, maxDistance = 24): GIHit | null {
  grid.rays++;
  const groundDistance = direction[1] < -1e-9 && start[1] >= 0 ? -start[1] / direction[1] : Infinity;
  let enter = 0, exit = Math.min(maxDistance, groundDistance);
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(direction[axis]) < 1e-10) { if (start[axis] < grid.origin[axis] || start[axis] >= grid.origin[axis] + grid.size[axis] * grid.pitch) { enter = Infinity; break; } continue; }
    const a = (grid.origin[axis] - start[axis]) / direction[axis], b = (grid.origin[axis] + grid.size[axis] * grid.pitch - start[axis]) / direction[axis];
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
  }
  if (enter < exit) {
    let distance = enter + 1e-5, normalAxis = 1, normalSign = 1;
    const p = grid.pitch, nx = grid.size[0], ny = grid.size[1], nz = grid.size[2], ox = grid.origin[0], oy = grid.origin[1], oz = grid.origin[2];
    const ax = start[0], ay = start[1], az = start[2], dx = direction[0], dy = direction[1], dz = direction[2];
    let x = Math.floor((ax + dx * distance - ox) / p), y = Math.floor((ay + dy * distance - oy) / p), z = Math.floor((az + dz * distance - oz) / p);
    const sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1, sz = dz >= 0 ? 1 : -1;
    const tx = Math.abs(dx) < 1e-10 ? Infinity : p / Math.abs(dx), ty = Math.abs(dy) < 1e-10 ? Infinity : p / Math.abs(dy), tz = Math.abs(dz) < 1e-10 ? Infinity : p / Math.abs(dz);
    let nextX = tx === Infinity ? Infinity : (ox + (x + Number(sx > 0)) * p - ax) / dx;
    let nextY = ty === Infinity ? Infinity : (oy + (y + Number(sy > 0)) * p - ay) / dy;
    let nextZ = tz === Infinity ? Infinity : (oz + (z + Number(sz > 0)) * p - az) / dz;
    while (distance < exit && x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz) {
      const at = (z * ny + y) * nx + x, packed = grid.albedo[at];
      if (packed) {
        const normal: V3 = [0, 0, 0]; normal[normalAxis] = normalSign; const emission = unpack(grid.emission[at]);
        return { distance, position: [ax + dx * distance, ay + dy * distance, az + dz * distance], normal, color: unpack(packed), emission: [emission[0] * 4, emission[1] * 4, emission[2] * 4] };
      }
      if (nextX <= nextY && nextX <= nextZ) { distance = nextX; nextX += tx; x += sx; normalAxis = 0; normalSign = -sx; }
      else if (nextY <= nextZ) { distance = nextY; nextY += ty; y += sy; normalAxis = 1; normalSign = -sy; }
      else { distance = nextZ; nextZ += tz; z += sz; normalAxis = 2; normalSign = -sz; }
    }
  }
  if (groundDistance >= 0 && groundDistance < maxDistance) {
    const position = start.map((v, axis) => v + direction[axis] * groundDistance) as V3;
    const x = Math.round(position[0]), z = Math.round(position[2]);
    const packed = x >= 0 && z >= 0 && x < grid.world.width && z < grid.world.height ? grid.world.ground[z * grid.world.width + x] : packRGB(.15, .18, .09);
    return { distance: groundDistance, position, normal: [0, 1, 0], color: unpack(packed), emission: [0, 0, 0] };
  }
  return null;
}

export function visibleGI(grid: GIGrid, a: V3, b: V3): boolean {
  return visibleSegment(grid, a[0], a[1], a[2], b[0], b[1], b[2]);
}

/** Allocation-free segment DDA: the high-volume interpolation path needs only visibility. */
function visibleSegment(grid: GIGrid, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  grid.rays++;
  const dx = bx - ax, dy = by - ay, dz = bz - az, distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-5) return true;
  if (ay < 0 || by < 0) return false;
  const p = grid.pitch, ox = grid.origin[0], oy = grid.origin[1], oz = grid.origin[2], nx = grid.size[0], ny = grid.size[1], nz = grid.size[2];
  let x = Math.floor((ax - ox) / p), y = Math.floor((ay - oy) / p), z = Math.floor((az - oz) / p);
  if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return !traceGI(grid, [ax, ay, az], [dx / distance, dy / distance, dz / distance], distance - .01);
  const sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1, sz = dz >= 0 ? 1 : -1;
  const tx = Math.abs(dx) < 1e-10 ? Infinity : p / Math.abs(dx), ty = Math.abs(dy) < 1e-10 ? Infinity : p / Math.abs(dy), tz = Math.abs(dz) < 1e-10 ? Infinity : p / Math.abs(dz);
  let nextX = tx === Infinity ? Infinity : (ox + (x + Number(sx > 0)) * p - ax) / dx;
  let nextY = ty === Infinity ? Infinity : (oy + (y + Number(sy > 0)) * p - ay) / dy;
  let nextZ = tz === Infinity ? Infinity : (oz + (z + Number(sz > 0)) * p - az) / dz;
  let t = 0; const end = Math.max(0, 1 - .01 / distance);
  while (t < end && x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz) {
    if (grid.albedo[(z * ny + y) * nx + x]) return false;
    if (nextX <= nextY && nextX <= nextZ) { t = nextX; nextX += tx; x += sx; }
    else if (nextY <= nextZ) { t = nextY; nextY += ty; y += sy; }
    else { t = nextZ; nextZ += tz; z += sz; }
  }
  return true;
}

export function traceProbe(grid: GIGrid, position: V3, config: GISolveConfig): Float32Array | null {
  if (solidAt(grid, position)) return null;
  const coefficients = new Float32Array(13); let sky = 0, skyTotal = 0;
  const directions = Math.max(8, config.rays), angle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < directions; i++) {
    const y = 1 - 2 * (i + .5) / directions, r = Math.sqrt(1 - y * y), phi = i * angle;
    const dir: V3 = [Math.cos(phi) * r, y, Math.sin(phi) * r], weight = Math.max(0, y);
    skyTotal += weight;
    const hit = traceGI(grid, position, dir);
    if (!hit) { sky += weight; continue; }
    if (config.aoDistance !== undefined) {
      // AO is local; full-distance GI visibility and radiance remain unchanged.
      const t = Math.max(0, Math.min(1, hit.distance / Math.max(.01, config.aoDistance)));
      sky += weight * t * t * (3 - 2 * t);
    }
    const origin = hit.position.map((v, axis) => v + hit.normal[axis] * grid.pitch * .05) as V3;
    const ndotl = Math.max(0, hit.normal.reduce((sum, n, axis) => sum + n * config.sunDirection[axis], 0));
    const sun = ndotl && !traceGI(grid, origin, config.sunDirection) ? ndotl * config.sunPower : 0;
    const open = !traceGI(grid, origin, [0, 1, 0]) ? config.skyPower * (.5 + .5 * Math.max(0, hit.normal[1])) : 0;
    const incident = config.sunColor.map((v, axis) => v * sun + config.skyColor[axis] * open) as V3;
    for (const lamp of config.lamps) {
      const delta = lamp.position.map((v, axis) => v - origin[axis]) as V3, distance = Math.hypot(...delta);
      if (distance < .05 || distance >= lamp.distance) continue;
      const cosine = Math.max(0, hit.normal.reduce((sum, n, axis) => sum + n * delta[axis] / distance, 0));
      if (!cosine || !visibleGI(grid, origin, lamp.position)) continue;
      const power = cosine * lamp.intensity * Math.max(0, 1 - (distance / lamp.distance) ** 4) ** 2 / Math.max(.25, distance * distance);
      for (let channel = 0; channel < 3; channel++) incident[channel] += lamp.color[channel] * power;
    }
    const basis = [.282095, .488603 * dir[0], .488603 * dir[1], .488603 * dir[2]];
    for (let channel = 0; channel < 3; channel++) {
      const radiance = Math.min(8, hit.emission[channel] + hit.color[channel] * incident[channel] / Math.PI);
      for (let coefficient = 0; coefficient < 4; coefficient++) coefficients[coefficient * 3 + channel] += radiance * basis[coefficient] * (4 * Math.PI / directions) * (coefficient === 0 ? Math.PI : 2 * Math.PI / 3);
    }
  }
  coefficients[12] = skyTotal ? sky / skyTotal : 1; return coefficients;
}

/** Visibility-weighted interpolation is baked once; the fragment shader needs four texture lookups. */
export function interpolateGI(grid: GIGrid, point: V3, probes: (Float32Array | null)[], resolution: V3, stride: number, result = new Float32Array(13)): Float32Array {
  const spacing = grid.pitch * stride;
  const cx = (point[0] - grid.origin[0] - grid.pitch / 2) / spacing, cy = (point[1] - grid.origin[1] - grid.pitch / 2) / spacing, cz = (point[2] - grid.origin[2] - grid.pitch / 2) / spacing;
  const x0 = Math.floor(cx), y0 = Math.floor(cy), z0 = Math.floor(cz), fx = cx - x0, fy = cy - y0, fz = cz - z0;
  result.fill(0); let sum = 0;
  for (let corner = 0; corner < 8; corner++) {
    const x = Math.max(0, Math.min(resolution[0] - 1, x0 + (corner & 1))), y = Math.max(0, Math.min(resolution[1] - 1, y0 + ((corner >> 1) & 1))), z = Math.max(0, Math.min(resolution[2] - 1, z0 + ((corner >> 2) & 1)));
    const weight = (corner & 1 ? fx : 1 - fx) * (corner & 2 ? fy : 1 - fy) * (corner & 4 ? fz : 1 - fz);
    if (weight < 1e-6) continue;
    const probe = probes[giIndex(x, y, z, resolution)]; if (!probe) continue;
    if (!visibleSegment(grid, point[0], point[1], point[2], grid.origin[0] + x * spacing + grid.pitch / 2, grid.origin[1] + y * spacing + grid.pitch / 2, grid.origin[2] + z * spacing + grid.pitch / 2)) continue;
    sum += weight; for (let i = 0; i < 13; i++) result[i] += weight * probe[i];
  }
  if (sum) for (let i = 0; i < 13; i++) result[i] /= sum;
  return result;
}
