import { Component, lazy, Suspense, type ReactNode } from "react";
import type { ScenePreparation, TileSceneProps } from "./scene-types";
import "./tile-scene.css";

const ThreeScene = lazy(() => import("./ThreeScene"));

class RendererBoundary extends Component<
  { children: ReactNode; onPreparation?: (preparation: ScenePreparation) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onPreparation?.({ stage: "unavailable", message: "The voxel world could not start." }); }
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
    <RendererBoundary onPreparation={props.onPreparation}>
      <Suspense fallback={<div className="tile-world three-world" data-testid="rpg-world" data-renderer="3d" data-status="starting" aria-label="Voxel world loading"><div className="loading-screen">Opening the voxel village…</div></div>}>
        <ThreeScene {...props} />
      </Suspense>
    </RendererBoundary>
  );
}
