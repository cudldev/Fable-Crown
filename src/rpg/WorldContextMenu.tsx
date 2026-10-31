import { useLayoutEffect, useRef } from "react";

export interface WorldMenuItem { label: string; run: () => void }
export function WorldContextMenu({ x, y, items, onClose }: { x: number; y: number; items: WorldMenuItem[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current!;
    const box = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(x, innerWidth - box.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, innerHeight - box.height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => { if (!element.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", onClose); };
  }, [x, y]);
  return <div ref={menu} className="world-context-menu" role="menu" aria-label="World actions" style={{ left: x, top: y }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    if (event.key === "Tab") { onClose(); return; }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>("button"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }}>
    <small>Choose an option</small>
    {items.map(item => <button role="menuitem" key={item.label} onClick={item.run}>{item.label}</button>)}
    <button role="menuitem" onClick={onClose}>Cancel</button>
  </div>;
}
