import * as THREE from "three";
import type { TileSceneProps, TileSelection } from "../scene-types";
import type { ActorState, TilePosition, WorldDefinition, WorldObject } from "../../rpg/types";
import { worldForState } from "../../rpg/world";
import { actionPose, consumeEffects, observeActorMotion, observeFootstep, observeWorkContact, sampleActorMotion, workStroke, type EffectCursor, type FootstepCursor, type MotionTimeline, type WorkContactCursor } from "../presentation";
import { createArtLibrary } from "./art";
import type { ActorArt, ArtLibrary, ObjectArt } from "./contracts";
import { PixelBillboards } from "./pixel-billboards";
import { UNIT_PIXEL_METRES } from "../unit-scale";
import { samplePixelUnitPose } from "../pixel-canvas";
import { heldToolForActor, heldToolForEnemy } from "../unit-tools";
import { VoxelBuckets } from "./voxel-buckets";
import { VoxelGI } from "./voxel-gi";
import { captureGIWorld } from "./voxel-gi-source";
import { FrameMeter, GpuMeter } from "./performance";
import { DEFAULT_VISUAL_SETTINGS, type VisualSettings } from "./visual-settings";
import { buildTerrainSurface, type TerrainSurface } from "./terrain-tiles";
import { LightingRig, type LightingPreset, type SceneLamp } from "./lighting";
import { WaterSystem, WATER_HEIGHT } from "./water";
import { SkySystem } from "./sky";
import { FoliageSystem } from "./foliage";
import { clampGameplayZoom, gameplaySpan } from "../camera-limits";

