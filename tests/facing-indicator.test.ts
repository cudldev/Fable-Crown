import {expect,test,vi} from "vitest";
import * as THREE from "three";
import {WorldFacingIndicator} from "../src/render/three/facing-indicator";

function meshes(mark:WorldFacingIndicator){return mark.group.children as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>[];}

test("ring and arrow are flat, quiet world geometry with depth testing and no hit targets",()=>{
  const mark=new WorldFacingIndicator();mark.update({x:2,z:3,facingX:0,facingZ:1},()=>.5);
  const [ring,arrow]=meshes(mark);expect(ring.name).toBe("facing-ring");expect(arrow.name).toBe("facing-arrow");
  const ringVertices=ring.geometry.getAttribute("position"),arrowVertices=arrow.geometry.getAttribute("position");
  for(let i=0;i<ringVertices.count;i++){expect(Math.hypot(ringVertices.getX(i),ringVertices.getZ(i))).toBeGreaterThan(.41);expect(Math.hypot(ringVertices.getX(i),ringVertices.getZ(i))).toBeLessThan(.45);expect(ringVertices.getY(i)).toBeCloseTo(.54);}
  expect(Math.max(...Array.from({length:arrowVertices.count},(_,i)=>arrowVertices.getZ(i)))).toBeCloseTo(.755);
  for(const mesh of meshes(mark)){
    expect(mesh.material.depthTest).toBe(true);expect(mesh.material.depthWrite).toBe(false);expect(mesh.castShadow).toBe(false);
    const hits:THREE.Intersection[]=[];mesh.raycast(new THREE.Raycaster(new THREE.Vector3(2,10,3),new THREE.Vector3(0,-1,0)),hits);expect(hits).toEqual([]);
  }
  expect(mark.group.scale.toArray()).toEqual([1,1,1]);mark.dispose();
});

test("arrow rotates with world facing, retaining its metre scale and ground position",()=>{
  const mark=new WorldFacingIndicator();mark.update({x:12,z:8,facingX:1,facingZ:0},()=>0);
  expect(mark.group.rotation.y).toBeCloseTo(Math.PI/2);expect(mark.group.position.toArray()).toEqual([12,0,8]);
  const tip=new THREE.Vector3(0,.04,.755).applyMatrix4(mark.group.matrixWorld);
  expect(tip.x).toBeCloseTo(12.755);expect(tip.z).toBeCloseTo(8);
  mark.update({x:12,z:8,facingX:-1,facingZ:0},()=>0);expect(mark.group.rotation.y).toBeCloseTo(-Math.PI/2);
  expect(mark.group.scale.toArray()).toEqual([1,1,1]);mark.dispose();
});

test("every rotated vertex samples its actual terrain point across terraces",()=>{
  const mark=new WorldFacingIndicator(),ground=(x:number,z:number)=>x>5.1?.5:z>3?.125:0;
  mark.update({x:5,z:3,facingX:1,facingZ:1},ground);
  const point=new THREE.Vector3();
  for(const mesh of meshes(mark)){
    const vertices=mesh.geometry.getAttribute("position");
    for(let i=0;i<vertices.count;i++){
      point.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);
      expect(point.y).toBeCloseTo(ground(point.x,point.z)+.04,5);
    }
  }
  mark.dispose();
});

test("owned geometry and materials are disposed once and the scene node is removed",()=>{
  const mark=new WorldFacingIndicator(),scene=new THREE.Scene();scene.add(mark.group);
  const resources=meshes(mark).flatMap(mesh=>[mesh.geometry,mesh.material]),spies=resources.map(resource=>vi.spyOn(resource,"dispose"));
  mark.dispose();mark.dispose();for(const spy of spies)expect(spy).toHaveBeenCalledTimes(1);
  expect(mark.group.parent).toBeNull();expect(mark.group.children).toHaveLength(0);
});
