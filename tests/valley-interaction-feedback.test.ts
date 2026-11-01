import {describe,expect,it} from "vitest";
import type {ActionEvent} from "../src/action/contracts";
import {findActionTarget} from "../src/action/simulation";
import {applyActionEvents,rpgActionWorld} from "../src/action/rpg-adapter";
import {ITEMS} from "../src/rpg/content";
import {inventorySlots,itemCount} from "../src/rpg/inventory";
import {XP_THRESHOLDS} from "../src/rpg/skills";
import type {WorldDefinition,WorldObject} from "../src/rpg/types";
import {tile} from "../src/rpg/world";
import {createValleySave} from "../src/valley/save";
import {createValleyWorld} from "../src/valley/world";
import type {ValleySave} from "../src/valley/contracts";
import {actionResultFeedback,emptySwingFeedback,nearbyValleyInteraction,resourceRequirement,rewardChanges,rewardSnapshot,valleyActionContext} from "../src/valley/interaction-feedback";

const NOW=new Date(2026,10,1,12).getTime();
const fresh=()=>createValleySave(NOW,1234567);
function freeze(value:unknown,seen=new WeakSet<object>()):void {
  if(!value||typeof value!=="object"||seen.has(value))return;
  seen.add(value);for(const child of Object.values(value))freeze(child,seen);Object.freeze(value);
}
/** Freeze the aliased chapter.action/save.action graph, then compare every saved field. */
function readOnly<T>(save:ValleySave,query:()=>T):T {
  const before=JSON.stringify(save);freeze(save);
  const answer=query();expect(JSON.stringify(save)).toBe(before);return answer;
}
function resourceFixture(){
  const save=fresh(),base=createValleyWorld(save.valley,save.chapter);
  const tree=base.objects.find(object=>object.id==="valley-tree-0")!;
  expect(tree.resourceId).toBe("tree");
  const world:WorldDefinition={...base,objects:[tree]};
  save.chapter.player.inventory=[{itemId:"bronze-axe",quantity:1}];
  save.chapter.player.equipment={};
  Object.assign(save.action.player,{x:tree.position.x-1,z:tree.position.y,facingX:1,facingZ:0});
  return {save,tree,world};
}
function service(id:string,x:number,z:number,width=1,height=1):WorldObject {
  return {id,name:id,kind:"building",position:tile(x,z),width,height,blocks:false};
}
function onlyObjects(save:ValleySave,objects:WorldObject[]):WorldDefinition {
  return {...createValleyWorld(save.valley,save.chapter),objects};
}

