import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
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
  strikeLabel?: string;
  strikeHint?: string;
  interactLabel?: string;
  interactHint?: string;
  onToggleMode?(): void;
  modeLabel?: string;
  /** Remaining authoritative swing frames, from 36 down to zero. */
  swing?: number;
  blocking?: boolean;
  guardBroken?: boolean | number;
  handedness?: "right" | "left";
  raised?: boolean;
}

export function ActionControls({ enabled = true, onMove, onStrike, onBlock, onInteract, onInventory, onBuild, resetKey = 0,
  strikeLabel, strikeHint, interactLabel, interactHint, onToggleMode, modeLabel, swing = 0, blocking = false,
  guardBroken = false, handedness = "right", raised = false }: ActionControlsProps) {
  const contextual = !!onToggleMode;
  const stickPointer = useRef<number | null>(null);
  const heldSources = useRef({ strike: new Set<string>(), block: new Set<string>() });
  const tapPointers=useRef({mode:{id:null as number|null,ignoreClickUntil:0},interact:{id:null as number|null,ignoreClickUntil:0}});
  const [held, setHeld] = useState({ strike: false, block: false });
  const [stick, setStick] = useState({ x: 0, y: 0, travel: 34, resetKey });
  const callbacks = useRef({ onMove, onStrike, onBlock }); callbacks.current = { onMove, onStrike, onBlock };
  useEffect(() => {
    stickPointer.current = null; heldSources.current.strike.clear(); heldSources.current.block.clear();
    tapPointers.current.mode.id=null;tapPointers.current.interact.id=null;
    setHeld({strike:false,block:false});
    setStick({x:0,y:0,travel:34,resetKey});
    callbacks.current.onMove(0,0); callbacks.current.onStrike(false); callbacks.current.onBlock(false);
  }, [resetKey, enabled]);
  const position = stick.resetKey === resetKey && enabled ? stick : { x: 0, y: 0, travel: 34 };
  const remaining = Number.isFinite(swing) ? Math.max(0, Math.min(36, swing)) : 0;
  const strikeText = strikeLabel ?? (contextual ? "Strike" : "Tool / Attack");
  const interactText = interactLabel ?? "Interact";
  const guarding = blocking || held.block;
  function updateStick(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) * 0.35;
    const movement = normalizeMovement((event.clientX - bounds.left - bounds.width / 2) / radius, (event.clientY - bounds.top - bounds.height / 2) / radius);
    const travel = contextual ? Math.max(0, Math.min(34, Math.min(bounds.width,bounds.height)/2-24)) : 34;
    setStick({ ...movement, travel, resetKey }); onMove(movement.x, movement.y);
  }
  function releaseStick(event: ReactPointerEvent<HTMLDivElement>) {
    if (stickPointer.current !== event.pointerId) return;
    stickPointer.current = null; setStick({ x: 0, y: 0, travel: 34, resetKey }); onMove(0, 0);
  }
  function setSource(kind: "strike" | "block", source:string, pressed:boolean, callback:(held:boolean)=>void) {
    const sources=heldSources.current[kind]; if(pressed)sources.add(source);else sources.delete(source);
    const active=sources.size>0;setHeld(current=>current[kind]===active?current:{...current,[kind]:active});callback(active);
  }
  function heldButton(kind: "strike" | "block", callback: (held: boolean) => void) {
    const release=(event:ReactPointerEvent<HTMLButtonElement>)=>setSource(kind,`pointer:${event.pointerId}`,false,callback);
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!enabled || event.button !== 0) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setSource(kind,`pointer:${event.pointerId}`,true,callback);
      },
      onPointerUp: release, onPointerCancel: release,
      onLostPointerCapture: release, onBlur: () => {heldSources.current[kind].clear();setHeld(current=>({...current,[kind]:false}));callback(false);},
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); setSource(kind,`key:${event.key}`,true,callback); }
      },
      onKeyUp: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key === " " || event.key === "Enter") { event.preventDefault(); setSource(kind,`key:${event.key}`,false,callback); }
      },
    };
  }
  /** Secondary fingers do not reliably synthesize clicks. Activate touch releases explicitly. */
  function tapButton(kind:"mode"|"interact",callback:()=>void){
    const cancel=(event:ReactPointerEvent<HTMLButtonElement>)=>{const tap=tapPointers.current[kind];if(tap.id===event.pointerId)tap.id=null;tap.ignoreClickUntil=performance.now()+750;};
    return {
      onPointerDown:(event:ReactPointerEvent<HTMLButtonElement>)=>{
        const tap=tapPointers.current[kind];if(!enabled||event.button!==0||event.pointerType!=="touch"||tap.id!==null)return;
        event.preventDefault();tap.id=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerUp:(event:ReactPointerEvent<HTMLButtonElement>)=>{
        if(event.pointerType!=="touch")return;
        event.preventDefault();const tap=tapPointers.current[kind],pressed=tap.id===event.pointerId;
        if(pressed)tap.id=null;tap.ignoreClickUntil=performance.now()+750;
        const bounds=event.currentTarget.getBoundingClientRect();
        if(pressed&&enabled&&event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom)callback();
      },
      onPointerCancel:cancel,onLostPointerCapture:cancel,
      onClick:(event:ReactMouseEvent<HTMLButtonElement>)=>{
        const pointerType=(event.nativeEvent as PointerEvent).pointerType;
        if(!enabled||event.detail!==0&&(!pointerType||pointerType==="touch")&&performance.now()<tapPointers.current[kind].ignoreClickUntil)return;
        callback();
      },
    };
  }
  const strikeButton=<button type="button" disabled={!enabled} className="action-strike" data-action-strike="true"
    data-held={held.strike} data-swinging={remaining>0} aria-label={contextual?strikeText:undefined}
    aria-description={contextual?strikeHint??"Press once":undefined} {...heldButton("strike",onStrike)}>
    {contextual&&<span className="action-swing-progress" aria-hidden="true" style={{"--action-swing":`${remaining/36*100}%`} as CSSProperties}/>}
    {contextual?<><span className="action-control-label">{strikeText}</span><span className="action-control-hint">{strikeHint??"Press once"}</span></>:strikeText}
  </button>;
  const blockButton=<button type="button" disabled={!enabled} className="action-block" data-held={held.block}
    data-guard-broken={!!guardBroken} aria-pressed={guarding} {...heldButton("block",onBlock)}>
    {contextual?<><span className="action-control-label">Block</span><span className="action-control-hint">{guardBroken?"Recovering":guarding?"Holding":"Hold"}</span></>:"Block"}
  </button>;
  const interactButton=<button type="button" disabled={!enabled} className="action-interact" {...tapButton("interact",onInteract)}
    aria-label={contextual?interactText:undefined} aria-description={contextual?interactHint??"Nearby":undefined}>
    {contextual?<><span className="action-control-label">{interactText}</span><span className="action-control-hint">{interactHint??"Nearby"}</span></>:interactText}
  </button>;
  return <div className="action-controls" data-action-controls="true" data-contextual={contextual}
    data-hand={handedness} data-raised={raised} aria-label="Adventure controls">
    <div className="action-stick" role="group" aria-label="Movement joystick" aria-disabled={!enabled}
      onPointerDown={event => {
        if (!enabled || event.button !== 0 || stickPointer.current !== null) return;
        event.preventDefault(); stickPointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId); updateStick(event);
      }}
      onPointerMove={event => { if (enabled && stickPointer.current === event.pointerId) updateStick(event); }}
      onPointerUp={releaseStick} onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}>
      <span className="action-stick-ring" />
      <span className="action-stick-thumb" style={{ transform: `translate(${position.x * position.travel}px, ${position.y * position.travel}px)` }} />
      <span className="action-stick-label">Move</span>
    </div>
    <div className="action-buttons">
      {contextual?<>
        <button type="button" disabled={!enabled} className="action-mode" data-action-mode="true" {...tapButton("mode",onToggleMode!)}
          data-mode={modeLabel?.toLowerCase()} aria-label={modeLabel==="Tool"?"Switch to weapon":modeLabel==="Weapon"?"Switch to tool":"Switch tool or weapon"} title="Switch tool or weapon"><span className="action-control-label">{modeLabel??"Mode"}</span><span className="action-control-hint">Switch</span></button>
        {interactButton}{blockButton}{strikeButton}
      </>:<>{strikeButton}{blockButton}{interactButton}
        {onInventory && <button type="button" disabled={!enabled} onClick={onInventory}>Bag</button>}
        {onBuild && <button type="button" disabled={!enabled} onClick={onBuild}>Build</button>}
      </>}
    </div>
  </div>;
}
