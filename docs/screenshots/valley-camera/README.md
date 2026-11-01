# Camera and scenery checks — 2026-11-02

Actual local WebGL captures from the valley checks: desktop1280×720, touch390×844 and844×390. `mobile-detached.png` shows the highlighted Follow control; conversations hide it. `grass-away-from-camp.png` follows an NPC-motion stability sample and a streamed walking window. These captures document presentation, not physical-device performance.

Reproduce with `rpg-valley-follow.spec.ts`, `rpg-valley-mobile-ux.spec.ts` and `rpg-valley-foliage.spec.ts` in the local visual suite. The stability test asserts unchanged grass uploads, static-batch builds and terrain bakes while a visitor moves, then verifies cover remains populated during walking.
