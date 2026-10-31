import type { BakedVoxelAssets } from "./voxel-bake";

/** Decompression/validation stays asynchronous; no VOX parser or mesher in this worker. */
export class VoxelBakeDecoder {
  private worker: Worker;
  private pending?: { resolve: (value: BakedVoxelAssets) => void; reject: (reason: unknown) => void };
  private disposed = false;
  private abort = () => this.dispose(this.signal.reason ?? new DOMException("Voxel loading cancelled", "AbortError"));
  constructor(private signal: AbortSignal) {
    signal.throwIfAborted();
    this.worker = new Worker(new URL("./voxel-bake.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = event => {
      const pending = this.pending; if (!pending || this.disposed) return;
      this.pending = undefined;
      if (event.data.error) pending.reject(Error(event.data.error)); else pending.resolve(event.data);
    };
    this.worker.onerror = event => this.dispose(Error(event.message || "Voxel bake loader failed."));
    signal.addEventListener("abort", this.abort, { once: true });
  }
  decode(buffer: ArrayBuffer, sourceVersion: string, decodedBytes: number, sha256: string): Promise<BakedVoxelAssets> {
    if (this.disposed) return Promise.reject(this.signal.reason ?? Error("Voxel bake loader disposed."));
    if (this.pending) return Promise.reject(Error("Voxel bake loading is sequential."));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      try { this.worker.postMessage({ buffer, sourceVersion, decodedBytes, sha256 }, [buffer]); }
      catch (error) { this.pending = undefined; reject(error); }
    });
  }
  dispose(reason: unknown = Error("Voxel bake loader disposed.")) {
    if (this.disposed) return;
    this.disposed = true; this.worker.terminate(); this.signal.removeEventListener("abort", this.abort);
    this.pending?.reject(reason); this.pending = undefined;
  }
}
