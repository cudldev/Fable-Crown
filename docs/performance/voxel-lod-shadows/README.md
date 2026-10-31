# Voxel LOD shadow regression — 2026-10-31

Published [c7f35d3](https://github.com/cudldev/Fable-Crown/commit/c7f35d34b111882f1994fc93b24b20a4083adb5b); [CI/deployment](https://github.com/cudldev/Fable-Crown/actions/runs/41241800505) passed all537 units and2release cases. Actual public `4bf107f1998b` verified: [overview](live-overview.png) has280LOD2 props, noLOD0 and349,890caster triangles; nearest tree returns toLOD0 in close view. [Live counters](live-review.json). Desktop/phone orientations, FPS, offline and previous cached-save upgrade passed; zero page/console/GL/request/external errors.

Local Chrome GPU regression passed with the renderer source used for production artifact `4bf107f1998b`. Run: `npm run test:visual -- tests/rpg-voxel-shadow-mesh.spec.ts --workers=1` (all three cases passed centrally). This is functional evidence, not a performance benchmark.

The new case uses the native oak VOX, its real baked surfaces, `VoxelMeshes` selection and fade hooks, plus a uniform cube that must cast using its visible mesh. The selector roundtrip is **0 → 1 → 3 → 4 → 0**, sampled at transition start, halfway and completion. GPU readback remains 512×512 while projected-height inputs select actual coarse templates, keeping their receiver pixels measurable. This controlled overhead lab does not reproduce the production camera, lighting or a physical phone.

| Settled LOD | Oak floor pixels darkened | Cube floor pixels darkened | Total caster triangles |
|---|---:|---:|---:|
| 0 initial | 9,029 | 1,418 | 1,984 |
| 1 | 8,681 | 1,418 | 1,984 |
| 3 | 12,013 | 1,418 | 320 |
| 4 | 17,621 | 1,418 | 110 |
| 0 returned | 9,029 | 1,418 | 1,984 |

Every transition sample retained oak and cube receiver shadows. Proxy geometry issued zero primary color/depth GL draws; proxy counts/draw ranges reset after shadow rendering. All ten warmed templates were reused, disposal removed the batches, and all samples reported zero GL errors. [Full measurements](review.json).

Visual review of [LOD1 shadowed](lod1-shadowed.png) / [unshadowed](lod1-unshadowed.png) and [LOD4 shadowed](lod4-shadowed.png) / [unshadowed](lod4-unshadowed.png) confirms separate floor shadows behind both objects. The coarsest oak and its shadow are visibly blockier and larger, matching its existing coarse surface; this change does not improve LOD silhouette quality. During fades the two caster silhouettes overlap, so receiver coverage can temporarily exceed either settled result. The test establishes that shadows remain present, not identical shadow shape or brightness across detail changes.

Provenance: test SHA-256 `7aba32958f8915a7dd20b6b64d8314a3079c1612a7bb90584d8ce2b0e1fc1853`; unchanged tree VOX SHA-256 `e42ea8ac191969ee74273651581abf7326d5fa16f3e02bd72a561661a0709409`. No art or baked files were changed.
