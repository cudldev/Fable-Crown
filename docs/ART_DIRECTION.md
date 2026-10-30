# Fable Crown — Voxel World and Pixel Cast (CURRENT)

> Current renderer update — 2026-10-30: The voxel world and approved pixel cast are now the sole gameplay renderer. Painterly/ink/fitted runtime styles are retired; original source art is retained. Environment migration remains incomplete.

## Authoritative decision — 2026-10-30

The current art direction is **warm storybook voxel environments with original pixel-sprite characters and enemies**. The user approved the full cast swap on 2026-10-30 after the Realm class-sheet proportion study. Terrain/buildings/props retain their voxel direction. Units are upright, camera-facing 2D billboards, with squat nearly square bodies, a low cap/hair, narrow natural-skin face band, broad torso and tiny feet. No dark contour rings or black void faces. Use [fable-pixel-characters](../skills/fable-pixel-characters/SKILL.md) for every unit and [PIXEL_CAST.md](PIXEL_CAST.md) for implementation/review status.

## Visual language

- Render the game at normal display resolution with antialiasing (display density capped at 2×). Screen pixelation and the Pixelated/Smooth selector were removed at the user's request; pixel sprites and voxel asset shapes retain their authored appearance.

- Environments: actual cubic volume, stepped silhouettes and crisp block terraces, with natural matte colors and gentle diffuse lighting.
- Warm olive/sage grass, ochre earth, pale stone, muted wood and restrained gold/blue accents. Broad connected color groups and soft material transitions; avoid random color noise, heavy dark borders, glossy plastic and excessive bloom.
- Traditional fantasy identity: Alden's blue cape and gold trim, recognizable craftspeople and tools, timber/stone buildings, warm forges and lush trees.
- Characters/enemies: broad flat square pixel clusters, simple role/species silhouettes and sparse material colors. Compact goofy shape, natural human skin and dark eyes; material colors form silhouette edges. No vector/painted drift, huge separate chibi heads, long boots or dark outlines. Enemy creatures retain recognizable species shapes.
- Keep faces and costume accents readable at gameplay and phone scale. Display size is independent of native grid detail. Preserve foot contacts, tool anchors and action phases across sprite frames.
- UI remains compact parchment/ink or navy/gold with high contrast, generous touch targets and sparse ornament in both orientations.

## Current references

- **Approved cast direction:** [class-sheet proportion study](../assets/explorations/voxel/sprite-rotmg-study-v6/concept.png); [user-supplied proportion reference](../assets/explorations/voxel/sprite-rotmg-study-v6/proportion-reference.png) informs proportions only, not reusable game art. [Exact native runtime atlas review](art-audit/pixel-cast-v1/unit-gallery.png).

- **Terrain appearance:** [user-provided voxel reference](../assets/reference/fable_crown_voxel_current.png), matching [A — Warm storybook](../assets/explorations/voxel/terrain-style-v1/a-warm-storybook.png). The user prefers A's softer transitions and also likes B. [Editable style profile](../assets/explorations/voxel/terrain-style-v1/style-profile.json).
- **Actual terrain art draft:** [native style A kit](../assets/source/voxel/terrain-style-a-v2/README.md), with [browser/Blender review](art-audit/terrain-style-a-v2/review.md). Warm softened material joins,exact flat supports and separate stairs; game integration is still pending.
- **Accepted volumetric asset baseline:** [oak source/voxel comparison](../assets/explorations/voxel/trellis-oak-softlight-v1/vox-01/comparison.png). Follow its broad quiet material groups and stepped volume.
- **Character simplification study (pending approval):** [coarse lineup and Alden pose strip](../assets/explorations/voxel/character-simple-v2/concept.png), with [exact prompt and review notes](../assets/explorations/voxel/character-simple-v2/README.md). This is a generated appearance study, not native voxel geometry or implemented animation.
- **Single character source (pending approval):** [isolated Alden](../assets/explorations/voxel/alden-source-v1/input.png), generated with the voxel-reference skill; [brief, prompt chain and alpha review](../assets/explorations/voxel/alden-source-v1/README.md). Native VOX and animation remain pending.
- Earlier `fable_crown_painterly_latest.png`, `fable_crown_watercolor_ink.png`, `hd2d_demo_concept.png` and ink character studies are historical references. They do not override this direction.
- Concept images communicate appearance; they are not metric geometry, finished game assets or proof of animation quality.

