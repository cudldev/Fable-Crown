import type {ActionWorld} from "../action/contracts";

export interface Point {x:number;z:number}
export interface NavigationGoal extends Point {range:number}

const SAMPLE_DISTANCE=.12;
const ARRIVAL_DISTANCE=.03;
const STEP_DISTANCE=3/60;
const APPROACH_MARGIN=.04;
const NEIGHBORS=Object.freeze([[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]as const);
const finite=(point:Point)=>Number.isFinite(point.x)&&Number.isFinite(point.z);
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);

interface SearchNode {id:number;cost:number;estimate:number;remaining:number}
/** Local stable heap: no wall clock, random order or mutation outside this search. */
class Frontier {
  private values:SearchNode[]=[];
  private before(a:SearchNode,b:SearchNode):boolean {
    return a.estimate<b.estimate||(a.estimate===b.estimate&&(a.remaining<b.remaining||(a.remaining===b.remaining&&a.id<b.id)));
  }
  push(value:SearchNode):void {
    const heap=this.values;heap.push(value);let index=heap.length-1;
    while(index>0){const parent=(index-1)>>1;if(!this.before(value,heap[parent]))break;heap[index]=heap[parent];index=parent;}heap[index]=value;
  }
  pop():SearchNode|undefined {
    const heap=this.values,first=heap[0],last=heap.pop();if(!heap.length)return first;
    let index=0;
    while(true){let child=index*2+1;if(child>=heap.length)break;if(child+1<heap.length&&this.before(heap[child+1],heap[child]))child++;
      if(!this.before(heap[child],last!))break;heap[index]=heap[child];index=child;}
    heap[index]=last!;return first;
  }
}

