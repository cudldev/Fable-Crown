# Accepted image-to-voxel workflow

Accepted by the user on2026-10-30. Use **one colored three-quarter image with gentle diffuse form shading -> local TRELLIS colored mesh -> Trimesh voxelization -> native VOX**. Native VOX now drives GPU-instanced cubes/LOD for all240world trees; other3D categories are pending migration. See [runtime and migration](VOXEL_RENDERING.md), and the [first GI/AO/FPS implementation](VOXEL_LIGHTING.md).

Latest scope: [whole asset migration](VOXEL_ASSET_MIGRATION.md) and [authored tilemap/block terraces](TERRAIN_ELEVATION_PLAN.md). Standalone generated objects retain the accepted image workflow. Modular ground tiles can be authored directly as VOX so their flat tops, boundaries and stairs obey exact shared sockets; they are not reconstructed from independent images. The [first editable terrain kit](../tools/voxel-terrain/README.md) is a separate geometry/scale prototype, not integrated or accepted final world art.

The selected terrain A style now has a [native art kit](../assets/source/voxel/terrain-style-a-v2/README.md): generated top-down pigment inputs sampled into exact flat VOX modules,shared palette and explicit material joins. This is an authored tile workflow, separate from TRELLIS shape reconstruction. Actual browser/Blender art review passes as a usable draft; full game ground integration is pending. Source PNGs/prompts and the brighter first pass are preserved.

[Accepted comparison](../assets/explorations/voxel/trellis-oak-softlight-v1/vox-01/comparison.png) · [source image](../assets/explorations/voxel/trellis-oak-softlight-v1/input.png) · [exact prompt](../assets/explorations/voxel/trellis-oak-softlight-v1/input.prompt.txt) · [native VOX](../assets/explorations/voxel/trellis-oak-softlight-v1/vox-01/asset.vox)

## What the tests established

| Finding | Practical rule |
| --- | --- |
| A strict two-color oak input made a thin card:0.142m depth at4m height. | Keep gentle shading and readable front/side/top planes. |
| Soft face shading recovered real volume; the accepted full pass produced a broad crown. | Use natural matte material colors, soft neutral lighting and strong ambient fill. |
| Strong baked light/dark detail survived into mesh colors. | Avoid deep AO/shadows, highlights, bark grain and micro-detail; inspect unlit generated RGB. |
| Voxelization retained the main shape and green/brown material groups. | Sample actual generated vertex colors and use a limited configurable palette. |
| Two foliage fragments remained disconnected. | Inspect components and hidden supports; do not assume the learned mesh is structurally complete. |
| Relative size varied when each object was normalized for preview. | Plan physical size first, use shared cubic pitch, and compare under a common world camera. |

These are observations from oak experiments, not validation across characters/buildings/all props. Grayscale geometry with later coloring, automatic de-lighting and semantic material assignment have not been implemented.

## Current operating rules

1. Declare subject, physical height/XYZ bounds, provisional versus established sizes, logical footprint/overhang, ground pivot, pitch and editable style before image generation.
2. Generate one isolated original object with broad clean forms, natural base colors and mild form shading. Ground roots/feet/base, preserve intentional gaps, include transparent padding. No grid, scenery, ground shadow or multi-view sheet.
3. Run the pinned local TRELLIS image-large model. Preserve raw geometry/attributes and source/settings. Output currently uses generated mesh-decoder vertex RGB, not a Gaussian texture stage or UV bake.
4. Inspect actual mesh front/side/back/three-quarter and unlit colors. Continue automatically for a full-pipeline request; honor an explicit image/mesh review pause.
5. Scale uniformly to declared height; voxelize at shared pitch, preserving aspect ratio. Compare measured width/depth to the brief. Fill only enclosed interiors; do not close intended openings. Palette reduction is configurable.
6. Save VOX, metre-scaled GLB, labeled volume, scale contract and reports. Six orthographic views/grid are projections of this final volume, not reconstruction inputs.
7. Verify native readback, independent browser VOX/GLB loading, ground contact/components and actual rendered source/voxel comparison. User acceptance is separate from file validity.

## Accepted oak baseline

- Input/model settings: [physical brief](../assets/explorations/voxel/trellis-oak-softlight-v1/brief.json); seed42,12steps.
-4m height,0.0625m pitch (16voxels/metre);68x70x64grid;31,522occupied cells;24colors.
-563ground cells;3components of30,640/846/36cells;34,864triangles in exported greedy GLB.
- One measured run:76.62s TRELLIS process including loading/export;2.145s conversion/export excluding interpreter. Not a general performance benchmark.
- Five converter tests, native VOX roundtrip and independent Three.js VOX/GLB loaders passed. Actual Blender and phone previews inspected. Native MagicaVoxel launch remains unverified.

Accepted as the baseline with residual baked shading, color variation, detached foliage and inferred side/back geometry. Tree integration now uses native VOX; character-ready topology and clean physical albedo are not established. Dimensions remain subject-specific: a1m prop is16cells tall at this pitch, not64.

## Reuse

The [first prop batch](../assets/explorations/voxel/prop-batch-v1/README.md) now exercises this same reconstruction path on anvil,barrel,crate and copper ore at shared16cells/metre. Raw inferred faces were too dark; a separate explicit native palette pass improves readability while preserving raw outputs and all geometry. This does not establish automatic de-lighting. Ore's inferred footprint is larger than its brief; common-scale review must catch this before binding. Props are comparison drafts,not yet game-integrated.

- [Source image skill](../skills/fable-voxel-reference/SKILL.md): generation rules, prompt and size/style planning.
- [Image-to-mesh skill](../skills/fable-image-to-mesh/SKILL.md): actual mesh generation, review and optional VOX conversion.
- [Local commands and runtime](../tools/trellis-vox/README.md).
