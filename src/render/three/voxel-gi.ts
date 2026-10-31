import { Color, Data3DTexture, HalfFloatType, LinearFilter, Material, Mesh, RGBAFormat, ShaderChunk, Vector3, type Object3D, type WebGLRenderer, type WebGLProgramParametersWithUniforms } from "three";
import type { GISolveConfig, GIWorldSource, V3 } from "./voxel-gi-core";
import { resolveLighting, type LightingPreset, type SceneLamp } from "./lighting";
import { DEFAULT_VISUAL_SETTINGS, transportSettingsKey, type VisualSettings } from "./visual-settings";

const declarations = `
uniform highp sampler3D fableGITexture;
uniform vec3 fableGIOrigin; uniform vec3 fableGISize;
uniform float fableGIPitch; uniform float fableGIReady; uniform float fableGIEnabled; uniform float fableWorldAO; uniform float fableGIStrength;
varying vec3 vFableGIPosition;
vec4 fableGICoefficient(vec3 uvw,float coefficient){
 vec2 padded=fableGISize.xz+2.0;
 return texture(fableGITexture,vec3(
  (uvw.x*fableGISize.x+1.0+mod(coefficient,2.0)*padded.x)/(2.0*padded.x),uvw.y,
  (uvw.z*fableGISize.z+1.0+floor(coefficient/2.0)*padded.y)/(2.0*padded.y)));
}
`;
const lighting = `
#if defined(RE_IndirectDiffuse)
 if(fableGIReady>.5 && (fableGIEnabled>.5 || fableWorldAO>0.0)){
  vec3 fableNormal=inverseTransformDirection(normal,viewMatrix);
  vec3 fablePosition=vFableGIPosition+fableNormal*fableGIPitch*1.05;
  vec3 fableExtent=fableGISize*fableGIPitch;
  vec3 fableLocal=fablePosition-fableGIOrigin;
  vec3 fableEdge=min(fableLocal,fableExtent-fableLocal);
  float fableFade=clamp(min(fableEdge.x,fableEdge.z)/3.0,0.0,1.0);
  if(fableLocal.y<0.0 || fableLocal.y>fableExtent.y) fableFade=0.0;
  if(fableFade>0.0){
   vec3 fableUV=clamp(fableLocal/fableExtent,0.0,1.0);
   vec4 fableC0=fableGICoefficient(fableUV,0.0);
   irradiance*=mix(1.0,clamp(fableC0.a,0.0,1.0),fableWorldAO*fableFade);
   if(fableGIEnabled>.5){
    vec3 fableBounce=.282095*fableC0.rgb+.488603*(
      fableNormal.x*fableGICoefficient(fableUV,1.0).rgb+
      fableNormal.y*fableGICoefficient(fableUV,2.0).rgb+
      fableNormal.z*fableGICoefficient(fableUV,3.0).rgb);
    irradiance+=max(vec3(0.0),fableBounce)*fableFade*fableGIStrength;
   }
  }
 }
#endif
`;

export interface GIStats { state: string; version: number; appliedVersion: number; appliedPreset?: string; totalMs: number; voxelizeMs?: number; probesMs?: number; interpolateMs?: number; packMs?: number; probes?: number; validProbes?: number; depletedCount?: number; rays?: number; occupied?: number; textureBytes?: number; bounces?: number; maxSliceMs?: number; yields?: number }

function texture(data: Uint16Array, size: V3): Data3DTexture {
  const result = new Data3DTexture(data, 2 * (size[0] + 2), size[1], 2 * (size[2] + 2));
  result.format = RGBAFormat; result.type = HalfFloatType; result.minFilter = result.magFilter = LinearFilter;
  result.unpackAlignment = 1; result.generateMipmaps = false; result.needsUpdate = true; return result;
}

/** Worker transport is cached in world space. No screen-space rays or per-frame voxel meshing. */
export class VoxelGI {
  private worker: Worker;
  private field = texture(new Uint16Array(144), [1, 1, 1]);
  private uniforms = {
    fableGITexture: { value: this.field }, fableGIOrigin: { value: new Vector3(0, -100, 0) }, fableGISize: { value: new Vector3(1, 1, 1) },
    fableGIPitch: { value: .5 }, fableGIReady: { value: 0 }, fableGIEnabled: { value: 1 }, fableWorldAO: { value: 1 }, fableGIStrength: { value: 1 },
  };
  private materials = new Map<Material, { compile: Material["onBeforeCompile"]; key: Material["customProgramCacheKey"] }>();
  private signature = "";
  private worldVersion = 0;
  private version = 0;
  private sourceReady = false;
  private busy = false;
  private activeCritical = "";
  private pending?: { config: GISolveConfig; critical: string };
  private sourceBounds = new Map<string, number[]>();
  private visualKey = "";
  private visualChangedAt = -Infinity;
  private lastPreset?: LightingPreset;
  stats: GIStats = { state: "starting", version: 0, appliedVersion: 0, totalMs: 0 };

