# Expanded world release — approved plan

World:6600×4440, 36×original area; nine authored landscape regions; Oakrest, Briarford, Stonehaven; 24 characters; 18 destinations; separate local stores and physical resource hauling. Follow Alden closely in a full-browser world. Pan/zoom/overview; contextual controls; generated watercolor/ink panorama layers and independent cutouts.

Player:travel, gather2/10/20/repeat, bank/withdraw, build and forge. Do now/Add next; edit/cancel/reorder eight queued intentions. Preserve interrupted player work and resources. Orders start at the next appropriate safe boundary; empty queue gives six thinking ticks before autonomy. Recommendations keep20s. Wait here/Let Alden decide. Daily needs/social/combat/economy expansion deferred.

SaveV2 migrates original actors/inventories/XP/coins/workshop into Oakrest offset850,1800. New stores stay separate. Queues and thinking persist through bounded offline catch-up. Static zero-API-cost GitHub Pages PWA with lazy regions, visited cache and explicit whole-world download.

## Development model routing

- Lead:current conversation; contracts, UI, integration, verification, deployment.
- Simulation/navigation:GPT-6.1 Sol, high reasoning.
- Renderer:GPT-6.1 Sol, medium reasoning.
- Bounded QA:GPT-6 Luna, medium reasoning.
- GPT-6 Astra reserved for a difficult correctness issue only if needed.
- One specialist active at a time; agents share plan allowance. No paid inference endpoints or automatic runtime model downloads.

Model routing uses supported spawn parameters. [Official subagent guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents) supports explicit model/reasoning selection and recommends Sol for demanding work and Luna for narrower tasks.
