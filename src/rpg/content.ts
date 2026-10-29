import type {
  ItemDefinition,
  Recipe,
  ResourceDefinition,
  ResourceId,
  QuestDefinition,
  EnemyDefinition,
} from "./types";
import { TOWNS } from "./world";

/** Fixed local content; prices and XP never depend on a network service. XP is tenths. */
export const ITEMS: Record<string, ItemDefinition> = {};
function item(
  id: string,
  name: string,
  kind: ItemDefinition["kind"],
  value: number,
  extra: Partial<ItemDefinition> = {},
) {
  ITEMS[id] = { id, name, kind, value, stackable: false, weight: 1, ...extra };
}
item("coins", "Coins", "currency", 1, { stackable: true, weight: 0 });
item("bait", "Fishing bait", "supply", 1, { stackable: true, weight: 0 });
item("feather", "Feather", "supply", 2, { stackable: true, weight: 0 });
item("small-net", "Small fishing net", "tool", 5, {
  tool: "net",
  skill: "fishing",
  level: 1,
});
item("fishing-rod", "Fishing rod", "tool", 5, {
  tool: "rod",
  skill: "fishing",
  level: 5,
});
item("fly-fishing-rod", "Fly fishing rod", "tool", 5, {
  tool: "flyrod",
  skill: "fishing",
  level: 20,
});
item("hammer", "Hammer", "tool", 1, { tool: "hammer" });
item("prince-cape", "Prince’s travelling cape", "gear", 0, {
  slot: "cape",
  defence: 1,
});
item("training-bow", "Reed practice bow", "supply", 8);
item("training-arrow", "Blunt practice arrow", "supply", 1, { stackable: true });
item("shortbow", "Mosswood shortbow", "supply", 40);
item("watch-token", "Eastern watch service token", "supply", 0, { stackable: true });
for (const [metal, level, tier] of [["black", 10, 4], ["mithril", 20, 5]] as const) {
  item(`${metal}-sword`, `${metal} sword`, "gear", tier * 150, { slot: "weapon", attackLevel: level,
    attack: tier * 4, strength: tier * 3, attackTicks: 4, tier });
  item(`${metal}-body`, `${metal} body`, "gear", tier * 300, { slot: "body", defenceLevel: level, defence: tier * 10, tier });
  for (const tool of ["axe", "pickaxe"] as const) item(`${metal}-${tool}`, `${metal} ${tool}`, "tool", tier * 250,
    { tool, tier, skill: tool === "axe" ? "woodcutting" : "mining", level: level + 1, slot: "weapon", attackLevel: level,
      attack: tier * 2, strength: tier * 2, attackTicks: 5 });
}
item("raw-boar", "Raw moss boar meat", "resource", 5);
item("cooked-boar", "Roast moss boar", "food", 10, { heals: 3 });
item("burnt-boar", "Burnt moss boar", "resource", 0);
for (const [id, name, price] of [
  ["logs", "Logs", 4],
  ["oak-logs", "Oak logs", 8],
  ["willow-logs", "Willow logs", 12],
  ["copper-ore", "Copper ore", 8],
  ["tin-ore", "Tin ore", 8],
  ["iron-ore", "Iron ore", 15],
  ["coal", "Coal", 25],
  ["bronze-bar", "Bronze bar", 16],
  ["iron-bar", "Iron bar", 30],
  ["steel-bar", "Steel bar", 80],
] as const)
  item(id, name, "resource", price);
