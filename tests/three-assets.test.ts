import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { ASSET_CATALOG, checkArt3d, inspectGlb } from "../scripts/check-art3d.mjs";
import { Box3, BoxGeometry, Group, Mesh, MeshLambertMaterial, Vector3, type BufferGeometry } from "three";
import { mergeModelMeshes } from "../src/render/three/production-assets";

interface Document {
  nodes: { name?: string; translation?: number[]; matrix?: number[]; children?: number[] }[];
  scenes: { nodes: number[] }[];
  scene?: number;
  buffers: { uri?: string }[];
  images: { uri?: string; bufferView?: number; mimeType?: string }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
}
const asset = (id: string) => readFile(new URL(`../public/art3d/${id}.glb`, import.meta.url));

/** Preserve real BIN geometry while changing one independently meaningful export property. */
function editJson(buffer: Buffer, edit: (json: Document) => void) {
  const length = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + length)) as Document;
  edit(json);
  const text = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
  text.copy(padded);
  const binaryChunk = buffer.subarray(20 + length);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + binaryChunk.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, padded, binaryChunk]);
}

describe("Blender production asset release gate", () => {
  test("all seven actual models and editable sources satisfy the catalog; checking is read-only", async () => {
    const manifestPath = new URL("../public/art3d/manifest.json", import.meta.url);
    const before = await readFile(manifestPath);
    const manifest = await checkArt3d();
    expect(manifest.assets.map(model => model.id)).toEqual(Object.keys(ASSET_CATALOG));
    expect(manifest.files).toContain("art3d/palette.png");
    expect(manifest.assets.every(model => model.triangles > 0 && model.materials <= 2)).toBe(true);
    expect(await readFile(manifestPath)).toEqual(before);
  });

  test("Alden's parent-composed bounds stand upright with feet at ground", async () => {
    const buffer = await asset("alden"), metrics = inspectGlb(buffer, "alden");
    expect(metrics.bounds.min[1]).toBeGreaterThanOrEqual(-.08);
    expect(metrics.bounds.min[1]).toBeLessThanOrEqual(.15);
    expect(metrics.bounds.size[1]).toBeGreaterThan(metrics.bounds.size[0]);
    expect(metrics.bounds.size[1]).toBeGreaterThan(metrics.bounds.size[2]);
    const raised = editJson(buffer, json => {
      const root = json.scenes[json.scene ?? 0].nodes[0];
      json.nodes[root].translation = [0, 4, 0];
    });
    expect(() => inspectGlb(raised, "alden")).toThrow(/feet\/base/);
    const sideways = editJson(buffer, json => {
      const root = json.scenes[json.scene ?? 0].nodes[0];
      // Equivalent to rotating the asset by90 degrees about its X axis: its actual world height changes.
      json.nodes[root].matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
    });
    expect(() => inspectGlb(sideways, "alden")).toThrow(/feet\/base|Y-up/);
  });

  test("bad headers, declared length and truncated chunk payloads fail", async () => {
    const buffer = await asset("bank");
    expect(() => inspectGlb(buffer.subarray(0, 15), "bank")).toThrow(/truncated/);
    const badMagic = Buffer.from(buffer); badMagic.writeUInt32LE(0, 0);
    expect(() => inspectGlb(badMagic, "bank")).toThrow(/magic/);
    const badVersion = Buffer.from(buffer); badVersion.writeUInt32LE(1, 4);
    expect(() => inspectGlb(badVersion, "bank")).toThrow(/version/);
    const declared = Buffer.from(buffer); declared.writeUInt32LE(buffer.length + 4, 8);
    expect(() => inspectGlb(declared, "bank")).toThrow(/declared/);
    const truncated = Buffer.from(buffer.subarray(0, -8)); truncated.writeUInt32LE(truncated.length, 8);
    expect(() => inspectGlb(truncated, "bank")).toThrow(/chunk boundary/);
  });

  test.each(["buffers", "images"] as const)("external %s URI cannot enter the offline game", async resource => {
    const invalid = editJson(await asset("bank"), json => { json[resource][0].uri = "https://example.invalid/asset.bin"; });
    expect(() => inspectGlb(invalid, "bank")).toThrow(/external resource/);
  });

  test("an embedded PNG data URI remains self-contained and valid", async () => {
    const buffer = await asset("bank"), jsonLength = buffer.readUInt32LE(12);
    const json = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength)) as Document;
    const view = json.bufferViews[json.images[0].bufferView!];
    const start = 20 + jsonLength + 8 + (view.byteOffset ?? 0);
    const png = buffer.subarray(start, start + view.byteLength);
    const embedded = editJson(buffer, edited => {
      edited.images[0] = { uri: `data:image/png;base64,${png.toString("base64")}` };
    });
    expect(inspectGlb(embedded, "bank").triangles).toBe(inspectGlb(buffer, "bank").triangles);
  });

  test("missing articulation and roof nodes fail export acceptance", async () => {
    const actor = editJson(await asset("alden"), json => { json.nodes.find(node => node.name === "rightArm")!.name = "misnamed-pivot"; });
    expect(() => inspectGlb(actor, "alden")).toThrow(/rightArm/);
    const building = editJson(await asset("forge"), json => { json.nodes.find(node => node.name === "roof")!.name = "joined-roof"; });
    expect(() => inspectGlb(building, "forge")).toThrow(/roof/);
    const bank = editJson(await asset("bank"), json => { json.nodes.find(node => node.name === "facade")!.name = "joined-front-wall"; });
    expect(() => inspectGlb(bank, "bank")).toThrow(/facade/);
  });

  test("missing UVs and invalid triangle indices fail before renderer import", async () => {
    const buffer = await asset("tree");
    const missingUv = editJson(buffer, json => { delete json.meshes[0].primitives[0].attributes.TEXCOORD_0; });
    expect(() => inspectGlb(missingUv, "tree")).toThrow(/TEXCOORD_0/);
    const invalidIndex = Buffer.from(buffer);
    const jsonLength = invalidIndex.readUInt32LE(12);
    const json = JSON.parse(invalidIndex.toString("utf8", 20, 20 + jsonLength)) as Document;
    const primitive = json.meshes[0].primitives[0], accessor = json.accessors[primitive.indices!];
    const start = 20 + jsonLength + 8 + (json.bufferViews[accessor.bufferView].byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    if (accessor.componentType === 5121) invalidIndex.writeUInt8(255, start);
    else if (accessor.componentType === 5123) invalidIndex.writeUInt16LE(65535, start);
    else invalidIndex.writeUInt32LE(0xffffffff, start);
    expect(() => inspectGlb(invalidIndex, "tree")).toThrow(/index exceeds/);
  });

  test("asset budgets reject duplicated geometry rather than merely reporting size", async () => {
    const bloated = editJson(await asset("bank"), json => {
      const primitive = json.meshes[0].primitives[0];
      json.meshes[0].primitives.push(...Array.from({ length: 800 }, () => structuredClone(primitive)));
    });
    expect(() => inspectGlb(bloated, "bank")).toThrow(/triangle budget/);
  });
});

