# Mobile UX pass

Initial evidence: code at isolated `5e2ea12` and existing public390×844/844×390 captures. No new GPU or physical-device review yet. Later console-menu steering supersedes the old nine-tab navigation.

| Finding | Bounded fix / acceptance |
|---|---|
| Distant resource taps immediately swing; empty/depleted/out-of-reach attempts can leave the previous banner unchanged. | Nearby/selected target, availability and actionable range guidance stay visible beside the action area. Misses explain why without inventing rewards. |
| Presses during the600ms swing are intentionally discarded, but the button shows no recovery/ready state. | Show authoritative recovery/readiness and too-fast feedback; retain one press→one swing, no auto-repeat/queue. |
| “Collected logs” omits quantity/XP. Craft completion removes the queue without replacing “Ingredients reserved.” | Exact authoritative item/XP/coin gains and completion/storage outcomes. Repeated identical results renew the toast; recent history remains inspectable. |
| Mode and Bag are at the top, far from the bottom strike button. In landscape the primary strike is the leftmost of three right-side buttons. | Mode switch near the primary thumb action, reachable Game menu hub, primary strike at the dominant thumb edge; preserve≥44px targets. Handedness/raised controls are Settings options. |
| Landscape HUD/goal/welcome occupy much of the left half-height. Feedback is distant from the thumbs; FPS can draw above panels. | Compact vitals/goal, nearby readable feedback, camera controls outside thumb zones, no overlap with controls/panels. Preserve the requested FPS counter. |
| Placement hides movement; a range error requires cancel/walk/reopen and can lose the chosen draft. | Compact preview with Adjust expansion; Walk closer suspends the draft and restores movement, Resume placement preserves coordinates/rotation. No movement while editing. |
| Recipe buttons expose few preconditions; default “Make one”/“Make1” duplicate each other. | Clear missing ingredients/station, bounded batch state, visible completion. Invalid attempts retain resources. |
| Layout changes can move captured touch controls beneath held fingers. Menu entry also clears action input. | Multitouch move+strike remains independent; cancel, menu entry and orientation change release movement/guard/strike and recenter the stick. |

Agreed console flow: Menu/Start opens a categorized Game menu; leaf Back/B/Escape steps toward its origin, Close resumes directly, I remains Bag. No balance, save-format, offline or legacy-route changes.

Latest object-service requirement: the global menu contains no Craft/Trade/Visitors/Projects shortcuts. Actual workbench, forge, fire, caravan, home, Rowan and planning-table interactions expose only their intended services; global Backpack shows carried gear, and connected storage requires its world object. Tests must enter through real Interact/world selection and retain authoritative proximity checks.

Agreed interface policy: menus pause60Hz actors/combat while600ms background work continues. Verify frozen actor frames/HP during a real craft completion, then clean resume. Context controls expose stable strike/mode hooks plus handedness/raised/held/swinging state; verify actual coarse-pointer geometry rather than viewport-only screenshots.

Four local browser cases cover real repeated gathering/XP/recovery/empty feedback; actual workbench craft→walk→caravan sale plus filtered smelting/cooking and suspended placement; coarse-pointer320×568,390×844,667×375,844×390 geometry in both handed/raised layouts; simultaneous move+strike/cancel/orientation/menu release. Existing ten functional and three art cases use the console/object routing. Release CI remains two non-GPU cases.

Local evidence: base `24e5df24de08` **17/17 GPU**; density/steppers `d703064e57e6` **7/7 affected GPU**; final pointer fix `5b79dde599fd` **3/3 touch/controller + 2/2 release**, no page errors. The final touch case proves secondary Mode preserves held movement, primary tap toggles once, cancel/outside do not activate, and secondary Interact opens the actual workbench and stops cleanly through Back.

Ten [actual captures](screenshots/valley-mobile/) were inspected. Gold primary, exact rewards and context are readable; steppers fit without horizontal overflow. Unscrolled Make-one is fully above the footer at844×390; Resume and Settings retain full44px hit regions at667×375. Partial grave recovery explicitly preserves the remaining-belongings message. Expanded placement scrolls while Cancel stays visible. Physical thumb comfort and virtual-keyboard behavior remain device follow-up.
