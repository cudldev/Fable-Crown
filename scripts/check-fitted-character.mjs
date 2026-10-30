import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";

const root = fileURLToPath(new URL("../", import.meta.url));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const array = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const demand = (condition, message) => { if (!condition) throw Error(`Fitted character: ${message}`); };
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const types = { 5120: [1, "readInt8"], 5121: [1, "readUInt8"], 5122: [2, "readInt16LE"], 5123: [2, "readUInt16LE"], 5125: [4, "readUInt32LE"], 5126: [4, "readFloatLE"] };
const requiredClips = ["idle", "walk", "gather", "tool_use"];

function unpack(input) {
  const buffer = Buffer.from(input);
  demand(buffer.length >= 28 && buffer.readUInt32LE(0) === 0x46546c67 && buffer.readUInt32LE(4) === 2, "expected complete glTF2 binary.");
  demand(buffer.readUInt32LE(8) === buffer.length, "declared file length differs from payload.");
  const chunks = [];
  for (let offset = 12; offset < buffer.length;) {
    demand(offset + 8 <= buffer.length, "truncated chunk header.");
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4);
    demand(length % 4 === 0 && offset + 8 + length <= buffer.length, "invalid chunk boundary.");
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) }); offset += 8 + length;
  }
  demand(chunks.length === 2 && chunks[0].type === 0x4e4f534a && chunks[1].type === 0x004e4942, "expected JSON followed by one embedded BIN chunk.");
  let json;
  try { json = JSON.parse(chunks[0].data.toString("utf8")); } catch { throw Error("Fitted character: invalid JSON."); }
  demand(json.asset?.version === "2.0", "invalid asset version.");
  demand(Array.isArray(json.buffers) && json.buffers.length > 0, "missing buffers.");
  for (const resource of [...json.buffers, ...(json.images ?? [])]) demand(resource.uri === undefined || typeof resource.uri === "string" && resource.uri.startsWith("data:"), "external resource URI is forbidden.");
  const decodeUri = uri => {
    const comma = uri.indexOf(","); demand(comma > 4, "invalid data URI.");
    return uri.slice(0, comma).endsWith(";base64") ? Buffer.from(uri.slice(comma + 1), "base64") : Buffer.from(decodeURIComponent(uri.slice(comma + 1)));
  };
  const buffers = json.buffers.map((entry, i) => {
    demand(integer(entry.byteLength) && entry.byteLength > 0 && (entry.uri !== undefined || i === 0), "invalid embedded buffer.");
    const data = entry.uri === undefined ? chunks[1].data : decodeUri(entry.uri);
    demand(data.length >= entry.byteLength && (entry.uri !== undefined || data.length - entry.byteLength <= 3), "buffer byte length exceeds its payload.");
    return data.subarray(0, entry.byteLength);
  });
  demand(Array.isArray(json.bufferViews), "missing buffer views.");
  const views = json.bufferViews.map(entry => {
    demand(integer(entry.buffer) && buffers[entry.buffer] && integer(entry.byteOffset ?? 0) && integer(entry.byteLength), "invalid buffer view.");
    const start = entry.byteOffset ?? 0; demand(start + entry.byteLength <= buffers[entry.buffer].length, "buffer view exceeds embedded buffer.");
    return { ...entry, data: buffers[entry.buffer].subarray(start, start + entry.byteLength) };
  });
  demand(Array.isArray(json.accessors), "missing accessors.");
  const accessors = json.accessors.map(entry => {
    const spec = types[entry.componentType], width = widths[entry.type], view = views[entry.bufferView];
    demand(spec && width && view && !entry.sparse && integer(entry.bufferView) && integer(entry.count) && entry.count > 0 && integer(entry.byteOffset ?? 0), "unsupported or invalid accessor.");
    const [bytes, reader] = spec, start = entry.byteOffset ?? 0, stride = view.byteStride ?? bytes * width;
    demand(integer(stride) && stride >= bytes * width && stride % bytes === 0 && start % bytes === 0 && start + (entry.count - 1) * stride + bytes * width <= view.data.length, "accessor exceeds its buffer view.");
    return { ...entry, width, read(index, component = 0) {
      const value = view.data[reader](start + index * stride + component * bytes);
      if (!entry.normalized || entry.componentType === 5126) return value;
      return entry.componentType === 5120 ? Math.max(-1, value / 127) : entry.componentType === 5122 ? Math.max(-1, value / 32767)
        : value / ({ 5121: 255, 5123: 65535, 5125: 4294967295 })[entry.componentType];
    } };
  });
  return { buffer, json, views, accessors, decodeUri };
}

