import { describe, expect, test } from "vitest";
import { Box3, Mesh, NearestFilter, type BufferGeometry, type Material, type Texture } from "three";
import { createArtLibrary } from "../src/render/three/art";
import { WORLD } from "../src/rpg/world";

describe("original 3D test art", () => {
  test("every authored world object has independent roots without changing world data", () => {
    const library = createArtLibrary();
    const before = JSON.stringify(WORLD);
    const roots = new Set();
    for (const object of WORLD.objects) {
      const art = library.createObject(object);
      expect(roots.has(art.group)).toBe(false); roots.add(art.group);
      expect(art.lights.every(light => light.distance > 0 && light.intensity > 0)).toBe(true);
      if (object.kind === "tree" || object.kind === "rock") {
        expect(art.available?.visible).toBe(true);
        expect(art.depleted?.visible).toBe(false);
      }
      if (["bank", "shop", "building", "furnace"].includes(object.kind)) {
        expect(art.roof?.parent).toBe(art.group);
        expect(art.lights.length).toBeGreaterThan(0);
      }
      if (object.kind === "gate") expect(art.gate).toBeDefined();
    }
    expect(JSON.stringify(WORLD)).toBe(before);
    library.dispose();
  });

  test("hundreds of tree models share a bounded set of geometry, materials and pixel textures", () => {
    const library = createArtLibrary();
    const geometry = new Set<BufferGeometry>(), material = new Set<Material>(), textures = new Set<Texture>();
    for (const object of WORLD.objects.filter(object => object.kind === "tree")) {
      const art = library.createObject(object);
      art.group.traverse(node => {
        if (!(node instanceof Mesh)) return;
        geometry.add(node.geometry);
        for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
          material.add(mat);
          if ("map" in mat && mat.map instanceof Object) textures.add(mat.map as Texture);
        }
      });
    }
    expect(geometry.size).toBeLessThanOrEqual(4);
    expect(material.size).toBeLessThanOrEqual(6);
    expect(textures.size).toBeLessThanOrEqual(6);
    for (const texture of textures) {
      expect(texture.magFilter).toBe(NearestFilter);
      expect((texture.image as { width: number }).width).toBe(32);
    }
    library.dispose();
  });

  test("Alden has grounded articulated limbs, a cape and a compact modeled silhouette", () => {
    const library = createArtLibrary();
    const actor = library.createActor({ id: 0, name: "Alden", role: "prince" });
    actor.group.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(actor.group);
    expect(bounds.min.y).toBeCloseTo(0, 4);
    expect(bounds.max.y).toBeGreaterThan(1.7);
    expect(bounds.max.y).toBeLessThan(2.2);
    expect(actor.tool.parent).toBe(actor.rightArm);
    expect(actor.leftLeg.parent).toBe(actor.body);
    expect(actor.cape?.name).toBe("royal-cape");
    expect(actor.group.getObjectByName("pixel-eye")).toBeDefined();
    library.dispose();
  });

  test("resource ownership disposes shared objects exactly once", () => {
    const library = createArtLibrary();
    const mat = library.terrain.grass, tex = mat.map!;
    let materialEvents = 0, textureEvents = 0, geometryEvents = 0;
    mat.addEventListener("dispose", () => materialEvents++);
    tex.addEventListener("dispose", () => textureEvents++);
    const art = library.createActor({ id: 0, name: "Alden", role: "prince" });
    const torso = art.group.getObjectByName("tunic") as Mesh;
    torso.geometry.addEventListener("dispose", () => geometryEvents++);
    library.dispose(); library.dispose();
    expect([materialEvents, textureEvents, geometryEvents]).toEqual([1, 1, 1]);
  });

  test("Alden and NPCs have distinct action tools that remain hidden until presentation selects one", () => {
    const library = createArtLibrary();
    for (const actor of [
      library.createActor({ id: 0, name: "Alden", role: "prince" }),
      library.createActor({ id: 1, name: "Miner", role: "miner" }),
    ]) {
      expect(actor.tool.visible).toBe(false);
      expect(actor.tool.children.filter(child => child.visible)).toHaveLength(1);
      for (const [pose, marker] of [
        ["cut", "axe-head"], ["mine", "pickaxe-head"], ["fish", "fishing-rod"],
        ["smith", "smith-hammer"], ["melee", "sword-blade"], ["bow", "bow-string"],
      ]) {
        const variant = actor.tool.getObjectByName(`tool-${pose}`);
        expect(variant?.parent).toBe(actor.tool);
        expect(variant?.getObjectByName(marker)).toBeDefined();
      }
    }
    library.dispose();
  });
});
