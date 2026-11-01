import {describe,expect,it} from "vitest";
import type {ActionWorld} from "../src/action/contracts";
import {createActionState,idleActionInput,stepAction} from "../src/action/simulation";
import {followPointerRoute,planPointerRoute,type Point} from "../src/valley/pointer-navigation";

const BOUNDS={width:8,height:8};
function world(canOccupy:ActionWorld["canOccupy"]=()=>true):ActionWorld {
  return {canOccupy,groundHeight:()=>0,isSafe:()=>true,targets:[]};
}
function cellWorld(blocked:readonly string[],size=BOUNDS):ActionWorld {
  return world((x,z)=>x>=0&&z>=0&&x<size.width&&z<size.height&&!blocked.includes(`${Math.round(x)},${Math.round(z)}`));
}
function assertRoute(start:Point,route:Point[],surface:ActionWorld):void {
  let previous=start;
  for(const point of route){
    const samples=Math.max(1,Math.ceil(Math.hypot(point.x-previous.x,point.z-previous.z)/.05)),from={...previous};
    for(let i=1;i<=samples;i++){
      const next={x:from.x+(point.x-from.x)*i/samples,z:from.z+(point.z-from.z)*i/samples};
      expect(surface.canOccupy(next.x,next.z,previous.x,previous.z)).toBe(true);previous=next;
    }
  }
}

