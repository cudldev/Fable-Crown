import type { decodeVoxelAsset, VoxelDecodeSpec } from "./voxel-decode";

/** A single decoder per load keeps CPU/memory bounded; abort terminates active derivation. */
export class VoxelAssetDecoder {
  private worker: Worker;
  private pending?: { resolve: (value: ReturnType<typeof decodeVoxelAsset>) => void; reject: (reason: unknown) => void };
  private disposed = false;
  private abort = () => this.dispose(this.signal.reason ?? new DOMException("Voxel loading cancelled", "AbortError"));
  constructor(private signal: AbortSignal) {
    signal.throwIfAborted();
    this.worker = new Worker(new URL("./voxel-assets.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = event => {
      const pending = this.pending; if (!pending || this.disposed) return;
      this.pending = undefined;
      if (event.data.error) pending.reject(Error(event.data.error)); else pending.resolve(event.data);
    };
    this.worker.onerror = event => this.dispose(Error(event.message || "Voxel decoder failed."));
    signal.addEventListener("abort", this.abort, { once: true });
  }
  decode(buffer: ArrayBuffer, spec: VoxelDecodeSpec): Promise<ReturnType<typeof decodeVoxelAsset>> {
    if (this.disposed) return Promise.reject(this.signal.reason ?? Error("Voxel decoder disposed."));
    if (this.pending) return Promise.reject(Error("Voxel decoding is sequential."));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      try { this.worker.postMessage({ buffer, spec }, [buffer]); }
      catch (error) { this.pending = undefined; reject(error); }
    });
  }
  dispose(reason: unknown = Error("Voxel decoder disposed.")) {
    if (this.disposed) return;
    this.disposed = true; this.worker.terminate(); this.signal.removeEventListener("abort", this.abort);
    this.pending?.reject(reason); this.pending = undefined;
  }
}
