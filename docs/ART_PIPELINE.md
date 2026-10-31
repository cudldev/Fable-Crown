# Blender MCP asset workflow (legacy models and review tools)

Current art direction: [warm storybook voxel fantasy](ART_DIRECTION.md). Use [colored image -> TRELLIS -> VOX](VOXEL_PIPELINE.md), with [source-image rules](VOXEL_REFERENCE_GENERATION.md) and [migration gates](VOXEL_ASSET_MIGRATION.md). The Blender/GLB workflow below documents retained models and review tools, not the current visual target.

Earlier non-voxel character studies follow [the researched sculpt-to-game workflow](CHARACTER_MODELING_WORKFLOW.md): approve the sculpted form, then retopologize, test deformation, unwrap and paint/bake. Review small actual Blender previews with the user before advancing. The ink blockout is rejected as the final topology; its successful export is only a technical test. Voxel characters require reviewed proportions and articulated parts before replacing existing animation.

Proposed image-assisted sculpt generation: [local tool design](LOCAL_SCULPT_TOOL.md). No generator is installed or verified yet.

This is the editable workflow for the optional 3D experiment. Current deliverables are reviewed drafts, not a claim that the target art quality or a complete production animation library has been achieved.

## Source, export and preview

| Item | Location |
|---|---|
| Modeler skill and specialist references | `skills/fable-3d-art/` (also installed in the local Codex skills folder) |
| Target concept | `assets/reference/fable_crown_3d_pixel_target.png` |
| Editable Blender models | `assets/source/3d/{bank,forge,tree,alden,anvil,crate,lantern}.blend` |
| Construction recipes and shared UV/palette helpers | `assets/source/3d/build_*.py`, `pipeline.py` |
| Browser GLBs, pixel atlas, checked manifest | `public/art3d/` |
| Earlier draft checkpoint | `assets/source/3d/revisions/pass-01/` |
| Read-only asset workbench | `?renderer=3d&assetReview=1` under the local app URL |

The `.blend` is the artist's source of truth after generation. Edit it in Blender, save it, then export. Re-running a recipe intentionally rebuilds its source and can replace manual edits, so regeneration requires an explicit flag. The browser always consumes GLBs, never Python or Blender source files.

## Local tools

Verified on Windows with Blender5.1.2, Node24 and MCP for Blender2.2.6. Asset checks require Node22.15+ for Zstandard-compressed Blender sources. Ordinary gameplay/builds do not need Blender, MCP, Python or an account; the checked exports are included in the repository.

The project-local upstream MCP server/client controls a separate running Blender session on127.0.0.1:9876. The bootstrap loads the upstream addon for that session, without replacing your startup scene or saving preferences. Telemetry and external asset/generation integrations are disabled. This is a real MCP protocol connection; native Codex tool discovery may separately require MCP registration and a new session.

First-time Windows setup: run `powershell -File scripts/setup-blender-mcp.ps1`. It downloads the official pinned uv tool and installs the pinned Python requirements under ignored `.tools/`. Pass `-BlenderPython` if your Blender installation differs. No API key or paid service is used. Set `BLENDER_BIN` for a non-default Blender executable, or `BLENDER_MCP_PYTHON` for a different prepared MCP Python environment.

```powershell
npm run art:start                 # separate live Blender/MCP session
npm run art:status                # verify actual scene access
npm run art:export -- alden       # export saved manual edits; retain source
npm run art:export                # export all seven saved sources
npm run art:check                 # read-only payload/source/manifest checks
```

Use one controller at a time for the shared Blender session. Specialists own different source recipes; the lead executes them sequentially and reviews their images. To intentionally rebuild recipe sources: `npm run art:generate -- character --replace-sources` (or `environment`, `props`, `all`). Preserve meaningful previous drafts before doing so.

Capture comparable export images with `npm run art:capture -- --tag review-name --url http://127.0.0.1:5173/Fable-Crown/` (adjust the URL to the running local build). It records front/side/back/walk, models/cutaway, light/camera comparison and phone views under `docs/art-audit/three-review-name/`, rejecting fallback assets, browser errors and external requests. The current preview evidence is under `three-preview/`.

## Modeler flow

Read the skill and the relevant character/environment/prop reference. Compare the current export to the target at the same camera and scale. Fix the largest silhouette/proportion/material problems first; inspect the actual render before producing more assets. Use the workbench to rotate, compare20°perspective with orthographic, toggle roofs, preview walking, and compare day/dusk/night. It is isolated from the simulation and never touches saves.

Character source: shaped body/head/hair and clothing, grounded feet, shoulder/hip pivots, tool socket, cape attachment and walk review. The current demo uses articulated rigid parts. Skinned deformation, a complete animation library, equipment fitting and export of those clips remain future production work.

Environment source: distinct architectural silhouettes, deliberate opening/roof proportions, plausible workspaces, ground contact and cutaway-compatible groups. Tree source: rooted trunk/branch hierarchy and grouped crown shape, not repeated spheres. Prop source: readable functional silhouette, sensible material thickness and correct working/grip pivots. Reuse the shared pixel atlas and visual material vocabulary.

## Export contract and gates

One metre per tile, Blender Z up/front−Y, GLB Y up/front+Z, ground-centred roots. Buildings use4×3canonical footprints and a separate `roof`; actors retain `body`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`, `tool`, `cape`. Light marker empties retain local position, kind, colour, intensity and range. The renderer chooses active lights and shadow budgets. Render cutaways and logical doors must remain consistent with actual gameplay geometry.

`art:check` verifies GLB structure, embedded resources, attributes/indices, nearest sampling, atlas512×512, composed bounds, grounded pivots, required nodes, source validity and budgets. `--write` explicitly refreshes the deterministic manifest. The seven-model sample is below1MiB total; per-asset ceilings are in `scripts/check-art3d.mjs`. Import merges compatible static meshes while preserving roofs and articulation.

Technical checks do not certify art quality. Review silhouette/proportion, form/construction, pixel materials, target cohesion and game integration from images. Record actual weaknesses and corrections. A usable draft can be tested locally while the user decides whether the direction is good enough. Then run unit/browser tests, build, subpath/PWA/offline checks and a documented benchmark. Publication requires separate authorization and actual URL verification.
