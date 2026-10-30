import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { loadProductionArt } from "./three/production-assets";
import { PixelBillboards } from "./three/pixel-billboards";
import { LightingRig, type LightingPreset, type SceneLamp } from "./three/lighting";
import type { ActorArt, ObjectArt } from "./three/contracts";
import type { WorldObject } from "../rpg/types";
import type { CameraMode } from "./three/runtime";
import "./three/asset-review.css";

type PreviewAsset = "village" | "bank" | "forge" | "tree" | "alden" | "anvil" | "crate" | "lantern";
const labels: Record<PreviewAsset, string> = {
  village: "Village sample", bank: "Bank", forge: "Blacksmith workshop", tree: "Tree", alden: "Alden", anvil: "Anvil", crate: "Supply crate", lantern: "Lantern",
};
interface ReviewState { asset: PreviewAsset; lighting: LightingPreset; cameraMode: CameraMode; roofs: boolean; angle: number; gameScale: boolean }
interface ReviewPiece { group: THREE.Group; roof?: THREE.Group; facade?: THREE.Group; actor?: ActorArt; lights: SceneLamp[] }

/** A read-only art scene: no worker, game state, save key or authoritative world positions. */
export default function AssetReview({ onClose }: { onClose?: () => void }) {
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const heading = useRef<HTMLElement>(null), controls = useRef<HTMLElement>(null);
  const [asset, setAsset] = useState<PreviewAsset>("village"), [lighting, setLighting] = useState<LightingPreset>("dusk");
  const [cameraMode, setCameraMode] = useState<CameraMode>("perspective"), [roofs, setRoofs] = useState(true);
  const [angle, setAngle] = useState(35);
  const [gameScale, setGameScale] = useState(false);
  const [status, setStatus] = useState("loading"), [message, setMessage] = useState("Loading local Blender models…");
  const latest = useRef<ReviewState>({ asset, lighting, cameraMode, roofs, angle, gameScale });
  latest.current = { asset, lighting, cameraMode, roofs, angle, gameScale };
  useEffect(() => {
    let active = true, stop: (() => void) | undefined;
    const controller = new AbortController();
    void loadProductionArt(controller.signal).then(result => {
      if (!active) { result.library.dispose(); return; }
      let renderer: THREE.WebGLRenderer;
      try { renderer = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias: true, powerPreference: "high-performance" }); }
      catch (error) { result.library.dispose(); setStatus("unavailable"); setMessage(error instanceof Error ? error.message : "WebGL2 is unavailable."); return; }
      const scene = new THREE.Scene(), rig = new LightingRig(scene), pixelUnits = new PixelBillboards(result.library);
      const ortho = new THREE.OrthographicCamera(-10, 10, 8, -8, .1, 500), perspective = new THREE.PerspectiveCamera(20, 1, .1, 500);
      const models = new THREE.Group(); scene.add(models);
      const geometry: THREE.BufferGeometry[] = [];
      const groundGeometry = new THREE.PlaneGeometry(32, 24), roadGeometry = new THREE.PlaneGeometry(18, 3.2);
      for (const [g, w, h] of [[groundGeometry, 32, 24], [roadGeometry, 18, 3.2]] as const) {
        const uv = g.getAttribute("uv"); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
        geometry.push(g);
      }
      const ground = new THREE.Mesh(groundGeometry, result.library.terrain.grass); ground.rotation.x = -Math.PI / 2; ground.position.y = -.025; ground.receiveShadow = true; scene.add(ground);
      const road = new THREE.Mesh(roadGeometry, result.library.terrain.dirt); road.rotation.x = -Math.PI / 2; road.position.set(0, -.01, 1.2); road.receiveShadow = true; scene.add(road);
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
      const pieces = new Map<Exclude<PreviewAsset, "village">, ReviewPiece>();
      const make = (id: Exclude<PreviewAsset, "village">): ReviewPiece => {
        const found = pieces.get(id); if (found) return found;
        let group: THREE.Group, art: ObjectArt | undefined, actor: ActorArt | undefined;
        if (id === "alden") { actor = pixelUnits.createActor({ id: 0, name: "Alden", role: "prince" }); group = actor.group; actor.tool.visible = false; }
        else {
          const object: WorldObject = { id: `art-review-${id}`, name: labels[id], kind: id === "bank" ? "bank" : id === "forge" ? "furnace" : id === "tree" ? "tree" : id === "anvil" ? "anvil" : "decor",
            position: { worldId: "art-review", x: 0, y: 0, plane: 0 }, width: id === "bank" || id === "forge" ? 4 : 1, height: id === "bank" || id === "forge" ? 3 : 1,
            blocks: false, art: id === "forge" ? "workshop" : id, ...(id === "tree" ? { resourceId: "tree" as const } : {}) };
            art = result.library.createObject(object, { standaloneVoxels: true }); group = art.group;
        }
        const piece = { group, roof: art?.roof, facade: art?.facade, actor, lights: (art?.lights ?? []).map((light, index) => ({ ...light, id: `${id}:${index}`, position: light.position.clone() })) };
        pieces.set(id, piece); return piece;
      };
      const target = new THREE.Vector3(), bounds = new THREE.Box3(), size = new THREE.Vector3();
      const placements: [Exclude<PreviewAsset, "village">, number, number][] = [["bank", -3.2, -1.7], ["forge", 3.1, -1.7], ["tree", -6.2, 2.6], ["alden", 0, 1.7], ["anvil", 2.5, 1.5], ["crate", -2.3, 1.1], ["lantern", 5.2, 1.5]];
      let chosen = "", lamps: SceneLamp[] = [], width = 1, height = 1, raf = 0, ready = false;
      let safeTop = 0, safeBottom = 1;
      const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
      const projected = new THREE.Vector3();
      const projectedBounds = (camera: THREE.Camera) => {
        let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
        corners.forEach((corner, index) => {
          corner.set(index & 1 ? bounds.max.x : bounds.min.x, index & 2 ? bounds.max.y : bounds.min.y, index & 4 ? bounds.max.z : bounds.min.z);
          projected.copy(corner).project(camera);
          const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
          top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
        });
        return { top, bottom, left, right };
      };
      const resize = new ResizeObserver(() => {
        width = Math.max(1, root.current?.clientWidth ?? 1); height = Math.max(1, root.current?.clientHeight ?? 1);
        renderer.setSize(width, height, false);
        const origin = root.current?.getBoundingClientRect().top ?? 0;
        safeTop = Math.min(height, (heading.current?.getBoundingClientRect().bottom ?? origin) - origin + 12);
        safeBottom = Math.max(safeTop + 1, (controls.current?.getBoundingClientRect().top ?? origin + height) - origin - 12);
      });
      resize.observe(root.current!);
      if (heading.current) resize.observe(heading.current);
      if (controls.current) resize.observe(controls.current);
      const contextLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(raf); if (active) { setStatus("unavailable"); setMessage("The graphics context was lost. Return to the demo to continue."); } };
      canvas.current!.addEventListener("webglcontextlost", contextLost);
      const frame = (time: number) => {
        if (!active) return;
        const view = latest.current;
        if (chosen !== view.asset) {
          models.clear(); lamps = []; chosen = view.asset;
          const chosenPieces = view.asset === "village" ? placements : [[view.asset, 0, 0] as const];
          for (const [id, x, z] of chosenPieces) {
            const piece = make(id); piece.group.position.set(x, 0, z); models.add(piece.group);
            piece.lights.forEach(lamp => lamps.push({ ...lamp, position: lamp.position.clone().add(piece.group.position) }));
          }
          models.updateWorldMatrix(true, true); bounds.setFromObject(models); bounds.getCenter(target); bounds.getSize(size);
          if (view.asset === "village") target.set(0, 1.1, 0);
        }
        for (const piece of pieces.values()) {
          if (piece.roof) piece.roof.visible = view.roofs;
          if (piece.facade) piece.facade.visible = view.roofs;
        }
        const hero = pieces.get("alden")?.actor;
        const aspect = width / height;
        // Reserve clear space for controls and captions while showing each asset at useful scale.
        let span = view.asset === "village" ? Math.max(13, 16 / aspect) : Math.max(size.y * 1.6, size.x * 1.5 / aspect, size.z * 1.4, 3.4);
        if (view.gameScale && view.asset === "alden") span *= 3.5;
        const camera = view.cameraMode === "perspective" ? perspective : ortho;
        const azimuth = THREE.MathUtils.degToRad(view.angle), elevation = THREE.MathUtils.degToRad(34);
        let distance = 1;
        const frameCamera = () => {
          distance = view.cameraMode === "perspective" ? span / (2 * Math.tan(THREE.MathUtils.degToRad(20) / 2)) : span * 3;
          camera.position.set(target.x + Math.sin(azimuth) * Math.cos(elevation) * distance, target.y + Math.sin(elevation) * distance, target.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
          if (camera instanceof THREE.PerspectiveCamera) camera.aspect = aspect;
          else { camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2; }
          camera.clearViewOffset(); camera.far = Math.max(500, distance + 100);
          camera.updateProjectionMatrix(); camera.lookAt(target); camera.updateMatrixWorld();
        };
        frameCamera();
        if (width <= 600 || height <= 500) {
          // Fit the projected model, rather than moving its geometry, into the actual
          // space between the responsive heading and toolbar in either projection.
          const available = Math.max(40, safeBottom - safeTop);
          let area = projectedBounds(camera);
          const fit = Math.max(1, (area.bottom - area.top) / (available * .9), (area.right - area.left) / (width * .9));
          if (fit > 1) { span *= fit * 1.02; frameCamera(); area = projectedBounds(camera); }
          const centre = (safeTop + safeBottom) / 2;
          camera.setViewOffset(width, height, 0, (area.top + area.bottom) / 2 - centre, width, height);
        }
        rig.setPreset(view.lighting); rig.update(lamps, target, time, false, distance);
        pixelUnits.faceCamera(camera, .35);
        renderer.render(scene, camera);
        if (!ready) { ready = true; setStatus("ready"); setMessage(result.source === "blender" ? `${result.loadedIds.length} local environment assets · Pixel sprite cast` : "Procedural environment fallback · Pixel sprite cast"); }
        if (root.current) { root.current.dataset.assets = result.source; root.current.dataset.productionAssets = result.loadedIds.join(","); root.current.dataset.cameraMode = view.cameraMode; root.current.dataset.characterStyle = result.characterStyle; root.current.dataset.characterReady = String(result.characterReady); root.current.dataset.characterRig = hero ? "billboard" : "none"; root.current.dataset.characterClip = "idle"; root.current.dataset.drawCalls = String(renderer.info.render.calls); root.current.dataset.triangles = String(renderer.info.render.triangles); }
        if (root.current) {
          const area = projectedBounds(camera);
          Object.assign(root.current.dataset, { modelTop: String(area.top), modelBottom: String(area.bottom), safeTop: String(safeTop), safeBottom: String(safeBottom) });
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      stop = () => {
        cancelAnimationFrame(raf); resize.disconnect(); canvas.current?.removeEventListener("webglcontextlost", contextLost);
        rig.dispose(); geometry.forEach(g => g.dispose()); pixelUnits.dispose(); result.library.dispose(); scene.clear(); renderer.dispose();
        const element = renderer.domElement; queueMicrotask(() => { if (!element.isConnected) renderer.forceContextLoss(); });
      };
    }).catch(error => { if (active) { setStatus("unavailable"); setMessage(error instanceof Error ? error.message : "The models could not load."); } });
    return () => { active = false; controller.abort(); stop?.(); };
  }, []);
  const close = () => { if (onClose) onClose(); else { const url = new URL(location.href); url.searchParams.delete("assetReview"); location.assign(url); } };
  return <main className="asset-review" ref={root} data-testid="asset-review" data-status={status} aria-label="Fable Crown art review">
    <canvas ref={canvas} aria-label="Read-only 3D model preview" />
    <header ref={heading} className="asset-review-heading"><div><small>FABLE CROWN · ART WORKBENCH</small><h1>{labels[asset]}</h1><p>{message}</p></div><button onClick={close}>Return to demo</button></header>
    <section ref={controls} className="asset-review-controls" aria-label="Art preview controls">
      <label>Model<select aria-label="Preview model" value={asset} onChange={event => setAsset(event.target.value as PreviewAsset)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div role="group" aria-label="Preview lighting">{(["day", "dusk", "night"] as const).map(preset => <button key={preset} aria-label={`${preset[0].toUpperCase()}${preset.slice(1)} lighting`} aria-pressed={lighting === preset} onClick={() => setLighting(preset)}>{preset[0].toUpperCase()}{preset.slice(1)}</button>)}</div>
      <div role="group" aria-label="Preview camera"><button aria-label="Perspective camera" aria-pressed={cameraMode === "perspective"} onClick={() => setCameraMode("perspective")}>Perspective</button><button aria-label="Orthographic camera" aria-pressed={cameraMode === "orthographic"} onClick={() => setCameraMode("orthographic")}>Ortho</button></div>
      <div><button aria-label="Rotate preview left" onClick={() => setAngle(value => value - 45)}>↶ Rotate</button><button aria-label="Rotate preview right" onClick={() => setAngle(value => value + 45)}>Rotate ↷</button></div>
      <div><button aria-label="Show roofs" aria-pressed={roofs} onClick={() => setRoofs(value => !value)}>Roofs {roofs ? "on" : "off"}</button></div>
      <button aria-label="Game-scale preview" aria-pressed={gameScale} onClick={() => setGameScale(value => !value)}>{gameScale ? "Close view" : "Game scale"}</button>
    </section>
    <p className="asset-review-caption">Read-only art preview · Local voxel and environment assets · Pixel sprite cast · No game commands or saves.</p>
  </main>;
}
