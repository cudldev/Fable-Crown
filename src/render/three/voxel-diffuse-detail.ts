import {Data3DTexture,LinearMipmapLinearFilter,NearestFilter,NoColorSpace,RedFormat,RepeatWrapping,UnsignedByteType} from "three";

export const VOXEL_DIFFUSE_DETAIL_SIZE=16;
/** Original quiet periodic tone field. Six linear-light values span less than 2%. */
export function bakeVoxelDiffuseDetail():Uint8Array {
  const size=VOXEL_DIFFUSE_DETAIL_SIZE,data=new Uint8Array(size**3),turn=Math.PI*2/size;
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const field=.5+.17*Math.cos(x*turn)+.13*Math.cos((x+z)*turn)+.10*Math.cos(y*turn)+.06*Math.cos((y-z)*turn);
    data[x+size*(y+size*z)]=250+Math.round(Math.max(0,Math.min(1,field))*5);
  }
  return data;
}

let baked:Uint8Array|undefined;
let shared:Data3DTexture|undefined;
let references=0;
export interface VoxelDiffuseDetailLease {readonly texture:Data3DTexture;release():void}

/** One GPU texture for all live materials; retain its once-baked CPU field after disposal. */
export function acquireVoxelDiffuseDetail():VoxelDiffuseDetailLease {
  if(!shared){
    baked??=bakeVoxelDiffuseDetail();
    shared=new Data3DTexture(baked,VOXEL_DIFFUSE_DETAIL_SIZE,VOXEL_DIFFUSE_DETAIL_SIZE,VOXEL_DIFFUSE_DETAIL_SIZE);
    shared.name="fable-quiet-voxel-diffuse";
    shared.format=RedFormat;shared.type=UnsignedByteType;shared.colorSpace=NoColorSpace;
    shared.generateMipmaps=true;shared.minFilter=LinearMipmapLinearFilter;shared.magFilter=NearestFilter;
    shared.wrapS=shared.wrapT=shared.wrapR=RepeatWrapping;shared.unpackAlignment=1;shared.needsUpdate=true;
  }
  references++;const texture=shared;let released=false;
  return {texture,release(){
    if(released)return;released=true;references--;
    if(references===0){texture.dispose();if(shared===texture)shared=undefined;}
  }};
}
