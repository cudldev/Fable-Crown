import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Vector3, type Scene } from "three";
import type { Terrain, WorldDefinition } from "../../rpg/types";
import type { VisualSettings } from "./visual-settings";
import { parseVox } from "./voxel-data";
import { groundPivotDepthGLSL } from "./pivot-depth";
import grassVox from "../../../assets/source/voxel/ground-foliage-v1/grass.vox?url&inline";
import fernVox from "../../../assets/source/voxel/ground-foliage-v1/fern.vox?url&inline";
import flowerVox from "../../../assets/source/voxel/ground-foliage-v1/flower.vox?url&inline";
import reedVox from "../../../assets/source/voxel/ground-foliage-v1/reed.vox?url&inline";

export const FOLIAGE_PITCH = .0625;
export const FOLIAGE_RADIUS = 28;
const WINDOW_RADIUS = 34, CAPACITY = 12000;
export const FOLIAGE_KINDS = ["grass", "fern", "flower", "reed"] as const;
export type FoliageKind = typeof FOLIAGE_KINDS[number];
export interface FoliageLayout { width: number; height: number; habitat: Uint8Array; seed: number }
export interface FoliagePlant { x: number; z: number; kind: FoliageKind; angle: number; rank: number; tint: number }
// Ground cells have boundaries at multiples of pitch and centres at half a cell.
const voxelCenter = (position: number) => (Math.floor(position / FOLIAGE_PITCH) + .5) * FOLIAGE_PITCH;
const random = (x: number, z: number, seed: number) => {
  let h = Math.imul(x + 17, 374761393) ^ Math.imul(z + 31, 668265263) ^ seed;
  h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296;
};

/** Cosmetic habitat only. Never modifies terrain, collision, resources or the gameplay RNG. */
export function buildFoliageLayout(world: WorldDefinition, terrain: readonly Terrain[] = world.terrain): FoliageLayout {
  const { width, height } = world, habitat = new Uint8Array(width * height), excluded = new Uint8Array(habitat.length), woodland = new Uint8Array(habitat.length);
  let seed = 0; for (const char of world.id) seed = Math.imul(seed, 31) + char.charCodeAt(0) | 0;
  const visit = (x0: number, z0: number, x1: number, z1: number, apply: (i: number) => void) => {
    for (let z = Math.max(0, Math.ceil(z0)); z <= Math.min(height - 1, Math.floor(z1)); z++)
      for (let x = Math.max(0, Math.ceil(x0)); x <= Math.min(width - 1, Math.floor(x1)); x++) apply(z * width + x);
  };
  for (const object of world.objects) {
    const { x, y: z } = object.position;
    if (object.kind === "tree") visit(x - 3, z - 3, x + 3, z + 3, i => { woodland[i] = 1; });
    // Includes open doors, quest/service tiles, crops, bridges and nonblocking decorations.
    if (object.kind !== "landmark" || object.art) {
      const margin = object.kind === "tree" ? .45 : 1;
      visit(x - margin, z - margin, x + object.width - 1 + margin, z + object.height - 1 + margin, i => { excluded[i] = 1; });
    }
  }
  const at = (x: number, z: number) => x >= 0 && z >= 0 && x < width && z < height ? terrain[z * width + x] : undefined;
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x, kind = terrain[i];
    if (excluded[i] || world.collision[i] || (kind !== "grass" && kind !== "sand")) continue;
    const neighbours = [at(x - 1, z), at(x + 1, z), at(x, z - 1), at(x, z + 1)];
    if (neighbours.some(t => t === "dirt" || t === "stone")) continue;
    habitat[i] = neighbours.includes("water") ? 3 : kind === "grass" ? woodland[i] ? 2 : 1 : 0;
  }
  return { width, height, habitat, seed };
}

/** Fixed world-coordinate patches keep their identities across camera moves and density changes. */
export function foliagePlants(layout: FoliageLayout, x0: number, z0: number, x1: number, z1: number): FoliagePlant[] {
  const plants: FoliagePlant[] = [];
  for (let z = Math.max(0, Math.ceil(z0)); z <= Math.min(layout.height - 1, Math.floor(z1)); z++) {
    for (let x = Math.max(0, Math.ceil(x0)); x <= Math.min(layout.width - 1, Math.floor(x1)); x++) {
      const habitat = layout.habitat[z * layout.width + x]; if (!habitat) continue;
      const patch = random(Math.floor(x / 4), Math.floor(z / 4), layout.seed);
      if (patch < .23) continue;
      for (let n = 0; n < (patch > .65 ? 3 : 2); n++) {
        const r = random(x, z, layout.seed + n * 139 + 71);
        if (r > .58 + patch * .3) continue;
        const kind: FoliageKind = habitat === 3 ? "reed" : habitat === 2 && r < .5 ? "fern" : r < .055 ? "flower" : "grass";
        plants.push({ x: voxelCenter(x + (random(x, z, layout.seed + n * 173 + 11) - .5) * .7), z: voxelCenter(z + (random(x, z, layout.seed + n * 197 + 29) - .5) * .7),
          kind, angle: Math.floor(r * 4) * Math.PI / 2, rank: random(x, z, layout.seed + n * 211 + 97), tint: .88 + random(x, z, layout.seed + n * 223 + 131) * .16 });
      }
    }
  }
  return plants;
}