for (const [id, level, heal, value] of [
  ["shrimp", 1, 3, 5],
  ["sardine", 1, 4, 8],
  ["trout", 15, 7, 15],
] as const) {
  item(`raw-${id}`, `Raw ${id}`, "resource", value);
  item(`cooked-${id}`, `Cooked ${id}`, "food", value * 2, {
    heals: heal,
    skill: "cooking",
    level,
  });
  item(`burnt-${id}`, `Burnt ${id}`, "resource", 0);
}
for (const [metal, tier, use, wield, axe, pick] of [
  ["bronze", 1, 1, 1, 16, 1],
  ["iron", 2, 1, 1, 56, 140],
  ["steel", 3, 6, 5, 200, 500],
] as const) {
  item(`${metal}-axe`, `${metal} axe`, "tool", axe, {
    tool: "axe",
    tier,
    skill: "woodcutting",
    level: use,
    slot: "weapon",
    attackLevel: wield,
    attack: tier * 3,
    strength: tier * 2,
    attackTicks: 5,
  });
  item(`${metal}-pickaxe`, `${metal} pickaxe`, "tool", pick, {
    tool: "pickaxe",
    tier,
    skill: "mining",
    level: use,
    slot: "weapon",
    attackLevel: wield,
    attack: tier * 2,
    strength: tier * 2,
    attackTicks: 5,
  });
  for (const [kind, slot, price, defence] of [
    ["sword", "weapon", 26, 0],
    ["med-helm", "head", 24, 3],
    ["shield", "shield", 48, 4],
    ["body", "body", 160, 10],
    ["legs", "legs", 80, 6],
  ] as const)
    item(
      `${metal}-${kind}`,
      `${metal} ${kind.replace("-", " ")}`,
      "gear",
      price * (tier === 1 ? 1 : tier === 2 ? 3 : 10),
      {
        tier,
        slot,
        ...(slot === "weapon"
          ? {
              attackLevel: wield,
              attack: 4 * tier,
              strength: 3 * tier,
              attackTicks: 4,
            }
          : { defenceLevel: wield, defence: defence * tier }),
      },
    );
}
const resource = (
  id: ResourceId,
  name: string,
  skill: ResourceDefinition["skill"],
  level: number,
  tool: ResourceDefinition["tool"],
  itemId: string,
  xp: number,
  ticks: number,
  respawnTicks: number,
  depletion: number,
  success: number,
  bait?: string,
): ResourceDefinition => ({
  id,
  name,
  skill,
  level,
  tool,
  itemId,
  xp,
  ticks,
  respawnTicks,
  depletion,
  success,
  ...(bait ? { bait } : {}),
});
export const RESOURCES: Record<ResourceId, ResourceDefinition> = {
  tree: resource(
    "tree",
    "Mosswood tree",
    "woodcutting",
    1,
    "axe",
    "logs",
    250,
    4,
    8,
    0.18,
    0.5,
  ),
  oak: resource(
    "oak",
    "Old oak",
    "woodcutting",
    15,
    "axe",
    "oak-logs",
    375,
    4,
    14,
    0.15,
    0.35,
  ),
  willow: resource(
    "willow",
    "River willow",
    "woodcutting",
    30,
    "axe",
    "willow-logs",
    675,
    4,
    20,
    0.12,
    0.3,
  ),
  copper: resource(
    "copper",
    "Copper outcrop",
    "mining",
    1,
    "pickaxe",
    "copper-ore",
    175,
    8,
    8,
    1,
    1,
  ),
  tin: resource(
    "tin",
    "Tin outcrop",
    "mining",
    1,
    "pickaxe",
    "tin-ore",
    175,
    8,
    8,
    1,
    1,
  ),
  iron: resource(
    "iron",
    "Iron outcrop",
    "mining",
    15,
    "pickaxe",
    "iron-ore",
    350,
    8,
    16,
    1,
    1,
  ),
  coal: resource(
    "coal",
    "Coal outcrop",
    "mining",
    30,
    "pickaxe",
    "coal",
    500,
    8,
    30,
    1,
    1,
  ),
  shrimp: resource(
    "shrimp",
    "Shrimp fishing",
    "fishing",
    1,
    "net",
    "raw-shrimp",
    100,
    5,
    12,
    0.1,
    0.7,
  ),
  sardine: resource(
    "sardine",
    "Sardine fishing",
    "fishing",
    5,
    "rod",
    "raw-sardine",
    200,
    5,
    12,
    0.1,
    0.65,
    "bait",
  ),
  trout: resource(
    "trout",
    "Trout fishing",
    "fishing",
    20,
    "flyrod",
    "raw-trout",
    500,
    5,
    12,
    0.1,
    0.6,
    "feather",
  ),
};
export const RECIPES: Record<string, Recipe> = {};
for (const [metal, level, xp, inputs, success] of [
  [
    "bronze",
    1,
    62,
    [
      { itemId: "copper-ore", quantity: 1 },
      { itemId: "tin-ore", quantity: 1 },
    ],
    1,
  ],
  ["iron", 15, 125, [{ itemId: "iron-ore", quantity: 1 }], 0.5],
  [
    "steel",
    30,
    175,
    [
      { itemId: "iron-ore", quantity: 1 },
      { itemId: "coal", quantity: 2 },
    ],
    1,
  ],
] as const) {
  RECIPES[`${metal}-bar`] = {
    id: `${metal}-bar`,
    name: `Smelt ${metal} bar`,
    skill: "smithing",
    level,
    station: "furnace",
    inputs: [...inputs],
    output: { itemId: `${metal}-bar`, quantity: 1 },
    xp,
    ticks: 5,
    success,
  };
  for (const [kind, base, bars] of [
    ["axe", 1, 1],
    ["sword", 4, 1],
    ["med-helm", 3, 1],
    ["shield", 8, 2],
  ] as const) {
    const id = `${metal}-${kind}`;
    RECIPES[id] = {
      id,
      name: `Smith ${metal} ${kind}`,
      skill: "smithing",
      level: base + (metal === "bronze" ? 0 : metal === "iron" ? 15 : 30),
      station: "anvil",
      tool: "hammer",
      inputs: [{ itemId: `${metal}-bar`, quantity: bars }],
      output: { itemId: id, quantity: 1 },
      xp: (metal === "bronze" ? 125 : metal === "iron" ? 250 : 375) * bars,
      ticks: 5,
      success: 1,
    };
  }
}
for (const [fish, level, xp] of [
  ["shrimp", 1, 300],
  ["sardine", 1, 400],
  ["trout", 15, 700],
  ["boar", 1, 300],
] as const) {
  const id = `cooked-${fish}`;
  RECIPES[id] = {
    id,
    name: `Cook ${fish}`,
    skill: "cooking",
    level,
    station: "range",
    inputs: [{ itemId: `raw-${fish}`, quantity: 1 }],
    output: { itemId: id, quantity: 1 },
    xp,
    ticks: 4,
    success: 0.65,
  };
}
export interface ShopDefinition {
  id: string;
  name: string;
  stock: Record<
    string,
    { max: number; buy: number; sell: number; restockTicks: number }
  >;
}
export const SHOPS: Record<string, ShopDefinition> = Object.fromEntries(
  TOWNS.map((t) => {
    const id = `${t.id}-shop`;
    return [
      id,
      {
        id,
        name: `${t.name} supplies`,
        stock: Object.fromEntries(
          Object.values(ITEMS)
            .filter((i) => i.value > 0 && i.id !== "coins" && (
              t.id === "oakrest" ? i.id.startsWith("bronze-") || ["iron-pickaxe", "steel-pickaxe", "bronze-axe", "small-net", "hammer", "logs", "copper-ore", "tin-ore", "raw-shrimp", "cooked-shrimp"].includes(i.id) :
                t.id === "briarford" ? i.tool === "axe" || ["net", "rod", "flyrod"].includes(i.tool ?? "") || /logs|shrimp|sardine|trout|bow|arrow|bait|feather/.test(i.id) :
                  ["pickaxe", "hammer"].includes(i.tool ?? "") || i.kind === "gear" || /ore|coal|bar/.test(i.id)
            ))
            .map((i) => [
              i.id,
              {
                max:
                  i.kind === "tool" || i.kind === "gear"
                    ? 3
                    : i.stackable
                      ? 100
                      : 30,
                buy: i.value,
                sell:
                  i.kind === "resource"
                    ? i.value
                    : Math.max(1, Math.floor(i.value / 2)),
                restockTicks: 100,
              },
            ]),
        ),
      },
    ];
  }),
);
for (const [id, name, ids] of [
  ["briarford-bowyer", "Iori’s bowyer", ["shortbow", "training-bow", "training-arrow", "logs", "oak-logs", "willow-logs"]],
  ["watch-quartermaster", "Eastern watch quartermaster", ["black-sword", "black-body", "mithril-sword", "mithril-body", "cooked-shrimp"]],
] as const) SHOPS[id] = { id, name, stock: Object.fromEntries(ids.map((itemId) => [itemId,
  { max: ITEMS[itemId].stackable ? 100 : 3, buy: ITEMS[itemId].value, sell: Math.max(1, Math.floor(ITEMS[itemId].value / 2)), restockTicks: 100 }])) };
