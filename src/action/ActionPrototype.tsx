import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { SceneHost } from "../render/SceneHost";
import type { ScenePreparation, TileCamera, TileSelection } from "../render/scene-types";
import { MAX_GAMEPLAY_ZOOM } from "../render/camera-limits";
import { ITEMS } from "../rpg/content";
import type { RpgState } from "../rpg/types";
import type { ActionState } from "./contracts";
import { ActionControls } from "./ActionControls";
import { useActionControls } from "./useActionControls";
import "./action-prototype.css";

const CAMERA_AXES = {
  right: { x: 45 / 55.217, z: -32 / 55.217 },
  forward: { x: -32 / 55.217, z: -45 / 55.217 },
};
const PREPARATION: Record<ScenePreparation["stage"], string> = {
  chapter: "Opening the practice clearing…", assets: "Loading the voxel world…",
  world: "Preparing the clearing…", shaders: "Preparing the light…",
  lighting: "Warming the scene…", ready: "Ready", unavailable: "The voxel world could not start.",
};
type PrototypeMessage = { state?: RpgState; action?: ActionState; message?: string };
type Panel = "inventory" | "tools" | null;

/** Isolated action gate: authoritative movement/combat live in the worker. */
export default function ActionPrototype() {
  const [state, setState] = useState<RpgState | null>(null);
  const [hud, setHud] = useState<ActionState>();
  const [camera, setCamera] = useState<TileCamera>({ x: 52, y: 95, zoom: MAX_GAMEPLAY_ZOOM, follow: true, overview: false, grid: false });
  const [selection, setSelection] = useState<TileSelection | null>(null);
  const [preparation, setPreparation] = useState<ScenePreparation>({ stage: "chapter" });
  const [panel, setPanel] = useState<Panel>(null);
  const [tool, setTool] = useState(true);
  const [message, setMessage] = useState("Explore the clearing. Each press is one strike.");
  const [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  const action = useRef<ActionState | undefined>(undefined);
  const toolRef = useRef(tool); toolRef.current = tool;
  const ready = !!state && preparation.stage === "ready" && !error;
  const active = ready && panel === null;
  const activeRef = useRef(active); activeRef.current = active;
  const panelElement = useRef<HTMLElement>(null);
  const readAction = useCallback(() => action.current, []);
  const onPreparation = useCallback((next: ScenePreparation) => {
    setPreparation(current => current.stage === next.stage && current.message === next.message ? current : next);
  }, []);

  const controls = useActionControls({
    enabled: active, cameraAxes: CAMERA_AXES,
    onInteract: () => worker.current?.postMessage({ type: "interact" }),
    onInventory: () => { if (ready) setPanel(current => current === "inventory" ? null : "inventory"); },
    onBuild: () => { if (ready) setPanel(current => current === "tools" ? null : "tools"); },
    onBack: () => setPanel(null),
  });

  useEffect(() => {
    let instance: Worker;
    try { instance = new Worker(new URL("./prototype.worker.ts", import.meta.url), { type: "module" }); }
    catch { setError("The action prototype could not start. Reload to try again."); return; }
    worker.current = instance;
    let firstState = true;
    instance.onmessage = (event: MessageEvent<PrototypeMessage>) => {
      const next = event.data;
      if (next.state) {
        setState(next.state);
        if (firstState) {
          firstState = false;
          const position = next.state.player.position;
          setCamera(current => ({ ...current, x: position.x, y: position.y, follow: true }));
        }
      }
      if (next.action) action.current = next.action;
      if (next.message) setMessage(next.message);
    };
    instance.onerror = () => setError("The action prototype stopped. Reload to try again.");
    instance.postMessage({ type: "pause" });
    return () => { instance.terminate(); worker.current = null; };
  }, []);

  useEffect(() => {
    const syncPause = () => worker.current?.postMessage({ type: activeRef.current && !document.hidden ? "resume" : "pause" });
    syncPause(); document.addEventListener("visibilitychange", syncPause);
    return () => document.removeEventListener("visibilitychange", syncPause);
  }, [active]);

  useEffect(() => {
    let frame = 0, lastHud = -Infinity;
    const update = (now: number) => {
      const input = controls.inputBuffer.read();
      input.tool = toolRef.current;
      worker.current?.postMessage({ type: "input", input });
      if (now - lastHud >= 100) { lastHud = now; setHud(action.current); }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [controls.inputBuffer]);

  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement;
    panelElement.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [panel]);

  function focus(selected: TileSelection) {
    if (!activeRef.current) return;
    setSelection(selected); worker.current?.postMessage({ type: "focus", selection: selected });
  }
  function practice(kind: "woods" | "combat") {
    controls.clear(); setPanel(null); setSelection(null);
    worker.current?.postMessage({ type: "practice", kind });
    setCamera(current => ({ ...current, follow: true, overview: false }));
  }
  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  const player = hud?.player;
  const unavailable = !!error || preparation.stage === "unavailable";
  return <main className="game-shell action-prototype" data-testid="action-prototype" aria-label="Fable Crown action prototype"
    data-ready={ready} data-panel-open={!!panel} data-preparing={!ready}
    data-player-x={player?.x.toFixed(3)} data-player-z={player?.z.toFixed(3)} data-action-frame={hud?.frame}
    data-guard={player?.guard.toFixed(2)} data-health={player?.health} data-tool={tool ? "tool" : "weapon"}>
    <div className="prototype-viewport" {...controls.worldBindings} inert={!active}>
      {state && <SceneHost state={state} camera={camera} onCamera={setCamera} selection={selection}
        onSelect={focus} onInteract={focus} readAction={readAction} onPreparation={onPreparation} />}
    </div>
    {ready && <>
      <header className="prototype-hud">
        <div className="prototype-vitals">
          <span className="prototype-title">Fable Crown <small>Action prototype</small></span>
          <label>Health <span>{player?.health ?? "—"} / {player?.maxHealth ?? "—"}</span>
            <meter aria-label="Player health" min={0} max={player?.maxHealth ?? 1} value={player?.health ?? 0} /></label>
          <label>Guard <span data-testid="prototype-guard-value">{Math.round(player?.guard ?? 100)}%</span>
            <meter aria-label="Guard stamina" min={0} max={100} value={player?.guard ?? 100} />
          </label>
          {player && player.guardBroken > 0 && <strong className="prototype-guard-broken">Guard broken</strong>}
        </div>
        <div className="prototype-hud-actions">
          <div className="prototype-tool-selector" role="group" aria-label="Strike mode">
            <button type="button" aria-pressed={tool} onClick={() => { setTool(true); controls.clear(); }}>Tool</button>
            <button type="button" aria-pressed={!tool} onClick={() => { setTool(false); controls.clear(); }}>Weapon</button>
          </div>
          <button type="button" onClick={() => setPanel("inventory")} aria-expanded={panel === "inventory"}>Bag</button>
          <button type="button" onClick={() => setPanel("tools")} aria-expanded={panel === "tools"}>Tools</button>
        </div>
      </header>
      <div className="prototype-notice" role="status">{message}</div>
      <div className="prototype-keyboard-help">WASD move · Click strike · Right click block · E interact</div>
      <ActionControls {...controls.controlsProps} onInventory={undefined} onBuild={undefined} />
      <output className="prototype-position" data-testid="prototype-player-position" aria-label="Player position">
        {player ? `${player.x.toFixed(2)}, ${player.z.toFixed(2)}` : "—"}
      </output>
    </>}
    {!ready && <section className="prototype-preparation" role={unavailable ? "alert" : "status"} aria-live="polite" data-testid="prototype-preparation">
      <div><span className="prototype-eyebrow">Fable Crown · Action prototype</span>
        <h1>{unavailable ? "The practice clearing could not open" : "Preparing the practice clearing"}</h1>
        <p>{error || preparation.message || PREPARATION[preparation.stage]}</p>
        {unavailable && <button type="button" onClick={() => location.reload()}>Reload prototype</button>}
      </div>
    </section>}
    {panel && <div className="prototype-panel-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setPanel(null); }}>
      <section className="prototype-panel" ref={panelElement} role="dialog" aria-modal="true" aria-labelledby="prototype-panel-title" onKeyDown={trapFocus}>
        <header><h2 id="prototype-panel-title">{panel === "inventory" ? "Backpack" : "Prototype tools"}</h2><button type="button" onClick={() => setPanel(null)} aria-label="Close panel">Close</button></header>
        {panel === "inventory" ? <div data-testid="prototype-inventory">
          <p>Collected materials appear here.</p>
          {state?.player.inventory.length ? <ul className="prototype-inventory-list">{state.player.inventory.map((item, index) => <li key={`${item.itemId}-${index}`}>
            <span>{ITEMS[item.itemId]?.name ?? item.itemId}</span><strong>×{item.quantity}</strong>
          </li>)}</ul> : <p className="prototype-empty">Your backpack is empty.</p>}
        </div> : <>
          <div className="prototype-practice-actions">
            <button type="button" onClick={() => practice("woods")}>Woods practice</button>
            <button type="button" onClick={() => { setTool(false); practice("combat"); }}>Combat practice</button>
            <button type="button" onClick={() => { setCamera(current => ({ ...current, follow: true, overview: false })); setPanel(null); }}>Follow prince</button>
          </div>
          <p>Practice areas let you check tools, movement, and guard.</p>
          <dl className="prototype-help">
            <dt>Keyboard & mouse</dt><dd>WASD: move · Left click: strike · Hold right mouse: block · E: interact · I: bag · B: tools · Escape: close.</dd>
            <dt>Gamepad</dt><dd>Left stick: move · RT: strike · Hold LT: block · A: interact · Menu: bag · X: tools · B: back. Use D-pad and A in panels.</dd>
            <dt>Touch</dt><dd>Drag the joystick to move. Tap Tool / Attack for each strike, hold Block to guard, and tap Interact nearby.</dd>
          </dl>
        </>}
      </section>
    </div>}
  </main>;
}
