# Interaction UX review — 2026-11-01

Authority: [layout rules](UX_LAYOUT_RULES.md). The game now uses nearby object prompts, turn-based NPC dialogue and full-screen crafting with recipes/details together. Context entry hides exploration UI and focuses the encounter camera; exit restores the original view. Menu/Start suspends the interaction. Device mode is transient: desktop has no touch dock, mobile hides it during controller use and restores it on touch/disconnect.

The crafting information area includes requirements, batch steppers, result and craft action. Browser geometry checks assert 30–40% of portrait height or landscape width at 320×568, 390×844, 667×375, 844×390 and 1280×720. The small portrait minimum preserves readable text and 44px targets. Bounded recipe cards scroll within the remaining area.

Original furniture thumbnails project already loaded baked geometry into cached Canvas2D images; no new artwork downloads, geometry edits or art generation. Other item types retain labelled fallback badges. The communal bench reuses the existing table. The separate starter chest stays nonblocking to preserve existing routes and standing positions.

Evidence: [portrait crafting](screenshots/valley-interactions/craft-390x844.png), [16:9 crafting](screenshots/valley-interactions/craft-1280x720.png), [Rowan](screenshots/valley-interactions/rowan-greeting-390x844.png), [replies](screenshots/valley-interactions/rowan-replies-390x844.png). Input-device captures share that folder. These are actual WebGL game captures, not the earlier mockups.

Local gates are recorded in PROGRESS.md. Tests cover camera projection/restoration, original thumbnails, exact-once parcel/payment, peaceful crafting results, inventory/skill conservation, all three inputs, orientation, held-input clearing, child/response suspension, current saves and offline work. GPU checks stay local; release CI retains two non-GPU cases. Public upgrade/offline and interaction checks use the two verify-*-public.mjs scripts.

Publishedaf76f3c / Actions41310935982; actual public5a2441116df9. Public checks pass with zero page errors/external requests. Measured information-panel proportions:390×844 portrait33.33%,844×390 landscape31.91%,1280×720 desktop32.40%. [Public conversation](screenshots/valley-interactions/public-conversation.png), [public crafting](screenshots/valley-interactions/public-crafting-390.png). Preserved current progress and earlier archive keys; offline WebGL/all11 assets pass.

Physical-device comfort and performance comparisons remain playtest work; no new FPS or latency claim. Current format7 saves and earlier archive isolation remain intact. There are no new dependencies, paid APIs or external runtime requests.
