import { describe, expect, it, vi } from "vitest";
import { Group, Mesh, MeshStandardMaterial, NearestFilter, PerspectiveCamera, Raycaster, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import type { ArtLibrary } from "../src/render/three/contracts";
import { PixelBillboards } from "../src/render/three/pixel-billboards";
import { UNIT_KINDS } from "../src/render/pixel-units";
const base = (): ArtLibrary => ({ terrain: {} as ArtLibrary["terrain"], createActor: () => { throw Error("Legacy actor used"); }, createEnemy: () => { throw Error("Legacy enemy used"); }, createObject: () => ({ group: new Group(), lights: [] }), dispose: vi.fn() });
const hero = { id: 0, name: "Alden", role: "prince" };
describe("native pixel billboards", () => {
  it("replaces people, quest people and every enemy with cutout sprites using shared native pigment", () => {
    const units = new PixelBillboards(base());
    const first = units.library.createActor(hero), second = units.library.createActor(hero);
    const a = first.group.getObjectByName("pixel-billboard") as Mesh;
    const b = second.group.getObjectByName("pixel-billboard") as Mesh;
    expect(a.material).toBe(b.material);
    const material = a.material as MeshStandardMaterial;
    expect(material.map?.magFilter).toBe(NearestFilter); expect(material.normalMap?.magFilter).toBe(NearestFilter);
    expect(material.alphaTest).toBe(.5); expect(material.transparent).toBe(false); expect(material.depthWrite).toBe(true);
    for (const id of ["boar", "rock-mite", "bandit", "captain", "armoured-outlaw", "ranged-outlaw"]) expect(units.library.createEnemy(id).userData.pixelUnit).toBe(true);
    expect(UNIT_KINDS.length).toBe(14); units.dispose();
  });
  it("keeps full screen-facing proportions rather than foreshortening against camera elevation and changes only selected pose UVs", () => {
    const units = new PixelBillboards(base()), actor = units.library.createActor(hero);
    actor.group.rotation.y = -2;
    const camera = new PerspectiveCamera(); camera.position.set(3, 7, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    units.frame(actor.group, 6, 0, undefined, "pickaxe"); const mesh = actor.group.getObjectByName("pixel-billboard") as Mesh;
    const geometry = mesh.geometry;
    const heldMesh = actor.group.getObjectByName("pixel-held-tool") as Mesh; const heldGeometry = heldMesh.geometry;
    expect(heldMesh.scale.toArray()).toEqual(mesh.scale.toArray());
    expect(mesh.scale.toArray()).toEqual([2, 2, 1]);
    expect(actor.group.userData.spriteCellMeters).toBe(.0625);
    expect(actor.group.userData.bodyHeightMeters).toBe(1.125);
    units.faceCamera(camera, .5); actor.group.updateMatrixWorld(true);
    const normal = new Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
    const towardCamera = camera.getWorldDirection(new Vector3()).negate();
    expect(normal.dot(towardCamera)).toBeCloseTo(1); expect(actor.group.rotation.y).toBe(0);
    expect(actor.group.position.y).toBe(0); expect(actor.group.children[0].position.y).toBe(0);
    units.frame(actor.group, 0, 0, undefined, "pickaxe"); expect(mesh.geometry).toBe(geometry); expect(heldMesh.geometry).not.toBe(heldGeometry);
    units.frame(actor.group, 6, 0, undefined, "axe", true); expect(mesh.geometry).toBe(geometry); expect(heldMesh.geometry).toBe(heldGeometry); expect(actor.group.children[0].scale.x).toBe(-1);
    units.dispose();
  });
  it("ignores transparent padding when picking a sprite", () => {
    const units = new PixelBillboards(base()), actor = units.library.createActor(hero);
    const mesh = actor.group.getObjectByName("pixel-billboard") as Mesh;
    actor.group.updateMatrixWorld(true);
    const padding = mesh.localToWorld(new Vector3(-.49, .49, 0));
    const misses: Parameters<Mesh["raycast"]>[1] = [];
    mesh.raycast(new Raycaster(padding.clone().add(new Vector3(0, 0, 5)), new Vector3(0, 0, -1)), misses);
    expect(misses).toHaveLength(0);
    const material = mesh.material as MeshStandardMaterial;
    const image = material.map!.image as { data: Uint8Array; width: number; height: number };
    let x = 0, y = 0;
    outer: for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) if (image.data[(y * image.width + x) * 4 + 3]) break outer;
    const occupied = mesh.localToWorld(new Vector3((x + .5) / 32 - .5, .5 - (y + .5) / 32, 0));
    const hits: Parameters<Mesh["raycast"]>[1] = [];
    mesh.raycast(new Raycaster(occupied.clone().add(new Vector3(0, 0, 5)), new Vector3(0, 0, -1)), hits);
    expect(hits.length).toBeGreaterThan(0); units.dispose();
  });
  it("supports flat lighting and applies current normal strength to later-created units", () => {
    const units = new PixelBillboards(base()), camera = new PerspectiveCamera();
    units.library.createActor(hero); units.faceCamera(camera, 0);
    const npc = units.library.createActor({ id: 4, name: "Mina", role: "miner" });
    const material = (npc.group.getObjectByName("pixel-billboard") as Mesh).material as MeshStandardMaterial;
    expect(material.normalScale.x).toBe(0); expect(Math.abs(material.normalScale.y)).toBe(0); units.faceCamera(camera, .8); expect(material.normalScale.toArray()).toEqual([.8, -.8]);
    units.dispose();
  });
  it("body and held layer resolve their explicit depth pivot to the same grounded root after mirroring and camera rotation", () => {
    const units = new PixelBillboards(base()), actor = units.library.createActor(hero), camera = new PerspectiveCamera();
    actor.group.position.set(17, 0, 23); camera.position.set(22, 10, 30); camera.lookAt(actor.group.position); camera.updateMatrixWorld();
    units.frame(actor.group, 6, 0, undefined, "pickaxe", true); units.faceCamera(camera, .35); actor.group.updateMatrixWorld(true);
    for (const name of ["pixel-billboard", "pixel-held-tool"]) {
      const mesh = actor.group.getObjectByName(name) as Mesh, material = mesh.material as MeshStandardMaterial;
      const shader = { uniforms: {}, vertexShader: "#include <project_vertex>", fragmentShader: "" } as WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      const pivot = (shader.uniforms.unitGroundPivot.value as Vector3).clone().applyMatrix4(mesh.matrixWorld);
      expect(pivot.distanceTo(actor.group.position)).toBeLessThan(1e-10);
      expect(shader.vertexShader).toContain("gl_Position.z=(fableGroundClip.z/fableGroundClip.w)*gl_Position.w");
    }
    units.dispose();
  });
});
