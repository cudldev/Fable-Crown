import { Component, lazy, Suspense, type ReactNode } from "react";
import TileScene, { type TileSceneProps } from "./TileScene";

const ThreeScene = lazy(() => import("./ThreeScene"));

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
        <p>Your journey can continue in the painterly view.</p>
        <button onClick={this.props.onFallback}>Use painterly renderer</button>
      </div>
    ) : this.props.children;
  }
}

/** Both views consume the same snapshots; switching never restarts the worker. */
export function SceneHost({ mode, onFallback, ...props }: TileSceneProps & {
  mode: "painterly" | "3d";
  onFallback: () => void;
}) {
  if (mode !== "3d") return <TileScene {...props} />;
  return (
    <RendererBoundary onFallback={onFallback}>
      <Suspense fallback={<div className="loading-screen">Opening the 3D village…</div>}>
        <ThreeScene {...props} onFallback={onFallback} />
      </Suspense>
    </RendererBoundary>
  );
}
