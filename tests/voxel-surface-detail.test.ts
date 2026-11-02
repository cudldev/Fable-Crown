import {BoxGeometry,InstancedMesh,MeshLambertMaterial,Scene,ShaderLib,Vector3,type WebGLProgramParametersWithUniforms,type WebGLRenderer} from "three";
import {expect,test,vi} from "vitest";
import {installVoxelSurfaceDetail,VOXEL_SURFACE_DETAIL_PROFILE} from "../src/render/three/voxel-surface-detail";
import {installVoxelTransition} from "../src/render/three/voxel-transition";
import {WorldCurve} from "../src/render/three/world-curve";

const shader=()=>({vertexShader:ShaderLib.lambert.vertexShader,fragmentShader:ShaderLib.lambert.fragmentShader,uniforms:{}} as WebGLProgramParametersWithUniforms);
const renderer={} as WebGLRenderer;

test("normal overlay composes with existing pigment/AO, transition and world curve hooks",()=>{
  const material=new MeshLambertMaterial({vertexColors:true});
  const before=vi.fn((program:WebGLProgramParametersWithUniforms)=>{program.uniforms.previousAO={value:.7};program.fragmentShader=program.fragmentShader.replace("#include <aomap_fragment>","#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=.7;");});
  material.onBeforeCompile=before;material.customProgramCacheKey=()=>"existing-voxel-ao";
  installVoxelTransition(material);
  const originalKey=material.customProgramCacheKey();
  const result=installVoxelSurfaceDetail(material,{pitch:.0625,strength:{value:.55},variation:{value:.65}});
  const compile=material.onBeforeCompile,version=material.version;
  installVoxelSurfaceDetail(material,{pitch:4,strength:{value:0},variation:{value:0}});
  expect(result).toBe(material);expect(material.onBeforeCompile).toBe(compile);expect(material.version).toBe(version);
  expect(material.customProgramCacheKey()).toBe(originalKey+"|fable-voxel-surface-detail-v6");
  const scene=new Scene(),mesh=new InstancedMesh(new BoxGeometry(),material,1),curve=new WorldCurve();scene.add(mesh);curve.decorate(scene);
  const program=shader();material.onBeforeCompile(program,renderer);
  expect(before).toHaveBeenCalledOnce();expect(program.uniforms.previousAO.value).toBe(.7);
  expect(program.fragmentShader).toContain("reflectedLight.indirectDiffuse*=.7");
  expect(program.fragmentShader).toContain("fableVoxelThreshold(gl_FragCoord.xy)");
  expect(program.vertexShader).toContain("fableCurveWorld");
  expect(program.fragmentShader.indexOf("normal=fableSurfacePerturb")).toBeLessThan(program.fragmentShader.indexOf("#include <lights_lambert_fragment>"));
  expect(program.fragmentShader.indexOf("normal=fableSurfacePerturb")).toBeGreaterThan(program.fragmentShader.indexOf("#include <normal_fragment_maps>"));
  expect(material.vertexColors).toBe(true);expect(material.normalMap).toBeNull();expect(material.displacementMap).toBeNull();
  curve.dispose();mesh.geometry.dispose();mesh.dispose();material.dispose();
});

test("shared live controls are bounded without mutating callers, including NaN and infinity",()=>{
  const strength={value:.55},variation={value:.65},material=installVoxelSurfaceDetail(new MeshLambertMaterial(),{pitch:NaN,origin:[NaN,Infinity,-Infinity],strength,variation});
  const program=shader();material.onBeforeCompile(program,renderer);
  expect(program.uniforms.fableSurfacePitch.value).toBe(.0625);
  expect(program.uniforms.fableSurfaceOrigin.value).toEqual(new Vector3());
  for(const [input,expected]of [[0,0],[-1,0],[.3,.3],[4,1],[NaN,0],[Infinity,0]]){
    strength.value=input;variation.value=input;
    expect(program.uniforms.fableSurfaceStrength.value).toBe(expected);expect(program.uniforms.fableSurfaceVariation.value).toBe(expected);
    expect(Object.is(strength.value,input)).toBe(true);expect(Object.is(variation.value,input)).toBe(true);
  }
  // Zero does not mix or renormalize the pre-existing normal at all.
  expect(program.fragmentShader).toContain("if(fableSurfaceStrength>0.){");
  expect(program.fragmentShader).toContain("diffuseColor.rgb*=fableSurfaceDetailValue.z");
  expect(program.fragmentShader).toContain("fableSurfaceDetailValue=vec3(0.,0.,1.)");
  material.dispose();
});

test("native source grid remains uniform-driven across LOD and rotated instance programs",()=>{
  const first=installVoxelSurfaceDetail(new MeshLambertMaterial(),{pitch:.0625,origin:[-2,0,4],strength:{value:1},variation:{value:1}});
  const second=installVoxelSurfaceDetail(new MeshLambertMaterial(),{pitch:.125,origin:[3,-1,9],strength:{value:.5},variation:{value:0}});
  const a=shader(),b=shader();first.onBeforeCompile(a,renderer);second.onBeforeCompile(b,renderer);
  expect(a.vertexShader).toBe(b.vertexShader);expect(a.fragmentShader).toBe(b.fragmentShader);expect(first.customProgramCacheKey()).toBe(second.customProgramCacheKey());
  expect(a.uniforms.fableSurfaceOrigin.value.toArray()).toEqual([-2,0,4]);expect(b.uniforms.fableSurfacePitch.value).toBe(.125);
  expect(a.vertexShader).toContain("vFableSurfacePosition=position");
  expect(a.vertexShader).toContain("modelMatrix*instanceMatrix");
  expect(a.fragmentShader).toContain("q-nativeNormal*.002");
  expect(a.fragmentShader).toContain("fableSurfacePitch*max(scale,.00001)");
  expect(a.uniforms.fableSurfaceDiffuse.value).toBe(b.uniforms.fableSurfaceDiffuse.value);
  expect(a.fragmentShader).toContain("fableSurfacePerturb(-vViewPosition,normal");
  first.dispose();second.dispose();
});

