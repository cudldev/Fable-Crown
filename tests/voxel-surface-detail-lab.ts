import * as THREE from "three";
import { installVoxelSurfaceDetail,VOXEL_SURFACE_DETAIL_PROFILE } from "../src/render/three/voxel-surface-detail";
import { acquireVoxelDiffuseDetail, VOXEL_DIFFUSE_DETAIL_SIZE } from "../src/render/three/voxel-diffuse-detail";

export interface SurfaceLabResult {
  pitch: number;
  offDelta: number;
  shadingDelta: number;
  variationDelta: number;
  repeatDelta: number;
  uniformCellDelta: number;
  variedCellDelta: number;
  transformDeltas: { name: string; delta: number }[];
  minification: SurfaceMinificationSample[];
  cellRelief: {
    interiorDelta: number;
    interiorColorRange: number;
    cellCenterShadeRange: number;
    centerBrightening: number;
    minMean: number;
    maxMean: number;
    lowReliefCells: number;
    cells: { row: number; column: number; centerColor: number[]; interiorColorRange: number; meanEdgeRelief: number }[];
  };
  topologyUnchanged: boolean;
  textures: number;
  bakedTexture: { size: number[]; bytes: number; minimum: number; maximum: number; sharedIdentity: boolean; generateMipmaps: boolean; minFilter: number; magFilter: number; format: number; type: number; colorSpace: string; hardwareMinFilter: number; hardwareMagFilter: number; mipLevels: { level: number; size: number; complete: boolean }[]; texturesAfterUniformChanges: number };
  programCounts: [number, number];
  glError: number;
  renderer: string;
}
export interface SurfaceMinificationSample {
  pixelsPerCell: number;
  buffer: [number, number];
  offsetPixels: readonly [number, number];
  surfacePixels: number;
  offDelta: number;
  meanDelta: number;
  p95Delta: number;
  maxChannelDelta: number;
  surfaceColorRange: number;
  maxBrightening: number;
  repeatDelta: number;
}
export interface SurfaceLab {
  result: SurfaceLabResult;
  show(mode: "stock" | "off" | "uniform" | "varied" | "instanced"): void;
  showMinification(pixelsPerCell: number, offsetPixels?: readonly [number, number]): void;
  inspectDisposal(): { before: number; afterOneMaterial: number; afterLastMaterial: number; afterLastLease: number; disposeEvents: number };
}
declare global { interface Window { voxelSurfaceLab: SurfaceLab } }

// The source is a native-pitch coplanar face with uniform geometry and albedo.
// Its shader may add edge relief and a tiny constant tint per occupied cell;
// the interiors must remain flat, without face grain or a sloping facet.
const pitch = .0625*VOXEL_SURFACE_DETAIL_PROFILE.cellScale, columns = 8, rows = 6, width = columns * pitch, height = rows * pitch;
const pixelWidth = 640, pixelHeight = 480;
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas")!, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(pixelWidth, pixelHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x25332b);
scene.add(new THREE.AmbientLight(0xffffff, .2));
const sun = new THREE.DirectionalLight(0xffffff, 2); scene.add(sun, sun.target);
const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .01, 100);
const geometry = new THREE.PlaneGeometry(width, height);
geometry.translate(0, 0, pitch / 2);
const topology = () => JSON.stringify({ position: [...geometry.attributes.position.array], normal: [...geometry.attributes.normal.array], index: [...geometry.index!.array] });
const originalTopology = topology();
const stockMaterial = new THREE.MeshLambertMaterial({ color: 0xa58b60 });
const detailMaterial = stockMaterial.clone(), strength = { value: 0 }, variation = { value: .65 };
const detailOptions = { pitch, origin: [-width / 2, -height / 2, -pitch / 2] as const, strength, variation };
installVoxelSurfaceDetail(detailMaterial, detailOptions);
const textureLease = acquireVoxelDiffuseDetail(), secondLease = acquireVoxelDiffuseDetail();
const sharedIdentity = textureLease.texture === secondLease.texture; secondLease.release();
let disposeEvents = 0; textureLease.texture.addEventListener("dispose", () => { disposeEvents++; });
const stock = new THREE.Mesh(geometry, stockMaterial), detail = new THREE.Mesh(geometry, detailMaterial);
const instanced = new THREE.InstancedMesh(geometry, detailMaterial, 1);
instanced.frustumCulled = false; scene.add(stock, detail, instanced);
const gl = renderer.getContext();
const identity = new THREE.Matrix4();
function configure(matrix = identity, rotation = new THREE.Quaternion(), scale = 1) {
  stock.matrixAutoUpdate = detail.matrixAutoUpdate = false;
  stock.matrix.copy(matrix); detail.matrix.copy(matrix);
  instanced.setMatrixAt(0, matrix); instanced.instanceMatrix.needsUpdate = true;
  const at = (point: THREE.Vector3) => point.applyMatrix4(matrix);
  camera.position.copy(at(new THREE.Vector3(0, 0, 3)));
  camera.up.set(0, 1, 0).applyQuaternion(rotation);
  camera.lookAt(at(new THREE.Vector3()));
  camera.left = -width / 2 * scale; camera.right = width / 2 * scale;
  camera.top = height / 2 * scale; camera.bottom = -height / 2 * scale;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  sun.position.copy(at(new THREE.Vector3(-.6, .8, 2)));
  sun.target.position.copy(at(new THREE.Vector3()));
  scene.updateMatrixWorld(true);
}
function draw(mode: "stock" | "detail" | "instanced") {
  stock.visible = mode === "stock"; detail.visible = mode === "detail"; instanced.visible = mode === "instanced";
  renderer.render(scene, camera);
  const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}
