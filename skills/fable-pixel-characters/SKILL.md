---
name: fable-pixel-characters
description: Generate and author Fable Crown's compact pixel billboard characters, NPC variants and enemies with consistent proportions, palettes and animation frames. Use for unit art and sprite asset quality; not voxel scenery or simulation changes.
---

# Fable pixel characters

Create original, squat pixel units for Fable Crown's voxel world. The user approved replacing the full cast with this style on 2026-10-30. Characters are standing, feet-anchored **true camera-facing billboards**, including when moving sideways or away. Use the camera's full quaternion or equivalent screen-aligned basis so pitch does not vertically foreshorten the sprite; a world-vertical, yaw-only plane is insufficient. Mirror horizontally for screen-left/right facing, applying the same flip to body, hands and held tool. No additional directional sprite set is required.

Read [the style contract](references/style.md) and inspect its local Alden crop plus supporting class/world references before designing a unit. Current user instructions and the project's latest art direction take precedence over this baseline. Earlier watercolor, low-poly humanoid, voxel-limb and detailed chibi character studies do not define this style.

Choose the requested output route:

- **Appearance/source image:** use built-in imagegen with [the unit prompt](references/generation.md). Generate one isolated unit with genuine alpha, not a scene or composite class sheet. Save the source, exact prompt, brief and reference identity. Image generation is a design aid; it does not establish a native pixel grid, atlas, scale or animation.
- **Exact game sprite/atlas:** author editable native pixel cells or extend the project's existing pixel-unit authoring data. Read [the asset and animation contract](references/authoring.md) and current renderer interfaces first. Preserve the coarse shape rather than rasterizing a detailed illustration into faux pixels.

Keep the invariants across all units:

- Match the standalone reference's visible pixel-block counts, boundaries and relative feature offsets before choosing a native grid. The rejected 9×9 prototype is not an approved canonical count. Keep the short integrated silhouette, natural-skin face, broad torso and tiny feet; species retain recognizable anatomy.
- Crisp square pixel clusters, few flat colors, natural human skin and dark eye marks; **no dark contour rings, black void faces, smooth illustration or oversized separate chibi head**.
- Large readable display size is independent of native pixel count and padded atlas canvas size.
- Default animation keeps the body and feet still; only hands/held tools move minimally. Logical travel moves the billboard root through the world without walk-leg frames, bob, breathing or squash/stretch. Add broader motion only when explicitly requested.
- Held tools are separate from the body art, aligned with the holding hand at one shared native pixel pitch and hand anchor. Never retain a baked sword in the body and add another tool on top, or independently fit-to-fill/resize the tool.
- Original Fable Crown identities and occupation/enemy silhouettes. Reference-game sprites remain visual references, never cropped into runtime assets.

Measure visible reference rows/columns and feature offsets, then resolve one neutral base silhouette before a full-cast batch. Compare the actual native sprite beside the reference at the **same occupied body height**, excluding canvas padding and projecting tools. Do not force an assumed uniform coarse grid where the reference contains finer or offset blocks. Correct mismatches before variants or animation. This is normally a lead-owned visual correction gate. If the user explicitly asks to review the main character first, show that preview and wait for their feedback before continuing cast refinement.

Then review at native scale, an integer nearest-neighbor enlargement, and a common game/phone camera. For animation, inspect idle, walking, work contact, hit and defeat playback with correct feet and depth occlusion. Inspect alpha against contrasting light/dark backgrounds; never fill intended limb gaps merely to make a mask solid.

Use subtle authored normal maps only when requested or useful to the authorized integration. Keep their grid/alpha aligned with color frames and validate lighting in-engine; do not call inferred relief physically recovered geometry. Normal detail must not replace the simple pixel design.

Continue routine corrections within the user's authorized generation/integration scope and honor any explicit requested review stop. An image-only request does not authorize renderer changes. A full-cast replacement request does not by itself require approval after each unit; a later request to review Alden before continuing does require that checkpoint. Report source/export paths, actual visual checks and remaining weaknesses; file validity alone does not establish art acceptance. No paid API, external runtime service or required model download.

Current project scale (2026-10-30): user approved measured Alden for the full cast. Every native fine cell equals 0.0625 metres, matching scenery voxel pitch. Human occupied body 17×18cells=1.0625×1.125m; padded 32×32 frame = 2m. Use src/render/unit-scale.ts in both renderers. Preserve that pitch for all body/hand/tool layers and creatures; never independently fit them to a requested height.
