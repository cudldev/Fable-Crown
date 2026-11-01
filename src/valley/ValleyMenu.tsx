import type { KeyboardEventHandler, ReactNode, RefObject } from "react";
import "./valley-menu.css";

export type ValleyPanel = "interaction" | "menu" | "inventory" | "craft" | "trade" | "home" | "projects" | "visitor" | "journal" | "land" | "settings";
export interface ValleyMenuProps {
  panel: ValleyPanel;
  title: string;
  canGoBack: boolean;
  onBack(): void;
  onClose(): void;
  onOpen(panel: ValleyPanel): void;
  onSection(panel: ValleyPanel): void;
  panelRef: RefObject<HTMLElement | null>;
  onKeyDown: KeyboardEventHandler<HTMLElement>;
  children: ReactNode;
  message: string;
  sections?:readonly {panel:ValleyPanel;label:string}[];
  contextual?:boolean;
}

/** Accessible console shell; the caller owns history, focus return and live game state. */
export function ValleyMenu({panel,title,canGoBack,onBack,onClose,onOpen,onSection,panelRef,onKeyDown,children,message,sections:allowedSections,contextual=false}:ValleyMenuProps) {
  void allowedSections;void onSection;
  return <div className="valley-menu-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="valley-panel valley-console-menu" ref={panelRef} role="dialog" aria-modal="true"
      aria-labelledby="valley-menu-title" data-menu-panel={panel} data-can-go-back={canGoBack} onKeyDown={onKeyDown}>
      <header className="valley-menu-header">
        <button type="button" aria-label="Back" onClick={onBack}>Back</button>
        <h2 id="valley-menu-title">{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose}>Close</button>
      </header>
      <div className="valley-menu-body">
        {panel==="menu"?<nav className="valley-menu-primary" aria-label="Game menu">
          <button type="button" className="valley-menu-resume" onClick={onClose}>Resume</button>
          {!contextual&&<><button type="button" onClick={()=>onOpen("inventory")}>Backpack</button>
          <button type="button" onClick={()=>onOpen("home")}>Build & manage</button>
          <button type="button" onClick={()=>onOpen("journal")}>Journal</button></>}
          <button type="button" onClick={()=>onOpen("settings")}>Settings</button>
        </nav>:children}
      </div>
      <footer className="valley-panel-message valley-menu-footer" role="status">
        {message&&<span className="valley-menu-notice">{message}</span>}
        <span className="valley-menu-console-hint">B / Esc Back · Menu Resume</span>
      </footer>
    </section>
  </div>;
}

export default ValleyMenu;