/** Plans presentation-requested travel using the same continuous occupancy contract as movement. */
export function planPointerRoute(start:Point,goal:NavigationGoal,world:ActionWorld,bounds:{width:number;height:number}):Point[]|null {
  const {width,height}=bounds;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>256||height>192||!finite(start)||!finite(goal)||!Number.isFinite(goal.range)||goal.range<0)return null;
  const inside=(point:Point)=>finite(point)&&point.x>=0&&point.z>=0&&point.x<width&&point.z<height;
  if(!inside(start)||!inside(goal)||!world.canOccupy(start.x,start.z,start.x,start.z))return null;
  if(distance(start,goal)<=goal.range)return [];
  if(goal.range===0&&!world.canOccupy(goal.x,goal.z,goal.x,goal.z))return null;
  const weighted=typeof world.travelCost==="function";
  const costAt=(x:number,z:number):number=>{const cost=world.travelCost!(x,z);return Number.isFinite(cost)?Math.min(4,Math.max(.5,cost)):1;};
  const travelCost=(from:Point,to:Point):number=>{
    const length=distance(from,to);if(!weighted||length===0)return length;
    const count=Math.max(1,Math.ceil(length/SAMPLE_DISTANCE));let total=0;
    for(let i=0;i<count;i++){const t=(i+.5)/count;total+=costAt(from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t);}
    return length*total/count;
  };

  const segment=(from:Point,to:Point):boolean=>{
    if(!inside(to))return false;
    const count=Math.max(1,Math.ceil(distance(from,to)/SAMPLE_DISTANCE));let previous=from;
    for(let i=1;i<=count;i++){
      const current={x:from.x+(to.x-from.x)*i/count,z:from.z+(to.z-from.z)*i/count};
      if(!world.canOccupy(current.x,current.z,previous.x,previous.z))return false;
      // A point-sized mock or terrain edge must not allow a diagonal through two touching walls.
      if(Math.round(current.x)!==Math.round(previous.x)&&Math.round(current.z)!==Math.round(previous.z)&&
        (!world.canOccupy(current.x,previous.z,previous.x,previous.z)||!world.canOccupy(previous.x,current.z,previous.x,previous.z)))return false;
      previous=current;
    }
    return true;
  };
  const radius=Math.max(0,goal.range-APPROACH_MARGIN);
  const finish=(from:Point):Point|null=>{
    const length=distance(from,goal);
    if(length<=radius)return {...from};
    const endpoint={x:goal.x+(from.x-goal.x)*radius/length,z:goal.z+(from.z-goal.z)*radius/length};
    return segment(from,endpoint)?endpoint:null;
  };
  // A clear straight line is only a shortcut when terrain has no routing preference.
  if(!weighted){const direct=finish(start);if(direct)return [direct];}

  const size=width*height,costs=new Float64Array(size).fill(Infinity),previous=new Int32Array(size).fill(-1),closed=new Uint8Array(size);
  const frontier=new Frontier(),at=(id:number):Point=>({x:id%width,z:Math.floor(id/width)});
  const estimate=(point:Point)=>Math.max(0,distance(point,goal)-radius)*(weighted ? .5 : 1);
  const offer=(id:number,cost:number,parent:number):void=>{
    if(cost>=costs[id])return;costs[id]=cost;previous[id]=parent;
    const remaining=estimate(at(id));frontier.push({id,cost,estimate:cost+remaining,remaining});
  };
  // Connect an arbitrary continuous start without snapping it to a possibly blocked centre.
  const centreX=Math.round(start.x),centreZ=Math.round(start.z);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    const point={x:centreX+dx,z:centreZ+dz};if(!inside(point)||!segment(start,point))continue;
    offer(point.z*width+point.x,travelCost(start,point),-2);
  }
  const reconstruct=(id:number,endpoint:Point):Point[]=>{
    const route:Point[]=[];
    for(let current=id;current>=0;current=previous[current])route.push(at(current));
    route.reverse();if(route.length&&distance(route[0],start)<1e-9)route.shift();
    if(!route.length||distance(route[route.length-1],endpoint)>1e-9)route.push(endpoint);
    return route;
  };
  let best:{id:number;endpoint:Point;cost:number}|undefined;
  const bestRoute=()=>best?reconstruct(best.id,best.endpoint):null;
  // Each centre closes at most once; even a wholly sealed maximum world is bounded to 49,152 expansions.
  for(let expanded=0;expanded<size;){
    const current=frontier.pop();if(!current)return bestRoute();
    if(closed[current.id]||current.cost!==costs[current.id])continue;
    if(best&&current.estimate>=best.cost)return bestRoute();
    closed[current.id]=1;expanded++;const point=at(current.id);
    if(distance(point,goal)<=radius+Math.SQRT2){
      const endpoint=finish(point);
      if(endpoint){
        if(!weighted)return reconstruct(current.id,endpoint);
        const cost=current.cost+travelCost(point,endpoint);if(!best||cost<best.cost)best={id:current.id,endpoint,cost};
      }
    }
    for(const [dx,dz] of NEIGHBORS){
      const next={x:point.x+dx,z:point.z+dz};if(!inside(next))continue;
      const id=next.z*width+next.x;if(closed[id]||!segment(point,next))continue;
      offer(id,current.cost+(weighted?travelCost(point,next):dx&&dz?Math.SQRT2:1),current.id);
    }
  }
  return bestRoute();
}

/** One authoritative 60Hz input sample; the worker owns route cancellation and replanning. */
export function followPointerRoute(player:Point,route:readonly Point[]):{moveX:number;moveZ:number;remaining:Point[]} {
  if(!finite(player)||route.some(point=>!finite(point)))return {moveX:0,moveZ:0,remaining:[]};
  let index=0;while(index<route.length&&distance(player,route[index])<=ARRIVAL_DISTANCE)index++;
  const remaining=route.slice(index).map(point=>({...point})),next=remaining[0];
  if(!next)return {moveX:0,moveZ:0,remaining};
  const dx=next.x-player.x,dz=next.z-player.z,length=Math.hypot(dx,dz),divisor=Math.max(STEP_DISTANCE,length);
  return {moveX:dx/divisor,moveZ:dz/divisor,remaining};
}