export type CameraMode = "perspective" | "orthographic";
export interface RuntimeInput extends TileSceneProps { lighting: LightingPreset; shadows: boolean; cameraMode: CameraMode; panelOpen?: boolean; gi?: boolean; ao?: boolean; visual?: Readonly<VisualSettings> }
interface Person {
  art: ActorArt; timeline?: MotionTimeline; flipX?: boolean;
}
interface Prop { object: WorldObject; art: ObjectArt }
interface StaticBatch { mesh: THREE.InstancedMesh; sources: THREE.Mesh[]; x: number; z: number }
interface Transient { group: THREE.Group; end: number; from: THREE.Vector3; to: THREE.Vector3; start: number; projectile: boolean }
const temp = new THREE.Vector3();
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** All world positions remain in authoritative tile coordinates. No simulation state is written. */
export class ThreeRuntime {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private voxelBuckets = new VoxelBuckets(this.scene);
  private gi: VoxelGI;
  private depletedForGI: string[] = [];
  private giWorldDirty = true;
  private frameMeter = new FrameMeter();
  private gpuMeter: GpuMeter;
  private visibilityChanged = () => this.frameMeter.reset();
  private orthographicCamera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 650);
  private perspectiveCamera = new THREE.PerspectiveCamera(20, 1, .1, 650);
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = this.perspectiveCamera;
  private art: ArtLibrary;
  private pixelUnits: PixelBillboards;
  private pixelReactions = new Map<THREE.Group, { frame: number; until: number }>();
  private pixelStrikes = new Map<THREE.Group, number>();
  private enemyMotion = new Map<string, { x: number; z: number; fromX: number; fromZ: number; at: number; moving: boolean; health: number; hitUntil: number; deathUntil: number }>();
  private rig = new LightingRig(this.scene);
  private sky = new SkySystem(this.scene);
  private foliage = new FoliageSystem(this.scene);
  private props: RuntimeInput;
  private world: WorldDefinition;
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private hits: Map<string, HTMLElement>;
  private width = 1;
  private height = 1;
  private target = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private terrain = new THREE.Group();
  private terrainGeometries: THREE.BufferGeometry[] = [];
  private terrainSurface?: TerrainSurface;
  private terrainSource?: WorldDefinition["terrain"];
  private terrainWorldWidth = 0;
  private terrainWorldHeight = 0;
  private terrainMaterial?: THREE.MeshLambertMaterial;
  private terrainBakes = 0;
  private terrainBakeMs = 0;
  private frameCosts = { updates: 0, voxels: 0, gi: 0, render: 0, hits: 0, samples: 0 };
  private objects = new Map<string, Prop>();
  private batches: StaticBatch[] = [];
  private batchedIds = new Set<string>();
  private people = new Map<number, Person>();
  private enemies = new Map<string, THREE.Group>();
  private drops = new Map<string, THREE.Group>();
  private lamps: SceneLamp[] = [];
  private grave: THREE.Mesh;
  private ring: THREE.Mesh;
  private playerRing: THREE.Mesh;
  private route: THREE.Line;
  private grid: THREE.LineSegments;
  private ownGeometries: THREE.BufferGeometry[] = [];
  private ownMaterials: THREE.Material[] = [];
  private ownTextures: THREE.Texture[] = [];
  private water: THREE.Mesh[] = [];
  private waterSystem = new WaterSystem();
  private particleGeometry: THREE.BufferGeometry;
  private mist: THREE.Points;
  private transients: Transient[] = [];
  private effectCursor?: EffectCursor;
  private footstepCursor?: FootstepCursor;
  private workCursor?: WorkContactCursor;
  private observedState: RuntimeInput["state"] | null = null;
  private observedEpoch = -1;
  private observedAt = 0;
  private raf = 0;
  private disposed = false;
  private previousTime = 0;
  private panelDrawRequested = false;
  private metricsAt = 0;
  private visibilityAt = 0;
  private ready = false;
  private resizeObserver: ResizeObserver;
  private viewportChanged = () => this.resize();
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private onError: (message: string) => void;
  private contextLost: (event: Event) => void;
  private inputDispose: () => void;

  constructor(canvas: HTMLCanvasElement, root: HTMLElement, initial: RuntimeInput,
    hits: Map<string, HTMLElement>, onReady: () => void, onError: (message: string) => void, art?: ArtLibrary) {
    this.canvas = canvas; this.root = root; this.props = initial; this.hits = hits; this.onError = onError;
    this.pixelUnits = new PixelBillboards(art ?? createArtLibrary());
    this.art = this.pixelUnits.library; this.root.dataset.actorStyle = "pixel-billboard"; this.root.dataset.billboardMode = "screen-aligned"; this.root.dataset.spriteCellMeters = String(UNIT_PIXEL_METRES); this.root.dataset.spriteGrid = "voxel";
    this.world = worldForState(initial.state);
    // Capability errors are caught by the React host without changing game state.
    // Render the world at display resolution with hardware antialiasing.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.gi = new VoxelGI();
    this.gpuMeter = new GpuMeter(this.renderer.getContext() as WebGL2RenderingContext);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Count all passes in one frame, including the shared water reflection.
    this.renderer.info.autoReset = false;
    this.scene.add(this.terrain);
    this.buildTerrain();
    this.buildObjects();
    const ringGeometry = this.ownGeometry(new THREE.RingGeometry(0.4, 0.45, 24));
    const gold = this.ownMaterial(new THREE.MeshBasicMaterial({ color: 0xf6cf79, side: THREE.DoubleSide, depthWrite: false }));
    this.ring = new THREE.Mesh(ringGeometry, gold);
    this.playerRing = new THREE.Mesh(ringGeometry, gold);
    for (const ring of [this.ring, this.playerRing]) { ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; this.scene.add(ring); }
    this.grave = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.48, 0.7, 0.2)),
      this.ownMaterial(new THREE.MeshLambertMaterial({ color: 0x8a8b7d })));
    this.grave.castShadow = true; this.grave.userData.selection = { kind: "grave" }; this.scene.add(this.grave);
    this.route = new THREE.Line(this.ownGeometry(new THREE.BufferGeometry()),
      this.ownMaterial(new THREE.LineBasicMaterial({ color: 0xa8dfd8, depthTest: true })));
    this.scene.add(this.route);
    const gridPositions: number[] = [];
    for (let i = -22; i <= 22; i++) gridPositions.push(i - .5, .025, -22.5, i - .5, .025, 21.5, -22.5, .025, i - .5, 21.5, .025, i - .5);
    this.grid = new THREE.LineSegments(this.ownGeometry(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gridPositions, 3))),
      this.ownMaterial(new THREE.LineBasicMaterial({ color: 0xeadbb4, transparent: true, opacity: .22, depthWrite: false })));
    this.scene.add(this.grid);
    // A small deterministic cosmetic mote field; no gameplay RNG is consumed.
    const motes = new Float32Array(48 * 3);
    for (let i = 0; i < 48; i++) { motes[i * 3] = (i * 17.31 % 46) - 23; motes[i * 3 + 1] = .4 + i * .731 % 4; motes[i * 3 + 2] = (i * 13.7 % 46) - 23; }
    this.particleGeometry = this.ownGeometry(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(motes, 3)));
    this.mist = new THREE.Points(this.particleGeometry, this.ownMaterial(new THREE.PointsMaterial({ color: 0xffe1ac, size: .055, transparent: true, opacity: .35, depthWrite: false })));
    this.scene.add(this.mist);
    this.contextLost = event => {
      event.preventDefault(); cancelAnimationFrame(this.raf);
      this.onError("The voxel graphics context was lost. Reload to retry; your saved chapter remains on this device.");
    };
    canvas.addEventListener("webglcontextlost", this.contextLost);
    this.inputDispose = this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root); this.resize();
    window.addEventListener("resize", this.viewportChanged);
    const loop = (time: number) => {
      if (this.disposed) return;
      try {
        // Foreground panels keep worker/UI messages responsive without submitting hidden frames.
        if (!this.ready || !this.props.panelOpen || this.panelDrawRequested) { this.panelDrawRequested = false; this.frame(time); }
        if (!this.ready) { this.ready = true; onReady(); }
        this.raf = requestAnimationFrame(loop);
      } catch (error) { this.onError(error instanceof Error ? error.message : "The 3D view could not draw this scene."); }
    };
    this.raf = requestAnimationFrame(loop);
  }
  private ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T { this.ownGeometries.push(geometry); return geometry; }
  private ownMaterial<T extends THREE.Material>(material: T): T { this.ownMaterials.push(material); return material; }
  update(props: RuntimeInput) {
    const before = this.props.state.player.position, after = props.state.player.position;
    if (Math.hypot(after.x - before.x, after.y - before.y) > 2 || Boolean(props.state.grave) !== Boolean(this.props.state.grave) ||
      props.state.worldRevision !== this.props.state.worldRevision) this.panelDrawRequested = true;
    // Direct view controls still redraw while a panel is open; snapshots alone do not.
    if (props.camera !== this.props.camera || props.visual !== this.props.visual || props.lighting !== this.props.lighting ||
      props.cameraMode !== this.props.cameraMode || props.shadows !== this.props.shadows || props.gi !== this.props.gi || props.ao !== this.props.ao) this.panelDrawRequested = true;
    this.props = props;
  }
  private resize() {
    this.width = Math.max(1, this.root.clientWidth); this.height = Math.max(1, this.root.clientHeight);
    // Follow display density, capped at 2× to bound the render buffer.
    // UI and picking always use CSS dimensions, independently of render resolution.
    const scale = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setSize(Math.round(this.width * scale), Math.round(this.height * scale), false);
    this.root.dataset.renderWidth = String(this.canvas.width);
    this.root.dataset.renderHeight = String(this.canvas.height);
  }
  private buildTerrain() {
    const { width, height, terrain } = this.world;
    const changed = this.terrainSource !== terrain || this.terrainWorldWidth !== width || this.terrainWorldHeight !== height;
    if (!changed && this.terrain.children.length) return;
    this.terrain.clear(); this.water.length = 0;
    this.terrainGeometries.forEach(g => g.dispose()); this.terrainGeometries = [];
    if (changed) {
      this.terrainSurface?.dispose(); this.terrainSurface = undefined;
      this.terrainMaterial?.dispose(); this.terrainMaterial = undefined;
      this.terrainSource = terrain;
      this.terrainWorldWidth = width; this.terrainWorldHeight = height;
      this.waterSystem.setWorld(this.world);
      if (this.art.terrainTiles) {
        try {
          const started = performance.now();
          this.terrainSurface = buildTerrainSurface(this.art.terrainTiles, this.world, { quietDirtSpeckles: true }); this.terrainBakes++;
          this.terrainBakeMs = performance.now() - started;
          this.terrainMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.terrainSurface.texture });
          this.terrainMaterial.name = "native-voxel-ground";
        } catch (error) { this.root.dataset.terrainWarning = error instanceof Error ? error.message : "Native ground baking unavailable."; }
      }
    }
    const surface = this.terrainSurface;
    this.foliage.setWorld(this.world, surface?.presentationTerrain);
    const types = surface ? ["land", "water"] as const : ["grass", "dirt", "stone", "sand", "water"] as const;
    for (let cy = 0; cy < height; cy += 32) for (let cx = 0; cx < width; cx += 32) {
      for (const kind of types) {
        const positions: number[] = [], uvs: number[] = [], normals: number[] = [], colors: number[] = [];
        const color = new THREE.Color();
        for (let y = cy; y < Math.min(cy + 32, height); y++) for (let x = cx; x < Math.min(cx + 32, width); x++) {
          const actual = terrain[y * width + x];
          if (kind === "land" ? actual === "water" : actual !== kind) continue;
          const h = kind === "water" ? WATER_HEIGHT : 0;
          positions.push(x - .5, h, y - .5, x - .5, h, y + .5, x + .5, h, y + .5,
            x - .5, h, y - .5, x + .5, h, y + .5, x + .5, h, y - .5);
          if (kind === "land" && surface) {
            const [u0, v0, u1, v1] = surface.uvAt(x, y);
            uvs.push(u0, v1, u0, v0, u1, v0, u0, v1, u1, v0, u1, v1);
          } else uvs.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
          if (kind !== "land") color.setScalar(.94 + ((x * 13 + y * 7) % 9) * .008);
          for (let p = 0; p < 6; p++) { normals.push(0, 1, 0); if (kind !== "land") colors.push(color.r, color.g, color.b); }
        }
        if (!positions.length) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        if (kind !== "land") geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeBoundingSphere(); this.terrainGeometries.push(geometry);
        const material = kind === "water" ? this.waterSystem.material : kind === "land" ? this.terrainMaterial! : this.art.terrain[kind];
        material.vertexColors = kind !== "land" && kind !== "water";
        const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
        this.terrain.add(mesh); if (kind === "water") this.water.push(mesh);
      }
    }
    Object.assign(this.root.dataset, { terrainSource: surface ? "vox" : "fallback", terrainVersion: surface ? this.art.terrainTiles!.version : "",
      terrainFilter: surface ? "nearest" : "legacy", terrainBakes: String(this.terrainBakes), terrainChunks: String(this.terrain.children.length),
      terrainTextureBytes: String(surface?.stats.textureBytes ?? 0), terrainModules: String(surface?.stats.sourceModules ?? 0),
      terrainVariants: String(surface?.stats.paintedVariants ?? 0), terrainQuietedTiles: String(surface?.stats.quietedDirtTiles ?? 0),
      terrainBakeMs: this.terrainBakeMs.toFixed(2), terrainGeometry: "flat-top-surfaces", terrainElevation: "flat" });
  }
  private buildObjects() {
    for (const entry of this.objects.values()) this.scene.remove(entry.art.group);
    this.objects.clear(); this.lamps = [];
    for (const object of this.world.objects) {
      const art = this.art.createObject(object);
      const x = object.position.x + (object.width - 1) / 2, z = object.position.y + (object.height - 1) / 2;
      art.group.position.set(x, 0, z);
      art.group.userData.selection = { kind: "object", id: object.id } satisfies TileSelection;
      this.scene.add(art.group); this.objects.set(object.id, { object, art });
      art.lights.forEach((lamp, index) => this.lamps.push({ ...lamp, id: `${object.id}:${index}`, position: lamp.position.clone().add(art.group.position) }));
    }
    this.buildStaticBatches();
  }
  private buildStaticBatches() {
    for (const batch of this.batches) { this.scene.remove(batch.mesh); batch.mesh.dispose(); }
    this.batches = []; this.batchedIds.clear();
    this.voxelBuckets.replace(this.objects.values());
    this.giWorldDirty = true;
    const groups = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; sources: THREE.Mesh[]; x: number; z: number }>();
    for (const [id, { object, art }] of this.objects) {
      if (art.voxels) { this.batchedIds.add(id); continue; }
      if (!["tree", "rock", "fence", "decor", "sign"].includes(object.kind)) continue;
      this.batchedIds.add(id); this.scene.remove(art.group); art.group.visible = true; art.group.updateWorldMatrix(true, true);
      const cx = Math.floor(object.position.x / 32), cz = Math.floor(object.position.y / 32);
      art.group.traverse(child => {
        if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
        const key = `${cx}:${cz}:${child.geometry.uuid}:${child.material.uuid}`;
        let group = groups.get(key);
        if (!group) { group = { geometry: child.geometry, material: child.material, sources: [], x: cx * 32 + 16, z: cz * 32 + 16 }; groups.set(key, group); }
        group.sources.push(child);
      });
    }
    for (const group of groups.values()) {
      const mesh = new THREE.InstancedMesh(group.geometry, group.material, group.sources.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh); this.batches.push({ mesh, sources: group.sources, x: group.x, z: group.z });
    }
    this.updateStaticBatches();
  }
  private updateStaticBatches() {
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3(0, 0, 0);
    for (const { mesh, sources } of this.batches) {
      sources.forEach((source, index) => {
        source.updateWorldMatrix(true, false);
        let visible = true;
        for (let node: THREE.Object3D | null = source; node; node = node.parent) if (!node.visible) { visible = false; break; }
        matrix.copy(source.matrixWorld);
        if (!visible) matrix.scale(scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
  }
  private sync(time: number) {
    const { state, presentationEpoch = 0 } = this.props;
    if (this.observedState === state && this.observedEpoch === presentationEpoch) return;
    const resetPresentation = this.observedEpoch !== presentationEpoch;
    const tickChanged = this.observedState?.tick !== state.tick || resetPresentation;
    this.observedState = state; this.observedEpoch = presentationEpoch;
    if (tickChanged) this.observedAt = time;
    const world = worldForState(state);
    if (this.world !== world) {
      this.world = world; this.buildTerrain();
      const ids = new Set(world.objects.map(object => object.id));
      for (const [id, entry] of this.objects) if (!ids.has(id)) { this.scene.remove(entry.art.group); this.objects.delete(id); }
      for (const object of world.objects) {
        const known = this.objects.get(object.id);
        if (known) known.object = object;
        else {
          const art = this.art.createObject(object);
          art.group.position.set(object.position.x + (object.width - 1) / 2, 0, object.position.y + (object.height - 1) / 2);
          art.group.userData.selection = { kind: "object", id: object.id };
          this.scene.add(art.group); this.objects.set(object.id, { object, art });
        }
      }
      this.buildStaticBatches();
    }
    for (const actor of [state.player, ...state.npcs]) {
      let entry = this.people.get(actor.id);
      if (!entry) {
        const art = this.art.createActor(actor); art.group.userData.selection = { kind: "actor", id: actor.id };
        entry = { art }; this.people.set(actor.id, entry); this.scene.add(art.group);
      }
      entry.timeline = observeActorMotion(actor, state.tick, presentationEpoch, time, entry.timeline);
    }
    const aliveIds = new Set(state.enemies.map(e => e.id));
    for (const [id, group] of this.enemies) if (!aliveIds.has(id)) { this.scene.remove(group); this.enemies.delete(id); this.enemyMotion.delete(id); }
    for (const enemy of state.enemies) {
      let model = this.enemies.get(enemy.id);
      if (!model) { model = this.art.createEnemy(enemy.definitionId); model.userData.selection = { kind: "enemy", id: enemy.id }; this.enemies.set(enemy.id, model); this.scene.add(model); }
      const previous = resetPresentation ? undefined : this.enemyMotion.get(enemy.id);
      const moving = !!previous && Math.abs(previous.x - enemy.position.x) + Math.abs(previous.z - enemy.position.y) <= 2 && (previous.x !== enemy.position.x || previous.z !== enemy.position.y);
      this.enemyMotion.set(enemy.id, { x: enemy.position.x, z: enemy.position.y, fromX: moving ? model.position.x : enemy.position.x, fromZ: moving ? model.position.z : enemy.position.y, at: time, moving, health: enemy.health,
        hitUntil: previous && enemy.health > 0 && enemy.health < previous.health ? time + 180 : previous?.hitUntil ?? 0,
        deathUntil: previous && previous.health > 0 && enemy.health <= 0 ? time + 400 : previous?.deathUntil ?? 0 });
      model.visible = enemy.health > 0 || time < (this.enemyMotion.get(enemy.id)?.deathUntil ?? 0);
    }
    const dropIds = new Set(state.drops.map(d => d.id));
    for (const [id, model] of this.drops) if (!dropIds.has(id)) { this.scene.remove(model); this.drops.delete(id); }
    for (const drop of state.drops) {
      let group = this.drops.get(drop.id);
      if (!group) {
        group = new THREE.Group();
        // Shared capsule-like bag art comes from a small procedural decoration.
        const mesh = new THREE.Mesh(this.grave.geometry, this.grave.material);
        mesh.scale.set(1, .5, 1.5); mesh.position.y = .18; group.add(mesh); group.userData.selection = { kind: "drop", id: drop.id };
        this.drops.set(drop.id, group); this.scene.add(group);
      }
      group.position.set(drop.position.x, 0, drop.position.y);
    }
    this.grave.visible = !!state.grave;
    if (state.grave) this.grave.position.set(state.grave.position.x, .35, state.grave.position.y);
    for (const { object, art } of this.objects.values()) {
      const available = state.resources[object.id]?.available !== false;
      if (art.available) art.available.visible = available;
      if (art.depleted) art.depleted.visible = !available;
      if (art.gate) art.gate.rotation.y = state.gates[object.id] === false ? 0 : -Math.PI / 2;
    }
    this.depletedForGI = Object.values(state.resources).filter(resource => !resource.available).map(resource => resource.objectId).sort();
    if (this.giWorldDirty) {
      this.gi.setWorld(captureGIWorld(this.objects.values(), { width: this.world.width, height: this.world.height,
        terrain: this.terrainSurface?.presentationTerrain ?? this.world.terrain }, this.art.terrain));
      this.giWorldDirty = false;
    }
    this.updateStaticBatches();
    const points = (this.props.previewRoute ?? []).map(p => new THREE.Vector3(p.x, .05, p.y));
    this.route.geometry.dispose(); this.route.geometry = new THREE.BufferGeometry().setFromPoints(points);
    const observed = consumeEffects(state, presentationEpoch, this.effectCursor); this.effectCursor = observed.cursor;
    if (observed.reset) { this.clearEffects(); this.pixelReactions.clear(); this.pixelStrikes.clear(); }
    for (const effect of observed.effects) {
      if (effect.kind === "hit") { const attacker = this.enemies.get(effect.actorId); if (attacker) this.pixelStrikes.set(attacker, time); }
      if (effect.kind === "hit" || effect.kind === "defeat") {
        const victim = effect.targetId === "player" ? this.people.get(0)?.art.group : this.enemies.get(effect.targetId ?? "");
        if (victim) this.pixelReactions.set(victim, { frame: effect.kind === "defeat" ? 9 : 8, until: time + (effect.kind === "defeat" ? 500 : 180) });
      }
      if ((effect.kind !== "projectile" && effect.kind !== "hit") || !effect.targetPosition) continue;
      const group = new THREE.Group(), projectile = effect.kind === "projectile";
      const mesh = new THREE.Mesh(this.grave.geometry, this.playerRing.material);
      mesh.scale.set(projectile ? .1 : .4, projectile ? .1 : .04, projectile ? .8 : .7); group.add(mesh);
      this.scene.add(group);
      this.transients.push({ group, projectile, start: time, end: time + (projectile ? 400 : 220), from: new THREE.Vector3(effect.position.x, 1, effect.position.y), to: new THREE.Vector3(effect.targetPosition.x, projectile ? .9 : .8, effect.targetPosition.y) });
    }
  }
  private clearEffects() { for (const effect of this.transients) this.scene.remove(effect.group); this.transients = []; }
  private pose(actor: ActorState, entry: Person, time: number) {
    const motion = sampleActorMotion(entry.timeline!, time, this.reducedMotion), { art } = entry;
    const oldX = art.group.position.x, oldZ = art.group.position.z;
    art.group.position.set(motion.position.x, 0, motion.position.y);
    const dx = motion.position.x - oldX, dz = motion.position.y - oldZ;
    const target = this.objects.get(actor.action?.targetId ?? "")?.object;
    const stroke = workStroke(actor, this.props.state.tick, time - this.observedAt, target, motion);
    const pose = actionPose(actor, target);
    if (this.pixelUnits.has(art.group)) {
      const reaction = this.pixelReactions.get(art.group);
      const activeReaction = reaction && time < reaction.until ? reaction.frame : 0;
      const native = samplePixelUnitPose({ moving: motion.moving, gaitDistance: motion.gaitDistance, workPhase: stroke?.phase, reducedMotion: this.reducedMotion, hit: activeReaction === 8, defeated: activeReaction === 9 });
      const frame = native.frame;
      const toward = motion.moving ? dx * this.camera.matrixWorld.elements[0] + dz * this.camera.matrixWorld.elements[2] : target ? (target.position.x - actor.position.x) * this.camera.matrixWorld.elements[0] + (target.position.y - actor.position.y) * this.camera.matrixWorld.elements[2] : 0;
      if (Math.abs(toward) > .001) entry.flipX = toward < 0;
      this.pixelUnits.frame(art.group, frame, 0, undefined, heldToolForActor(actor, stroke && !motion.moving ? pose : undefined), entry.flipX ?? false);
      if (actor.id === 0) { this.root.dataset.characterRig = "billboard"; this.root.dataset.characterClip = motion.moving ? "walk" : stroke ? "work" : "idle"; this.root.dataset.spriteFrame = String(frame); this.root.dataset.spriteFlipX = String(entry.flipX ?? false); }
    }
    if (actor.id === 0) {
      this.playerRing.position.set(motion.position.x, .035, motion.position.y);
      const footstep = observeFootstep(this.footstepCursor, motion, entry.timeline!, this.props.presentationEpoch ?? 0);
      this.footstepCursor = footstep.cursor;
      if (footstep.mode) this.props.onFootstep?.(footstep.mode);
      const contact = observeWorkContact(this.workCursor, stroke, this.props.presentationEpoch ?? 0);
      this.workCursor = contact.cursor;
      if (contact.contact && stroke) this.props.onWorkContact?.(stroke.pose);
    }
  }
  private frame(time: number) {
    const cpuStart = performance.now();
    this.frameMeter.sample(time);
    this.sync(time);
    const { state, camera: view, selection, lighting, shadows, cameraMode } = this.props;
    const elapsed = this.previousTime ? time - this.previousTime : 16.7;
    this.previousTime = time;
    for (const actor of [state.player, ...state.npcs]) { const person = this.people.get(actor.id); if (person?.timeline) this.pose(actor, person, time); }
    const player = this.people.get(0)?.art.group.position;
    const aspect = this.width / this.height;
    const span = view.overview ? Math.max(this.world.height * 1.05, this.world.width / aspect) : gameplaySpan(view.zoom, aspect);
    this.target.set(view.overview ? this.world.width / 2 : view.follow && player ? player.x : view.x, 0,
      view.overview ? this.world.height / 2 : view.follow && player ? player.z : view.y);
    const usePerspective = cameraMode === "perspective" && !view.overview;
    this.camera = usePerspective ? this.perspectiveCamera : this.orthographicCamera;
    const direction = temp.set(32, 37, 45).normalize();
    const distance = usePerspective ? span / (2 * Math.tan(THREE.MathUtils.degToRad(this.perspectiveCamera.fov) / 2)) : Math.max(1, span / 35) * 66.5;
    this.camera.position.copy(this.target).addScaledVector(direction, distance);
    this.camera.position.y += .4;
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.left = -span * aspect / 2; this.camera.right = span * aspect / 2;
      this.camera.top = span / 2; this.camera.bottom = -span / 2;
    } else this.camera.aspect = aspect;
    this.camera.far = Math.max(650, distance + this.world.width + this.world.height);
    this.camera.updateProjectionMatrix();
    // A long-lens20degree view gives subtle depth without distorting tile readability.
    this.camera.lookAt(this.target.x, .4, this.target.z); this.camera.updateMatrixWorld();
    this.root.dataset.billboardYaw = this.pixelUnits.faceCamera(this.camera, this.props.visual?.spriteNormalStrength ?? .35).toFixed(4);
    this.root.dataset.billboardCount = String(this.pixelUnits.count);
    this.root.dataset.spriteNormalStrength = String(this.props.visual?.spriteNormalStrength ?? .35);
    for (const enemy of state.enemies) {
      const group = this.enemies.get(enemy.id), motion = this.enemyMotion.get(enemy.id); if (!group || !motion) continue;
      const fraction = this.reducedMotion ? 1 : clamp((time - motion.at) / 600, 0, 1);
      group.position.set(motion.fromX + (motion.x - motion.fromX) * fraction, 0, motion.fromZ + (motion.z - motion.fromZ) * fraction);
      const dead = enemy.health <= 0; group.visible = !dead || time < motion.deathUntil;
      const strikeAge = time - (this.pixelStrikes.get(group) ?? -Infinity);
      const attackFrame = strikeAge >= 0 && strikeAge < 320 ? strikeAge < 140 ? 6 : 7 : enemy.engagedUntil > state.tick && enemy.cooldown <= 1 ? 5 : 0;
      const frame = this.reducedMotion ? dead ? 9 : 0 : dead ? 9 : time < motion.hitUntil ? 8 : motion.moving && fraction < 1 ? 1 + Math.floor(fraction * 4) % 4 : attackFrame;
      const facing = motion.moving ? (motion.x - motion.fromX) * this.camera.matrixWorld.elements[0] + (motion.z - motion.fromZ) * this.camera.matrixWorld.elements[2] : enemy.engagedUntil > state.tick ? (state.player.position.x - motion.x) * this.camera.matrixWorld.elements[0] + (state.player.position.y - motion.z) * this.camera.matrixWorld.elements[2] : 0;
      const flip = Math.abs(facing) > .001 ? facing < 0 : group.userData.spriteFlip === true;
      this.pixelUnits.frame(group, frame, 0, undefined, heldToolForEnemy(enemy.definitionId), flip);
    }
    const visual = this.props.visual ?? DEFAULT_VISUAL_SETTINGS;
    this.renderer.toneMappingExposure = visual.exposure;
    this.rig.setVisual(visual); this.rig.setPreset(lighting); this.rig.setShadows(shadows && !view.overview);
    this.renderer.shadowMap.enabled = shadows && !view.overview;
    this.rig.update(this.lamps, this.target, time, view.overview, this.camera.position.distanceTo(this.target));
    this.sky.update(time, lighting, visual, this.reducedMotion);
    this.grid.visible = view.grid && !view.overview;
    this.grid.position.set(Math.round(this.target.x), 0, Math.round(this.target.z));
    const selected = this.selectionPosition(selection);
    this.ring.visible = !!selected;
    if (selected) { this.ring.position.set(selected.x, .04, selected.z); this.ring.scale.setScalar(selection?.kind === "object" ? 1.4 : 1.1); }
    // Explicit group visibility also bounds shadow work and scene traversal far from the camera.
    if (time - this.visibilityAt > 250) {
      const radius = Math.max(28, span * Math.max(1, aspect) * .9);
      for (const { object, art } of this.objects.values()) {
        if (!this.batchedIds.has(object.id)) art.group.visible = view.overview || Math.hypot(art.group.position.x - this.target.x, art.group.position.z - this.target.z) < radius + 12;
        if (art.roof) {
          const inside = player && player.x >= object.position.x - .6 && player.x <= object.position.x + object.width - .4 && player.z >= object.position.y - .6 && player.z <= object.position.y + object.height - .4;
          art.roof.visible = !object.cutaway || (!inside && !(selection?.kind === "object" && selection.id === object.id));
          if (art.facade) art.facade.visible = art.roof.visible;
        }
      }
      for (const batch of this.batches) batch.mesh.visible = view.overview || Math.hypot(batch.x - this.target.x, batch.z - this.target.z) < radius + 35;
      this.visibilityAt = time;
    }
    for (const effect of this.transients) {
      const t = clamp((time - effect.start) / (effect.end - effect.start), 0, 1);
      effect.group.position.copy(effect.from).lerp(effect.to, t);
      if (effect.projectile) { effect.group.position.y += Math.sin(t * Math.PI) * .6; effect.group.lookAt(effect.to); }
      effect.group.visible = time < effect.end;
    }
    this.transients = this.transients.filter(effect => { if (time < effect.end) return true; this.scene.remove(effect.group); return false; });
    this.mist.position.set(this.target.x + (this.reducedMotion ? 0 : Math.sin(time * .00007) * 2), 0, this.target.z);
    this.mist.visible = !view.overview && lighting !== "day";
    const voxelStart = performance.now();
    this.foliage.update(time, this.target, visual, view.overview, this.reducedMotion);
    this.voxelBuckets.setAO(this.props.ao !== false, visual.aoStrength, visual.aoDistance);
    this.voxelBuckets.update(this.camera, this.height);
    const giStart = performance.now();
    this.gi.decorate(this.scene);
    this.gi.update(this.target, lighting, this.lamps, this.depletedForGI, this.props.gi !== false, this.props.ao !== false, view.overview, visual);
    const renderStart = performance.now();
    this.renderer.info.reset();
    this.gpuMeter.begin();
    this.waterSystem.update(this.renderer, this.scene, this.camera, this.water,
      [this.ring, this.playerRing, this.route, this.grid, this.mist], time, lighting, visual, view.overview);
    this.renderer.render(this.scene, this.camera);
    this.gpuMeter.end();
    const hitStart = performance.now();
    this.updateHitPositions(time);
    const costs = this.frameCosts;
    costs.updates += voxelStart - cpuStart; costs.voxels += giStart - voxelStart;
    costs.gi += renderStart - giStart; costs.render += hitStart - renderStart;
    costs.hits += performance.now() - hitStart; costs.samples++;
    if (time - this.metricsAt >= 500) {
      const timing = this.frameMeter.read();
      const indicator = this.root.querySelector<HTMLElement>('[data-testid="fps-indicator"]');
      if (indicator && timing.samples) {
        indicator.textContent = `${Math.round(timing.fps)} FPS · ${timing.meanMs.toFixed(1)} ms`;
        indicator.title = `Recent ${timing.samples} frames · p95 ${timing.p95Ms.toFixed(1)} ms${this.gpuMeter.milliseconds === null ? "" : ` · GPU render ${this.gpuMeter.milliseconds.toFixed(2)} ms`}`;
      }
      const settingsCounter = this.root.querySelector<HTMLElement>("[data-visual-performance]");
      if (settingsCounter && timing.samples) settingsCounter.textContent = `${Math.round(timing.fps)} FPS · ${timing.meanMs.toFixed(1)} ms`;
      Object.assign(this.root.dataset, {
        cpuUpdatesMs: (costs.updates / costs.samples).toFixed(3), cpuVoxelsMs: (costs.voxels / costs.samples).toFixed(3),
        cpuGiMs: (costs.gi / costs.samples).toFixed(3), cpuRenderMs: (costs.render / costs.samples).toFixed(3), cpuHitsMs: (costs.hits / costs.samples).toFixed(3),
        fps: timing.fps.toFixed(1), frameMeanMs: timing.meanMs.toFixed(2), frameP95Ms: timing.p95Ms.toFixed(2), gpuMs: this.gpuMeter.milliseconds?.toFixed(3) ?? "unavailable",
        activeLights: String(this.rig.activeCount), shadowLights: String(this.rig.shadowCount),
        drawCalls: String(this.renderer.info.render.calls), triangles: String(this.renderer.info.render.triangles),
        waterReflectionState: this.waterSystem.stats.state, waterReflectionPasses: String(this.waterSystem.stats.reflectionPasses),
        skyEnabled: String(visual.skyEnabled), cloudCoverage: String(visual.cloudCoverage), cloudTime: this.sky.stats.cloudTime.toFixed(3),
        foliagePlants: String(this.foliage.stats.plants), foliageVisible: String(this.foliage.stats.visiblePlants),
        foliageUploads: String(this.foliage.stats.uploads), windTime: this.foliage.stats.windTime.toFixed(3),
        waterReflectionMs: this.waterSystem.stats.reflectionMs.toFixed(3),
        waterReflectionSize: `${this.waterSystem.stats.reflectionWidth}x${this.waterSystem.stats.reflectionHeight}`,
        frameMs: elapsed.toFixed(2), cameraX: this.target.x.toFixed(2), cameraY: this.target.z.toFixed(2),
        cameraSpan: span.toFixed(2), cameraDistance: distance.toFixed(2), cameraZoom: clampGameplayZoom(view.zoom).toFixed(4),
        cameraMode: usePerspective ? "perspective" : "orthographic",
        voxelBuckets: String(this.voxelBuckets.stats.visibleBuckets), voxelInstances: String(this.voxelBuckets.stats.instances),
        voxelLods: `${this.voxelBuckets.stats.lod0},${this.voxelBuckets.stats.lod1},${this.voxelBuckets.stats.lod2},${this.voxelBuckets.stats.lod3},${this.voxelBuckets.stats.lod4}`, voxelUploads: String(this.voxelBuckets.stats.uploads),
        voxelBudgetExceeded: String(this.voxelBuckets.stats.budgetExceeded),
        voxelParentBuckets: String(this.voxelBuckets.stats.parentBuckets), voxelChildBuckets: String(this.voxelBuckets.stats.childBuckets),
        voxelResidentBuckets: String(this.voxelBuckets.stats.residentBuckets), voxelResidentCells: String(this.voxelBuckets.stats.residentCells),
        giState: this.gi.stats.state, giVersion: String(this.gi.stats.version), giApplied: String(this.gi.stats.appliedVersion),
        giSolveMs: this.gi.stats.totalMs.toFixed(2), giTextureBytes: String(this.gi.stats.textureBytes ?? 0),
        giProbes: String(this.gi.stats.validProbes ?? 0), giEnabled: String(this.props.gi !== false), aoEnabled: String(this.props.ao !== false),
        giLighting: this.gi.stats.appliedPreset ?? "pending",
        giDepleted: String(this.gi.stats.depletedCount ?? 0),
        visualSettings: JSON.stringify(visual), sunPower: this.rig.sun.intensity.toFixed(3), exposure: this.renderer.toneMappingExposure.toFixed(2),
        shadowMapSize: String(this.rig.sun.shadow.mapSize.x), fogActive: String(this.scene.fog !== null),
      });
      this.frameCosts = { updates: 0, voxels: 0, gi: 0, render: 0, hits: 0, samples: 0 };
      this.metricsAt = time;
    }
  }
  private selectionPosition(selection: TileSelection | null): THREE.Vector3 | null {
    if (!selection) return null;
    if (selection.kind === "object") return this.objects.get(selection.id)?.art.group.position ?? null;
    if (selection.kind === "actor") return this.people.get(selection.id)?.art.group.position ?? null;
    if (selection.kind === "enemy") return this.enemies.get(selection.id)?.position ?? null;
    if (selection.kind === "drop") return this.drops.get(selection.id)?.position ?? null;
    if (selection.kind === "grave") return this.props.state.grave ? this.grave.position : null;
    if (selection.kind === "tile") return temp.set(selection.position.x, 0, selection.position.y);
    return null;
  }
  private updateHitPositions(time: number) {
    for (const [key, element] of this.hits) {
      let position: THREE.Vector3 | undefined, height = 0;
      if (key.startsWith("object-")) { const object = this.objects.get(key.slice(7)); position = object?.art.group.position; height = object?.object.kind === "tree" ? 1.1 : .4; }
      else if (key.startsWith("actor-")) { position = this.people.get(Number(key.slice(6)))?.art.group.position; height = 1; }
      else if (key.startsWith("enemy-")) { const enemy = this.enemies.get(key.slice(6)); if (enemy?.visible) position = enemy.position; height = .6; }
      else if (key.startsWith("drop-")) position = this.drops.get(key.slice(5))?.position;
      else if (key === "grave" && this.props.state.grave) position = this.grave.position;
      else if (key.startsWith("feedback-")) {
        const floater = this.props.feedback?.find(f => `feedback-${f.id}` === key);
        if (floater) { position = temp.set(floater.position.x, 1.8 + Math.max(0, time - floater.startedAt) / 1800, floater.position.y); height = 0; }
      }
      if (!position) { element.hidden = true; continue; }
      const projected = position === temp ? temp : temp.copy(position);
      projected.y += height; projected.project(this.camera);
      const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.12 && Math.abs(projected.y) < 1.12;
      element.hidden = !visible;
      if (visible) { element.style.left = `${(projected.x + 1) * this.width / 2}px`; element.style.top = `${(1 - projected.y) * this.height / 2}px`; }
    }
  }
  private groundAt(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, point) ? point : null;
  }
  private bindInput() {
    const pointers = new Map<number, { x: number; y: number }>();
    let startX = 0, startY = 0, dragged = false, pinched = false, pinch = 0;
    let dragAnchor: THREE.Vector3 | null = null;
    let downSelection: TileSelection | null = null;
    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest(".three-light-controls, .three-visual-settings, .three-fallback")) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        startX = event.clientX; startY = event.clientY; dragged = false; pinched = false;
        dragAnchor = this.groundAt(startX, startY);
        const hit = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-three-selection]");
        downSelection = hit ? JSON.parse(hit.dataset.threeSelection!) as TileSelection : null;
      }
      else { const p = [...pointers.values()]; pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); pinched = true; dragged = true; }
      this.root.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size > 1) {
        const p = [...pointers.values()], distance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (pinch > 0) this.props.onCamera({ ...this.props.camera, zoom: clampGameplayZoom(this.props.camera.zoom * distance / pinch), overview: false });
        pinch = distance; return;
      }
      if (pinched) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 6) dragged = true;
      if (dragged) {
        const point = this.groundAt(event.clientX, event.clientY);
        // Keep the grabbed world point under the pointer. Incremental pointer
        // deltas lose movement when several events share the last rendered target.
        if (dragAnchor && point) this.props.onCamera({ ...this.props.camera, x: clamp(this.target.x + dragAnchor.x - point.x, 0, this.world.width - 1), y: clamp(this.target.z + dragAnchor.z - point.z, 0, this.world.height - 1), follow: false, overview: false });
      }
    };
    const up = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (this.root.hasPointerCapture(event.pointerId)) this.root.releasePointerCapture(event.pointerId);
      if (!dragged && !pinched && event.type !== "pointercancel") {
        if (downSelection) this.props.onSelect(downSelection);
        else {
          const point = this.groundAt(event.clientX, event.clientY);
          if (point) this.props.onSelect({ kind: "tile", position: { x: clamp(Math.round(point.x), 0, this.world.width - 1), y: clamp(Math.round(point.z), 0, this.world.height - 1), worldId: this.world.id, plane: 0 } });
        }
      }
    };
    const wheel = (event: WheelEvent) => { if ((event.target as HTMLElement).closest(".three-light-controls, .three-visual-settings")) return; event.preventDefault(); this.props.onCamera({ ...this.props.camera, zoom: clampGameplayZoom(this.props.camera.zoom * Math.exp(-event.deltaY * .0015)), overview: false }); };
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).tagName !== "CANVAS") return;
      const view = this.props.camera;
      const steps: Record<string, [number, number]> = { ArrowLeft: [-2, 1], ArrowRight: [2, -1], ArrowUp: [-1, -2], ArrowDown: [1, 2] };
      if (steps[event.key]) { event.preventDefault(); const [dx, dz] = steps[event.key]; this.props.onCamera({ ...view, x: clamp(this.target.x + dx, 0, this.world.width - 1), y: clamp(this.target.z + dz, 0, this.world.height - 1), follow: false, overview: false }); }
      else if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); this.props.onCamera({ ...view, zoom: clampGameplayZoom(view.zoom * (event.key === "-" ? .8 : 1.25)), overview: false }); }
    };
    this.root.addEventListener("pointerdown", down); this.root.addEventListener("pointermove", move);
    this.root.addEventListener("pointerup", up); this.root.addEventListener("pointercancel", up);
    this.root.addEventListener("wheel", wheel, { passive: false }); this.root.addEventListener("keydown", key);
    return () => { this.root.removeEventListener("pointerdown", down); this.root.removeEventListener("pointermove", move); this.root.removeEventListener("pointerup", up); this.root.removeEventListener("pointercancel", up); this.root.removeEventListener("wheel", wheel); this.root.removeEventListener("keydown", key); };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.raf); this.resizeObserver.disconnect(); this.inputDispose();
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    window.removeEventListener("resize", this.viewportChanged);
    this.clearEffects(); this.rig.dispose();
    this.sky.dispose();
    this.foliage.dispose();
    this.gi.dispose();
    this.gpuMeter.dispose();
    this.waterSystem.dispose();
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.voxelBuckets.dispose();
    this.terrainSurface?.dispose(); this.terrainMaterial?.dispose();
    this.batches.forEach(batch => batch.mesh.dispose()); this.batches = [];
    this.art.dispose();
    this.terrainGeometries.forEach(g => g.dispose()); this.ownGeometries.forEach(g => g.dispose());
    this.route.geometry.dispose(); this.ownMaterials.forEach(m => m.dispose()); this.ownTextures.forEach(t => t.dispose());
    this.scene.clear(); this.renderer.dispose();
    // React StrictMode immediately mounts a new renderer on the same canvas. Losing
    // its context during that probe would also break the new renderer.
    const renderer = this.renderer, canvas = this.canvas;
    queueMicrotask(() => { if (!canvas.isConnected) renderer.forceContextLoss(); });
  }
}