describe("continuous pointer route planning",()=>{
  it("keeps an unobstructed fractional start and exact fractional destination",()=>{
    const start=Object.freeze({x:1.23,z:1.67}),goal=Object.freeze({x:6.12,z:5.85,range:0}),surface=Object.freeze(world());
    expect(planPointerRoute(start,goal,surface,BOUNDS)).toEqual([{x:goal.x,z:goal.z}]);
    expect(start).toEqual({x:1.23,z:1.67});expect(goal).toEqual({x:6.12,z:5.85,range:0});
  });

  it("routes around a wall with actual occupancy checks instead of cutting through it",()=>{
    const start={x:1,z:1},goal={x:6,z:1,range:0};
    const surface=cellWorld(["3,0","3,1","3,2","3,3","3,4"]),route=planPointerRoute(start,goal,surface,BOUNDS);
    expect(route).not.toBeNull();expect(route!.some(point=>point.z>=5)).toBe(true);expect(route!.at(-1)).toEqual({x:6,z:1});
    assertRoute(start,route!,surface);
  });

  it("rejects blocked exact destinations and wholly unreachable areas",()=>{
    const start={x:1,z:1},goal={x:6,z:1,range:0};
    expect(planPointerRoute(start,goal,cellWorld(["6,1"]),BOUNDS)).toBeNull();
    const wall=Array.from({length:8},(_,z)=>`3,${z}`);
    expect(planPointerRoute(start,goal,cellWorld(wall),BOUNDS)).toBeNull();
  });

  it("approaches an occupied target within interaction range without entering its footprint",()=>{
    const start={x:1,z:3},goal={x:6,z:3,range:2},surface=cellWorld(["6,3"]),route=planPointerRoute(start,goal,surface,BOUNDS);
    expect(route).not.toBeNull();assertRoute(start,route!,surface);
    const last=route!.at(-1)!;expect(Math.hypot(last.x-goal.x,last.z-goal.z)).toBeLessThan(goal.range);
    expect(last.x).toBeCloseTo(4.04);expect(last.z).toBe(3);
    expect(planPointerRoute({x:4.1,z:3},goal,surface,BOUNDS)).toEqual([]);
  });

  it("finds a different approach when the nearest interaction boundary is blocked",()=>{
    const start={x:1,z:3},goal={x:6,z:3,range:1.5};
    const surface=cellWorld(["4,2","4,3","4,4","5,2","5,3","5,4","6,3"]),route=planPointerRoute(start,goal,surface,BOUNDS);
    expect(route).not.toBeNull();assertRoute(start,route!,surface);
    const last=route!.at(-1)!;expect(Math.hypot(last.x-goal.x,last.z-goal.z)).toBeLessThanOrEqual(goal.range);
  });

  it("does not clip diagonally between touching blocked corners, including from a fractional start",()=>{
    const surface=cellWorld(["1,0","0,1"],{width:3,height:3});
    for(const start of [{x:0,z:0},{x:.49,z:.49}])expect(planPointerRoute(start,{x:2,z:2,range:0},surface,{width:3,height:3})).toBeNull();
  });

  it("takes a valid wide detour instead of shaving a single blocked corner",()=>{
    const surface=cellWorld(["2,1"]),start={x:1,z:1},route=planPointerRoute(start,{x:3,z:2,range:0},surface,BOUNDS);
    expect(route).not.toBeNull();assertRoute(start,route!,surface);
    expect(route!.length).toBeGreaterThan(1);
  });

  it("samples actual continuous radius so a narrow apparent gap is not traversable",()=>{
    const obstacle=(x:number,z:number)=>x>=3&&x<=4&&(z<2.45||z>2.55);
    const surface=world((x,z)=>x>=0&&z>=0&&x<8&&z<8&&[[-.2,-.2],[.2,-.2],[-.2,.2],[.2,.2]].every(([dx,dz])=>!obstacle(x+dx,z+dz)));
    expect(planPointerRoute({x:1,z:2.5},{x:6,z:2.5,range:0},surface,BOUNDS)).toBeNull();
  });

  it("routes across a terrace only through the actual continuously traversable stair strip",()=>{
    const height=(x:number,z:number)=>Math.abs(z-3)<=.4?Math.max(0,Math.min(.5,(x-2.5)*.5)):x>=3?.5:0;
    const surface=world((x,z,fromX,fromZ)=>x>=0&&z>=0&&x<8&&z<8&&Math.abs(height(x,z)-height(fromX,fromZ))<=.081);
    const start={x:1,z:1},route=planPointerRoute(start,{x:6,z:1,range:0},surface,BOUNDS);
    expect(route).not.toBeNull();expect(route!.some(point=>Math.abs(point.z-3)<=.4)).toBe(true);assertRoute(start,route!,surface);
    const cliff=world((x,z,fromX)=>x>=0&&z>=0&&x<8&&z<8&&(x>=3)===(fromX>=3));
    expect(planPointerRoute(start,{x:6,z:1,range:0},cliff,BOUNDS)).toBeNull();
  });

  it("never requests an occupancy segment longer than 0.12m",()=>{
    let maximum=0;
    const surface=world((x,z,fromX,fromZ)=>{maximum=Math.max(maximum,Math.hypot(x-fromX,z-fromZ));return Math.abs(x-3)>.3||z>5;});
    const route=planPointerRoute({x:1.2,z:1.8},{x:6.2,z:1.2,range:0},surface,BOUNDS);
    expect(route).not.toBeNull();expect(maximum).toBeLessThanOrEqual(.1200000001);
  });

  it("is deterministic across repeated equivalent obstacle searches",()=>{
    const start={x:1.4,z:3.1},goal={x:6,z:3,range:0},surface=cellWorld(["3,2","3,3","3,4"]);
    const route=planPointerRoute(start,goal,surface,BOUNDS);expect(route).not.toBeNull();
    for(let i=0;i<5;i++)expect(planPointerRoute(start,goal,surface,BOUNDS)).toEqual(route);
  });

  it("bounds a maximum-size search whose valid destination is enclosed",()=>{
    let calls=0;
    const surface=world((x,z)=>{calls++;return Math.max(Math.abs(Math.round(x)-254),Math.abs(Math.round(z)-190))!==1;});
    expect(planPointerRoute({x:1,z:1},{x:254,z:190,range:0},surface,{width:256,height:192})).toBeNull();
    expect(calls).toBeGreaterThan(49152);expect(calls).toBeLessThan(10_000_000);
  });

  it("rejects a blocked exact endpoint before searching and validates malformed input",()=>{
    const calls:{count:number}={count:0},size={width:256,height:192};
    const surface=world((x,z)=>{calls.count++;return !(x>=254.5&&z>=190.5);});
    expect(planPointerRoute({x:1,z:1},{x:255,z:191,range:0},surface,size)).toBeNull();
    expect(calls.count).toBe(2); // Blocked exact endpoint is rejected before searching.
    for(const goal of [{x:NaN,z:1,range:0},{x:1,z:1,range:-1},{x:8,z:1,range:0}])expect(planPointerRoute({x:1,z:1},goal,world(),BOUNDS)).toBeNull();
    expect(planPointerRoute({x:-1,z:1},{x:1,z:1,range:0},world(),BOUNDS)).toBeNull();
    expect(planPointerRoute({x:1,z:1},{x:2,z:2,range:0},world(),{width:257,height:192})).toBeNull();
    expect(planPointerRoute({x:1,z:1},{x:2,z:2,range:0},world(),{width:8.5,height:8})).toBeNull();
  });
});

