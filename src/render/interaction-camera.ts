/** Presentation-only camera contracts. Nothing here changes actors, saves or simulation clocks. */
export interface InteractionCameraFocus {
  player:{x:number;z:number};
  target:{x:number;z:number};
  /** World-object envelope around target. NPCs keep the default actor silhouette. */
  targetSize?:{width:number;depth:number;height:number};
  /** Normalized, unobscured viewport rectangle; screen Y increases downwards. */
  safeArea:{left:number;top:number;right:number;bottom:number};
  reducedMotion?:boolean;
}
export interface InteractionCameraPose {
  /** Actual look-at point, including the normal renderer's 0.4m vertical aim offset. */
  x:number;y:number;z:number;
  span:number;pitch:number;directionX:number;directionZ:number;
}
export const INTERACTION_CAMERA_DURATION=600;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const finite=(n:number,fallback=0)=>Number.isFinite(n)?n:fallback;
const DEFAULT_X=32/Math.hypot(32,45),DEFAULT_Z=45/Math.hypot(32,45);

export function interactionSafeArea(area:InteractionCameraFocus['safeArea']):InteractionCameraFocus['safeArea'] {
  const left=clamp(finite(area.left),0,.95),top=clamp(finite(area.top),0,.95);
  const right=clamp(finite(area.right,1),0,1),bottom=clamp(finite(area.bottom,1),0,1);
  return right-left<.15||bottom-top<.15?{left:0,top:0,right:1,bottom:1}:{left,top,right,bottom};
}

/** Fit the complete 1.125m pixel cast plus generous horizontal silhouettes in the free screen area. */
export function fitInteractionCamera(focus:InteractionCameraFocus,aspect:number,heightAt:(x:number,z:number)=>number=()=>0):InteractionCameraPose {
  aspect=clamp(finite(aspect,1),.2,6);
  const area=interactionSafeArea(focus.safeArea),padding=.035;
  const safe={left:area.left+padding,top:area.top+padding,right:area.right-padding,bottom:area.bottom-padding};
  const player={x:finite(focus.player.x),z:finite(focus.player.z)},target={x:finite(focus.target.x),z:finite(focus.target.z)};
  const dx=target.x-player.x,dz=target.z-player.z,length=Math.hypot(dx,dz);
  let directionX=DEFAULT_X,directionZ=DEFAULT_Z;
  if(length>.15){directionX=-dz/length;directionZ=dx/length;if(directionX*DEFAULT_X+directionZ*DEFAULT_Z<0){directionX=-directionX;directionZ=-directionZ;}}
  const pitch=30*Math.PI/180,sin=Math.sin(pitch),cos=Math.cos(pitch);
  const right={x:directionZ,z:-directionX},up={x:-directionX*sin,y:cos,z:-directionZ*sin};
  const points:{x:number;y:number;z:number}[]=[];
  for(const [index,anchor]of [player,target].entries()){
    const size=index===1?focus.targetSize:undefined,w=size?clamp(finite(size.width,1.16),.3,24)/2:.58,d=size?clamp(finite(size.depth,.7),.3,24)/2:.35,h=size?clamp(finite(size.height,1.3),.3,12):1.3;
    const floor=finite(heightAt(anchor.x,anchor.z));for(const x of[-w,w])for(const z of[-d,d])for(const y of[0,h])points.push({x:anchor.x+x,y:floor+y,z:anchor.z+z});
  }
  const origin={x:(player.x+target.x)/2,y:(finite(heightAt(player.x,player.z))+finite(heightAt(target.x,target.z)))/2+.65,z:(player.z+target.z)/2};
  const bounds=points.map(p=>({x:(p.x-origin.x)*right.x+(p.z-origin.z)*right.z,y:(p.x-origin.x)*up.x+(p.y-origin.y)*up.y+(p.z-origin.z)*up.z}));
  const minX=Math.min(...bounds.map(p=>p.x)),maxX=Math.max(...bounds.map(p=>p.x)),minY=Math.min(...bounds.map(p=>p.y)),maxY=Math.max(...bounds.map(p=>p.y));
  // Extra perspective headroom accounts for the near member of the pair and terrace depth.
  const span=Math.max(4.2,(maxX-minX)/(aspect*(safe.right-safe.left)),(maxY-minY)/(safe.bottom-safe.top))*1.16;
  const offsetX=(minX+maxX)/2-((safe.left+safe.right)/2-.5)*span*aspect;
  const offsetY=(minY+maxY)/2+((safe.top+safe.bottom)/2-.5)*span;
  return{x:origin.x+right.x*offsetX+up.x*offsetY,y:origin.y+up.y*offsetY,z:origin.z+right.z*offsetX+up.z*offsetY,span,pitch,directionX,directionZ};
}

