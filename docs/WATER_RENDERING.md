# Water rendering

Flat water uses one shared planar reflection target, gentle world-space ripple normals, Phong sun/lamp highlights and Fresnel reflection. The mirrored camera clips geometry below the−0.055m plane. Both perspective and orthographic views work. This suits flat rivers/ponds; SSR would miss reflected geometry absent from the main camera buffers.

The [procedural sky](SKY_RENDERING.md) now appears in the capture,including moving clouds and day/dusk/night colors. Atmosphere controls adjust coverage,speed and size. Cloud animation continues with a still camera; speed0/reduced motion freeze it.

Visual settings → Water controls reflections, strength, ripples, resolution and update rate. Defaults: enabled,0.65strength,0.35ripples, **Full render resolution** (`waterReflectionResolution:0`) and **Every frame · Realtime** (`waterReflectionRate:0`). Full follows the actual game buffer, including Smooth high-DPI density, bounded by the GPU texture limit. Numeric256/512/1024/2048/4096options cap the longest edge without upscaling smaller buffers. Optional rates60/30/15/4per second reduce capture work. Copy settings includes these values; old presets receive defaults. Reflection controls do not rebuild GI or change saves.

The target preserves viewport aspect and updates every rendered frame by default, even when the camera is still: moving actors and scene animation must appear immediately. The earlier4Hz stationary/15Hz moving policy caused visible lag and is superseded. Optional capped rates keep each cached image paired with its capture projection. Water outside the view, overview mode and disabled reflections skip captures. All water chunks share the capture; selection overlays/grid/motes are excluded. Existing sun shadows are reused, renderer/visibility state is restored, and the target/material are disposed with the runtime. Linear HDR capture avoids double tone mapping; unsupported float targets use a byte fallback.

A cached four-neighbour distance field supplies muted shallow-bank color without extra geometry or passes: one byte per tile, rebuilt only when the terrain changes, saturated at3m. The light bank is concentrated around the first water cell. This is approximate surface color; it does not reveal submerged geometry.

Frame CPU/GPU/draw counters include both render passes. `waterReflectionPasses` counts captures, `waterReflectionMs` is the most recent capture's CPU submission cost (not GPU duration), and `waterReflectionSize` reports the bounded target. No runtime service, downloaded texture or new dependency is required.

Limits: this is surface reflection and approximate shore color, not refraction or simulated water depth. Reflections reuse main-view visibility/LOD; objects already culled by the world renderer can be absent. Pixel actors retain their main-camera billboard pose. Optional capped modes update more slowly than the main view; every-frame mode adds an extra scene render whenever water is visible. Mobile-device speed remains unmeasured.

Implementation: [water.ts](../src/render/three/water.ts). Browser captures and measurements: [water review](art-audit/water-v1/review.json).

## Initial capped-rate review — 2026-10-30

31focused unit checks and6unique browser checks pass across water, settings/clipboard/mobile, native terrain/offline/fallback. Production build/typecheck and repository-base/PWA checks pass. An isolated GPU projection test samples the actual water pixel beneath a red box: reflection off `[5,36,38]`, on `[124,29,35]`; see [capture](art-audit/water-v1/lab-projection.png) and [raw sample](art-audit/water-v1/lab-projection.json). This verifies color reaches the expected reflected location, beyond camera-math/capture-counter checks.

Host frame cadence was inconsistent. The first forest-bank Pixelated off/on/off bracket measured118.88/118.63/119.88FPS; Smooth measured118.13/107.64/87.48FPS, continuing to fall with reflections off. A repeat returned82.25/72.93/90.41Pixelated and83.16/99.90/103.65Smooth. These runs cannot isolate reflection overhead or establish a performance guarantee. Raw interval/counter records remain in `tree-shore-first-report.json` and `review.json`; initial small-prop-bank evidence is preserved separately. No physical phone benchmark or4K guarantee is claimed.

## Every-frame correction — 2026-10-30

The user noticed the lag from the original capture cap. Every-frame is now the default, with an explicit copied/normalized update-rate setting and optional slower caps. Tests verify repeated captures with an unchanged camera, capped image/projection pairing, live capture density above half the main frame count, and the rate control.14focused unit checks,4browser checks and build/typecheck/dist gates pass.

The new forest-bank off/on/off run measured119.88/119.38/119.88FPS Pixelated and119.88/118.88/119.38FPS Smooth (1280×800 viewport,512×320capture). This run was stable near the host refresh cap; it does not isolate GPU overhead or predict other devices. Evidence: [realtime review](art-audit/water-realtime-v1/review.json). Earlier capped-rate evidence is retained.

## Full-resolution correction — 2026-10-30

The user found512too low. Full render resolution is now the default;2048/4096caps are also available.15focused unit checks,3browser checks and build/typecheck/dist gates pass, including hardware limits/aspect,actual3840×1941Smooth reflection targets and live cap selection. At2560×1294CSS/DPR1.5, the512/full/512bracket observed119.88/115.38/116.39FPS. Host readings do not isolate overhead or predict mobile speed. [Review](art-audit/water-resolution-v1/review.json) · [full-resolution capture](art-audit/water-resolution-v1/full-resolution.png).
