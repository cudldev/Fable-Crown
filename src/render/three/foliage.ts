import { Box3, BufferGeometry, Color, DataTexture, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, NearestFilter, NearestMipmapNearestFilter, RGBAFormat, Sphere, SRGBColorSpace, Vector3, type Scene } from "three";
import type { Terrain, WorldDefinition } from "../../rpg/types";
import type { VisualSettings } from "./visual-settings";
import { groundPivotDepthGLSL } from "./pivot-depth";
import type { TerrainSurface } from "./terrain-tiles";
import { FOLIAGE_CARD_SIZE, FOLIAGE_PIXEL_METRES, foliageAtlas, foliageVariantCount } from "./foliage-art";

export const FOLIAGE_PITCH = FOLIAGE_PIXEL_METRES;
export const FOLIAGE_RADIUS = 28;
const WINDOW_RADIUS = 34, CAPACITY = 32000;
const SOURCE_CHUNK = 8, MAX_SOURCE_CHUNKS = 256;
const PREPARATION_MS = 2, TILES_PER_SLICE = 512, PLANTS_PER_SLICE = 2048, COUNTS_PER_SLICE = 512;
export const FOLIAGE_KINDS = ["grass", "fern", "flower", "reed", "groundcover", "bush", "shortgrass"] as const;
export type FoliageKind = typeof FOLIAGE_KINDS[number];
export interface FoliageLayout { width: number; height: number; habitat: Uint8Array; edge: Uint8Array; seed: number }
export interface FoliagePlant { x: number; z: number; kind: FoliageKind; angle: number; rank: number; tint: number }
// Ground cells have boundaries at multiples of pitch and centres at half a cell.
const voxelCenter = (position: number) => (Math.floor(position / FOLIAGE_PITCH) + .5) * FOLIAGE_PITCH;
const random = (x: number, z: number, seed: number) => {
  let h = Math.imul(x + 17, 374761393) ^ Math.imul(z + 31, 668265263) ^ seed;
  h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296;
};
/** Smooth spatial patches avoid a visible grid of equally dense 4×4 squares. */
function foliagePatch(x: number, z: number, seed: number): number {
  const gx = x / 5, gz = z / 5, ix = Math.floor(gx), iz = Math.floor(gz);
  const smooth = (n: number) => n * n * (3 - 2 * n), sx = smooth(gx - ix), sz = smooth(gz - iz);
  const a = random(ix, iz, seed), b = random(ix + 1, iz, seed), c = random(ix, iz + 1, seed), d = random(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

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
    habitat[i] = neighbours.includes("water") ? 3 : kind === "grass" ? woodland[i] ? 2 : 1 : 0;
  }
  const edge = new Uint8Array(habitat.length);
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x; if (!habitat[i]) continue;
    let distance = 3;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const step = Math.abs(dx) + Math.abs(dz); if (!step || step >= distance) continue;
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= width || nz >= height || !habitat[nz * width + nx]) distance = step;
    }
    edge[i] = distance;
  }
  return { width, height, habitat, edge, seed };
}

function plantAt(layout: FoliageLayout, x: number, z: number, kind: FoliageKind, slot: number, spread = .7, rankScale = 1): FoliagePlant {
  const r = random(x, z, layout.seed + slot * 139 + 71);
  const grassy = kind === "grass" || kind === "shortgrass";
  return { x: voxelCenter(x + (random(x, z, layout.seed + slot * 173 + 11) - .5) * spread),
    z: voxelCenter(z + (random(x, z, layout.seed + slot * 197 + 29) - .5) * spread), kind, angle: Math.floor(r * 4) * Math.PI / 2,
    rank: random(x, z, layout.seed + slot * 211 + 97) * rankScale,
    tint: (grassy ? .86 : .88) + random(x, z, layout.seed + slot * 223 + 131) * (grassy ? .22 : .16) };
}

