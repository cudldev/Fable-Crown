import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SkinnedMesh, Vector3, type Group } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TripoCharacter } from "../src/render/three/tripo-character";
import { TRIPO_CLIPS, tripoMotion, type TripoMotionInput } from "../src/render/three/tripo-motion";
import type { SkinnedActorSource } from "../src/render/three/contracts";

const bytes = readFileSync(new URL("../public/art3d/tripo-character-test-v1.glb", import.meta.url));
const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
let source: SkinnedActorSource;
function noTextures(buffer: Buffer) {
  const data = JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());
  delete data.images; delete data.textures; delete data.samplers;
  for (const mat of data.materials ?? []) { delete mat.pbrMetallicRoughness?.baseColorTexture; delete mat.pbrMetallicRoughness?.metallicRoughnessTexture; delete mat.normalTexture; delete mat.occlusionTexture; delete mat.emissiveTexture; }
  const text = Buffer.from(JSON.stringify(data)), size = Math.ceil(text.length/4)*4, binary = buffer.subarray(20+buffer.readUInt32LE(12));
  const output = Buffer.alloc(20+size+binary.length,32);
  output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(size,12);output.writeUInt32LE(0x4e4f534a,16);text.copy(output,20);binary.copy(output,20+size);
  return output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength) as ArrayBuffer;
}
const input = (patch: Partial<TripoMotionInput> = {}): TripoMotionInput => ({time:0,frame:0,moving:false,swing:0,swingTool:false,blocking:false,health:10,facingX:0,facingZ:1,tool:"sword",...patch});
const skin = (group: Group) => {let found: SkinnedMesh|undefined;group.traverse(node=>{if(node instanceof SkinnedMesh)found=node;});return found!;};
beforeAll(async()=>{
  const loader=new GLTFLoader(),gltf=await loader.parseAsync(noTextures(bytes),"http://local/");
  const tools=readFileSync(new URL("../public/art3d/tripo-test-tools-v1.glb",import.meta.url));
  source={scene:gltf.scene,clips:gltf.animations,tools:(await loader.parseAsync(noTextures(tools),"http://local/")).scene};
});
describe("valley Tripo trial",()=>{
  it("preserves the supplied JPEG and corrected skin/action payload",()=>{
    const view=json.bufferViews[json.images[0].bufferView],start=20+bytes.readUInt32LE(12)+8+(view.byteOffset??0);
    expect(createHash("sha256").update(bytes.subarray(start,start+view.byteLength)).digest("hex")).toBe("f9ba0a1c15b621bcd365faf50e5bd2371cd7c588d9961c5ae1e4887cca800848");
    expect(json.skins[0].joints).toHaveLength(22);expect(json.animations).toHaveLength(15);
    expect(json.meshes).toHaveLength(1);expect(json.images[0].uri).toBeUndefined();
  });
  it("uses committed continuous actions, guard and contact timing",()=>{
    expect(tripoMotion(input({moving:true})).clip).toBe("walk");
    expect(tripoMotion(input({moving:true,blocking:true}))).toMatchObject({clip:"block",tool:"shield"});
    expect(tripoMotion(input({health:0,blocking:true})).clip).toBe("defeat");
    expect(tripoMotion(input({swing:24,swingTool:true,workClip:"mine"}))).toEqual({clip:"mine",phase:0,tool:"pickaxe"});
    expect(tripoMotion(input({swing:24,tool:"bow"})).clip).toBe("bow");
    expect(tripoMotion(input({workClip:"cook"}))).toEqual({clip:"cook",tool:"none"});
    for(const clip of ["smith","cook","fish","pickup","bank","talk"] as const)expect(tripoMotion(input({workClip:clip})).clip).toBe(clip);
  });
  it("clones skeletons independently and supports every preview plus guard",()=>{
    const rig=new TripoCharacter(source),a=rig.createActor(),b=rig.createActor(),am=skin(a.group),bm=skin(b.group);
    expect(am.geometry).toBe(bm.geometry);expect(am.skeleton).not.toBe(bm.skeleton);
    const vertices=am.geometry.attributes.position!.array.slice();
    for(const clip of TRIPO_CLIPS){
      rig.setPreview(clip);const before=bm.skeleton.bones.map(bone=>bone.quaternion.toArray());
      for(const time of [0,100,200,600]){
        rig.pose(a.group,input({time,frame:Math.round(time*.06)}));a.group.updateMatrixWorld(true);am.skeleton.update();
        const point=new Vector3();let floor=Infinity;
        for(let v=0;v<am.geometry.attributes.position!.count;v+=19){am.getVertexPosition(v,point).applyMatrix4(am.matrixWorld);expect(Number.isFinite(point.x+point.y+point.z),clip).toBe(true);floor=Math.min(floor,point.y);}
        expect(floor,clip).toBeGreaterThan(-.015);
      }
      expect(bm.skeleton.bones.map(bone=>bone.quaternion.toArray())).toEqual(before);
      expect(a.group.userData.characterClip).toBe(clip);
    }
    expect(am.geometry.attributes.position!.array).toEqual(vertices);rig.dispose();
  });
  it("faces the continuous aim and preserves idle pose while action time is paused",()=>{
    const rig=new TripoCharacter(source),art=rig.createActor();
    rig.pose(art.group,input({time:0,frame:90,facingX:1,facingZ:0}));rig.pose(art.group,input({time:200,frame:90,facingX:1,facingZ:0}));
    const before=skin(art.group).skeleton.bones.map(b=>b.quaternion.toArray());
    rig.pose(art.group,input({time:800,frame:90,facingX:1,facingZ:0}));
    expect(art.group.rotation.y).toBeCloseTo(Math.PI/2);expect(skin(art.group).skeleton.bones.map(b=>b.quaternion.toArray())).toEqual(before);
    rig.setPreview("rest");rig.pose(art.group,input());expect(art.group.userData.characterClip).toBe("rest");
    rig.setPreview("gameplay");rig.pose(art.group,input({moving:true,frame:102}));expect(art.group.userData.characterClip).toBe("walk");rig.dispose();
  });
});
