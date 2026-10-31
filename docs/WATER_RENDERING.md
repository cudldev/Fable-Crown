# Water rendering

Flat water uses one shared planar reflection target, gentle world-space ripple normals, Phong sun/lamp highlights and Fresnel reflection. The mirrored camera clips geometry below the−0.055m plane. Both perspective and orthographic views work. This suits flat rivers/ponds; SSR would miss reflected geometry absent from the main camera buffers.

The [procedural sky](SKY_RENDERING.md) now appears in the capture,including moving clouds and day/dusk/night colors. Atmosphere controls adjust coverage,speed and size. Cloud animation continues with a still camera; speed0/reduced motion freeze it.

Visual settings → Water controls reflections, strength, ripples, resolution and update rate. Defaults: enabled,0.65strength,0.35ripples, **Full render resolution** (`waterReflectionResolution:0`) and **Every frame · Realtime** (`waterReflectionRate:0`). Full follows the actual game buffer, including Smooth high-DPI density, bounded by the GPU texture limit. Numeric256/512/1024/2048/4096options cap the longest edge without upscaling smaller buffers. Optional rates60/30/15/4per second reduce capture work. Copy settings includes these values; old presets receive defaults. Reflection controls do not rebuild GI or change saves.

The target preserves viewport aspect and updates every rendered frame by default, even when the camera is still: moving actors and scene animation must appear immediately. The earlier4Hz stationary/15Hz moving policy caused visible lag and is superseded. Optional capped rates keep each cached image paired with its capture projection. Water outside the view, overview mode and disabled reflections skip captures. All water chunks share the capture; selection overlays/grid/motes are excluded. Existing sun shadows are reused, renderer/visibility state is restored, and the target/material are disposed with the runtime. Linear HDR capture avoids double tone mapping; unsupported float targets use a byte fallback.

A cached four-neighbour distance field supplies a presentation basin: one byte per tile, rebuilt only when terrain changes, saturated at3m. Each water chunk has a matching submerged sand/stone bed, from0.10m at the bank to2.975m in the deepest area. Surface transmission reaches about48% directly overhead at the very edge, with increasing absorption by column depth and viewing angle. A broader clear shelf reveals the descending bed before becoming opaque blue inward. Reflections, ripples and surface depth for fog/DoF remain. This uses normal alpha blending, without a refraction capture.

Foam uses detached small irregular flecks with stable seeded shapes. They drift together at0.012m/s east and0.065m/s downstream, gradually forming/fading over7–12seconds. Shore distance only fades them inside a0.44m margin: it no longer draws an offset crest or corner arcs. The earlier warped noise/contour approach looked smoky and moved poorly; it is superseded. Eight neighboring terrain samples distinguish banks from internal water-tile/chunk seams; world borders do not create foam. Fleck evaluation is skipped outside the bank margin. Reduced motion freezes the pattern. Bank skirts extend below the shallow bed; convex bed corners touching dry ground stay at the basin lip to close the transparent edge.

Frame CPU/GPU/draw counters include both render passes. `waterReflectionPasses` counts captures, `waterReflectionMs` is the most recent capture's CPU submission cost (not GPU duration), and `waterReflectionSize` reports the bounded target. No runtime service, downloaded texture or new dependency is required.

Limits: basin depth is inferred from shore distance, not simulated bathymetry or per-object underwater depth. Foam current is a fixed cosmetic direction, not a fluid solver or map-aware flow field. Transmission does not refract geometry. Reflections reuse main-view visibility/LOD; objects already culled by the world renderer can be absent. Pixel actors retain their main-camera billboard pose. Optional capped modes update more slowly than the main view; every-frame mode adds an extra scene render whenever water is visible. Mobile-device speed remains unmeasured.

Implementation: [water.ts](../src/render/three/water.ts). Browser captures and measurements: [water review](art-audit/water-v1/review.json).

## Clear shallows and shore rim — 2026-10-31

GPU fixture: changing the submerged bed from red to blue changes the shallow sample by21RGB levels and the deep sample by0; foam changes the edge by13levels and a water/water join by0. Desktop day/dusk, orthographic, both phone orientations and offline reload pass with no shader/page errors or external requests. Actual images reviewed in [water-depth-v1](art-audit/water-depth-v1/game-review.json). No additional scene capture, service, asset download or dependency; one bed mesh per existing water chunk, extra shore texture reads. No isolated performance or physical-phone claim.

### Deeper basin and wider wavy foam

