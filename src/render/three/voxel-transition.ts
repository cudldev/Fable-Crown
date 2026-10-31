import { BufferAttribute, DynamicDrawUsage, Material, Mesh, MeshDepthMaterial } from "three";

export const VOXEL_TRANSITION_ATTRIBUTE = "voxelTransition";
const installed = new WeakSet<Material>();

const fragmentMask = `
varying float vVoxelTransition;
float fableVoxelThreshold(vec2 pixel){
 vec2 p=mod(floor(pixel),4.0),low=mod(p,2.0),high=floor(p*.5);
 float a=2.*abs(low.x-low.y)+low.y,b=2.*abs(high.x-high.y)+high.y;
 return (4.*a+b+.5)/16.;
}
`;
const discardMask = `
// Zero is fully visible, including geometries using the material's default attribute.
// Incoming p-1 and outgoing p partition each pixel; no blended/duplicate opacity.
if(vVoxelTransition!=0.){
 float threshold=fableVoxelThreshold(gl_FragCoord.xy);
 if(vVoxelTransition<0.){if(threshold>=1.+vVoxelTransition) discard;}
 else{if(threshold<vVoxelTransition) discard;}
}
`;

/** Install before shader warm-up. Uniform/material/define changes are unnecessary during a fade. */
export function installVoxelTransition<T extends Material>(material: T): T {
  if (installed.has(material)) return material;
  installed.add(material);
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
  const defaults = material as Material & { defaultAttributeValues?: Record<string, number[]> };
  defaults.defaultAttributeValues = { ...defaults.defaultAttributeValues, [VOXEL_TRANSITION_ATTRIBUTE]: [0] };
  material.onBeforeCompile = function (this: Material, shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = `attribute float voxelTransition; varying float vVoxelTransition;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvVoxelTransition=voxelTransition;");
    shader.fragmentShader = fragmentMask + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + discardMask);
  };
  material.customProgramCacheKey = function (this: Material) { return key.call(this) + "|fable-voxel-transition-v1"; };
  material.needsUpdate = true;
  return material;
}

/** Attach one shared instance to every sun-shadow-casting voxel batch, and dispose once. */
export function createVoxelTransitionDepthMaterial(): MeshDepthMaterial {
  // Directional shadows intentionally remain in logical, unbent world space,
  // matching WorldCurve's existing shadow coordinates. The mask uses shadow pixels.
  return installVoxelTransition(new MeshDepthMaterial());
}

/** Geometry must belong to this batch; all cube instances reuse its tiny scalar attribute. */
export function setVoxelTransition(mesh: Mesh, progress: number, incoming: boolean): void {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  // Bayer4 has 16 coverage steps. Encode the selected step exactly in Float32
  // so incoming/outgoing comparisons stay complementary at threshold ties.
  const coverage = Math.max(0, Math.ceil(p * 16 - .5)) / 16;
  const value = incoming ? coverage - 1 : coverage;
  let attribute = mesh.geometry.getAttribute(VOXEL_TRANSITION_ATTRIBUTE) as BufferAttribute | undefined;
  if (!attribute) {
    attribute = new BufferAttribute(new Float32Array(mesh.geometry.getAttribute("position").count), 1);
    attribute.setUsage(DynamicDrawUsage);
    mesh.geometry.setAttribute(VOXEL_TRANSITION_ATTRIBUTE, attribute);
  }
  if (attribute.array[0] === value) return;
  (attribute.array as Float32Array).fill(value);
  attribute.needsUpdate = true;
}

/** Keep the zeroed attribute so finishing/cancelling a fade never changes the vertex format. */
export function clearVoxelTransition(mesh: Mesh): void { setVoxelTransition(mesh, 0, false); }