/** Inspect PNG pixel payload as well as the size header; a changed IHDR cannot fake a larger atlas. */
function pngMetrics(bytes) {
  demand(bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "atlas is not a PNG.");
  let width, height, channels, bitDepth, ended = false; const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    demand(offset + 12 <= bytes.length, "truncated PNG chunk.");
    const count = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
    demand(offset + 12 + count <= bytes.length, "PNG chunk exceeds image payload.");
    const data = bytes.subarray(offset + 8, offset + 8 + count);
    if (type === "IHDR") {
      demand(width === undefined && count === 13, "invalid PNG IHDR.");
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8];
      channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[data[9]];
      demand(width > 0 && height > 0 && width <= 8192 && height <= 8192 && channels && [1, 2, 4, 8, 16].includes(bitDepth) && data[12] === 0, "unsupported PNG dimensions/format/interlace.");
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") { ended = true; break; }
    offset += count + 12;
  }
  demand(ended && width !== undefined && compressed.length, "incomplete PNG.");
  const rowBytes = Math.ceil(width * channels * bitDepth / 8), expected = height * (rowBytes + 1);
  let pixels;
  try { pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected + 1 }); }
  catch { throw Error("Fitted character: PNG pixel payload cannot be decoded."); }
  demand(pixels.length === expected, "PNG pixel payload does not match declared dimensions.");
  for (let row = 0; row < height; row++) demand(pixels[row * (rowBytes + 1)] <= 4, "invalid PNG scanline filter.");
  return { width, height, bytes: bytes.length };
}

