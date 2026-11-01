import type {ActionWorld} from "../action/contracts";
import {ITEMS,RESOURCES} from "../rpg/content";
import {itemCount} from "../rpg/inventory";
import {levelForXp} from "../rpg/skills";
import type {ActorState,WorldDefinition,WorldObject} from "../rpg/types";
import {WORLD,canStep,objectById,tile} from "../rpg/world";
import type {ValleySave} from "./contracts";
import {planPointerRoute,type Point} from "./pointer-navigation";

export interface ValleyVisitorPose {id:string;x:number;z:number;fromX:number;fromZ:number;activity:string;working:boolean;moving:boolean}
type VisitorId="builder"|"merchant"|"smith";
type Phase="choose"|"walk"|"work"|"rest";
interface Routine {anchor:Point;cycle:number;dwell:number;phase:Phase;route:Point[];targetId?:string;activity:string;working:boolean;seed:number;radius:number;arrival:"work"|"rest"}
const VISITOR_STARTS:Record<VisitorId,Point>={builder:{x:51,z:141},merchant:{x:75,z:142},smith:{x:76,z:178}};
// Tile-centred forge cells70..73/178..180, plus the same0.2m body clearance as actors.
const reservedForge=(point:Point)=>point.x>69.3&&point.x<73.7&&point.z>177.3&&point.z<180.7;
const forgeDepth=(point:Point)=>Math.max(0,Math.min(point.x-69.3,73.7-point.x,point.z-177.3,180.7-point.z));
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const hash=(id:string)=>{let value=2166136261;for(const char of id)value=Math.imul(value^char.charCodeAt(0),16777619);return value>>>0;};
const targetPoint=(object:WorldObject):Point=>({x:object.position.x+(object.width-1)/2,z:object.position.y+(object.height-1)/2});
const workLabel=(role:string)=>role==="woodcutter"?"Working: woodcutting":role==="miner"?"Working: mining":role==="fisher"?"Working: fishing":role==="smith"?"Working: smithing":role==="builder"?"Working: carpentry":"Working: arranging supplies";
const maintenance=(role:string)=>role==="woodcutter"?"Working: sharpening an axe":role==="miner"?"Working: sorting stones":role==="fisher"?"Working: mending a fishing net":role==="smith"?"Working: checking smithing tools":role==="builder"?"Working: checking building plans":"Working: checking supplies";

/** Ambient life only. The worker calls step once per ordinary LIVE settlement tick, never offline. */
export class ValleyNpcRoutines {
  private states=new Map<string,Routine>();
  private poses=new Map<string,ValleyVisitorPose>();
  get visitorPoses():readonly Readonly<ValleyVisitorPose>[] {return Object.freeze([...this.poses.values()].map(pose=>Object.freeze({...pose})));}
  reset():void {this.states.clear();this.poses.clear();}

  private state(id:string,position:Point,visitor?:VisitorId):Routine {
    let state=this.states.get(id);
    if(!state){const seed=hash(id);state={anchor:{...position},cycle:0,dwell:visitor==="builder"?14:2+seed%9,phase:"rest",route:[],activity:visitor==="builder"?"Welcoming the new valley keeper":"Taking a quiet moment",working:false,seed,radius:visitor==="builder"?24:12,arrival:"rest"};this.states.set(id,state);}
    return state;
  }
  /** Clear interpolation traces immediately so a conversation cannot slide away from its target. */
  hold(save:ValleySave,id:string):void {
    const actor=id.startsWith("actor-")?save.chapter.npcs.find(value=>`actor-${value.id}`===id):undefined;
    if(actor){const state=this.state(id,{x:actor.position.x,z:actor.position.y});state.route=[];state.dwell=0;state.phase="choose";state.working=false;
      actor.previousPosition={...actor.position};actor.movement=null;actor.path=[];actor.action=null;actor.activity="Talking with Alden";return;}
    const visitor=id.startsWith("valley-visitor-")?id.slice("valley-visitor-".length)as VisitorId:undefined;
    if(!visitor||!Object.hasOwn(VISITOR_STARTS,visitor))return;
    const point=save.valley.visitorPositions?.[visitor]??this.poses.get(id)??VISITOR_STARTS[visitor];
    const state=this.state(id,point,visitor);state.route=[];state.dwell=0;state.phase="choose";state.working=false;
    this.poses.set(id,{id,x:point.x,z:point.z,fromX:point.x,fromZ:point.z,activity:"Talking with Alden",working:false,moving:false});
  }

