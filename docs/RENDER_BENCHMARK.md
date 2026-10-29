# Zoom rendering check — 2026-10-29

Chrome156.0.8078.48 headless, Windows10.0.26200 x64, Intel i9-10850K (20logical CPUs),1280×720 DPR1, no CPU throttling. Each camera receives3s warmup and5s sampling. Canvas API instrumentation and requestAnimationFrame timestamps are collected by `scripts/benchmark-render.mjs`. These are desktop browser measurements, not physical-device FPS or total memory measurements.

| View | Before median / p95 frame interval | After median / p95 | Before / after chunk builds during sample |
|---|---:|---:|---:|
| Close,0.85 |8.3 /8.4ms|8.3 /8.4ms|3 /3|
| Far,0.15 |1893.4 /1951.9ms|8.3 /8.4ms|144 /0|
| Overview |8.3 /8.4ms|8.3 /8.4ms|0 /0|

Specialist's before/after run: far-view measured Canvas API CPU per paint fell from1703.9ms to0.361ms. API timing covers instrumented Canvas calls, not all browser/GPU work. The old12-entry cache continually evicted terrain needed by the distant view. The new renderer uses a reusable painted composite for distant views or working sets above its24-chunk cache budget, small material stamps and bounded512px art sources. Animation runs in Canvas with imperative hit-target placement, without a React render each frame. Tile-grid edges share one path; the detailed grid hides below0.35zoom.

Renderer-owned allocations are bounded:24terrain chunks (48MiB), approximately4MiB composite, at most23MiB of512px art canvases, plus five66×34 material stamps. Browser-decoded images, the screen canvas and other application memory are additional. Source images are released from renderer references after baking; full-resolution frame metadata preserves pivots.

Reproduce: build with `GITHUB_REPOSITORY=cudldev/Fable-Crown`, start production preview at `/Fable-Crown/`, then run `node scripts/benchmark-render.mjs` with `DEMO_URL=http://127.0.0.1:4174/Fable-Crown/`. Keep the same browser/viewport/instrumentation for comparisons. Final lead integration rerun is recorded in PROGRESS.md.

Final integration repeat, same hardware/settings after shared-grid path and source-image release changes: all three views retained8.3ms median /8.4ms p95. Close/far/overview Canvas API CPU per paint was0.206/0.369/0.268ms; sampled chunk builds3/0/0. These measured results agree with the specialist run above.

Early-game final integration: with240single-tile trees and12enemy spawns, same-host Chrome156/settings above measured median8.3ms,p958.5ms in close/far/overview. Canvas API CPU per paint0.247/0.409/0.261ms; terrain chunk builds0/0/0 during sampled windows. A separate fixed~4MiB tree composite invalidates only world/art/depleted-tree signature changes. Actor atlas cache remains bounded48frames. No physical mobile performance claim.
