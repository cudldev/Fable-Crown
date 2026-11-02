import type { AnimationClip, Group, Mesh, MeshLambertMaterial, Vector3 } from "three";
import type { ActorState, WorldObject, Terrain } from "../../rpg/types";
import type { VoxelObject } from "./voxel-data";
import type { TerrainTiles } from "./terrain-tiles";

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
  voxels?: VoxelObject;
  roof?: Group;
  facade?: Group;
  available?: Group;
  depleted?: Group;
  gate?: Group;
  lights: LightAnchor[];
}
export interface RigidActorArt {
  kind: "rigid";
  group: Group;
  body: Group;
  leftArm: Group;
  rightArm: Group;
  leftLeg: Group;
  rightLeg: Group;
  tool: Group;
  cape?: Mesh;
}
export interface SkinnedActorArt extends Omit<RigidActorArt, "kind"> { kind: "skinned" }
export type ActorArt = RigidActorArt | SkinnedActorArt;
export interface SkinnedActorSource { scene: Group; clips: AnimationClip[]; tools: Group }
export interface ArtLibrary {
  skinnedActorSource?: SkinnedActorSource;
  terrain: Record<Terrain, MeshLambertMaterial>;
  terrainTiles?: TerrainTiles;
  createObject(object: WorldObject, options?: { standaloneVoxels?: boolean }): ObjectArt;
  createActor(actor: Pick<ActorState, "id" | "role" | "name">): ActorArt;
  createEnemy(definitionId: string): Group;
  dispose(): void;
}
export interface RigidArtLibrary extends Omit<ArtLibrary, "createActor"> {
  createActor(actor: Pick<ActorState, "id" | "role" | "name">): RigidActorArt;
}
