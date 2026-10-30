# Native sprite assets and animation

## Editable source and current contracts

Prefer the repository's existing editable pixel-cell authoring representation for an engine asset. A generated concept guides the result; the native grid must be deliberately authored, with hard cell boundaries, an intentional palette and complete alpha. Do not crop a concept scene into a production unit or reduce a soft illustration and assume its pixel design is solved.

Read the latest `src/render/pixel-units.ts`, actor/billboard contracts and the actual caller before editing. The initial migration adapter has a 32×32 frame canvas and ten horizontal slots: 0 idle, 1–4 locomotion, 5 preparation, 6 contact, 7 recovery, 8 hit, 9 defeat. Those names/counts are adapter slots, not an obligation to animate legs or author ten unique body poses. Reuse the still body/feet; only hands or held tools move minimally by default. Keep one ground anchor across slots. Reconcile the adapter with a measured reference grid instead of discarding reference detail to fit a guessed source size.

For the currently measured Alden reference, [the chart](../assets/alden-reference-edges.json) uses a 20×18 working grid to retain finer/half-step offsets. It is a measured interpretation of this crop, not an immutable global sprite size. The current 32px adapter places the chart at body origin (7,10) with foot anchor (16,28), giving 18 occupied chart rows; projecting reference-tool columns 17 onward are kept out of body art and authored separately. Re-read the actual source contract if these adapter coordinates change. Sampled chart colors/labels still require manual alpha/material classification and a reference-overlay review.

The latest cropped Alden image is authoritative; the native 9×9 version and previous fixed row ledger are **rejected/unverified interpretations**. Measure visible pixel-block rows, columns and relative feature offsets first. Detect finer increments or half-cell offsets rather than assuming the largest color blocks are one native cell. Record actual boundaries and uncertainty when a generated raster does not obey a single uniform grid. Preserve the central gold clasp and cream lower band; do not invent a horizontal brown belt or extra anatomical detail.

Frame canvas, reference bitmap resolution, occupied native body cells and display pixels are different measurements. Body bounds include hair/cap through feet but exclude projecting tools. Keep full alpha/content bounds separate. A full-frame alpha box alone cannot establish body proportions or a native cell count.

Useful per-unit brief:

```json
{
  "unitId": "original-unit-id",
  "family": "humanoid-or-species",
  "contentRole": "actual-role-or-enemy-id",
  "styleReference": "fable-class-proportions",
  "referenceBitmapPixels": "measure actual bitmap dimensions",
  "referenceBlockBoundaries": "record visible x/y edges and landmark offsets",
  "candidateNativeGrid": "derive and review; record uncertainty/half-cell offsets",
  "nativeFramePixels": "choose padding around measured required art; reconcile adapter",
  "neutralBodyTargetPixels": "derive from reference; no guessed canonical count",
  "idleBodyBoundsPixels": "measure hair/cap through feet, excluding projecting tool",
  "fullFrameContentBoundsPixels": "measure separately, including tools and reach",
  "footAnchorPixels": "read current atlas convention",
  "bodyOriginPixels": "read current atlas convention; align reference chart",
  "nativePixelPitch": "one shared pitch for body, holding hand and tool",
  "handGripAnchorPixels": "shared documented anchor; never fit tool independently",
  "worldHeight": "declared, measured or provisional",
  "palette": {"skin": "natural tone", "hair": "base tone", "cloth": "role identity"},
  "tool": "actual requirement, or none",
  "toolLayer": "separate from body; remove reference weapon from body source",
  "horizontalFacing": "screen-left/right mirror shared by body, hands and tool",
  "animation": "body/feet still; minimal hand/tool movement only by default",
  "normalMap": "none or subtle authored relief",
  "stoppingStage": "source / native atlas / authorized integration"
}
```

The values are a brief template, not a new save schema or a promise that every engine uses those field names.

## Silhouette-first correction loop

1. Measure the reference bitmap's visible block boundaries, body/tool bounds and feature offsets. Inspect candidate finer grids and half-cell alignments; document uncertainty instead of declaring a guessed 9×9 or 10×10 count canonical.
2. Author a neutral base from those measured observations. Display actual native cells beside the reference at equal **occupied body height**, without using tool/canvas bounds for normalization. Show a silhouette and flat palette view; compare the positions/sizes of hair, eyes, skin/collar, shoulders, central clasp, cream band and feet. Omit invented belt/hair detail, relief and extra animation during this check.
3. Correct the largest mismatch and inspect again. Do not generate the full cast or a full animation atlas from a base that still has an oversized separate head, neck, long legs or tall boots. Structural tests and a valid atlas do not pass this art gate.
4. Once the base matches the reference, add only minimal hand/tool movement over the still body/feet and review actual playback. If the user requested an Alden style review first, deliver native and in-game Alden previews and **stop for that feedback before further cast refinement**. Otherwise continue the authorized profession/identity variants and enemy families. Keep animal/mineral anatomy distinct while retaining shared cell density/edge treatment. Review a cast contact sheet before integration.

