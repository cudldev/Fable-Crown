import {
  Group, Material, Mesh, MeshLambertMaterial, NearestFilter, NearestMipmapNearestFilter,
  Texture, Vector3, Matrix4, type BufferGeometry, type BufferAttribute, type Object3D, type MeshStandardMaterial,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneHierarchy } from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createArtLibrary } from "./art";
import type { ActorArt, ArtLibrary, LightAnchor, ObjectArt } from "./contracts";
import type { ActorState, WorldObject } from "../../rpg/types";

interface AssetSpec { id: string; url: string; footprint?: [number, number]; requiredNodes: string[] }
interface ModelTemplate { root: Group; spec: AssetSpec }
export interface ProductionArtResult {
  library: ArtLibrary;
  loadedIds: string[];
  warnings: string[];
  source: "blender" | "procedural";
}
const supported = new Set(["bank", "forge", "tree", "alden", "anvil", "crate", "lantern"]);
const actorNodes = ["body", "leftArm", "rightArm", "leftLeg", "rightLeg"];

/** Reject remote/parent paths: optional production assets always come from the static game origin. */
export function productionAssetUrl(filename: string, base = new URL(`${import.meta.env.BASE_URL}art3d/`, location.href)) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.glb$/.test(filename)) throw Error("An asset filename is not a local GLB basename.");
  const url = new URL(filename, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw Error("An asset URL is outside the local art directory.");
  return url.href;
}
function manifestAssets(value: unknown): AssetSpec[] {
  if (!value || typeof value !== "object" || !("assets" in value) || !Array.isArray(value.assets)) throw Error("The 3D art manifest is invalid.");
  const ids = new Set<string>();
  return value.assets.filter((entry: unknown): entry is Record<string, unknown> => !!entry && typeof entry === "object").map(entry => {
    if (typeof entry.id !== "string" || typeof entry.url !== "string" || !supported.has(entry.id) || ids.has(entry.id)) throw Error("The 3D art manifest contains an invalid or repeated asset.");
    ids.add(entry.id);
    const required = entry.requiredNodes === undefined ? [] : entry.requiredNodes;
    if (!Array.isArray(required) || !required.every(node => typeof node === "string" && node.length > 0)) throw Error("The 3D art node contract is invalid.");
    const footprint = entry.footprint;
    if (footprint !== undefined && (!Array.isArray(footprint) || footprint.length !== 2 || !footprint.every(v => typeof v === "number" && Number.isFinite(v) && v > 0))) throw Error("The 3D art footprint is invalid.");
    return { id: entry.id, url: entry.url, footprint: footprint as [number, number] | undefined, requiredNodes: required as string[] };
  });
}

/** Blender exports are self-contained GLBs; reject resource URIs that could issue extra requests. */
export function validateEmbeddedGlb(buffer: ArrayBuffer) {
  if (buffer.byteLength < 20) throw Error("The production model is not a complete GLB.");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(12 + 4, true) !== 0x4e4f534a) throw Error("The production model is not a glTF2 binary.");
  const length = view.getUint32(12, true);
  if (20 + length > buffer.byteLength) throw Error("The production model JSON is truncated.");
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))) as { buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[] };
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (resource.uri !== undefined && (typeof resource.uri !== "string" || !resource.uri.startsWith("data:"))) throw Error("Production models must embed their textures and buffers.");
  }
}

/** Wrap a transform node without changing its authored local/world transform. */
function groupNode(root: Object3D, name: string): Group | undefined {
  const node = root.getObjectByName(name);
  if (!node) return undefined;
  if (node instanceof Group) return node;
  const parent = node.parent;
  if (!parent) return undefined;
  const group = new Group(); group.name = name;
  group.position.copy(node.position); group.quaternion.copy(node.quaternion); group.scale.copy(node.scale);
  parent.add(group); parent.remove(node);
  node.name = `${name}-geometry`; node.position.set(0, 0, 0); node.quaternion.identity(); node.scale.set(1, 1, 1); group.add(node);
  return group;
}

