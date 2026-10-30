import {
  Color, DataTexture, Frustum, HalfFloatType, LinearFilter, Matrix4, MeshPhongMaterial, NoColorSpace,
  OrthographicCamera, PerspectiveCamera, Plane, RedFormat, UnsignedByteType, Vector2, Vector3, Vector4, WebGLRenderTarget,
  type Mesh, type Object3D, type Scene, type WebGLRenderer,
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
`;
const shoreColor = `
// A cached one-byte terrain-distance field supplies restrained shallow-bank colour.
// This is opaque diffuse colour, not a refraction or bathymetry simulation.
float waterDepth=texture2D(fableWaterDepth,(vFableWaterWorld.xz+.5)/fableWaterWorldSize).r;
// Keep the visibly light bank mostly within the first water tile; deeper water stays quiet.
diffuseColor.rgb=mix(fableWaterShallow,fableWaterDeep,smoothstep(0.0,.55,waterDepth));
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
  readonly material = new MeshPhongMaterial({ color: 0x315e60, specular: 0xb0c2c1, shininess: 95 });
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
    fableWaterShallow: { value: new Color(0x60847a) }, fableWaterDeep: { value: this.material.color },
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
vFableWaterReflection=fableWaterMatrix*vec4(vFableWaterWorld,1.0);`);
      shader.fragmentShader = fragmentDeclarations + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n" + shoreColor);
      shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + waveNormals);
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", reflection + "\n#include <opaque_fragment>");
    };
    this.material.customProgramCacheKey = () => "fable-planar-water-v2";
  }

  setWorld(world: WaterWorld): void {
    if (world.terrain === this.shoreSource && this.uniforms.fableWaterWorldSize.value.x === world.width && this.uniforms.fableWaterWorldSize.value.y === world.height) return;
    const data = waterShoreDepth(world), next = shoreTexture(data, world.width, world.height);
    this.shore.dispose(); this.shore = next; this.shoreSource = world.terrain;
    this.uniforms.fableWaterDepth.value = next; this.uniforms.fableWaterWorldSize.value.set(world.width, world.height);
    this.capturedAt = -Infinity;
  }

  update(renderer: WebGLRenderer, scene: Scene, camera: ViewCamera, water: readonly Mesh[], hidden: readonly Object3D[], time: number,
    preset: LightingPreset, visual: Readonly<VisualSettings>, overview: boolean): void {
    const lighting = resolveLighting(preset, visual);
    this.uniforms.fableWaterSky.value.setHex(lighting.sky);
    this.uniforms.fableWaterTime.value = time * .001;
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
    const lightingKey = JSON.stringify([preset, lighting.sky, lighting.sun, lighting.sunPower, lighting.direction, lighting.fill,
      lighting.fillPower, visual.lampStrength, visual.fogEnabled, visual.fogReach, visual.giStrength, visual.aoStrength,
      visual.shadowResolution, visual.shadowSoftness, visual.shadowCoverage, visual.shadowBias, visual.shadowNormalBias,
      visual.skyEnabled, visual.cloudCoverage, visual.cloudScale]);
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

  dispose(): void { this.target.dispose(); this.shore.dispose(); this.material.dispose(); }
}