describe("terrain-weighted pointer navigation",()=>{
  const bounds={width:10,height:7},start={x:1,z:3},goal={x:8,z:3,range:0};
  const roadWorld=(cost=.6):ActionWorld=>({...world(),travelCost:(_x,z)=>Math.round(z)===2?cost:1});

  it("prefers a slightly longer road to an unobstructed straight grass shortcut",()=>{
    const route=planPointerRoute(start,goal,roadWorld(),bounds);
    expect(route).not.toBeNull();expect(route!.some(point=>point.z===2)).toBe(true);
    expect(route!.at(-1)).toEqual({x:8,z:3});assertRoute(start,route!,roadWorld());
    expect(planPointerRoute(start,goal,world(),bounds)).toEqual([{x:8,z:3}]);
  });

  it("keeps a short grass route when the available road takes a very long detour",()=>{
    const surface={...world(),travelCost:(x:number,z:number)=>Math.round(x)===1||Math.round(x)===8||Math.round(z)===0?.6:1};
    const from={x:1,z:4},to={x:8,z:4,range:0},route=planPointerRoute(from,to,surface,bounds);
    expect(route).not.toBeNull();expect(route!.every(point=>point.z>=3)).toBe(true);
    let length=0,previous=from;for(const point of route!){length+=Math.hypot(point.x-previous.x,point.z-previous.z);previous=point;}
    expect(length).toBeLessThan(8);expect(route!.at(-1)).toEqual({x:8,z:4});
  });

  it("never treats a blocked road as traversable just because it is cheaper",()=>{
    const surface={...cellWorld(Array.from({length:10},(_,x)=>`${x},2`),bounds),travelCost:(_x:number,z:number)=>Math.round(z)===2?.5:1};
    const route=planPointerRoute(start,goal,surface,bounds);expect(route).not.toBeNull();assertRoute(start,route!,surface);
    expect(route!.every(point=>Math.round(point.z)!==2)).toBe(true);
  });

  it("uses weighted fractional start and endpoint connections deterministically",()=>{
    const from=Object.freeze({x:1.2,z:3.1}),to=Object.freeze({x:8.3,z:3.2,range:0}),surface=roadWorld();
    const route=planPointerRoute(from,to,surface,bounds);expect(route).not.toBeNull();assertRoute(from,route!,surface);
    expect(route!.some(point=>point.z===2)).toBe(true);expect(route!.at(-1)).toEqual({x:to.x,z:to.z});
    for(let repeat=0;repeat<5;repeat++)expect(planPointerRoute(from,to,surface,bounds)).toEqual(route);
  });

  it("normalizes travel costs to finite0.5–4 while invalid values default to1",()=>{
    for(const [provided,normalized]of [[-20,.5],[0,.5],[99,4],[Infinity,1],[NaN,1]]){
      const supplied={...world(),travelCost:()=>provided},expected={...world(),travelCost:()=>normalized};
      expect(planPointerRoute(start,goal,supplied,bounds)).toEqual(planPointerRoute(start,goal,expected,bounds));
    }
  });

  it("can prefer grass around a lengthy rough stretch without changing physical speed",()=>{
    const size={width:20,height:7},from={x:1,z:3},to={x:18,z:3,range:0};
    const surface={...world(),travelCost:(_x:number,z:number)=>Math.round(z)===3?1.15:1},route=planPointerRoute(from,to,surface,size);
    expect(route).not.toBeNull();expect(route!.some(point=>point.z!==3)).toBe(true);
    const follow=followPointerRoute(from,route!);expect(Math.hypot(follow.moveX,follow.moveZ)).toBeCloseTo(1);
  });

  it("keeps continuous staircase and diagonal corner restrictions with road costs enabled",()=>{
    const height=(x:number,z:number)=>Math.abs(z-3)<=.4?Math.max(0,Math.min(.5,(x-2.5)*.5)):x>=3?.5:0;
    const surface={...world((x,z,fromX,fromZ)=>x>=0&&z>=0&&x<8&&z<8&&Math.abs(height(x,z)-height(fromX,fromZ))<=.081),travelCost:(_x:number,z:number)=>Math.round(z)===3?.6:1};
    const from={x:1,z:1},route=planPointerRoute(from,{x:6,z:1,range:0},surface,BOUNDS);
    expect(route).not.toBeNull();expect(route!.some(point=>Math.abs(point.z-3)<=.4)).toBe(true);assertRoute(from,route!,surface);
    const corners={...cellWorld(["1,0","0,1"],{width:3,height:3}),travelCost:()=>.6};
    expect(planPointerRoute({x:.49,z:.49},{x:2,z:2,range:0},corners,{width:3,height:3})).toBeNull();
  });
});