/** Project using the same long-lens perspective or orthographic geometry as the renderer. */
export function projectInteractionPoint(p:{x:number;y:number;z:number},pose:InteractionCameraPose,aspect:number,perspective=false):{x:number;y:number} {
  const x=p.x-pose.x,y=p.y-pose.y,z=p.z-pose.z,sin=Math.sin(pose.pitch),cos=Math.cos(pose.pitch);
  const depth=(x*pose.directionX+z*pose.directionZ)*cos+y*sin;
  const distance=pose.span/(2*Math.tan(10*Math.PI/180));
  const scale=perspective?Math.max(.01,1-depth/distance):1;
  return{x:.5+(x*pose.directionZ-z*pose.directionX)/(pose.span*aspect*scale),y:.5-(-x*pose.directionX*sin+y*cos-z*pose.directionZ*sin)/(pose.span*scale)};
}

function interpolate(a:InteractionCameraPose,b:InteractionCameraPose,t:number):InteractionCameraPose {
  if(t===0)return a;if(t===1)return b;
  const mix=(x:number,y:number)=>x+(y-x)*t;
  const ax=Math.atan2(a.directionX,a.directionZ),bx=Math.atan2(b.directionX,b.directionZ),angle=ax+Math.atan2(Math.sin(bx-ax),Math.cos(bx-ax))*t;
  return{x:mix(a.x,b.x),y:mix(a.y,b.y),z:mix(a.z,b.z),span:mix(a.span,b.span),pitch:mix(a.pitch,b.pitch),directionX:Math.sin(angle),directionZ:Math.cos(angle)};
}

/** Re-target from the last drawn pose so rapid close/reopen and rotation cannot snap. */
export class InteractionCameraTransition {
  private key:string|null=null;
  private origin:InteractionCameraPose|null=null;
  private value:InteractionCameraPose|null=null;
  private started=0;
  private instant=false;
  status:'none'|'blending'|'active'='none';
  update(base:InteractionCameraPose,focus:InteractionCameraFocus|undefined,aspect:number,time:number,heightAt?:(x:number,z:number)=>number):InteractionCameraPose {
    const key=focus?JSON.stringify([focus.player,focus.target,focus.targetSize,focus.safeArea,aspect]):null;
    if(!key&&!this.key&&!this.origin){this.value=base;this.status='none';return base;}
    if(key!==this.key){this.origin=this.value??base;this.started=time;this.key=key;this.instant=focus?.reducedMotion===true||this.instant&&!focus;}
    if(focus?.reducedMotion)this.instant=true;
    const elapsed=clamp((time-this.started)/INTERACTION_CAMERA_DURATION,0,1),t=this.instant?1:elapsed*elapsed*(3-2*elapsed);
    const goal=focus?fitInteractionCamera(focus,aspect,heightAt):base;
    this.value=t===1?goal:interpolate(this.origin??base,goal,t);
    this.status=t<1?'blending':focus?'active':'none';
    if(t===1){this.origin=null;if(!focus)this.instant=false;}
    return this.value;
  }
}