The full-cast swap authorization permits routine automatic correction within scope, but does not cancel a later explicit request to review the main character before proceeding. Honor such checkpoints; do not turn them into a permanent approval requirement for every future unit. A requested source-only task still stops at its requested stage.

## Body, holding hand and separate tool

Keep held equipment out of the body atlas. A reference image may contain a sword, but the native body must not retain that sword when a separate axe/pick/rod/weapon is added. Inspect the body-only view to verify that removing the tool layer really removes all held equipment.

Use one native cell pitch for body, hand and tool. A two-cell handle must span two body cells in the assembled view. Match the documented hand/grip anchor and camera-facing basis; do not normalize separate tool bounds to the actor's height or scale a tool to fill its transparent canvas. Hands and tools move together with the same small native-cell offsets. Body and feet stay still.

In the initial ten-slot humanoid adapter, body frames 0–7 stay static while the hand/tool layer may use two minimal offsets. Repeated body frames are intentional; hit/defeat slots can use existing held state/effect behavior rather than adding a gait. Inspect body-only, tool-only and assembled native/enlarged views, checking the shared pixel pitch, one holding hand and a single equipped tool.

## Frame animation

- The default is a still body and still feet. During locomotion or work only the hands/held tools move minimally. No walking-leg frames, body lean, head motion, idle breathing, automatic squash/stretch or vertical bob. World travel moves the root through legal positions without a cosmetic gait.
- Reuse the same body across adapter slots; unused slots may repeat. Do not manufacture motion to fill the atlas. Hit/defeat feedback can use existing held states/effects without requiring a new full-body animated sequence.
- Keep the canvas, anchor, base body scale, skin/hair identity and tool grip consistent. Feet meet the ground at contact; action reach must not be obtained by changing the entire unit's world scale.
- Frame selection follows presentation of the authoritative 600ms action phases and actual legal movement traces. Frames, cosmetic tweens and normal maps never award resources, alter inventory/health, create a path or set a gameplay deadline.
- No idle breathing, automatic squash/stretch, continuous bob or bounce by default. If extra expressive motion is explicitly requested, keep it small and preserve grounded contact; a normal-map detail request is not an animation request.
- Reduced motion retains readable held action/contact frames and disables any optional motion effects. The minimal default already avoids continuous cosmetic movement.
- All frames remain true screen-aligned camera billboards, anchored at the ground/feet pivot. Match the camera's full quaternion or equivalent basis, rather than only its yaw: the latter vertically foreshortens a world-vertical plane under an elevated camera. Verify that screen-space body proportions stay constant as camera pitch changes. The sprite still reads as standing, not a decal placed flat on the ground.
- Screen-left/right facing uses a horizontal mirror of the complete unit: body, holding hand and separate tool share the same flip around their common anchor. Determine left/right in screen space, not world X alone; keep the last facing while stationary to avoid flip jitter. Camera-facing does not prohibit mirroring. No separate side/back frame set is needed. Check grip alignment and normal-map tangent handedness in both mirrored states.

## Color, alpha and optional normals

Nearest sampling preserves the authored color grid. Use exact opaque/transparent cell alpha for native assets, with transparent padding and valid gaps. Do not paint dark halos into transparent cells or bake directional sun/contact shadow into the albedo.

Optional tangent-space normal frames use the same dimensions, UV rectangle, alpha silhouette, frame index and pixel sampling as color frames. Start with a neutral front-facing normal for flat regions and add only broad restrained relief for head/body/tool regions. Keep the chosen normal convention consistent with the shader; test handedness/green-channel sign under a moving light. Authored relief is a lighting suggestion, not physically recovered surface geometry.

Preserve albedo identity under neutral day, dusk and a local warm light. Validate that turning relief off still yields the intended simple sprite. A normal map cannot fix wrong proportions or an unreadable silhouette. Do not invent a performance benefit from this approach without a comparable benchmark.

## Acceptance in the real game

Inspect native cells and a nearest integer enlargement, then a common-scale cast view against terrain. Verify role/skin/hair variants and every enemy family, not only Alden. Named quest people need identity variation; boar/mineral creatures need their own silhouettes.

Review still-body locomotion, minimal hand/tool work, held hit/defeat feedback, true billboard camera-pitch changes and both horizontal mirror states. Check ground/step placement, foot anchor, shared native cell pitch, single-tool grip, correct alpha depth occlusion, selection and reduced motion. Capture close and overview views and both phone orientations. A clear studio enlargement alone cannot establish gameplay readability.

When integrating, run the relevant renderer/asset tests plus project typecheck, test/build and repository-base/PWA/offline gates. Preserve save/simulation behavior and original-source provenance. Report observed visual weaknesses and unverified cases separately from technical pass counts.

Current project scale (2026-10-30): user approved measured Alden for the full cast. Every native fine cell equals 0.0625 metres, matching scenery voxel pitch. Human occupied body 17×18cells=1.0625×1.125m; padded 32×32 frame = 2m. Use src/render/unit-scale.ts in both renderers. Preserve that pitch for all body/hand/tool layers and creatures; never independently fit them to a requested height.