  private segment(env:ActionWorld,from:Point,to:Point):boolean {
    const count=Math.max(1,Math.ceil(distance(from,to)/.12));let prior=from;
    for(let i=1;i<=count;i++){
      const point={x:from.x+(to.x-from.x)*i/count,z:from.z+(to.z-from.z)*i/count};
      if(!env.canOccupy(point.x,point.z,prior.x,prior.z))return false;
      if(Math.round(point.x)!==Math.round(prior.x)&&Math.round(point.z)!==Math.round(prior.z)&&
        (!env.canOccupy(point.x,prior.z,prior.x,prior.z)||!env.canOccupy(prior.x,point.z,prior.x,prior.z)))return false;
      prior=point;
    }
    return true;
  }
  private localEnvironment(state:Routine,env:ActionWorld,visitor:boolean):ActionWorld {
    return {...env,canOccupy:(x,z,fromX,fromZ)=>distance(state.anchor,{x,z})<=state.radius&&(!visitor||(x>=8&&x<=87&&z>=136&&z<=183&&
      (!reservedForge({x,z})||reservedForge({x:fromX,z:fromZ})&&forgeDepth({x,z})<=forgeDepth({x:fromX,z:fromZ})+1e-9)))&&env.canOccupy(x,z,fromX,fromZ)};
  }
  private leaveForge(state:Routine,position:Point,world:WorldDefinition,env:ActionWorld):void {
    state.route=[];state.working=false;state.targetId=undefined;state.phase="choose";state.dwell=1;state.activity="Waiting for the forge site to clear";
    // A reserved but still walkable pad can be exited. Actual built collision never gets bypassed.
    if(!env.canOccupy(position.x,position.z,position.x,position.z))return;
    const local=this.localEnvironment(state,env,true),goals=[{x:69,z:Math.round(position.z)},{x:74,z:Math.round(position.z)},
      {x:Math.round(position.x),z:177},{x:Math.round(position.x),z:181}];
    goals.sort((a,b)=>distance(position,a)-distance(position,b)||a.z-b.z||a.x-b.x);
    for(const goal of goals){
      const route=planPointerRoute(position,{...goal,range:0},local,world);if(!route?.length)continue;
      state.route=route;state.phase="walk";state.arrival="rest";state.activity="Stepping clear of the forge site";return;
    }
  }
  private roleTargets(role:string,world:WorldDefinition,save:ValleySave,state:Routine,visitor:boolean):WorldObject[] {
    return world.objects.filter(object=>{
      if(distance(state.anchor,targetPoint(object))>state.radius+2)return false;
      if(role==="builder")return /valley-home-(tent|cottage|workbench)|^valley-workbench$/.test(object.id);
      if(role==="merchant")return object.id==="valley-caravan";
      if(role==="smith")return visitor?/^valley-(public-(forge|anvil)|forge-site)$/.test(object.id):object.kind==="furnace"||object.kind==="anvil";
      if(object.resourceId&&save.chapter.resources[object.id]?.available===false)return false;
      return role==="woodcutter"?object.kind==="tree":role==="miner"?object.kind==="rock":role==="fisher"?object.kind==="fish":false;
    }).sort((a,b)=>distance(state.anchor,targetPoint(a))-distance(state.anchor,targetPoint(b))||(a.id<b.id?-1:a.id>b.id?1:0));
  }
  private choose(state:Routine,position:Point,role:string,world:WorldDefinition,save:ValleySave,env:ActionWorld,visitor:boolean):void {
    state.targetId=undefined;state.route=[];state.working=false;
    const cycle=state.cycle++,local=this.localEnvironment(state,env,visitor);
    if(cycle%4===0||cycle%4===2){
      const targets=this.roleTargets(role,world,save,state,visitor).slice(0,4);
      // Stable per-person rotations distribute people over nearby jobs without synchronized RNG.
      for(let attempt=0;attempt<targets.length;attempt++){
        const target=targets[(attempt+state.seed+cycle)%targets.length],stands:Point[]=[];
        for(let z=target.position.y-1;z<=target.position.y+target.height;z++)for(let x=target.position.x-1;x<=target.position.x+target.width;x++){
          if(x>=target.position.x&&x<target.position.x+target.width&&z>=target.position.y&&z<target.position.y+target.height)continue;
          if((!visitor||!reservedForge({x,z}))&&local.canOccupy(x,z,x,z))stands.push({x,z});
        }
        stands.sort((a,b)=>distance(position,a)-distance(position,b)||a.z-b.z||a.x-b.x);
        for(const stand of stands.slice(0,6)){
          const route=planPointerRoute(position,{...stand,range:0},local,world);if(route===null)continue;
          state.targetId=target.id;state.route=route;state.arrival="work";state.phase=route.length?"walk":"work";
          state.activity=route.length?`Walking to ${target.name}`:workLabel(role);state.working=!route.length;state.dwell=6+(state.seed+cycle)%10;return;
        }
      }
      state.phase="work";state.activity=maintenance(role);state.working=true;state.dwell=5+(state.seed+cycle)%8;return;
    }
    if(cycle%4===1){
      const offsets=[[4,0],[3,4],[-4,2],[0,-5],[5,-3],[-3,-4],[1,6],[-6,-1]];
      for(let attempt=0;attempt<offsets.length;attempt++){
        const [dx,dz]=offsets[(state.seed+cycle+attempt)%offsets.length],goal={x:Math.round(state.anchor.x+dx),z:Math.round(state.anchor.z+dz)};
        if(visitor&&reservedForge(goal))continue;
        const route=planPointerRoute(position,{...goal,range:0},local,world);if(!route?.length)continue;
        state.route=route;state.arrival="rest";state.phase="walk";state.activity="Exploring the nearby paths";state.dwell=3+(state.seed+cycle)%6;return;
      }
    }
    state.phase="rest";state.activity="Resting and watching the valley";state.dwell=5+(state.seed+cycle)%9;
  }
  private walk(state:Routine,position:Point,env:ActionWorld,actor?:ActorState):Point {
    while(state.route.length&&distance(position,state.route[0])<.03)state.route.shift();
    const next=state.route[0];if(!next)return position;
    let point:Point;
    if(actor){
      // Original actor saves retain integer tile centres and one legal tile step per tick.
      point={x:position.x+Math.sign(next.x-position.x),z:position.z+Math.sign(next.z-position.z)};
      if(!canStep(tile(position.x,position.z),tile(point.x,point.z),WORLD)){state.route=[];state.phase="choose";state.dwell=2;return position;}
    }else {const length=distance(position,next),scale=Math.min(.8,length)/length;point={x:position.x+(next.x-position.x)*scale,z:position.z+(next.z-position.z)*scale};}
    if(!this.segment(env,position,point)){state.route=[];state.phase="choose";state.dwell=2;return position;}
    if(distance(point,next)<.03)state.route.shift();
    return point;
  }
  private workAction(actor:ActorState,target:WorldObject|undefined,remaining:number):ActorState["action"] {
    const original=target&&objectById(target.id),resource=original?.resourceId&&RESOURCES[original.resourceId];
    if(!resource||levelForXp(actor.skills[resource.skill])<resource.level||resource.bait&&!itemCount(actor.inventory,resource.bait))return null;
    const tools=[...actor.inventory.map(stack=>ITEMS[stack.itemId]),...Object.values(actor.equipment).map(id=>ITEMS[id!])]
      .filter(item=>item?.tool===resource.tool&&levelForXp(actor.skills[resource.skill])>=(item.level??1)).sort((a,b)=>(b.tier??1)-(a.tier??1));
    if(!tools.length)return null;
    const duration=resource.skill==="mining"?resource.ticks-((tools[0].tier??1)-1):resource.ticks;
    return {kind:"gather",targetId:original!.id,duration,remaining:1+Math.max(0,remaining-1)%duration};
  }