/** Fixed world-coordinate patches keep their identities across camera moves and density changes. */
function foliageCandidates(layout: FoliageLayout, x0: number, z0: number, x1: number, z1: number): FoliagePlant[] {
  const plants: FoliagePlant[] = [];
  for (let z = Math.max(0, Math.ceil(z0)); z <= Math.min(layout.height - 1, Math.floor(z1)); z++) {
    for (let x = Math.max(0, Math.ceil(x0)); x <= Math.min(layout.width - 1, Math.floor(x1)); x++) {
      const at = z * layout.width + x, habitat = layout.habitat[at], edge = layout.edge[at]; if (!habitat) continue;
      const patch = foliagePatch(x, z, layout.seed);
      if (patch < .18) continue;
      // Low leaf mats connect the soil between tufts; shrubs anchor the deeper patches.
      if (habitat !== 3 && edge >= 2 && random(x, z, layout.seed + 3017) < .65 + patch * .3)
        plants.push(plantAt(layout, x, z, "groundcover", 17, 0, .6));
      if (habitat !== 3 && edge === 3 && patch > .58 && random(x, z, layout.seed + 3029) < (habitat === 2 ? .33 : .1))
        plants.push(plantAt(layout, x, z, "bush", 19, .4));
      if (patch < .26) continue;
      for (let n = 0; n < (patch > .52 ? 8 : 5); n++) {
        const r = random(x, z, layout.seed + n * 139 + 71);
        if (r > .32 + patch * .8) continue;
        const short = edge === 1 || patch < .42 || (edge === 2 && r < .5);
        const kind: FoliageKind = habitat === 3 ? "reed" : short ? "shortgrass" : habitat === 2 && r < .5 ? "fern" : "grass";
        plants.push(plantAt(layout, x, z, kind, n, edge === 1 ? .4 : .7));
      }
      // Flowers form their own patches, independent of grass species/slots.
      if (habitat !== 3 && edge >= 2 && foliagePatch(x + 101, z - 59, layout.seed ^ 0x4d52) > .62 && random(x, z, layout.seed + 3037) < .4)
        plants.push(plantAt(layout, x, z, "flower", 23, .35));
    }
  }
  return plants;
}

/** Remove coplanar intersections using stable world priorities, including a
 * neighbour halo so moving the camera cannot change which cards survive. */
export function foliagePlants(layout: FoliageLayout, x0: number, z0: number, x1: number, z1: number): FoliagePlant[] {
  const plants = foliageCandidates(layout, x0 - 1, z0 - 1, x1 + 1, z1 + 1), removed = new Set<number>();
  const columns = new Map<number, number[]>(), rows = new Map<number, number[]>();
  const insert = (map: Map<number, number[]>, lane: number, i: number) => {
    const entries = map.get(lane); if (entries) entries.push(i); else map.set(lane, [i]);
  };
  plants.forEach((plant, i) => {
    if (plant.kind === "groundcover") return; // One tile-aligned, nonoverlapping mat per tile.
    insert(columns, Math.round(plant.x / FOLIAGE_PITCH - .5), i);
    insert(rows, Math.round(plant.z / FOLIAGE_PITCH - .5), i);
  });
  for (const [lanes, axis] of [[columns, "z"], [rows, "x"]] as const) for (const entries of lanes.values()) {
    entries.sort((a, b) => plants[a][axis] - plants[b][axis]);
    for (let a = 0; a < entries.length; a++) for (let b = a + 1; b < entries.length; b++) {
      const ai = entries[a], bi = entries[b], first = plants[ai], second = plants[bi], distance = second[axis] - first[axis];
      if (distance >= 1) break;
      const reach = (FOLIAGE_CARD_SIZE[first.kind][0] + FOLIAGE_CARD_SIZE[second.kind][0]) / 2;
      if (distance >= reach - .00001) continue;
      const firstWins = first.rank < second.rank || (first.rank === second.rank && `${first.kind}:${first.tint}` < `${second.kind}:${second.tint}`);
      removed.add(firstWins ? bi : ai);
    }
  }
  return plants.filter((plant, i) => !removed.has(i) && Math.round(plant.x) >= Math.ceil(x0) && Math.round(plant.x) <= Math.floor(x1)
    && Math.round(plant.z) >= Math.ceil(z0) && Math.round(plant.z) <= Math.floor(z1));
}