function difference(a: Uint8Array, b: Uint8Array) {
  let delta = 0;
  for (let i = 0; i < a.length; i++) if (i % 4 !== 3) delta += Math.abs(a[i] - b[i]);
  return delta / (a.length * .75);
}
function cellDifference(pixels: Uint8Array) {
  const cellWidth = pixelWidth / columns, cellHeight = pixelHeight / rows;
  let delta = 0, samples = 0;
  // Exclude the outermost pixel, where rasterizer edge ownership is not a
  // procedural-pattern property. Compare corresponding positions in 48 cells.
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    if (!row && !column) continue;
    for (let y = 2; y < cellHeight - 2; y++) for (let x = 2; x < cellWidth - 2; x++) for (let color = 0; color < 3; color++) {
      const first = (y * pixelWidth + x) * 4 + color;
      const next = ((row * cellHeight + y) * pixelWidth + column * cellWidth + x) * 4 + color;
      delta += Math.abs(pixels[first] - pixels[next]); samples++;
    }
  }
  return delta / samples;
}
function configureMinification(pixelsPerCell: number, offsetPixels: readonly [number, number]) {
  // Keep the physical face/frustum fixed and reduce the actual drawing buffer.
  // CSS size follows the buffer: these are real minified targets, never enlarged
  // screenshots of a tiny render. Offsets move the projected grid by fractions
  // of one pixel, without moving either its source coordinates or the light.
  renderer.setSize(columns * pixelsPerCell, rows * pixelsPerCell);
  configure();
  const x = offsetPixels[0] * width / gl.drawingBufferWidth, y = offsetPixels[1] * height / gl.drawingBufferHeight;
  camera.position.x += x; camera.position.y += y;
  camera.lookAt(x, y, 0); camera.updateMatrixWorld();
}
function surfaceContrast(reference: Uint8Array, modified: Uint8Array, flatRgb: Uint8Array) {
  const deltas: number[] = []; let sum = 0, maxChannelDelta = 0, maxBrightening = 0;
  const minimum = [255, 255, 255], maximum = [0, 0, 0];
  for (let i = 0; i < reference.length; i += 4) {
    // A solid stock Lambert face is constant under this orthographic, fixed
    // directional light. Match its actual rasterized color to exclude uncovered
    // edge/background pixels consistently at every resolution and offset.
    if ([0, 1, 2].some(channel => Math.abs(reference[i + channel] - flatRgb[channel]) > 1)) continue;
    let rgbDelta = 0;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(reference[i + channel] - modified[i + channel]);
      rgbDelta += delta; maxChannelDelta = Math.max(maxChannelDelta, delta);
      maxBrightening = Math.max(maxBrightening, modified[i + channel] - reference[i + channel]);
      minimum[channel] = Math.min(minimum[channel], modified[i + channel]); maximum[channel] = Math.max(maximum[channel], modified[i + channel]);
    }
    deltas.push(rgbDelta / 3); sum += rgbDelta / 3;
  }
  deltas.sort((a, b) => a - b);
  return { surfacePixels: deltas.length, meanDelta: sum / Math.max(1, deltas.length), p95Delta: deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * .95))] ?? 0, maxChannelDelta,
    surfaceColorRange: deltas.length ? Math.max(...maximum.map((value, channel) => value - minimum[channel])) : 0, maxBrightening };
}
configure();
const baseline = draw("stock"), off = draw("detail");
strength.value = .55; variation.value = 0;
const uniform = draw("detail");
variation.value = .65;
const varied = draw("detail"), repeated = draw("detail");
const cellEnergies: number[] = [], cells: SurfaceLabResult["cellRelief"]["cells"] = [];
let interiorDelta = 0, interiorColorRange = 0, centerBrightening = 0;
const minimumCenter = [255, 255, 255], maximumCenter = [0, 0, 0];
for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
  let sum = 0, count = 0; const cw = pixelWidth / columns, ch = pixelHeight / rows;
  const centerAt = ((row * ch + ch / 2) * pixelWidth + column * cw + cw / 2) * 4;
  const centerColor = [...varied.slice(centerAt, centerAt + 3)];
  const minimumInterior = [255, 255, 255], maximumInterior = [0, 0, 0];
  for (let channel = 0; channel < 3; channel++) {
    minimumCenter[channel] = Math.min(minimumCenter[channel], centerColor[channel]); maximumCenter[channel] = Math.max(maximumCenter[channel], centerColor[channel]);
    centerBrightening = Math.max(centerBrightening, centerColor[channel] - baseline[centerAt + channel]);
  }
  for (let y = 2; y < ch - 2; y++) for (let x = 2; x < cw - 2; x++) for (let channel = 0; channel < 3; channel++) {
    const at = ((row * ch + y) * pixelWidth + column * cw + x) * 4 + channel;
    // Reference each cell's own flat center: its permitted constant darkness
    // must not masquerade as bevel energy or make a quiet cell appear active.
    sum += Math.abs(varied[at] - centerColor[channel]); count++;
    if (x > cw * .3 && x < cw * .7 && y > ch * .3 && y < ch * .7) {
      interiorDelta = Math.max(interiorDelta, Math.abs(varied[at] - baseline[at]));
      minimumInterior[channel] = Math.min(minimumInterior[channel], varied[at]); maximumInterior[channel] = Math.max(maximumInterior[channel], varied[at]);
    }
  }
  const range = Math.max(...maximumInterior.map((value, channel) => value - minimumInterior[channel])), meanEdgeRelief = sum / count;
  interiorColorRange = Math.max(interiorColorRange, range); cellEnergies.push(meanEdgeRelief);
  cells.push({ row, column, centerColor, interiorColorRange: range, meanEdgeRelief });
}
const strongestCell = Math.max(...cellEnergies), cellRelief = { interiorDelta, interiorColorRange,
  cellCenterShadeRange: Math.max(...maximumCenter.map((value, channel) => value - minimumCenter[channel])), centerBrightening,
  minMean: Math.min(...cellEnergies), maxMean: strongestCell, lowReliefCells: cellEnergies.filter(energy => energy <= Math.min(...cellEnergies)+(strongestCell-Math.min(...cellEnergies))*.2).length, cells };
