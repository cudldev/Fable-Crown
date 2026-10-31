import {
  BufferGeometry, Color, DataTexture, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter,
  Matrix4, Mesh, RedFormat, RepeatWrapping, ShaderMaterial, UnsignedByteType, Vector3, Vector4,
  type Camera, type Scene,
} from "three";
import { blendLightColor, cyclePhase, resolveLighting, type LightingPreset } from "./lighting";
import type { VisualSettings } from "./visual-settings";
import { FOG_GRADIENT_GLSL } from "./fog-gradient";

const mod = (n: number, period: number) => (n % period + period) % period;
function lattice(x: number, y: number, period: number): number {
  let n = Math.imul(mod(x, period) + 19, 374761393) ^ Math.imul(mod(y, period) + 73, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
const smooth = (v: number) => v * v * (3 - 2 * v);
export function moonAmount(preset: LightingPreset, visual: Readonly<VisualSettings>): number {
  if (!visual.dayNightCycle || visual.cycleHour === undefined) return preset === "night" ? 1 : 0;
  const hour = (visual.cycleHour % 24 + 24) % 24;
  return 1 - smooth(Math.max(0, Math.min(1, (hour - 5) / 2))) * (1 - smooth(Math.max(0, Math.min(1, (hour - 17) / 2))));
}
/** Periodic deterministic cloud pigment; opposite texture boundaries share the same lattice. */
export function cloudNoiseValue(x: number, y: number, size = 128): number {
  let result = 0;
  for (const [period, weight] of [[4, .55], [8, .28], [16, .12], [32, .05]]) {
    const px = x / size * period, py = y / size * period, ix = Math.floor(px), iy = Math.floor(py);
    const a = smooth(px - ix), b = smooth(py - iy);
    const low = lattice(ix, iy, period) * (1 - a) + lattice(ix + 1, iy, period) * a;
    const high = lattice(ix, iy + 1, period) * (1 - a) + lattice(ix + 1, iy + 1, period) * a;
    result += weight * (low * (1 - b) + high * b);
  }
  return result;
}
export function cloudNoise(size = 128): Uint8Array {
  if (!Number.isInteger(size) || size < 32 || size > 512) throw Error("Invalid cloud texture size.");
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data[y * size + x] = Math.round(cloudNoiseValue(x, y, size) * 255);
  return data;
}

const palettes = {
  day: { zenith: 0x4e86b4, horizon: 0xcbd8d5, lit: 0xfff4dd, shade: 0x8c9da9 },
  dusk: { zenith: 0x556d94, horizon: 0xd8b39a, lit: 0xffe2bd, shade: 0x8593a6 },
  night: { zenith: 0x101e38, horizon: 0x3b4b65, lit: 0x899ab6, shade: 0x34465e },
} as const;

const vertexShader = `
varying vec2 vSkyNDC;
void main(){vSkyNDC=position.xy;gl_Position=vec4(position.xy,1.0,1.0);}
`;
const fragmentShader = `
uniform sampler2D cloudNoise;
uniform mat4 skyCameraWorld;
uniform vec4 skyProjection;
uniform float skyOrthographic;
uniform vec3 skyZenith,skyHorizon,skyLower,cloudLit,cloudShade,sunDirection,sunColor;
uniform float sunPower,moonMix,cloudTime,cloudCoverage,cloudScale;
uniform vec3 fogLow,fogHigh;uniform float fogGradient;
varying vec2 vSkyNDC;
${FOG_GRADIENT_GLSL}
void main(){
 vec3 viewOrigin=vec3(0.0);
 vec3 viewDirection;
 if(skyOrthographic>.5){
  viewOrigin.xy=(vSkyNDC-skyProjection.zw)/skyProjection.xy;
  viewDirection=vec3(0.0,0.0,-1.0);
 }else viewDirection=normalize(vec3((vSkyNDC+skyProjection.zw)/skyProjection.xy,-1.0));
 vec3 origin=(skyCameraWorld*vec4(viewOrigin,1.0)).xyz;
 vec3 direction=normalize(mat3(skyCameraWorld)*viewDirection);
 float up=max(direction.y,0.0);
 vec3 color=mix(skyHorizon,skyZenith,pow(up,.58));
 color=mix(fableGradient(skyLower,fogLow,fogHigh,direction.y,fogGradient),color,smoothstep(-.12,.055,direction.y));
 float sunDot=clamp(dot(direction,sunDirection),0.0,1.0);
 float radius=mix(.028,.024,moonMix);
 float sunDisc=smoothstep(cos(radius),cos(radius*.88),sunDot);
 vec3 right=normalize(cross(abs(sunDirection.y)>.98?vec3(0.,0.,1.):vec3(0.,1.,0.),sunDirection));
 vec3 top=cross(sunDirection,right);
 vec2 face=vec2(dot(direction,right),dot(direction,top))/radius;
 float craters=exp(-dot(face-vec2(-.3,.2),face-vec2(-.3,.2))*35.)
              +.7*exp(-dot(face-vec2(.35,-.22),face-vec2(.35,-.22))*55.);
 float moonFace=clamp(.84+.12*face.y-.25*craters,.45,1.);
 color+=sunColor*sunPower*smoothstep(-.12,.015,direction.y)*(sunDisc*mix(2.8,moonFace*2.1,moonMix)
       +pow(sunDot,96.0)*mix(.17,.055,moonMix)+pow(sunDot,12.0)*mix(.035,.008,moonMix));
 if(direction.y>.015 && cloudCoverage>0.0){
  vec2 point=origin.xz+direction.xz*(180.0-origin.y)/direction.y;
  vec2 uv=point/(256.0*cloudScale)+vec2(.007,.0025)*cloudTime;
  float base=texture2D(cloudNoise,uv).r;
  float detail=texture2D(cloudNoise,uv*2.07+vec2(.31,.67)+vec2(.001,-.0007)*cloudTime).r;
  float density=base*.83+detail*.17;
  float threshold=mix(.9,.15,cloudCoverage);
  float alpha=smoothstep(threshold,threshold+.115,density);
  alpha=mix(alpha,1.0,smoothstep(.96,1.0,cloudCoverage));
  float towardsSun=texture2D(cloudNoise,uv+sunDirection.xz*.014).r;
  float rim=clamp(.55+(base-towardsSun)*5.0,0.0,1.0);
  vec3 cloud=mix(cloudShade,cloudLit,clamp(.67+rim*.29-alpha*.24,0.0,1.0));
  cloud+=sunColor*sunPower*pow(sunDot,16.0)*.05;
  alpha*=smoothstep(.015,.18,direction.y);
  color=mix(color,cloud,alpha);
 }
 gl_FragColor=vec4(color,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;

/** Sky is one background triangle in each view, including the mirrored water view. No cubemap rebuilds. */
export class SkySystem {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly stats = { cloudTime: 0 };
  readonly lightSource = { direction: new Vector3(), color: new Color(), power: 0 };
  readonly fogPalette = { low: new Color(), high: new Color() };
  private previousTime?: number;
  private texture: DataTexture;
  private uniforms = {
    cloudNoise: { value: null as DataTexture | null }, skyCameraWorld: { value: new Matrix4() },
    skyProjection: { value: new Vector4(1, 1, 0, 0) }, skyOrthographic: { value: 0 },
    skyZenith: { value: new Color() }, skyHorizon: { value: new Color() }, skyLower: { value: new Color() },
    cloudLit: { value: new Color() }, cloudShade: { value: new Color() },
    sunDirection: { value: new Vector3() }, sunColor: { value: new Color() }, sunPower: { value: 1 },
    moonMix: { value: 0 },
    fogLow: { value: this.fogPalette.low }, fogHigh: { value: this.fogPalette.high }, fogGradient: { value: .7 },
    cloudTime: { value: 0 }, cloudCoverage: { value: .55 }, cloudScale: { value: 1 },
  };
  constructor(private scene: Scene) {
    this.texture = new DataTexture(cloudNoise(), 128, 128, RedFormat, UnsignedByteType);
    this.texture.name = "procedural-cloud-field";
    this.texture.wrapS = this.texture.wrapT = RepeatWrapping;
    this.texture.magFilter = LinearFilter; this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.unpackAlignment = 1; this.texture.generateMipmaps = true; this.texture.needsUpdate = true;
    this.uniforms.cloudNoise.value = this.texture;
    const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const material = new ShaderMaterial({ name: "procedural-sky", uniforms: this.uniforms, vertexShader, fragmentShader,
      depthTest: true, depthWrite: false, fog: false });
    this.mesh = new Mesh(geometry, material); this.mesh.name = "procedural-sky";
    // Draw behind completed opaque depth, before transparent objects; hidden sky fragments can be rejected early.
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 10000; this.mesh.raycast = () => {};
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => this.prepareCamera(camera);
    scene.add(this.mesh);
  }
  private prepareCamera(camera: Camera) {
    const p = camera.projectionMatrix.elements, orthographic = "isOrthographicCamera" in camera;
    // Oblique reflection clipping changes only the third row. These entries retain the actual viewing rays.
    this.uniforms.skyProjection.value.set(p[0], p[5], p[orthographic ? 12 : 8], p[orthographic ? 13 : 9]);
    this.uniforms.skyOrthographic.value = orthographic ? 1 : 0;
    this.uniforms.skyCameraWorld.value.copy(camera.matrixWorld);
    this.mesh.material.uniformsNeedUpdate = true;
  }
  update(time: number, preset: LightingPreset, visual: Readonly<VisualSettings>, reducedMotion = false): void {
    const delta = this.previousTime === undefined ? 0 : Math.max(0, Math.min(1000, time - this.previousTime)) * .001;
    this.previousTime = time;
    if (!reducedMotion) this.stats.cloudTime += delta * visual.cloudSpeed;
    this.mesh.visible = visual.skyEnabled;
    const p = resolveLighting(preset, visual);
    let palette: { -readonly [K in keyof typeof palettes.day]: number } = palettes[preset];
    if (visual.dayNightCycle && visual.cycleHour !== undefined) {
      const [a, b, t] = cyclePhase(visual.cycleHour); palette = { ...palettes[a] };
      for (const key of ["zenith", "horizon", "lit", "shade"] as const) palette[key] = blendLightColor(palettes[a][key], palettes[b][key], t);
    }
    this.uniforms.cloudTime.value = this.stats.cloudTime;
    this.uniforms.cloudCoverage.value = visual.cloudCoverage; this.uniforms.cloudScale.value = visual.cloudScale;
    this.uniforms.skyLower.value.setHex(p.sky);
    this.uniforms.skyHorizon.value.setHex(visual.skyTint ? p.sky : palette.horizon);
    this.uniforms.skyZenith.value.setHex(visual.skyTint ? p.sky : palette.zenith);
    if (visual.skyTint) this.uniforms.skyZenith.value.multiplyScalar(.48);
    this.uniforms.cloudLit.value.setHex(palette.lit); this.uniforms.cloudShade.value.setHex(palette.shade);
    this.uniforms.sunColor.value.setHex(p.sun); this.uniforms.sunDirection.value.fromArray(p.direction);
    this.uniforms.sunPower.value = p.sunPower;
    const moon = moonAmount(preset, visual); this.uniforms.moonMix.value = moon;
    this.lightSource.direction.fromArray(p.direction); this.lightSource.color.setHex(p.sun);
    this.lightSource.power = p.sunPower * (1 - moon * .8);
    this.fogPalette.low.setHex(p.fog).lerp(this.lightSource.color, .1);
    this.fogPalette.high.setHex(p.fog).lerp(new Color(visual.skyTint ? p.sky : palette.zenith), .16);
    this.uniforms.fogGradient.value = visual.fogGradient;
  }
  dispose(): void {
    this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.texture.dispose();
  }
}

