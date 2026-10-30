import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseVox } from '../src/render/three/voxel-data';

const root='assets/source/voxel/terrain-kit-v1/';
const manifest=JSON.parse(readFileSync(root+'manifest.json','utf8')) as {tileMetres:number;levelMetres:number;assets:{id:string;file:string;pitch:number;pivot:number[];cells:number;shape:string}[]};
const index=(x:number,y:number,z:number)=>(x*16+y)*8+z;
test('editable terrain modules have common dimensions, flat tops and matching adjacent footprints',()=>{
  expect(manifest.tileMetres).toBe(1); expect(manifest.levelMetres).toBe(.5);
  for(const tile of manifest.assets){
    const bytes=readFileSync(root+tile.file), grid=parseVox(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    expect(grid.size).toEqual([16,16,8]); expect(grid.cells.filter(Boolean).length).toBe(tile.cells);
    expect(16*tile.pitch).toBe(1);
    if(tile.shape!=='flat')continue;
    expect(tile.pivot).toEqual([8,8,8]);
    for(let x=0;x<16;x++)for(let y=0;y<16;y++){
      expect(grid.cells[index(x,y,7)]).toBeGreaterThan(0); expect(grid.cells[index(x,y,0)]).toBeGreaterThan(0);
    }
    // Neighbouring frames touch exactly: right edge at+.5 equals neighbour's left edge.
    expect((16-tile.pivot[0])*tile.pitch).toBe(1-tile.pivot[0]*tile.pitch);
    expect((8-tile.pivot[2])*tile.pitch).toBe(0); expect(-tile.pivot[2]*tile.pitch).toBe(-.5);
  }
});
test('stair treads connect two flat terrace levels using four equal rises',()=>{
  const tile=manifest.assets.find(a=>a.id==='stairs-stone-east')!, bytes=readFileSync(root+tile.file);
  const grid=parseVox(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  expect(tile.pivot).toEqual([8,8,0]);
  for(let x=0;x<16;x++)for(let y=0;y<16;y++){
    let height=0; for(let z=0;z<8;z++)if(grid.cells[index(x,y,z)])height=z+1;
    expect(height*tile.pitch).toBe((Math.floor(x/4)+1)*.125);
  }
});
