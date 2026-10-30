import { Component, lazy, Suspense, type ReactNode } from "react";
import type { TileSceneProps } from "./TileScene";

const ThreeScene = lazy(() => import("./ThreeScene"));
const CompatibilityScene = lazy(() => import("./TileScene"));

class RendererBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <div className="loading-screen" role="alert">
        <h2>The 3D view could not start</h2>
        <p>Your journey can continue in the compatibility view.</p>
        <button onClick={this.props.onFallback}>Use compatibility view</button>
      </div>
    ) : this.props.children;
  }
}

/** 3D is the game view; unsupported devices can keep playing the same saved chapter. */
export function SceneHost({ mode, onFallback, panelOpen, ...props }: TileSceneProps & {
  mode: "painterly" | "3d";
  onFallback: () => void;
  panelOpen: boolean;
}) {
  return (
    <RendererBoundary key={mode} onFallback={onFallback}>
      <Suspense fallback={<div className="loading-screen">Opening the village…</div>}>
        {mode === "3d" ? <ThreeScene {...props} panelOpen={panelOpen} onFallback={onFallback} /> : <CompatibilityScene {...props} />}
      </Suspense>
    </RendererBoundary>
  );
}
