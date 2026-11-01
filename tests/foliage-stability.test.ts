import {expect,test} from "vitest";
import {DataTexture,Scene,Vector3,type InstancedBufferAttribute} from "three";
import {FoliageSystem,buildFoliageLayout,FOLIAGE_KINDS} from "../src/render/three/foliage";
import {DEFAULT_VISUAL_SETTINGS} from "../src/render/three/visual-settings";
import type {TerrainSurface} from "../src/render/three/terrain-tiles";
import type {WorldDefinition,WorldObject} from "../src/rpg/types";
import {createValleySave} from "../src/valley/save";
import {createValleyWorld} from "../src/valley/world";

function world(size=64):WorldDefinition{return {id:"foliage-stability",name:"Test",width:size,height:size,chunkSize:16,terrain:Array(size*size).fill("grass"),collision:Array(size*size).fill(0),objects:[],spawns:[],portals:[]};}
function visitor(w:WorldDefinition,x:number,z:number):WorldObject{return {id:"valley-visitor-builder",name:"Rowan",kind:"quest",position:{worldId:w.id,plane:0,x,y:z},width:1,height:1,blocks:false,art:"valley-visitor-builder"};}
function settle(system:FoliageSystem,target:Vector3,time=0):void{
  for(let frame=0;frame<1000;frame++){system.update(time,target,DEFAULT_VISUAL_SETTINGS,false);if(!system.stats.queued&&!system.stats.countQueued)return;}
  throw Error("Foliage did not settle");
}
const versions=(system:FoliageSystem)=>system.meshes.map(mesh=>[mesh.count,mesh.instanceMatrix.version,mesh.instanceColor!.version,(mesh.geometry.getAttribute("foliageRank")as InstancedBufferAttribute).version]);
function cards(system:FoliageSystem):Map<string,string>{
  const result=new Map<string,string>();
  for(const [kind,mesh]of system.meshes.entries())for(let i=0;i<mesh.count;i++){
    const matrix=Array.from(mesh.instanceMatrix.array.slice(i*16,i*16+16)),color=Array.from(mesh.instanceColor!.array.slice(i*3,i*3+3));
    result.set(`${kind}:${matrix[12]}:${matrix[14]}`,JSON.stringify([matrix,color,mesh.geometry.getAttribute("foliageRank").getX(i)]));
  }
  return result;
}
function expectHabitat(system:FoliageSystem,w:WorldDefinition):void{
  const layout=buildFoliageLayout(w);
  for(const mesh of system.meshes)for(let i=0;i<mesh.count;i++){
    const x=Math.round(mesh.instanceMatrix.array[i*16+12]),z=Math.round(mesh.instanceMatrix.array[i*16+14]);
    expect(layout.habitat[z*w.width+x]).not.toBe(0);
  }
}

test("mobile valley visitors neither carve grass holes nor invalidate committed static foliage",()=>{
  const w=world(),target=new Vector3(32,0,32),system=new FoliageSystem(new Scene());
  try{
    const plain=buildFoliageLayout(w);w.objects=[visitor(w,30,30)];expect(buildFoliageLayout(w)).toEqual(plain);
    system.setWorld(w);settle(system,target);const initial=versions(system),initialCards=cards(system),uploads=system.stats.uploads;
    for(let tick=0;tick<12;tick++){
      const next={...w,collision:[...w.collision],terrain:[...w.terrain],objects:[visitor(w,30+tick*.3,30)]};
      system.setWorld(next);system.update(600*(tick+1),target,DEFAULT_VISUAL_SETTINGS,false);
      expect(versions(system)).toEqual(initial);expect(system.stats.queued).toBe(0);expect(system.stats.uploads).toBe(uploads);
    }
    expect(cards(system)).toEqual(initialCards);
    const fixed={...visitor(w,30,30),id:"fixed-quest-board"};
    expect(buildFoliageLayout({...w,objects:[fixed]}).habitat[30*w.width+30]).toBe(0);
  }finally{system.dispose();}
});

test("real building, path and collision changes stream fresh habitat without clearing the committed world",()=>{
  const w=world(),target=new Vector3(32,0,32),system=new FoliageSystem(new Scene());
  try{
    system.setWorld(w);settle(system,target);
    const change=(edit:()=>void)=>{
      const old=versions(system),uploads=system.stats.uploads;edit();system.setWorld(w);
      expect(versions(system)).toEqual(old);expect(system.stats.cacheChunks).toBe(0);
      settle(system,target);expect(system.stats.uploads).toBe(uploads+1);expectHabitat(system,w);
    };
    change(()=>w.objects.push({id:"new-cottage",name:"Cottage",kind:"building",position:{worldId:w.id,plane:0,x:35,y:35},width:4,height:3,blocks:false}));
    change(()=>{for(let x=0;x<w.width;x++)w.terrain[20*w.width+x]="dirt";});
    change(()=>{for(let z=0;z<w.height;z++)w.collision[z*w.width+25]=1;});
    change(()=>{w.objects[0].position.x=40;});
  }finally{system.dispose();}
});

