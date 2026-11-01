import {describe,it,expect} from "vitest";
import {Ray,Vector3} from "three";
import {appendSteppedGround,pickSteppedGround} from "../src/render/three/stepped-ground";
import {WorldCurve} from "../src/render/three/world-curve";

describe("authoritative stepped ground presentation",()=>{
  it("keeps flat tile geometry to two horizontal triangles",()=>{
    const b={positions:[] as number[],normals:[] as number[],uvs:[] as number[]};
    expect(appendSteppedGround(b,2,3,()=>.5)).toBe(6);
    expect(b.positions.filter((_,i)=>i%3===1)).toEqual(Array(6).fill(.5));
    expect(b.uvs).toHaveLength(12);
  });
  it("builds exact terrace tops and vertical earth walls",()=>{
    const b={positions:[] as number[],normals:[] as number[],uvs:[] as number[]};
    appendSteppedGround(b,0,0,(x,z)=>Math.abs(x)<.5&&Math.abs(z)<.5?.5:0);
    const heights=new Set(b.positions.filter((_,i)=>i%3===1));
    expect([...heights].sort()).toEqual([0,.5]);
    expect(b.normals.some((n,i)=>i%3===0&&n===1)).toBe(true);
    expect(b.normals.some((n,i)=>i%3===0&&n===-1)).toBe(true);
    expect(b.normals.length).toBe(b.positions.length);
    expect(b.uvs.length).toBe(b.positions.length/3*2);
  });
  it("authors four treads without diagonal slope normals",()=>{
    const b={positions:[] as number[],normals:[] as number[],uvs:[] as number[]};
    appendSteppedGround(b,0,0,(x,z)=>Math.abs(x)<.5&&Math.abs(z)<.5?(Math.floor((x+.5)*4)+1)*.125:0);
    const topHeights=new Set<number>();
    for(let i=0;i<b.normals.length;i+=3)if(b.normals[i+1]===1)topHeights.add(b.positions[i+1]);
    expect([...topHeights].sort()).toEqual([.125,.25,.375,.5]);
    expect(b.normals.every(n=>n===0||n===1||n===-1)).toBe(true);
  });
  it("can keep earth faces separate from the native grass pigment surface",()=>{
    const tops={positions:[] as number[],normals:[] as number[],uvs:[] as number[]},earth={positions:[] as number[],normals:[] as number[],uvs:[] as number[]};
    appendSteppedGround(tops,0,0,(x,z)=>Math.abs(x)<.5&&Math.abs(z)<.5?.5:0,[0,0,1,1],earth);
    expect(tops.positions).toHaveLength(18);expect(earth.positions.length).toBeGreaterThan(0);
    expect(earth.normals.filter((_,i)=>i%3===1).every(y=>y===0)).toBe(true);
  });
  it("picks the raised top rather than a displaced zero plane",()=>{
    const curve=new WorldCurve();
    const ray=new Ray(new Vector3(-1,2,0),new Vector3(1,-1,0).normalize());
    const pick=pickSteppedGround(ray,curve,(x,z)=>x>=0&&x<1&&Math.abs(z)<.5?.5:0);
    expect(pick?.x).toBeCloseTo(.5);expect(pick?.y).toBe(.5);
    curve.dispose();
  });
  it("picks each individual stair tread",()=>{
    const curve=new WorldCurve();
    for(let i=0;i<4;i++) {
      const x=-.375+i*.25;
      const ray=new Ray(new Vector3(x,2,0),new Vector3(0,-1,0));
      const p=pickSteppedGround(ray,curve,(sx)=>Math.abs(sx)<.5?(Math.floor((sx+.5)*4)+1)*.125:0);
      expect(p?.y).toBe((i+1)*.125);
    }curve.dispose();
  });
  it("solves the same shifted curved surface used by rendering",()=>{
    const curve=new WorldCurve();curve.update(new Vector3(0,0,0),2,1,true);
    const ray=new Ray(new Vector3(3,4,5),new Vector3(0,-1,0));
    const p=curve.ground(ray,.5)!;expect(p.y).toBe(.5);
    const bent=curve.bend(p.clone());expect(bent.y).toBeLessThan(.5);
    expect(pickSteppedGround(ray,curve,()=>.5)?.y).toBe(.5);
    curve.dispose();
  });
});
