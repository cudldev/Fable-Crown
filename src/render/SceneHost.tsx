import { Component, lazy, Suspense, type ReactNode } from "react";
import type { TileSceneProps } from "./scene-types";
import "./tile-scene.css";

const ThreeScene = lazy(() => import("./ThreeScene"));

class RendererBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <div className="loading-screen" role="alert">
        <h2>The voxel world could not start</h2>
        <p>Try reloading with WebGL2 enabled. Your saved chapter is kept on this device.</p>
        <button onClick={() => location.reload()}>Retry voxel renderer</button>
      </div>
    ) : this.props.children;
  }
}

/** Rendering consumes immutable snapshots independently of the simulation worker. */
export function SceneHost(props: TileSceneProps) {
  return (
    <RendererBoundary>
      <Suspense fallback={<div className="tile-world three-world" data-testid="rpg-world" data-renderer="3d" data-status="starting" aria-label="Voxel world loading"><div className="loading-screen">Opening the voxel village…</div></div>}>
        <ThreeScene {...props} />
      </Suspense>
    </RendererBoundary>
  );
}
