# Sky and reflected clouds

The3D world has a procedural sky background with day/dusk/night gradients, a sun or moon glow matching the light direction, and moving cloud forms. Water captures the same sky each frame. Sky rays use the actual main/reflected camera; perspective,orthographic and water's oblique clipping are supported.

### Celestial discs, rays and gradient fog — 2026-10-31

Sun/moon now have readable angular discs (~3degrees across), a restrained halo and procedural moon craters. The active disc follows the existing directional light and blends through the cycle's dawn/dusk. This is a stylized shared sun/moon path, not an astronomical ephemeris. Bodies appear when their direction falls inside the camera view; the downward gameplay framing can still put them outside the screen. Water sees the same world-space sky.

The original screen-space radial rays were replaced by world fog shafts (below); they could not serve the downward gameplay camera reliably. Light rays defaults0.65 (user accepted strength). At1280×800 the extra half-float target is~0.49MiB; no isolated GPU/mobile performance claim.

Fog color gradient defaults0.7: warmer lower air and cooler upper air, derived from the active cycle palette. Sky and geometry share one elevation-gradient function; geometry uses bent world position to preserve camera alignment while logical coordinates still govern cutoff/picking. Sky off restores the plain background/fog match. The gradient changes tint, not visibility range or simulation.

Evidence: `art-audit/celestial-rays-v1` contains actual GPU sun/moon/ray/gradient fixtures; full-scene cycle/phone/offline evidence remains in `art-audit/fidelity-cycle-v1`. No new downloaded/authored asset or runtime service.

### World fog shafts — 2026-10-31

Light rays now reconstruct the camera ray from scene depth and integrate24samples through a low world-height fog layer, checking the existing directional PCF shadow depth at each point. This works with the sun behind the camera and in perspective/orthographic views. Trees/buildings can block the light even outside the main camera view, within the existing shadow coverage. The cycle supplies warm sunlight/weaker moonlight; no second shadow render is added.

Sampling reverses world curvature before querying the logical shadow field, stops at visible scene depth, fades at shadow/view bounds, and uses depth-aware quarter-resolution reconstruction to protect foreground edges. Fog off, sun shadows off, overview, zero strength or unavailable comparison-depth maps disable the pass. Sky visibility is irrelevant. The old projected source calculation/radial shader is removed.

This is a bounded single-scattering approximation: low-frequency height density,24fixed steps, one directional source, no cloud shadow volume/multiple scattering, no local lamp shafts. Canopy gaps and low-angle sunlight give stronger structure; open areas mostly receive a soft haze lift. Stable-camera GPU comparisons are deterministic; movement can still expose sampling/quarter-resolution artifacts. No general performance/mobile guarantee.

Evidence: `art-audit/world-fog-shafts-v1` includes an offscreen-source GPU fixture, shadow-blocking and orthographic checks, plus actual forest off/default/stronger captures. Older `celestial-rays-v1/rays.png` is historical evidence for the removed screen-space approach.

Fog-edge correction: geometry and sky shaft rays share a clipped horizon cylinder. In the last86–98%of view range, fully fogged geometry blends to the same integration endpoint/depth classification as sky. Height density tapers smoothly; grading now applies to sky and geometry together, and the sun halo fades below the horizon. Fog-enabled plain backgrounds share tonemapping too. GPU seam evidence: `art-audit/fog-edge-v1`; the faded objects retain normal depth/culling/picking in the scene (the canonical depth affects the shaft reconstruction only).

Bridge/shore follow-up: that seam test missed sharp shaft silhouettes added after depth of field. Scattering now joins scene color before the sharp/defocus mix and is gathered through the same aperture; subpixel chromatic corrections also enter before that mix. Focused fog retains depth-aware reconstruction. No new target/pass is added. Separately, short textured vertical bank faces close the0.055m gap between dry terrain and water, preventing the sky from showing through along shorelines. This is runtime geometry using existing tile pixels, not new art.

Reproduction: `art-audit/shore-outline-v1/before-baseline.png` versus `baseline.png` at the same1920×1080bridge camera; no-rays/no-CA/no-DoF/no-reflections captures isolate the effects. The fog-defocus GPU regression reduces its maximum contribution edge from82to3levels while preserving scattering energy. This is a controlled pixel check, not a performance claim. Default shaft strength stays0.65.

Visual settings → Atmosphere exposes sky enable,cloud coverage,speed and size. Defaults: enabled,55%coverage,1×speed/size. Speed0 and reduced motion freeze the current phase without snapping. Copy/reset includes these settings; they do not rebake GI or change simulation/saves.

One far-depth triangle per view draws after opaque geometry and before transparency,so covered sky fragments can fail depth early. A deterministic local128×128single-channel noise texture (16KiB plus mips) supplies three cloud samples; no downloaded sky images,cubemap recapture,API or new dependency is needed. Resources are released with the runtime.

Clouds are a shaded180m layer. Volumetric thickness,world cloud shadows and cloud-driven GI changes are outside this pass. Main-camera sky can be mostly outside the downward-looking gameplay view; its upper hemisphere remains visible in water.

Evidence: [game](art-audit/sky-v1/world-dusk.png), [upward sky view](art-audit/sky-v1/sky-look-up.png), [reflected cloud lab](art-audit/sky-v1/reflected-clouds-lab.png), [GPU pixel comparison](art-audit/sky-v1/lab-review.json), [game benchmark](art-audit/sky-v1/game-review.json).

Validation:21focused units,6unique browser checks,build/typecheck/dist gates pass. Offline reload and copied/mobile controls work with no external requests or WebGL errors. The GPU water-only comparison changes mean RGB24.73levels between clear/cloudy and8.50with cloud motion; frozen speed changes0. Sky off/on/off at1200×750observed119.88/118.38/119.38FPS. A3840×1941repeat with sky enabled observed116.88/119.88/119.88FPS across512/full/512capture limits ([raw data](art-audit/sky-v1/high-dpi/review.json)). These are refresh-capped host observations,not isolated GPU cost or physical-phone guarantees.
