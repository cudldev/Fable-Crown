---
name: fable-3d-art
description: Model, texture, rig and visually review Fable Crown's low-poly pixel-textured characters, environments and props in Blender through MCP. Use for original game assets and asset-quality iteration, not simulation or general renderer changes.
---

# Fable Crown 3D art

Create authored forms that hold up in the reference camera, not merely valid GLBs. The current experiment combines chunky early RuneScape shape language, restrained 16-bit pixel textures, compact JRPG characters and warm/cool atmosphere. Read the project's current user direction before applying this style outside the optional 3D test.

## Establish the visual brief

Inspect `assets/reference/fable_crown_3d_pixel_target.png` and the latest actual `docs/screenshots/three-assets-*.png`. State which form, proportion and material differences this pass addresses. Use the concept for visual qualities; retain original designs and the existing gameplay footprint. Do not treat a list of primitive parts, triangle counts, or a successful export as evidence of quality.

Read only the relevant specialist reference:

- Characters, faces, costumes, articulation: [character modeling](references/characters.md).
- Buildings, trees and terrain props: [environment modeling](references/environments.md).
- Tools, furniture and small equipment: [prop modeling](references/props.md).
- Any handoff or acceptance decision: [visual review](references/review.md).

## Model through a review loop

1. Compare the reference and current model at the same view/scale. Identify the two or three largest visual weaknesses before editing.
2. Establish silhouette, proportion and negative space in neutral lighting. Use custom profiles, tapered sections and deliberate planes where cubes/icospheres give the wrong shape. Primitive assembly is a construction tool, not an acceptance target.
3. Resolve the structure and material groups before secondary detail. Add detail only if it improves the intended game-scale image. Avoid uniform bevels, random geometric noise and decorative clutter used to disguise poor forms.
4. Check front, side, back and three-quarter views, then the actual game camera and phone scale. Inspect the rendered result after a meaningful change; do not continue a whole asset batch from code inspection alone.
5. Apply a narrow correction based on observed images. Hand back a reviewable draft after a bounded pass; the lead owns integration and local visual gates. Do not require new user approval for routine corrections already authorized.

## Authoring and engine contract

- Use the connected Blender MCP tools. This repository also supplies `npm run art:status` and `scripts/blender-mcp-client.py`, which use the real upstream MCP server/client. Verify live scene access; do not silently substitute background Blender scripting when the user specifically requested MCP. Only the lead controls the shared Blender session; specialists can author recipes for the lead to execute sequentially.
- The `.blend` file is the editable source of truth after generation. Preserve prior drafts before substantial revisions. Export manual edits with `npm run art:export`; never regenerate a recipe over an artist's edits without that operation being intended.
- One metre per tile; Blender Z up/front −Y; GLB Y up/front +Z; root at ground/foot pivot. Preserve footprints, `roof`, light markers and actor pivot names in `assets/source/3d/pipeline.py` and `src/render/three/contracts.ts`. These are technical contracts, not prescribed silhouettes.
- Use an intentional pixel atlas, nearest magnification, quiet broad value groups and consistent texel scale. Paint folds/material cues; do not bake the sun or dynamic window spill into albedo. Inspect UV orientation, stretched texels, bleeding, normals and backfaces.
- Keep models original and local. No paid generators, external asset libraries, API keys or mandatory network services. Light markers describe illumination; the renderer owns light/shadow budgets.
- Run `npm run art:check` after export. The seven sample budgets are starting ceilings, not targets to fill. Keep editable groups in sources; merge compatible static geometry in runtime exports/import while preserving roofs and animated parts.

## Handoff

Report edited source/export paths, the intended visual correction, actual reviewed images, technical checks and remaining visible weaknesses. Mark an asset as a draft until its images pass the lead's visual review. Never call it production-ready solely because tests or budgets passed. User art acceptance remains a separate judgment.
