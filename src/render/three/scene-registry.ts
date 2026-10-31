import { Material, Mesh, Object3D } from "three";

type Renderable = Object3D & { material: Material | Material[] };
interface MaterialWatch {
  object: Renderable; mesh: boolean; value: Material | Material[]; snapshot: Material[];
}

/** Shared discovery cache. Scene structure/material changes publish a generation;
 * camera movement never rediscovers the same hierarchy or material list. */
export class SceneRegistry {
  readonly meshes = new Set<Mesh>();
  readonly materials = new Set<Material>();
  readonly meshMaterials = new Set<Material>();
  version = 0;
  private nodes = new Set<Object3D>();
  private watches = new Map<Object3D, MaterialWatch>();
  private references = new Map<Material, number>();
  private meshReferences = new Map<Material, number>();
  private removed = new Set<(mesh: Mesh) => void>();
  private added = (event: { child: Object3D; target: Object3D }) => {
    if (this.nodes.has(event.target) && event.child.parent === event.target) this.add(event.child);
  };
  private detached = (event: { child: Object3D }) => {
    if (!event.child.parent || !this.nodes.has(event.child.parent)) this.remove(event.child);
  };

  constructor(root: Object3D) { this.add(root); }

  onMeshRemoved(callback: (mesh: Mesh) => void) { this.removed.add(callback); return () => { this.removed.delete(callback); }; }

  /** Poll only cached renderables. Do not redefine Mesh properties: changing
   * their V8 object shape slows unrelated matrix/render paths. */
  sync() {
    for (const watch of this.watches.values()) {
      const value = watch.object.material;
      if (value !== watch.value) { this.replace(watch, value); continue; }
      if (!Array.isArray(value)) continue;
      let changed = value.length !== watch.snapshot.length;
      for (let i = 0; !changed && i < value.length; i++) changed = value[i] !== watch.snapshot[i];
      if (changed) this.replace(watch, value);
    }
  }

  private reference(material: Material, mesh: boolean, delta: number) {
    const update = (counts: Map<Material, number>, materials: Set<Material>) => {
      const count = (counts.get(material) ?? 0) + delta;
      if (count === 0) { counts.delete(material); materials.delete(material); }
      else { counts.set(material, count); materials.add(material); }
    };
    update(this.references, this.materials); if (mesh) update(this.meshReferences, this.meshMaterials);
  }

  private replace(watch: MaterialWatch, value: Material | Material[]) {
    for (const material of watch.snapshot) this.reference(material, watch.mesh, -1);
    watch.value = value; watch.snapshot = Array.isArray(value) ? value.slice() : [value];
    for (const material of watch.snapshot) this.reference(material, watch.mesh, 1);
    this.version++;
  }

  private add(object: Object3D) {
    if (this.nodes.has(object)) return;
    this.nodes.add(object); object.addEventListener("childadded", this.added); object.addEventListener("childremoved", this.detached);
    if (object instanceof Mesh) this.meshes.add(object);
    if ("material" in object) {
      const renderable = object as Renderable;
      const watch: MaterialWatch = { object: renderable, mesh: object instanceof Mesh, value: renderable.material, snapshot: [] };
      this.watches.set(object, watch); this.replace(watch, renderable.material);
    }
    for (const child of object.children) this.add(child);
  }

  private unwatch(object: Object3D) {
    object.removeEventListener("childadded", this.added); object.removeEventListener("childremoved", this.detached);
    const watch = this.watches.get(object);
    if (watch) {
      for (const material of watch.snapshot) this.reference(material, watch.mesh, -1);
      this.watches.delete(object); this.version++;
    }
  }

  private remove(object: Object3D) {
    if (!this.nodes.delete(object)) return;
    this.unwatch(object);
    if (object instanceof Mesh && this.meshes.delete(object)) for (const callback of this.removed) callback(object);
    for (const child of object.children) this.remove(child);
  }

  dispose() {
    for (const object of this.nodes) this.unwatch(object);
    this.nodes.clear(); this.meshes.clear(); this.removed.clear();
  }
}

const registries = new WeakMap<Object3D, { registry: SceneRegistry; references: number }>();
export interface SceneRegistryLease { registry: SceneRegistry; release(): void }
export function acquireSceneRegistry(root: Object3D): SceneRegistryLease {
  let entry = registries.get(root);
  if (!entry) { entry = { registry: new SceneRegistry(root), references: 0 }; registries.set(root, entry); }
  const shared = entry; shared.references++; let released = false;
  return { registry: shared.registry, release() {
    if (released) return; released = true;
    if (--shared.references === 0) { shared.registry.dispose(); registries.delete(root); }
  } };
}