/** Sample unlit native ground pigment at the card's actual foot, never a GPU readback. */
export function foliageGroundColor(surface: TerrainSurface, x: number, z: number, out = new Color()): Color {
  const tx = Math.round(x), tz = Math.round(z), [u0, v0, u1, v1] = surface.uvAt(tx, tz);
  const image = surface.texture.image, data = image.data;
  // Neutral tint preserves authored foliage if CPU ground pixels are unavailable.
  if (!data) return out.setRGB(1, 1, 1);
  const px = Math.max(0, Math.min(15, Math.floor((x - tx + .5) * 16))), pz = Math.max(0, Math.min(15, Math.floor((z - tz + .5) * 16)));
  let r = 0, g = 0, b = 0;
  for (let dz = -1; dz <= 1; dz += 2) for (let dx = -1; dx <= 1; dx += 2) {
    const u = u0 + (u1 - u0) * (Math.max(0, Math.min(15, px + dx)) + .5) / 16;
    const v = v1 - (v1 - v0) * (Math.max(0, Math.min(15, pz + dz)) + .5) / 16;
    const at = (Math.min(image.height - 1, Math.floor(v * image.height)) * image.width + Math.min(image.width - 1, Math.floor(u * image.width))) * 4;
    r += data[at]; g += data[at + 1]; b += data[at + 2];
  }
  return out.setRGB(r / 1020, g / 1020, b / 1020, SRGBColorSpace);
}

