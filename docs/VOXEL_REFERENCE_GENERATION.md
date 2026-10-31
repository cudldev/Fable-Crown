# Voxel source-image generation

Current accepted workflow: [image -> TRELLIS -> VOX](VOXEL_PIPELINE.md).

Use [fable-voxel-reference](../skills/fable-voxel-reference/SKILL.md) to generate **one colored three-quarter image** with broad simple forms, natural matte colors and gentle neutral diffuse shading. Read its [prompt rules](../skills/fable-voxel-reference/references/generation.md) and [physical scale/style brief](../skills/fable-voxel-reference/references/scale-and-style.md).

Plan in-game dimensions, pivot, footprint/overhang and shared cubic voxel pitch before generating. Keep depth cues and important connections; avoid micro-detail, strong highlights, deep AO, cast shadows and flat material-ID silhouettes. Preserve genuine alpha and intended gaps. Save input, exact prompt and brief.

For the actual mesh and optional native VOX, use [fable-image-to-mesh](../skills/fable-image-to-mesh/SKILL.md). Six orthographic grid previews are generated from the final volume for inspection; they are not inputs to this pipeline. Keep the current game art/default renderer unchanged unless integration is requested.
