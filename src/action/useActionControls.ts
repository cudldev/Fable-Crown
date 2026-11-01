import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import type { ActionControlsProps } from "./ActionControls";
import { ActionInputBuffer, applyStickDeadzone, ButtonEdgeTracker } from "./input";
import type { CameraAxes } from "./input";
import {InputModeTracker} from "./input-mode";
import type {ActionInputMode} from "./input-mode";

export interface UseActionControlsOptions {
  enabled?: boolean;
  cameraAxes?: CameraAxes;
  mouseActions?: boolean;
  onInteract(): void;
  onInventory?(): void;
  onMenu?(): void;
  onBuild?(): void;
  onBack?(): void;
  /** Called once per animation frame while the right stick is displaced. */
  onCameraPan?(x:number,y:number,deltaSeconds:number):void;
  onFollow?():void;
  onToggleTool?():void;
}

const MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]);
function isTextTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}
function isInterfaceTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select, [role='button'], [role='dialog'], [data-action-controls], [data-action-menu]"));
}
function isVisible(element: HTMLElement): boolean {
  for(let parent=element.parentElement;parent;parent=parent.parentElement){
    if(parent instanceof HTMLDetailsElement&&!parent.open&&!parent.querySelector(":scope > summary")?.contains(element))return false;
  }
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden" && !element.closest("[inert], [aria-hidden='true']");
}
/** A dialog or data-action-menu opts into controller focus navigation. */
export function focusableMenuElements(root:HTMLElement):HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button:not(:disabled), [role='button']:not([aria-disabled='true']), a[href], input:not(:disabled), select:not(:disabled), summary")].filter(isVisible);
}
function menuButtons(): HTMLElement[] | null {
  const menus = [...document.querySelectorAll<HTMLElement>("dialog[open], [role='dialog'], [data-action-menu]")].filter(isVisible);
  const root = menus.at(-1);
  if (!root) return null;
  return focusableMenuElements(root);
}
function moveMenuFocus(buttons: HTMLElement[], direction: number): void {
  if (!buttons.length) return;
  const current = buttons.findIndex(button => button === document.activeElement);
  const next = current < 0 ? (direction > 0 ? 0 : buttons.length - 1) : (current + direction + buttons.length) % buttons.length;
  buttons[next].focus();
}

