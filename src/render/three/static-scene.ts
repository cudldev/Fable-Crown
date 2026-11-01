import type {WorldDefinition,WorldObject} from "../../rpg/types";

interface ObjectMetadata {rotation?:number;groundPadHeight?:number;entrance?:{x:number;z:number}}

/** Only the authored transform; transient visibility, animation and LOD are separate. */
export function objectTransformKey(object:WorldObject&ObjectMetadata):string {
  const metadata=object,p=object.position;
  return JSON.stringify([p.worldId,p.plane,p.x,p.y,object.width,object.height,metadata.rotation??0,metadata.groundPadHeight??null]);
}

/** Moving visitor presentation must never invalidate retained static prop/LOD batches. */
export function staticSceneKey(world:WorldDefinition,groundRevision?:string|number):string {
  const objects=world.objects.filter(object=>!(object.kind==="quest"&&object.id.startsWith("valley-visitor-"))).map(object=>{
    const metadata=object as WorldObject&ObjectMetadata;
    return JSON.stringify([object.id,object.kind,object.art??null,objectTransformKey(object),object.orientation??null,object.cutaway??false,
      object.blocks,object.resourceId??null,object.questId??null,object.serviceId??null,object.shopId??null,
      metadata.entrance?[metadata.entrance.x,metadata.entrance.z]:null]);
  }).sort();
  // Terrain pigment/collision have their own invalidation. The supplied revision
  // covers actual paths, terraces and support-height edits affecting static props.
  return JSON.stringify([world.id,world.width,world.height,groundRevision??null,objects]);
}
