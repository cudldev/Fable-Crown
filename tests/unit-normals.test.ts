import { describe, expect, it } from 'vitest';
import { createUnitSheet, createHeldUnitSheet, UNIT_KINDS, UNIT_TOOLS, type UnitSheet } from '../src/render/pixel-units';
const n = (s: UnitSheet,x: number,y: number,f=0) => {
  const i=(y*s.width+f*s.frameSize+x)*4;
  return Array.from(s.normal.subarray(i,i+3),v=>v/255*2-1);
};
describe('environment-lit sprite form normals', () => {
  it('describes one broad face across skin/eye/pigment boundaries, with outward left/right and top/bottom slopes', () => {
    const s=createUnitSheet('prince');
    expect(n(s,10,16)[0]).toBeLessThan(-.55);
    expect(n(s,20,16)[0]).toBeGreaterThan(.55);
    expect(n(s,16,10)[1]).toBeGreaterThan(.45);
    expect(n(s,16,18)[1]).toBeLessThan(-.45);
    // Adjacent source cells form one coarse facet rather than individual pillow bumps.
    expect(n(s,12,16)).toEqual(n(s,13,17));
    // Eye color does not flatten or restart the head curvature.
    expect(n(s,12,16)[0]).toBeLessThan(n(s,14,16)[0]!);
  });
  it('provides substantial side-light response for every family, with the same normals in static body frames', () => {
    for(const kind of UNIT_KINDS){
      const s=createUnitSheet(kind);let lo=1,hi=-1;
      for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(s.rgba[(y*s.width+x)*4+3]){
        const v=n(s,x,y);lo=Math.min(lo,v[0]!);hi=Math.max(hi,v[0]!);
        expect(n(s,x,y,1)).toEqual(v);
      }
      expect(lo,kind).toBeLessThan(-.4);expect(hi,kind).toBeGreaterThan(.4);
    }
  });
  it('keeps translated hand/tool relief locked to its source cells in the contact frame', () => {
    for(const tool of UNIT_TOOLS){const s=createHeldUnitSheet('prince',0,tool);
      for(let y=1;y<32;y++)for(let x=0;x<32;x++)if(s.rgba[(y*s.width+x)*4+3])
        expect(n(s,x,y-1,1)).toEqual(n(s,x,y));
    }
  });
});
