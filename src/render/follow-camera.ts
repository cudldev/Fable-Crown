/** Presentation-only follow: the actor is always the anchor, with a small movement lead. */
export interface FollowPoint {x:number;z:number}
export interface FollowCameraPose extends FollowPoint {leadX:number;leadZ:number}
export const FOLLOW_CAMERA_MAX_LEAD=1.1;
const finite=(n:number)=>Number.isFinite(n)?n:0;

export class FollowCamera {
  private previous?:FollowPoint & {time:number};
  private leadX=0;
  private leadZ=0;

  reset(){this.previous=undefined;this.leadX=0;this.leadZ=0;}

  update(point:FollowPoint,time:number,reducedMotion=false):FollowCameraPose {
    const x=finite(point.x),z=finite(point.z),now=finite(time),old=this.previous;
    const dt=old?(now-old.time)/1000:0,dx=old?x-old.x:0,dz=old?z-old.z:0;
    // Import, defeat/home return, tab suspension and clock changes must never
    // turn a discontinuity into a sweeping camera or a false movement lead.
    if(!old||dt<0||dt>.25||Math.hypot(dx,dz)>Math.max(4,dt*12)||reducedMotion){
      this.leadX=0;this.leadZ=0;
    }else if(dt>0){
      const distance=Math.hypot(dx,dz),speed=distance/dt;
      const length=Math.min(FOLLOW_CAMERA_MAX_LEAD,speed*.32);
      const desiredX=distance>.000001?dx/distance*length:0;
      const desiredZ=distance>.000001?dz/distance*length:0;
      const blend=1-Math.exp(-dt/.22);
      this.leadX+=(desiredX-this.leadX)*blend;
      this.leadZ+=(desiredZ-this.leadZ)*blend;
      if(Math.hypot(this.leadX,this.leadZ)<.00001){this.leadX=0;this.leadZ=0;}
    }
    this.previous={x,z,time:now};
    return{x:x+this.leadX,z:z+this.leadZ,leadX:this.leadX,leadZ:this.leadZ};
  }
}
