# Isolated source-image route

Use this route for character appearance design or a generated source reference. Use built-in imagegen; no API key/CLI fallback unless the user explicitly requests that route. Do not substitute image-processing code for requested generated artwork.

Inspect the style references first. For Alden, use the standalone cropped prince as the primary shape/costume reference. The full Fable appearance image supplies world context; the class sheet supports general proportion/pixel economy. For another unit use its approved reference when available. For an edit, name the target and preserve the requested identity. A class sheet is not a sprite atlas to crop.

## Brief before generation

Record unit ID/name/family, role or enemy content ID, original identity traits, skin/hair/material palette, tool/equipment requirements and requested stopping stage. Before specifying native dimensions, measure visible block rows/columns, body/tool bounds and relative feature offsets from the actual reference. Check finer increments or half-cell offsets. Record reference uncertainty if it does not follow a uniform grid; the rejected 9×9 prototype and prior fixed row ledger are not approved measurements. Separately record canvas, inferred/verified native size, foot anchor and world/display height. One tile/metre does not dictate sprite source resolution.

For the current Alden crop, use [the measured reference chart](../assets/alden-reference-edges.json) and verify its overlay: its 20×18 working grid retains offsets lost by the rejected coarse guess. Treat this as a reference-specific measured chart, not a universal generation size. The reference's sword must be a separate tool source/layer; the body source does not keep a painted-in weapon underneath it.

When both body and tool need new generated art, use separate built-in imagegen calls with the same recorded view/scale brief, one isolated asset per call. Do not ask a single generation to deliver a body-plus-floating-tool contact sheet and call it calibrated layered art. Align exact native pitch and grip during native authoring, not by independently fitting each source image to fill its output canvas.

Read the current `src/render/pixel-units.ts`, renderer actor contract and current asset authoring data when they exist. For an isolated design request, unknown engine values can remain explicitly provisional. Do not invent a direction set: Fable characters always face the camera, using a shared body/hand/tool horizontal mirror for screen-left/right facing.

## Reusable prompt

Replace bracketed fields with the brief. Keep the image request focused on a single unit rather than carrying scene-layout instructions forward from a mockup.

```text
Use case: stylized-concept.
Create ONE original [unit/name/family] for Fable Crown as a FRONT-FACING
2D PIXEL BILLBOARD source reference, isolated with genuine transparency.

Reference roles: [the unit's approved standalone reference] defines its exact
shape/costume; [Fable appearance reference] defines palette/context/no-outline
edges; [class proportion reference] supports compact pixel economy only.
Do not copy an existing game class sprite.

Identity: [role/species, hair/skin/cloth/materials, required tool/equipment].
Output the BODY reference with an empty holding hand at [hand/grip anchor].
Held tools/weapons are SEPARATE source assets at the SAME native pixel pitch,
not baked into the body. If a held tool is requested, generate its separate
source and assemble at the shared grip; do not paint two copies of a weapon.
For Alden: match the actual crop's visible block rows/columns and relative
feature offsets using [measured reference landmarks/boundaries]. Preserve
the simple cap, natural-skin face/collar, blue chest and CENTRAL GOLD CLASP,
cream lower band and tiny feet. NO brown belt or invented hair/anatomy.
Do not impose the rejected9x9prototype or an assumed8x8/10x10grid. Where the
reference has finer/offset blocks, retain them rather than rounding every
feature to the largest visible square. Equipment follows the actual brief.
For other units preserve their own approved identity and measured layout.
No neck, oversized separate chibi head, long limbs, jaw or tall boot cuffs.
For creatures preserve [species silhouette] within the same pixel language.

Use broad flat uniform square color clusters and obvious hard horizontal/
vertical stair steps. [Palette] with sparse quiet shadow groups only.
Material colors directly form the silhouette edge: NO dark outline ring.
No black face/void mask, glowing eyes on human skin, smooth illustration,
curved linework, gradients, anti-aliasing, shiny 3D character surfaces or
ornamental micro-detail. Mild goofy asymmetry must fit whole source cells.

Native design brief: [canvas, neutral body size, full tool/content bounds,
foot anchor, candidate grid and uncertainty]. Canvas padding and bitmap
resolution do not define native cell counts. The actual reference feature
boundaries govern the shape, even if an existing engine sprite is wrong.
Show the simple design enlarged clearly; display size does not add native
detail. The whole unit is visible with transparent padding and useful gaps.
Both feet share one invisible ground line; no ground tile, cast shadow in
alpha, backdrop, text, UI, labels, second unit, scene or alternative view.
This is a source appearance study, not proof of a calibrated sprite grid.
```

Default to one still base design, with any requested held tool preserved as a separate source. Native assembly must use a shared body/hand/tool pixel pitch and grip anchor; generated images alone do not establish that calibration. For animation, keep body and feet still; only hands/held tools move minimally together. Do not add walking-leg frames, idle breathing, bob, squash/stretch or a large pose cycle by default. Finish one coherent base before any requested hand/tool references. Use horizontal mirroring of body/hand/tool together for screen-left/right facing, not additional side/back drawings. Request a pose sheet only when that is the actual task. Do not claim consistent authored anchors from a generated contact sheet.

Honor a user-requested main-character review stop: show the new Alden source/native/in-game preview appropriate to the task, then wait for their style feedback before continuing the remaining cast. This applies when explicitly requested, not as a universal extra approval flow.

## Save and inspect

Create a new versioned asset study with selected image, exact prompt(s), original references/paths, brief and compact review notes. Keep approved inputs and rejected variants distinct. Copy project-bound outputs into the project; do not leave the only reference under the generated-image cache or a transient clipboard path.

Check the actual transparency on contrasting backgrounds, full silhouette, clear limb/tool gaps, low cap/face proportions, natural skin and contour-free edges. Compare the base beside the approved reference at equal occupied body height before expanding to a cast or pose batch; disregard canvas padding/tool reach during this comparison. Request a targeted imagegen correction for a visible failure. Do not erase a border, fill an inter-leg opening or repaint faces through a silent image-processing cleanup.

If exact game assets are requested, continue into native-grid authoring and actual engine review. Image generation alone does not satisfy that request. Record actual output bitmap dimensions; do not call the result 4K or a native pixel atlas merely because the prompt requested those dimensions.