  step(save:ValleySave,world:WorldDefinition,env:ActionWorld,heldId?:string):boolean {
    let changed=false;
    for(const actor of save.chapter.npcs){
      const id=`actor-${actor.id}`,before=JSON.stringify([actor.position,actor.previousPosition,actor.movement,actor.path,actor.action,actor.activity]);
      if(id===heldId){this.hold(save,id);changed ||= before!==JSON.stringify([actor.position,actor.previousPosition,actor.movement,actor.path,actor.action,actor.activity]);continue;}
      const point={x:actor.position.x,z:actor.position.y},state=this.state(id,point);
      actor.previousPosition={...actor.position};actor.movement=null;actor.path=[];actor.action=null;
      if(state.phase!=="walk"&&state.dwell>0)state.dwell--;
      else if(state.phase!=="walk")this.choose(state,point,actor.role,world,save,env,false);
      if(state.phase==="walk"){
        const next=this.walk(state,point,this.localEnvironment(state,env,false),actor);
        if(distance(point,next)>0){actor.position=tile(next.x,next.z);if(save.chapter.tick>0)actor.movement={tick:save.chapter.tick,mode:"walk",tiles:[{...actor.previousPosition},{...actor.position}]};}
        if(!state.route.length&&state.phase==="walk"){state.phase=state.arrival;state.working=state.phase==="work";state.activity=state.working?workLabel(actor.role):"Taking a quiet moment";}
      }
      actor.activity=state.activity;
      if(state.phase==="work")actor.action=this.workAction(actor,world.objects.find(object=>object.id===state.targetId),state.dwell);
      changed ||= before!==JSON.stringify([actor.position,actor.previousPosition,actor.movement,actor.path,actor.action,actor.activity]);
    }
    const active=new Set<string>();
    for(const object of world.objects){
      if(!object.id.startsWith("valley-visitor-"))continue;
      const visitor=object.id.slice("valley-visitor-".length)as VisitorId;if(!Object.hasOwn(VISITOR_STARTS,visitor))continue;
      active.add(object.id);const previousPose=this.poses.get(object.id),position=save.valley.visitorPositions?.[visitor]??{x:object.position.x,z:object.position.y};
      if(object.id===heldId){this.hold(save,object.id);changed ||= previousPose?.activity!=="Talking with Alden";continue;}
      const state=this.state(object.id,position,visitor);let next=position;
      if(reservedForge(position))this.leaveForge(state,position,world,env);
      else if(state.phase!=="walk"&&state.dwell>0)state.dwell--;
      else if(state.phase!=="walk")this.choose(state,position,visitor,world,save,env,true);
      if(state.phase==="walk"){
        next=this.walk(state,position,this.localEnvironment(state,env,true));
        if(!state.route.length&&state.phase==="walk"){state.phase=state.arrival;state.working=state.phase==="work";state.activity=state.working?workLabel(visitor):"Taking a quiet moment";}
      }
      (save.valley.visitorPositions??={})[visitor]={...next};
      const pose={id:object.id,x:next.x,z:next.z,fromX:position.x,fromZ:position.z,activity:state.activity,working:state.working,moving:distance(position,next)>.001};
      this.poses.set(object.id,pose);changed ||= !previousPose||JSON.stringify(previousPose)!==JSON.stringify(pose);
    }
    for(const id of this.poses.keys())if(!active.has(id))this.poses.delete(id);
    return changed;
  }
}
