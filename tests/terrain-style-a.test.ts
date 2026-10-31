import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { parseVox, type VoxelGrid } from '../src/render/three/voxel-data';

interface Spec {id:string;file:string;shape:'flat'|'stair';phase:[number,number];pitch:number;pivot:number[];cells:number}
const root='assets/source/voxel/terrain-style-a-v2/';
const manifest=JSON.parse(readFileSync(root+'manifest.json','utf8')) as {version:string;variantPeriod:number;assets:Spec[];variants:Record<string,string[]>;reviewIds:string[];sourceArtwork:Record<string,{file:string;sha256:string}>};
const grids=new Map<string,VoxelGrid>();
const index=(x:number,y:number,z:number)=>(x*16+y)*8+z;
for(const spec of manifest.assets){const b=readFileSync(root+spec.file);grids.set(spec.id,parseVox(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)));}
const rgb=(id:string,x:number,y:number)=>{const grid=grids.get(id)!,at=(grid.cells[index(x,y,7)]-1)*4;return Array.from(grid.palette.slice(at,at+3));};

test('style A native sources preserve density, flat attachment planes, pivots and stair end heights',()=>{
  expect(manifest.assets).toHaveLength(288);expect(grids.size).toBe(manifest.assets.length);
  for(const spec of manifest.assets){
    const grid=grids.get(spec.id)!;
    expect(grid.size).toEqual([16,16,8]);expect(spec.pitch*16).toBe(1);expect(spec.pivot).toEqual([8,8,spec.shape==='stair'?0:8]);
    expect(grid.cells.filter(Boolean).length).toBe(spec.cells);
    for(let x=0;x<16;x++)for(let y=0;y<16;y++){
      const expected=spec.shape==='stair'?(Math.floor(x/4)+1)*2:8;
      let height=0;for(let z=0;z<8;z++)if(grid.cells[index(x,y,z)])height=z+1;
      expect(height).toBe(expected);
    }
  }
});

test('phase variants wrap the macro artwork exactly without a border around every metre tile',()=>{
  expect(manifest.variantPeriod).toBe(4);
  for(const family of ['grass','dirt','cobble','sand']){
    const ids=manifest.variants[family];expect(ids).toHaveLength(16);
    for(let phase=0;phase<4;phase++)for(let cell=0;cell<16;cell++){
      expect(rgb(ids[phase*4+3],15,cell)).toEqual(rgb(ids[phase*4],0,cell));
      expect(rgb(ids[12+phase],cell,15)).toEqual(rgb(ids[phase],cell,0));
    }
    // Independent one-metre variants really contain different native pigment arrangements.
    expect(grids.get(ids[0])!.cells).not.toEqual(grids.get(ids[5])!.cells);
  }
});

test('soft north/south transition endpoints match adjacent source materials at every phase',()=>{
  for(const [a,b]of [['grass','dirt'],['grass','sand'],['dirt','cobble']])for(let phase=0;phase<16;phase++){
    const first=manifest.variants[a][phase],last=manifest.variants[b][phase];
    const north=manifest.variants[a+'-'+b+'-edge'][phase],south=manifest.variants[a+'-'+b+'-edge-south'][phase];
    for(let x=0;x<16;x++){
      expect(rgb(north,x,0)).toEqual(rgb(first,x,0));expect(rgb(north,x,15)).toEqual(rgb(last,x,15));
      expect(rgb(south,x,0)).toEqual(rgb(last,x,0));expect(rgb(south,x,15)).toEqual(rgb(first,x,15));
    }
  }
});

test('source artwork, native manifest digest and phase/gallery references remain traceable',()=>{
  const hash=createHash('sha256');
  for(const spec of manifest.assets)hash.update(spec.file).update(readFileSync(root+spec.file));
  expect(hash.digest('hex').slice(0,16)).toBe(manifest.version);
  for(const source of Object.values(manifest.sourceArtwork))expect(createHash('sha256').update(readFileSync(root+source.file)).digest('hex')).toBe(source.sha256);
  for(const ids of Object.values(manifest.variants)){
    expect(ids).toHaveLength(16);
    ids.forEach((id,i)=>{expect(grids.has(id)).toBe(true);expect(manifest.assets.find(a=>a.id===id)!.phase).toEqual([i%4,Math.floor(i/4)]);});
  }
  for(const id of manifest.reviewIds)expect(grids.has(id)).toBe(true);
});

test('coarser revision retains native16cell geometry while grouping pigment into2by2cells',()=>{
  const folder='assets/source/voxel/terrain-style-a-v3/';
  const coarse=JSON.parse(readFileSync(folder+'manifest.json','utf8')) as {pigmentCellsPerMetre:number;paletteColors:number;variants:Record<string,string[]>};
  expect(coarse.pigmentCellsPerMetre).toBe(8);expect(coarse.paletteColors).toBe(48);
  for(const family of ['grass','dirt','cobble','sand'])for(const id of coarse.variants[family]){
    const b=readFileSync(folder+id+'.vox'),grid=parseVox(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
    expect(grid.size).toEqual([16,16,8]);
    for(let x=0;x<16;x+=2)for(let y=0;y<16;y+=2){
      const color=grid.cells[index(x,y,7)];expect(color).toBeGreaterThan(0);expect(color).toBeLessThanOrEqual(48);
      expect(grid.cells[index(x+1,y,7)]).toBe(color);expect(grid.cells[index(x,y+1,7)]).toBe(color);expect(grid.cells[index(x+1,y+1,7)]).toBe(color);
    }
  }
});