## Source and implementation contracts

1. For generated environment objects, follow [VOXEL_PIPELINE.md](VOXEL_PIPELINE.md): one isolated colored three-quarter source image with gentle form shading → local TRELLIS mesh → voxelization → native VOX. Review actual mesh and voxel views, including unlit colors, ground contact and useful gaps.
2. Use native VOX as voxel source data; runtime uses GPU-instanced cubes, chunk buckets and derived LOD. One tile/metre, shared cubic pitch 0.0625m (16 cells/metre), subject-specific dimensions and explicit ground pivots. Scale uniformly.
3. Author terrain as reusable native VOX modules with exactly flat 1m tile tops, vertical risers and level multi-tile pads. Initial terrace proposal: 0.5m levels with separate stairs. Soft color transitions do not imply warped geometry. See [TERRAIN_ELEVATION_PLAN.md](TERRAIN_ELEVATION_PLAN.md).
4. Preserve sprite foot/tool anchors, resource depletion states, building entrances/cutaways and shared grounding. Voxel-volume actor generation is superseded by the approved pixel cast.
5. Follow the staged [asset migration inventory](VOXEL_ASSET_MIGRATION.md). Compare assets together at common scale, neutral day and dusk, close/overview and phone views. Technical export success does not establish art acceptance.

## Character presentation — 2026-10-30

- The body and feet remain still. Minimal motion is in a separate holding-hand/tool layer, in the simple Realm-like manner requested by the user. No default leg walking, idle breathing, bob, squash or stretch. Existing ten atlas slots are adapter storage, not a demand for ten body poses.
- Use true screen-aligned billboards (camera quaternion) so the reference silhouette is not vertically foreshortened. Keep the ground/foot pivot fixed. Mirror the whole body/hand/tool assembly horizontally toward screen-left or screen-right facing; no extra directional art sets.
- Held items are separate from the body. Draw exactly one selected tool at the same native pixel pitch and grip anchor; never bake a sword into the body and then add another tool. Tool bounds must not independently normalize its scale.
- Alden's latest candidate traces the user's actual image block boundaries, including half-block horizontal offsets. Its 20×18 working chart and measured colors are specific to that reference, not a universal unit template. [Reference measurement and native preview](art-audit/pixel-cast-v2-alden/README.md). The earlier guessed9×9/10×10 prototypes were rejected.
- Optional matching authored normal maps add restrained lighting response; nearest sampling preserves the pixel grid. Sprite depth zero uses flat normals. Canvas remains unlit flat color. These are designed cues, not recovered geometry.
- The user approved the measured Alden master and requested the complete cast on 2026-10-30. All twelve human families now preserve its 17×18fine-cell body proportions; boar and rock mite keep distinct silhouettes. One native cell equals the scenery voxel pitch: 0.0625m. Body, hand and tool use one scale, with no independent fit-to-fill. Technical checks alone do not establish art acceptance.

## Implemented versus pending

All 240 trees use the accepted oak VOX. Instanced cube rendering, bucket LOD and a first cached GI/AO pass exist; see [VOXEL_RENDERING.md](VOXEL_RENDERING.md) and [VOXEL_LIGHTING.md](VOXEL_LIGHTING.md). Pixel billboards replace all moving people, quest figures and enemies in both renderers. The user approved the corrected measured Alden proportions for the complete cast; each native cell now shares the 0.0625m scenery voxel pitch. See [cast implementation](PIXEL_CAST.md). Remaining environment asset families and world terrain elevation retain their separate migration gates. The ten-module terrain kit is a separate prototype. The cast swap does not complete the environment migration or imply a deployment.

## Original assets and zero-cost runtime

Use original designs and preserve source images, prompts, scale contracts and review evidence. No extracted game assets or copied characters. Core gameplay stays offline-capable with no paid API, required service or runtime model download. Rendering remains separate from the deterministic 600ms simulation.
