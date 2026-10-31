# Full build-time voxel bake

All current native props compile before Vite bundles gameplay: nine sources, ten bindings including supplies, five LOD slots, available/depleted states, exact pigment/corner AO, GI source fields and selected shadow casters. The FCVB1 package preserves capped-LOD and depleted-model aliases. Gameplay asynchronously decompresses/validates ready arrays; it performs no VOX parsing, LOD derivation, surface meshing or supply composition. All37 GPU templates still warm behind the startup screen.

Terrain's288 authored modules compile into294,912bytes of resolved top pigment and exact linear GI averages. World-dependent tile selection, atlas arrangement/mips and geometry placement remain runtime operations. Runtime GI probes still react to lighting and harvesting. This caches preparation: the visible oak remains49,656triangles and its selected shadow remains1,972.

Props:10,591,132raw bytes →1,682,622gzip bytes. Total offline artwork falls3.53→2.55MiB (3,702,570→2,671,674bytes). The package uses `meshes.bin` with explicit application compression; `.gz` URLs were rejected because the preview host transparently decoded them before integrity validation. No raw VOX or terrain source pack ships in dist or its offline cache; editable sources stay local.

## Startup comparison

[Raw observations](startup.json): previous97acb2e6696e versus baked9d987edc0d4e; serial before/after/before, two fresh contexts per bracket, Chrome/headless,390×844/DPR1,4×CPU throttle on i9-10850K/RTX5070Ti. Service workers blocked; no network shaping, builds, tests or other browsers during timing. All six starts require37templates and actual native bindings.

| Observation | Previous (four starts) | Full bake (two starts) |
| --- | --- | --- |
| Prop worker message total |537–756ms,9jobs|67–80ms,1job|
| First-to-last prop worker result |609–832ms|67–80ms|
| Full scene ready |6,559–7,733ms|6,621–8,008ms|
| Raw source requests |10|0|

Worker message timing includes worker startup, computation, validation and transfer; full ready also includes terrain arrangement, shaders, GPU uploads and GI. Full ready time has no consistent improvement in these samples. These are host startup observations, not physical-phone or steady-FPS results. Artifact/harness identities and samples are in the report.

## Workflow

Run `npm run voxel:bake` after updating validated source manifests. `npm run build` regenerates both packages; `npm run voxel:check-bake` checks deterministic output against current compiler/source inputs. Source/algorithm hashes version delivery independently of native editing versions. Stale/truncated/corrupt packages reject; abort terminates the loading worker. GPU acceptance stays local; release CI remains two non-GPU smoke cases.

FunctionalGPU evidence: [props/LOD/harvest/mobile/offline](runtime-review.json), [terrain/UV/mips/offline](terrain-review.json), [forest](forest.png), [phone](phone.png). All14local cases passed. The comparison blocks service workers. Later changes adjust build-tool dependency resolution and PWA installer freshness; compressed mesh bytes and the loading worker are unchanged.

Published [full bake2842eae](https://github.com/cudldev/Fable-Crown/commit/2842eaef0566e5be831502704a61ef6285c0ea1a) plus [PWA freshness6bec969](https://github.com/cudldev/Fable-Crown/commit/6bec969412afd3dd3ba898ba0c6fbe55360dabc1), [Actions41234875066](https://github.com/cudldev/Fable-Crown/actions/runs/41234875066). Actualpublic0590159679cf verifies37templates, zero raw-source requests, desktop/mobile/WebGL/offline. Cached97ac upgrade preserves inventory/skills/equipment and removes old caches. Installer reloads HTTP cache and hashes its own implementation; the new localPWAfixture fails the old installer and passes the fix.524units,14GPUcases and2release smoke cases pass.