/** Give articulated pivots Y-up axes even when a Blender export retains a Z-up root conversion. */
function animationPivot(root: Group, name: string, parent: Group): Group | undefined {
  const previous = root.getObjectByName(name); if (!previous) return undefined;
  previous.updateWorldMatrix(true, true); parent.updateWorldMatrix(true, false);
  const group = new Group(); group.name = name; group.visible = previous.visible;
  group.position.copy(parent.worldToLocal(previous.getWorldPosition(new Vector3())));
  previous.name = `${name}-source`;
  parent.add(group); group.updateWorldMatrix(true, false);
  // attach preserves each mesh's world appearance while removing the converted pivot axes.
  for (const child of [...previous.children]) group.attach(child);
  previous.removeFromParent(); return group;
}

function lightAnchors(root: Group): LightAnchor[] {
  const lights: LightAnchor[] = []; root.updateWorldMatrix(true, true);
  root.traverse(node => {
    if (!node.name.startsWith("light-")) return;
    const data = node.userData;
    const kind = ["window", "forge", "lantern"].includes(data.kind) ? data.kind as LightAnchor["kind"] : node.name.startsWith("light-forge") ? "forge" : "window";
    const color = typeof data.color === "string" && /^[0-9a-fA-F]{6}$/.test(data.color) ? Number.parseInt(data.color, 16) : kind === "forge" ? 0xff9d50 : 0xffce8b;
    const authoredIntensity = typeof data.intensity === "number" && Number.isFinite(data.intensity) ? Math.max(0, Math.min(60, data.intensity)) : 5;
    lights.push({ position: node.getWorldPosition(new Vector3()), kind, color,
      // Close wall/glass markers need a low gain with inverse-square attenuation.
      intensity: authoredIntensity * (kind === "forge" ? .5 : .2),
      distance: typeof data.distance === "number" && Number.isFinite(data.distance) ? Math.max(.1, Math.min(24, data.distance)) : 4 });
  });
  return lights;
}

