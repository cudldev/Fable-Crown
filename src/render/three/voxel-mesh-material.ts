import { MeshLambertMaterial } from "three";
import { installVoxelTransition } from "./voxel-transition";
import {installVoxelSurfaceDetail} from "./voxel-surface-detail";
import {DEFAULT_VISUAL_SETTINGS} from "./visual-settings";

/** Static surfaces carry linear pigment and the same per-corner native VOX AO. */
export function voxelMeshMaterial(pitch: number, strength: { value: number }, distance: { value: number },detail={pitch,origin:[0,0,0]as readonly[number,number,number],strength:{value:DEFAULT_VISUAL_SETTINGS.voxelSurfaceStrength},variation:{value:DEFAULT_VISUAL_SETTINGS.voxelSurfaceVariation}}) {
  const material = new MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  material.onBeforeCompile = shader => {
    shader.uniforms.voxelAOStrength = strength;
    shader.uniforms.voxelAODistance = distance;
    shader.uniforms.voxelSurfacePitch = { value: pitch };
    shader.vertexShader = "attribute float voxelSurfaceAO; varying float vVoxelAO; uniform float voxelAODistance; uniform float voxelSurfacePitch;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
float surfaceScale=length(modelMatrix[0].xyz);
#ifdef USE_INSTANCING
surfaceScale*=length(instanceMatrix[0].xyz);
#endif
vVoxelAO=mix(1.,voxelSurfaceAO,clamp(voxelAODistance/max(voxelSurfacePitch*surfaceScale*1.5,.001),0.,1.));`);
    shader.fragmentShader = "uniform float voxelAOStrength; varying float vVoxelAO;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <aomap_fragment>", "#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=mix(1.,vVoxelAO,voxelAOStrength);");
  };
  material.customProgramCacheKey = () => "fable-static-voxel-ao-v1";
  return installVoxelTransition(installVoxelSurfaceDetail(material,detail));
}