draw("instanced"); // Compile the instanced path before checking uniform-only tuning.
const programsBefore = renderer.info.programs?.length ?? 0;
const transformDeltas: SurfaceLabResult["transformDeltas"] = [];
for (const [name, translation, turn, scale] of [
  ["identity instance", new THREE.Vector3(), new THREE.Quaternion(), 1],
  ["fractional translation", new THREE.Vector3(2.13, -1.41, .52), new THREE.Quaternion(), 1],
  ["quarter-turn Y", new THREE.Vector3(.37, .19, -.53), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), 1],
  ["quarter-turn X", new THREE.Vector3(-.17, .53, .31), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), 1],
  ["uniform scale", new THREE.Vector3(.7, -.3, .2), new THREE.Quaternion(), 1.75],
] as const) {
  const matrix = new THREE.Matrix4().compose(translation, turn, new THREE.Vector3(scale, scale, scale));
  configure(matrix, turn, scale);
  transformDeltas.push({ name, delta: difference(varied, draw("instanced")) });
}
const minification: SurfaceMinificationSample[] = [];
const center = ((pixelHeight / 2) * pixelWidth + pixelWidth / 2) * 4;
const flatRgb = baseline.slice(center, center + 3);
for (const pixelsPerCell of [16, 8, 4, 2, 1, .5]) for (const offsetPixels of [[0, 0], [.17, .31], [.43, -.27]] as const) {
  configureMinification(pixelsPerCell, offsetPixels);
  const reference = draw("stock"); strength.value = 0;
  const disabled = draw("detail"); strength.value = .55; variation.value = .65;
  const enabled = draw("detail"), repeat = draw("detail");
  minification.push({ pixelsPerCell, buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], offsetPixels,
    offDelta: difference(reference, disabled), ...surfaceContrast(reference, enabled, flatRgb), repeatDelta: difference(enabled, repeat) });
}
renderer.setSize(pixelWidth, pixelHeight);
configure(); strength.value = 0; draw("detail"); strength.value = .55; variation.value = .65; draw("detail");
const probeMaterial = stockMaterial.clone(); installVoxelSurfaceDetail(probeMaterial, detailOptions);
detail.material = probeMaterial; draw("detail"); detail.material = detailMaterial; draw("detail");
const texture = textureLease.texture, gl3 = gl as WebGL2RenderingContext;
const textureHandle = (renderer.properties.get(texture) as { __webglTexture: WebGLTexture }).__webglTexture;
const previousTexture = gl3.getParameter(gl3.TEXTURE_BINDING_3D) as WebGLTexture | null;
gl3.bindTexture(gl3.TEXTURE_3D, textureHandle);
const hardwareMinFilter = gl3.getTexParameter(gl3.TEXTURE_3D, gl3.TEXTURE_MIN_FILTER) as number;
const hardwareMagFilter = gl3.getTexParameter(gl3.TEXTURE_3D, gl3.TEXTURE_MAG_FILTER) as number;
gl3.bindTexture(gl3.TEXTURE_3D, previousTexture);
const previousDraw = gl3.getParameter(gl3.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
const previousRead = gl3.getParameter(gl3.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
const framebuffer = gl3.createFramebuffer(), mipLevels: SurfaceLabResult["bakedTexture"]["mipLevels"] = [];
gl3.bindFramebuffer(gl3.FRAMEBUFFER, framebuffer);
for (let level = 0; level <= Math.log2(VOXEL_DIFFUSE_DETAIL_SIZE); level++) {
  gl3.framebufferTextureLayer(gl3.FRAMEBUFFER, gl3.COLOR_ATTACHMENT0, textureHandle, level, 0);
  mipLevels.push({ level, size: VOXEL_DIFFUSE_DETAIL_SIZE / 2 ** level, complete: gl3.checkFramebufferStatus(gl3.FRAMEBUFFER) === gl3.FRAMEBUFFER_COMPLETE });
}
gl3.bindFramebuffer(gl3.DRAW_FRAMEBUFFER, previousDraw); gl3.bindFramebuffer(gl3.READ_FRAMEBUFFER, previousRead); gl3.deleteFramebuffer(framebuffer);
const bakedBytes = texture.image.data as Uint8Array;
const bakedTexture = { size: [texture.image.width, texture.image.height, texture.image.depth], bytes: bakedBytes.length,
  minimum: Math.min(...bakedBytes), maximum: Math.max(...bakedBytes), sharedIdentity, generateMipmaps: texture.generateMipmaps,
  minFilter: texture.minFilter, magFilter: texture.magFilter, format: texture.format, type: texture.type, colorSpace: texture.colorSpace,
  hardwareMinFilter, hardwareMagFilter, mipLevels, texturesAfterUniformChanges: renderer.info.memory.textures };
const debug = gl.getExtension("WEBGL_debug_renderer_info");
window.voxelSurfaceLab = {
  result: { pitch, offDelta: difference(baseline, off), shadingDelta: difference(off, uniform), variationDelta: difference(uniform, varied), repeatDelta: difference(varied, repeated),
    uniformCellDelta: cellDifference(uniform), variedCellDelta: cellDifference(varied), transformDeltas, minification,cellRelief, bakedTexture, topologyUnchanged: topology() === originalTopology,
    textures: renderer.info.memory.textures, programCounts: [programsBefore, renderer.info.programs?.length ?? 0], glError: gl.getError(),
    renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)) },
  show(mode) {
    renderer.setSize(pixelWidth, pixelHeight);
    configure(); strength.value = mode === "off" ? 0 : .55; variation.value = mode === "uniform" ? 0 : .65;
    draw(mode === "stock" ? "stock" : mode === "instanced" ? "instanced" : "detail");
  },
  showMinification(pixelsPerCell, offsetPixels = [0, 0]) {
    configureMinification(pixelsPerCell, offsetPixels); strength.value = .55; variation.value = .65; draw("detail");
  },
  inspectDisposal() {
    const before = renderer.info.memory.textures;
    probeMaterial.dispose(); probeMaterial.dispose();
    const afterOneMaterial = renderer.info.memory.textures;
    detailMaterial.dispose(); detailMaterial.dispose();
    const afterLastMaterial = renderer.info.memory.textures;
    textureLease.release(); textureLease.release();
    return { before, afterOneMaterial, afterLastMaterial, afterLastLease: renderer.info.memory.textures, disposeEvents };
  },
};