describe("read-only contextual action feedback",()=>{
  it.each([
    {label:"in reach and facing",range:1.65,fx:1,fz:0,ready:true},
    {label:"outside reach",range:1.6501,fx:1,fz:0,ready:false},
    {label:"facing away",range:1,fx:-1,fz:0,ready:false},
    {label:"outside forward assistance cone",range:1,fx:.49,fz:Math.sqrt(1-.49**2),ready:false},
    {label:"inside forward assistance cone",range:1,fx:.51,fz:Math.sqrt(1-.51**2),ready:true},
  ])("matches authoritative target query when $label",({range,fx,fz,ready})=>{
    const {save,tree,world}=resourceFixture();
    Object.assign(save.action.player,{x:tree.position.x-range,facingX:fx,facingZ:fz});
    readOnly(save,()=>{
      const actual=findActionTarget(save.action,rpgActionWorld(save.chapter,world),true);
      const context=valleyActionContext(save,save.action,world,true);
      expect(!!actual).toBe(ready);expect(context.ready).toBe(!!actual);
      expect(context.strikeLabel).toBe("Chop");
      if(actual)expect(context.targetId).toBe(actual.id);
      else expect(context.strikeHint).not.toContain("Tap once");
    });
  });

  it("never presents a depleted resource as ready and explains its resting state",()=>{
    const {save,tree,world}=resourceFixture();save.chapter.resources[tree.id].available=false;
    readOnly(save,()=>{
      expect(findActionTarget(save.action,rpgActionWorld(save.chapter,world),true)).toBeUndefined();
      const context=valleyActionContext(save,save.action,world,true);
      expect(context.ready).toBe(false);expect(context.targetName).toBe(tree.name);
      expect(context.strikeHint).toMatch(/resting/i);
    });
  });

  it("gives distinct move-closer and facing hints instead of promising a contact",()=>{
    for(const far of [false,true]){
      const {save,tree,world}=resourceFixture();
      Object.assign(save.action.player,{x:tree.position.x-(far?3:1),facingX:-1,facingZ:0});
      const hint=readOnly(save,()=>valleyActionContext(save,save.action,world,true));
      expect(hint.ready).toBe(false);expect(hint.strikeHint).toMatch(far?/move closer/:/Face/);
    }
  });

  it("shares live enemy reach/facing/safety and excludes defeated foes",()=>{
    for(const scenario of ["live","behind","defeated","safe"]as const){
      const save=fresh(),enemy=save.action.enemies.find(value=>value.id==="rock-mite-0")!;
      save.action.enemies=[enemy];Object.assign(enemy,{x:94,z:158,health:5,maxHealth:8,defeated:false});
      Object.assign(save.action.player,{x:93,z:158,facingX:1,facingZ:0});
      if(scenario==="behind")save.action.player.facingX=-1;
      if(scenario==="defeated"){enemy.defeated=true;enemy.health=0;}
      if(scenario==="safe"){save.action.player.x=87;enemy.x=88;}
      const world=onlyObjects(save,[]);
      readOnly(save,()=>{
        const actual=findActionTarget(save.action,rpgActionWorld(save.chapter,world),false);
        const context=valleyActionContext(save,save.action,world,false);
        expect(context.ready).toBe(!!actual);expect(context.ready).toBe(scenario==="live");
        if(scenario==="live"){expect(context.targetId).toBe(enemy.id);expect(context.strikeHint).toContain("5/8 HP");}
        if(scenario==="safe")expect(context.strikeHint).toMatch(/valley is safe/i);
      });
    }
  });

  it("explains missing tools, accepts equipped tools, and warns only when the output needs a slot",()=>{
    const missing=resourceFixture();missing.save.chapter.player.inventory=[];
    expect(readOnly(missing.save,()=>resourceRequirement(missing.save,missing.tree))).toMatch(/Requires axe/);
    for(const slots of [27,28]){
      const {save,tree}=resourceFixture();save.chapter.player.inventory=[{itemId:"logs",quantity:slots}];
      save.chapter.player.equipment={weapon:"bronze-axe"};
      const hint=readOnly(save,()=>resourceRequirement(save,tree));
      if(slots===28)expect(hint).toMatch(/Backpack full/);else expect(hint).toBeNull();
    }
  });

  it("reports bait requirements after checking the rod and fishing level",()=>{
    const {save,tree}=resourceFixture(),fish={...tree,resourceId:"sardine" as const};
    save.chapter.player.skills.fishing=XP_THRESHOLDS[4];
    save.chapter.player.inventory=[{itemId:"fishing-rod",quantity:1}];
    expect(readOnly(save,()=>resourceRequirement(save,fish))).toContain(ITEMS.bait.name);
    const equipped=structuredClone(save);equipped.chapter.player.inventory.push({itemId:"bait",quantity:1});
    expect(readOnly(equipped,()=>resourceRequirement(equipped,fish))).toBeNull();
  });

  it("does not warn full when consuming the final bait makes room for the fish",()=>{
    const {save,tree,world}=resourceFixture(),fish={...tree,resourceId:"sardine" as const};
    save.chapter.player.skills.fishing=XP_THRESHOLDS[4];
    save.chapter.player.inventory=[{itemId:"fishing-rod",quantity:1},{itemId:"logs",quantity:26},{itemId:"bait",quantity:1}];
    save.chapter.seed=1;expect(inventorySlots(save.chapter.player.inventory)).toBe(28);
    const actual=structuredClone(save);
    expect(applyActionEvents(actual.chapter,actual.action,[{kind:"resource-hit",targetId:fish.id}],{...world,objects:[fish]})).toMatch(/^Collected/);
    expect(itemCount(actual.chapter.player.inventory,"raw-sardine")).toBe(1);
    expect(readOnly(save,()=>resourceRequirement(save,fish))).toBeNull();
  });

  it("distinguishes an empty swing from a successful material reward",()=>{
    const {save,tree,world}=resourceFixture();save.action.player.facingX=-1;
    const feedback=readOnly(save,()=>emptySwingFeedback(save,save.action,world,true));
    expect(feedback.tone).toBe("info");expect(feedback.title).toMatch(/Nothing gathered/);
    expect(feedback.detail).toContain(tree.name);expect(feedback.detail).not.toMatch(/\+\d/);
  });
});

