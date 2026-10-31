import { expect, test, vi } from "vitest";
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Scene, Sphere, Vector3 } from "three";
import { acquireSceneRegistry } from "../src/render/three/scene-registry";
import { WorldCurve } from "../src/render/three/world-curve";
import { VoxelGI } from "../src/render/three/voxel-gi";

test("shared discovery observes nested additions, removals and reparenting without retaining detached trees", () => {
  const scene = new Scene(), a = new Group(), b = new Group(); scene.add(a, b);
  const first = acquireSceneRegistry(scene), second = acquireSceneRegistry(scene);
  expect(first.registry).toBe(second.registry);
  const group = new Group(), material = new MeshBasicMaterial(), mesh = new Mesh(new BoxGeometry(), material);
  const descriptor = Object.getOwnPropertyDescriptor(mesh, "material"); group.add(mesh); a.add(group);
  expect(Object.getOwnPropertyDescriptor(mesh, "material")).toEqual(descriptor);
  expect(first.registry.meshes.has(mesh)).toBe(true); expect(first.registry.materials.has(material)).toBe(true);
  b.add(group); expect(first.registry.meshes.has(mesh)).toBe(true);
  a.remove(group); expect(first.registry.meshes.has(mesh)).toBe(true);
  b.remove(group); expect(first.registry.meshes.has(mesh)).toBe(false); expect(first.registry.materials.has(material)).toBe(false);
  const detached = new Mesh(new BoxGeometry(), new MeshBasicMaterial()); group.add(detached);
  expect(first.registry.meshes.has(detached)).toBe(false);
  a.add(group); expect(first.registry.meshes.has(detached)).toBe(true);
  first.release(); expect(Object.getOwnPropertyDescriptor(mesh, "material")).toEqual(descriptor);
  second.release(); expect(Object.getOwnPropertyDescriptor(mesh, "material")).toEqual(descriptor);
  for (const child of [mesh, detached]) { child.geometry.dispose(); (child.material as MeshBasicMaterial).dispose(); }
});

test("material replacements and in-place material arrays invalidate discovery while stable frames do not", () => {
  const scene = new Scene(), materials = [new MeshBasicMaterial(), new MeshBasicMaterial(), new MeshBasicMaterial()];
  const mesh = new Mesh(new BoxGeometry(), materials[0]); scene.add(mesh);
  const lease = acquireSceneRegistry(scene), registry = lease.registry, version = registry.version;
  registry.sync(); registry.sync(); expect(registry.version).toBe(version);
  mesh.material = materials[1]; registry.sync(); expect(registry.materials).toEqual(new Set([materials[1]]));
  expect(Object.getOwnPropertyDescriptor(mesh, "material")).toMatchObject({ value: materials[1], writable: true, configurable: true, enumerable: true });
  const array = [materials[1], materials[1]], multi = new Mesh(mesh.geometry, array); scene.add(multi);
  array[1] = materials[2]; registry.sync(); expect(registry.materials).toEqual(new Set([materials[1], materials[2]]));
  scene.remove(mesh); expect(registry.materials.has(materials[1])).toBe(true);
  array.shift(); registry.sync(); expect(registry.materials).toEqual(new Set([materials[2]]));
  const finalVersion = registry.version; registry.sync(); expect(registry.version).toBe(finalVersion);
  lease.release(); expect(multi.material).toBe(array); expect(mesh.material).toBe(materials[1]);
  mesh.geometry.dispose(); for (const material of materials) material.dispose();
});

test("custom material accessors are preserved and their changes remain visible", () => {
  const scene = new Scene(), a = new MeshBasicMaterial(), b = new MeshBasicMaterial(), mesh = new Mesh(new BoxGeometry(), a);
  let value = a;
  const get = () => value, set = (next: MeshBasicMaterial) => { value = next; };
  Object.defineProperty(mesh, "material", { configurable: true, enumerable: true, get, set }); scene.add(mesh);
  const lease = acquireSceneRegistry(scene); mesh.material = b; lease.registry.sync();
  expect(lease.registry.materials).toEqual(new Set([b])); lease.release();
  expect(Object.getOwnPropertyDescriptor(mesh, "material")!.get).toBe(get);
  mesh.geometry.dispose(); a.dispose(); b.dispose();
});

