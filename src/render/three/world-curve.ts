import { Box3, Color, Material, Mesh, Object3D, Sphere, Vector2, Vector3, type Ray, type WebGLProgramParametersWithUniforms } from "three";
import { ViewDistance } from "./view-distance";
import { FOG_GRADIENT_GLSL } from "./fog-gradient";

/** Zoom-dependent presentation only; authoritative coordinates stay flat. */
export function closeCameraBlend(zoom: number): number {
  const t = Math.max(0, Math.min(1, (zoom - .65) / 1.35));
  return t * t * (3 - 2 * t);
}
export const cameraPitch = (zoom: number) => Math.atan2(37, Math.hypot(32, 45)) - closeCameraBlend(zoom) * 5 * Math.PI / 180;

export class WorldCurve {
  readonly view = new ViewDistance();
  private originals = new Map<Material, { compile: Material["onBeforeCompile"]; key: Material["customProgramCacheKey"] }>();
  private bounds = new Map<Mesh, { original: Sphere | undefined; sphere: Sphere; culled: boolean }>();
  private point = new Vector3();
  private uniforms = {
    fableCurveCenter: { value: new Vector2() }, fableCurveAxis: { value: new Vector2(32, 45).normalize() },
    fableCurveStrength: { value: 0 },
    fableViewEnabled: { value: 0 }, fableViewRange: { value: this.view.range },
    fableViewCamera: { value: this.view.cameraPosition }, fableViewForward: { value: this.view.forward },
    fableAtmosphere: { value: .65 },
    fableFogLow: { value: new Color() }, fableFogHigh: { value: new Color() }, fableFogGradient: { value: 0 },
  };
  get strength() { return this.uniforms.fableCurveStrength.value; }
  setAtmosphere(amount: number) { this.uniforms.fableAtmosphere.value = amount; }
  setFogPalette(low: Color, high: Color, strength: number) {
    this.uniforms.fableFogLow.value.copy(low); this.uniforms.fableFogHigh.value.copy(high); this.uniforms.fableFogGradient.value = strength;
  }
  update(center: Vector3, zoom: number, amount: number, enabled: boolean) {
    this.uniforms.fableCurveCenter.value.set(center.x, center.z);
    this.uniforms.fableCurveStrength.value = enabled ? .004 * amount * closeCameraBlend(zoom) : 0;
  }
  bend(point: Vector3): Vector3 {
    const axis = this.uniforms.fableCurveAxis.value, center = this.uniforms.fableCurveCenter.value;
    const d = (point.x - center.x) * axis.x + (point.z - center.y) * axis.y;
    point.y -= this.strength * d * d; return point;
  }
  /** Conservative envelope; the cylinder can only lower points in the main view. */
  expandBounds(bounds: Box3, output: Box3): Box3 {
    output.copy(bounds);
    const center = this.uniforms.fableCurveCenter.value, axis = this.uniforms.fableCurveAxis.value;
    const d0 = (bounds.min.x - center.x) * axis.x + (bounds.min.z - center.y) * axis.y;
    const d1 = (bounds.max.x - center.x) * axis.x + (bounds.max.z - center.y) * axis.y;
    output.min.y -= this.strength * Math.max(d0 * d0, d1 * d1); return output;
  }
  prepareCulling(root: Object3D) {
    root.updateMatrixWorld(true);
    const active = new Set<Mesh>();
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      active.add(object);
      const mesh = object as Mesh & { boundingSphere?: Sphere };
      let entry = this.bounds.get(mesh);
      if (!entry) {
        entry = { original: mesh.boundingSphere, sphere: new Sphere(), culled: mesh.frustumCulled }; this.bounds.set(mesh, entry);
      }
      // Voxel buckets already perform their own expanded hierarchical culling.
      // Foliage uses four bounded batches, so bypass its flat instance sphere too.
      if ("isInstancedMesh" in mesh) { mesh.frustumCulled = this.strength > 0 ? false : entry.culled; return; }
      const geometry = mesh.geometry; if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!geometry.boundingSphere) return;
      entry.sphere.copy(geometry.boundingSphere);
      this.point.copy(entry.sphere.center).applyMatrix4(mesh.matrixWorld);
      const scale = Math.max(1e-8, mesh.matrixWorld.getMaxScaleOnAxis()), radius = entry.sphere.radius * scale;
      const axis = this.uniforms.fableCurveAxis.value, center = this.uniforms.fableCurveCenter.value;
      const d = Math.abs((this.point.x - center.x) * axis.x + (this.point.z - center.y) * axis.y) + radius;
      entry.sphere.radius += this.strength * d * d / scale;
      mesh.boundingSphere = entry.sphere;
    });
    for (const [mesh, entry] of this.bounds) if (!active.has(mesh)) { this.restoreBounds(mesh, entry); this.bounds.delete(mesh); }
  }
  private restoreBounds(mesh: Mesh & { boundingSphere?: Sphere }, entry: { original: Sphere | undefined; culled: boolean }) {
    mesh.frustumCulled = entry.culled;
    if (entry.original === undefined) delete mesh.boundingSphere; else mesh.boundingSphere = entry.original;
  }
  /** Nearest positive intersection with the same cylindrical ground used by vertices. */
  ground(ray: Ray): Vector3 | null {
    const axis = this.uniforms.fableCurveAxis.value, center = this.uniforms.fableCurveCenter.value;
    const d = (ray.origin.x - center.x) * axis.x + (ray.origin.z - center.y) * axis.y;
    const v = ray.direction.x * axis.x + ray.direction.z * axis.y, k = this.strength;
    const a = k * v * v, b = ray.direction.y + 2 * k * d * v, c = ray.origin.y + k * d * d;
    let t: number;
    if (Math.abs(a) < 1e-12) { if (Math.abs(b) < 1e-12) return null; t = -c / b; }
    else {
      const discriminant = b * b - 4 * a * c; if (discriminant < 0) return null;
      const root = Math.sqrt(discriminant), q = -.5 * (b + (b < 0 ? -root : root));
      const roots = [q / a, q === 0 ? -b / (2 * a) : c / q].filter(n => n >= 0);
      if (!roots.length) return null; t = Math.min(...roots);
    }
    if (t < 0 || !Number.isFinite(t)) return null;
    const point = ray.at(t, new Vector3()); point.y = 0; return point;
  }
  decorate(root: Object3D) {
    this.uniforms.fableViewEnabled.value = this.view.enabled ? 1 : 0;
    root.traverse(object => {
      if (!("material" in object)) return;
      const materials = (object as Object3D & { material: Material | Material[] }).material;
      for (const material of Array.isArray(materials) ? materials : [materials]) {
        if (this.originals.has(material)) continue;
        const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
        this.originals.set(material, { compile, key });
        material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
          compile.call(material, shader, renderer);
          if (!shader.vertexShader.includes("#include <project_vertex>")) return; // Procedural sky.
          Object.assign(shader.uniforms, this.uniforms);
          shader.vertexShader = `#define FABLE_WORLD_CURVE\nvarying vec3 vFableLogicalPosition,vFableFogPosition;\nuniform vec2 fableCurveCenter,fableCurveAxis;
uniform float fableCurveStrength;
vec3 fableCurvePoint(vec3 p){
 // Directional shadow cameras remain in logical space. Mirror the displacement
 // below the water plane so planar captures keep matching the main view.
 float d=dot(p.xz-fableCurveCenter,fableCurveAxis);
 if(!isOrthographic) p.y-=fableCurveStrength*d*d*(cameraPosition.y>=0.0?1.0:-1.0);
 return p;
}\n` + shader.vertexShader;
          const billboard = shader.vertexShader.includes("uniform vec3 unitGroundPivot;");
          shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
vec4 fableCurveWorld=vec4(transformed,1.0);
#ifdef USE_BATCHING
 fableCurveWorld=batchingMatrix*fableCurveWorld;
#endif
#ifdef USE_INSTANCING
 fableCurveWorld=instanceMatrix*fableCurveWorld;
#endif
fableCurveWorld=modelMatrix*fableCurveWorld;
vFableLogicalPosition=fableCurveWorld.xyz;
${billboard ? "vec3 fableUnitRoot=(modelMatrix*vec4(unitGroundPivot,1.0)).xyz; vFableLogicalPosition=fableUnitRoot; fableCurveWorld.xyz+=fableCurvePoint(fableUnitRoot)-fableUnitRoot;" : "fableCurveWorld.xyz=fableCurvePoint(fableCurveWorld.xyz);"}
vFableFogPosition=fableCurveWorld.xyz;
mvPosition=viewMatrix*fableCurveWorld;
gl_Position=projectionMatrix*mvPosition;`);
          shader.fragmentShader = `varying vec3 vFableLogicalPosition,vFableFogPosition;
uniform vec2 fableCurveCenter,fableViewRange;
uniform vec3 fableViewCamera,fableViewForward;
uniform float fableViewEnabled,fableAtmosphere,fableFogGradient;
uniform vec3 fableFogLow,fableFogHigh;
${FOG_GRADIENT_GLSL}\n` + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
if(fableViewEnabled>.5){
 if(distance(vFableLogicalPosition.xz,fableCurveCenter)>=fableViewRange.y || dot(vFableLogicalPosition-fableViewCamera,fableViewForward)<=0.) discard;
}`);
          shader.fragmentShader = shader.fragmentShader.replace("#include <fog_fragment>", `
#ifdef USE_FOG
 if(fableViewEnabled>.5){
  float fableDistanceFog=smoothstep(fableViewRange.x,fableViewRange.y,distance(vFableLogicalPosition.xz,fableCurveCenter));
  float fableClearAir=pow(fableDistanceFog,1.0+fableAtmosphere*.9);
  float fableGroundLayer=exp(-max(0.0,vFableLogicalPosition.y)*.8);
  float fableWisp=.65+.35*sin(vFableLogicalPosition.x*.21+vFableLogicalPosition.z*.13)*sin(vFableLogicalPosition.z*.17);
  float fableLowHaze=fableAtmosphere*.16*fableGroundLayer*fableWisp*smoothstep(4.0,fableViewRange.x,distance(vFableLogicalPosition.xz,fableCurveCenter));
  float fableLayeredFog=1.0-(1.0-fableClearAir)*(1.0-fableLowHaze);
  vec3 fableHazeColor=fableGradient(fogColor,fableFogLow,fableFogHigh,normalize(vFableFogPosition-cameraPosition).y,fableFogGradient);
  gl_FragColor.rgb=mix(gl_FragColor.rgb,fableHazeColor,fableLayeredFog);
 }else{
  #include <fog_fragment>
 }
#endif`);
        };
        material.customProgramCacheKey = () => key.call(material) + "|fable-world-curve-atmosphere-v4";
        material.needsUpdate = true;
      }
    });
  }
  dispose() {
    for (const [material, original] of this.originals) { material.onBeforeCompile = original.compile; material.customProgramCacheKey = original.key; }
    this.originals.clear();
    for (const [mesh, entry] of this.bounds) this.restoreBounds(mesh, entry);
    this.bounds.clear();
  }
}