describe("nearby interaction resolver",()=>{
  it("prioritizes a recoverable grave, then drops, over even closer services",()=>{
    for(const priority of ["grave","drop","service"]as const){
      const save=fresh();Object.assign(save.action.player,{x:74,z:140});
      save.chapter.grave={position:tile(75.9,140),items:[{itemId:"logs",quantity:1}],attempts:0,retryAt:0};
      save.chapter.drops=[{id:"supplies",position:tile(74.1,140),items:[],expiresAt:100}];
      if(priority!=="grave")save.chapter.grave.position=tile(76,140);
      if(priority==="service")save.chapter.drops[0].position=tile(76,140);
      const caravan=createValleyWorld(save.valley,save.chapter).objects.find(object=>object.id==="valley-caravan")!;
      const world=onlyObjects(save,[caravan]);
      const choice=readOnly(save,()=>nearbyValleyInteraction(save,save.action,world));
      expect(choice?.selection.kind).toBe(priority==="service"?"object":priority);
      expect(choice?.label).toBe(priority==="grave"?"Recover":priority==="drop"?"Collect":"Open");
    }
  });

  it("keeps the generic non-service building inspection centre at five metres",()=>{
    for(const extra of [0,.001]){
      const save=fresh();Object.assign(save.action.player,{x:16+extra,z:11});
      const world=onlyObjects(save,[service("large-home",10,10,3,3)]);
      const result=readOnly(save,()=>nearbyValleyInteraction(save,save.action,world));
      if(extra===0)expect(result?.selection).toEqual({kind:"object",id:"large-home"});else expect(result).toBeNull();
    }
    const save=fresh();Object.assign(save.action.player,{x:9.9,z:10});
    const world=onlyObjects(save,[service("wide-house",10,10,11,1)]);
    expect(readOnly(save,()=>nearbyValleyInteraction(save,save.action,world))).toBeNull();
  });

  it("uses actual service anchors at three metres, not the generic five-metre centre",()=>{
    for(const extra of [0,.001]){
      const save=fresh(),world=createValleyWorld(save.valley,save.chapter);
      const caravan=world.objects.find(object=>object.id==="valley-caravan")!;
      Object.assign(save.action.player,{x:77+extra,z:140});
      const isolated={...world,objects:[caravan]};
      const result=readOnly(save,()=>nearbyValleyInteraction(save,save.action,isolated));
      if(extra===0)expect(result?.selection).toEqual({kind:"object",id:caravan.id});else expect(result).toBeNull();
    }
  });

  it("ignores resources and resolves equal-distance services by stable id",()=>{
    const {save,tree}=resourceFixture();Object.assign(save.action.player,{x:50,z:150});
    const world=onlyObjects(save,[{...tree,position:tile(50,150)},service("z-service",54,150),service("a-service",46,150)]);
    expect(readOnly(save,()=>nearbyValleyInteraction(save,save.action,world))?.selection).toEqual({kind:"object",id:"a-service"});
  });
});

