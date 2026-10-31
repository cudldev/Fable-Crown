import type { Terrain } from "../../rpg/types";

interface Surface { width: number; height: number; terrain: readonly Terrain[] }
interface VertexArrays { positions: number[]; normals: number[]; uvs: number[] }
/** Close the dry-ground/water height gap with textured vertical bank faces. */
export function appendShoreSkirts(target: VertexArrays, world: Surface, x: number, z: number, waterHeight: number, uv: readonly [number, number, number, number]): number {
  const [u0, v0, u1, v1] = uv, low = waterHeight - .125;
  const edges = [
    { dx: 0, dz: -1, a: [.5, -.5, u1, v1], b: [-.5, -.5, u0, v1] },
    { dx: 1, dz: 0, a: [.5, .5, u1, v0], b: [.5, -.5, u1, v1] },
    { dx: 0, dz: 1, a: [-.5, .5, u0, v0], b: [.5, .5, u1, v0] },
    { dx: -1, dz: 0, a: [-.5, -.5, u0, v1], b: [-.5, .5, u0, v0] },
  ];
  let vertices = 0;
  for (const { dx, dz, a, b } of edges) {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= world.width || nz >= world.height || world.terrain[nz * world.width + nx] !== "water") continue;
    for (const [point, y] of [[a, 0], [a, low], [b, low], [a, 0], [b, low], [b, 0]] as const) {
      target.positions.push(x + point[0], y, z + point[1]); target.normals.push(dx, 0, dz); target.uvs.push(point[2], point[3]); vertices++;
    }
  }
  return vertices;
}
