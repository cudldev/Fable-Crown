# Voxel GI, AO and performance display

First implementation,2026-10-30. The3D game now has cached first-bounce diffuse global illumination, independent ambient-occlusion controls and a live FPS/frame-time indicator. This is a measured desktop prototype; actual-phone performance and final art acceptance remain pending.

## What runs

- Static world occupancy/albedo/emission is built from native VOX lighting cells and actual non-voxel triangles. Triangle/box intersection preserves openings more accurately than filling object bounds. Texture/vertex colors supply approximate base color; source images/VOX palette are unchanged.
- A worker traces deterministic sphere samples through the coarse world grid, tests sun/local-light visibility and integrates first-bounce diffuse radiance into four L1 spherical-harmonic coefficients. Emissive surfaces participate even behind the camera.
- Probes are2m apart,32rays each; visibility-weighted interpolation rejects probes across blockers. A40x8x40m field at0.5m spacing is cached as a half-float3D atlas.
- Rendering uses four texture lookups for directional indirect light plus sky visibility. AO-only mode reads the first coefficient. There is no full-screen ray-marching or per-frame transport solve.
- Atlas layout is2x2 sub-volumes with edge gutters:164x16x164texels,3,442,688bytes. Axes fit WebGL2's guaranteed256-texel minimum3D texture limit.
- The cache follows snapped world regions, fading over3m at X/Z edges. Outside it and in overview, existing broad ambient lighting remains. Characters, ordinary props, terrain and instanced voxels receive the field.
- Relevant harvest state changes queue behind the active solve; only the newest pending state is retained. They cannot continuously cancel the first result. Region/preset/world-geometry changes replace obsolete work; stale messages are ignored.
- Roofs remain physical GI blockers when visually cut away. Gates are captured after their current transforms are applied. Old irradiance remains during an update until its replacement arrives, so changes converge asynchronously.
- The worker and renderer are cached under the repository PWA scope. Offline reload rebuilds the field locally. No service/API/model download/runtime inference is introduced.

## Ambient occlusion

Native voxel surfaces carry face-specific, four-corner occlusion from neighboring occupied cells. Twenty-four normalized bytes per surface cube preserve the data independently of RGB, including per-LOD derivation. Instance buffers update with chunk/state/LOD changes, not every frame.

Coarse world sky visibility supplies cross-object/interior ambient occlusion. Both forms affect indirect light, leaving direct light intact. Moving actors receive the field but do not yet cast new AO into it; sun shadows still provide their contact shadows. GTAO/SSAO is not part of this implementation.

## Visual controls

The Visual settings panel adjusts exposure, sun/ambient/lamp lighting, colors, shadow quality/bias/coverage, GI/AO strength and fog. Copy settings exports versioned JSON with the camera/preset/toggles; clipboard failure offers selected text for manual copying. Reset restores the accepted dusk defaults: sun23.3°/62.3°, shadow2048/softness3.5/coverage79/bias−0.003/normal bias0.055, GI1.3 and fog reach60m.

AO distance defaults to0.125m, adjustable from0.125–8m in0.125m steps (including0.25m). Local corner reach updates immediately; world occlusion is cached and updates after the background solve, with180ms input debounce. This distance does not shorten GI color transport. The worker's0.5m occupancy and2m probe spacing still limit fine world-occlusion detail. Controls do not alter saves or simulation.

## FPS display

The3D game shows rolling FPS and mean frame time. Hover for recent p95 frame time and sampled GPU render time where supported. The window covers up to120frames and updates twice per second. Real long frames remain counted; explicit visibility changes reset the window to exclude background-tab suspension.

GPU timings use asynchronous `EXT_disjoint_timer_query_webgl2` queries every12frames, rejecting disjoint results. Unsupported devices show FPS/frame times without inventing GPU values. No synchronous GPU wait/readback is used by the in-game meter.

## Verification and observations

The initial lighting gate passed310unit tests and15browser checks, including resource/preset invalidation, FPS, offline GI rebuild and existing character variants. After adding visual controls and the accepted defaults,316unit tests and both targeted visual-settings browser tests pass. The latter cover live renderer updates,0.125/0.25m AO selection, copied JSON, reset, keyboard focus, mobile panel scrolling and clipboard fallback. Typecheck/build/dist checks pass at `/Fable-Crown/`; existing large-chunk notice remains. The unavailable-fitted-asset fault test blocks service workers so a cached success cannot mask its injected404.

[Actual game GI/AO](art-audit/voxel-lighting-v1/world-gi-ao.png) · [effects off](art-audit/voxel-lighting-v1/world-off.png) · [portrait FPS display](art-audit/voxel-lighting-v1/world-phone.png) · [measurements](art-audit/voxel-lighting-v1/browser-review.json)

[Isolated red-emitter test](art-audit/voxel-lighting-v1/lab-bounce-on.png) · [sealed room](art-audit/voxel-lighting-v1/lab-room-on.png) · [lab measurements](art-audit/voxel-lighting-v1/lab-review.json)

