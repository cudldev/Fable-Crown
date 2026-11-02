# Tripo valley trial

User-authorized deforming character test in the current valley, replacing Alden only at `?characters=tripo-test`. Default cast unchanged. Local preview: http://127.0.0.1:5406/Fable-Crown/?characters=tripo-test

`character-corrected.blend` is the authoritative saved source, copied from the earlier Tripo shoulder/weight correction. Preserve it; use `export_saved.py` for later exports. FBX and rig report accompany it. Public `tripo-character-test-v1.glb` retains the original texture and15 authored clips; the supplied original FBX had no clips. Runtime derives a separate static guard from the reach pose, giving16 test motions plus rest.

Runtime follows current600ms movement/strike/guard/work commits with render interpolation without changing simulation or saves. Tools come from the earlier voxel tool kit; guard shield is a simple local test prop. Extreme bends, grips and action contact remain draft. User authorized deployment of this trial together with the600ms timing change; no final art acceptance.

Actual game captures/checks: `docs/art-audit/tripo-valley-test-v1/`. Browser regression: `tests/rpg-valley-tripo.spec.ts`; source/rig/motion checks: `tests/tripo-valley.test.ts`.