test("height revisions and terrain pigment updates invalidate while equivalent snapshot callbacks do not",()=>{
  const w=world(),target=new Vector3(32,0,32),system=new FoliageSystem(new Scene()),pixels=new Uint8Array([80,130,60,255]),texture=new DataTexture(pixels,1,1);
  const surface:TerrainSurface={texture,presentationTerrain:w.terrain,uvAt:()=>[0,0,1,1],stats:{textureBytes:4,sourceModules:1,paintedVariants:1,width:1,height:1,tiles:1,quietedDirtTiles:0},dispose(){texture.dispose();}};
  try{
    system.setWorld(w,undefined,surface,()=>.5,"ground1");settle(system,target);
    const old=versions(system),uploads=system.stats.uploads;system.setWorld({...w,collision:[...w.collision]},undefined,surface,()=>.5,"ground1");settle(system,target);
    expect(versions(system)).toEqual(old);expect(system.stats.uploads).toBe(uploads);
    const before=cards(system);pixels.set([150,60,20,255]);texture.needsUpdate=true;
    system.setWorld(w,undefined,surface,()=>.5,"ground1");expect(versions(system)).toEqual(old);settle(system,target);
    expect(system.stats.uploads).toBe(uploads+1);expect(cards(system)).not.toEqual(before);
    system.setWorld(w,undefined,surface,()=>1,"ground2");settle(system,target);
    expect(system.stats.uploads).toBe(uploads+2);
    for(const mesh of system.meshes)for(let i=0;i<mesh.count;i++)expect(mesh.instanceMatrix.array[i*16+13]).toBe(1);
  }finally{system.dispose();surface.dispose();}
});

test("cold off-camp streaming survives NPC snapshots and keeps identical cards in adjacent window overlap",()=>{
  const w=world(160),system=new FoliageSystem(new Scene()),camp=new Vector3(40,0,40),far=new Vector3(120,0,104),adjacent=new Vector3(128,0,104);
  try{
    system.setWorld(w);settle(system,camp);const committed=versions(system),uploads=system.stats.uploads;
    system.update(1,far,DEFAULT_VISUAL_SETTINGS,false);expect(system.stats.queued).toBe(1);expect(versions(system)).toEqual(committed);
    let settled=false;
    for(let frame=0;frame<1000;frame++){
      system.setWorld({...w,collision:[...w.collision],objects:[visitor(w,20+frame%12,20)]});
      system.update(2+frame*16,far,DEFAULT_VISUAL_SETTINGS,false);
      expect(system.meshes.reduce((total,mesh)=>total+mesh.count,0)).toBeGreaterThan(0);
      if(!system.stats.queued&&!system.stats.countQueued){settled=true;break;}
    }
    expect(settled).toBe(true);expect(system.stats.uploads).toBe(uploads+1);expect(system.stats.cancelled).toBe(0);
    const original=cards(system),ready=versions(system);system.update(17000,adjacent,DEFAULT_VISUAL_SETTINGS,false);expect(versions(system)).toEqual(ready);
    settle(system,adjacent,17000);const shifted=cards(system);let overlap=0;
    for(const [key,value]of original)if(shifted.has(key)){expect(shifted.get(key)).toBe(value);overlap++;}
    expect(overlap).toBeGreaterThan(1000);expect(system.stats.uploads).toBe(uploads+2);
    expect(system.stats.cacheChunks).toBeLessThanOrEqual(256);
  }finally{system.dispose();}
});

test("actual valley off-camp grass does not saturate any instance kind capacity",()=>{
  const save=createValleySave(new Date(2026,10,2,12).getTime()),w=createValleyWorld(save.valley,save.chapter),system=new FoliageSystem(new Scene());
  try{
    system.setWorld(w);settle(system,new Vector3(36,0,168));
    expect(system.stats.plants).toBeGreaterThan(1000);
    for(const [kind,mesh]of system.meshes.entries())expect(mesh.count,FOLIAGE_KINDS[kind]).toBeLessThan(mesh.instanceMatrix.count);
  }finally{system.dispose();}
});
