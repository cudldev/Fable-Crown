import type { Group, Mesh, MeshLambertMaterial, Vector3 } from "three";
import type { ActorState, WorldObject, Terrain } from "../../rpg/types";

/** Model-local positions; the renderer places the root at the footprint centre. */
export interface LightAnchor {
  position: Vector3;
  color: number;
  intensity: number;
  distance: number;
  kind: "window" | "forge" | "lantern";
}
export interface ObjectArt {
  group: Group;
  roof?: Group;
  facade?: Group;
  available?: Group;
  depleted?: Group;
  gate?: Group;
  lights: LightAnchor[];
}
export interface ActorArt {
  group: Group;
  body: Group;
  leftArm: Group;
  rightArm: Group;
  leftLeg: Group;
  rightLeg: Group;
  tool: Group;
  cape?: Mesh;
}
export interface ArtLibrary {
  terrain: Record<Terrain, MeshLambertMaterial>;
  createObject(object: WorldObject): ObjectArt;
  createActor(actor: Pick<ActorState, "id" | "role" | "name">): ActorArt;
  createEnemy(definitionId: string): Group;
  dispose(): void;
}