describe("reward evidence and result priority",()=>{
  it("reports an actual successful gather and converts tenths of XP to displayed XP",()=>{
    const {save,tree,world}=resourceFixture();save.chapter.seed=1;
    const initial=structuredClone(save);
    const before=readOnly(initial,()=>rewardSnapshot(initial.chapter,initial.valley.carpentryXp));
    const message=applyActionEvents(save.chapter,save.action,[{kind:"resource-hit",targetId:tree.id}],world);
    expect(message).toMatch(/^Collected/);
    readOnly(save,()=>{
      const rewards=rewardChanges(before,save.chapter,save.valley.carpentryXp);
      expect(rewards).toContain(`+1 ${ITEMS.logs.name}`);expect(rewards).toContain("+25 woodcutting XP");
      expect(actionResultFeedback(save,save.action,[{kind:"resource-hit",targetId:tree.id}],message,rewards)).toMatchObject({tone:"success",detail:rewards});
    });
  });

  it("includes real coin and connected-storage gains plus fractional XP",()=>{
    const save=fresh();save.chapter.bank=[];
    const before=rewardSnapshot(save.chapter,0);
    save.chapter.bank.push({itemId:"coins",quantity:40},{itemId:"valley-stool",quantity:1});
    save.chapter.player.skills.attack+=13;save.valley.carpentryXp=125;
    const result=readOnly(save,()=>rewardChanges(before,save.chapter,save.valley.carpentryXp));
    expect(result).toContain("+40 Coins");expect(result).toContain("+1 Handmade stool");
    expect(result).toContain("+1.3 attack XP");expect(result).toContain("+12.5 carpentry XP");
    const immutableBefore=structuredClone(before);
    expect(rewardChanges(before,save.chapter,save.valley.carpentryXp)).toBe(result);expect(before).toEqual(immutableBefore);
  });

  it("never invents gains when the same coins/items move between bag and bank",()=>{
    const save=fresh();save.chapter.player.inventory=[{itemId:"logs",quantity:4},{itemId:"coins",quantity:25}];
    save.chapter.bank=[{itemId:"logs",quantity:2},{itemId:"coins",quantity:10}];
    const before=rewardSnapshot(save.chapter,0);
    save.chapter.player.inventory=[{itemId:"logs",quantity:1},{itemId:"coins",quantity:5}];
    save.chapter.bank=[{itemId:"logs",quantity:5},{itemId:"coins",quantity:30}];
    expect(readOnly(save,()=>rewardChanges(before,save.chapter,0))).toBe("");
  });

  it("returns independent reward snapshots rather than aliases into saved skills",()=>{
    const save=fresh(),snapshot=readOnly(save,()=>rewardSnapshot(save.chapter,0));
    const old=save.chapter.player.skills.attack;snapshot.skills.attack+=999;snapshot.items.coins=999;
    expect(save.chapter.player.skills.attack).toBe(old);expect(itemCount(save.chapter.player.inventory,"coins")).toBe(25);
  });

  it("gives each repeated failed gather fresh retry feedback without fake rewards",()=>{
    const {save,tree,world}=resourceFixture(),events:ActionEvent[]=[{kind:"resource-hit",targetId:tree.id}];
    const before=rewardSnapshot(save.chapter,0),failures:ReturnType<typeof actionResultFeedback>[]=[];
    for(let i=0;i<2;i++){
      save.chapter.seed=1000;const message=applyActionEvents(save.chapter,save.action,events,world);
      expect(message).toMatch(/^Working/);expect(rewardChanges(before,save.chapter,0)).toBe("");
      const snapshot=structuredClone(save);
      failures.push(readOnly(snapshot,()=>actionResultFeedback(snapshot,snapshot.action,events,message,"")));
    }
    expect(failures[0]).toMatchObject({tone:"info",detail:expect.stringMatching(/No material yet.*tap again/)});
    expect(failures[0]).toEqual(failures[1]);expect(failures[0]).not.toBe(failures[1]);
    expect(itemCount(save.chapter.player.inventory,"logs")).toBe(0);
  });

  it("prioritizes defeat over simultaneous damage, victory, block, and resources",()=>{
    const save=fresh(),events:ActionEvent[]=[{kind:"resource-hit",targetId:"tree"},{kind:"enemy-defeat",targetId:"foe"},{kind:"block",targetId:"foe"},{kind:"player-hit",targetId:"foe",damage:3},{kind:"player-defeat"}];
    expect(readOnly(save,()=>actionResultFeedback(save,save.action,events,"Recover your backpack.","+1 Logs"))).toEqual({tone:"danger",title:"Returned home safely",detail:"Recover your backpack."});
  });

  it("prioritizes incoming damage and explains guard break instead of reporting a reward",()=>{
    const save=fresh();save.action.player.guardBroken=45;
    const events:ActionEvent[]=[{kind:"enemy-defeat",targetId:"foe"},{kind:"enemy-hit",targetId:"foe",damage:3},{kind:"block",targetId:"foe"},{kind:"player-hit",targetId:"foe",damage:2}];
    const feedback=readOnly(save,()=>actionResultFeedback(save,save.action,events,"","+40 Coins"));
    expect(feedback).toMatchObject({tone:"danger",title:"Hit! −2 HP",detail:expect.stringMatching(/Guard broken.*release Block/)});
    expect(feedback?.detail).not.toContain("Coins");
  });

  it("distinguishes an ordinary block from broken guard, and silence from empty feedback",()=>{
    for(const broken of [false,true]){
      const save=fresh();save.action.player.guardBroken=broken?45:0;
      const feedback=readOnly(save,()=>actionResultFeedback(save,save.action,[{kind:"block",targetId:"foe"}],"Blocked.",""));
      expect(feedback?.tone).toBe(broken?"warning":"info");expect(feedback?.title).toBe(broken?"Guard broken":"Blocked · −25 guard");
      expect(feedback?.detail).toMatch(/Release Block/);
    }
    const save=fresh();expect(readOnly(save,()=>actionResultFeedback(save,save.action,[],"",""))).toBeNull();
  });
});
