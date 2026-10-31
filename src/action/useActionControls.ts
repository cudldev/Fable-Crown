import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import type { ActionControlsProps } from "./ActionControls";
import { ActionInputBuffer, applyStickDeadzone, ButtonEdgeTracker } from "./input";
import type { CameraAxes } from "./input";

export interface UseActionControlsOptions {
  enabled?: boolean;
  cameraAxes?: CameraAxes;
  onInteract(): void;
  onInventory?(): void;
  onBuild?(): void;
  onBack?(): void;
}

const MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]);
function isTextTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}
function isInterfaceTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select, [role='button'], [role='dialog'], [data-action-controls], [data-action-menu]"));
}
function isVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden" && !element.closest("[inert], [aria-hidden='true']");
}
/** A dialog or data-action-menu opts into controller focus navigation. */
function menuButtons(): HTMLElement[] | null {
  const menus = [...document.querySelectorAll<HTMLElement>("dialog[open], [role='dialog'], [data-action-menu]")].filter(isVisible);
  const root = menus.at(-1);
  if (!root) return null;
  return [...root.querySelectorAll<HTMLElement>("button:not(:disabled), [role='button']:not([aria-disabled='true']), a[href], input:not(:disabled), select:not(:disabled)")].filter(isVisible);
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
    function clear() {
      inputBuffer.clear(); edges.clear(); setResetKey(value => value + 1);
    }
    clearRef.current = clear;
    function onKeyDown(event: KeyboardEvent) {
      if (isTextTarget(event.target)) { inputBuffer.clear(); return; }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const enabled = latest.current.enabled !== false;
      if (MOVEMENT_KEYS.has(event.code) && enabled && !menuButtons()) {
        event.preventDefault(); inputBuffer.setKey(event.code, true);
      }
      if (event.repeat) return;
      if (event.code === "KeyE" && enabled) { event.preventDefault(); latest.current.onInteract(); }
      if (event.code === "KeyI") { event.preventDefault(); latest.current.onInventory?.(); }
      if (event.code === "KeyB") { event.preventDefault(); latest.current.onBuild?.(); }
      if (event.code === "Escape") latest.current.onBack?.();
    }
    function onKeyUp(event: KeyboardEvent) { inputBuffer.setKey(event.code, false); }
    function releaseMouse() {
      inputBuffer.setStrike("mouse", false); inputBuffer.setBlock("mouse", false);
    }
    function visibilityChanged() { if (document.hidden) clear(); }
    function focused(event: FocusEvent) { if (isTextTarget(event.target)) clear(); }
    function disconnected() { padIndex = null; clear(); }
    function pollGamepad() {
      if (!document.hidden && document.hasFocus()) {
        const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
        const pad = (padIndex === null ? undefined : pads[padIndex]) ?? [...pads].find(candidate => candidate?.connected);
        if (!pad && padIndex !== null) { padIndex = null; clear(); }
        if (pad) {
          if (pad.index !== padIndex) { clear(); padIndex = pad.index; }
          const pressed = (index: number) => Boolean(pad.buttons[index]?.pressed || (pad.buttons[index]?.value ?? 0) > 0.5);
          const buttons = menuButtons();
          const canAct = latest.current.enabled !== false && !buttons && !isTextTarget(document.activeElement);
          const stick = applyStickDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
          inputBuffer.setMovement("gamepad", canAct ? stick.x : 0, canAct ? stick.y : 0);
          inputBuffer.setStrike("gamepad", canAct && pressed(7));
          inputBuffer.setBlock("gamepad", canAct && pressed(6));
          const confirm = edges.update("confirm", pressed(0));
          if (confirm) {
            if (buttons) {
              const active = buttons.find(button => button === document.activeElement) ?? buttons[0];
              active?.focus(); active?.click();
            } else if (canAct) latest.current.onInteract();
          }
          if (edges.update("back", pressed(1))) latest.current.onBack?.();
          if (edges.update("inventory", pressed(9))) latest.current.onInventory?.();
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
    window.addEventListener("blur", clear); document.addEventListener("visibilitychange", visibilityChanged);
    document.addEventListener("focusin", focused);
    window.addEventListener("pointerup", releaseMouse); window.addEventListener("pointercancel", releaseMouse);
    window.addEventListener("gamepaddisconnected", disconnected);
    animationFrame = requestAnimationFrame(pollGamepad);
    return () => {
      cancelAnimationFrame(animationFrame); inputBuffer.clear();
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", visibilityChanged);
      document.removeEventListener("focusin", focused);
      window.removeEventListener("pointerup", releaseMouse); window.removeEventListener("pointercancel", releaseMouse);
      window.removeEventListener("gamepaddisconnected", disconnected);
    };
  }, [inputBuffer]);

  const worldBindings: HTMLAttributes<HTMLElement> = {
    onPointerDown(event) {
      if (latest.current.enabled === false || event.pointerType === "touch" || isInterfaceTarget(event.target)) return;
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
  return { inputBuffer, inputRef: bufferRef, worldBindings, controlsProps, clear: () => clearRef.current() };
}
