# Retopology tool test — 2026-10-30

Latest corrected-input tests and controlled parameter ablations: `docs/art-audit/instant-mask-fixed-v1/review.md`. Even denser output and five alternative settings introduce new holes. Whole-character automatic Instant Meshes has not passed preservation; no rig transfer approved by the lead.

User requested better tools after the disconnected pelvis and weight/cleanup failures. Retire the ad hoc projected ring cages as the foundation; preserve them for comparison.

- **Instant Meshes:** official Windows binary, SHA256 `f1fe5b5f56d1002ae61dbd76a3fd646229fc1fe15322e7a3744f8ce442c76b2d`, under `.tools/instant-meshes/`. Tested actual preserved cleaned TripoSG input:600,066 vertices/1,200,819 triangles, no rejected cage used.
- **RetopoFlow 4.2.0:** public source at revision `d0ba5d6ccb790b8019adce35081838e4e7af477c`, `.tools/blender-addons/retopoflow`. Registered successfully in Blender5.1.2 after clearing partial registration and creating an in-memory preferences entry; no preferences saved. Guided stroke tools are available but have **not yet authored this mesh**. They require viewport interaction; helper operators alone do not create a proper pelvis.
- No purchase, paid API, default game replacement or deployment.

Sources: [Instant Meshes](https://github.com/wjakob/instant-meshes), [RetopoFlow source](https://github.com/CGCookie/retopoflow/tree/v4.2.0), [guided tools/docs](https://docs.retopoflow.com/).

## Actual result

Requested3,000 faces with pure-quad extraction; actual output **7,860 quads / 15,720 triangles / 8,574 vertices**. The automatic pass **introduced large missing cape patches and fragmentation relative to the preserved high-poly**. Earlier wording blaming persistent source holes was misleading. Audit finds48 edges with more than2 incident faces and84 near-zero-area faces. **Fails shape preservation; not accepted topology.**

Source/OBJ: `assets/source/3d/retopology-tools/`. Actual wire and pelvis close-up: `docs/art-audit/instant-meshes-test/`. The `.blend` is a scene-only library containing this experimental scene and its dependencies.

Baseline: `docs/art-audit/triposg-untouched-highpoly/` verifies every face and vertex against the raw neural arrays, with only axis/scale/ground conversion (maximum coordinate error6.62e-8). The source has local defects but is substantially more intact than the retopology outputs. New work must preserve this shape; use separate, guided treatment of thin cloth and deliberate joint topology before weight transfer. Old cuff/wrist weights remain unresolved; do not reuse them blindly.

```powershell
& '.tools/instant-meshes/bin/Instant Meshes.exe' --deterministic --faces 3000 --smooth 2 --boundaries --threads 8 --output .tools/retopology-test/alden-instant-3k.obj .tools/retopology-test/alden-cleaned-source.obj
.tools/blender-mcp-env/Scripts/python.exe scripts/blender-mcp-client.py run assets/source/3d/triposg-workflow/review_instant_meshes.py
```
