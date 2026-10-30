import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as zlib from "node:zlib";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ASSET_CATALOG = Object.freeze({
  bank: { footprint: [4, 3], requiredNodes: ["roof", "facade"], maxTriangles: 8000, maxNodes: 250, height: [2, 6], maxSpan: 8 },
  forge: { footprint: [4, 3], requiredNodes: ["roof"], maxTriangles: 8000, maxNodes: 250, height: [2, 6], maxSpan: 8 },
  tree: { footprint: [1, 1], requiredNodes: [], maxTriangles: 2000, maxNodes: 100, height: [1.5, 6], maxSpan: 5 },
  alden: { footprint: [1, 1], requiredNodes: ["body", "leftArm", "rightArm", "leftLeg", "rightLeg", "tool", "cape"], maxTriangles: 5000, maxNodes: 180, height: [1.3, 2.5], maxSpan: 2 },
  anvil: { footprint: [1, 1], requiredNodes: [], maxTriangles: 1500, maxNodes: 100, height: [.2, 2], maxSpan: 2.5 },
  crate: { footprint: [1, 1], requiredNodes: [], maxTriangles: 1500, maxNodes: 100, height: [.2, 2], maxSpan: 2.5 },
  lantern: { footprint: [1, 1], requiredNodes: [], maxTriangles: 1500, maxNodes: 100, height: [.15, 2], maxSpan: 2.5 },
});
const validInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const finiteArray = (value, size) => Array.isArray(value) && value.length === size && value.every(Number.isFinite);
const fail = (message) => { throw Error(message); };
const demand = (condition, message) => { if (!condition) fail(message); };
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const componentReaders = { 5120: "readInt8", 5121: "readUInt8", 5122: "readInt16LE", 5123: "readUInt16LE", 5125: "readUInt32LE", 5126: "readFloatLE" };

export function inspectPng(buffer) {
  demand(buffer.length >= 33 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString("ascii", 12, 16) === "IHDR", "Atlas is not a complete PNG header.");
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  demand(width === 512 && height === 512, `Atlas must be 512x512, got ${width}x${height}.`);
  return { width, height, bytes: buffer.length };
}