/** Two crossed upright cards, four triangles total. Feet remain on the native ground grid. */
export function foliageGeometry(kind: FoliageKind): BufferGeometry {
  const [width, height] = FOLIAGE_CARD_SIZE[kind], half = width / 2, geometry = new BufferGeometry();
  if (kind === "groundcover") {
    geometry.setAttribute("position", new Float32BufferAttribute([-half, .012, -height / 2, half, .012, -height / 2,
      half, .012, height / 2, -half, .012, height / 2], 3));
    geometry.setAttribute("normal", new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); geometry.setIndex([0, 2, 1, 0, 3, 2]);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  }
  geometry.setAttribute("position", new Float32BufferAttribute([-half, 0, 0, half, 0, 0, half, height, 0, -half, height, 0,
    0, 0, half, 0, 0, -half, 0, height, -half, 0, height, half], 3));
  geometry.setAttribute("normal", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

interface FoliageChunk { plants: FoliagePlant[]; colors: Float32Array; tiles: Map<number, number[]> }
interface FoliageStage { matrices: Float32Array; colors: Float32Array; ranks: Float32Array; count: number; bounds: Box3 }
interface FoliageWindow {
  x: number; z: number; density: number; x0: number; z0: number; width: number; height: number; cursor: number; committed: number;
  chunks: Map<string, FoliageChunk>;
}
interface FoliageCount { kind: number; index: number; visible: number; x: number; z: number; density: number }

export class FoliageSystem {
  readonly stats = { plants: 0, visiblePlants: 0, uploads: 0, windTime: 0,
    queued: 0, countQueued: 0, commits: 0, cancelled: 0, cacheChunks: 0, stagingBytes: 0, preparationMs: 0, maxSliceMs: 0 };
  readonly meshes: InstancedMesh[] = [];
  private layout?: FoliageLayout;
  private surface?: TerrainSurface;
  private sampleGround?: (x:number,z:number)=>number;
  private centerX = Infinity; private centerZ = Infinity; private previousTime?: number;
  private density = -1;
  private countedAt = -Infinity;
  private counts?: FoliageCount;
  private chunks = new Map<string, FoliageChunk>();
  private staging: FoliageStage[] = [];
  private job?: FoliageWindow;
  private pending?: { x: number; z: number; density: number };
  private rotations = [0, 1, 2, 3].map(turn => new Float32Array(new Matrix4().makeRotationY(turn * Math.PI / 2).elements));
  private bases = FOLIAGE_KINDS.map(kind => new Color(kind === "groundcover" ? 0x6e8749 : 0x7d944b));
  private color = new Color();
  private uniforms = { foliageTime: { value: 0 }, foliageWind: { value: 1 }, foliageDensity: { value: 1 }, foliageTarget: { value: new Vector3() } };
  private textures: DataTexture[] = [];
  constructor(private scene: Scene) {
    for (const kind of FOLIAGE_KINDS) {
      const geometry = foliageGeometry(kind);
      const capacity = kind === "groundcover" ? 4096 : kind === "bush" ? 2048 : kind === "shortgrass" ? 16000 : CAPACITY;
      geometry.setAttribute("foliageRank", new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage));
      const atlas = foliageAtlas(kind);
      const texture = new DataTexture(atlas.data, atlas.width, atlas.height, RGBAFormat);
      texture.name = `foliage-card-${kind}`; texture.colorSpace = SRGBColorSpace; texture.flipY = false;
      texture.magFilter = NearestFilter; texture.minFilter = NearestMipmapNearestFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
      this.textures.push(texture);
      // Two depth-buffer units resolve coplanar support rounding at long camera
      // distances; geometry and native-grid placement remain exactly grounded.
      const material = new MeshLambertMaterial({ map: texture, alphaTest: .5, transparent: false, side: DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -2 }); material.name = `foliage-${kind}`;
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.uniforms.foliageHeightScale = { value: 1 / FOLIAGE_CARD_SIZE[kind][1] };
        shader.uniforms.foliageNormalBlend = { value: 1 };
        shader.uniforms.foliageVariants = { value: foliageVariantCount(kind) };
        shader.vertexShader = `attribute float foliageRank; uniform float foliageTime,foliageWind,foliageHeightScale,foliageVariants; uniform vec3 foliageTarget; varying float vFoliageRank,vFoliageDistance,vFoliageHeight;\n` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
          #ifdef USE_MAP
            vec3 foliageUVRoot=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
            float foliageVariant=mod(floor(foliageUVRoot.x*16.0)*3.0+floor(foliageUVRoot.z*16.0)*5.0,foliageVariants);
            vMapUv.x=(vMapUv.x+foliageVariant)/foliageVariants;
          #endif
        `);
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          vec3 plantRoot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
          float wave=sin(dot(plantRoot.xz,vec2(.37,.21))-foliageTime*1.8);
          float gust=.55+.45*sin(dot(plantRoot.xz,vec2(.09,-.13))-foliageTime*.65);
          vec3 windWorld=vec3(.88,0.,.47)*(.3+wave*.45)*gust*foliageWind;
          vec3 windLocal=vec3(dot(instanceMatrix[0].xyz,windWorld),0.,dot(instanceMatrix[2].xyz,windWorld));
          transformed+=windLocal*max(position.y,0.)*max(position.y,0.)*.65;
          vFoliageRank=foliageRank; vFoliageDistance=distance(plantRoot.xz,foliageTarget.xz);
          vFoliageHeight=position.y*foliageHeightScale;
        `);
        // Each card column keeps its own support position. Collapsing the
        // entire clump to plantRoot puts its front base faces behind the floor.
        shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
          vec3 foliageSupport=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xyz;
          foliageSupport.y=plantRoot.y;
        ` + groundPivotDepthGLSL("foliageSupport"));
        shader.fragmentShader = `uniform float foliageDensity,foliageNormalBlend; varying float vFoliageRank,vFoliageDistance,vFoliageHeight;\n` + shader.fragmentShader;
        // Blend after double-sided face correction so back faces still receive
        // upward ground lighting instead of flipping that component downward.
        shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          vec3 foliageUp=normalize((viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz);
          float foliageUpWeight=mix(.85,.55,smoothstep(0.0,.8,vFoliageHeight))*foliageNormalBlend;
          normal=normalize(mix(normal,foliageUp,foliageUpWeight));
        `);
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
          #ifdef USE_COLOR_ALPHA
            diffuseColor*=vColor;
          #elif defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
            diffuseColor.rgb*=mix(vColor.rgb,vec3(1.0),smoothstep(0.0,.8,vFoliageHeight)*.15);
          #endif
        `);
        shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
          float foliageFade=1.-smoothstep(18.,${FOLIAGE_RADIUS.toFixed(1)},vFoliageDistance);
          if(vFoliageRank>=foliageDensity*foliageFade) discard;
        `);
      };
      material.customProgramCacheKey = () => "fable-foliage-quiet-tips-variants-v6";
      const mesh = new InstancedMesh(geometry, material, capacity); mesh.name = `wind-${kind}`; mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      // Keep the instancing-color shader variant stable even for currently empty kinds.
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
      this.staging.push({ matrices: new Float32Array(0), colors: new Float32Array(0), ranks: new Float32Array(0), count: 0, bounds: new Box3() });
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.raycast = () => {};
      this.meshes.push(mesh); scene.add(mesh);
    }
  }
  setWorld(world: WorldDefinition, terrain?: readonly Terrain[], surface?: TerrainSurface, sampleGround?: (x:number,z:number)=>number, _groundRevision?:string|number) {
    this.sampleGround=sampleGround;
    this.layout = buildFoliageLayout(world, terrain); this.surface = surface; this.centerX = this.centerZ = Infinity;
    this.chunks.clear(); this.job = this.pending = undefined; this.counts = undefined;
    this.stats.plants = this.stats.visiblePlants = this.stats.queued = this.stats.countQueued = this.stats.cacheChunks = 0;
    for (const mesh of this.meshes) mesh.count = 0;
    this.countedAt = -Infinity;
  }

  /** Cache stable source cells/tint once. The one-cell collision halo is identical
   * to foliagePlants, so adjacent chunks retain exactly the same accepted cards. */
  private chunk(x: number, z: number, job: FoliageWindow): FoliageChunk {
    const key = `${x}:${z}`, held = job.chunks.get(key); if (held) return held;
    let chunk = this.chunks.get(key);
    if (chunk) this.chunks.delete(key); // Touch this chunk once per window, not per tile.
    else {
      const plants = foliagePlants(this.layout!, x * SOURCE_CHUNK, z * SOURCE_CHUNK, (x + 1) * SOURCE_CHUNK - 1, (z + 1) * SOURCE_CHUNK - 1);
      const colors = new Float32Array(plants.length * 3), tiles = new Map<number, number[]>();
      plants.forEach((plant, i) => {
        const base = this.bases[FOLIAGE_KINDS.indexOf(plant.kind)], color = this.color;
        if (this.surface && plant.kind !== "flower") {
          foliageGroundColor(this.surface, plant.x, plant.z, color).lerp(base, .3);
          color.setRGB(Math.max(.55, Math.min(1.7, color.r / base.r)), Math.max(.55, Math.min(1.7, color.g / base.g)), Math.max(.55, Math.min(1.7, color.b / base.b))).multiplyScalar(plant.tint);
        } else color.setScalar(plant.tint);
        if (plant.kind === "grass" || plant.kind === "shortgrass") {
          const warmth = (random(Math.floor(plant.x * 16), Math.floor(plant.z * 16), this.layout!.seed + 4151) - .5) * .06;
          color.setRGB(color.r * (1 + warmth), color.g, color.b * (1 - warmth * .6));
        }
        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
        const tile = Math.round(plant.z) * this.layout!.width + Math.round(plant.x), list = tiles.get(tile);
        if (list) list.push(i); else tiles.set(tile, [i]);
      });
      chunk = { plants, colors, tiles };
    }
    this.chunks.set(key, chunk); job.chunks.set(key, chunk);
    while (this.chunks.size > MAX_SOURCE_CHUNKS) this.chunks.delete(this.chunks.keys().next().value!);
    return chunk;
  }
  private beginWindow(request: { x: number; z: number; density: number }) {
    const x0 = Math.max(0, Math.ceil(request.x - WINDOW_RADIUS)), z0 = Math.max(0, Math.ceil(request.z - WINDOW_RADIUS));
    this.job = { ...request, x0, z0, width: Math.max(0, Math.min(this.layout!.width - 1, Math.floor(request.x + WINDOW_RADIUS)) - x0 + 1),
      height: Math.max(0, Math.min(this.layout!.height - 1, Math.floor(request.z + WINDOW_RADIUS)) - z0 + 1), cursor: 0, committed: 0, chunks: new Map() };
    for (const stage of this.staging) { stage.count = 0; stage.bounds.makeEmpty(); }
  }
  private prepareWindow() {
    const job = this.job!;
    const end = performance.now() + PREPARATION_MS; let tiles = 0, plants = 0, generated = 0;
    while (job.cursor < job.width * job.height && tiles < TILES_PER_SLICE && plants < PLANTS_PER_SLICE) {
      const x = job.x0 + job.cursor % job.width, z = job.z0 + Math.floor(job.cursor / job.width);
      const cx = Math.floor(x / SOURCE_CHUNK), cz = Math.floor(z / SOURCE_CHUNK), key = `${cx}:${cz}`;
      if (!job.chunks.has(key) && !this.chunks.has(key)) { if (generated === 2) break; generated++; }
      const chunk = this.chunk(cx, cz, job);
      for (const i of chunk.tiles.get(z * this.layout!.width + x) ?? []) {
        const plant = chunk.plants[i]; plants++;
        if (plant.rank >= job.density || Math.hypot(plant.x - job.x, plant.z - job.z) > WINDOW_RADIUS) continue;
        const k = FOLIAGE_KINDS.indexOf(plant.kind), stage = this.staging[k], at = stage.count;
        if (at === this.meshes[k].instanceMatrix.count) continue;
        if (at === stage.ranks.length) {
          const capacity = Math.min(this.meshes[k].instanceMatrix.count, Math.max(256, stage.ranks.length * 2));
          const matrices = new Float32Array(capacity * 16), colors = new Float32Array(capacity * 3), ranks = new Float32Array(capacity);
          matrices.set(stage.matrices); colors.set(stage.colors); ranks.set(stage.ranks);
          stage.matrices = matrices; stage.colors = colors; stage.ranks = ranks;
          this.stats.stagingBytes = this.staging.reduce((sum, item) => sum + item.matrices.byteLength + item.colors.byteLength + item.ranks.byteLength, 0);
        }
        stage.matrices.set(this.rotations[Math.round(plant.angle / (Math.PI / 2))], at * 16);
        stage.matrices[at * 16 + 12] = plant.x; stage.matrices[at * 16 + 14] = plant.z;
        const groundY=this.sampleGround?.(plant.x,plant.z)??0;stage.matrices[at*16+13]=groundY;
        stage.colors[at * 3] = chunk.colors[i * 3]; stage.colors[at * 3 + 1] = chunk.colors[i * 3 + 1]; stage.colors[at * 3 + 2] = chunk.colors[i * 3 + 2];
        stage.ranks[at] = plant.rank; stage.count++;
        const [width, height] = FOLIAGE_CARD_SIZE[plant.kind], half = width / 2;
        stage.bounds.min.x = Math.min(stage.bounds.min.x, plant.x - half); stage.bounds.max.x = Math.max(stage.bounds.max.x, plant.x + half);
        stage.bounds.min.z = Math.min(stage.bounds.min.z, plant.z - half); stage.bounds.max.z = Math.max(stage.bounds.max.z, plant.z + half);
        stage.bounds.min.y = Math.min(stage.bounds.min.y,groundY+(plant.kind === "groundcover" ? .012 : 0)); stage.bounds.max.y = Math.max(stage.bounds.max.y,groundY+(plant.kind === "groundcover" ? .012 : height));
      }
      job.cursor++; tiles++;
      // Bound both deterministic work and wall time; a single tiny source chunk is atomic.
      if (performance.now() >= end) break;
    }
    if (job.cursor !== job.width * job.height) return;
    const k = job.committed++, stage = this.staging[k], mesh = this.meshes[k], rank = mesh.geometry.getAttribute("foliageRank") as InstancedBufferAttribute;
    const upload = (attribute: InstancedBufferAttribute, source: Float32Array, count: number) => {
      if (count) { (attribute.array as Float32Array).set(source.subarray(0, count)); attribute.clearUpdateRanges(); attribute.addUpdateRange(0, count); attribute.needsUpdate = true; }
    };
    upload(mesh.instanceMatrix, stage.matrices, stage.count * 16); upload(mesh.instanceColor!, stage.colors, stage.count * 3); upload(rank, stage.ranks, stage.count);
    mesh.count = stage.count;
    mesh.boundingBox ??= new Box3(); mesh.boundingSphere ??= new Sphere();
    if (stage.count) { mesh.boundingBox.copy(stage.bounds); mesh.boundingBox.getBoundingSphere(mesh.boundingSphere); mesh.boundingSphere.radius += 1; }
    else { mesh.boundingBox.set(new Vector3(), new Vector3()); mesh.boundingSphere.set(new Vector3(), 0); }
    this.stats.commits++; this.stats.plants = this.meshes.reduce((sum, item) => sum + item.count, 0);
    this.countedAt = -Infinity; this.counts = undefined;
    if (job.committed === FOLIAGE_KINDS.length) {
      this.centerX = job.x; this.centerZ = job.z; this.density = job.density; this.stats.uploads++; this.job = undefined;
    }
  }
  private countVisible(time: number, target: Vector3, density: number) {
    if (!this.counts && time - this.countedAt >= 500) {
      this.countedAt = time; this.counts = { kind: 0, index: 0, visible: 0, x: target.x, z: target.z, density };
    }
    const count = this.counts; if (!count) { this.stats.countQueued = 0; return; }
    let remaining = COUNTS_PER_SLICE;
    while (count.kind < this.meshes.length && remaining > 0) {
      const mesh = this.meshes[count.kind], ranks = mesh.geometry.getAttribute("foliageRank"), matrices = mesh.instanceMatrix.array;
      while (count.index < mesh.count && remaining-- > 0) {
        const i = count.index++, distance = Math.hypot(matrices[i * 16 + 12] - count.x, matrices[i * 16 + 14] - count.z);
        const t = Math.max(0, Math.min(1, (distance - 18) / (FOLIAGE_RADIUS - 18))), fade = 1 - t * t * (3 - 2 * t);
        if (ranks.getX(i) < count.density * fade) count.visible++;
      }
      if (count.index === mesh.count) { count.kind++; count.index = 0; }
    }
    if (count.kind === this.meshes.length) { this.stats.visiblePlants = count.visible; this.counts = undefined; }
    this.stats.countQueued = this.counts ? 1 : 0;
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
    this.stats.preparationMs = 0;
    if (!enabled || !this.layout) { this.stats.visiblePlants = this.stats.queued = this.stats.countQueued = 0; this.counts = undefined; this.countedAt = -Infinity; return; }
    const began = performance.now();
    const x = Math.round(target.x / 8) * 8, z = Math.round(target.z / 8) * 8;
    const wanted = { x, z, density: visual.foliageDensity };
    if (this.job) {
      this.pending = x === this.job.x && z === this.job.z && wanted.density === this.job.density ? undefined : wanted;
      // A teleport can obsolete an uncommitted window. Nearby pan work finishes,
      // while already committed kinds always finish before the latest request.
      if (!this.job.committed && Math.hypot(x - this.job.x, z - this.job.z) > WINDOW_RADIUS * 2) {
        this.job = undefined; this.stats.cancelled++;
      }
    } else if (x !== this.centerX || z !== this.centerZ || this.density !== wanted.density) this.pending = wanted;
    else this.pending = undefined;
    if (!this.job && this.pending) { const request = this.pending; this.pending = undefined; this.beginWindow(request); }
    if (this.job) this.prepareWindow();
    this.countVisible(time, target, visual.foliageDensity);
    this.stats.queued = this.job || this.pending ? 1 : 0; this.stats.cacheChunks = this.chunks.size;
    this.stats.preparationMs = performance.now() - began; this.stats.maxSliceMs = Math.max(this.stats.maxSliceMs, this.stats.preparationMs);
  }
  dispose() {
    this.job = this.pending = undefined; this.counts = undefined; this.chunks.clear(); this.staging = [];
    this.stats.queued = this.stats.countQueued = this.stats.cacheChunks = this.stats.stagingBytes = 0;
    for (const mesh of this.meshes) { this.scene.remove(mesh); mesh.dispose(); mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }
    for (const texture of this.textures) texture.dispose();
  }
}
