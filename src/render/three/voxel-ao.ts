import { MeshLambertMaterial } from "three";
import { DEFAULT_VISUAL_SETTINGS } from "./visual-settings";

/** Six face-specific sets of four corner AO values; applies only to indirect diffuse light. */
export function voxelMaterial(enabled = { value: 1 }, distance = { value: DEFAULT_VISUAL_SETTINGS.aoDistance }): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = shader => {
    shader.uniforms.voxelAOStrength = enabled;
    shader.uniforms.voxelAODistance = distance;
    shader.vertexShader = `attribute vec4 voxelAO0; attribute vec4 voxelAO1; attribute vec4 voxelAO2;
attribute vec4 voxelAO3; attribute vec4 voxelAO4; attribute vec4 voxelAO5;
varying float vVoxelAO; uniform float voxelAODistance;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
// VOX is Z-up, the runtime is Y-up with source Y mapped to negative Z.
vec3 sourceNormal=vec3(normal.x,-normal.z,normal.y);
vec3 sourceCorner=vec3(position.x,-position.z,position.y);
vec4 cornerAO; vec2 cornerUV;
if(abs(sourceNormal.x)>.5){cornerAO=sourceNormal.x>0.0?voxelAO1:voxelAO0;cornerUV=sourceCorner.yz;}
else if(abs(sourceNormal.y)>.5){cornerAO=sourceNormal.y>0.0?voxelAO3:voxelAO2;cornerUV=sourceCorner.zx;}
else{cornerAO=sourceNormal.z>0.0?voxelAO5:voxelAO4;cornerUV=sourceCorner.xy;}
int cornerId=(cornerUV.x>0.0?1:0)+(cornerUV.y>0.0?2:0);
float localReach=1.0;
#ifdef USE_INSTANCING
localReach=clamp(voxelAODistance/max(length(instanceMatrix[0].xyz)*1.5,.001),0.0,1.0);
#endif
vVoxelAO=mix(1.0,cornerAO[cornerId],localReach);`);
    shader.fragmentShader = "uniform float voxelAOStrength; varying float vVoxelAO;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <aomap_fragment>", "#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= mix(1.0,vVoxelAO,voxelAOStrength);");
  };
  material.customProgramCacheKey = () => "fable-voxel-corner-ao-v1";
  return material;
}
