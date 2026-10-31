# Asynchronous voxel and GI pass — 2026-10-31

Runtime voxel replacements prepare at most 8,192 cells with a 2ms cooperative CPU target per animation frame. Existing LOD batches remain visible during preparation; new visibility/harvest states receive immediate coarse coverage. One prepared replacement is admitted per frame. Obsolete/offscreen work is cancelled; parent/child batches never draw together. Allocation and final WebGL uploads remain synchronous atomic operations and can exceed the target. Staging is lazy, reported separately and included when evicting inactive resident buffers. This is scheduling work, not exposed-face geometry or a shadow/reflection quality reduction.

VOX parsing, AO and derived LOD generation now run in a short-lived decoder worker, transferring finished arrays back. Abort terminates it. Identical capped levels share their immutable arrays. The PWA caches the additional worker locally.

GI rasterization, probe tracing, interpolation and packing now yield through MessageChannel tasks, targeting 4ms work slices. Cancellation is checked between slices; only a complete matching-version field is published. Sampling, 1–3 bounces, atlas precision/layout and lighting values are unchanged. The final texture upload remains synchronous. Production observations: 78–109 yields, 4.2–4.8ms maximum observed worker slice and 324–449ms complete solves in the recorded fixture; these are host observations, not hard deadlines or isolated speedup measurements.

## Matching production bracket

`node scripts/benchmark-streaming.mjs LABEL`; optional `BENCH_DIST` selects an isolated original build. Original → changed → original repeat, with identical current UI/CSS, seed 8128, player at frontier (24,95), fixed day, all default effects, DPR1, Chrome on i9-10850K/RTX5070Ti. Route starts near the forest, alternates zoom, enters overview, and returns to the village camera. Each viewport has three 360-frame trials; trial zero includes first-visit work. No concurrent builds/tests during measurement. Reports include build identities and raw intervals/counters.

Warmed trials 1–2, including both original brackets:

| Metric | Original | Changed |
| --- | --- | --- |
| Desktop mean | 11.92–12.48ms | 9.53–10.01ms |
| Desktop p99 | 150.1–166.9ms | 16.9ms |
| Desktop frames >50ms / trial | 10 | 0 |
| Phone viewport mean | 10.01–10.67ms | 8.55–8.88ms |
| Phone viewport p99 | 83.4–125.1ms | 16.7–16.8ms |
| Phone viewport frames >50ms / trial | 5–7 | 0 |

p95 did not uniformly improve: desktop original 8.5–16.7ms versus changed 16.7ms; phone original 8.5ms versus changed 8.5–16.6ms. Work is distributed across more moderate frames. First-visit desktop maxima remain large: original ~1001ms, changed 842.5ms. This pass does not eliminate all startup/overview hitches or reduce steady dense-forest triangle cost. Viewport emulation is not physical-phone performance. No total-RAM/VRAM or battery claim.

Raw evidence: [original](forest-before.json), [changed](forest-after.json), [original repeat](forest-before-repeat.json), [runtime/offline review](runtime-review.json). Screenshots use these same report prefixes. New local regression: `tests/rpg-voxel-streaming.spec.ts`; release CI remains unchanged.

Validation: 476 unit tests/60 files, strict typecheck, production build and Pages/PWA dist gate, four local WebGL scenarios and two release smoke scenarios pass. Includes real native bindings, depletion/restore, rapid camera changes, matching GI versions, phone orientations and offline decoder-worker restart. Existing mobile test interactions now use the concurrent HUD's Tools menu. Actual day/night and phone renders reviewed. No deployment or physical-phone benchmark.

Follow-up first-visit diagnosis before startup warmup: [instrumented WebGL profile](shader-profile.json) reproduces a 934.3ms interval at the first overview transition. Frame121 creates11new shader programs; `getProgramInfoLog` waits total879.5ms. Frame122creates2more and waits142.8ms. No buffer/texture call exceeded the1ms recording threshold in those frames. Overview changes fog/shadow shader variants; that build made no `compileAsync` prewarm call. The diagnostic does not prove every first-visit stall has the same cause. Temporary reproducer: tmp/profile-first-visit.mjs.

The subsequent startup screen now covers asynchronous normal/overview/post-process compilation and initial uploads/lighting. The real WebGL startup regression records zero new shader links on the first overview after readiness. This moves preparation before gameplay; it is not a physical-phone timing result or a claim that all first-visit work is eliminated.
