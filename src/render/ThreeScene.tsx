import { useEffect, useId, useRef, useState } from "react";
import type { TileSceneProps, TileSelection } from "./scene-types";
import { worldForState } from "../rpg/world";
import { ENEMIES } from "../rpg/content";
import { objectHitTarget } from "./presentation";
import { ThreeRuntime, type RuntimeInput, type CameraMode } from "./three/runtime";
import { loadProductionArt } from "./three/production-assets";
import type { LightingPreset } from "./three/lighting";
import VisualSettingsPanel from "./three/VisualSettingsPanel";
import { DEFAULT_VISUAL_PRESET, DEFAULT_VISUAL_SETTINGS, normalizeVisualSettings, type VisualSettings } from "./three/visual-settings";
import "./tile-scene.css";
import "./three/three-scene.css";

const FOLIAGE_SETTINGS_KEY = "fable-crown.foliage-settings";

export type ThreeSceneProps = TileSceneProps & { panelOpen: boolean };

/** The voxel world consumes immutable simulation snapshots. */
export default function ThreeScene(props: ThreeSceneProps) {
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<ThreeRuntime | null>(null);
  const hits = useRef(new Map<string, HTMLElement>());
  const positionedElements = useRef(new WeakSet<HTMLElement>());
  const [lighting, setLighting] = useState<LightingPreset>(DEFAULT_VISUAL_PRESET.lighting);
  const [shadows, setShadows] = useState(DEFAULT_VISUAL_PRESET.shadows);
  const [gi, setGI] = useState(DEFAULT_VISUAL_PRESET.gi), [ao, setAO] = useState(DEFAULT_VISUAL_PRESET.ao);
  const [cameraMode, setCameraMode] = useState<CameraMode>(DEFAULT_VISUAL_PRESET.cameraMode);
  const [visual, setVisual] = useState<VisualSettings>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(FOLIAGE_SETTINGS_KEY) ?? "{}");
      const foliage = saved && typeof saved === "object" ? saved as Partial<VisualSettings> : {};
      return normalizeVisualSettings({ foliageEnabled: foliage.foliageEnabled, foliageDensity: foliage.foliageDensity, windStrength: foliage.windStrength });
    }
    catch { return { ...DEFAULT_VISUAL_SETTINGS }; }
  });
  useEffect(() => {
    try { localStorage.setItem(FOLIAGE_SETTINGS_KEY, JSON.stringify({ foliageEnabled: visual.foliageEnabled, foliageDensity: visual.foliageDensity, windStrength: visual.windStrength })); }
    catch { /* Foliage still works when device storage is unavailable. */ }
  }, [visual.foliageEnabled, visual.foliageDensity, visual.windStrength]);
  const [settingsOpen, setSettingsOpen] = useState(false), settingsId = useId();
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeSettings = () => { setSettingsOpen(false); settingsButton.current?.focus(); };
  const copyPerformance = () => {
    const gl = canvas.current?.getContext("webgl2"), extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return JSON.stringify({ type: "fable-crown.performance", version: 1, capturedAt: new Date().toISOString(),
      visibility: document.visibilityState, focused: document.hasFocus(), viewport: [innerWidth, innerHeight], devicePixelRatio,
      browser: navigator.userAgent, gpu: gl && extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable",
      counters: { ...root.current?.dataset } }, null, 2);
  };
  const resetVisual = () => { setVisual({ ...DEFAULT_VISUAL_SETTINGS }); setLighting(DEFAULT_VISUAL_PRESET.lighting); setShadows(DEFAULT_VISUAL_PRESET.shadows); setGI(DEFAULT_VISUAL_PRESET.gi); setAO(DEFAULT_VISUAL_PRESET.ao); setCameraMode(DEFAULT_VISUAL_PRESET.cameraMode); };
  const [assets, setAssets] = useState<{ source: string; ids: string[]; voxelIds: string[]; warning: string; characterStyle: string; characterReady: boolean }>({ source: "loading", ids: [], voxelIds: [], warning: "", characterStyle: "pixel", characterReady: false });
  const [status, setStatus] = useState<"starting" | "ready" | "unavailable">("starting");
  const [failure, setFailure] = useState("");
  const latest = useRef<RuntimeInput>({ ...props, lighting, shadows, cameraMode, gi, ao, visual });
  latest.current = { ...props, lighting, shadows, cameraMode, gi, ao, visual };
  const world = worldForState(props.state);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void loadProductionArt(controller.signal).then(result => {
      if (!active) { result.library.dispose(); return; }
      try {
        setAssets({ source: result.source, ids: result.loadedIds, voxelIds: result.voxelIds, warning: result.warnings.join(" "), characterStyle: result.characterStyle, characterReady: result.characterReady });
        const view = new ThreeRuntime(canvas.current!, root.current!, latest.current, hits.current,
          () => { if (active) setStatus("ready"); },
          message => { if (active) { setFailure(message); setStatus("unavailable"); } }, result.library);
        runtime.current = view;
      } catch (error) {
        result.library.dispose();
        setFailure(error instanceof Error ? error.message : "WebGL2 is unavailable on this browser."); setStatus("unavailable");
      }
    }).catch(error => {
      if (!active) return;
      setFailure(error instanceof Error ? error.message : "The 3D assets could not load."); setStatus("unavailable");
    });
    return () => { active = false; controller.abort(); runtime.current?.dispose(); runtime.current = null; };
  }, []);
  useEffect(() => { runtime.current?.update(latest.current); });
  const bind = (key: string) => (element: HTMLElement | null) => {
    if (element) {
      hits.current.set(key, element);
      if (!positionedElements.current.has(element)) {
        element.hidden = true; positionedElements.current.add(element); runtime.current?.requestDraw();
      }
    } else hits.current.delete(key);
  };
  const keyboardSelect = (event: React.MouseEvent, selection: TileSelection) => {
    // Pointer selection is handled by the drag-aware runtime, keyboard activation by React.
    if (event.detail === 0) { event.stopPropagation(); props.onSelect(selection); }
  };
  const objectButtons = world.objects.filter(object => objectHitTarget(object, props.camera.zoom, props.camera.overview,
    props.selection?.kind === "object" && props.selection.id === object.id));
  return (
    <div ref={root} className="tile-world three-world" data-testid="rpg-world" data-renderer="3d" data-render-style={visual.renderStyle} data-status={status} data-lighting={lighting} data-assets={assets.source} data-production-assets={assets.ids.join(",")} data-voxel-assets={assets.voxelIds.join(",")} data-character-style={assets.characterStyle} data-character-ready={assets.characterReady}>
      <canvas ref={canvas} data-testid="three-canvas" aria-label="The 3D Fable Crown frontier. Drag to pan, wheel or pinch to zoom. Arrow keys pan when focused." tabIndex={0} />
      {status === "starting" && <div className="loading-screen" aria-live="polite">Opening the voxel village…</div>}
      {status === "ready" && <>
        <span className="three-performance" data-testid="fps-indicator" aria-label="Rendering performance" aria-live="off">FPS —</span>
        <div className="three-light-controls" role="group" aria-label="View settings">
          <span>VOXEL</span>
          {(["day", "dusk", "night"] as const).map(preset => <button key={preset} aria-label={`${preset[0].toUpperCase()}${preset.slice(1)} lighting`} aria-pressed={lighting === preset} onClick={() => setLighting(preset)}>{preset[0].toUpperCase()}{preset.slice(1)}</button>)}
          <button aria-label="Sun shadows" aria-pressed={shadows} onClick={() => setShadows(value => !value)}>Shadows {shadows ? "on" : "off"}</button>
          <button aria-label="Global illumination" aria-pressed={gi} onClick={() => setGI(value => !value)}>GI {gi ? "on" : "off"}</button>
          <button aria-label="Ambient occlusion" aria-pressed={ao} onClick={() => setAO(value => !value)}>AO {ao ? "on" : "off"}</button>
          <button aria-label="Perspective camera" aria-pressed={cameraMode === "perspective"} onClick={() => setCameraMode("perspective")}>Perspective</button>
          <button aria-label="Orthographic camera" aria-pressed={cameraMode === "orthographic"} onClick={() => setCameraMode("orthographic")}>Ortho</button>
          <button ref={settingsButton} className="visual-settings-trigger" aria-expanded={settingsOpen} aria-controls={settingsId} onClick={() => setSettingsOpen(value => !value)}>Visual settings</button>
        </div>
        {settingsOpen && <VisualSettingsPanel id={settingsId} settings={visual} preset={lighting} shadows={shadows} gi={gi} ao={ao} cameraMode={cameraMode} performanceReport={copyPerformance}
          onChange={patch => setVisual(previous => normalizeVisualSettings({ ...previous, ...patch }))} onShadows={setShadows} onGI={setGI} onAO={setAO} onReset={resetVisual} onClose={closeSettings} />}
        <div className="tile-hit-layer three-hit-layer">
          {objectButtons.map(object => {
            const selection: TileSelection = { kind: "object", id: object.id };
            const selected = props.selection?.kind === "object" && props.selection.id === object.id;
            return <button key={object.id} ref={bind(`object-${object.id}`)} className={`tile-object ${["tree", "rock"].includes(object.kind) ? "resource" : ""}`} aria-label={`Inspect ${object.name}`} aria-pressed={selected} title={object.name} data-three-selection={JSON.stringify(selection)} onClick={event => keyboardSelect(event, selection)}>
              <span>{["bank", "quest"].includes(object.kind) || selected || props.camera.overview && object.kind === "landmark" ? object.name : ""}</span>
            </button>;
          })}
          {!props.camera.overview && [props.state.player, ...props.state.npcs].map(actor => {
            const selection: TileSelection = { kind: "actor", id: actor.id };
            return <button key={`actor-${actor.id}`} ref={bind(`actor-${actor.id}`)} className="tile-actor" aria-label={`Inspect ${actor.name}`} data-three-selection={JSON.stringify(selection)} onClick={event => keyboardSelect(event, selection)} />;
          })}
          {!props.camera.overview && props.state.enemies.filter(enemy => enemy.health > 0).map(enemy => {
            const selection: TileSelection = { kind: "enemy", id: enemy.id };
            return <button key={`enemy-${enemy.id}`} ref={bind(`enemy-${enemy.id}`)} className="tile-enemy" aria-label={`Inspect ${ENEMIES[enemy.definitionId]?.name ?? enemy.definitionId}, ${enemy.health} health`} aria-pressed={props.selection?.kind === "enemy" && props.selection.id === enemy.id} data-three-selection={JSON.stringify(selection)} onClick={event => keyboardSelect(event, selection)} />;
          })}
          {!props.camera.overview && props.state.drops.map(drop => {
            const selection: TileSelection = { kind: "drop", id: drop.id };
            return <button key={`drop-${drop.id}`} ref={bind(`drop-${drop.id}`)} className="tile-drop" aria-label={`Inspect loot bag, ${drop.items.length} item types`} data-three-selection={JSON.stringify(selection)} onClick={event => keyboardSelect(event, selection)}><span>Loot</span></button>;
          })}
          {!props.camera.overview && props.state.grave && <button ref={bind("grave")} className="tile-grave" aria-label="Inspect your backpack grave" data-three-selection={JSON.stringify({ kind: "grave" })} onClick={event => keyboardSelect(event, { kind: "grave" })}><span>Backpack grave</span></button>}
          {(props.feedback ?? []).map(floater => <span ref={bind(`feedback-${floater.id}`)} className={`three-feedback three-feedback-${floater.tone}`} key={floater.id}>{floater.text}</span>)}
        </div>
        <div className="tile-progress-accessible">
          {[props.state.player, ...props.state.npcs].filter(actor => actor.action && !actor.path.length &&
            (actor.id === 0 || props.selection?.kind === "actor" && props.selection.id === actor.id)).map(actor => {
            const action = actor.action!;
            const object = world.objects.find(value => value.id === action.targetId);
            const label = action.kind === "gather" ? object?.kind === "rock" ? "Mining" : object?.kind === "tree" ? "Woodcutting" : "Fishing"
              : action.kind === "craft" ? action.recipeId?.includes("cook") ? "Cooking" : "Crafting" : action.kind;
            return <span key={actor.id} role="progressbar" aria-label={`${label} action progress`} aria-valuemin={0}
              aria-valuemax={action.duration} aria-valuenow={action.duration - action.remaining}
              aria-valuetext={`${actor.name}: ${action.duration - action.remaining} of ${action.duration} ticks`} />;
          })}
        </div>
        <span className="three-test-note" title={assets.warning || undefined}>Voxel world · Pixel sprite cast · {props.state.player.position.x}, {props.state.player.position.y}</span>
      </>}
      {status === "unavailable" && <section className="three-fallback" aria-label="Voxel renderer unavailable"><h2>Voxel world unavailable</h2><p>{failure}</p><p>Enable WebGL2 and reload. Your saved chapter is kept on this device.</p><button onClick={() => location.reload()}>Retry voxel renderer</button></section>}
    </div>
  );
}