/** Structural corruption throws; semantic contract failures remain in errors so all findings are visible. */
export function inspectFittedCharacter(input) {
  const { buffer, json, views, accessors, decodeUri } = unpack(input);
  const errors = [], warnings = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const accessor = (index, label) => { demand(integer(index) && accessors[index], `${label}: invalid accessor reference.`); return accessors[index]; };
  const values = (entry, i) => Array.from({ length: entry.width }, (_, c) => entry.read(i, c));
  const finiteAccessor = (entry, label) => {
    for (let i = 0; i < entry.count; i++) for (let c = 0; c < entry.width; c++) demand(Number.isFinite(entry.read(i, c)), `${label}: non-finite accessor data.`);
  };
  demand(Array.isArray(json.nodes) && json.nodes.length && Array.isArray(json.meshes) && json.meshes.length, "missing nodes/meshes.");
  const scene = json.scenes?.[json.scene ?? 0]; demand(scene && Array.isArray(scene.nodes) && scene.nodes.length, "missing default scene.");
  const matrices = new Map(), parents = new Map();
  const walk = (index, parentMatrix, parent = null) => {
    demand(integer(index) && json.nodes[index] && !matrices.has(index), "cyclic, multiply-parented or invalid scene node.");
    const node = json.nodes[index]; let local;
    if (node.matrix !== undefined) {
      demand(array(node.matrix, 16) && node.translation === undefined && node.rotation === undefined && node.scale === undefined, "invalid node matrix/TRS combination.");
      local = new Matrix4().fromArray(node.matrix);
    } else {
      const t = node.translation ?? [0, 0, 0], r = node.rotation ?? [0, 0, 0, 1], s = node.scale ?? [1, 1, 1];
      demand(array(t, 3) && array(r, 4) && array(s, 3) && Math.abs(Math.hypot(...r) - 1) < .003, "invalid node transform/quaternion.");
      local = new Matrix4().compose(new Vector3(...t), new Quaternion(...r), new Vector3(...s));
    }
    const matrix = parentMatrix.clone().multiply(local); matrices.set(index, matrix); parents.set(index, parent);
    demand(node.children === undefined || Array.isArray(node.children), "invalid node children.");
    for (const child of node.children ?? []) walk(child, matrix, index);
  };
  for (const index of scene.nodes) walk(index, new Matrix4());
  check(matrices.size === json.nodes.length, "Unreachable nodes are shipped outside the default character scene.");
  const characterRoot = json.nodes.findIndex(node => node.name === "character_root");
  const socket = json.nodes.findIndex(node => node.name === "tool_socket");
  check(characterRoot >= 0 && matrices.has(characterRoot), "Missing reachable character_root.");
  check(socket >= 0 && matrices.has(socket), "Missing reachable tool_socket.");
  if (characterRoot >= 0 && matrices.has(characterRoot)) {
    const position = new Vector3().setFromMatrixPosition(matrices.get(characterRoot));
    check(position.length() < 1e-4, "character_root pivot must be at ground origin.");
  }

  const joints = new Set(), skins = (json.skins ?? []).map((skin, i) => {
    demand(Array.isArray(skin.joints) && skin.joints.length && new Set(skin.joints).size === skin.joints.length, `skin${i}: missing/repeated joints.`);
    for (const joint of skin.joints) { demand(integer(joint) && matrices.has(joint), `skin${i}: joint is outside the active character scene.`); joints.add(joint); }
    const ibm = skin.inverseBindMatrices === undefined ? null : accessor(skin.inverseBindMatrices, "inverse bind matrices");
    if (ibm) { demand(ibm.type === "MAT4" && ibm.componentType === 5126 && ibm.count === skin.joints.length, "invalid inverse bind matrix count/type."); finiteAccessor(ibm, "inverse bind matrices"); }
    return { ...skin, transforms: skin.joints.map((joint, j) => matrices.get(joint).clone().multiply(ibm ? new Matrix4().fromArray(values(ibm, j)) : new Matrix4())) };
  });
  check(skins.length > 0, "No skin is exported."); check(joints.size <= 48, `Deform bone guardrail exceeded (${joints.size}/48).`);
  if (socket >= 0) {
    let boneParent = false;
    for (let p = parents.get(socket); p !== null && p !== undefined; p = parents.get(p)) if (joints.has(p)) boneParent = true;
    check(boneParent, "tool_socket is not parented beneath a skin joint.");
  }
  demand(Array.isArray(json.materials) && json.materials.length, "missing materials.");
  check(json.materials.length <= 4, `Material guardrail exceeded (${json.materials.length}/4).`);
  demand(Array.isArray(json.images) && json.images.length, "missing embedded atlas.");
  check(json.images.length === 1, `Expected one shared atlas, found ${json.images.length} images.`);
  const atlasImages = json.images.map(image => {
    let bytes;
    if (image.uri !== undefined) { demand(/^data:image\/png[;,]/.test(image.uri), "atlas data URI must be PNG."); bytes = decodeUri(image.uri); }
    else { demand(image.mimeType === "image/png" && integer(image.bufferView) && views[image.bufferView], "atlas must use an embedded PNG buffer view."); bytes = views[image.bufferView].data; }
    const metric = pngMetrics(bytes); check(metric.width === 2048 && metric.height === 2048, `Atlas must be 2048x2048, got ${metric.width}x${metric.height}.`); return metric;
  });
  for (const texture of json.textures ?? []) {
    demand(integer(texture.source) && json.images[texture.source], "texture references an invalid image.");
    const sampler = json.samplers?.[texture.sampler ?? 0];
    check(sampler && (sampler.magFilter ?? 9729) === 9729 && [9729, 9985, 9987].includes(sampler.minFilter ?? 9987), "Painted atlas requires linear filtering.");
  }
  for (const material of json.materials) {
    const texture = material.pbrMetallicRoughness?.baseColorTexture?.index;
    check(integer(texture) && json.textures?.[texture], "Every character material must reference the shared colour atlas.");
  }

  let triangles = 0, vertices = 0, primitives = 0, skinnedMeshes = 0, staticMeshes = 0, maxWeightError = 0;
  const bounds = new Box3(), original = new Vector3(), point = new Vector3(), transformed = new Vector3();
  for (const [index, matrix] of matrices) {
    const node = json.nodes[index]; if (node.mesh === undefined) continue;
    demand(integer(node.mesh) && json.meshes[node.mesh]?.primitives?.length, "invalid/empty mesh reference.");
    const skin = node.skin === undefined ? null : skins[node.skin];
    demand(node.skin === undefined || integer(node.skin) && skin, "invalid skin reference.");
    if (skin) skinnedMeshes++;
    else {
      staticMeshes++;
      let attachedToJoint = false;
      for (let p = parents.get(index); p !== null && p !== undefined; p = parents.get(p)) if (joints.has(p)) attachedToJoint = true;
      check(attachedToJoint, `Static character mesh ${node.name ?? index} must be attached beneath a joint.`);
    }
    for (const primitive of json.meshes[node.mesh].primitives) {
      demand((primitive.mode ?? 4) === 4 && primitive.attributes, "only authored triangle primitives are supported.");
      const position = accessor(primitive.attributes.POSITION, "POSITION"), normal = accessor(primitive.attributes.NORMAL, "NORMAL"), uv = accessor(primitive.attributes.TEXCOORD_0, "TEXCOORD_0");
      demand(position.type === "VEC3" && position.componentType === 5126 && normal.type === "VEC3" && uv.type === "VEC2" && normal.count === position.count && uv.count === position.count, "invalid vertex attribute type/count.");
      finiteAccessor(position, "POSITION"); finiteAccessor(normal, "NORMAL"); finiteAccessor(uv, "TEXCOORD_0");
      let count = position.count;
      if (primitive.indices !== undefined) {
        const indices = accessor(primitive.indices, "indices");
        demand(indices.type === "SCALAR" && [5121, 5123, 5125].includes(indices.componentType), "invalid index type.");
        for (let i = 0; i < indices.count; i++) demand(indices.read(i) < position.count, "triangle index exceeds vertex count.");
        count = indices.count;
      }
      demand(count % 3 === 0 && integer(primitive.material) && json.materials[primitive.material], "invalid triangle count/material.");
      let jointIndices, weights;
      if (skin) {
        jointIndices = accessor(primitive.attributes.JOINTS_0, "JOINTS_0"); weights = accessor(primitive.attributes.WEIGHTS_0, "WEIGHTS_0");
        demand(jointIndices.type === "VEC4" && [5121, 5123].includes(jointIndices.componentType) && !jointIndices.normalized && weights.type === "VEC4" && [5121, 5123, 5126].includes(weights.componentType) && jointIndices.count === position.count && weights.count === position.count, "invalid skin vec4 attribute type/count.");
        check(primitive.attributes.JOINTS_1 === undefined && primitive.attributes.WEIGHTS_1 === undefined, "More than four skin influences are exported.");
        demand(weights.componentType === 5126 || weights.normalized === true, "integer skin weights must be normalized.");
      }
      for (let i = 0; i < position.count; i++) {
        original.fromArray(values(position, i));
        if (!skin) point.copy(original).applyMatrix4(matrix);
        else {
          point.set(0, 0, 0); let total = 0;
          for (let channel = 0; channel < 4; channel++) {
            const joint = jointIndices.read(i, channel), weight = weights.read(i, channel);
            demand(integer(joint) && joint < skin.joints.length, "skin joint index exceeds bound joints.");
            demand(Number.isFinite(weight) && weight >= 0 && weight <= 1, "skin weights must be finite and within[0,1].");
            total += weight;
            if (weight) point.addScaledVector(transformed.copy(original).applyMatrix4(skin.transforms[joint]), weight);
          }
          maxWeightError = Math.max(maxWeightError, Math.abs(total - 1));
        }
        bounds.expandByPoint(point);
      }
      primitives++; triangles += count / 3; vertices += position.count;
    }
  }
  check(skinnedMeshes > 0, "No actual skinned mesh instance exists.");
  check(triangles <= 24000, `Triangle guardrail exceeded (${triangles}/24000).`);
  check(maxWeightError <= .001, `Skin weights are not normalized (maximum sum error ${maxWeightError}).`);
  const size = bounds.getSize(new Vector3());
  check(!bounds.isEmpty() && bounds.min.y >= -.02 && bounds.min.y <= .05, `Feet must meet Y=0 (minimum ${bounds.min.y}).`);
  check(size.y >= 1.9 && size.y <= 2.1, `Character must be approximately two units tall (height ${size.y}).`);

  const rootNodes = new Set([characterRoot, ...[...joints].filter(i => /^(root|root_motion|character_root)$/i.test(json.nodes[i].name ?? ""))]);
  const clipMetrics = [];
  for (const name of requiredClips) {
    const candidates = (json.animations ?? []).filter(clip => clip.name === name);
    if (candidates.length !== 1) { errors.push(`Expected one ${name} clip, found ${candidates.length}.`); continue; }
    const clip = candidates[0]; demand(Array.isArray(clip.channels) && Array.isArray(clip.samplers), `${name}: invalid animation channels/samplers.`);
    let duration = 0, movingChannels = 0, movingJointChannels = 0;
    for (const channel of clip.channels) {
      const sampler = clip.samplers[channel.sampler], target = channel.target;
      demand(sampler && target && matrices.has(target.node) && ["translation", "rotation", "scale", "weights"].includes(target.path), `${name}: invalid animation target.`);
      const time = accessor(sampler.input, "animation time"), output = accessor(sampler.output, "animation output"), interpolation = sampler.interpolation ?? "LINEAR";
      demand(time.type === "SCALAR" && time.componentType === 5126 && ["LINEAR", "STEP", "CUBICSPLINE"].includes(interpolation), `${name}: invalid animation time/interpolation.`);
      finiteAccessor(time, "animation time"); finiteAccessor(output, "animation output");
      for (let i = 0; i < time.count; i++) demand(time.read(i) >= 0 && (i === 0 || time.read(i) > time.read(i - 1)), `${name}: time keys are not strictly increasing.`);
      duration = Math.max(duration, time.read(time.count - 1));
      const width = target.path === "rotation" ? 4 : target.path === "weights" ? output.width : 3;
      demand(output.width === width && output.componentType === 5126 && output.count === time.count * (interpolation === "CUBICSPLINE" ? 3 : 1), `${name}: invalid animation output dimensions.`);
      const key = i => values(output, interpolation === "CUBICSPLINE" ? i * 3 + 1 : i), first = key(0);
      let moved = false;
      for (let i = 0; i < time.count; i++) {
        const value = key(i);
        if (target.path === "rotation") {
          demand(Math.abs(Math.hypot(...value) - 1) < .003, `${name}: animation quaternion is not normalized.`);
          moved ||= 1 - Math.abs(first.reduce((sum, v, c) => sum + v * value[c], 0)) > 1e-7;
        } else moved ||= value.some((v, c) => Math.abs(v - first[c]) > 1e-5);
        if (rootNodes.has(target.node) && target.path === "translation") check(Math.abs(value[0] - first[0]) <= 1e-4 && Math.abs(value[2] - first[2]) <= 1e-4, `${name}: root has horizontal motion; clips must be in place.`);
        if (interpolation === "CUBICSPLINE") for (const tangentIndex of [i * 3, i * 3 + 2]) {
          const tangent = values(output, tangentIndex);
          if (target.path === "rotation") {
            const parallel = value.reduce((sum, v, c) => sum + v * tangent[c], 0);
            moved ||= tangent.some((v, c) => Math.abs(v - parallel * value[c]) > 1e-5);
          } else moved ||= tangent.some(v => Math.abs(v) > 1e-5);
          if (rootNodes.has(target.node) && target.path === "translation") check(Math.abs(tangent[0]) <= 1e-5 && Math.abs(tangent[2]) <= 1e-5, `${name}: cubic root tangents cause horizontal motion; clips must be in place.`);
        }
      }
      if (moved) { movingChannels++; if (joints.has(target.node)) movingJointChannels++; }
    }
    check(duration > 0, `${name}: clip duration is zero.`); check(movingJointChannels > 0, `${name}: clip contains no changing joint keyframes.`);
    clipMetrics.push({ name, duration, channels: clip.channels.length, movingChannels, movingJointChannels });
  }
  if (primitives > 12) warnings.push(`${primitives} render primitives remain; merging compatible skinned geometry in Blender can reduce submissions.`);
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings, bytes: buffer.length, triangles, vertices,
    meshes: json.meshes.length, meshInstances: skinnedMeshes + staticMeshes, skinnedMeshes, staticMeshes, primitives,
    materials: json.materials.length, deformBones: joints.size, maxWeightError, nodes: json.nodes.length,
    atlas: atlasImages[0], bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() }, clips: clipMetrics,
    artAccepted: false, exclusions: ["likeness", "edge-flow quality", "deformation quality", "self-intersections", "source sculpt fidelity"] };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2); demand(args.every(arg => arg === "--json" || !arg.startsWith("--")) && args.filter(arg => arg !== "--json").length <= 1, "usage: node scripts/check-fitted-character.mjs [--json] [path.glb]");
    const file = args.find(arg => arg !== "--json") ?? resolve(root, "public/art3d/fitted/alden-fitted.glb");
    const report = inspectFittedCharacter(await readFile(file));
    if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Fitted character${report.valid ? " checked" : " failed"}: ${report.triangles} triangles, ${report.vertices} vertices, ${report.deformBones} bones, ${report.primitives} primitives, ${report.bytes} bytes`);
      report.errors.forEach(error => console.error(`ERROR: ${error}`)); report.warnings.forEach(warning => console.warn(`NOTE: ${warning}`));
      console.log("Technical validation only; art acceptance remains pending.");
    }
    if (!report.valid) process.exitCode = 1;
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
