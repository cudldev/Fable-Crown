import {describe,it,expect} from "vitest";
import {captureGroundHeight,groundHeightAt,traceGroundHeight} from "../src/render/three/ground-height";
import {packRGB,rasterizeGI,traceGI,visibleGI,type GISolveConfig} from "../src/render/three/voxel-gi-core";
describe("terraform support and diffuse lighting",()=>{
  it("retains the exact old flat-ground path when no support changes",()=>{
    expect(captureGroundHeight(4,4,()=>0)).toBeUndefined();
  });
  it("serializes exact quarter-tile stair treads",()=>{
    const field=captureGroundHeight(4,4,(x,z)=>Math.round(z)===1&&Math.round(x)===1?(Math.floor((x-.5)*4)+1)*.125:0)!;
    expect(groundHeightAt(field,.625,1)).toBe(.125);expect(groundHeightAt(field,1.375,1)).toBe(.5);
    expect(structuredClone(field)).toEqual(field);
  });
  it("hits raised tops, lowered floors and vertical risers",()=>{
    const field=captureGroundHeight(4,4,(x,z)=>Math.round(x)===1&&Math.round(z)===1?.5:Math.round(x)===2?-.5:0)!;
    expect(traceGroundHeight(field,[1,2,1],[0,-1,0],5)?.distance).toBeCloseTo(1.5);
    expect(traceGroundHeight(field,[2,2,1],[0,-1,0],5)?.position[1]).toBe(-.5);
    const side=traceGroundHeight(field,[0,.25,1],[1,0,0],3)!;
    expect(side.distance).toBeCloseTo(.5);expect(side.normal).toEqual([-1,0,0]);
  });
  it("uses edited ground for GI ray hits and visibility below the original plane",()=>{
    const field=captureGroundHeight(4,4,(x)=>Math.round(x)===2?-.5:Math.round(x)===1?.5:0)!;
    const config:GISolveConfig={origin:[-2,-1,-2],size:[16,12,16],pitch:.5,stride:2,rays:8,sunDirection:[0,1,0],sunColor:[1,1,1],skyColor:[1,1,1],sunPower:1,skyPower:1,lamps:[],depleted:[]};
    const grid=rasterizeGI({objects:[],ground:new Uint32Array(16).fill(packRGB(.5,.4,.2)),width:4,height:4,heightField:field},config);
    expect(traceGI(grid,[1,2,1],[0,-1,0])?.position[1]).toBe(.5);
    expect(visibleGI(grid,[2,-.25,.9],[2,-.25,1.1])).toBe(true);
    expect(visibleGI(grid,[0,.25,1],[2,.25,1])).toBe(false);
  });
});