/** Attach worldBindings only to the world viewport; read inputBuffer each 60Hz step. */
export function useActionControls(options: UseActionControlsOptions) {
  const bufferRef = useRef<ActionInputBuffer | null>(null);
  if (!bufferRef.current) bufferRef.current = new ActionInputBuffer(options.cameraAxes);
  const inputBuffer = bufferRef.current;
  const latest = useRef(options);
  latest.current = options;
  const [resetKey, setResetKey] = useState(0);
  const deviceRef=useRef<InputModeTracker|null>(null);
  if(!deviceRef.current)deviceRef.current=new InputModeTracker(typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches&&(navigator.maxTouchPoints??0)>0);
  const device=deviceRef.current;
  const [inputMode,setInputMode]=useState<ActionInputMode>(device.mode);
  const clearRef = useRef<() => void>(() => inputBuffer.clear());
  useEffect(() => {
    if (options.cameraAxes) inputBuffer.setCameraAxes(options.cameraAxes);
  }, [inputBuffer, options.cameraAxes]);
  useEffect(() => {
    if (options.enabled === false) clearRef.current();
  }, [options.enabled]);

  useEffect(() => {
    const edges = new ButtonEdgeTracker();
    let padIndex: number | null = null;
    let animationFrame = 0;
    let lastPadTime = 0;
    let cameraPanBlocked = false;
    const heldKeys=new Set<string>(),releasedBeforeAction=new Set<string>();
    function clear() {
      for(const key of heldKeys)releasedBeforeAction.add(key);
      inputBuffer.clear(); setResetKey(value => value + 1);
    }
    function activate(mode:ActionInputMode){if(device.use(mode)){clear();setInputMode(mode);}}
    function pointerDevice(event:PointerEvent){if(event.pointerType==="touch")activate("touch");else if(event.pointerType==="mouse"||event.pointerType==="pen")activate("keyboard");}
    clearRef.current = clear;
    function onKeyDown(event: KeyboardEvent) {
      if(event.defaultPrevented)return;
      if(!isTextTarget(event.target)&&!event.repeat)activate("keyboard");
      if(MOVEMENT_KEYS.has(event.code)){heldKeys.add(event.code);if(!event.repeat)releasedBeforeAction.delete(event.code);if(releasedBeforeAction.has(event.code))return;}
      if (isTextTarget(event.target)) { inputBuffer.clear(); return; }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const menu=menuButtons();
      if(menu&&["ArrowUp","ArrowLeft","ArrowDown","ArrowRight"].includes(event.code)) {
        event.preventDefault(); inputBuffer.setKey(event.code,false);
        moveMenuFocus(menu,event.code==="ArrowUp"||event.code==="ArrowLeft"?-1:1);return;
      }
      const enabled = latest.current.enabled !== false;
      if(MOVEMENT_KEYS.has(event.code)&&!enabled)releasedBeforeAction.add(event.code);
      if (MOVEMENT_KEYS.has(event.code) && enabled && !menu) {
        event.preventDefault(); inputBuffer.setKey(event.code, true);
      }
      if (event.repeat) return;
      if(event.code==="Space"&&enabled&&latest.current.mouseActions===false&&(!isInterfaceTarget(event.target)||event.target instanceof Element&&!!event.target.closest("[data-three-selection]"))){event.preventDefault();inputBuffer.setBlock("keyboard",true);}
      if (event.code === "KeyE" && enabled) { event.preventDefault(); latest.current.onInteract(); }
      if (event.code === "KeyF" && enabled && !menu) { event.preventDefault(); latest.current.onFollow?.(); }
      if (event.code === "KeyQ" && enabled) { event.preventDefault(); latest.current.onToggleTool?.(); }
      if (event.code === "KeyI") { event.preventDefault(); latest.current.onInventory?.(); }
      if (event.code === "KeyB") { event.preventDefault(); latest.current.onBuild?.(); }
      if (event.code === "Escape") latest.current.onBack?.();
    }
    function onKeyUp(event: KeyboardEvent) { heldKeys.delete(event.code);releasedBeforeAction.delete(event.code);inputBuffer.setKey(event.code, false);if(event.code==="Space")inputBuffer.setBlock("keyboard",false); }
    function releaseMouse() {
      inputBuffer.setStrike("mouse", false); inputBuffer.setBlock("mouse", false);
    }
    function visibilityChanged() { if (document.hidden) clear(); }
    function focused(event: FocusEvent) { if (isTextTarget(event.target)) clear(); }
    function disconnected() { padIndex = null; edges.clear(); clear();if(device.disconnect())setInputMode(device.mode); }
    function pollGamepad(time:number) {
      const deltaSeconds=Math.min(.05,lastPadTime?(time-lastPadTime)/1000:1/60);lastPadTime=time;
      if (!document.hidden && document.hasFocus()) {
        const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
        const pad = (padIndex === null ? undefined : pads[padIndex]) ?? [...pads].find(candidate => candidate?.connected);
        if (!pad && padIndex !== null)disconnected();
        if (pad) {
          if (pad.index !== padIndex) { edges.clear(); padIndex = pad.index; }
          const pressed = (index: number) => Boolean(pad.buttons[index]?.pressed || (pad.buttons[index]?.value ?? 0) > 0.5);
          if(device.observePad(Array.from(pad.buttons,(_,i)=>pressed(i)),pad.axes))activate("controller");
          const buttons = menuButtons();
          const canAct = device.mode==="controller"&&latest.current.enabled !== false && !buttons && !isTextTarget(document.activeElement);
          const toggleToolEdge=edges.update("toggleTool",pressed(3));
          if(canAct&&toggleToolEdge)latest.current.onToggleTool?.();
          const stick = applyStickDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
          inputBuffer.setMovement("gamepad", canAct ? stick.x : 0, canAct ? stick.y : 0);
          const strikeEdge=edges.update("strike",pressed(7));
          inputBuffer.setStrike("gamepad",false);
          if(canAct&&strikeEdge)inputBuffer.setStrike("gamepad",true);
          inputBuffer.setBlock("gamepad", canAct && pressed(6));
          const cameraStick=applyStickDeadzone(pad.axes[2]??0,pad.axes[3]??0);
          if(!cameraStick.x&&!cameraStick.y&&!pressed(11))cameraPanBlocked=false;
          if(edges.update("follow",pressed(11))&&canAct){cameraPanBlocked=true;latest.current.onFollow?.();}
          if(canAct&&!cameraPanBlocked&&!pressed(11)&&(cameraStick.x||cameraStick.y))latest.current.onCameraPan?.(cameraStick.x,cameraStick.y,deltaSeconds);
          const confirm = edges.update("confirm", pressed(0));
          if (confirm) {
            if (buttons) {
              const active = buttons.find(button => button === document.activeElement) ?? buttons[0];
              active?.focus(); active?.click();
            } else if (canAct) latest.current.onInteract();
          }
          if (edges.update("back", pressed(1))) latest.current.onBack?.();
          if (edges.update("inventory", pressed(9))) (latest.current.onMenu??latest.current.onInventory)?.();
          if (edges.update("build", pressed(2))) latest.current.onBuild?.();
          const previous = edges.update("previous", pressed(12) || pressed(14) || stick.y < -0.55 || stick.x < -0.55);
          const next = edges.update("next", pressed(13) || pressed(15) || stick.y > 0.55 || stick.x > 0.55);
          if (buttons && previous) moveMenuFocus(buttons, -1);
          if (buttons && next) moveMenuFocus(buttons, 1);
        }
      }
      animationFrame = requestAnimationFrame(pollGamepad);
    }
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerdown",pointerDevice,true);
    window.addEventListener("blur", clear); document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("resize",clear); window.addEventListener("orientationchange",clear);
    document.addEventListener("focusin", focused);
    window.addEventListener("pointerup", releaseMouse); window.addEventListener("pointercancel", releaseMouse);
    window.addEventListener("gamepaddisconnected", disconnected);
    animationFrame = requestAnimationFrame(pollGamepad);
    return () => {
      cancelAnimationFrame(animationFrame); inputBuffer.clear();
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerdown",pointerDevice,true);
      window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("resize",clear); window.removeEventListener("orientationchange",clear);
      document.removeEventListener("focusin", focused);
      window.removeEventListener("pointerup", releaseMouse); window.removeEventListener("pointercancel", releaseMouse);
      window.removeEventListener("gamepaddisconnected", disconnected);
    };
  }, [inputBuffer]);

  const worldBindings: HTMLAttributes<HTMLElement> = {
    onPointerDown(event) {
      const worldTarget=event.target instanceof Element&&!!event.target.closest("[data-three-selection]");
      if (latest.current.mouseActions===false || event.defaultPrevented || latest.current.enabled === false || event.pointerType === "touch" || isInterfaceTarget(event.target)&&!(worldTarget&&event.button===2)) return;
      if (event.button === 0) inputBuffer.setStrike("mouse", true);
      if (event.button === 2) inputBuffer.setBlock("mouse", true);
    },
    onContextMenu(event) { if (!isInterfaceTarget(event.target)) event.preventDefault(); },
  };
  const controlsProps: ActionControlsProps = {
    enabled: options.enabled, resetKey,
    onMove: (x, y) => { if (latest.current.enabled !== false) inputBuffer.setMovement("virtual", x, y); },
    onStrike: held => inputBuffer.setStrike("virtual", latest.current.enabled !== false && held),
    onBlock: held => inputBuffer.setBlock("virtual", latest.current.enabled !== false && held),
    onInteract: () => latest.current.onInteract(),
    onInventory: options.onInventory ? () => latest.current.onInventory?.() : undefined,
    onBuild: options.onBuild ? () => latest.current.onBuild?.() : undefined,
  };
  return { inputBuffer, inputRef: bufferRef, worldBindings, controlsProps, inputMode, touchControls:device.touchControls, clear: () => clearRef.current() };
}