/** Check the exported payload, not an importer mock. Does not mutate files or invoke Blender. */
export function inspectGlb(input, id) {
  const spec = ASSET_CATALOG[id];
  demand(spec, `Unknown asset ${id}.`);
  const buffer = Buffer.from(input);
  demand(buffer.length >= 28, `${id}: truncated GLB header.`);
  demand(buffer.length < 1024 * 1024, `${id}: GLB exceeds the 1MiB budget.`);
  demand(buffer.readUInt32LE(0) === 0x46546c67 && buffer.readUInt32LE(4) === 2, `${id}: expected glTF2 binary magic/version.`);
  demand(buffer.readUInt32LE(8) === buffer.length, `${id}: declared GLB length differs from payload.`);
  const chunks = [];
  for (let offset = 12; offset < buffer.length;) {
    demand(offset + 8 <= buffer.length, `${id}: truncated chunk header.`);
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4);
    demand(length % 4 === 0 && offset + 8 + length <= buffer.length, `${id}: invalid or truncated chunk boundary.`);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  demand(chunks.length === 2 && chunks[0].type === 0x4e4f534a && chunks[1].type === 0x004e4942, `${id}: requires one JSON chunk followed by one BIN chunk.`);
  let json;
  try { json = JSON.parse(chunks[0].data.toString("utf8")); } catch { fail(`${id}: invalid GLB JSON.`); }
  demand(json.asset?.version === "2.0", `${id}: invalid glTF asset version.`);
  demand(Array.isArray(json.buffers) && json.buffers.length > 0, `${id}: missing buffers.`);
  const resources = [...json.buffers, ...(json.images ?? [])];
  for (const resource of resources) demand(resource.uri === undefined || typeof resource.uri === "string" && resource.uri.startsWith("data:"), `${id}: external resource URI is forbidden.`);
  const buffers = json.buffers.map((entry, index) => {
    demand(validInteger(entry.byteLength) && entry.byteLength > 0, `${id}: invalid buffer byteLength.`);
    let bytes;
    if (entry.uri !== undefined) {
      const comma = entry.uri.indexOf(",");
      demand(comma >= 5, `${id}: malformed embedded data URI.`);
      bytes = entry.uri.slice(0, comma).endsWith(";base64") ? Buffer.from(entry.uri.slice(comma + 1), "base64") : Buffer.from(decodeURIComponent(entry.uri.slice(comma + 1)));
    } else {
      demand(index === 0, `${id}: only the first buffer may use the BIN chunk.`);
      bytes = chunks[1].data;
    }
    demand(bytes.length >= entry.byteLength && (entry.uri !== undefined || bytes.length - entry.byteLength <= 3), `${id}: buffer byteLength exceeds its embedded payload.`);
    return bytes.subarray(0, entry.byteLength);
  });
  demand(Array.isArray(json.bufferViews), `${id}: missing buffer views.`);
  const views = json.bufferViews.map((entry) => {
    demand(validInteger(entry.buffer) && buffers[entry.buffer] && validInteger(entry.byteOffset ?? 0) && validInteger(entry.byteLength), `${id}: invalid buffer view.`);
    const bytes = buffers[entry.buffer], offset = entry.byteOffset ?? 0;
    demand(offset + entry.byteLength <= bytes.length, `${id}: buffer view is out of bounds.`);
    return { ...entry, data: bytes.subarray(offset, offset + entry.byteLength) };
  });
  demand(Array.isArray(json.accessors) && json.accessors.length > 0, `${id}: missing accessors.`);
  const accessors = json.accessors.map((entry) => {
    const bytes = componentBytes[entry.componentType], width = components[entry.type], view = views[entry.bufferView];
    demand(!entry.sparse && validInteger(entry.bufferView) && view && bytes && width && validInteger(entry.count) && entry.count > 0 && validInteger(entry.byteOffset ?? 0), `${id}: unsupported or invalid accessor.`);
    const offset = entry.byteOffset ?? 0, stride = view.byteStride ?? bytes * width;
    demand(validInteger(stride) && stride >= bytes * width && stride % bytes === 0 && offset % bytes === 0 && offset + (entry.count - 1) * stride + bytes * width <= view.data.length, `${id}: accessor is outside its buffer view.`);
    return { ...entry, read(index, component = 0) {
      return view.data[componentReaders[entry.componentType]](offset + index * stride + component * bytes);
    } };
  });
  demand(Array.isArray(json.meshes) && json.meshes.length > 0, `${id}: missing meshes.`);
  demand(Array.isArray(json.materials) && json.materials.length > 0 && json.materials.length <= 2, `${id}: expected one atlas material, at most two with emission.`);
  if (json.materials.length === 2) demand(json.materials.some(material => material.emissiveTexture || material.emissiveFactor?.some(value => value > 0)), `${id}: a second material requires emission.`);
  demand(Array.isArray(json.samplers) && json.samplers.length === 1 && json.samplers[0].magFilter === 9728 && [9728, 9984].includes(json.samplers[0].minFilter), `${id}: use one shared nearest pixel sampler.`);
  demand(Array.isArray(json.images) && json.images.length === 1 && Array.isArray(json.textures) && json.textures.length >= 1, `${id}: expected one embedded atlas image.`);
  const atlas = json.images[0];
  let atlasBytes;
  if (atlas.uri !== undefined) {
    demand(/^data:image\/png;base64,/.test(atlas.uri), `${id}: atlas data URI must embed a PNG.`);
    atlasBytes = Buffer.from(atlas.uri.slice(atlas.uri.indexOf(",") + 1), "base64");
  } else {
    demand(atlas.mimeType === "image/png" && validInteger(atlas.bufferView) && views[atlas.bufferView], `${id}: atlas must be an embedded PNG buffer view.`);
    atlasBytes = views[atlas.bufferView].data;
  }
  inspectPng(atlasBytes);
  for (const texture of json.textures) demand((texture.sampler ?? 0) === 0 && texture.source === 0, `${id}: all textures must use the shared pixel atlas and sampler.`);
  for (const material of json.materials) demand(validInteger(material.pbrMetallicRoughness?.baseColorTexture?.index) && json.textures[material.pbrMetallicRoughness.baseColorTexture.index], `${id}: material must reference the atlas texture.`);
  let primitives = 0, triangles = 0, vertices = 0;
  const meshBounds = json.meshes.map(mesh => {
    demand(Array.isArray(mesh.primitives) && mesh.primitives.length > 0, `${id}: empty mesh.`);
    const bounds = new Box3();
    for (const primitive of mesh.primitives) {
      demand((primitive.mode ?? 4) === 4, `${id}: only triangle primitives are supported.`);
      const attributes = primitive.attributes;
      demand(attributes && ["POSITION", "NORMAL", "TEXCOORD_0"].every(name => validInteger(attributes[name]) && accessors[attributes[name]]), `${id}: every primitive needs POSITION, NORMAL and TEXCOORD_0.`);
      const position = accessors[attributes.POSITION], normal = accessors[attributes.NORMAL], uv = accessors[attributes.TEXCOORD_0];
      demand(position.type === "VEC3" && position.componentType === 5126 && normal.type === "VEC3" && uv.type === "VEC2" && normal.count === position.count && uv.count === position.count, `${id}: vertex attribute counts/types differ.`);
      demand(finiteArray(position.min, 3) && finiteArray(position.max, 3) && position.min.every((value, axis) => value <= position.max[axis]), `${id}: POSITION needs finite accessor min/max.`);
      for (let index = 0; index < position.count; index++) for (let axis = 0; axis < 3; axis++) {
        const value = position.read(index, axis);
        demand(Number.isFinite(value) && value >= position.min[axis] - 1e-4 && value <= position.max[axis] + 1e-4 && Number.isFinite(normal.read(index, axis)), `${id}: position/normal data is invalid or outside declared bounds.`);
      }
      for (let index = 0; index < uv.count; index++) demand(Number.isFinite(uv.read(index, 0)) && Number.isFinite(uv.read(index, 1)), `${id}: texture coordinates are not finite.`);
      let count = position.count;
      if (primitive.indices !== undefined) {
        const indices = accessors[primitive.indices];
        demand(validInteger(primitive.indices) && indices && indices.type === "SCALAR" && [5121, 5123, 5125].includes(indices.componentType), `${id}: invalid index accessor.`);
        count = indices.count;
        for (let index = 0; index < count; index++) demand(indices.read(index) < position.count, `${id}: triangle index exceeds vertex count.`);
      }
      demand(count % 3 === 0 && validInteger(primitive.material) && json.materials[primitive.material], `${id}: invalid triangle count/material.`);
      bounds.union(new Box3(new Vector3(...position.min), new Vector3(...position.max)));
      primitives++; triangles += count / 3; vertices += position.count;
    }
    return bounds;
  });
  demand(triangles > 0 && triangles <= spec.maxTriangles, `${id}: triangle budget exceeded (${triangles}/${spec.maxTriangles}).`);
  demand(Array.isArray(json.nodes) && json.nodes.length > 0 && json.nodes.length <= spec.maxNodes, `${id}: node budget exceeded or missing nodes.`);
  const names = new Set(json.nodes.map(node => node.name));
  for (const name of spec.requiredNodes) demand(names.has(name), `${id}: missing required node ${name}.`);
  const bounds = new Box3(), seen = new Set();
  const walk = (index, parent) => {
    demand(validInteger(index) && json.nodes[index] && !seen.has(index), `${id}: invalid, cyclic or multiply parented node.`);
    seen.add(index);
    const node = json.nodes[index];
    let local;
    if (node.matrix !== undefined) {
      demand(finiteArray(node.matrix, 16) && node.translation === undefined && node.rotation === undefined && node.scale === undefined, `${id}: invalid node matrix.`);
      local = new Matrix4().fromArray(node.matrix);
    } else {
      const translation = node.translation ?? [0, 0, 0], rotation = node.rotation ?? [0, 0, 0, 1], scale = node.scale ?? [1, 1, 1];
      demand(finiteArray(translation, 3) && finiteArray(rotation, 4) && finiteArray(scale, 3), `${id}: invalid node transform.`);
      local = new Matrix4().compose(new Vector3(...translation), new Quaternion(...rotation), new Vector3(...scale));
    }
    const matrix = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      demand(validInteger(node.mesh) && meshBounds[node.mesh], `${id}: invalid node mesh reference.`);
      bounds.union(meshBounds[node.mesh].clone().applyMatrix4(matrix));
    }
    demand(node.children === undefined || Array.isArray(node.children), `${id}: invalid node children.`);
    for (const child of node.children ?? []) walk(child, matrix);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  demand(scene && Array.isArray(scene.nodes) && scene.nodes.length > 0, `${id}: missing default scene.`);
  for (const node of scene.nodes) walk(node, new Matrix4());
  demand(seen.size === json.nodes.length && !bounds.isEmpty(), `${id}: unreachable nodes or no visible model bounds.`);
  const size = bounds.getSize(new Vector3());
  demand(bounds.min.y >= -.08 && bounds.min.y <= .15, `${id}: model feet/base must meet Y=0 (minimum ${bounds.min.y}).`);
  demand(size.y >= spec.height[0] && size.y <= spec.height[1] && size.x >= .05 && size.z >= .05 && size.x <= spec.maxSpan && size.z <= spec.maxSpan, `${id}: implausible Y-up model bounds (${size.toArray()}).`);
  return { bytes: buffer.length, triangles, vertices, meshes: json.meshes.length, primitives, nodes: json.nodes.length, materials: json.materials.length,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() }, atlas: { width: 512, height: 512 } };
}