export const ENEMIES: Record<string, EnemyDefinition> = {
  captain: { id: "captain", name: "Captain Kestrel", health: 22, attack: 6, strength: 6, defence: 6,
    attackTicks: 5, maxHit: 3, aggressive: false, respawnTicks: 100,
    loot: [{ itemId: "coins", quantity: 40 }, { itemId: "cooked-shrimp", quantity: 3 }] },
  boar: {
    id: "boar",
    name: "Moss boar",
    health: 8,
    attack: 1,
    strength: 1,
    defence: 1,
    attackTicks: 5,
    maxHit: 1,
    aggressive: false,
    respawnTicks: 35,
    loot: [
      { itemId: "raw-boar", quantity: 1 },
      { itemId: "coins", quantity: 4 },
    ],
  },
  "rock-mite": {
    id: "rock-mite",
    name: "Copper-shell mite",
    health: 12,
    attack: 3,
    strength: 3,
    defence: 4,
    attackTicks: 5,
    maxHit: 2,
    aggressive: false,
    respawnTicks: 45,
    loot: [
      { itemId: "copper-ore", quantity: 2 },
      { itemId: "coins", quantity: 8 },
    ],
  },
  bandit: {
    id: "bandit",
    name: "Thorn-road outlaw",
    health: 18,
    attack: 5,
    strength: 5,
    defence: 5,
    attackTicks: 5,
    maxHit: 3,
    aggressive: true,
    respawnTicks: 60,
    loot: [
      { itemId: "coins", quantity: 25 },
      { itemId: "cooked-shrimp", quantity: 2 },
    ],
  },
};
export const QUESTS: Record<string, QuestDefinition> = {
  forge: {
    id: "forge",
    name: "An Honest Forge",
    description:
      "Bring Master Ren six logs and six bronze bars. The public Oakrest anvil is open to learners; earn access to the frontier towns’ anvils.",
    giverId: "quest-forge",
    items: [
      { itemId: "logs", quantity: 6 },
      { itemId: "bronze-bar", quantity: 6 },
    ],
    reward: {
      coins: 80,
      xp: { smithing: 3000, mining: 3000 },
      unlock: "frontier-anvils",
    },
  },
  supper: {
    id: "supper",
    name: "Supper Across the River",
    description:
      "Bring Hana six cooked shrimp. Earn access to Briarford’s cooking range.",
    giverId: "quest-supper",
    items: [{ itemId: "cooked-shrimp", quantity: 6 }],
    reward: {
      coins: 60,
      xp: { fishing: 2000, cooking: 3000 },
      unlock: "briarford-range",
    },
  },
  road: {
    id: "road",
    name: "The Thorn-Road Crossing",
    description:
      "Learn Woodcutting 15 and Attack, Strength and Defence 5. Bring eight oak logs and defeat three outlaws after accepting the quest; reopen the short central river crossing.",
    giverId: "quest-road",
    requirements: { woodcutting: 15, attack: 5, strength: 5, defence: 5 },
    items: [{ itemId: "oak-logs", quantity: 8 }],
    kills: { enemyId: "bandit", quantity: 3 },
    reward: {
      coins: 150,
      xp: { attack: 5000, defence: 5000 },
      unlock: "river-road",
    },
  },
};
QUESTS.forge.stages = [
  { id: "ledger", kind: "inspect", targetId: "forge-charcoal", description: "Inspect Ren’s charcoal ledger." },
  { id: "supplies", kind: "gather", items: [{ itemId: "logs", quantity: 6 }], description: "Gather six logs for Ren’s charcoal supply." },
  { id: "bronze", kind: "craft", recipeId: "bronze-bar", quantity: 6, description: "Smelt or collect six bronze bars." },
  { id: "deliver", kind: "deliver", targetId: "quest-forge", items: QUESTS.forge.items, description: "Deliver the timber and bronze to Ren." },
];
QUESTS.supper.stages = [
  { id: "basket", kind: "inspect", targetId: "supper-basket", description: "Inspect Hana’s empty fish basket." },
  { id: "supplies", kind: "gather", items: QUESTS.supper.items, description: "Catch and cook six shrimp, or bring banked meals." },
  { id: "deliver", kind: "deliver", targetId: "quest-supper", items: QUESTS.supper.items, description: "Bring Hana six cooked shrimp." },
];
QUESTS.road.stages = [
  { id: "survey", kind: "inspect", targetId: "road-survey", description: "Inspect the ruined crossing survey." },
  { id: "supplies", kind: "gather", items: QUESTS.road.items, description: "Train for the crossing and prepare eight oak logs." },
  { id: "outlaws", kind: "kill", enemyId: "bandit", quantity: 3, description: "Defeat three outlaws after accepting." },
  { id: "deliver", kind: "deliver", targetId: "quest-road", items: QUESTS.road.items, description: "Deliver the oak timber to Warden Toma." },
];
QUESTS.bowyer = { id: "bowyer", name: "The Bowyer’s Measure", giverId: "quest-bowyer",
  description: "Commission a practice bow and learn Iori’s three measured practice cycles.",
  items: [{ itemId: "logs", quantity: 2 }, { itemId: "bronze-bar", quantity: 1 }],
  stages: [
    { id: "supplies", kind: "gather", items: [{ itemId: "logs", quantity: 2 }, { itemId: "bronze-bar", quantity: 1 }], description: "Bring two logs and one bronze bar for Iori’s commission." },
    { id: "commission", kind: "deliver", targetId: "quest-bowyer", items: [{ itemId: "logs", quantity: 2 }, { itemId: "bronze-bar", quantity: 1 }], description: "Commission a reed practice bow." },
    { id: "practice", kind: "practice", targetId: "bowyer-target", quantity: 3, description: "Complete three measured practice cycles at the reed target." },
    { id: "report", kind: "talk", targetId: "quest-bowyer", description: "Report your practice to Iori." },
  ], reward: { coins: 30, xp: { woodcutting: 500 }, unlock: "bowyer" } };