User requested stronger depth and a wider foam edge. Increased basin slope from0.85to1.15m/m and broadened transmission before deep absorption. GPU shallow bed-color difference now59RGB, deep0. The foam crest reaches0.3–0.4m with two slow wave phases: outer-band contribution32RGB, four-second motion9RGB, water join0.15focused units,3Chrome scenarios, strict Pages-base build/typecheck/dist pass; actual day/dusk/orthographic/phone views reviewed in [water-depth-v2](art-audit/water-depth-v2/game-review.json). Offline reload passes, no page/GL/external errors. Review controls are set at desktop width before phone captures; the minimap can otherwise intercept a landscape control click. Physical-device performance remains unmeasured.

### Natural foam breakup

User rejected the even rim. Replaced it with drifting, warped broad patches and finer wisps; reach and crest position vary locally, with real gaps. GPU straight-bank profile:26/120samples show strong foam,18/40near-bank samples stay quiet; outer reach and motion each change pixels by up to24RGB, water join0.15focused units,3Chrome scenarios and Pages build/typecheck/dist pass. Day/dusk/orthographic/phone/offline captures reviewed in [water-depth-v3](art-audit/water-depth-v3/game-review.json); no page/GL/external errors. Depth/reflection behavior retained; no new texture/pass or performance claim.

### Persistent downstream flecks — replaces the rejected smoky version

User screenshot showed smoky corner arcs and poor motion despite the previous numeric checks. Removed distance-shaped crests and animated noise warping. Small seeded irregular flecks now keep their shape while moving together, with gradual independent lifetimes; distance only fades the shoreline margin. Current direction is fixed cosmetic flow, not simulated hydrodynamics.

Review includes actual game animation [GIF](art-audit/water-depth-v4/game-foam-motion.gif) and deterministic close-bank [GIF](art-audit/water-depth-v4/foam-motion.gif), plus day/dusk/ortho/phone/offline captures. GPU tracking over0.5s: correcting for the known current lowers mean image error from4.97to1.46RGB (ratio0.294). Straight-bank profile has10/120strong foam samples and35/40quiet near-bank samples; water join0, no page/GL errors.15focused units,3Chrome scenarios, strict Pages build/typecheck/dist pass; final margin-skip optimization also passes the GPU regression. No extra mesh/texture/capture, no performance or art-approval claim.

## Initial capped-rate review — 2026-10-30

31focused unit checks and6unique browser checks pass across water, settings/clipboard/mobile, native terrain/offline/fallback. Production build/typecheck and repository-base/PWA checks pass. An isolated GPU projection test samples the actual water pixel beneath a red box: reflection off `[5,36,38]`, on `[124,29,35]`; see [capture](art-audit/water-v1/lab-projection.png) and [raw sample](art-audit/water-v1/lab-projection.json). This verifies color reaches the expected reflected location, beyond camera-math/capture-counter checks.

Host frame cadence was inconsistent. The first forest-bank Pixelated off/on/off bracket measured118.88/118.63/119.88FPS; Smooth measured118.13/107.64/87.48FPS, continuing to fall with reflections off. A repeat returned82.25/72.93/90.41Pixelated and83.16/99.90/103.65Smooth. These runs cannot isolate reflection overhead or establish a performance guarantee. Raw interval/counter records remain in `tree-shore-first-report.json` and `review.json`; initial small-prop-bank evidence is preserved separately. No physical phone benchmark or4K guarantee is claimed.

## Every-frame correction — 2026-10-30

The user noticed the lag from the original capture cap. Every-frame is now the default, with an explicit copied/normalized update-rate setting and optional slower caps. Tests verify repeated captures with an unchanged camera, capped image/projection pairing, live capture density above half the main frame count, and the rate control.14focused unit checks,4browser checks and build/typecheck/dist gates pass.

The new forest-bank off/on/off run measured119.88/119.38/119.88FPS Pixelated and119.88/118.88/119.38FPS Smooth (1280×800 viewport,512×320capture). This run was stable near the host refresh cap; it does not isolate GPU overhead or predict other devices. Evidence: [realtime review](art-audit/water-realtime-v1/review.json). Earlier capped-rate evidence is retained.

## Full-resolution correction — 2026-10-30

The user found512too low. Full render resolution is now the default;2048/4096caps are also available.15focused unit checks,3browser checks and build/typecheck/dist gates pass, including hardware limits/aspect,actual3840×1941Smooth reflection targets and live cap selection. At2560×1294CSS/DPR1.5, the512/full/512bracket observed119.88/115.38/116.39FPS. Host readings do not isolate overhead or predict mobile speed. [Review](art-audit/water-resolution-v1/review.json) · [full-resolution capture](art-audit/water-resolution-v1/full-resolution.png).
