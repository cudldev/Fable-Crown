import {LinearMipmapLinearFilter,NearestFilter,NoColorSpace,RedFormat,RepeatWrapping,UnsignedByteType} from "three";
import {expect,test,vi} from "vitest";
import {acquireVoxelDiffuseDetail,bakeVoxelDiffuseDetail,VOXEL_DIFFUSE_DETAIL_SIZE} from "../src/render/three/voxel-diffuse-detail";

test("the deterministic 4KiB diffuse bake stays below two percent darkening with broad quiet clusters",()=>{
  const data=bakeVoxelDiffuseDetail(),size=VOXEL_DIFFUSE_DETAIL_SIZE;
  expect(data.byteLength).toBe(4096);expect(data).toEqual(bakeVoxelDiffuseDetail());
  expect(Math.min(...data)).toBe(250);expect(Math.max(...data)).toBe(255);expect(1-250/255).toBeLessThan(.02);
  let hash=2166136261;for(const value of data)hash=Math.imul(hash^value,16777619)>>>0;
  expect(hash).toBe(759488865);
  expect(data.reduce((sum,value)=>sum+value,0)/data.length).toBeCloseTo(252.5,2);
  const at=(x:number,y:number,z:number)=>data[(x%size)+size*((y%size)+size*(z%size))];
  let equalNeighbors=0,total=0;
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(const next of [[x+1,y,z],[x,y+1,z],[x,y,z+1]]){
    const difference=Math.abs(at(x,y,z)-at(next[0],next[1],next[2]));
    expect(difference).toBeLessThanOrEqual(1);if(difference===0)equalNeighbors++;total++;
  }
  expect(equalNeighbors/total).toBeGreaterThan(.65);
  // A small front-facing object must sample several quiet tones, rather than
  // sitting entirely in a near-white lobe that disappears after 8-bit output.
  const frontSlice:number[]=[];
  for(let y=0;y<6;y++)for(let x=0;x<8;x++)frontSlice.push(at(x,y,0));
  expect(Math.min(...frontSlice)).toBe(251);expect(Math.max(...frontSlice)).toBe(255);
  expect(new Set(frontSlice).size).toBe(5);
  expect(frontSlice.filter(value=>value<=252).length/frontSlice.length).toBeGreaterThan(.3);
});

test("the shared red texture requests real hardware mipmaps and native-cell nearest magnification",()=>{
  const lease=acquireVoxelDiffuseDetail(),texture=lease.texture;
  expect(texture.image.width).toBe(16);expect(texture.image.height).toBe(16);expect(texture.image.depth).toBe(16);
  expect(texture.image.data?.byteLength).toBe(4096);
  expect(texture.format).toBe(RedFormat);expect(texture.type).toBe(UnsignedByteType);expect(texture.colorSpace).toBe(NoColorSpace);
  expect(texture.generateMipmaps).toBe(true);expect(texture.minFilter).toBe(LinearMipmapLinearFilter);expect(texture.magFilter).toBe(NearestFilter);
  expect([texture.wrapS,texture.wrapT,texture.wrapR]).toEqual([RepeatWrapping,RepeatWrapping,RepeatWrapping]);expect(texture.unpackAlignment).toBe(1);
  lease.release();
});

test("leases share one texture, tolerate repeated release and retain the once-baked CPU bytes",()=>{
  const first=acquireVoxelDiffuseDetail(),second=acquireVoxelDiffuseDetail(),texture=first.texture,data=texture.image.data;
  expect(second.texture).toBe(texture);
  const disposed=vi.spyOn(texture,"dispose");first.release();first.release();expect(disposed).not.toHaveBeenCalled();
  second.release();second.release();expect(disposed).toHaveBeenCalledOnce();
  const next=acquireVoxelDiffuseDetail();expect(next.texture).not.toBe(texture);expect(next.texture.image.data).toBe(data);next.release();
});
