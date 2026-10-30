# Alden character source

`build_character.py` creates the first editable character sample; the lead executes it through Blender MCP. No Blender process was run by the character worker.

- Z up/front −Y in Blender; glTF conversion produces Y up/front +Z. Feet are at zero. Target height is approximately1.92m, with compact JRPG proportions.
- Tailored octagonal torso/limb profiles, shaped cheeks and nose, swept asymmetric hair locks, tapered boots, a bent gold-edged blue cape and an asymmetric satchel replace the rectangular placeholder silhouette.
- Shared pixel atlas and one material. Named `body`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`, `tool`, and `cape` follow the runtime articulation contract. Tool is an empty socket; gameplay owns the selected tool.
- `.blend` is the editable source after generation. Manual artist edits must be exported from that source, not overwritten by rerunning the construction recipe.

Visual acceptance remains pending a Blender/gameplay render. Check face/front and back silhouette, cape normals/edge, 16texels/m texture readability, shoulder deformation under swing and correct contact with ground. This sample establishes a reusable base; it is not a finished production character or a full animation library.

## Pass2 — skill-guided correction

Read `skills/fable-3d-art/SKILL.md`, character modeling and visual review references. Reviewed `three-assets-alden.png`, `three-assets-village.png` and the atmospheric target. Pass1 has armour-like square sleeve caps, a repeated sawtooth fringe with oversized brows/eyes, and raised costume plates that fragment the silhouette.

Pass2 narrows and rounds the shoulder transition, replaces eight hair wedges with one swept shell and two supporting locks, reduces the face marks, integrates the cream shirt into the torso surface, removes boot plates/knuckle blocks, and gives the cape a clearer asymmetric cloth outline. Same identity, height, ground and articulation names. Source syntax passes; lead MCP export and front/side/back/walk/game-scale images remain required before visual acceptance.

Reviewed exported pass2 front/side/back/three-quarter/walk and phone village images. Silhouette, costume grouping, target cohesion and basic integration are usable drafts; material/pixel craft remains placeholder-level because cloth and facial planes are mostly flat swatches. Two image-driven corrections are now in source: conform the satchel strap to torso sections instead of bridging above the chest, and extend the existing hair shell over the nape so the head does not protrude through it. Fresh MCP export/review remains required for those corrections. No reference-quality claim.
