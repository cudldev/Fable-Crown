# Moving-forest LOD continuity

Production comparison, 2026-10-31: the released build versus published artifact `6f743b19f563`. Same forest/save/drag/zoom route, 360 frames per trial, three trials per viewport, Chrome with 4× CPU throttling on i9-10850K / RTX 5070 Ti. Captures run separately from timing. This is host emulation, not physical-phone performance.

Warm trials 1–2, milliseconds:

| Viewport | Mean before → after | p99 before → after |
| --- | --- | --- |
| 1280×800 | 120.2–136.9 → 120.7–127.0 | 258.7–300.3 → 266.9–267.1 |
| 390×844 | 90.5–91.2 → 89.6–91.0 | 225.2–250.3 → 216.9–242.0 |

The ranges overlap; no broad frame-rate improvement is established. The clear improvement is recognizable crowns during movement: [desktop before](before-1280-frame-235.png) / [after](after-1280-frame-235.png), [phone before](before-390-frame-235.png) / [after](after-390-frame-235.png). Native geometry, palettes and tree positions are unchanged.

Afterward, the closest tree met or exceeded its budget-adjusted desired detail for 88.3–93.1% of observed desktop time and 96.8–98.2% on the phone viewport. The released build lacks that probe, so these are not comparative latency gains. Continuously observed coarser spans were at most 851ms / 150.3ms respectively, limited by frame sampling. Post-pan full-queue drain decreased from 11.409s to 3.655s on desktop and 7.296s to .759s on the phone viewport; each is one matching route observation. Global queue age includes deferred prefetch and must not be reported as visible-tree latency.

Raw [before](before.json) / [after](after.json) data retain all trials and counters. `after-v1.json` records an abandoned candidate's incomplete summaries, explicitly without raw data. The harness checkpoints raw trials and supports a stop file. Regression tests cover started-work cancellation, priority starvation, AO byte/face parity, opaque color/depth fades, startup, real camera movement, depletion and offline reload.

Published69ec2b0 via [Actions41207899992](https://github.com/cudldev/Fable-Crown/actions/runs/41207899992). Actual public WebGL, both phone orientations, old-cache/save upgrade and offline reload verified with zero page/GL/request/external errors.