type Cell = readonly [number, number, number, number];
const sources: Record<FoliageKind, string> = { grass: grassVox, fern: fernVox, flower: flowerVox, reed: reedVox };
const cellCache = new Map<FoliageKind, Cell[]>();
/** Editable native VOX, inlined by Vite: no runtime fetch or second source of geometry. */
export function foliageCells(kind: FoliageKind): Cell[] {
  const cached = cellCache.get(kind); if (cached) return cached;
  const bytes = Uint8Array.from(atob(sources[kind].split(",")[1]), char => char.charCodeAt(0)), grid = parseVox(bytes.buffer);
  if (grid.size.join(",") !== "9,9,16") throw Error("Foliage needs a 9×9×16 native frame and ground pivot [4.5,4.5,0].");
  const out: Cell[] = [];
  for (let x = 0; x < 9; x++) for (let y = 0; y < 9; y++) for (let z = 0; z < 16; z++) {
    const id = grid.cells[(x * 9 + y) * 16 + z]; if (!id) continue;
    const p = (id - 1) * 4;
    if (grid.palette[p + 3] !== 255) throw Error("Foliage requires opaque native palette cells.");
    out.push([x - 4, z, 4 - y, grid.palette[p] << 16 | grid.palette[p + 1] << 8 | grid.palette[p + 2]]);
  }
  cellCache.set(kind, out); return out;
}

/** Exposed cell faces only; instances repeat whole clumps, not individual cubes. */
export function foliageGeometry(kind: FoliageKind): BufferGeometry {
  const source = foliageCells(kind), occupied = new Set(source.map(([x, y, z]) => `${x}:${y}:${z}`));
  const box = new BoxGeometry(FOLIAGE_PITCH, FOLIAGE_PITCH, FOLIAGE_PITCH), p = box.getAttribute("position"), n = box.getAttribute("normal"), indices = box.index!;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], color = new Color();
  for (const [x, y, z, hex] of source) {
    color.setHex(hex);
    for (let face = 0; face < 6; face++) {
      const first = indices.getX(face * 6), nx = n.getX(first), ny = n.getY(first), nz = n.getZ(first);
      if (occupied.has(`${x + nx}:${y + ny}:${z + nz}`)) continue;
      for (let j = 0; j < 6; j++) {
        const i = indices.getX(face * 6 + j);
        positions.push(p.getX(i) + x * FOLIAGE_PITCH, p.getY(i) + (y + .5) * FOLIAGE_PITCH, p.getZ(i) + z * FOLIAGE_PITCH);
        normals.push(nx, ny, nz); colors.push(color.r, color.g, color.b);
      }
    }
  }
  box.dispose();
  const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3)); geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

