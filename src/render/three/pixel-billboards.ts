import { CircleGeometry, DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, NoColorSpace, PlaneGeometry, RGBAFormat, SRGBColorSpace, Vector2, Vector3, type Camera, type Intersection } from "three";
import { heldToolForActor, heldToolForEnemy } from "../unit-tools";
import { unitWorldFrame } from "../unit-scale";
import type { ActorState, WorldObject } from "../../rpg/types";
import { createUnitSheet, createHeldUnitSheet, UNIT_FRAME_COUNT, unitKindForActor, unitKindForEnemy, type UnitKind, type UnitTool } from "../pixel-units";
import type { ArtLibrary, ObjectArt, RigidActorArt } from "./contracts";
import { groundPivotDepthGLSL } from "./pivot-depth";

interface UnitVisual { root: Group; body: Group; mesh: Mesh<PlaneGeometry, MeshStandardMaterial>; tool: Mesh<PlaneGeometry, MeshStandardMaterial>; height: number; frame: number; kind: UnitKind; variant: number; flipX: boolean }
interface Pigment { map: DataTexture; normal: DataTexture; material: MeshStandardMaterial; bodyHeight: number; footX: number; footY: number; frameSize: number }
const direction = new Vector3();

/** Native pixel data, not crops of concept artwork. Textures and frame UVs are immutable/shared. */
export class PixelBillboards {
  private pigments = new Map<string, Pigment>();
  private visuals = new Map<Group, UnitVisual>();
  private frames: PlaneGeometry[] = [];
  private shadowGeometry = new CircleGeometry(.48, 16);
  private shadowMaterial = new MeshBasicMaterial({ color: 0x34352a, opacity: .18, transparent: true, depthWrite: false });
  private normalStrength = -.1;
  readonly library: ArtLibrary;

