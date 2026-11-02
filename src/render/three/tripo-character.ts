import { AnimationClip, AnimationMixer, Bone, Box3, CylinderGeometry, Group, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3, type AnimationAction } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { SkinnedActorArt, SkinnedActorSource } from "./contracts";
import type { UnitTool } from "../pixel-units";
import { TRIPO_CLIPS, tripoMotion, type TripoMotionInput, type TripoPreview } from "./tripo-motion";

interface Instance { art: SkinnedActorArt; model: Group; mixer: AnimationMixer; actions: Map<string, AnimationAction>; active?: AnimationAction; lastTime?: number; toolKind?: UnitTool; shield: Group }
/** Supplied textured skin with independent skeletons, driven by continuous valley snapshots. */
export class TripoCharacter {
  private instances = new Map<Group, Instance>();
  private preview: TripoPreview = "gameplay";
  private shieldGeometry = new CylinderGeometry(.12, .12, .035, 8);
  private shieldMaterial = new MeshStandardMaterial({ color: 0x9b7544, roughness: 1, metalness: 0 });
  private clips: AnimationClip[];
  constructor(private source: SkinnedActorSource) {
    // A static guard test derived from the supplied rig's two-arm reach. No mesh changes.
    const bow = source.clips.find(clip => clip.name === "bow");
    if (!bow) throw Error("Tripo source is missing its bow/reach clip.");
    const tracks = bow.tracks.map(track => {
      const copy = track.clone(), values = track.InterpolantFactoryMethodLinear().evaluate(bow.duration * .45);
      copy.times = new Float32Array([0, 1]); copy.values = new Float32Array([...values, ...values]); return copy;
    });
    this.clips = [...source.clips, new AnimationClip("block", 1, tracks)];
    for (const name of TRIPO_CLIPS) if (!this.clips.some(clip => clip.name === name)) throw Error("Tripo source is missing " + name);
  }
  has(group: Group) { return this.instances.has(group); }
  private bone(model: Group, name: string) {
    let found: Bone | undefined; model.traverse(node => { if (node instanceof Bone && node.name.endsWith(name)) found = node; });
    if (!found) throw Error("Tripo rig missing " + name); return found;
  }
  createActor(): SkinnedActorArt {
    const group = new Group(); group.name = "actor:Alden:tripo";
    const model = clone(this.source.scene) as Group; model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model), scale = 1.125 / (bounds.max.y - bounds.min.y);
    const normalized = new Group(); normalized.scale.setScalar(scale); normalized.add(model);
    normalized.position.set(-(bounds.min.x + bounds.max.x) * scale / 2, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) * scale / 2); group.add(normalized);
    model.traverse(node => { if (node instanceof Mesh) { node.castShadow = node.receiveShadow = true; node.frustumCulled = false; } });
    group.updateMatrixWorld(true);
    const socket = (name: string, offset: number) => {
      const bone = this.bone(model, name), rotation = bone.getWorldQuaternion(new Quaternion()).invert(), node = new Group();
      node.quaternion.copy(rotation); node.position.copy(new Vector3(offset, 0, 0).applyQuaternion(rotation));
      node.scale.setScalar(1 / scale); bone.add(node); return node;
    };
    const tool = socket("RightHand", -.07), shield = socket("LeftHand", .07);
    const shieldMesh = new Mesh(this.shieldGeometry, this.shieldMaterial); shieldMesh.rotation.x = Math.PI / 2; shield.add(shieldMesh); shield.visible = false;
    const art: SkinnedActorArt = { kind: "skinned", group, body: model, tool, leftArm: new Group(), rightArm: new Group(), leftLeg: new Group(), rightLeg: new Group() };
    const mixer = new AnimationMixer(model), actions = new Map(this.clips.map(clip => [clip.name, mixer.clipAction(clip)]));
    this.instances.set(group, { art, model, mixer, actions, shield });
    group.userData.bodyHeightMeters = 1.125; group.userData.characterKit = "tripo-valley-test-v1";
    return art;
  }
  setPreview(clip: TripoPreview) {
    if (clip !== "gameplay" && clip !== "rest" && !(TRIPO_CLIPS as readonly string[]).includes(clip)) throw Error("Unknown character test clip.");
    this.preview = clip;
    for (const entry of this.instances.values()) { entry.mixer.stopAllAction(); entry.active = undefined; entry.lastTime = undefined; }
  }
  private setTool(entry: Instance, kind: UnitTool) {
    if (entry.toolKind === kind) return;
    entry.toolKind = kind; entry.art.tool.clear();
    if (kind === "none" || kind === "shield") return;
    const source = this.source.tools.getObjectByName("tool-" + kind); if (!source) throw Error("Tripo tool unavailable: " + kind);
    const item = source.clone(true); item.traverse(node => { node.visible = true; });
    if (kind === "sword" || kind === "rod") item.rotation.x = Math.PI / 2;
    else item.rotation.y = Math.PI / 2;
    entry.art.tool.add(item);
  }
  pose(group: Group, input: TripoMotionInput) {
    const entry = this.instances.get(group); if (!entry) return;
    const sampled = tripoMotion(input), name = this.preview === "gameplay" ? sampled.clip : this.preview;
    const tool = this.preview === "gameplay" ? sampled.tool : ({ block: "shield", cut: "axe", mine: "pickaxe", smith: "hammer", fish: "rod", melee: "sword", bow: "bow" } as Partial<Record<string, UnitTool>>)[name] ?? "none";
    this.setTool(entry, tool); entry.art.tool.visible = tool !== "none" && tool !== "shield"; entry.shield.visible = tool === "shield";
    if (name === "rest") {
      entry.mixer.stopAllAction(); entry.active = undefined;
      entry.model.traverse(node => { if (node instanceof SkinnedMesh) node.skeleton.pose(); });
    } else {
      const next = entry.actions.get(name)!;
      if (entry.active !== next) {
        entry.active?.fadeOut(.1); next.reset().setEffectiveWeight(1).fadeIn(.1).play();
        next.setLoop(name === "defeat" && this.preview === "gameplay" ? LoopOnce : LoopRepeat, Infinity); next.clampWhenFinished = true; entry.active = next;
      }
      const delta = entry.lastTime === undefined ? 1 / 60 : Math.max(0, Math.min(.1, (input.time - entry.lastTime) / 1000));
      entry.mixer.update(delta);
      if (input.reducedMotion) next.time = next.getClip().duration * .5;
      else if (this.preview === "gameplay") next.time = sampled.phase !== undefined ? sampled.phase * next.getClip().duration : (input.frame / 60) % next.getClip().duration;
      entry.mixer.update(0);
    }
    entry.lastTime = input.time;
    if (this.preview !== "gameplay") group.rotation.y = .618;
    else if (Math.hypot(input.facingX, input.facingZ) > .001) group.rotation.y = Math.atan2(input.facingX, input.facingZ);
    group.userData.characterClip = name; group.userData.characterTool = tool;
    return name;
  }
  dispose() {
    for (const entry of this.instances.values()) { entry.mixer.stopAllAction(); entry.mixer.uncacheRoot(entry.model); entry.model.traverse(node => { if (node instanceof SkinnedMesh) node.skeleton.dispose(); }); }
    this.instances.clear(); this.shieldGeometry.dispose(); this.shieldMaterial.dispose();
  }
}