  constructor() {
    this.worker = new Worker(new URL("./voxel-gi.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = event => {
      const message = event.data;
      if (message.version !== this.version) return;
      if (message.type === "progress") { this.stats.state = message.phase; return; }
      if (message.type === "error") { this.busy = false; this.stats.state = "error"; console.warn("Voxel GI:", message.message); return; }
      if (message.type !== "ready") return;
      const next = texture(message.data, message.size); this.field.dispose(); this.field = next;
      this.uniforms.fableGITexture.value = next; this.uniforms.fableGIOrigin.value.fromArray(message.origin);
      this.uniforms.fableGISize.value.fromArray(message.size); this.uniforms.fableGIPitch.value = message.pitch; this.uniforms.fableGIReady.value = 1;
      this.stats = { state: "ready", version: this.version, appliedVersion: this.version, appliedPreset: this.activeCritical.split(":").at(-1), ...message.stats };
      this.busy = false;
      if (this.pending) { const next = this.pending; this.pending = undefined; this.dispatch(next.config, next.critical); }
    };
    this.worker.onerror = () => { this.stats.state = "error"; };
  }

  setWorld(world: GIWorldSource) {
    this.worldVersion++; this.sourceReady = true;
    this.sourceBounds = new Map(world.objects.map(object => [object.id, object.bounds]));
    const buffers = new Set<ArrayBuffer>(); buffers.add(world.ground.buffer as ArrayBuffer);
    for (const object of world.objects) for (const array of [object.triangles, object.availableTriangles, object.depletedTriangles, object.boxes?.available, object.boxes?.depleted]) if (array) buffers.add(array.buffer as ArrayBuffer);
    this.worker.postMessage({ type: "world", world }, [...buffers]);
  }

  decorate(root: Object3D) {
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (this.materials.has(material) || !("isMeshLambertMaterial" in material || "isMeshStandardMaterial" in material)) continue;
        const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
        this.materials.set(material, { compile, key });
        material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
          compile.call(material, shader, renderer); Object.assign(shader.uniforms, this.uniforms);
          shader.vertexShader = "varying vec3 vFableGIPosition;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
vec4 fablePosition=vec4(transformed,1.0);
#ifdef USE_BATCHING
 fablePosition=batchingMatrix*fablePosition;
#endif
#ifdef USE_INSTANCING
 fablePosition=instanceMatrix*fablePosition;
#endif
vFableGIPosition=(modelMatrix*fablePosition).xyz;`);
          shader.fragmentShader = declarations + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_end>", lighting + ShaderChunk.lights_fragment_end);
        };
        material.customProgramCacheKey = () => key.call(material) + "|fable-cached-gi-v1";
        material.needsUpdate = true;
      }
    });
  }

  update(center: Vector3, preset: LightingPreset, lamps: readonly SceneLamp[], depleted: string[], gi: boolean, ao: boolean, overview: boolean, visual: Readonly<VisualSettings> = DEFAULT_VISUAL_SETTINGS) {
    this.uniforms.fableGIEnabled.value = gi && !overview && visual.giStrength > 0 ? 1 : 0;
    this.uniforms.fableGIStrength.value = visual.giStrength; this.uniforms.fableWorldAO.value = ao && !overview ? visual.aoStrength : 0;
    if (!this.sourceReady || overview || !(gi && visual.giStrength > 0) && !(ao && visual.aoStrength > 0)) { this.pending = undefined; return; }
    const visualKey = transportSettingsKey(visual);
    if (visualKey !== this.visualKey) { this.visualChangedAt = this.visualKey ? performance.now() : -Infinity; this.visualKey = visualKey; }
    if (this.lastPreset !== preset) { this.lastPreset = preset; this.visualChangedAt = -Infinity; }
    if (performance.now() - this.visualChangedAt < 180) return;
    const x = Math.floor(center.x / 16) * 16 + 8, z = Math.floor(center.z / 16) * 16 + 8;
    const nearDepleted = depleted.filter(id => { const bounds = this.sourceBounds.get(id); return bounds && bounds[0] <= x + 20 && bounds[3] >= x - 20 && bounds[2] <= z + 20 && bounds[5] >= z - 20; });
    const critical = `${this.worldVersion}:${x}:${z}:${visualKey}:${preset}`;
    const signature = `${critical}:${nearDepleted.join(",")}`;
    if (signature === this.signature) return; this.signature = signature;
    const p = resolveLighting(preset, visual), sun = new Color(p.sun), sky = new Color(p.fill);
    const config: GISolveConfig = { origin: [x - 20, 0, z - 20], size: [80, 16, 80], pitch: .5, stride: 4, rays: 32, bounces: visual.giBounces,
      sunDirection: p.direction, sunColor: sun.toArray() as V3, skyColor: sky.toArray() as V3, sunPower: p.sunPower, skyPower: p.fillPower, aoDistance: visual.aoDistance,
      depleted: nearDepleted, lamps: lamps.filter(lamp => Math.hypot(lamp.position.x - x, lamp.position.z - z) < 34).map(lamp => ({ position: lamp.position.toArray(), color: new Color(lamp.color).toArray() as V3, intensity: lamp.intensity * p.lamps, distance: lamp.distance })) };
    if (this.busy && this.activeCritical === critical) this.pending = { config, critical };
    else { this.pending = undefined; this.dispatch(config, critical); }
  }

  private dispatch(config: GISolveConfig, critical: string) {
    this.busy = true; this.activeCritical = critical;
    this.stats.state = this.stats.appliedVersion ? "updating" : "voxelize"; this.stats.version = ++this.version;
    this.worker.postMessage({ type: "solve", config, version: this.version });
  }

  dispose() {
    this.worker.terminate(); this.field.dispose();
    for (const [material, original] of this.materials) { material.onBeforeCompile = original.compile; material.customProgramCacheKey = original.key; }
    this.materials.clear();
  }
}
