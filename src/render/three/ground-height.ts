/** Compact, serializable quarter-tile support field for indirect-light rays. */
export interface GroundHeightField { heights:Float32Array;resolution:number;min:number;max:number;width:number;height:number }
export function captureGroundHeight(width:number,height:number,sample:(x:number,z:number)=>number,resolution=4):GroundHeightField|undefined {
  const heights=new Float32Array(width*height*resolution*resolution);let min=0,max=0,changed=false;
  const row=width*resolution;
  for(let z=0;z<height*resolution;z++)for(let x=0;x<row;x++) {
    const value=sample((x+.5)/resolution-.5,(z+.5)/resolution-.5);
    if(!Number.isFinite(value))throw Error("Ground support must be finite");
    heights[z*row+x]=value;min=Math.min(min,value);max=Math.max(max,value);changed ||= value!==0;
  }
  return changed?{heights,resolution,min,max,width,height}:undefined;
}
export function groundHeightAt(field:GroundHeightField,x:number,z:number):number {
  const ix=Math.floor((x+.5)*field.resolution),iz=Math.floor((z+.5)*field.resolution);
  return ix<0||iz<0||ix>=field.width*field.resolution||iz>=field.height*field.resolution?0:field.heights[iz*field.width*field.resolution+ix];
}
export interface GroundRayHit {distance:number;position:[number,number,number];normal:[number,number,number]}
/** DDA across exact flat tread cells; catches both terrace tops and vertical risers. */
export function traceGroundHeight(field:GroundHeightField,start:[number,number,number],direction:[number,number,number],maxDistance:number):GroundRayHit|null {
  const [ax,ay,az]=start,[dx,dy,dz]=direction,epsilon=1e-6;
  if(ay<groundHeightAt(field,ax,az)-epsilon)return {distance:0,position:[...start],normal:[0,1,0]};
  let begin=0,end=maxDistance;
  if(Math.abs(dy)>1e-9){const a=(field.min-ay)/dy,b=(field.max-ay)/dy;begin=Math.max(0,Math.min(a,b)-epsilon);end=Math.min(end,Math.max(a,b)+epsilon);}
  else if(ay>field.max+epsilon)return null;
  if(end<begin)return null;
  const size=1/field.resolution,signX=dx>=0?1:-1,signZ=dz>=0?1:-1;
  let t=begin,x=Math.floor((ax+dx*(t+epsilon)+.5)*field.resolution),z=Math.floor((az+dz*(t+epsilon)+.5)*field.resolution);
  const deltaX=Math.abs(dx)<1e-9?Infinity:size/Math.abs(dx),deltaZ=Math.abs(dz)<1e-9?Infinity:size/Math.abs(dz);
  let nextX=deltaX===Infinity?Infinity:((x+Number(signX>0))*size-.5-ax)/dx;
  let nextZ=deltaZ===Infinity?Infinity:((z+Number(signZ>0))*size-.5-az)/dz;
  let normal:[number,number,number]=[0,1,0];
  for(let steps=0;steps<4096&&t<=end;steps++) {
    const h=groundHeightAt(field,(x+.5)*size-.5,(z+.5)*size-.5),stop=Math.min(nextX,nextZ,end);
    if(ay+dy*t<h-epsilon)return {distance:t,position:[ax+dx*t,ay+dy*t,az+dz*t],normal};
    if(dy < -1e-9){const hit=(h-ay)/dy;if(hit>=t-epsilon&&hit<=stop+epsilon)return {distance:Math.max(0,hit),position:[ax+dx*hit,h,az+dz*hit],normal:[0,1,0]};}
    if(stop===end)break;
    if(nextX<=nextZ){t=nextX;nextX+=deltaX;x+=signX;normal=[-signX,0,0];}
    else{t=nextZ;nextZ+=deltaZ;z+=signZ;normal=[0,0,-signZ];}
  }
  return null;
}