describe("fixed-step pointer route following",()=>{
  it("prunes reached points without changing the caller's route",()=>{
    const route=Object.freeze([Object.freeze({x:1,z:1}),Object.freeze({x:1.02,z:1}),Object.freeze({x:2,z:1})]);
    const answer=followPointerRoute({x:1,z:1},route);
    expect(answer).toEqual({moveX:1,moveZ:0,remaining:[{x:2,z:1}]});
    answer.remaining[0].x=999;expect(route[2].x).toBe(2);expect(route).toHaveLength(3);
  });

  it("normalizes full-speed diagonal movement and scales the final step to avoid overshoot",()=>{
    const full=followPointerRoute({x:0,z:0},[{x:2,z:2}]);expect(Math.hypot(full.moveX,full.moveZ)).toBeCloseTo(1);
    const final=followPointerRoute({x:0,z:0},[{x:.04,z:.01}]);
    expect(final.moveX*.05).toBeCloseTo(.04);expect(final.moveZ*.05).toBeCloseTo(.01);
    expect(Math.hypot(final.moveX,final.moveZ)).toBeLessThan(1);
  });

  it("stops within 0.03m and handles an empty or invalid route",()=>{
    expect(followPointerRoute({x:1,z:1},[{x:1.02,z:1}])).toEqual({moveX:0,moveZ:0,remaining:[]});
    expect(followPointerRoute({x:1,z:1},[])).toEqual({moveX:0,moveZ:0,remaining:[]});
    expect(followPointerRoute({x:NaN,z:1},[{x:2,z:1}])).toEqual({moveX:0,moveZ:0,remaining:[]});
    expect(followPointerRoute({x:1,z:1},[{x:Infinity,z:1}])).toEqual({moveX:0,moveZ:0,remaining:[]});
  });

  it("follows a full planned detour through authoritative 60Hz movement and finishes inside actual interaction range",()=>{
    const surface=cellWorld(["3,0","3,1","3,2","3,3","3,4","6,1"]),start={x:1.2,z:1.1},goal={x:6,z:1,range:1.5};
    let route=planPointerRoute(start,goal,surface,BOUNDS)!;expect(route).not.toBeNull();
    const action=createActionState(start.x,start.z);
    for(let i=0;i<2000&&route.length;i++){
      const follow=followPointerRoute(action.player,route);route=follow.remaining;
      stepAction(action,{...idleActionInput(),moveX:follow.moveX,moveZ:follow.moveZ},surface);
    }
    expect(route).toEqual([]);expect(Math.hypot(action.player.x-goal.x,action.player.z-goal.z)).toBeLessThan(goal.range);
  });
});
