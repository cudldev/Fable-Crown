import {MeshLambertMaterial,Vector3} from "three";

export interface VoxelSurfaceDetailOptions {
  /** Native source pitch, unchanged by presentation LOD or instance scaling. */
  pitch:number;
  /** Minimum corner of the native source grid, in untransformed geometry coordinates. */
  origin?:readonly[number,number,number];
  strength:{value:number};
  variation:{value:number};
}
export const VOXEL_SURFACE_DETAIL_PROFILE=Object.freeze({minWidth:.07,maxWidth:.14,minDepth:.01,maxDepth:.05,maxTilt:.025,fadeStart:.12,fadeEnd:.75});
const installed=new WeakSet<MeshLambertMaterial>();
const bounded=(value:number,min:number,max:number,fallback=0)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;

const vertexHeader=`
varying vec3 vFableSurfacePosition;
varying vec3 vFableSurfaceNormal;
varying vec3 vFableSurfaceScale;
`;
const vertexCapture=`
vFableSurfacePosition=position;
vFableSurfaceNormal=normal;
mat4 fableSurfaceMatrix=modelMatrix;
#ifdef USE_INSTANCING
fableSurfaceMatrix=modelMatrix*instanceMatrix;
#endif
vFableSurfaceScale=vec3(length(fableSurfaceMatrix[0].xyz),length(fableSurfaceMatrix[1].xyz),length(fableSurfaceMatrix[2].xyz));
`;
const fragmentHeader=`
uniform float fableSurfacePitch;
uniform vec3 fableSurfaceOrigin;
uniform float fableSurfaceStrength;
uniform float fableSurfaceVariation;
varying vec3 vFableSurfacePosition;
varying vec3 vFableSurfaceNormal;
varying vec3 vFableSurfaceScale;

float fableSurfaceHash(vec3 p){
 p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
}
float fableSurfaceHeight(){
 vec3 q=(vFableSurfacePosition-fableSurfaceOrigin)/fableSurfacePitch;
 vec3 nativeNormal=normalize(vFableSurfaceNormal),face=abs(nativeNormal);
 vec2 uv;float axis,scale;
 if(face.x>.5){uv=q.yz;axis=0.;scale=vFableSurfaceScale.x;}
 else if(face.y>.5){uv=q.xz;axis=1.;scale=vFableSurfaceScale.y;}
 else{uv=q.xy;axis=2.;scale=vFableSurfaceScale.z;}
 // Choose the occupied cell just inside the face; its pattern survives instance
 // rotation, translation and source-grid-preserving LOD merges.
 vec3 cell=floor(q-nativeNormal*.002)+axis*vec3(17.,29.,43.);
 float a=fableSurfaceHash(cell),b=fableSurfaceHash(cell+vec3(11.,7.,3.));
 float c=fableSurfaceHash(cell+vec3(5.,23.,13.)),d=fableSurfaceHash(cell+vec3(37.,2.,19.));
 float width=mix(.105,mix(${VOXEL_SURFACE_DETAIL_PROFILE.minWidth},${VOXEL_SURFACE_DETAIL_PROFILE.maxWidth},a),fableSurfaceVariation);
 float depth=mix(.029,mix(${VOXEL_SURFACE_DETAIL_PROFILE.minDepth},${VOXEL_SURFACE_DETAIL_PROFILE.maxDepth},b),fableSurfaceVariation);
 vec2 footprint=max(fwidth(uv),vec2(.000001));
 float visibility=1.-smoothstep(${VOXEL_SURFACE_DETAIL_PROFILE.fadeStart},${VOXEL_SURFACE_DETAIL_PROFILE.fadeEnd},max(footprint.x,footprint.y));
 vec2 local=fract(uv),edge=min(local,1.-local);
 // Widen the normal bevel when it is narrower than a fragment; distant cells
 // then fade out rather than turning into a screen-dependent checker pattern.
 vec2 ramp=smoothstep(vec2(0.),max(vec2(width),footprint*1.25),edge);
 float envelope=ramp.x*ramp.y;
 vec2 tilt=(vec2(c,d)*2.-1.)*${VOXEL_SURFACE_DETAIL_PROFILE.maxTilt}*fableSurfaceVariation;
 return (depth+dot(local-.5,tilt))*envelope*fableSurfacePitch*max(scale,.00001)*visibility;
}
vec3 fableSurfacePerturb(vec3 surfacePosition,vec3 surfaceNormal,float height,float faceDirection){
 // Derivative bump frame in view-space metres, including instance transforms
 // and the renderer's curved-world position. No UV/tangent attributes required.
 vec3 dx=dFdx(surfacePosition),dy=dFdy(surfacePosition);
 vec3 r1=cross(dy,surfaceNormal),r2=cross(surfaceNormal,dx);
 float determinant=dot(dx,r1)*faceDirection;
 if(abs(determinant)<1.e-12)return surfaceNormal;
 vec3 gradient=sign(determinant)*(dFdx(height)*r1+dFdy(height)*r2);
 return normalize(abs(determinant)*surfaceNormal-gradient);
}
`;
const fragmentNormal=`
// A uniform zero leaves the original Lambert normal untouched, bit for bit.
if(fableSurfaceStrength>0.){
 float fableHeight=fableSurfaceHeight()*fableSurfaceStrength;
 normal=fableSurfacePerturb(-vViewPosition,normal,fableHeight,faceDirection);
}
`;

/** Original procedural normal overlay only: no textures, pigments, geometry or shadows change. */
export function installVoxelSurfaceDetail<T extends MeshLambertMaterial>(material:T,options:VoxelSurfaceDetailOptions):T {
  if(installed.has(material))return material;installed.add(material);
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
  const pitch={value:bounded(options.pitch,.00001,100,.0625)};
  const origin={value:new Vector3(...(options.origin??[0,0,0]).map(v=>bounded(v,-100000,100000)) as [number,number,number])};
  // Read the shared live controls through bounded getters without mutating them.
  const strength={get value(){return bounded(options.strength.value,0,1);}};
  const variation={get value(){return bounded(options.variation.value,0,1);}};
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    Object.assign(shader.uniforms,{fableSurfacePitch:pitch,fableSurfaceOrigin:origin,fableSurfaceStrength:strength,fableSurfaceVariation:variation});
    shader.vertexShader=vertexHeader+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\n"+vertexCapture);
    shader.fragmentShader=fragmentHeader+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace("#include <normal_fragment_maps>","#include <normal_fragment_maps>\n"+fragmentNormal);
  };
  material.customProgramCacheKey=function(){return key.call(this)+"|fable-voxel-surface-detail-v1";};
  material.needsUpdate=true;
  return material;
}
