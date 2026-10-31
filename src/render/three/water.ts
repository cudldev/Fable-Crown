import {
  Color, DataTexture, Frustum, HalfFloatType, LinearFilter, Matrix4, MeshLambertMaterial, MeshPhongMaterial, NoColorSpace,
  OrthographicCamera, PerspectiveCamera, Plane, RedFormat, UnsignedByteType, Vector2, Vector3, Vector4, WebGLRenderTarget,
  type BufferGeometry, type Mesh, type Object3D, type Scene, type WebGLRenderer,
} from "three";
import { resolveLighting, type LightingPreset } from "./lighting";
import type { VisualSettings } from "./visual-settings";
import type { Terrain } from "../../rpg/types";

export const WATER_HEIGHT = -.055;
type ViewCamera = PerspectiveCamera | OrthographicCamera;
const bias = new Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
interface WaterWorld { width: number; height: number; terrain: readonly Terrain[] }

/** Four-neighbour distance to dry ground, saturated at three tiles. Cosmetic colour only, not physical depth. */
export function waterShoreDepth(world: WaterWorld): Uint8Array {
  const { width, height, terrain } = world, count = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isSafeInteger(count) || terrain.length !== count) throw Error("Invalid water terrain dimensions.");
  const distance = new Uint8Array(count).fill(255), queue = new Uint32Array(count);
  let head = 0, tail = 0;
  for (let i = 0; i < count; i++) if (terrain[i] !== "water") { distance[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const at = queue[head++], next = distance[at] + 1;
    if (next > 3) continue;
    const x = at % width;
    const visit = (neighbor: number) => {
      if (distance[neighbor] > next) { distance[neighbor] = next; queue[tail++] = neighbor; }
    };
    if (x) visit(at - 1);
    if (x + 1 < width) visit(at + 1);
    if (at >= width) visit(at - width);
    if (at + width < count) visit(at + width);
  }
  for (let i = 0; i < count; i++) distance[i] = Math.min(distance[i], 3) * 85;
  return distance;
}