QUESTS.letters = { id: "letters", name: "River Letters", giverId: "quest-letters", items: [],
  description: "Follow Nell’s courier markers and choose supplies or scouting to restore the ferry.",
  stages: [
    { id: "reed", kind: "inspect", targetId: "letters-reed", description: "Inspect the reed-wrapped letter." },
    { id: "west", kind: "visit", targetId: "letters-west", description: "Visit the west-bank marker." },
    { id: "east", kind: "visit", targetId: "letters-east", description: "Visit the east-bank marker." },
    { id: "route", kind: "choice", targetId: "quest-letters", description: "Nell asks: bring supper for the ferry workers, or scout the courier route?",
      choices: [{ id: "supplies", label: "Bring six cooked shrimp", next: "supplies" }, { id: "scout", label: "Scout three river markers", next: "scout-reed" }] },
    { id: "supplies", kind: "gather", items: [{ itemId: "cooked-shrimp", quantity: 6 }], next: "deliver", description: "Prepare six cooked shrimp for the ferry workers." },
    { id: "deliver", kind: "deliver", targetId: "quest-letters", items: [{ itemId: "cooked-shrimp", quantity: 6 }], next: "report", description: "Deliver the workers’ meals." },
    { id: "scout-reed", kind: "inspect", targetId: "letters-reed", description: "Scout the reed marker." },
    { id: "scout-bell", kind: "inspect", targetId: "letters-bell", description: "Scout the old ferry bell." },
    { id: "scout-stone", kind: "inspect", targetId: "letters-stone", description: "Scout the courier’s river stone.", next: "report" },
    { id: "report", kind: "talk", targetId: "quest-letters", description: "Report to Nell and open the ferry." },
  ], reward: { coins: 50, xp: { fishing: 500 }, unlock: "river-ferry" } };
QUESTS.watch = { id: "watch", name: "The Eastern Watch", giverId: "quest-watch", prerequisites: ["road"],
  description: "Investigate three clues, prepare for danger, and confront Captain Kestrel’s outdoor camp.",
  requirements: { attack: 5, strength: 5, defence: 5 }, items: [],
  stages: [
    { id: "tracks", kind: "inspect", targetId: "watch-track", description: "Inspect the boot tracks." },
    { id: "banner", kind: "inspect", targetId: "watch-banner", description: "Inspect the torn watch banner." },
    { id: "fire", kind: "inspect", targetId: "watch-fire", description: "Inspect the abandoned campfire." },
    { id: "prepare", kind: "gather", items: [{ itemId: "cooked-shrimp", quantity: 6 }], description: "Prepare six healing meals before approaching the outlaw camp." },
    { id: "captain", kind: "kill", enemyId: "captain", quantity: 1, description: "Defeat Captain Kestrel at the open-air camp." },
    { id: "report", kind: "talk", targetId: "quest-watch", description: "Report to Scout Edda and claim watch services." },
  ], reward: { coins: 180, xp: { defence: 1000 }, unlock: "watch-services" } };
