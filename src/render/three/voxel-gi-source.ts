import { Box3, Color, Mesh, SRGBColorSpace, Vector2, Vector3, type Group, type Material, type MeshStandardMaterial, type Texture } from "three";
import type { ObjectArt } from "./contracts";
import type { WorldDefinition } from "../../rpg/types";
import type { VoxelLevel } from "./voxel-data";
import { packRGB, type GIObjectSource, type GIWorldSource } from "./voxel-gi-core";

interface Pixels { data: ArrayLike<number>; width: number; height: number }
const images = new WeakMap<Texture, Pixels | null>();
function pixels(texture: Texture): Pixels | null {
  if (images.has(texture)) return images.get(texture)!;
  const image = texture.image as { data?: ArrayLike<number>; width?: number; height?: number };
  let result: Pixels | null = null;
  if (image?.width && image.height) {
    if (image.data) result = { data: image.data, width: image.width, height: image.height };
    else try {
      const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
      context?.drawImage(texture.image as CanvasImageSource, 0, 0);
      if (context) result = { data: context.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
    } catch { /* Missing bitmap data retains the material's declared base color. */ }
  }
  images.set(texture, result); return result;
}

function sample(texture: Texture | null | undefined, uv: Vector2, target: Color): Color {
  if (!texture) return target.setRGB(1, 1, 1);
  const image = pixels(texture); if (!image) return target.setRGB(1, 1, 1);
  const at = texture.transformUv(uv.clone());
  const x = Math.max(0, Math.min(image.width - 1, Math.floor(at.x * image.width))), y = Math.max(0, Math.min(image.height - 1, Math.floor(at.y * image.height)));
  const i = (y * image.width + x) * 4;
  return target.setRGB(image.data[i] / 255, image.data[i + 1] / 255, image.data[i + 2] / 255, texture.colorSpace === SRGBColorSpace ? SRGBColorSpace : undefined);
}

function captureTriangles(group: Group, exclude: Group[] = []): Float32Array {
  const output: number[] = [], color = new Color(), map = new Color(), emission = new Color(), uv = new Vector2(), p = new Vector3();
  group.updateWorldMatrix(true, true);
  group.traverse(node => {
    if (!(node instanceof Mesh)) return;
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) if (exclude.includes(ancestor as Group)) return;
    const geometry = node.geometry, positions = geometry.getAttribute("position"), colors = geometry.getAttribute("color"), uvs = geometry.getAttribute("uv");
    if (!positions) return;
    const count = geometry.index?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      const indices = [0, 1, 2].map(j => geometry.index ? geometry.index.getX(i + j) : i + j);
      const materialIndex = geometry.groups.find((g: { start: number; count: number; materialIndex?: number }) => i >= g.start && i < g.start + g.count)?.materialIndex ?? 0;
      const material = (Array.isArray(node.material) ? node.material[materialIndex] : node.material) as MeshStandardMaterial;
      if (!material || material.opacity < .2) continue;
      for (const index of indices) { p.fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld); output.push(p.x, p.y, p.z); }
      color.copy(material.color ?? new Color(1, 1, 1));
      if (colors && material.vertexColors) color.multiply(new Color().setRGB(indices.reduce((s, n) => s + colors.getX(n), 0) / 3, indices.reduce((s, n) => s + colors.getY(n), 0) / 3, indices.reduce((s, n) => s + colors.getZ(n), 0) / 3));
      uv.set(uvs ? indices.reduce((s, n) => s + uvs.getX(n), 0) / 3 : .5, uvs ? indices.reduce((s, n) => s + uvs.getY(n), 0) / 3 : .5);
      color.multiply(sample(material.map, uv, map));
      emission.copy(material.emissive ?? new Color(0, 0, 0)).multiplyScalar(material.emissiveIntensity ?? 1).multiply(sample(material.emissiveMap, uv, map));
      output.push(color.r, color.g, color.b, emission.r, emission.g, emission.b);
    }
  });
  return new Float32Array(output);
}

function captureBoxes(level: VoxelLevel, group: Group): Float32Array {
  const result = new Float32Array(level.count * 7), p = new Vector3(), scale = group.getWorldScale(new Vector3());
  for (let i = 0; i < level.count; i++) {
    p.fromArray(level.centers, i * 3).applyMatrix4(group.matrixWorld);
    result.set([p.x, p.y, p.z, level.pitch * Math.max(scale.x, scale.y, scale.z), level.colors[i * 3], level.colors[i * 3 + 1], level.colors[i * 3 + 2]], i * 7);
  }
  return result;
}

export function captureGIWorld(objects: Iterable<{ object: { id: string }; art: ObjectArt }>, world: Pick<WorldDefinition, "width" | "height"> & { terrain: Readonly<WorldDefinition["terrain"]> }, terrain: Record<string, Material>): GIWorldSource {
  const sources: GIObjectSource[] = [];
  for (const { object, art } of objects) {
    // A camera-facing alpha cutout is not a solid rectangular transport blocker.
    if (art.group.userData.pixelUnit) continue;
    art.group.updateWorldMatrix(true, true);
    if (art.voxels) {
      const radius = art.voxels.model.radius, point = art.group.getWorldPosition(new Vector3());
      sources.push({ id: object.id, triangles: new Float32Array(), availableTriangles: new Float32Array(), depletedTriangles: new Float32Array(),
        boxes: { available: captureBoxes(art.voxels.model.lighting, art.group), depleted: art.voxels.depleted ? captureBoxes(art.voxels.depleted.lighting, art.group) : undefined },
        bounds: [point.x - radius, point.y - radius, point.z - radius, point.x + radius, point.y + radius, point.z + radius] });
    } else {
      const bounds = new Box3().setFromObject(art.group);
      if (bounds.isEmpty()) continue;
      sources.push({ id: object.id, bounds: [...bounds.min.toArray(), ...bounds.max.toArray()], triangles: captureTriangles(art.group, [art.available, art.depleted].filter(Boolean) as Group[]),
        availableTriangles: art.available ? captureTriangles(art.available) : new Float32Array(), depletedTriangles: art.depleted ? captureTriangles(art.depleted) : new Float32Array() });
    }
  }
  const ground = new Uint32Array(world.terrain.length), rgb = new Map<string, number>();
  for (const name of new Set(world.terrain)) {
    const material = terrain[name] as MeshStandardMaterial, color = material.color.clone().multiply(sample(material.map, new Vector2(.5, .5), new Color()));
    rgb.set(name, packRGB(color.r, color.g, color.b));
  }
  world.terrain.forEach((name, index) => { ground[index] = rgb.get(name)!; });
  return { objects: sources, ground, width: world.width, height: world.height };
}
