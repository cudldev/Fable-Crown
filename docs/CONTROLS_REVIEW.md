# Point controls and living neighbours — 2026-11-02

Valley exploration starts following Alden. Actual movement adds a gently eased lead capped at1.1m; stopping settles it, reduced motion disables it, and archive/reset presentation clears it. Zoom remains adjustable. Mouse dragging (including middle button), one-finger touch dragging and the right stick pan and park the camera. F, right-stick press or the highlighted HUD Follow button reattach it; wheel/pinch keep the current follow state. Journal Find pins a destination.

Click or tap ground to walk; select a resource, station, person or foe to approach and act. Routes use continuous collision and terrace/stair traversal. Right-click or long press offers the target action, Walk here and Examine. Drag/pinch/long-press release never also walk. Menus open only within actual range. Keyboard/controller remain alternatives; the virtual dock is removed.

Player and NPC routes prefer roads and player-laid paths using shared weighted A*. Modest road detours beat grass; long detours lose to useful shortcuts. Dirt/path costs0.6, ordinary ground1 and sand1.15; walking speed is unchanged. Space/controller guard and a wilderness-only touch guard preserve blocking.

Selected gathering/combat repeats for that target until completed or cancelled. Stop, a new destination, direct movement, menus, defeat, visibility loss or import cancel it. Cancellation preserves swing recovery and suppresses cancelled contact. Tasks never save or advance offline. Recovery still collects the selected bag. The terrain-conforming 3D facing mark and following camera remain.

NPCs work, wander and rest locally according to role. Talking holds the target through child menus while others continue; ending the conversation releases them. Visitor positions persist in optional current-format data, with live traces cleared during offline reconciliation. Routines are ambient and grant no player resources, XP or construction speed. Placement protects occupied visitor footprints; visitors avoid the future forge pad. No new art is integrated.

Actual WebGL captures: [desktop](screenshots/valley-point/desktop.png), [landscape](screenshots/valley-point/mobile-landscape.png), [conversation hold](screenshots/valley-point/conversation-hold.png). These establish presentation, not physical-device comfort or performance. Gates/publication: PROGRESS.md. Release CI retains two non-GPU cases.
