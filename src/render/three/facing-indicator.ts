import * as THREE from "three";

const GROUND_OFFSET=.04;
const noRaycast:THREE.Mesh['raycast']=()=>{};

/** Small world-sized ground mark; neither the camera nor screen dimensions affect it. */
export class WorldFacingIndicator {
  readonly group=new THREE.Group();
  private readonly meshes:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>[]=[];
  private disposed=false;

  constructor(){
    this.group.name="player-facing-indicator";
    const ring:number[]=[],segments=64,inner=.415,outer=.445;
    for(let i=0;i<segments;i++){
      const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
      const p=(r:number,t:number)=>[Math.sin(t)*r,0,Math.cos(t)*r];
      ring.push(...p(inner,a),...p(outer,a),...p(outer,b),...p(inner,a),...p(outer,b),...p(inner,b));
    }
    this.add("facing-ring",ring,0xf4e6bd,.6);
    // A compact chevron beyond the ring, authored toward local +Z.
    this.add("facing-arrow",[-.105,0,.505,0,0,.755,0,0,.585,0,0,.585,0,0,.755,.105,0,.505],0xf6cd79,.95);
  }

  private add(name:string,positions:number[],color:number,opacity:number){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:true,depthWrite:false,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.raycast=noRaycast;
    mesh.castShadow=false;mesh.receiveShadow=false;
    this.meshes.push(mesh);this.group.add(mesh);
  }

  update(player:{x:number;z:number;facingX:number;facingZ:number},sampleGround:(x:number,z:number)=>number):void {
    if(this.disposed)return;
    const x=Number.isFinite(player.x)?player.x:0,z=Number.isFinite(player.z)?player.z:0;
    const yaw=Math.hypot(player.facingX,player.facingZ)>.00001?Math.atan2(player.facingX,player.facingZ):this.group.rotation.y;
    this.group.position.set(x,0,z);this.group.rotation.y=yaw;
    const sin=Math.sin(yaw),cos=Math.cos(yaw);
    for(const mesh of this.meshes){
      const vertices=mesh.geometry.getAttribute("position");
      for(let i=0;i<vertices.count;i++){
        const localX=vertices.getX(i),localZ=vertices.getZ(i);
        const height=sampleGround(x+localX*cos+localZ*sin,z-localX*sin+localZ*cos);
        vertices.setY(i,(Number.isFinite(height)?height:0)+GROUND_OFFSET);
      }
      vertices.needsUpdate=true;mesh.geometry.computeBoundingSphere();
    }
    this.group.updateMatrixWorld(true);
  }

  dispose():void {
    if(this.disposed)return;this.disposed=true;
    for(const mesh of this.meshes){mesh.geometry.dispose();mesh.material.dispose();}
    this.group.clear();this.group.removeFromParent();
  }
}