export async function checkArt3d({ write = false } = {}) {
  const hash = createHash("sha256"), assets = [], files = [];
  for (const [id, spec] of Object.entries(ASSET_CATALOG)) {
    const file = `art3d/${id}.glb`, buffer = await readFile(resolve(root, "public", file));
    const metrics = inspectGlb(buffer, id);
    const source = `assets/source/3d/${id}.blend`, blend = await readFile(resolve(root, source));
    let sourceBytes = blend;
    if (blend.readUInt32LE(0) === 0xfd2fb528) {
      demand(typeof zlib.zstdDecompressSync === "function", "Checking compressed Blender sources requires Node22.15+ with Zstandard support.");
      sourceBytes = zlib.zstdDecompressSync(blend);
    } else if (blend[0] === 31 && blend[1] === 139) sourceBytes = zlib.gunzipSync(blend);
    demand(sourceBytes.length > 12 && sourceBytes.toString("ascii", 0, 7) === "BLENDER", `${id}: missing or invalid editable .blend source.`);
    hash.update(file).update(buffer); files.push(file);
    assets.push({ id, url: `${id}.glb`, footprint: spec.footprint, requiredNodes: spec.requiredNodes, source, ...metrics });
  }
  const palette = await readFile(resolve(root, "public/art3d/palette.png"));
  const atlas = inspectPng(palette); hash.update("art3d/palette.png").update(palette); files.push("art3d/palette.png");
  const manifest = { version: hash.digest("hex").slice(0, 16), files, assets, atlas, bytes: assets.reduce((sum, asset) => sum + asset.bytes, palette.length) };
  const path = resolve(root, "public/art3d/manifest.json");
  if (write) await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  else {
    const current = JSON.parse(await readFile(path, "utf8"));
    demand(JSON.stringify(current) === JSON.stringify(manifest), "3D manifest is stale; run npm run art3d:manifest after exporting source assets.");
  }
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    demand(process.argv.slice(2).every(argument => argument === "--write"), "Usage: node scripts/check-art3d.mjs [--write]");
    const result = await checkArt3d({ write: process.argv.includes("--write") });
    console.log(`3D assets ${process.argv.includes("--write") ? "manifest written" : "checked"}: ${result.assets.length} models, ${result.bytes} bytes, version ${result.version}`);
    for (const asset of result.assets) console.log(`${asset.id}: ${asset.triangles} triangles, ${asset.nodes} nodes, ${asset.bytes} bytes; Y-up bounds ${asset.bounds.size.map(value => value.toFixed(2)).join(" x ")}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
  }
}
