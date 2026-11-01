import { Vector3, type Ray } from "three";
import type { WorldCurve } from "./world-curve";

export interface GroundBuffers { positions:number[]; normals:number[]; uvs:number[] }
export type GroundSampler = (x:number,z:number)=>number;
/** Exact horizontal treads and vertical earth faces; no sloping terrace triangles. */
export function appendSteppedGround(buffers:GroundBuffers,x:number,z:number,sample:GroundSampler,uv:readonly number[]=[0,0,1,1],earth?:GroundBuffers):number {
  const {positions,normals,uvs}=buffers, start=positions.length/3;
  const flat=sample(x-.375,z-.375)===sample(x+.375,z+.375)&&sample(x-.375,z+.375)===sample(x+.375,z-.375)&&sample(x,z)===sample(x-.375,z-.375);
  const divisions=flat?1:4, step=1/divisions;
  const push=(vertices:number[],normal:number[],tex:number[],target=buffers)=>{target.positions.push(...vertices);for(let i=0;i<6;i++)target.normals.push(...normal);target.uvs.push(...tex);};
  const texture=(a:number,b:number)=>[uv[0]+(uv[2]-uv[0])*a,uv[3]+(uv[1]-uv[3])*b];
  for(let iz=0;iz<divisions;iz++)for(let ix=0;ix<divisions;ix++) {
    const x0=x-.5+ix*step,x1=x0+step,z0=z-.5+iz*step,z1=z0+step,h=sample((x0+x1)/2,(z0+z1)/2);
    const a=texture(ix/divisions,iz/divisions),b=texture(ix/divisions,(iz+1)/divisions),c=texture((ix+1)/divisions,(iz+1)/divisions),d=texture((ix+1)/divisions,iz/divisions);
    push([x0,h,z0,x0,h,z1,x1,h,z1,x0,h,z0,x1,h,z1,x1,h,z0],[0,1,0],[...a,...b,...c,...a,...c,...d]);
    // Segment each tile perimeter even when its top is flat: adjacent stair treads may differ.
    for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]) {
      if(divisions===1) {
        for(let i=0;i<4;i++)side(dx,dz,i/4,(i+1)/4);
      }else side(dx,dz,0,1);
    }
    function side(dx:number,dz:number,t0:number,t1:number) {
      let ax:number,az:number,bx:number,bz:number;
      if(dx===-1){ax=x0;az=z0+(z1-z0)*t1;bx=x0;bz=z0+(z1-z0)*t0;}
      else if(dx===1){ax=x1;az=z0+(z1-z0)*t0;bx=x1;bz=z0+(z1-z0)*t1;}
      else if(dz===-1){ax=x0+(x1-x0)*t0;az=z0;bx=x0+(x1-x0)*t1;bz=z0;}
      else {ax=x0+(x1-x0)*t1;az=z1;bx=x0+(x1-x0)*t0;bz=z1;}
      const lower=sample((ax+bx)/2+dx*.00001,(az+bz)/2+dz*.00001);
      if(lower>=h-1e-8)return;
      push([ax,h,az,bx,h,bz,bx,lower,bz,ax,h,az,bx,lower,bz,ax,lower,az],[dx,0,dz],[...a,...d,...c,...a,...c,...b],earth??buffers);
    }
  }
  return positions.length/3-start;
}

/** Test all authored eighth-metre levels against the same sampler used for geometry. */
export function pickSteppedGround(ray:Ray,curve:Pick<WorldCurve,"ground"|"bend">,sample:GroundSampler):Vector3|null {
  let nearest:Vector3|null=null,distance=Infinity;
  for(let eighth=-4;eighth<=8;eighth++) {
    const height=eighth/8,point=curve.ground(ray,height);
    if(!point||Math.abs(sample(point.x,point.z)-height)>1e-6)continue;
    const actual=curve.bend(point.clone()),along=actual.clone().sub(ray.origin).dot(ray.direction);
    if(along>=0&&along<distance){distance=along;nearest=point;}
  }
  return nearest;
}