describe("production mesh batching preserves authored structure", () => {
  const meshCount = (root: Group) => {
    let count = 0; root.traverse(node => { if (node instanceof Mesh) count++; }); return count;
  };
  const expectBounds = (actual: Box3, expected: Box3) => {
    for (const key of ["min", "max"] as const) for (const axis of ["x", "y", "z"] as const)
      expect(actual[key][axis]).toBeCloseTo(expected[key][axis], 5);
  };

  test("transformed building batches keep world bounds, roof/facade boundaries and light positions", () => {
    const geometry = new BoxGeometry(1, 1, 1), material = new MeshLambertMaterial(), owned = new Set<BufferGeometry>();
    const root = new Group(); root.name = "bank"; root.position.set(5, .3, -2); root.rotation.y = .4;
    const frame = new Group(); frame.position.set(.7, .2, -.3); frame.rotation.z = .1; root.add(frame);
    const roof = new Group(); roof.name = "roof"; roof.position.set(0, 2, .1); roof.rotation.y = -.2; root.add(roof);
    const facade = new Group(); facade.name = "facade"; facade.position.set(0, .5, 1.2); root.add(facade);
    const marker = new Group(); marker.name = "light-window"; marker.userData = { kind: "window", intensity: 5 }; marker.position.set(.2, .4, .6);
    for (const [index, parent] of [frame, roof, facade].entries()) {
      for (let i = 0; i < 2; i++) {
        const mesh = new Mesh(geometry, material); mesh.position.set(i * 1.2, index * .1, i * .25); mesh.rotation.y = i * .3;
        parent.add(mesh); if (index === 0 && i === 0) mesh.add(marker);
      }
    }
    root.updateWorldMatrix(true, true);
    const before = new Box3().setFromObject(root, true), markerBefore = marker.getWorldPosition(new Vector3());
    expect(meshCount(root)).toBe(6);
    mergeModelMeshes(root, false, owned); root.updateWorldMatrix(true, true);
    expect(meshCount(root)).toBe(3);
    expect(owned.size).toBe(3);
    expectBounds(new Box3().setFromObject(root, true), before);
    expect(root.getObjectByName("roof")).toBe(roof);
    expect(root.getObjectByName("facade")).toBe(facade);
    expect(roof.children.filter(node => node instanceof Mesh)).toHaveLength(1);
    expect(facade.children.filter(node => node instanceof Mesh)).toHaveLength(1);
    expect(root.getObjectByName("light-window")).toBe(marker);
    expect(marker.getWorldPosition(new Vector3()).distanceTo(markerBefore)).toBeLessThan(1e-5);
    expect(marker.userData).toEqual({ kind: "window", intensity: 5 });
    owned.forEach(value => value.dispose()); geometry.dispose(); material.dispose();
  });

  test("actor limbs merge within their pivots while cape and hand tools remain separate", () => {
    const geometry = new BoxGeometry(.25, .4, .2), material = new MeshLambertMaterial(), owned = new Set<BufferGeometry>();
    const root = new Group(); root.position.set(2, 0, -1); root.rotation.y = .7;
    const body = new Group(); body.name = "body"; body.position.set(0, .8, 0); root.add(body);
    const pivots = [body];
    for (const [i, name] of ["leftArm", "rightArm", "leftLeg", "rightLeg"].entries()) {
      const joint = new Group(); joint.name = name; joint.position.set(i % 2 ? .35 : -.35, i < 2 ? .5 : -.1, 0); joint.rotation.z = .05;
      body.add(joint); pivots.push(joint);
    }
    for (const part of pivots) for (let i = 0; i < 2; i++) {
      const mesh = new Mesh(geometry, material); mesh.position.set(0, -.2 - i * .3, 0); part.add(mesh);
    }
    const cape = new Mesh(geometry, material); cape.name = "cape"; cape.position.set(0, .3, -.3); body.add(cape);
    const tool = new Group(); tool.name = "tool"; tool.position.set(0, -.6, .2); pivots[2].add(tool);
    const toolMesh = new Mesh(geometry, material); tool.add(toolMesh);
    root.updateWorldMatrix(true, true);
    const before = new Box3().setFromObject(root, true), toolBefore = tool.getWorldPosition(new Vector3());
    const partBounds = pivots.map(part => new Box3().setFromObject(part, true));
    mergeModelMeshes(root, true, owned); root.updateWorldMatrix(true, true);
    expect(meshCount(root)).toBe(7);
    expect(owned.size).toBe(5);
    expectBounds(new Box3().setFromObject(root, true), before);
    for (const [i, part] of pivots.entries()) {
      expect(root.getObjectByName(part.name)).toBe(part);
      expectBounds(new Box3().setFromObject(part, true), partBounds[i]);
    }
    expect(root.getObjectByName("cape")).toBe(cape);
    expect(cape.parent).toBe(body);
    expect(tool.parent).toBe(pivots[2]);
    expect(tool.children).toEqual([toolMesh]);
    expect(tool.getWorldPosition(new Vector3()).distanceTo(toolBefore)).toBeLessThan(1e-5);
    pivots[2].rotation.x = .5; root.updateWorldMatrix(true, true);
    expect(tool.getWorldPosition(new Vector3()).distanceTo(toolBefore)).toBeGreaterThan(.05);
    owned.forEach(value => value.dispose()); geometry.dispose(); material.dispose();
  });
});
