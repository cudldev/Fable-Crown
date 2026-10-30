# Sky and reflected clouds

The3D world has a procedural sky background with day/dusk/night gradients, a sun or moon glow matching the light direction, and moving cloud forms. Water captures the same sky each frame. Sky rays use the actual main/reflected camera; perspective,orthographic and water's oblique clipping are supported.

Visual settings → Atmosphere exposes sky enable,cloud coverage,speed and size. Defaults: enabled,55%coverage,1×speed/size. Speed0 and reduced motion freeze the current phase without snapping. Copy/reset includes these settings; they do not rebake GI or change simulation/saves.

One far-depth triangle per view draws after opaque geometry and before transparency,so covered sky fragments can fail depth early. A deterministic local128×128single-channel noise texture (16KiB plus mips) supplies three cloud samples; no downloaded sky images,cubemap recapture,API or new dependency is needed. Resources are released with the runtime.

Clouds are a shaded180m layer. Volumetric thickness,world cloud shadows and cloud-driven GI changes are outside this pass. Main-camera sky can be mostly outside the downward-looking gameplay view; its upper hemisphere remains visible in water.

Evidence: [game](art-audit/sky-v1/world-dusk.png), [upward sky view](art-audit/sky-v1/sky-look-up.png), [reflected cloud lab](art-audit/sky-v1/reflected-clouds-lab.png), [GPU pixel comparison](art-audit/sky-v1/lab-review.json), [game benchmark](art-audit/sky-v1/game-review.json).

Validation:21focused units,6unique browser checks,build/typecheck/dist gates pass. Offline reload and copied/mobile controls work with no external requests or WebGL errors. The GPU water-only comparison changes mean RGB24.73levels between clear/cloudy and8.50with cloud motion; frozen speed changes0. Sky off/on/off at1200×750observed119.88/118.38/119.38FPS. A3840×1941repeat with sky enabled observed116.88/119.88/119.88FPS across512/full/512capture limits ([raw data](art-audit/sky-v1/high-dpi/review.json)). These are refresh-capped host observations,not isolated GPU cost or physical-phone guarantees.