/** Collapse static geometry within each independently animated/hidden part, never across pivots. */
export function mergeModelMeshes(root: Group, articulated: boolean, owned: Set<BufferGeometry>) {
  root.updateWorldMatrix(true, true);
  const groups = new Map<string, { parent: Object3D; material: Material; meshes: Mesh[] }>();
  root.traverse(node => {
    if (!(node instanceof Mesh) || Array.isArray(node.material) || "isSkinnedMesh" in node || Object.keys(node.geometry.morphAttributes).length) return;
    let parent: Object3D = root;
    for (let ancestor: Object3D | null = node; ancestor && ancestor !== root; ancestor = ancestor.parent) {
      if (articulated && (ancestor.name === "cape" || ancestor.name === "tool" || ancestor.name === "toolGroup")) return;
      if ((articulated && actorNodes.includes(ancestor.name)) || (!articulated && ["roof", "facade", "available", "depleted"].includes(ancestor.name))) { parent = ancestor; break; }
    }
    const attributes = Object.keys(node.geometry.attributes).map(name => {
      const attribute = node.geometry.getAttribute(name) as BufferAttribute;
      return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`;
    }).sort().join("|");
    const key = `${parent.uuid}:${node.material.uuid}:${attributes}`;
    let entry = groups.get(key);
    if (!entry) { entry = { parent, material: node.material, meshes: [] }; groups.set(key, entry); }
    entry.meshes.push(node);
  });
  for (const { parent, material, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    parent.updateWorldMatrix(true, false);
    const inverse = new Matrix4().copy(parent.matrixWorld).invert();
    const transformed = meshes.map(mesh => {
      mesh.updateWorldMatrix(true, false);
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)); return geometry;
    });
    const geometry = mergeGeometries(transformed, false);
    transformed.forEach(value => value.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); owned.add(geometry);
    const merged = new Mesh(geometry, material); merged.name = `merged-${parent.name || "body"}-${material.name || "atlas"}`;
    merged.castShadow = merged.receiveShadow = true; parent.add(merged);
    for (const mesh of meshes) {
      // Light sockets can be children of a glass mesh; keep their world transform and metadata.
      for (const child of [...mesh.children]) parent.attach(child);
      mesh.removeFromParent();
    }
  }
}

/** Load once per renderer lifetime; cloned instances share all GLB meshes, materials and atlases. */
export async function loadProductionArt(signal: AbortSignal): Promise<ProductionArtResult> {
  const fallback = createArtLibrary(), templates = new Map<string, ModelTemplate>();
  const geometry = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
  const instances = new Set<Group>();
  const converted = new Map<Material, MeshLambertMaterial>();
  const emissiveVariants = new Map<string, MeshLambertMaterial>();
  const warnings: string[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true; fallback.dispose();
    const bitmaps = new Set<ImageBitmap>();
    geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
    textures.forEach(value => { value.dispose(); const image = value.source.data; if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) bitmaps.add(image); });
    bitmaps.forEach(image => image.close());
    instances.forEach(group => group.traverse(node => { if ("skeleton" in node && typeof node.skeleton === "object" && node.skeleton && "dispose" in node.skeleton) (node.skeleton as { dispose(): void }).dispose(); }));
    templates.clear(); instances.clear();
  };
  function matte(original: Material) {
    let material = converted.get(original); if (material) return material;
    const source = original as MeshStandardMaterial;
    // Preserve source textures for their complete lifetime, including unused PBR maps.
    for (const property of Object.values(original)) if (property instanceof Texture) textures.add(property);
    material = new MeshLambertMaterial({
      color: source.color ?? 0xffffff, map: source.map ?? null,
      emissive: source.emissive ?? 0x000000, emissiveMap: source.emissiveMap ?? null,
      emissiveIntensity: source.emissiveIntensity ?? 1,
      opacity: original.opacity, transparent: original.transparent,
      alphaTest: original.alphaTest, side: original.side, vertexColors: source.vertexColors,
      flatShading: true, depthWrite: original.depthWrite,
    });
    material.name = original.name;
    for (const texture of [material.map, material.emissiveMap]) if (texture) {
      texture.magFilter = NearestFilter; texture.minFilter = NearestMipmapNearestFilter;
      texture.generateMipmaps = true; texture.anisotropy = 1; texture.needsUpdate = true;
    }
    materials.add(original); materials.add(material); converted.set(original, material); return material;
  }
  function surfaceMaterial(original: Material, name: string) {
    const base = matte(original);
    const kind = name.startsWith("window-glass") || name.startsWith("lantern-glass") ? "window" : ["live-coals", "flame", "hot-iron"].some(prefix => name.startsWith(prefix)) ? "forge" : null;
    if (!kind) return base;
    const key = `${base.uuid}:${kind}`;
    let variant = emissiveVariants.get(key);
    if (!variant) {
      variant = base.clone(); variant.name = `${base.name}-${kind}-glow`;
      variant.emissive.setHex(kind === "window" ? 0xffb45f : 0xff7e32);
      variant.emissiveIntensity = kind === "window" ? .4 : .65;
      variant.emissiveMap = base.map; materials.add(variant); emissiveVariants.set(key, variant);
    }
    return variant;
  }
  try {
    const directory = new URL(`${import.meta.env.BASE_URL}art3d/`, location.href);
    const response = await fetch(new URL("manifest.json", directory), { signal });
    if (!response.ok) throw Error("Production art is not installed; using procedural test models.");
    const specs = manifestAssets(await response.json());
    const loader = new GLTFLoader();
    // Sequential bounded loads simplify abort/disposal and avoid a burst of decoded atlases.
    for (const spec of specs) {
      if (signal.aborted) throw new DOMException("Renderer startup cancelled", "AbortError");
      try {
        const url = productionAssetUrl(spec.url, directory);
        const file = await fetch(url, { signal });
        if (!file.ok) throw Error(`${spec.id}: GLB is not available.`);
        const buffer = await file.arrayBuffer(); validateEmbeddedGlb(buffer);
        const gltf = await loader.parseAsync(buffer, directory.href);
        const root = new Group(); root.name = `production-${spec.id}`; root.add(gltf.scene);
        const remove: Object3D[] = [];
        root.traverse(node => {
          if ("isLight" in node || "isCamera" in node) remove.push(node);
          if (!(node instanceof Mesh)) return;
          geometry.add(node.geometry);
          node.material = Array.isArray(node.material) ? node.material.map(material => surfaceMaterial(material, node.name)) : surfaceMaterial(node.material, node.name);
          node.castShadow = node.receiveShadow = true;
        });
        remove.forEach(node => node.removeFromParent());
        const required = [...new Set([...spec.requiredNodes, ...(spec.id === "alden" ? actorNodes : [])])];
        if (!root.getObjectByProperty("isMesh", true)) throw Error(`${spec.id}: GLB contains no meshes.`);
        for (const name of required) if (!root.getObjectByName(name)) throw Error(`${spec.id}: missing authored node ${name}.`);
        for (const name of [...actorNodes, "roof", "facade", "available", "depleted", "toolGroup", "tool"]) groupNode(root, name);
        if (spec.id === "alden") {
          const body = animationPivot(root, "body", root)!;
          for (const name of ["leftArm", "rightArm", "leftLeg", "rightLeg"]) animationPivot(root, name, body);
          const rightArm = root.getObjectByName("rightArm") as Group;
          const toolName = root.getObjectByName("toolGroup") ? "toolGroup" : root.getObjectByName("tool") ? "tool" : null;
          if (toolName) animationPivot(root, toolName, rightArm);
        }
        mergeModelMeshes(root, spec.id === "alden", geometry);
        templates.set(spec.id, { root, spec });
      } catch (error) {
        if (signal.aborted) throw error;
        warnings.push(error instanceof Error ? error.message : `${spec.id}: asset loading failed.`);
      }
    }
    if (signal.aborted) throw new DOMException("Renderer startup cancelled", "AbortError");
  } catch (error) {
    if (signal.aborted) { dispose(); throw error; }
    warnings.push(error instanceof Error ? error.message : "Production art unavailable; using procedural test models.");
  }
  function copy(id: string) {
    const template = templates.get(id);
    if (!template) return null;
    const group = cloneHierarchy(template.root) as Group; instances.add(group);
    return { group, spec: template.spec };
  }
  const library: ArtLibrary = {
    terrain: fallback.terrain,
    createObject(object: WorldObject): ObjectArt {
      const original = fallback.createObject(object);
      const id = object.kind === "bank" ? "bank" : object.kind === "furnace" || object.art?.includes("workshop") ? "forge" : object.kind === "tree" ? "tree" : object.kind === "anvil" ? "anvil" : object.art === "lantern" ? "lantern" : object.art === "crate" || object.art === "prop-supplies" ? "crate" : "";
      const model = copy(id); if (!model) return original;
      if (id === "tree") {
        const group = new Group(); group.name = `object:${object.id}`;
        const authoredDepleted = model.group.getObjectByName("depleted"); if (authoredDepleted) authoredDepleted.visible = false;
        const available = new Group(); available.name = "available"; available.add(model.group); group.add(available);
        const depleted = original.depleted ?? new Group(); depleted.removeFromParent(); depleted.visible = false; group.add(depleted);
        return { group, available, depleted, lights: [] };
      }
      const [width, depth] = model.spec.footprint ?? (["bank", "forge"].includes(id) ? [4, 3] : [1, 1]);
      const scaleX = object.width / width, scaleZ = object.height / depth;
      model.group.scale.set(scaleX, 1, scaleZ);
      model.group.name = `object:${object.id}`;
      const roof = model.group.getObjectByName("roof") as Group | undefined;
      const facade = model.group.getObjectByName("facade") as Group | undefined;
      const authoredLights = lightAnchors(model.group);
      return { group: model.group, roof, facade, lights: authoredLights.length ? authoredLights : original.lights };
    },
    createActor(actor: Pick<ActorState, "id" | "name" | "role">): ActorArt {
      const original = fallback.createActor(actor);
      if (actor.id !== 0) return original;
      const model = copy("alden"); if (!model) return original;
      const find = (name: string) => model.group.getObjectByName(name) as Group;
      const body = find("body"), leftArm = find("leftArm"), rightArm = find("rightArm"), leftLeg = find("leftLeg"), rightLeg = find("rightLeg");
      if (!body || !leftArm || !rightArm || !leftLeg || !rightLeg) return original;
      const authoredTool = find("toolGroup") ?? find("tool");
      let tool: Group;
      if (authoredTool?.children.length) tool = authoredTool;
      else {
        tool = original.tool; tool.removeFromParent(); rightArm.add(tool);
        if (authoredTool) tool.position.copy(authoredTool.position);
      }
      tool.visible = false;
      const capeNode = model.group.getObjectByName("cape");
      let cape: Mesh | undefined;
      if (capeNode instanceof Mesh) cape = capeNode;
      else capeNode?.traverse(child => { if (!cape && child instanceof Mesh) cape = child; });
      return { group: model.group, body, leftArm, rightArm, leftLeg, rightLeg, tool, cape };
    },
    createEnemy: id => fallback.createEnemy(id),
    dispose,
  };
  return { library, loadedIds: [...templates.keys()], warnings, source: templates.size ? "blender" : "procedural" };
}