test("whole-voxel relief has quiet regions, no face grain and bounded minification",()=>{
  const material=installVoxelSurfaceDetail(new MeshLambertMaterial(),{pitch:.0625,strength:{value:1},variation:{value:1}}),program=shader();material.onBeforeCompile(program,renderer);
  const profile=VOXEL_SURFACE_DETAIL_PROFILE;
  expect(profile.maxDepth/profile.minWidth).toBeLessThan(1);
  expect(profile.maxWidth-profile.minWidth).toBeGreaterThan(.05);expect(profile.maxDepth).toBe(.035);expect(profile.maxDepth-profile.minDepth).toBeLessThan(.007);
  const visibility=(pixels:number)=>{const t=Math.max(0,Math.min(1,(1/pixels-profile.fadeStart)/(profile.fadeEnd-profile.fadeStart)));return 1-t*t*(3-2*t);};
  expect(visibility(.8)).toBe(0);expect(visibility(3)).toBeGreaterThan(.7);expect(visibility(12)).toBe(1);
  expect(program.fragmentShader).toContain("abs(uvDx)+abs(uvDy)");expect(program.fragmentShader).toContain("filteredWidth=sqrt");
  expect(program.fragmentShader).not.toMatch(/dFdx\(height\)|dFdy\(height\)/);
  expect(program.fragmentShader).toContain("dot(gradient,uvDx)");expect(program.fragmentShader).toContain("inversesqrt(1.+dot(slope,slope)");
  expect(profile.maxSlope).toBeLessThan(.35);
  expect(profile.maxDarkening).toBeLessThanOrEqual(.04);
  expect(program.fragmentShader).toContain("tint=mix(1.,bakedTone");
  expect(program.fragmentShader).toContain("if(abs(determinant)<1.e-12)return surfaceNormal;");
  expect(program.fragmentShader).toContain("textureGrad(fableSurfaceDiffuse");expect(program.fragmentShader).toContain("relief=mix(1.,cellRelief");
  expect(program.fragmentShader).toContain("float cellRelief=1.0+");
  expect(program.fragmentShader).not.toContain("vec2 tilt");expect(program.fragmentShader).not.toContain("axis*vec3");
  const detailCode=program.fragmentShader.slice(0,program.fragmentShader.indexOf("#define LAMBERT"));
  expect(detailCode).not.toMatch(/uniform\s+(?:float|vec\d)\s+(?:time|cameraPosition)|sampler2D|texture2D|fableSurfaceHash|fableSurfaceRegion/);
  material.dispose();
});

test("one baked response drives both normal relief and diffuse using true texture gradients",()=>{
 const material=installVoxelSurfaceDetail(new MeshLambertMaterial(),{pitch:.0625,strength:{value:.55},variation:{value:.65}}),program=shader();material.onBeforeCompile(program,renderer);
 const fragment=program.fragmentShader;
 expect(fragment).toContain("uniform highp sampler3D fableSurfaceDiffuse");
 expect(fragment.match(/textureGrad\(/g)).toHaveLength(1);
 expect(fragment).toContain("(cell+.5)/16.0,qDx/16.0,qDy/16.0");
 expect(fragment.match(/dFdx\(q\)/g)).toHaveLength(1);expect(fragment.match(/dFdy\(q\)/g)).toHaveLength(1);
 expect(fragment.indexOf("qDx=dFdx(q)")).toBeLessThan(fragment.indexOf("if(face.x>.5)"));
 expect(fragment).not.toMatch(/fableSurfaceDistance|exp2|log2|fableSurfaceHash|fableSurfaceRegion|vec2 tilt/);
 expect(fragment.match(/slope\*=inversesqrt/g)).toHaveLength(1);
 expect(VOXEL_SURFACE_DETAIL_PROFILE).toMatchObject({cellScale:1,minDepth:.029,maxDepth:.035,minRelief:1,maxReliefBoost:.45,maxSlope:.16,maxDarkening:.02});
 material.dispose();
});

test("material disposal releases its texture lease exactly once without invalidating another material",()=>{
 const first=installVoxelSurfaceDetail(new MeshLambertMaterial(),{pitch:.0625,strength:{value:1},variation:{value:1}}),second=installVoxelSurfaceDetail(new MeshLambertMaterial(),{pitch:.0625,strength:{value:1},variation:{value:1}});
 const a=shader(),b=shader();first.onBeforeCompile(a,renderer);second.onBeforeCompile(b,renderer);
 const texture=a.uniforms.fableSurfaceDiffuse.value;expect(texture).toBe(b.uniforms.fableSurfaceDiffuse.value);
 const disposed=vi.spyOn(texture,"dispose");first.dispose();first.dispose();expect(disposed).not.toHaveBeenCalled();second.dispose();second.dispose();expect(disposed).toHaveBeenCalledOnce();
});
