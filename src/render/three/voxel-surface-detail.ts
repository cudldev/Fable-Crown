import {MeshLambertMaterial,Vector3} from "three";
import {acquireVoxelDiffuseDetail,VOXEL_DIFFUSE_DETAIL_SIZE} from "./voxel-diffuse-detail";

export interface VoxelSurfaceDetailOptions {
  /** Source-aligned detail cell pitch, unchanged by presentation LOD. */
  pitch:number;
  /** Minimum corner of the native source grid, in untransformed geometry coordinates. */
  origin?:readonly[number,number,number];
  strength:{value:number};
  variation:{value:number};
}
export const VOXEL_SURFACE_DETAIL_PROFILE=Object.freeze({cellScale:1,minWidth:.07,maxWidth:.14,minDepth:.029,maxDepth:.035,minRelief:1,maxReliefBoost:.45,maxSlope:.16,maxDarkening:.02,fadeStart:.12,fadeEnd:.75});
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
uniform highp sampler3D fableSurfaceDiffuse;
varying vec3 vFableSurfacePosition;
varying vec3 vFableSurfaceNormal;
varying vec3 vFableSurfaceScale;

vec3 fableSurfaceSample(){
 vec3 q=(vFableSurfacePosition-fableSurfaceOrigin)/fableSurfacePitch;
 vec3 nativeNormal=normalize(vFableSurfaceNormal),face=abs(nativeNormal);
 vec3 qDx=dFdx(q),qDy=dFdy(q);
 vec2 uv,uvDx,uvDy;float scale;
 if(face.x>.5){uv=q.yz;uvDx=qDx.yz;uvDy=qDy.yz;scale=vFableSurfaceScale.x;}
 else if(face.y>.5){uv=q.xz;uvDx=qDx.xz;uvDy=qDy.xz;scale=vFableSurfaceScale.y;}
 else{uv=q.xy;uvDx=qDx.xy;uvDy=qDy.xy;scale=vFableSurfaceScale.z;}
 // Choose the occupied cell just inside the face; its pattern survives instance
 // rotation, translation and source-grid-preserving LOD merges.
 vec3 cell=floor(q-nativeNormal*.002);
 // Near cells have one flat baked tone. Continuous grid derivatives select real
 // hardware mip levels even though the lookup itself uses the cell centre.
 float bakedTone=textureGrad(fableSurfaceDiffuse,(cell+.5)/${VOXEL_DIFFUSE_DETAIL_SIZE.toFixed(1)},qDx/${VOXEL_DIFFUSE_DETAIL_SIZE.toFixed(1)},qDy/${VOXEL_DIFFUSE_DETAIL_SIZE.toFixed(1)}).r;
 float response=clamp((bakedTone*255.-250.)/5.,0.,1.);
 float cellRelief=${VOXEL_SURFACE_DETAIL_PROFILE.minRelief.toFixed(1)}+${VOXEL_SURFACE_DETAIL_PROFILE.maxReliefBoost}*fableSurfaceVariation*smoothstep(.15+.2*fableSurfaceVariation,.85-.2*fableSurfaceVariation,response);
 float relief=mix(1.,cellRelief,smoothstep(0.,.5,fableSurfaceVariation));
 float width=mix(.105,mix(${VOXEL_SURFACE_DETAIL_PROFILE.minWidth},${VOXEL_SURFACE_DETAIL_PROFILE.maxWidth},response),fableSurfaceVariation);
 float depth=mix(.029,mix(${VOXEL_SURFACE_DETAIL_PROFILE.minDepth},${VOXEL_SURFACE_DETAIL_PROFILE.maxDepth},response),fableSurfaceVariation);
 vec2 footprint=max(abs(uvDx)+abs(uvDy),vec2(.000001));
 float visibility=1.-smoothstep(${VOXEL_SURFACE_DETAIL_PROFILE.fadeStart},${VOXEL_SURFACE_DETAIL_PROFILE.fadeEnd},max(footprint.x,footprint.y));
 vec2 local=fract(uv),edge=min(local,1.-local);
 // Smoothly prefilter the bevel against the pixel footprint. Width, seed and
 // visibility are filter parameters, never differentiated as physical height.
 vec2 filteredWidth=sqrt(vec2(width*width)+footprint*footprint*1.5625);
 vec2 t=clamp(edge/filteredWidth,0.,1.);
 vec2 ramp=t*t*(3.-2.*t);
 vec2 rampGradient=6.*t*(1.-t)/filteredWidth*sign(.5-local);
 vec2 gradient=vec2(rampGradient.x*ramp.y,ramp.x*rampGradient.y)*depth*relief;
 // Analytic chain rule avoids sampling a different random cell across a quad.
 vec2 screenGradient=vec2(dot(gradient,uvDx),dot(gradient,uvDy))*fableSurfacePitch*max(scale,.00001)*visibility;
 float tint=mix(1.,bakedTone,fableSurfaceVariation*smoothstep(0.,.2,fableSurfaceStrength));
 return vec3(screenGradient,tint);
}
vec3 fableSurfacePerturb(vec3 surfacePosition,vec3 surfaceNormal,vec2 heightGradient,float faceDirection){
 // Derivative bump frame in view-space metres, including instance transforms
 // and the renderer's curved-world position. No UV/tangent attributes required.
 vec3 dx=dFdx(surfacePosition),dy=dFdy(surfacePosition);
 vec3 r1=cross(dy,surfaceNormal),r2=cross(surfaceNormal,dx);
 float determinant=dot(dx,r1)*faceDirection;
 if(abs(determinant)<1.e-12)return surfaceNormal;
 vec3 slope=sign(determinant)*(heightGradient.x*r1+heightGradient.y*r2)/abs(determinant);
 // A smooth bound prevents hard normal bands at every viewing distance.
 slope*=inversesqrt(1.+dot(slope,slope)/${VOXEL_SURFACE_DETAIL_PROFILE.maxSlope*VOXEL_SURFACE_DETAIL_PROFILE.maxSlope});
 return normalize(surfaceNormal-slope);
}
`;
const fragmentColor=`
vec3 fableSurfaceDetailValue=vec3(0.,0.,1.);
if(fableSurfaceStrength>0.){
 fableSurfaceDetailValue=fableSurfaceSample();
 diffuseColor.rgb*=fableSurfaceDetailValue.z;
}
`;
const fragmentNormal=`
// A uniform zero leaves the original Lambert normal untouched, bit for bit.
if(fableSurfaceStrength>0.){
 vec2 fableGradient=fableSurfaceDetailValue.xy*fableSurfaceStrength;
 normal=fableSurfacePerturb(-vViewPosition,normal,fableGradient,faceDirection);
}
`;

/** Fine-cell normal relief and quiet baked diffuse; no external textures or geometry changes. */
export function installVoxelSurfaceDetail<T extends MeshLambertMaterial>(material:T,options:VoxelSurfaceDetailOptions):T {
  if(installed.has(material))return material;installed.add(material);
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
  const pitch={value:bounded(options.pitch,.00001,100,.0625)};
  const origin={value:new Vector3(...(options.origin??[0,0,0]).map(v=>bounded(v,-100000,100000)) as [number,number,number])};
  // Read the shared live controls through bounded getters without mutating them.
  const strength={get value(){return bounded(options.strength.value,0,1);}};
  const variation={get value(){return bounded(options.variation.value,0,1);}};
  const diffuse=acquireVoxelDiffuseDetail();
  material.addEventListener("dispose",()=>diffuse.release());
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    Object.assign(shader.uniforms,{fableSurfacePitch:pitch,fableSurfaceOrigin:origin,fableSurfaceStrength:strength,fableSurfaceVariation:variation,fableSurfaceDiffuse:{value:diffuse.texture}});
    shader.vertexShader=vertexHeader+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\n"+vertexCapture);
    shader.fragmentShader=fragmentHeader+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>","#include <color_fragment>\n"+fragmentColor);
    shader.fragmentShader=shader.fragmentShader.replace("#include <normal_fragment_maps>","#include <normal_fragment_maps>\n"+fragmentNormal);
  };
  material.customProgramCacheKey=function(){return key.call(this)+"|fable-voxel-surface-detail-v6";};
  material.needsUpdate=true;
  return material;
}
