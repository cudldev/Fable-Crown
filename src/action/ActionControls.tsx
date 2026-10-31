import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { normalizeMovement } from "./input";
import "./action-controls.css";

export interface ActionControlsProps {
  enabled?: boolean;
  onMove(x: number, y: number): void;
  onStrike(held: boolean): void;
  onBlock(held: boolean): void;
  onInteract(): void;
  onInventory?(): void;
  onBuild?(): void;
  /** Changing this releases visible held controls after focus/device loss. */
  resetKey?: number;
}

export function ActionControls({ enabled = true, onMove, onStrike, onBlock, onInteract, onInventory, onBuild, resetKey = 0 }: ActionControlsProps) {
  const stickPointer = useRef<number | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0, resetKey });
  useEffect(() => { stickPointer.current = null; }, [resetKey, enabled]);
  const position = stick.resetKey === resetKey && enabled ? stick : { x: 0, y: 0 };
  function updateStick(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) * 0.35;
    const movement = normalizeMovement((event.clientX - bounds.left - bounds.width / 2) / radius, (event.clientY - bounds.top - bounds.height / 2) / radius);
    setStick({ ...movement, resetKey }); onMove(movement.x, movement.y);
  }
  function releaseStick(event: ReactPointerEvent<HTMLDivElement>) {
    if (stickPointer.current !== event.pointerId) return;
    stickPointer.current = null; setStick({ x: 0, y: 0, resetKey }); onMove(0, 0);
  }
  function heldButton(callback: (held: boolean) => void) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!enabled || event.button !== 0) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); callback(true);
      },
      onPointerUp: () => callback(false), onPointerCancel: () => callback(false),
      onLostPointerCapture: () => callback(false), onBlur: () => callback(false),
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); callback(true); }
      },
      onKeyUp: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key === " " || event.key === "Enter") { event.preventDefault(); callback(false); }
      },
    };
  }
  return <div className="action-controls" data-action-controls="true" aria-label="Adventure controls">
    <div className="action-stick" role="group" aria-label="Movement joystick" aria-disabled={!enabled}
      onPointerDown={event => {
        if (!enabled || event.button !== 0 || stickPointer.current !== null) return;
        event.preventDefault(); stickPointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId); updateStick(event);
      }}
      onPointerMove={event => { if (enabled && stickPointer.current === event.pointerId) updateStick(event); }}
      onPointerUp={releaseStick} onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}>
      <span className="action-stick-ring" />
      <span className="action-stick-thumb" style={{ transform: `translate(${position.x * 34}px, ${position.y * 34}px)` }} />
      <span className="action-stick-label">Move</span>
    </div>
    <div className="action-buttons">
      <button type="button" disabled={!enabled} className="action-strike" {...heldButton(onStrike)}>Tool / Attack</button>
      <button type="button" disabled={!enabled} {...heldButton(onBlock)}>Block</button>
      <button type="button" disabled={!enabled} onClick={onInteract}>Interact</button>
      {onInventory && <button type="button" disabled={!enabled} onClick={onInventory}>Bag</button>}
      {onBuild && <button type="button" disabled={!enabled} onClick={onBuild}>Build</button>}
    </div>
  </div>;
}