export class FoliageSystem {
  readonly stats = { plants: 0, visiblePlants: 0, uploads: 0, windTime: 0 };
  readonly meshes: InstancedMesh[] = [];
  private layout?: FoliageLayout;
  private centerX = Infinity; private centerZ = Infinity; private previousTime?: number;
  private density = -1;
  private countedAt = -Infinity;
  private uniforms = { foliageTime: { value: 0 }, foliageWind: { value: 1 }, foliageDensity: { value: 1 }, foliageTarget: { value: new Vector3() } };
  constructor(private scene: Scene) {
    for (const kind of FOLIAGE_KINDS) {
      const geometry = foliageGeometry(kind);
      geometry.setAttribute("foliageRank", new InstancedBufferAttribute(new Float32Array(CAPACITY), 1));
      // Two depth-buffer units resolve coplanar support rounding at long camera
      // distances; geometry and native-grid placement remain exactly grounded.
      const material = new MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -2 }); material.name = `foliage-${kind}`;
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = `attribute float foliageRank; uniform float foliageTime,foliageWind; uniform vec3 foliageTarget; varying float vFoliageRank,vFoliageDistance;\n` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          vec3 plantRoot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
          float wave=sin(dot(plantRoot.xz,vec2(.37,.21))-foliageTime*1.8);
          float gust=.55+.45*sin(dot(plantRoot.xz,vec2(.09,-.13))-foliageTime*.65);
          vec3 windWorld=vec3(.88,0.,.47)*(.3+wave*.45)*gust*foliageWind;
          vec3 windLocal=vec3(dot(instanceMatrix[0].xyz,windWorld),0.,dot(instanceMatrix[2].xyz,windWorld));
          transformed+=windLocal*max(position.y,0.)*max(position.y,0.)*.65;
          vFoliageRank=foliageRank; vFoliageDistance=distance(plantRoot.xz,foliageTarget.xz);
        `);
        // Each voxel column keeps its own support position. Collapsing the
        // entire clump to plantRoot puts its front base faces behind the floor.
        shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
          vec3 foliageSupport=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xyz;
          foliageSupport.y=plantRoot.y;
        ` + groundPivotDepthGLSL("foliageSupport"));
        shader.fragmentShader = `uniform float foliageDensity; varying float vFoliageRank,vFoliageDistance;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
          float foliageFade=1.-smoothstep(18.,${FOLIAGE_RADIUS.toFixed(1)},vFoliageDistance);
          if(vFoliageRank>=foliageDensity*foliageFade) discard;
        `);
      };
      material.customProgramCacheKey = () => "fable-foliage-support-depth-v2";
      const mesh = new InstancedMesh(geometry, material, CAPACITY); mesh.name = `wind-${kind}`; mesh.count = 0;
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.raycast = () => {};
      this.meshes.push(mesh); scene.add(mesh);
    }
  }
  setWorld(world: WorldDefinition, terrain?: readonly Terrain[]) {
    this.layout = buildFoliageLayout(world, terrain); this.centerX = this.centerZ = Infinity;
  }
  update(time: number, target: Vector3, visual: Readonly<VisualSettings>, overview: boolean, reducedMotion = false) {
    const delta = this.previousTime === undefined ? 0 : Math.max(0, Math.min(100, time - this.previousTime)) * .001;
    this.previousTime = time;
    const enabled = visual.foliageEnabled && visual.foliageDensity > 0 && !overview;
    // Freeze phase without snapping; reduced motion also straightens the plants.
    if (enabled && !reducedMotion && visual.windStrength > 0) this.stats.windTime += delta;
    this.uniforms.foliageTime.value = this.stats.windTime;
    this.uniforms.foliageWind.value = reducedMotion ? 0 : visual.windStrength;
    this.uniforms.foliageDensity.value = visual.foliageDensity; this.uniforms.foliageTarget.value.copy(target);
    for (const mesh of this.meshes) mesh.visible = enabled;
    if (!enabled || !this.layout) { this.stats.visiblePlants = 0; return; }
    const x = Math.round(target.x / 8) * 8, z = Math.round(target.z / 8) * 8;
    if (x !== this.centerX || z !== this.centerZ || this.density !== visual.foliageDensity) {
      this.centerX = x; this.centerZ = z; this.density = visual.foliageDensity;
      const plants = foliagePlants(this.layout, x - WINDOW_RADIUS, z - WINDOW_RADIUS, x + WINDOW_RADIUS, z + WINDOW_RADIUS)
        .filter(plant => plant.rank < visual.foliageDensity && Math.hypot(plant.x - x, plant.z - z) <= WINDOW_RADIUS);
      const matrix = new Matrix4(), color = new Color(); this.stats.plants = 0;
      for (let k = 0; k < FOLIAGE_KINDS.length; k++) {
        const mesh = this.meshes[k], ranks = mesh.geometry.getAttribute("foliageRank") as InstancedBufferAttribute; let count = 0;
        for (const plant of plants) {
          if (plant.kind !== FOLIAGE_KINDS[k] || count === CAPACITY) continue;
          matrix.makeRotationY(plant.angle); matrix.setPosition(plant.x, 0, plant.z); mesh.setMatrixAt(count, matrix);
          mesh.setColorAt(count, color.setScalar(plant.tint)); ranks.setX(count, plant.rank); count++;
        }
        mesh.count = count; mesh.instanceMatrix.needsUpdate = true; ranks.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        // Account for wind outside the static clump bounds in both game/reflection cameras.
        if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
        this.stats.plants += count;
      }
      this.stats.uploads++;
      this.countedAt = -Infinity;
    }
    // Diagnostics count the same stable clump thinning used by the fragment shader.
    if (time - this.countedAt < 500) return;
    this.countedAt = time; this.stats.visiblePlants = 0;
    for (const mesh of this.meshes) {
      const ranks = mesh.geometry.getAttribute("foliageRank");
      for (let i = 0; i < mesh.count; i++) {
        const a = mesh.instanceMatrix.array, distance = Math.hypot(a[i * 16 + 12] - target.x, a[i * 16 + 14] - target.z);
        const t = Math.max(0, Math.min(1, (distance - 18) / (FOLIAGE_RADIUS - 18))), fade = 1 - t * t * (3 - 2 * t);
        if (ranks.getX(i) < visual.foliageDensity * fade) this.stats.visiblePlants++;
      }
    }
  }
  dispose() { for (const mesh of this.meshes) { this.scene.remove(mesh); mesh.dispose(); mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); } }
}
