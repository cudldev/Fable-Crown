import {describe,expect,it} from "vitest";
import type {WorldDefinition,WorldObject} from "../src/rpg/types";
import {objectTransformKey,staticSceneKey} from "../src/render/three/static-scene";
import {createValleySave} from "../src/valley/save";
import {createValleyWorld,type ValleyWorldObject} from "../src/valley/world";
import {COTTAGE_TICKS} from "../src/valley/contracts";

const NOW=new Date(2026,10,2,12).getTime();
function prop():ValleyWorldObject{return {id:"prop",name:"Prop",kind:"building",art:"valley-cottage",position:{worldId:"test",plane:0,x:12,y:13},width:4,height:3,blocks:false,rotation:0,groundPadHeight:.5,cutaway:true,entrance:{x:14,z:15}};}
function world(objects:WorldObject[]=[prop()]):WorldDefinition{return {id:"test",name:"Test",width:32,height:32,chunkSize:16,objects,terrain:Array(1024).fill("grass"),collision:Array(1024).fill(0),spawns:[],portals:[]};}
const visitor=(id="builder"):WorldObject=>({...prop(),id:`valley-visitor-${id}`,kind:"quest",name:"Neighbour",art:`valley-visitor-${id}`,width:1,height:1});

describe("static scene invalidation",()=>{
  it("retains the actual valley scene through moving/renamed/added/removed visitors",()=>{
    const save=createValleySave(NOW),first=createValleyWorld(save.valley,save.chapter),key=staticSceneKey(first,"{}");
    save.valley.visitorPositions={builder:{x:55.25,z:144.75}};
    save.valley.introduced.push("merchant","smith");
    const moved=createValleyWorld(save.valley,save.chapter);
    expect(moved).not.toBe(first);expect(staticSceneKey(moved,"{}")).toBe(key);
    expect(staticSceneKey({...moved,objects:moved.objects.map(object=>object.id.startsWith("valley-visitor-")?{...object,name:"A changed greeting",art:"other-visitor-art",width:2}:object)},"{}")).toBe(key);
    expect(staticSceneKey({...moved,objects:moved.objects.filter(object=>!object.id.startsWith("valley-visitor-"))},"{}")).toBe(key);
  });

  it("is independent of object order and property insertion order without mutating snapshots",()=>{
    const a=prop(),b={...prop(),id:"second",position:{...prop().position,x:20}},w=world([a,b,visitor()]),before=JSON.stringify(w);
    const reordered=Object.fromEntries(Object.entries(a).reverse())as unknown as ValleyWorldObject;
    reordered.position={plane:a.position.plane,y:a.position.y,x:a.position.x,worldId:a.position.worldId};
    expect(staticSceneKey({...w,objects:[visitor("merchant"),b,reordered]})).toBe(staticSceneKey(w));
    expect(JSON.stringify(w)).toBe(before);
  });

  it.each([
    ["id",(o:ValleyWorldObject)=>{o.id="new-prop";}],
    ["kind",(o:ValleyWorldObject)=>{o.kind="decor";}],
    ["art",(o:ValleyWorldObject)=>{o.art="valley-forge";}],
    ["position",(o:ValleyWorldObject)=>{o.position.x++;}],
    ["width",(o:ValleyWorldObject)=>{o.width++;}],
    ["height",(o:ValleyWorldObject)=>{o.height++;}],
    ["rotation",(o:ValleyWorldObject)=>{o.rotation=1;}],
    ["support height",(o:ValleyWorldObject)=>{o.groundPadHeight=1;}],
    ["orientation",(o:ValleyWorldObject)=>{o.orientation="y";}],
    ["cutaway",(o:ValleyWorldObject)=>{o.cutaway=false;}],
    ["resource model",(o:ValleyWorldObject)=>{o.resourceId="tin";}],
    ["quest appearance",(o:ValleyWorldObject)=>{o.questId="forge";}],
    ["service appearance",(o:ValleyWorldObject)=>{o.serviceId="valley-visitor-smith";}],
  ]as const)("invalidates changed render metadata: %s",(_label,change)=>{
    const w=world(),key=staticSceneKey(w);change(w.objects[0]as ValleyWorldObject);expect(staticSceneKey(w)).not.toBe(key);
  });

  it("invalidates real home, cottage and furniture changes",()=>{
    const save=createValleySave(NOW),key=()=>staticSceneKey(createValleyWorld(save.valley,save.chapter));
    const empty=key();save.valley.home={x:54,z:155,rotation:0,tentPacked:false};const tent=key();expect(tent).not.toBe(empty);
    save.valley.paid=100;save.valley.cottageTicks=COTTAGE_TICKS;const cottage=key();expect(cottage).not.toBe(tent);
    save.valley.furniture.push({id:"stool1",itemId:"stool",x:58,z:168,rotation:0});const furnished=key();expect(furnished).not.toBe(cottage);
    save.valley.furniture[0].rotation=1;expect(key()).not.toBe(furnished);
    save.valley.furniture=[];expect(key()).toBe(cottage);
  });

  it("invalidates world identity/dimensions and explicit path/terrain support revisions",()=>{
    const w=world(),key=staticSceneKey(w,"{}");
    for(const changed of [{...w,id:"different"},{...w,width:33},{...w,height:33}])expect(staticSceneKey(changed,"{}")).not.toBe(key);
    expect(staticSceneKey(w,'{"12,13":{"level":0,"path":true}}')).not.toBe(key);
    expect(staticSceneKey(w,1)).not.toBe(staticSceneKey(w,"1"));
    const changed={...w,terrain:w.terrain.map(()=>"dirt"as const),collision:w.collision.map(()=>1)};
    expect(staticSceneKey(changed,"{}")).toBe(key); // Separate terrain pipeline owns these arrays.
  });

  it("keeps fixed quests static and includes object additions/removals",()=>{
    const w=world(),key=staticSceneKey(w),fixed={...visitor(),id:"fixed-quest"};
    expect(staticSceneKey({...w,objects:[...w.objects,fixed]})).not.toBe(key);
    expect(staticSceneKey({...w,objects:[]})).not.toBe(key);
    expect(staticSceneKey({...w,objects:[{...visitor(),kind:"building"}]})).not.toBe(staticSceneKey(world([])));
  });
});

describe("object transform invalidation",()=>{
  it("ignores narrative/identity fields while detecting all placement components",()=>{
    const object=prop(),key=objectTransformKey(object);
    expect(objectTransformKey({...object,id:"another",name:"Renamed",description:"A new line",art:"different"})).toBe(key);
    for(const changed of [{...object,position:{...object.position,x:13}},{...object,position:{...object.position,y:14}},
      {...object,position:{...object.position,plane:1}},{...object,position:{...object.position,worldId:"other"}},
      {...object,width:5},{...object,height:4},{...object,rotation:1},{...object,groundPadHeight:1}])expect(objectTransformKey(changed)).not.toBe(key);
    expect(objectTransformKey({...object,rotation:undefined})).toBe(objectTransformKey({...object,rotation:0}));
    expect(objectTransformKey({...object,groundPadHeight:undefined})).not.toBe(objectTransformKey({...object,groundPadHeight:0}));
  });
});
