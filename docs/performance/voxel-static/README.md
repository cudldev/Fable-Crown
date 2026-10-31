# Shared static VOX props

Native VOX stays editable. The asset worker bakes each model/LOD once: hidden faces are removed and coplanar faces join where pigment/AO allow. Whole-prop [instances](https://threejs.org/docs/pages/InstancedMesh.html) share the immutable geometry buffers. A new copy writes an object transform, rather than rebuilding thousands of cube transforms. Props wait for adequate geometry, then reveal over140ms; existing geometry stays during swaps. Startup warms all37templates before the HUD appears.

Native oak:284,052cube triangles become49,656visible surface triangles. Its exact9,806-triangle shadow mesh was still too costly. The selected1,972-triangle density proxy meets the2,000target and.9projected-shadow-overlap gate in3sun directions:0.931/0.920/0.937IoU, about.98recall. It expands one Z bound by.125m; visible geometry/colors/AO remain unchanged. The cheaper1,446-triangle OR candidate failed (.81–.83IoU) and was rejected. Shadow-only nodes issue zero color/depth-pass GL draws. Unsafe reductions retain finer shadows and report the budget excess.

## Matched local comparison

Artifact97acb2e6696e; i9-10850K/RTX5070Ti, Chrome with4×CPU throttling,1280×800 and390×844. Each renderer ran3trials of the same360-frame forest pan/zoom route, plus separate captures. Both use the **same corrected camera input**, asset baking, workers, lighting and UI; the control changes only the renderer import and label. Service workers were blocked. Warm ranges use trials1–2.

| Viewport | Mean frame ms, cube → static | p99 ms, cube → static | Adequate closest detail, cube → static |
| --- | --- | --- | --- |
| Desktop |75.14–79.72 →67.13–74.40|200.1–208.5 →133.5–200.2|85.8–86.6% →99.4–99.7%|
| Phone viewport |57.23–63.74 →62.04–62.39|100.1–100.2 →91.8–91.9|97.9–98.1% →100%|

Desktop warm means averaged77.43→70.76ms (~8.6% observed reduction). **No phone average-FPS improvement is established**; its ranges overlap. These are host-emulation observations, not physical-phone measurements or statistical guarantees. Published submitted-triangle medians fell3.59–3.65M→.768–.774M desktop and4.91–5.08M→.636M phone. All templates remained cached; static preparation queues/cancellations stayed0. Unique static attribute storage stayed7,419,720bytes; this is not total RAM/VRAM.

The benchmark exposed a separate held-pan/wheel race: stale full-camera snapshots overwrote newer zoom. Functional updates now preserve queued pan/zoom changes. Regression:52unrequested zoom reversions→0;3rapid wheel events now accumulate correctly. All24matched zoom windows have0reversions. Historical8c/f555runs retain that bug and are not isolated mesh comparisons.

Raw [control](output/static-control.json), [static](output/static-after.json), [comparison/method limits](output/comparison.json) and [control integrity](control-build.json). Preparation-time counters differ in scope between renderers; GPU/CPU diagnostics are repeated published samples, not independent per-frame timers. NPCs continue deterministic600ms ticks, so their positions can differ between routes with different wall-clock durations.

Matched native view: [cube desktop](output/static-control-1280-frame-315.png) / [static desktop](output/static-after-1280-frame-315.png), [cube phone](output/static-control-390-frame-315.png) / [static phone](output/static-after-390-frame-315.png). [Shadow candidates and quality scores](../voxel-shadow-proxy/candidate-review.json), [exact shadow](../voxel-shadow-proxy/current-sun-0-exactView.png), [selected shadow](../voxel-shadow-proxy/current-sun-0-proxyView.png), [difference overlay](../voxel-shadow-proxy/current-sun-0-overlay.png).

Reproduce after a normal build: `node scripts/build-voxel-reference-control.mjs` (optionally set `CONTROL_ROOT=tmp/release-publication`), then run `scripts/benchmark-voxel-continuity.mjs` with `BENCH_OUTPUT=docs/performance/voxel-static/output` and the chosen `BENCH_DIST`. Never run builds/tests or other browsers during timing trials. The isolated control never changes the shipping source.

Published[e3da2d0](https://github.com/cudldev/Fable-Crown/commit/e3da2d056ed5c37c714ee917d363e948f9d2ee76) via[Actions41228633500](https://github.com/cudldev/Fable-Crown/actions/runs/41228633500). Actualpublic97acb2e6696e confirms sharedstaticrenderer, savedchapter upgrade, bothphoneorientations andoffline reload; zero page/console/GL/request/external errors.