function shoreTexture(data: Uint8Array, width: number, height: number): DataTexture {
  const texture = new DataTexture(data, width, height, RedFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1; texture.generateMipmaps = false; texture.needsUpdate = true;
  texture.name = "water-shore-distance";
  return texture;
}

/** Presentation-only basin, shared by the submerged bed and surface absorption. */
export const waterColumnDepth = (shore: number) => .1 + Math.max(0, shore * 3 - .5) * 1.15;

/** Mirrors the actual view and clips everything below the flat water plane.
 * The general inverse-projection construction works for both perspective and orthographic views.
 * See Three.js Reflector / Lengyel oblique near-plane clipping.
 */
export function waterReflectionCamera(source: ViewCamera, destination: ViewCamera, textureMatrix: Matrix4): void {
  source.updateMatrixWorld();
  if (source instanceof PerspectiveCamera && destination instanceof PerspectiveCamera) destination.copy(source, false);
  else if (source instanceof OrthographicCamera && destination instanceof OrthographicCamera) destination.copy(source, false);
  else throw Error("Water reflection camera must match the view's projection type.");
  const eye = new Vector3().setFromMatrixPosition(source.matrixWorld);
  const direction = source.getWorldDirection(new Vector3());
  const up = new Vector3(0, 1, 0).transformDirection(source.matrixWorld);
  destination.position.set(eye.x, 2 * WATER_HEIGHT - eye.y, eye.z);
  direction.y *= -1; up.y *= -1;
  destination.up.copy(up);
  destination.lookAt(destination.position.clone().add(direction));
  destination.updateMatrixWorld();
  destination.projectionMatrix.copy(source.projectionMatrix);
  // Keep this matrix paired with the captured image until the next capture.
  textureMatrix.copy(bias).multiply(source.projectionMatrix).multiply(destination.matrixWorldInverse);
  const plane = new Plane(new Vector3(0, 1, 0), -WATER_HEIGHT).applyMatrix4(destination.matrixWorldInverse);
  const clip = new Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const corner = new Vector4(Math.sign(clip.x), Math.sign(clip.y), 1, 1)
    .applyMatrix4(destination.projectionMatrix.clone().invert());
  clip.multiplyScalar(2 / clip.dot(corner));
  const p = destination.projectionMatrix.elements;
  p[2] = clip.x - p[3]; p[6] = clip.y - p[7]; p[10] = clip.z - p[11]; p[14] = clip.w - p[15];
  destination.projectionMatrixInverse.copy(destination.projectionMatrix).invert();
}

const vertexDeclarations = `
uniform mat4 fableWaterMatrix;
varying vec3 vFableWaterWorld;
varying vec4 vFableWaterReflection;
`;
const fragmentDeclarations = `
uniform sampler2D fableWaterTexture;
uniform sampler2D fableWaterDepth;
uniform vec2 fableWaterWorldSize;
uniform vec3 fableWaterShallow;
uniform vec3 fableWaterDeep;
uniform vec3 fableWaterSky;
uniform float fableWaterTime;
uniform float fableWaterRipples;
uniform float fableWaterReflectionStrength;
uniform float fableWaterReady;
varying vec3 vFableWaterWorld;
varying vec4 vFableWaterReflection;
vec3 fableFoamSeed(vec2 cell){
 return fract(sin(vec3(dot(cell,vec2(127.1,311.7)),dot(cell,vec2(269.5,183.3)),
  dot(cell,vec2(419.2,371.9))))*43758.5453);
}
float fableFoamFlecks(vec2 world,float time){
 // Persistent flecks advect with a gentle downstream current, rather than morphing a contour.
 vec2 p=world-vec2(.012,.065)*time;
 vec2 cell=floor(p/.32);
 float foam=0.0;
 for(int z=-1;z<=1;z++) for(int x=-1;x<=1;x++){
  vec2 id=cell+vec2(float(x),float(z));
  vec3 seed=fableFoamSeed(id);
  if(seed.z<.3) continue;
  vec2 center=(id+.2+.6*seed.xy)*.32;
  vec2 q=p-center;
  float angle=(seed.z-.5)*2.0,c=cos(angle),s=sin(angle);
  q=mat2(c,-s,s,c)*q/vec2(.03+.04*seed.x,.055+.065*seed.y);
  float edge=length(q)+.14*sin(q.x*4.0+seed.z*19.0)*sin(q.y*5.0+seed.x*13.0);
  float age=fract(time/(7.0+seed.x*5.0)+seed.y);
  float life=smoothstep(0.0,.16,age)*(1.0-smoothstep(.58,1.0,age));
  foam=max(foam,(1.0-smoothstep(.45,1.0,edge))*life*(.5+.5*seed.z));
 }
 return foam;
}
`;
const shoreColor = `
float waterDepth=texture2D(fableWaterDepth,(vFableWaterWorld.xz+.5)/fableWaterWorldSize).r;
float waterColumn=.1+max(0.0,waterDepth*3.0-.5)*1.15;
diffuseColor.rgb=mix(fableWaterShallow,fableWaterDeep,1.0-exp(-waterColumn*1.65));
// Distance to actual dry tile edges, including corners: no outline at water/chunk joins.
vec2 waterCell=floor(vFableWaterWorld.xz+.5);
float waterShore=1.0;
for(int z=-1;z<=1;z++) for(int x=-1;x<=1;x++){
 vec2 cell=waterCell+vec2(float(x),float(z));
 if(cell.x<0.0||cell.y<0.0||cell.x>=fableWaterWorldSize.x||cell.y>=fableWaterWorldSize.y) continue;
 if(texture2D(fableWaterDepth,(cell+.5)/fableWaterWorldSize).r<.01)
  waterShore=min(waterShore,length(max(abs(vFableWaterWorld.xz-cell)-.5,0.0)));
}
// Shore distance only fades detached flecks; it never draws a bright offset ring or corner arc.
float waterFoam=0.0;
if(waterShore<.44) waterFoam=fableFoamFlecks(vFableWaterWorld.xz,fableWaterTime)
 *smoothstep(.01,.045,waterShore)*(1.0-smoothstep(.16,.44,waterShore));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.76,.73),waterFoam*.68);
`;
const waveNormals = `
vec2 waterP=vFableWaterWorld.xz;
float waterT=fableWaterTime;
vec2 waterSlope=fableWaterRipples*(
 vec2(.055,.027)*cos(dot(waterP,vec2(1.7,.85))+waterT*.75)+
 vec2(-.023,.044)*cos(dot(waterP,vec2(-2.3,4.4))-waterT*1.1)+
 vec2(.018,.012)*cos(dot(waterP,vec2(8.1,5.4))+waterT*1.5));
vec3 waterWorldNormal=normalize(vec3(-waterSlope.x,1.0,-waterSlope.y));
normal=normalize(mat3(viewMatrix)*waterWorldNormal);
// A little bed visibility in the shallows, rapidly absorbed into blue with depth.
float waterView=abs(dot(normal,normalize(vViewPosition)));
diffuseColor.a=1.0-.52*exp(-(.8*waterColumn+.6*waterColumn*waterColumn)/max(.45,waterView));
`;
const reflection = `
vec2 waterUV=vFableWaterReflection.xy/max(vFableWaterReflection.w,.0001);
// Distortion uses the same world-space waves as direct-light normals, independent of tile UVs.
waterUV+=waterSlope*.018;
float waterEdge=min(min(waterUV.x,waterUV.y),min(1.0-waterUV.x,1.0-waterUV.y));
float waterValid=step(0.0,vFableWaterReflection.w)*smoothstep(0.0,.035,waterEdge)*fableWaterReady;
vec3 waterReflection=mix(fableWaterSky,texture2D(fableWaterTexture,clamp(waterUV,.001,.999)).rgb,waterValid);
float waterFresnel=.06+.82*pow(1.0-clamp(dot(normal,normalize(vViewPosition)),0.0,1.0),5.0);
outgoingLight=mix(outgoingLight,waterReflection,fableWaterReflectionStrength*(.12+waterFresnel));
`;

export interface WaterStats {
  state: "disabled" | "offscreen" | "ready" | "error";
  reflectionPasses: number; reflectionMs: number; reflectionWidth: number; reflectionHeight: number;
}

/** One bounded reflection target shared by every water chunk; no per-tile passes or screen-space rays. */
export class WaterSystem {
  readonly material = new MeshPhongMaterial({ color: 0x285576, specular: 0xb0c2c1, shininess: 95, transparent: true, depthWrite: true });
  readonly bedMaterial = new MeshLambertMaterial({ color: 0x8d947d });
  readonly stats: WaterStats = { state: "offscreen", reflectionPasses: 0, reflectionMs: 0, reflectionWidth: 0, reflectionHeight: 0 };
  private target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
  private camera?: ViewCamera;
  private capturedLighting = "";
  private capturedAt = -Infinity;
  private failedSize = "";
  private rendering = false;
  private supportedType = false;
  private viewport = new Vector4();
  private scissor = new Vector4();
  private size = new Vector2();
  private frustum = new Frustum();
  private frustumMatrix = new Matrix4();
  private shore = shoreTexture(new Uint8Array([255]), 1, 1);
  private shoreSource?: readonly Terrain[];
  private uniforms = {
    fableWaterTexture: { value: this.target.texture }, fableWaterMatrix: { value: new Matrix4() },
    fableWaterSky: { value: new Color(0x8f9aa4) }, fableWaterTime: { value: 0 },
    fableWaterRipples: { value: .35 }, fableWaterReflectionStrength: { value: .65 }, fableWaterReady: { value: 0 },
    fableWaterDepth: { value: this.shore }, fableWaterWorldSize: { value: new Vector2(1, 1) },
    fableWaterShallow: { value: new Color(0x548c91) }, fableWaterDeep: { value: this.material.color },
  };

  constructor() {
    this.target.texture.colorSpace = NoColorSpace;
    this.target.texture.name = "shared-water-reflection";
    this.material.name = "reflective-water";
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = vertexDeclarations + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
vFableWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
#ifdef FABLE_WORLD_CURVE
vFableWaterReflection=fableWaterMatrix*vec4(2.0*vFableWaterWorld-fableCurvePoint(vFableWaterWorld),1.0);
#else
vFableWaterReflection=fableWaterMatrix*vec4(vFableWaterWorld,1.0);
#endif`);
      shader.fragmentShader = fragmentDeclarations + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n" + shoreColor);
      shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + waveNormals);
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", reflection + "\n#include <opaque_fragment>");
    };
    this.material.customProgramCacheKey = () => "fable-planar-water-v6-advected-flecks";
    this.bedMaterial.name = "submerged-water-bed";
    this.bedMaterial.onBeforeCompile = shader => {
      shader.vertexShader = "varying vec3 vWaterBed;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterBed=(modelMatrix*vec4(position,1.0)).xyz;");
      shader.fragmentShader = "varying vec3 vWaterBed;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
// Quiet sand/stone clusters remain visible only through the shallow margin.
vec2 bedCell=floor(vWaterBed.xz*8.0);
float bedGrain=fract(sin(dot(bedCell,vec2(127.1,311.7)))*43758.5453);
diffuseColor.rgb*=.88+.24*bedGrain;`);
    };
    this.bedMaterial.customProgramCacheKey = () => "fable-water-bed-v1";
  }

  /** Clone only when rebuilding terrain; matching vertices keep adjacent chunks watertight. */
  createBed(surface: BufferGeometry): BufferGeometry {
    const geometry = surface.clone(), positions = geometry.getAttribute("position");
    const width = this.uniforms.fableWaterWorldSize.value.x, height = this.uniforms.fableWaterWorldSize.value.y;
    const data = this.shore.image.data as Uint8Array;
    const sample = (x: number, z: number) => data[Math.max(0, Math.min(height - 1, z)) * width + Math.max(0, Math.min(width - 1, x))] / 255;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
      const a = sample(ix, iz) * (1 - fx) + sample(ix + 1, iz) * fx;
      const b = sample(ix, iz + 1) * (1 - fx) + sample(ix + 1, iz + 1) * fx;
      // A corner touching dry ground is the basin lip, including a convex bank corner.
      // Bilinear shore distance alone would lower this corner and expose a gap under the bank.
      const cx = Math.floor(x + .5), cz = Math.floor(z + .5);
      const bank = [-1, 0].some(dx => [-1, 0].some(dz => {
        const nx = cx + dx, nz = cz + dz;
        return nx >= 0 && nz >= 0 && nx < width && nz < height && data[nz * width + nx] === 0;
      }));
      positions.setY(i, WATER_HEIGHT - (bank ? waterColumnDepth(0) : waterColumnDepth(a * (1 - fz) + b * fz)));
    }
    geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    return geometry;
  }

  setWorld(world: WaterWorld): void {
    if (world.terrain === this.shoreSource && this.uniforms.fableWaterWorldSize.value.x === world.width && this.uniforms.fableWaterWorldSize.value.y === world.height) return;
    const data = waterShoreDepth(world), next = shoreTexture(data, world.width, world.height);
    this.shore.dispose(); this.shore = next; this.shoreSource = world.terrain;
    this.uniforms.fableWaterDepth.value = next; this.uniforms.fableWaterWorldSize.value.set(world.width, world.height);
    this.capturedAt = -Infinity;
  }

  update(renderer: WebGLRenderer, scene: Scene, camera: ViewCamera, water: readonly Mesh[], hidden: readonly Object3D[], time: number,
    preset: LightingPreset, visual: Readonly<VisualSettings>, overview: boolean, reducedMotion = false): void {
    const lighting = resolveLighting(preset, visual);
    this.uniforms.fableWaterSky.value.setHex(lighting.sky);
    this.uniforms.fableWaterTime.value = reducedMotion ? 0 : time * .001;
    this.uniforms.fableWaterRipples.value = visual.waterRippleStrength;
    this.uniforms.fableWaterReflectionStrength.value = visual.waterReflections && !overview ? visual.waterReflectionStrength : 0;
    if (this.rendering) return;
    if (!visual.waterReflections || overview || visual.waterReflectionStrength <= 0) {
      this.stats.state = "disabled"; this.uniforms.fableWaterReady.value = 0; this.failedSize = ""; return;
    }
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (camera.position.y <= WATER_HEIGHT || !water.some(mesh => {
      for (let object: Object3D | null = mesh; object; object = object.parent) if (!object.visible) return false;
      mesh.updateWorldMatrix(true, false); return this.frustum.intersectsObject(mesh);
    })) { this.stats.state = "offscreen"; return; }
    renderer.getDrawingBufferSize(this.size);
    const longest = Math.max(this.size.x, this.size.y);
    const limit = Math.min(visual.waterReflectionResolution || longest, renderer.capabilities.maxTextureSize);
    const scale = Math.min(1, limit / longest);
    const width = Math.max(1, Math.round(this.size.x * scale)), height = Math.max(1, Math.round(this.size.y * scale));
    if (this.failedSize === `${width}:${height}`) { this.stats.state = "error"; return; }
    const resized = width !== this.target.width || height !== this.target.height;
    const cameraTypeChanged = !this.camera || this.camera.type !== camera.type;
    // Continuous daylight follows the chosen capture rate; only control changes force immediate invalidation.
    const keyedLighting = visual.cycleHour === undefined ? lighting : resolveLighting(preset, { ...visual, cycleHour: undefined });
    const lightingKey = JSON.stringify([preset, keyedLighting.sky, keyedLighting.sun, keyedLighting.sunPower, keyedLighting.direction, keyedLighting.fill,
      keyedLighting.fillPower, visual.dayNightCycle, visual.dayTime, visual.cycleMinutes, visual.lampStrength, visual.fogEnabled, visual.fogReach, visual.giStrength, visual.aoStrength,
      visual.shadowResolution, visual.shadowSoftness, visual.shadowCoverage, visual.shadowBias, visual.shadowNormalBias,
      visual.skyEnabled, visual.cloudCoverage, visual.cloudScale, visual.fogGradient]);
    const invalid = resized || cameraTypeChanged || lightingKey !== this.capturedLighting || this.uniforms.fableWaterReady.value === 0;
    // Zero means every rendered frame, even with a still camera: actors/lights can move independently.
    if (!invalid && visual.waterReflectionRate > 0 && time - this.capturedAt < 1000 / visual.waterReflectionRate) { this.stats.state = "ready"; return; }
    if (!this.supportedType) {
      if (!renderer.extensions.has("EXT_color_buffer_float")) this.target.texture.type = UnsignedByteType;
      this.supportedType = true;
    }
    if (resized) this.target.setSize(width, height);
    if (cameraTypeChanged) this.camera = camera.clone();
    waterReflectionCamera(camera, this.camera!, this.uniforms.fableWaterMatrix.value);
    const previousTarget = renderer.getRenderTarget();
    const previousCubeFace = renderer.getActiveCubeFace(), previousMipmap = renderer.getActiveMipmapLevel();
    renderer.getViewport(this.viewport); renderer.getScissor(this.scissor);
    const scissorTest = renderer.getScissorTest(), xrEnabled = renderer.xr.enabled, shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    const objects = [...new Set<Object3D>([...water, ...hidden])];
    const visibility = objects.map(object => object.visible);
    const started = performance.now(); this.rendering = true;
    try {
      objects.forEach(object => { object.visible = false; });
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(this.target);
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.render(scene, this.camera!);
      this.capturedAt = time;
      this.capturedLighting = lightingKey; this.uniforms.fableWaterReady.value = 1;
      this.stats.reflectionPasses++; this.stats.reflectionWidth = width; this.stats.reflectionHeight = height;
      this.stats.state = "ready";
    } catch (error) {
      this.stats.state = "error"; this.uniforms.fableWaterReady.value = 0;
      this.failedSize = `${width}:${height}`;
      // Preserve the main rendering path if a device cannot render the reflection target.
      console.warn("Water reflection unavailable:", error);
    } finally {
      objects.forEach((object, i) => { object.visible = visibility[i]; });
      renderer.xr.enabled = xrEnabled; renderer.shadowMap.autoUpdate = shadowAutoUpdate; renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      renderer.setRenderTarget(previousTarget, previousCubeFace, previousMipmap);
      renderer.setViewport(this.viewport); renderer.setScissor(this.scissor); renderer.setScissorTest(scissorTest);
      this.rendering = false; this.stats.reflectionMs = performance.now() - started;
    }
  }

  dispose(): void { this.target.dispose(); this.shore.dispose(); this.material.dispose(); this.bedMaterial.dispose(); }
}
