import {expect,it} from "vitest";
import {Vector3} from "three";
import {homeFootprints} from "../src/valley/world";
import {objectRotationY} from "../src/render/three/object-placement";
it("all four rendered cottage doorways align with their authoritative collision entrance",()=>{
  for(const rotation of [0,1,2,3] as const){
    const fp=homeFootprints({x:54,z:155,rotation,tentPacked:false})!;
    const center=new Vector3(fp.cottage.x+(fp.cottage.width-1)/2,0,fp.cottage.z+(fp.cottage.height-1)/2);
    // Authored doorway centre is +0.5m across the cottage and on the south edge.
    const doorway=new Vector3(.5,0,2.5).applyAxisAngle(new Vector3(0,1,0),objectRotationY(rotation)).add(center);
    const outward=new Vector3(0,0,.5).applyAxisAngle(new Vector3(0,1,0),objectRotationY(rotation));
    expect(doorway.x-outward.x).toBeCloseTo(fp.door.x);expect(doorway.z-outward.z).toBeCloseTo(fp.door.z);
  }
});