  constructor(private base: ArtLibrary) {
    for (let frame = 0; frame < UNIT_FRAME_COUNT; frame++) {
      const geometry = new PlaneGeometry(1, 1), uv = geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) {
        // Native array rows start at the top; explicitly map them without upload flip heuristics.
        uv.setXY(i, (frame + uv.getX(i)) / UNIT_FRAME_COUNT, 1 - uv.getY(i));
      }
      this.frames.push(geometry);
    }
    this.library = {
      terrain: base.terrain, terrainTiles: base.terrainTiles,
      createActor: actor => this.createActor(actor),
      createEnemy: id => this.create(unitKindForEnemy(id), 0, `enemy:${id}`).root,
      createObject: object => object.kind === "quest" ? this.createQuest(object) : base.createObject(object),
      dispose: () => { this.dispose(); base.dispose(); },
    };
  }
  private texture(data: Uint8Array, width: number, height: number, color = false) {
    const texture = new DataTexture(data, width, height, RGBAFormat);
    texture.magFilter = texture.minFilter = NearestFilter; texture.generateMipmaps = false;
    texture.colorSpace = color ? SRGBColorSpace : NoColorSpace; texture.flipY = false;
    texture.needsUpdate = true; return texture;
  }
  private pigment(kind: UnitKind, variant: number, tool?: UnitTool): Pigment {
    const key = `${kind}:${variant % 8}:${tool ?? "body"}`; let result = this.pigments.get(key);
    if (!result) {
      const sheet = tool === undefined ? createUnitSheet(kind, variant % 8) : createHeldUnitSheet(kind, variant % 8, tool);
      const map = this.texture(sheet.rgba, sheet.width, sheet.height, true), normal = this.texture(sheet.normal, sheet.width, sheet.height);
      const material = new MeshStandardMaterial({ map, normalMap: normal, normalScale: new Vector2(this.normalStrength >= 0 ? this.normalStrength : .35, -(this.normalStrength >= 0 ? this.normalStrength : .35)), roughness: 1, metalness: 0,
        alphaTest: .5, transparent: false, side: DoubleSide, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: .12 });
      material.name = `pixel-unit-${key}`;
      const frame = unitWorldFrame(sheet);
      // Shared per pigment, expressed in the unscaled plane's coordinates. The
      // held layer's tiny visual offset must use exactly the body's ground depth.
      const groundPivot = new Vector3(-frame.x / frame.span, -frame.y / frame.span, tool === undefined ? 0 : -.002);
      material.onBeforeCompile = shader => {
        shader.uniforms.unitGroundPivot = { value: groundPivot };
        shader.vertexShader = "uniform vec3 unitGroundPivot;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>" + groundPivotDepthGLSL("(modelMatrix*vec4(unitGroundPivot,1.0)).xyz"));
      };
      material.customProgramCacheKey = () => "pixel-unit-ground-pivot-v1";
      result = { map, normal, material, bodyHeight: sheet.bodyHeight, footX: sheet.footX, footY: sheet.footY, frameSize: sheet.frameSize };
      this.pigments.set(key, result);
    }
    return result;
  }
  private create(kind: UnitKind, variant: number, name: string): UnitVisual {
    const pigment = this.pigment(kind, variant);
    const frame = unitWorldFrame(pigment), height = frame.bodyHeight, size = frame.span;
    const root = new Group(), body = new Group(); root.name = name; root.userData.pixelUnit = true; root.userData.unitKind = kind; root.userData.spriteCellMeters = frame.pitch; root.userData.bodyHeightMeters = height; root.add(body);
    const mesh = new Mesh(this.frames[0], pigment.material); mesh.name = "pixel-billboard";
    mesh.scale.set(size, size, 1);
    mesh.position.set(frame.x, frame.y, 0);
    mesh.castShadow = mesh.receiveShadow = true; body.add(mesh);
    const native = pigment.map.image as { data: Uint8Array; width: number; height: number };
    const originalRaycast = mesh.raycast;
    mesh.raycast = (raycaster, hits) => {
      const candidates: Intersection[] = []; originalRaycast.call(mesh, raycaster, candidates);
      for (const hit of candidates) if (hit.uv) {
        const x = Math.max(0, Math.min(native.width - 1, Math.floor(hit.uv.x * native.width)));
        const y = Math.max(0, Math.min(native.height - 1, Math.floor(hit.uv.y * native.height)));
        if (native.data[(y * native.width + x) * 4 + 3] >= 128) hits.push(hit);
      }
    };
    const tool = new Mesh(this.frames[0], pigment.material); tool.visible = false; tool.name = "pixel-held-tool"; tool.castShadow = true; body.add(tool);
    const shadow = new Mesh(this.shadowGeometry, this.shadowMaterial); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .018; root.add(shadow); shadow.raycast = () => {};
    const visual = { root, body, mesh, tool, height, frame: 0, kind, variant, flipX: false }; this.visuals.set(root, visual);
    this.frame(root, 0, 0, undefined, heldToolForEnemy(kind)); return visual;
  }
  createActor(actor: Pick<ActorState, "id" | "name" | "role">): RigidActorArt {
    const visual = this.create(unitKindForActor(actor), actor.id, `actor:${actor.name}`);
    const limb = (name: string) => { const group = new Group(); group.name = name; return group; };
    // Legacy review tools can still inspect the ActorArt contract; gameplay uses authored frame poses.
    this.frame(visual.root, 0, 0, undefined, heldToolForActor(actor));
    return { kind: "rigid", group: visual.root, body: visual.body, leftArm: limb("leftArm"), rightArm: limb("rightArm"), leftLeg: limb("leftLeg"), rightLeg: limb("rightLeg"), tool: limb("tool") };
  }
  private createQuest(object: WorldObject): ObjectArt {
    const role = object.questId === "forge" ? "smith" : object.questId === "supper" ? "cook" : "merchant";
    const variant = [...object.name].reduce((n, c) => n + c.charCodeAt(0), 0) % 12;
    const visual = this.create(unitKindForActor({ id: 1000 + variant, name: object.name, role }), variant, `quest:${object.name}`);
    this.frame(visual.root, 0, 0, undefined, heldToolForActor({ id: 1000, role }));
    return { group: visual.root, lights: [] };
  }
  has(group: Group) { return this.visuals.has(group); }
  get count() { return this.visuals.size; }
  frame(group: Group, index: number, _squash = 0, _pose?: string, heldTool: UnitTool = "none", flipX?: boolean) {
    const visual = this.visuals.get(group); if (!visual) return;
    const stateFrame = Math.max(0, Math.min(UNIT_FRAME_COUNT - 1, Math.floor(index)));
    const bodyFrame = stateFrame >= 8 ? stateFrame : 0;
    visual.mesh.geometry = this.frames[bodyFrame]; visual.frame = stateFrame;
    if (flipX !== undefined) visual.flipX = flipX;
    visual.body.scale.set(visual.flipX ? -1 : 1, 1, 1);
    const layer = this.pigment(visual.kind, visual.variant, heldTool);
    visual.tool.material = layer.material;
    visual.tool.geometry = this.frames[stateFrame === 1 || stateFrame === 6 ? 1 : 0];
    visual.tool.position.copy(visual.mesh.position); visual.tool.position.z += .002;
    visual.tool.scale.copy(visual.mesh.scale); // Identical native pitch, canvas and foot/hand anchor.
    visual.tool.visible = visual.kind !== "boar" && visual.kind !== "rock-mite" && bodyFrame < 8;
    visual.tool.raycast = () => {};
    group.userData.spriteFrame = stateFrame; group.userData.spriteFlip = visual.flipX;
  }
  faceCamera(camera: Camera, normalStrength: number) {
    camera.getWorldDirection(direction);
    const yaw = Math.atan2(-direction.x, -direction.z);
    for (const visual of this.visuals.values()) { visual.root.rotation.set(0, 0, 0); visual.body.quaternion.copy(camera.quaternion); }
    // Atlas UV rows run down; invert tangent green to keep authored top normals pointing up.
    const strength = Math.max(0, Math.min(1, normalStrength));
    if (strength !== this.normalStrength) { for (const pigment of this.pigments.values()) pigment.material.normalScale.set(strength, -strength); this.normalStrength = strength; }
    return yaw;
  }
  dispose() {
    for (const pigment of this.pigments.values()) { pigment.map.dispose(); pigment.normal.dispose(); pigment.material.dispose(); }
    this.frames.forEach(frame => frame.dispose()); this.shadowGeometry.dispose(); this.shadowMaterial.dispose();
    this.visuals.clear(); this.pigments.clear();
  }
}
