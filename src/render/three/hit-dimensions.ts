interface Dimensions { width: number; height: number }
const empty: Readonly<Dimensions> = { width: 0, height: 0 };

/** Read intrinsic sizes before frame writes; subsequent changes arrive after browser layout. */
export class HitDimensions {
  private sizes = new Map<HTMLElement, Readonly<Dimensions>>();
  private observer?: ResizeObserver;
  reads = 0;
  constructor() {
    if (typeof ResizeObserver !== "undefined") this.observer = new ResizeObserver(entries => {
      for (const entry of entries) if (this.sizes.has(entry.target as HTMLElement)) {
        const box = entry.borderBoxSize?.[0], node = entry.target as HTMLElement;
        this.store(node, box ? Math.round(box.inlineSize) : node.offsetWidth, box ? Math.round(box.blockSize) : node.offsetHeight);
      }
    });
  }
  private store(node: HTMLElement, width: number, height: number) {
    // display:none reports zero. Retain the last intrinsic size for re-entry.
    if (width > 0 && height > 0) this.sizes.set(node, { width, height });
  }
  prepare(nodes: Iterable<HTMLElement>) {
    const active = new Set(nodes);
    for (const node of this.sizes.keys()) if (!active.has(node)) { this.observer?.unobserve(node); this.sizes.delete(node); }
    for (const node of active) if (!this.sizes.has(node) || !this.observer) {
      const initial = !this.sizes.has(node);
      if (initial) { this.sizes.set(node, empty); this.observer?.observe(node, { box: "border-box" }); }
      this.reads++; this.store(node, node.offsetWidth, node.offsetHeight);
    }
  }
  get(node: HTMLElement) { return this.sizes.get(node) ?? empty; }
  get count() { return this.sizes.size; }
  dispose() { this.observer?.disconnect(); this.sizes.clear(); }
}
