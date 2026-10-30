import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { parseVox, type VoxelGrid } from "../../src/render/three/voxel-data";

export interface TileSpec { id: string; file: string; pitch: number; pivot: [number, number, number]; shape?: "flat" | "stair" }
interface TileManifest {
  assets: TileSpec[];
  variants?: Record<string, string[]>;
  variantPeriod?: number;
  reviewIds?: string[];
  style?: string;
}

/** Derive surfaces from the actual editable source. Adjacent occupied cells emit no hidden faces. */
export function tileGeometry(grid: VoxelGrid, pitch: number, pivot: readonly number[]): T.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], color = new T.Color();
  const get = (p: number[]) => p.some((n, i) => n < 0 || n >= grid.size[i]) ? 0 : grid.cells[(p[0] * grid.size[1] + p[1]) * grid.size[2] + p[2]];
  const world = (p: number[]) => [(p[0] - pivot[0]) * pitch, (p[2] - pivot[2]) * pitch, -(p[1] - pivot[1]) * pitch];
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const sign of [-1, 1]) for (let k = 0; k < grid.size[axis]; k++) {
      const mask = new Uint8Array(grid.size[u] * grid.size[v]);
      for (let a = 0; a < grid.size[u]; a++) for (let b = 0; b < grid.size[v]; b++) {
        const p = [0, 0, 0]; p[axis] = k; p[u] = a; p[v] = b;
        const id = get(p); p[axis] += sign;
        if (id && !get(p)) mask[a * grid.size[v] + b] = id;
      }
      for (let a = 0; a < grid.size[u]; a++) for (let b = 0; b < grid.size[v]; b++) {
        const id = mask[a * grid.size[v] + b]; if (!id) continue;
        let width = 1, height = 1;
        while (b + width < grid.size[v] && mask[a * grid.size[v] + b + width] === id) width++;
        row: while (a + height < grid.size[u]) {
          for (let j = 0; j < width; j++) if (mask[(a + height) * grid.size[v] + b + j] !== id) break row;
          height++;
        }
        for (let i = 0; i < height; i++) mask.fill(0, (a + i) * grid.size[v] + b, (a + i) * grid.size[v] + b + width);
        const p = [0, 0, 0]; p[axis] = k + Number(sign > 0); p[u] = a; p[v] = b;
        const du = [0, 0, 0], dv = [0, 0, 0]; du[u] = height; dv[v] = width;
        let corners = [p, p.map((n, i) => n + du[i]), p.map((n, i) => n + du[i] + dv[i]), p.map((n, i) => n + dv[i])];
        if (sign < 0) corners = corners.reverse();
        const normal = [0, 0, 0]; normal[axis] = sign;
        const runtimeNormal = [normal[0], normal[2], -normal[1]];
        const at = (id - 1) * 4;
        color.setRGB(grid.palette[at] / 255, grid.palette[at + 1] / 255, grid.palette[at + 2] / 255, T.SRGBColorSpace);
        for (const index of [0, 1, 2, 0, 2, 3]) { positions.push(...world(corners[index])); normals.push(...runtimeNormal); colors.push(color.r, color.g, color.b); }
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

export function gridAudit(grid: VoxelGrid, spec: TileSpec) {
  const heights: number[] = [];
  for (let x = 0; x < grid.size[0]; x++) for (let y = 0; y < grid.size[1]; y++) {
    let high = 0;
    for (let z = 0; z < grid.size[2]; z++) if (grid.cells[(x * grid.size[1] + y) * grid.size[2] + z]) high = z + 1;
    heights.push((high - spec.pivot[2]) * spec.pitch);
  }
  return { id: spec.id, shape: spec.shape ?? (spec.id.startsWith("stairs-stone-east") ? "stair" : "flat"), dimensions: grid.size, cells: grid.cells.reduce((sum, n) => sum + Number(n > 0), 0), columnTopHeights: [...new Set(heights)].sort((a, b) => a - b), pitch: spec.pitch, pivot: spec.pivot };
}

async function start() {
  const kit = new URLSearchParams(location.search).get("kit") ?? "terrain-kit-v1";
  if (!/^[a-z0-9-]{1,64}$/.test(kit)) throw Error("Invalid local terrain kit basename");
  const source = `/assets/source/voxel/${kit}/`;
  const response = await fetch(source + "manifest.json"); if (!response.ok) throw Error("Missing native terrain manifest");
  const manifest = await response.json() as TileManifest;
  if (!Array.isArray(manifest.assets) || !manifest.assets.length) throw Error("Empty native terrain kit");
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  document.body.append(renderer.domElement);
  const scene = new T.Scene(); scene.background = new T.Color("#e3e2d9");
  scene.add(new T.HemisphereLight(0xf4f7f3, 0x73716a, 2));
  const sun = new T.DirectionalLight(0xffffff, 2.1); sun.position.set(-6, 12, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 35 }); sun.shadow.normalBias = .02;
  scene.add(sun);
  const camera = new T.PerspectiveCamera(38, 1, .05, 80);
  const topCamera = new T.OrthographicCamera(-8, 8, 5, -5, .05, 80); topCamera.up.set(0, 0, -1);
  let activeCamera: T.Camera = camera;
  const controls = new OrbitControls<T.Camera>(camera, renderer.domElement); controls.enableDamping = true;
  const material = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const unlitMaterial = new T.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  const geometries = new Map<string, T.BufferGeometry>(), audits = [];
  for (const spec of manifest.assets) {
    if (!/^[a-z0-9-]+$/.test(spec.id) || spec.file !== spec.id + ".vox" || geometries.has(spec.id)) throw Error("Invalid local terrain tile ID/file");
    const response = await fetch(source + spec.file); if (!response.ok) throw Error("Missing VOX: " + spec.id);
    const grid = parseVox(await response.arrayBuffer()), geometry = tileGeometry(grid, spec.pitch, spec.pivot);
    const bounds = geometry.boundingBox!;
    if (![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) throw Error("Non-finite tile bound");
    audits.push({ ...gridAudit(grid, spec), triangles: geometry.getAttribute("position").count / 3, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } });
    geometries.set(spec.id, geometry);
  }
  const root = new T.Group(); scene.add(root);
  const baseCamera = new T.Vector3(), moduleLabels: { element: HTMLDivElement; position: T.Vector3 }[] = [];
  let mode = "terrain";
  const placements: { id: string; x: number; y: number; z: number; rotation: number }[] = [];
  const variants = (kind: string, x: number, z: number, fallback: string) => {
    const choices = manifest.variants?.[kind];
    if (!choices?.length) return fallback;
    const period = manifest.variantPeriod ?? 4;
    if (!Number.isInteger(period) || period < 1 || period > 32 || choices.length !== period * period) throw Error("Invalid terrain material phase table");
    const mod = (n: number) => (n % period + period) % period;
    const at = mod(-z) * period + mod(x);
    return choices[at];
  };
  const label = document.createElement("header"); document.body.append(label);
  function show(next: "terrain" | "modules" | "top" | "detail" | "unlit") {
    mode = next; placements.length = 0;
    scene.overrideMaterial = next === "unlit" ? unlitMaterial : null;
    activeCamera = next === "top" ? topCamera : camera; controls.object = activeCamera;
    controls.enabled = next !== "top";
    for (const label of moduleLabels) label.element.remove(); moduleLabels.length = 0;
    for (const child of [...root.children]) { if (child instanceof T.InstancedMesh) child.dispose(); root.remove(child); }
    const add = (id: string, x: number, y: number, z: number, rotation = 0) => placements.push({ id, x, y, z, rotation });
    if (mode === "modules") {
      const ids = manifest.reviewIds ?? manifest.assets.map(spec => spec.id), rows = Math.ceil(ids.length / 5);
      ids.forEach((id, i) => {
        const x = (i % 5 - 2) * 1.7, z = (Math.floor(i / 5) - (rows - 1) / 2) * 1.9; add(id, x, 0, z);
        const element = document.createElement("div"); element.textContent = id;
        Object.assign(element.style, { position: "absolute", fontSize: "11px", padding: "3px 5px", borderRadius: "3px", background: "#e3e2d9dd", transform: "translate(-50%,0)", pointerEvents: "none" });
        document.body.append(element); moduleLabels.push({ element, position: new T.Vector3(x, -.45, z + .6) });
      });
      camera.position.set(-5.2, 7.3, 8).multiplyScalar(Math.max(1, rows / 3.5)); controls.target.set(0, -.03, 0);
    } else {
      for (let z = -3; z <= 3; z++) for (let x = -5; x <= 5; x++) {
        const raised = x >= 3, y = raised ? .5 : 0;
        let id = variants("grass", x, z, (x + z) % 3 ? "grass-a" : "grass-b"), rotation = 0;
        if (z === 0) id = x === 2 ? variants("stairs-stone-east", x, z, "stairs-stone-east") : variants("cobble", x, z, "cobble-a");
        else if (z === -1 || z === 1) {
          const south = z === -1 && manifest.variants?.["grass-dirt-edge-south"];
          id = variants(south ? "grass-dirt-edge-south" : "grass-dirt-edge", x, z, "grass-dirt-edge");
          rotation = z === -1 && !south ? Math.PI : 0;
        }
        else if (x <= -4 && z >= 2) {
          if (manifest.variants?.["grass-sand-edge"]?.length) {
            if (x === -5 && z === 3) id = variants("sand", x, z, "sand-a");
            else if (x === -4 && z === 3) { id = variants("grass-sand-edge", x, z, "grass-sand-edge"); rotation = Math.PI / 2; }
            else if (x === -5 && z === 2) id = variants("grass-sand-edge-south", x, z, "grass-sand-edge-south");
            else if (x === -4 && z === 2) { id = variants("grass-sand-inner", x, z, "grass-sand-inner"); rotation = Math.PI / 2; }
          } else id = variants("sand", x, z, "sand-a");
        }
        else if (x === 5 && z === -3) id = variants("cliff-stone", x, z, "cliff-stone");
        const stairs = id.startsWith("stairs-stone-east");
        if (raised || stairs) add(variants("cliff-stone", x, z, "cliff-stone"), x, 0, z);
        add(id, x, stairs ? 0 : y, z, rotation);
      }
      camera.position.set(-8.8, 7.5, 10); controls.target.set(.3, .05, 0);
      if (mode === "detail") { camera.position.set(-3.8, 4.1, 4.8); controls.target.set(.25, .08, 0); }
      if (mode === "top") { topCamera.position.set(.3, 18, 0); controls.target.set(.3, 0, 0); topCamera.lookAt(controls.target); }
    }
    for (const id of new Set(placements.map(p => p.id))) {
      const entries = placements.filter(p => p.id === id), geometry = geometries.get(id);
      if (!geometry) throw Error("Missing tile module " + id);
      const mesh = new T.InstancedMesh(geometry, material, entries.length), matrix = new T.Matrix4();
      entries.forEach((entry, index) => { matrix.makeRotationY(entry.rotation); matrix.setPosition(entry.x, entry.y, entry.z); mesh.setMatrixAt(index, matrix); });
      mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
    }
    label.innerHTML = `<strong>${manifest.style === "terrain-warm-storybook-a" ? "Warm storybook · editable VOX tiles" : "Editable VOX terrain · first draft"}</strong><span>1 m tiles · 0.5 m terraces · 0.125 m stair treads</span><span>${next === "unlit" ? "Unlit native pigment colors" : "Native source colors; neutral daylight"}; ${next === "detail" ? "material detail view" : next === "top" ? "orthographic top view" : next === "modules" ? "source modules" : "assembled terrace patch"}. No game changes.</span>`;
    baseCamera.copy(camera.position); controls.update(); resize();
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight;
    camera.position.copy(baseCamera).sub(controls.target).multiplyScalar(Math.max(1.12, 1.4 / camera.aspect)).add(controls.target);
    camera.updateProjectionMatrix(); controls.update();
    topCamera.left = -5.2 * camera.aspect; topCamera.right = 5.2 * camera.aspect;
    topCamera.top = 5.2; topCamera.bottom = -5.2; topCamera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  show("terrain");
  const review = { ready: true, kit, nativeVoxReadback: true, audits, placements, show, get mode() { return mode; }, get stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, tiles: placements.length }; } };
  (window as unknown as { terrainReview: typeof review }).terrainReview = review;
  renderer.setAnimationLoop(() => {
    controls.update(); renderer.render(scene, activeCamera);
    for (const label of moduleLabels) { const p = label.position.clone().project(activeCamera); label.element.style.left = `${(p.x + 1) * innerWidth / 2}px`; label.element.style.top = `${(1 - p.y) * innerHeight / 2}px`; }
  });
}
if (typeof window !== "undefined" && typeof document !== "undefined") void start().catch(error => { console.error(error); (window as unknown as { terrainReview: unknown }).terrainReview = { ready: false, error: String(error) }; });
