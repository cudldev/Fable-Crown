import type { RpgState, Thought } from "./types";

/** The opening choices use the same validated goals as the rest of the game. */
export function starterChoices(_state: RpgState): Thought["choices"] {
  return [
    {
      id: "starter-forge",
      label: "Help Ren light the forge",
      description:
        "Read his ledger, gather timber and ore, then bank and smelt the supplies. Alden starts here if you leave him to decide.",
      goal: {
        id: "quest-forge",
        kind: "quest",
        title: "An Honest Forge",
        questId: "forge",
      },
    },
    {
      id: "starter-hunt",
      label: "Prepare for a woodland hunt",
      description:
        "Use the starter sword and meals to train Attack to 5 on nearby wildlife. You can stop, eat or redirect Alden at any time.",
      goal: {
        id: "train-attack-5",
        kind: "skill",
        title: "Prepare for a woodland hunt",
        skill: "attack",
        level: 5,
      },
    },
    {
      id: "starter-trade",
      label: "Earn a better pickaxe",
      description:
        "Gather, bank and sell local supplies, then buy a lasting iron pickaxe upgrade from the village shop.",
      goal: {
        id: "obtain-iron-pickaxe",
        kind: "equipment",
        title: "Earn an iron pickaxe",
        itemId: "iron-pickaxe",
      },
    },
  ];
}
