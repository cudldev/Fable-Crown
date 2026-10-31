/** Frame cadence measures the displayed loop, not simulation ticks or a promised device frame rate. */
export class FrameMeter {
  private intervals = new Float64Array(120);
  private cursor = 0;
  private count = 0;
  private previous: number | undefined;
  reset() { this.count = 0; this.cursor = 0; this.previous = undefined; }
  sample(now: number) {
    if (this.previous !== undefined) {
      const elapsed = now - this.previous;
      if (elapsed > 0) { this.intervals[this.cursor] = elapsed; this.cursor = (this.cursor + 1) % this.intervals.length; this.count = Math.min(this.intervals.length, this.count + 1); }
    }
    this.previous = now;
  }
  read() {
    if (!this.count) return { fps: 0, meanMs: 0, p95Ms: 0, samples: 0 };
    const sorted = Array.from(this.intervals.subarray(0, this.count)).sort((a, b) => a - b), meanMs = sorted.reduce((sum, value) => sum + value, 0) / this.count;
    return { fps: 1000 / meanMs, meanMs, p95Ms: sorted[Math.max(0, Math.ceil(.95 * this.count) - 1)], samples: this.count };
  }
}

interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
/** Asynchronous, sampled GPU timing. No gl.finish(), readback stall or inference from RAF. */
export class GpuMeter {
  private extension: TimerExtension | null;
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private frame = 0;
  milliseconds: number | null = null;
  constructor(private gl: WebGL2RenderingContext) { this.extension = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExtension | null; }
  begin() {
    const gl = this.gl, extension = this.extension;
    if (!extension || gl.isContextLost()) return;
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) { this.clear(); this.milliseconds = null; return; }
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.pending.shift()!; this.milliseconds = Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6; gl.deleteQuery(query);
    }
    if (++this.frame % 12 || this.pending.length >= 4) return;
    this.active = gl.createQuery(); if (this.active) gl.beginQuery(extension.TIME_ELAPSED_EXT, this.active);
  }
  end() { if (this.active && this.extension) { this.gl.endQuery(this.extension.TIME_ELAPSED_EXT); this.pending.push(this.active); this.active = null; } }
  private clear() { for (const query of this.pending) this.gl.deleteQuery(query); this.pending = []; }
  dispose() { this.end(); this.clear(); }
}