test("reentrant object events cannot add detached children or lose a child reparented inside the scene", () => {
  const scene = new Scene(), a = new Group(), b = new Group(); scene.add(a, b);
  const lease = acquireSceneRegistry(scene), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const selfRemoving = new Mesh(geometry, material);
  const removeOnAdd = () => a.remove(selfRemoving);
  selfRemoving.addEventListener("added", removeOnAdd); a.add(selfRemoving);
  expect(selfRemoving.parent).toBeNull(); expect(lease.registry.meshes.has(selfRemoving)).toBe(false);
  selfRemoving.removeEventListener("added", removeOnAdd);
  const reparented = new Mesh(geometry, material); a.add(reparented);
  const moveOnRemove = () => b.add(reparented);
  reparented.addEventListener("removed", moveOnRemove); a.remove(reparented);
  expect(reparented.parent).toBe(b); expect(lease.registry.meshes.has(reparented)).toBe(true);
  reparented.removeEventListener("removed", moveOnRemove); b.remove(reparented);
  expect(lease.registry.meshes.has(reparented)).toBe(false);
  expect(lease.registry.materials.size).toBe(0); lease.release(); geometry.dispose(); material.dispose();
});

test("cached curve bounds still follow moved meshes, replacement geometry, camera changes and removal", () => {
  const curve = new WorldCurve(), scene = new Scene(), mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial()); scene.add(mesh);
  const bounded = mesh as Mesh & { boundingSphere?: Sphere };
  curve.update(new Vector3(), 2, 1, true); curve.prepareCulling(scene);
  const first = bounded.boundingSphere!.radius;
  mesh.position.set(20, 1, 20); curve.prepareCulling(scene); expect(bounded.boundingSphere!.radius).toBeGreaterThan(first);
  const far = bounded.boundingSphere!.radius;
  curve.update(new Vector3(20, 0, 20), 2, 1, true); curve.prepareCulling(scene); expect(bounded.boundingSphere!.radius).toBeLessThan(far);
  mesh.geometry.dispose(); mesh.geometry = new BoxGeometry(4, 4, 4); curve.prepareCulling(scene);
  expect(bounded.boundingSphere!.radius).toBeGreaterThan(first * 2);
  const instances = new InstancedMesh(mesh.geometry, mesh.material, 1); scene.add(instances); curve.prepareCulling(scene); expect(instances.frustumCulled).toBe(false);
  curve.update(new Vector3(), 2, 1, false); curve.prepareCulling(scene); expect(instances.frustumCulled).toBe(true);
  scene.remove(mesh); expect(bounded.boundingSphere).toBeUndefined();
  curve.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); instances.dispose();
});

test("GI and curve discover late materials once without recurring hierarchy traversals", () => {
  class WorkerTransport { terminate() {} postMessage() {} }
  vi.stubGlobal("Worker", WorkerTransport);
  const scene = new Scene(), root = new Group(), geometry = new BoxGeometry(), first = new MeshLambertMaterial(), second = new MeshLambertMaterial();
  const mesh = new Mesh(geometry, first); root.add(mesh); scene.add(root);
  const gi = new VoxelGI(), curve = new WorldCurve();
  try {
    gi.decorate(scene); curve.decorate(scene); curve.prepareCulling(scene);
    const key = first.customProgramCacheKey(), version = first.version;
    const traversal = vi.spyOn(scene, "traverse");
    for (let frame = 0; frame < 5; frame++) { gi.decorate(scene); curve.decorate(scene); curve.prepareCulling(scene); }
    expect(traversal).not.toHaveBeenCalled(); expect(first.version).toBe(version); expect(first.customProgramCacheKey()).toBe(key);
    mesh.material = second; gi.decorate(scene); curve.decorate(scene);
    expect(second.customProgramCacheKey()).toContain("fable-cached-gi-v1"); expect(second.customProgramCacheKey()).toContain("fable-world-curve-atmosphere-v4");
    const late = new MeshLambertMaterial(), nested = new Group(), added = new Mesh(geometry, late); nested.add(added); root.add(nested);
    gi.decorate(scene); curve.decorate(scene); curve.prepareCulling(scene);
    expect(late.customProgramCacheKey()).toContain("fable-cached-gi-v1"); expect(late.customProgramCacheKey()).toContain("fable-world-curve-atmosphere-v4");
    root.remove(nested); expect((added as Mesh & { boundingSphere?: Sphere }).boundingSphere).toBeUndefined(); late.dispose();
  } finally { curve.dispose(); gi.dispose(); geometry.dispose(); first.dispose(); second.dispose(); vi.unstubAllGlobals(); }
  expect(Object.getOwnPropertyDescriptor(mesh, "material")!.get).toBeUndefined();
});
