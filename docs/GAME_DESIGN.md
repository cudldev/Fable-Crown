# Fable Crown — Game Design (CURRENT)

**Pitch:** A mobile-first, painterly fantasy RPG and autonomous settlement builder. The player influences a young prince's thoughts and intentions as he guides a growing frontier city. Villagers have individual skills, personalities, needs and routines; the prince and villagers carry out decisions autonomously.

## Player fantasy and role
You are an unseen guiding influence, not a direct-control city planner. The prince is a visible cooperative autonomous protagonist with his own personality, relationships, RPG skills and ambitions. The settlement is the main long-term progression. Player input should usually be a choice between 2–3 ideas proposed in the prince's thoughts. No joystick, crowded hotbar or mandatory text prompting. The prince and villagers continue working without input.

## Thought & Intention system
At meaningful events, the prince presents 2–3 validated ideas. A player can tap an idea or let the timer expire; the prince chooses autonomously. Informational thoughts need no response. Tactical default 20 seconds; strategic 120 seconds; emergencies resolve immediately. Nonblocking decisions, cooldowns and soft interruption. Local lightweight LLM may express personality-aware thoughts and NPC dialogue, but the deterministic planner owns valid choices and game state. Procedural fallback is mandatory.

## City-building through real work
The prince selects an ambition (e.g. construct a blacksmith). The planner identifies material, tool, labor and location prerequisites. Villagers gather timber and stone, move supplies, build structures and operate workshops through legal actions. Buildings unlock professions and new plans. The player can influence placement contextually but need not manually place or assign every worker.

## RuneScape-style progression
One authoritative 600ms tick, integer action durations, skill XP, inventory, travel, banking, gathering, crafting, and later combat. Characters perform physically meaningful tasks, not abstract free production. Profession skills affect output and options. No aging, inheritance or dynasties in the current scope.

## Time and offline behavior
Active game: 100% tick speed. Calendar follows real-world date/time and can trigger daily merchants, events and seasons even when closed. For each absence, at most 24h real-world time counts toward gameplay, at 25% speed (maximum 6h equivalent, 36,000 ticks). Analytical, rules-consistent catch-up; no offline LLM. Calendar advances beyond 24h. Idempotent saves and consistent resource budgets.

## First vertical slice (priority over broad feature list)
One frontier hamlet with a small manor, forest, mine, bank/storage and an empty workshop site; one autonomous prince and 12–20 villagers. Core professions: woodcutter, miner, builder/carpenter, blacksmith (the last unlocked by construction). First meaningful goal: **construct a blacksmith workshop** by acquiring materials and labor. Show villagers carrying out tasks and the completed building appearing in the town. Add a thought decision with 2–3 strategies: gather locally, trade for supplies, or prioritize a simpler improvement. The prince can also inspect villagers and participate in basic RPG skill progression. Prioritize a playable complete loop over complex combat, 50k NPC scaling or fully dynamic town construction.

## Presentation and platform
Fully painterly watercolor/ink Japanese traditional fantasy; simplified hand-painted gameplay characters, more detailed portraits. See `docs/ART_DIRECTION.md` — it overrides previous pixel/HD-2D prescriptions. Mobile-first responsive portrait/landscape, static PWA on GitHub Pages, no paid APIs. Optional local WebLLM for short narrative text only.

## Long-term vision (NOT demo requirements)
Expanded settlement, trades, guilds, expeditions, dungeons, combat, world events, richer social interactions, scalable NPC simulation and multiple towns. Performance targets 1,000 visible/50,000 logical NPCs are stretch benchmarks, not first-demo acceptance requirements.