The isolated WebGL test puts a red emissive surface behind the camera. Turning GI on raises the receiver's red channel while green/blue remain unchanged. A camera inside a sealed, unlit room loses outside fill when occlusion is enabled. These use the actual worker/material shader, not reference artwork. Core tests also cover sun/lamp color transfer, through-wall probe rejection, harvest occupancy and AO/RGB separation.

Observed on Windows HeadlessChrome156/ANGLE Direct3D11 with RTX5070Ti: the tested game views remained approximately118–120FPS, with sampled whole-scene GPU times roughly5–8ms. The game cache rebuild was roughly0.5s in a worker; the isolated fixture roughly0.4s. These are individual observations, not a device guarantee, mobile result or isolated GI-overhead benchmark. RAF can be refresh-rate capped; GPU samples vary with NPCs, shadows and view contents.

## Limits and next work

- Low-frequency L1 diffuse transport, with 1 bounce by default and optional 2/3-pass propagation; no glossy GI or full path tracing.
-0.5m conservative occupancy can close narrow windows and blur thin features. Normal bias and probe interpolation still need broader indoor/border testing; one sealed-room pass does not prove zero leaks everywhere.
- Local lights in the main direct-light rig remain unshadowed and may spill through walls independently of GI.
- Dynamic actors do not inject occlusion/emission. Animated light flicker is direct-only; baked source shading can still compound scene lighting.
- Geometry/preset changes rebuild the active field in the background. Partial dirty-region reuse, quality tiers and actual mobile GPU/memory/battery benchmarks remain future work.
- Most non-tree assets still await voxel migration. This renderer work does not generate their missing art or animation.

Code: [transport](../src/render/three/voxel-gi-core.ts), [worker](../src/render/three/voxel-gi.worker.ts), [shader/cache integration](../src/render/three/voxel-gi.ts), [world capture](../src/render/three/voxel-gi-source.ts), [corner AO](../src/render/three/voxel-ao.ts), [FPS/GPU meters](../src/render/three/performance.ts).

## Contact, atmosphere and daylight pass — 2026-10-31

The default view now uses a cosmetic day–night cycle. One day takes30active game minutes; starting hour16. The clock derives from saved600ms ticks with bounded render interpolation, so saves retain the phase and simulation pauses stop its advance. It never changes the real-date calendar, decisions, deadlines or saves. Cycle controls persist locally, and Reset restores Cycle. Fixed Day/Dusk/Night buttons disable it for comparisons. Sun/moon direction, scene/fog colors, ambient fill, procedural sky/cloud palette and lamp gain blend through dawn/day/dusk/night; custom color tints still override the corresponding colors. Moonlight reuses the single shadow-casting directional light.

Direct lighting follows the continuous phase. GI samples half-hour phases (37.5active seconds at default day length), preserving its background cache rather than launching solves per frame. Indirect lighting can therefore lag the direct phase by up to half a game hour plus worker latency. World movement, depletion and manual lighting changes retain their existing invalidation behavior.

Diffuse bounces1/2/3 are selectable in Visual settings. Each additional pass gathers the previous pass's visibility-weighted SH irradiance at hit surfaces, evaluates it along the surface normal, then applies albedo/PI. Each pass rebuilds direct plus propagated light; it does not repeatedly add the old result. Unlit scenes remain unlit, and AO stays independent. The final atlas layout, texture size and four per-fragment samples are unchanged; worker tracing and temporary probe fields cost more. This remains a coarse diffuse approximation, not path tracing or shadow-map softening. One bounce remains default pending broader visual/device comparisons.

Ground contact uses a cached8samples/m R8 field (3MiB for256×192tiles), local to fence posts, object roots and foundations. It darkens native ground only; cutout foliage/sprites do not receive screen-space halos. Strength defaults0.45. Character feet use a shared32×32radial alpha texture for softer contacts. No authored asset changed. Ambient gain defaults0.85; subtle warm highlights/cool shadows default0.35 in the existing composite pass.

Height haze is an inexpensive surface shader approximation combined with logical horizontal distance fog. Relative ground density is `exp(-max(0, worldY)*0.8)` (45%at1m,20%at2m), multiplied by gentle static world-space patches and a distance ramp beginning4m from the camera target. Layered ground haze defaults0.65; near/middle air is clearer, while the existing distant fade still reaches full fog before geometry/picking cutoff. Fog color follows the cycle. It does not integrate density along camera rays, scatter local lights, cast fog shadows or produce volumetric shafts. Existing floating particles are separate.

Evidence: [matched controls/bounce/cycle captures and host observations](art-audit/fidelity-cycle-v1/review.json), [noon](art-audit/fidelity-cycle-v1/cycle-12.png), [night](art-audit/fidelity-cycle-v1/cycle-0.png). These are actual browser renders with unchanged assets. Physical mobile performance remains unmeasured.

Final desktop comparison observed1/2/3bounces at~0.704/1.214/1.313s worker rebuild,119.9FPS (refresh-rate capped),8.4–8.5ms RAF p95, with the same3442688byte final atlas. Short full-scene host samples do not establish isolated GPU overhead or mobile cost. The extra visual fill was subtle; default remains1. The cycle, haze and contact settings are independent of bounce count.
