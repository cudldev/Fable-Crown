# Pixel billboard cast

The user approved the measured Alden master for the complete cast on 2026-10-30. [Style skill](../skills/fable-pixel-characters/SKILL.md). [Actual native cast gallery](art-audit/pixel-cast-v3/unit-gallery.png).

All twelve human families preserve the accepted 17×18fine-cell body silhouette, natural skin, two 2×2eyes, role costumes and eight bounded skin/hair variants. Boar is 16×14; rock mite 20×12. The accepted Alden trace/palette is unchanged. The same native art supplies the HUD portrait, both renderers, all moving people, six quest figures and every enemy definition.

One native cell equals one scenery voxel: **0.0625m**. Humans are 1.125m tall and 1.0625m wide; the 32×32 padded frame spans 2m. Body, holding hand and tools share that pitch and their foot/grip anchor. Species retain their authored size rather than being independently stretched. Canvas uses 64/√2 screen pixels per metre before camera zoom. Source: [unit-scale.ts](../src/render/unit-scale.ts).

Sprites copy the full camera quaternion, mirror the complete assembly horizontally and keep body/feet still. Only the separate hand/tool moves one fine cell. No second weapon is baked into the body. Three offers optional shallow authored normal maps through Sprite depth; Canvas uses diffuse art. Shared nearest-filtered atlases, cutout-aware picking and quest GI exclusions remain.

Simulation, saves, equipment, selection IDs and 600ms ticks remain authoritative. No external runtime service or paid API was introduced. Current verification is recorded in [PROGRESS.md](PROGRESS.md); this change does not imply a deployment or a physical-phone performance benchmark.

Ground foliage overlap uses explicit ground-pivot depth for body/held layer and per-column ground support depth for plants. This preserves the plant footprint and bases against opaque terrain; tall tips behind a unit cannot slice its body, while foreground plants still occlude it. Physical screen positions and lighting coordinates stay intact. Perspective/orthographic GPU evidence: [pivot-depth review](art-audit/foliage-v1/pivot-depth.json).

## Scene lighting — 2026-10-31

Body and held materials have zero emission and no emissive map. Sun, hemisphere fill, local lamps and enabled GI provide their light. Authored broad head/torso/arm/foot and creature forms replace the old tiny pigment-patch normals; tools have shared-grid bevels. The original albedo, silhouette, dimensions and animation are unchanged. Sprite depth defaults to0.85; zero restores flat surface normals while retaining scene lighting. Source: [unit-normals.ts](../src/render/unit-normals.ts).
