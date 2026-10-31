import { BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, NearestFilter, NearestMipmapNearestFilter, RGBAFormat, SRGBColorSpace, Vector3, type Scene } from "three";
import type { Terrain, WorldDefinition } from "../../rpg/types";
import type { VisualSettings } from "./visual-settings";
import { groundPivotDepthGLSL } from "./pivot-depth";
import type { TerrainSurface } from "./terrain-tiles";
import { FOLIAGE_CARD_SIZE, FOLIAGE_PIXEL_METRES, foliageAtlas, foliageVariantCount } from "./foliage-art";

export const FOLIAGE_PITCH = FOLIAGE_PIXEL_METRES;
export const FOLIAGE_RADIUS = 28;
const WINDOW_RADIUS = 34, CAPACITY = 32000;
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

export class FoliageSystem {
  readonly stats = { plants: 0, visiblePlants: 0, uploads: 0, windTime: 0 };
  readonly meshes: InstancedMesh[] = [];
  private layout?: FoliageLayout;
  private surface?: TerrainSurface;
  private centerX = Infinity; private centerZ = Infinity; private previousTime?: number;
  private density = -1;
  private countedAt = -Infinity;
  private uniforms = { foliageTime: { value: 0 }, foliageWind: { value: 1 }, foliageDensity: { value: 1 }, foliageTarget: { value: new Vector3() } };
  private textures: DataTexture[] = [];
  constructor(private scene: Scene) {
    for (const kind of FOLIAGE_KINDS) {
      const geometry = foliageGeometry(kind);
      const capacity = kind === "groundcover" ? 4096 : kind === "bush" ? 2048 : kind === "shortgrass" ? 16000 : CAPACITY;
      geometry.setAttribute("foliageRank", new InstancedBufferAttribute(new Float32Array(capacity), 1));
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
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.raycast = () => {};
      this.meshes.push(mesh); scene.add(mesh);
    }
  }
  setWorld(world: WorldDefinition, terrain?: readonly Terrain[], surface?: TerrainSurface) {
    this.layout = buildFoliageLayout(world, terrain); this.surface = surface; this.centerX = this.centerZ = Infinity;
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
        const base = new Color(FOLIAGE_KINDS[k] === "groundcover" ? 0x6e8749 : 0x7d944b);
        for (const plant of plants) {
          if (plant.kind !== FOLIAGE_KINDS[k] || count === mesh.instanceMatrix.count) continue;
          matrix.makeRotationY(plant.angle); matrix.setPosition(plant.x, 0, plant.z); mesh.setMatrixAt(count, matrix);
          if (this.surface && plant.kind !== "flower") {
            foliageGroundColor(this.surface, plant.x, plant.z, color).lerp(base, .3);
            color.setRGB(Math.max(.55, Math.min(1.7, color.r / base.r)), Math.max(.55, Math.min(1.7, color.g / base.g)), Math.max(.55, Math.min(1.7, color.b / base.b))).multiplyScalar(plant.tint);
          } else color.setScalar(plant.tint);
          if (plant.kind === "grass" || plant.kind === "shortgrass") {
            const warmth = (random(Math.floor(plant.x * 16), Math.floor(plant.z * 16), this.layout.seed + 4151) - .5) * .06;
            color.setRGB(color.r * (1 + warmth), color.g, color.b * (1 - warmth * .6));
          }
          mesh.setColorAt(count, color); ranks.setX(count, plant.rank); count++;
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
  dispose() {
    for (const mesh of this.meshes) { this.scene.remove(mesh); mesh.dispose(); mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }
    for (const texture of this.textures) texture.dispose();
  }
}
