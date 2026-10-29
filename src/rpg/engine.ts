import {
  SKILLS,
  TICK_MS,
  type ActorState,
  type Ambition,
  type RpgState,
  type RpgCommand,
  type RpgOrder,
  type TilePosition,
  type WorldObject,
  type WorldDefinition,
  type ItemStack,
  type ResourceDefinition,
  type EnemyState,
  type SkillId,
  type QuestStage,
} from "./types";
import {
  WORLD,
  TOWNS,
  isWalkable,
  canStep,
  findPath,
  pathToObject,
  objectById,
  worldForState,
  ENEMY_SPAWNS,
  tile,
  FERRIES,
  DEFAULT_GATES,
  GATE_IDS,
  worldVariantKey,
} from "./world";
import { startingSkills, levelForXp, XP_THRESHOLDS, skillName } from "./skills";
import { ITEMS, RESOURCES, RECIPES, SHOPS, ENEMIES, QUESTS } from "./content";
import {
  addItems,
  removeItems,
  exchangeItems,
  inventorySlots,
  itemCount,
} from "./inventory";
import { goalMet, goalSteps, suggestGoals } from "./planning";
import { appendGameMessage, appendSimulationEffect } from "./events";
import { starterChoices } from "./starter";

export const calendarDate = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function createRpg(now: number, seed = 1234567): RpgState {
  const names = [
    "Alden",
    "Mira",
    "Toma",
    "Jun",
    "Hana",
    "Ren",
    "Edda",
    "Bram",
    "Iori",
    "Nell",
    "Orin",
    "Sora",
    "Ada",
    "Fenn",
    "Lio",
    "Yuna",
    "Reed",
    "Wren",
    "Moss",
    "Finch",
    "Galen",
    "Opal",
    "Pip",
    "Vale",
  ];
  const actors = names.map((name, id): ActorState => {
    const position = { ...WORLD.spawns[id] };
    return {
      id,
      name,
      role:
        id === 0
          ? "prince"
          : id % 4 === 0
            ? "miner"
            : id % 4 === 1
              ? "woodcutter"
              : id % 4 === 2
                ? "fisher"
                : "smith",
      home: TOWNS[Math.floor(id / 8)].id,
      position,
      previousPosition: { ...position },
      movement: null,
      path: [],
      skills: startingSkills(),
      inventory: [
        { itemId: "bronze-axe", quantity: 1 },
        { itemId: "bronze-pickaxe", quantity: 1 },
        { itemId: "small-net", quantity: 1 },
        { itemId: "hammer", quantity: 1 },
      ],
      equipment: {},
      ammo: null,
      health: 10,
      runEnergy: 10000,
      action: null,
      activity: "Considering the road ahead",
      completed: 0,
      bank: [],
    };
  });
  actors[0].inventory.unshift({ itemId: "coins", quantity: 25 });
  actors[0].inventory.push({ itemId: "cooked-shrimp", quantity: 6 });
  actors[0].equipment = {
    weapon: "bronze-sword",
    shield: "bronze-shield",
    cape: "prince-cape",
  };
  const s: RpgState = {
    version: 5,
    worldRevision: 2,
    gates: { ...DEFAULT_GATES },
    tick: 0,
    savedAt: now,
    calendar: calendarDate(now),
    offlineRemainder: 0,
    seed: seed >>> 0,
    player: actors[0],
    npcs: actors.slice(1),
    resources: Object.fromEntries(
      WORLD.objects
        .filter((o) => o.resourceId)
        .map((o) => [o.id, { objectId: o.id, available: true, respawnAt: 0 }]),
    ),
    bank: [],
    shops: Object.values(SHOPS).map((shop) => ({
      id: shop.id,
      stock: Object.fromEntries(
        Object.entries(shop.stock).map(([id, entry]) => [id, entry.max]),
      ),
      restockAt: 100,
    })),
    enemies: ENEMY_SPAWNS.map((e) => ({
      ...e,
      position: { ...e.position },
      home: { ...e.position },
      health: ENEMIES[e.definitionId].health,
      respawnAt: 0,
      cooldown: 0,
      engagedUntil: 0,
    })),
    drops: [],
    quests: Object.fromEntries(
      Object.keys(QUESTS).map((id) => [
        id,
        { accepted: false, complete: false, kills: 0, stageId: QUESTS[id].stages?.[0]?.id, counters: {}, choices: {} },
      ]),
    ),
    grave: null,
    control: {
      waiting: false,
      running: true,
      active: null,
      source: null,
      queue: [],
      goal: null,
      thinkingUntil: 1,
      eatReadyAt: 0,
      reason: "Ren needs timber and bronze for Oakrest’s forge. A hunt or village trade are useful alternatives.",
      steps: [],
      style: "attack",
      visited: [],
      thought: null,
      lastThought: 0,
    },
    journal: [
      "A new chapter begins. Earlier village chronicles remain archived.",
    ],
    rewards: [],
    dialogue: null,
    effects: [],
    effectSequence: 0,
    messages: [],
    messageSequence: 0,
  };
  const choices = starterChoices(s);
  s.control.goal = choices[0].goal;
  s.control.steps = goalSteps(s, s.control.goal);
  s.control.thought = { id: "starter-oakrest", title: "A first step in Oakrest",
    body: "Help Ren with the forge, prepare for a woodland hunt, or earn supplies through village trade. Alden will start the forge task while you decide.",
    choices, expiresAt: 34 };
  return s;
}
function random(s: RpgState) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
const distance = (a: TilePosition, b: TilePosition) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const adjacent = (p: ActorState, o: WorldObject) =>
  p.position.worldId === o.position.worldId &&
  p.position.plane === o.position.plane &&
  p.position.x >= o.position.x - 1 &&
  p.position.x <= o.position.x + o.width &&
  p.position.y >= o.position.y - 1 &&
  p.position.y <= o.position.y + o.height;
const RESOURCE_OBJECTS = WORLD.objects.filter((o) => o.resourceId);
// The world is immutable. Reuse only routes actually requested, copying before travel consumes them.
const ROUTES = new Map<string, TilePosition[] | null>();
function objectRoute(s: RpgState, from: TilePosition, o: WorldObject) {
  const key = `${worldVariantKey(s)}:${from.worldId}:${from.plane}:${from.x}:${from.y}:${o.id}`;
  if (!ROUTES.has(key)) {
    ROUTES.set(key, pathToObject(from, o, worldForState(s)));
    if (ROUTES.size > 1024) ROUTES.delete(ROUTES.keys().next().value!);
  }
  return ROUTES.get(key)?.map((p) => ({ ...p })) ?? null;
}
function nearest(p: ActorState, filter: (o: WorldObject) => boolean) {
  return WORLD.objects
    .filter(filter)
    .sort(
      (a, b) =>
        distance(p.position, a.position) - distance(p.position, b.position) ||
        a.id.localeCompare(b.id),
    )[0];
}
function route(s: RpgState, p: ActorState, o: WorldObject): boolean {
  if (adjacent(p, o)) return true;
  const path = objectRoute(s, p.position, o);
  p.path = path ?? [];
  p.activity = path ? `Walking to ${o.name}` : `Cannot reach ${o.name}`;
  return false;
}
function travel(s: RpgState, p: ActorState) {
  const player = p.id === 0;
  if (player && p.runEnergy < 60) s.control.running = false;
  const running = player ? s.control.running !== false : p.runEnergy > 0;
  let steps = running ? 2 : 1;
  const tiles = [{ ...p.position }];
  if (player && !running) p.runEnergy = Math.min(10000, p.runEnergy + 15);
  while (steps-- && p.path.length) {
    if (player && running && p.runEnergy < 60) break;
    const next = p.path[0];
    if (!canStep(p.position, next, worldForState(s))) {
      p.path = [];
      p.action = null;
      p.activity = "The route changed";
      return;
    }
    p.position = { ...next };
    tiles.push({ ...next });
    p.movement = { tick: s.tick, mode: running ? "run" : "walk", tiles: [...tiles] };
    p.path.shift();
    if (running && p.runEnergy > 0) p.runEnergy = Math.max(0, p.runEnergy - 60);
  }
  if (player && running && p.runEnergy < 60) s.control.running = false;
}
function toolFor(p: ActorState, resource: ResourceDefinition) {
  return [
    ...p.inventory.map((i) => ITEMS[i.itemId]),
    ...Object.values(p.equipment).map((id) => ITEMS[id!]),
  ]
    .filter(
      (i) =>
        i?.tool === resource.tool &&
        levelForXp(p.skills[resource.skill]) >= (i.level ?? 1),
    )
    .sort((a, b) => (b.tier ?? 1) - (a.tier ?? 1))[0];
}
function gatherProblem(p: ActorState, r: ResourceDefinition): string | null {
  if (levelForXp(p.skills[r.skill]) < r.level)
    return `${r.name} requires ${r.skill} level ${r.level}.`;
  if (!toolFor(p, r)) return `You need a usable ${r.tool}.`;
  if (r.bait && !itemCount(p.inventory, r.bait)) return `You need ${r.bait}.`;
  return null;
}
function craftProblem(p: ActorState, id: string, inputs = true) {
  const recipe = RECIPES[id];
  if (!recipe) return "Unknown recipe.";
  if (levelForXp(p.skills[recipe.skill]) < recipe.level)
    return `Requires ${recipe.skill} level ${recipe.level}.`;
  if (recipe.tool && !itemCount(p.inventory, recipe.tool))
    return `You need a ${recipe.tool}.`;
  if (
    inputs &&
    recipe.inputs.some((i) => itemCount(p.inventory, i.itemId) < i.quantity)
  )
    return "Missing recipe inputs.";
  return null;
}
function bankOutput(s: RpgState, p: ActorState) {
  const bank = p.id === 0 ? s.bank : p.bank;
  for (const stack of [...p.inventory]) {
    if (
      ITEMS[stack.itemId].kind === "resource" ||
      ITEMS[stack.itemId].kind === "food"
    ) {
      const quantity =
        stack.itemId === "cooked-shrimp" && p.id === 0
          ? Math.max(0, stack.quantity - 6)
          : stack.quantity;
      if (quantity && addItems(bank, stack.itemId, quantity, Infinity))
        removeItems(p.inventory, stack.itemId, quantity);
    }
  }
  if (p.id === 0) {
    // Spare upgrades can otherwise leave too little room to assemble multi-input recipes.
    // Keep one best usable working tool per type, counting equipped tools; store every surplus safely.
    const candidates = [
      ...Object.values(p.equipment).map((id) => ({
        item: ITEMS[id!],
        carried: false,
      })),
      ...p.inventory.map((stack) => ({
        item: ITEMS[stack.itemId],
        carried: true,
      })),
    ]
      .filter(
        ({ item }) =>
          item.tool &&
          (!item.skill ||
            levelForXp(p.skills[item.skill]) >= (item.level ?? 1)),
      )
      .sort(
        (a, b) =>
          (b.item.tier ?? 1) - (a.item.tier ?? 1) ||
          b.item.value - a.item.value ||
          Number(a.carried) - Number(b.carried) ||
          a.item.id.localeCompare(b.item.id),
      );
    const kept = new Map<string, string>();
    const selected = new Set<string>();
    for (const { item, carried } of candidates) {
      if (selected.has(item.tool!)) continue;
      selected.add(item.tool!);
      if (carried) kept.set(item.tool!, item.id);
    }
    const combatWeapon = p.inventory
      .map((stack) => ITEMS[stack.itemId])
      .filter(
        (item) =>
          item.kind === "gear" &&
          item.slot === "weapon" &&
          levelForXp(p.skills.attack) >= (item.attackLevel ?? 1),
      )
      .sort(
        (a, b) => (b.attack ?? 0) - (a.attack ?? 0) || a.id.localeCompare(b.id),
      )[0]?.id;
    for (const stack of [...p.inventory]) {
      const item = ITEMS[stack.itemId];
      if (!item.tool && item.kind !== "gear") continue;
      // Preserve ordinary combat loadouts; only store spare gear when it crowds out recipe workspace.
      if (item.kind === "gear" && inventorySlots(p.inventory) <= 14) continue;
      const retain =
        (item.tool && kept.get(item.tool) === item.id) ||
        item.id === combatWeapon
          ? 1
          : 0;
      const quantity = stack.quantity - retain;
      if (quantity > 0 && addItems(bank, stack.itemId, quantity, Infinity))
        removeItems(p.inventory, stack.itemId, quantity);
    }
  }
}
function bankDetour(s: RpgState, p: ActorState) {
  const bank =
    p.action?.kind === "bank" && p.action.targetId
      ? objectById(p.action.targetId)
      : nearest(p, (o) => o.kind === "bank");
  if (!bank) return;
  p.action = { kind: "bank", targetId: bank.id, duration: 1, remaining: 1 };
  if (route(s, p, bank)) {
    bankOutput(s, p);
    p.action = null;
    p.activity = "Stored gathered supplies in the personal bank";
  }
}
function finish(s: RpgState, message?: string) {
  s.control.active = null;
  s.control.source = null;
  s.player.action = null;
  s.player.path = [];
  s.control.thinkingUntil = s.tick + 1;
  if (message) {
    s.control.reason = message;
    s.player.activity = message;
  }
}
function pulse(
  s: RpgState,
  p: ActorState,
  kind: "gather" | "craft",
  id: string,
  ticks: number,
  target: WorldObject,
): boolean {
  if (
    p.action?.kind !== kind ||
    (kind === "gather" ? p.action.targetId !== id : p.action.recipeId !== id)
  ) {
    p.action = {
      kind,
      ...(kind === "gather" ? { targetId: id } : { recipeId: id }),
      duration: ticks,
      remaining: ticks,
    };
    if (p.id === 0) appendSimulationEffect(s, { kind: "action-start", actorId: "player", position: p.position,
      targetId: target.id, targetPosition: target.position, actionKind: kind });
  }
  p.action.remaining--;
  if (p.action.remaining > 0) return false;
  p.action = null;
  return true;
}
function gather(s: RpgState, p: ActorState, target: WorldObject): boolean {
  const r = RESOURCES[target.resourceId!];
  if (gatherProblem(p, r)) {
    p.action = null;
    return false;
  }
  if (p.action?.kind === "bank") {
    bankDetour(s, p);
    return false;
  }
  if (inventorySlots(p.inventory) === 28) {
    if (
      p.inventory.some(
        (i) =>
          ITEMS[i.itemId].kind === "resource" ||
          (ITEMS[i.itemId].kind === "food" &&
            (i.itemId !== "cooked-shrimp" || i.quantity > 6)),
      )
    )
      bankDetour(s, p);
    else {
      p.action = null;
      p.activity = "Backpack full (28/28); free a slot";
    }
    return false;
  }
  if (!s.resources[target.id].available) {
    p.action = null;
    p.activity = "Waiting for the resource to recover";
    return false;
  }
  if (!route(s, p, target)) return false;
  const tool = toolFor(p, r)!;
  const duration =
    r.skill === "mining" ? r.ticks - ((tool.tier ?? 1) - 1) : r.ticks;
  p.activity = `Gathering ${r.name}`;
  if (!pulse(s, p, "gather", target.id, duration, target)) return false;
  if (p.id !== 0)
    p.action = {
      kind: "gather",
      targetId: target.id,
      duration,
      remaining: duration,
    };
  const chance =
    r.skill === "woodcutting"
      ? Math.min(
          1,
          r.success * (1 + ((tool.tier ?? 1) - 1) * 0.5) +
            (levelForXp(p.skills.woodcutting) - r.level) * 0.005,
        )
      : r.success;
  if (random(s) >= chance) {
    if (p.id === 0) appendSimulationEffect(s, { kind: "action-result", actorId: "player", position: p.position,
      targetId: target.id, targetPosition: target.position, actionKind: "gather", success: false, amount: 0 });
    return false;
  }
  if (
    !exchangeItems(
      p.inventory,
      r.bait ? [{ itemId: r.bait, quantity: 1 }] : [],
      [{ itemId: r.itemId, quantity: 1 }],
    )
  )
    {
      if (p.id === 0) appendSimulationEffect(s, { kind: "action-result", actorId: "player", position: p.position,
        targetId: target.id, targetPosition: target.position, actionKind: "gather", success: false, amount: 0 });
      return false;
    }
  if (p.id === 0) appendSimulationEffect(s, { kind: "action-result", actorId: "player", position: p.position,
    targetId: target.id, targetPosition: target.position, actionKind: "gather", success: true, amount: 1 });
  const xp = award(s, p, r.skill, r.xp);
  reward(s, p, [{ itemId: r.itemId, quantity: 1 }], { [r.skill]: xp });
  p.completed++;
  if (random(s) < r.depletion)
    s.resources[target.id] = {
      objectId: target.id,
      available: false,
      respawnAt: s.tick + r.respawnTicks,
    };
  return true;
}
function resourceFor(
  s: RpgState,
  p: ActorState,
  skill: string,
  available = true,
) {
  // Rank cheaply first. Only the selected destination receives a route search.
  const allowed = new Set(
    Object.values(RESOURCES)
      .filter((r) => r.skill === skill && !gatherProblem(p, r))
      .map((r) => r.id),
  );
  let best: WorldObject | undefined,
    bestScore = -1;
  for (const o of RESOURCE_OBJECTS) {
    if (
      !allowed.has(o.resourceId!) ||
      (available && !s.resources[o.id].available)
    )
      continue;
    const r = RESOURCES[o.resourceId!],
      score = r.xp / r.ticks / (1 + distance(p.position, o.position) / 15);
    if (score > bestScore) {
      best = o;
      bestScore = score;
    }
  }
  return best;
}
function equip(s: RpgState, id: string): boolean {
  const p = s.player,
    item = ITEMS[id];
  if (item?.ammoTier) {
    const quantity = itemCount(p.inventory, id);
    if (!quantity || (p.ammo?.itemId === id && p.ammo.quantity + quantity > 2_000_000_000)) return false;
    const old = p.ammo;
    if (!exchangeItems(p.inventory, [{ itemId: id, quantity }], old && old.itemId !== id ? [old] : [])) return false;
    p.ammo = { itemId: id, quantity: quantity + (old?.itemId === id ? old.quantity : 0) }; return true;
  }
  if (
    !item?.slot ||
    !itemCount(p.inventory, id) ||
    levelForXp(p.skills.attack) < (item.attackLevel ?? 1) ||
    levelForXp(p.skills.defence) < (item.defenceLevel ?? 1) ||
    levelForXp(p.skills.ranged) < (item.rangedLevel ?? 1) ||
    (item.slot === "shield" && ITEMS[p.equipment.weapon ?? ""]?.twoHanded) ||
    (item.skill && levelForXp(p.skills[item.skill]) < (item.level ?? 1))
  )
    return false;
  const old = p.equipment[item.slot];
  if (
    !exchangeItems(
      p.inventory,
      [{ itemId: id, quantity: 1 }],
      [...(old ? [{ itemId: old, quantity: 1 }] : []),
        ...(item.twoHanded && p.equipment.shield ? [{ itemId: p.equipment.shield, quantity: 1 }] : [])],
    )
  )
    return false;
  p.equipment[item.slot] = id;
  if (item.twoHanded) delete p.equipment.shield;
  if (item.slot === "weapon") s.control.style = item.weaponType === "bow" ? "accurate" :
    ["accurate", "rapid", "longrange"].includes(s.control.style) ? "attack" : s.control.style;
  return true;
}
export function attackDuration(p: ActorState, style: RpgState["control"]["style"]) {
  const weapon = ITEMS[p.equipment.weapon ?? ""];
  return weapon?.weaponType === "bow" ? style === "rapid" ? 3 : 4 : weapon?.attackTicks ?? 4;
}
export const maxHealth = (p: ActorState) => levelForXp(p.skills.hitpoints);
export function stationAvailable(s: RpgState, o: WorldObject) {
  return (
    !(
      o.kind === "anvil" &&
      o.id !== "oakrest-anvil" &&
      !s.quests.forge?.complete
    ) && !(o.id === "briarford-range" && !s.quests.supper?.complete)
  );
}
function award(s: RpgState, p: ActorState, skill: SkillId, xp: number) {
  const before = p.skills[skill], previousLevel = levelForXp(before);
  p.skills[skill] = Math.min(2_000_000_000, p.skills[skill] + xp);
  const level = levelForXp(p.skills[skill]);
  if (p.id === 0 && level > previousLevel)
    appendGameMessage(s, "event", `level-${skill}-${level}`, `${skillName(skill)} reached level ${level}.`);
  return p.skills[skill] - before;
}
function reward(
  s: RpgState,
  p: ActorState,
  items: ItemStack[],
  xp: Partial<Record<SkillId, number>>,
) {
  if (p.id !== 0) return;
  const gains = Object.fromEntries(
    Object.entries(xp).filter(([, amount]) => amount > 0),
  );
  if (!items.length && !Object.keys(gains).length) return;
  const log = (s.rewards ??= []);
  const sequence = log.length ? Number(log[log.length - 1].id.slice(7)) + 1 : 1;
  log.push({
    id: `reward-${sequence}`,
    tick: s.tick,
    items: items.map((i) => ({ ...i })),
    xp: gains,
  });
  if (log.length > 32) log.splice(0, log.length - 32);
}
function food(s: RpgState, id: string) {
  const item = ITEMS[id],
    p = s.player;
  if (
    !item?.heals ||
    s.tick < s.control.eatReadyAt ||
    !removeItems(p.inventory, id, 1)
  )
    return false;
  s.control.eatReadyAt = s.tick + 3;
  p.health = Math.min(maxHealth(p), p.health + item.heals);
  p.activity = `Eating ${item.name}`;
  return true;
}
function journal(s: RpgState, message: string) {
  s.journal.push(message);
  s.journal = s.journal.slice(-60);
}
function discover(s: RpgState, id: string, name: string) {
  if (s.control.visited.includes(id)) return;
  s.control.visited.push(id);
  appendGameMessage(s, "event", `discovery-${id}`, `Discovered ${name}.`);
}
function defeat(s: RpgState, enemy: EnemyState) {
  const p = s.player,
    items = s.grave?.items.map((i) => ({ ...i })) ?? [];
  appendSimulationEffect(s, { kind: "defeat", actorId: enemy.id, position: enemy.position,
    targetId: "player", targetPosition: p.position, actionKind: "fight", success: true });
  appendGameMessage(s, "event", "defeat-player", `Alden was defeated by ${ENEMIES[enemy.definitionId].name}. Equipped gear and experience are safe; recover the backpack.`);
  for (const i of p.inventory) addItems(items, i.itemId, i.quantity, Infinity);
  s.grave = items.length
    ? { position: { ...p.position }, items, attempts: 0, retryAt: s.tick + 10 }
    : null;
  p.inventory = [];
  p.position = { ...WORLD.spawns[0] };
  p.previousPosition = { ...p.position };
  p.movement = null;
  p.health = maxHealth(p);
  p.runEnergy = 10000;
  s.control.queue = [];
  delete s.control.directOrderIndex;
  finish(
    s,
    "Defeated: equipped gear and experience are safe. Recover your backpack.",
  );
  journal(
    s,
    "Alden returned to Oakrest. All backpack belongings wait in a recoverable grave.",
  );
}
function addLoot(s: RpgState, e: EnemyState) {
  const id = `loot-${e.id}`;
  let drop = s.drops.find((d) => d.id === id);
  if (!drop) {
    drop = { id, position: { ...e.position }, items: [], expiresAt: 0 };
    s.drops.push(drop);
  }
  for (const i of ENEMIES[e.definitionId].loot)
    addItems(drop.items, i.itemId, i.quantity, Infinity);
  const road = s.quests.road;
  if (e.definitionId === "bandit" && road.accepted && !road.complete)
    road.kills = Math.min(3, road.kills + 1);
  for (const [id, q] of Object.entries(QUESTS)) {
    const progress = s.quests[id];
    if (progress.accepted && !progress.complete) for (const stage of q.stages ?? [])
      if (stage.kind === "kill" && stage.enemyId === e.definitionId)
        (progress.counters ??= {})[stage.id] = Math.min(stage.quantity ?? 1, (progress.counters?.[stage.id] ?? 0) + 1);
  }
}
function attackRoute(s: RpgState, p: ActorState, e: EnemyState): TilePosition[] | null {
  const weapon = ITEMS[p.equipment.weapon ?? ""], bow = weapon?.weaponType === "bow";
  const reach = bow ? s.control.style === "longrange" ? 9 : weapon.range ?? 7 : 1;
  if (distance(p.position, e.position) <= reach && lineOfSight(s, p.position, e.position)) return [];
  if (!bow) {
    const path = findPath(p.position, e.position, worldForState(s));
    return path ? path.length > 1 ? path.slice(0, -1) : path : null;
  }
  const candidates: TilePosition[] = [];
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const next = { ...e.position, x: e.position.x + dx, y: e.position.y + dy };
    if ((dx || dy) && isWalkable(next, worldForState(s)) && lineOfSight(s, next, e.position)) candidates.push(next);
  }
  candidates.sort((a, b) => distance(a, p.position) - distance(b, p.position) || a.y - b.y || a.x - b.x);
  for (const next of candidates) { const path = findPath(p.position, next, worldForState(s)); if (path) return path; }
  return null;
}
function actorApproachRoute(s: RpgState, actorId: number): TilePosition[] | null {
  const target = s.npcs.find((actor) => actor.id === actorId);
  if (!target || target.health <= 0) return null;
  if (distance(s.player.position, target.position) <= 1 && lineOfSight(s, s.player.position, target.position)) return [];
  const path = findPath(s.player.position, target.position, worldForState(s));
  return path ? path.slice(0, -1) : null;
}
function fight(s: RpgState, id: string) {
  const p = s.player,
    e = s.enemies.find((e) => e.id === id);
  if (!e || !e.health) {
    finish(s, "That enemy is not currently present");
    return;
  }
  if (s.tick < s.control.eatReadyAt) {
    p.action = null;
    p.activity = "Recovering from the meal before attacking";
    return;
  }
  const weapon = ITEMS[p.equipment.weapon ?? ""], bow = weapon?.weaponType === "bow";
  if (bow && !p.ammo) { finish(s, "Out of arrows. Load carried or banked ammunition before shooting."); return; }
  const reach = bow ? s.control.style === "longrange" ? 9 : weapon.range ?? 7 : 1;
  if (distance(p.position, e.position) > reach || !lineOfSight(s, p.position, e.position)) {
    const path = attackRoute(s, p, e);
    if (!path) {
      finish(s, "Cannot reach the enemy");
      return;
    }
    p.path = path;
    p.action = null;
    p.activity = `Approaching ${ENEMIES[e.definitionId].name}`;
    return;
  }
  const duration = attackDuration(p, s.control.style);
  if (p.action?.kind !== "fight" || p.action.targetId !== id) {
    p.action = { kind: "fight", targetId: id, duration, remaining: duration };
    appendSimulationEffect(s, { kind: "action-start", actorId: "player", position: p.position,
      targetId: e.id, targetPosition: e.position, actionKind: "fight" });
  }
  p.activity = `Fighting ${ENEMIES[e.definitionId].name} · ${s.control.style}`;
  if (--p.action.remaining > 0) return;
  p.action = null;
  let ammunition: typeof ITEMS[string] | undefined;
  if (bow) {
    ammunition = ITEMS[p.ammo!.itemId];
    const arrow = p.ammo!.itemId;
    if (--p.ammo!.quantity === 0) p.ammo = null;
    if (random(s) < .8) {
      const dropId = `arrows-${e.id}`;
      let drop = s.drops.find((entry) => entry.id === dropId);
      if (!drop) { drop = { id: dropId, position: { ...e.position }, items: [], expiresAt: 0 }; s.drops.push(drop); }
      addItems(drop.items, arrow, 1, Infinity);
    }
  }
  const attackingSkill = bow ? "ranged" : "attack";
  const accuracy = bow ? Object.values(p.equipment).reduce((n, id) => n + (ITEMS[id!]?.rangedAttack ?? 0), 0) +
    (s.control.style === "accurate" ? 3 : 0) : weapon?.attack ?? 0;
  const chance = Math.min(
    0.95,
    Math.max(
      0.2,
      (levelForXp(p.skills[attackingSkill]) + accuracy + 8) /
        (2 * (ENEMIES[e.definitionId].defence + 8)),
    ),
  );
  let damage = 0;
  if (random(s) < chance) {
    const maximum =
      1 +
      Math.floor(
        ((levelForXp(p.skills[bow ? "ranged" : "strength"]) + 8) *
          ((bow ? (weapon.rangedStrength ?? 0) + (ammunition?.rangedStrength ?? 0) : weapon?.strength ?? 0) + 64)) /
          640,
      );
    damage = Math.min(e.health, 1 + Math.floor(random(s) * maximum));
    e.health -= damage;
    const skill: SkillId = bow ? "ranged" : ["attack", "strength", "defence"].includes(s.control.style) ? s.control.style as SkillId : "attack";
    const xp = award(s, p, skill, damage * (bow && s.control.style === "longrange" ? 20 : 40));
    const defenceXp = bow && s.control.style === "longrange" ? award(s, p, "defence", damage * 20) : 0;
    const hpXp = award(s, p, "hitpoints", Math.round((damage * 40) / 3));
    reward(s, p, [], { [skill]: xp, ...(defenceXp ? { defence: defenceXp } : {}), hitpoints: hpXp });
  }
  if (bow) appendSimulationEffect(s, { kind: "projectile", actorId: "player", position: p.position,
    targetId: e.id, targetPosition: e.position, actionKind: "fight", success: damage > 0, amount: damage });
  appendSimulationEffect(s, { kind: "hit", actorId: "player", position: p.position,
    targetId: e.id, targetPosition: e.position, actionKind: "fight", success: damage > 0, amount: damage });
  if (e.health === 0) {
    appendSimulationEffect(s, { kind: "defeat", actorId: "player", position: p.position,
      targetId: e.id, targetPosition: e.position, actionKind: "fight", success: true });
    appendGameMessage(s, "event", `defeat-${e.definitionId}`, `Defeated ${ENEMIES[e.definitionId].name}.`);
    e.respawnAt = s.tick + ENEMIES[e.definitionId].respawnTicks;
    e.cooldown = 0;
    e.engagedUntil = 0;
    p.completed++;
    addLoot(s, e);
    finish(
      s,
      `Defeated ${ENEMIES[e.definitionId].name}; supplies remain on the ground`,
    );
  }
}
function enemyStep(s: RpgState) {
  const p = s.player,
    w = worldForState(s);
  for (const e of s.enemies) {
    const d = ENEMIES[e.definitionId];
    if (e.health === 0) {
      if (s.tick >= e.respawnAt) {
        e.health = d.health;
        e.position = { ...e.home };
        e.respawnAt = 0;
        e.cooldown = 0;
        e.engagedUntil = 0;
      }
      continue;
    }
    if (e.cooldown > 0) e.cooldown--;
    const targeted =
      s.control.active?.type === "attack" && s.control.active.enemyId === e.id;
    if (
      (targeted && distance(p.position, e.home) <= 8) ||
      (e.engagedUntil > s.tick && distance(p.position, e.position) <= 4)
    )
      e.engagedUntil = s.tick + 10;
    const chase =
      distance(p.position, e.home) <= 8 &&
      (targeted ||
        e.engagedUntil > s.tick ||
        (d.aggressive && distance(p.position, e.position) <= 4));
    if (!chase) {
      e.engagedUntil = 0;
      if (distance(e.position, e.home) > 0) {
        const next = findPath(e.position, e.home, w)?.[0];
        if (next) e.position = { ...next };
      }
      if (s.tick % 20 === 0) e.health = Math.min(d.health, e.health + 1);
      continue;
    }
    const reach = d.combatType === "ranged" ? d.range ?? 6 : 1;
    if (distance(e.position, p.position) > reach || !lineOfSight(s, e.position, p.position)) {
      const dx = Math.sign(p.position.x - e.position.x),
        dy = Math.sign(p.position.y - e.position.y);
      const choices = [
        { ...e.position, x: e.position.x + dx, y: e.position.y + dy },
        { ...e.position, x: e.position.x + dx },
        { ...e.position, y: e.position.y + dy },
      ];
      const next = choices.find(
        (n) => distance(n, e.home) <= 8 && canStep(e.position, n, w),
      );
      if (next) e.position = next;
      continue;
    }
    if (e.cooldown) continue;
    e.cooldown = d.attackTicks;
    appendSimulationEffect(s, { kind: "action-start", actorId: e.id, position: e.position,
      targetId: "player", targetPosition: p.position, actionKind: "fight" });
    const armour = Object.values(p.equipment).reduce(
      (n, id) => n + (ITEMS[id!]?.defence ?? 0),
      0,
    );
    const chance = Math.min(
      0.8,
      Math.max(
        0.08,
        (d.attack + 8) / (2 * (levelForXp(p.skills.defence) + 8 + armour)),
      ),
    );
    const before = p.health;
    if (random(s) < chance)
      p.health = Math.max(0, p.health - (1 + Math.floor(random(s) * d.maxHit)));
    const damage = before - p.health;
    if (d.combatType === "ranged") appendSimulationEffect(s, { kind: "projectile", actorId: e.id, position: e.position,
      targetId: "player", targetPosition: p.position, actionKind: "fight", success: damage > 0, amount: damage });
    appendSimulationEffect(s, { kind: "hit", actorId: e.id, position: e.position,
      targetId: "player", targetPosition: p.position, actionKind: "fight", success: damage > 0, amount: damage });
    if (!p.health) {
      defeat(s, e);
      break;
    }
  }
}
function lineOfSight(s: RpgState, a: TilePosition, b: TilePosition) {
  const length = distance(a, b);
  let prior = a;
  for (let i = 1; i <= length; i++) {
    const next = {
      ...a,
      x: Math.round(a.x + ((b.x - a.x) * i) / length),
      y: Math.round(a.y + ((b.y - a.y) * i) / length),
    };
    if (!canStep(prior, next, worldForState(s))) return false;
    prior = next;
  }
  return true;
}
function takeStacks(target: ItemStack[], source: ItemStack[]) {
  for (const stack of [...source]) {
    const amount = ITEMS[stack.itemId].stackable
      ? stack.quantity
      : Math.min(stack.quantity, 28 - inventorySlots(target));
    if (amount > 0 && addItems(target, stack.itemId, amount))
      removeItems(source, stack.itemId, amount);
  }
}
function recoveryRoute(s: RpgState): TilePosition[] | null {
  const grave = s.grave, p = s.player;
  if (!grave) return null;
  if (distance(p.position, grave.position) <= 7 && lineOfSight(s, p.position, grave.position)) return [];
  const candidates: TilePosition[] = [];
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
    const point = { ...grave.position, x: grave.position.x + dx, y: grave.position.y + dy };
    if (isWalkable(point, worldForState(s)) && lineOfSight(s, point, grave.position) &&
      !s.enemies.some((e) => e.health && ENEMIES[e.definitionId].aggressive && distance(point, e.home) <= 5)) candidates.push(point);
  }
  candidates.sort((a, b) => distance(p.position, a) - distance(p.position, b) || a.y - b.y || a.x - b.x);
  for (const point of candidates.slice(0, 8)) {
    const path = findPath(p.position, point, worldForState(s));
    if (path && !path.some((next) => s.enemies.some((e) => e.health && ENEMIES[e.definitionId].aggressive && distance(next, e.home) <= 3))) return path;
  }
  return null;
}
function recover(s: RpgState) {
  const grave = s.grave,
    p = s.player;
  if (!grave) {
    finish(s, "No backpack grave remains");
    return;
  }
  if (
    distance(p.position, grave.position) <= 7 &&
    lineOfSight(s, p.position, grave.position)
  ) {
    const previousQuantity = grave.items.reduce((sum, item) => sum + item.quantity, 0);
    takeStacks(p.inventory, grave.items);
    if (!grave.items.length) {
      s.grave = null;
      appendGameMessage(s, "event", "recovery-complete", "Recovered every backpack belonging.");
      finish(s, "Recovered every backpack belonging");
    } else {
      if (grave.items.reduce((sum, item) => sum + item.quantity, 0) < previousQuantity)
        appendGameMessage(s, "event", "recovery-partial", "Recovered what fits. Remaining belongings are safe at the grave.");
      finish(
        s,
        "Recovered what fits; remaining belongings stay safely in the grave",
      );
    }
    return;
  }
  const path = recoveryRoute(s);
  if (path) {
    p.path = path;
    p.activity = "Approaching the grave from a safe distance";
    return;
  }
  grave.attempts++;
  grave.retryAt = s.tick + Math.min(200, 20 * grave.attempts);
  appendGameMessage(s, "event", "recovery-blocked", "No safe recovery route yet. The backpack remains safely at the grave.");
  finish(s, "No safe recovery route yet; waiting before trying again");
}
export function currentQuestStage(s: RpgState, id: string): QuestStage | undefined {
  const progress = s.quests[id];
  return progress && !progress.complete ? QUESTS[id]?.stages?.find((stage) => stage.id === progress.stageId) : undefined;
}
export function normalizeQuestProgress(s: RpgState) {
  for (const [id, q] of Object.entries(QUESTS)) {
    const p = s.quests[id] ??= { accepted: false, complete: false, kills: 0 };
    p.stageId ??= p.complete ? "complete" : p.accepted && q.stages?.some((stage) => stage.id === "supplies") ? "supplies" : q.stages?.[0]?.id;
    p.counters ??= {}; p.choices ??= {};
    if (id === "road" && p.kills) p.counters.outlaws ??= p.kills;
  }
  return s;
}
/** Explicit migration repair for changed terrain. Keeps every item/XP/quest and replans routes. */
export function repairRpgPositions(s: RpgState) {
  const world = worldForState(s);
  const repair = (p: TilePosition) => {
    if (isWalkable(p, world)) return { ...p };
    for (let radius = 1; radius < 64; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const candidate = tile(p.x + dx, p.y + dy);
      if (isWalkable(candidate, world)) return candidate;
    }
    return { ...WORLD.spawns[0] };
  };
  for (const actor of [s.player, ...s.npcs]) {
    const position = repair(actor.position);
    let prior = position;
    const legalPath = actor.path.every((next) => { const legal = canStep(prior, next, world); prior = next; return legal; });
    const moved = !samePosition(position, actor.position);
    if (moved || !legalPath) { actor.position = position; actor.previousPosition = { ...position }; actor.path = []; actor.action = null; actor.movement = null; }
    else if (!isWalkable(actor.previousPosition, world)) { actor.previousPosition = { ...position }; actor.movement = null; }
  }
  for (const e of s.enemies) { e.home = { ...ENEMY_SPAWNS.find((spawn) => spawn.id === e.id)!.position }; e.position = repair(e.position); }
  for (const drop of s.drops) drop.position = repair(drop.position);
  if (s.grave) s.grave.position = repair(s.grave.position);
  const direct = s.control.directOrderIndex === undefined ? undefined : s.control.queue[s.control.directOrderIndex];
  s.control.queue = s.control.queue.filter((order) => validOrder(order, world));
  const directIndex = direct ? s.control.queue.indexOf(direct) : -1;
  if (directIndex >= 0) s.control.directOrderIndex = directIndex; else delete s.control.directOrderIndex;
  if (s.control.active && !validOrder(s.control.active, world)) { s.control.active = null; s.control.source = null; }
  s.control.thinkingUntil = s.tick + 1;
  return s;
}
function gateOccupied(s: RpgState, target: WorldObject) {
  return [s.player.position, ...s.npcs.map((actor) => actor.position), ...s.enemies.map((enemy) => enemy.position),
    ...s.drops.map((drop) => drop.position), ...(s.grave ? [s.grave.position] : [])].some((position) => samePosition(position, target.position));
}
function invalidateChangedRoutes(s: RpgState) {
  const world = worldForState(s);
  for (const actor of [s.player, ...s.npcs]) {
    const trace = actor.movement;
    if (!isWalkable(actor.previousPosition, world) || trace && trace.tiles.some((point, index) =>
      !isWalkable(point, world) || index > 0 && !canStep(trace.tiles[index - 1], point, world))) {
      actor.movement = null; actor.previousPosition = { ...actor.position };
    }
    let prior = actor.position;
    if (!actor.path.every((next) => { const legal = canStep(prior, next, world); prior = next; return legal; })) {
      actor.path = []; actor.action = null;
    }
  }
}
function advanceStage(s: RpgState, id: string) {
  const q = QUESTS[id], progress = s.quests[id], stage = currentQuestStage(s, id);
  if (!stage) return;
  progress.stageId = stage.next ?? q.stages?.[(q.stages?.findIndex((candidate) => candidate.id === stage.id) ?? -1) + 1]?.id ?? "ready";
  appendGameMessage(s, "event", `quest-stage-${id}-${stage.id}`, `${q.name}: completed — ${stage.description}`);
  if (s.dialogue?.questId === id) s.dialogue = null;
  s.control.steps = goalSteps(s, { id: `quest-${id}`, title: q.name, kind: "quest", questId: id });
}
function chooseDialogue(s: RpgState, choiceId: string) {
  const dialogue = s.dialogue;
  if (!dialogue) return false;
  const stage = currentQuestStage(s, dialogue.questId), choice = stage?.choices?.find((candidate) => candidate.id === choiceId);
  if (!choice || stage?.kind !== "choice") return false;
  const p = s.quests[dialogue.questId];
  (p.choices ??= {})[stage.id] = choice.id; p.stageId = choice.next;
  appendGameMessage(s, "dialogue", `quest-choice-${dialogue.questId}-${stage.id}-${choice.id}`, `Alden: ${choice.label}.`);
  appendGameMessage(s, "event", `quest-stage-${dialogue.questId}-${stage.id}`, `${QUESTS[dialogue.questId].name}: chose ${choice.label}.`);
  journal(s, `${QUESTS[dialogue.questId].name}: ${choice.label}`); s.dialogue = null;
  return true;
}
function questInteraction(s: RpgState, object: WorldObject, verb: "talk" | "inspect" | "use" | "practice") {
  const p = s.player;
  if (!route(s, p, object)) return;
  for (const [id, progress] of Object.entries(s.quests)) {
    const stage = currentQuestStage(s, id);
    if (!progress.accepted || progress.complete || stage?.targetId !== object.id) continue;
    const legal = stage.kind === "talk" && verb === "talk" || stage.kind === "inspect" && verb === "inspect" ||
      stage.kind === "visit" || stage.kind === "choice" && verb === "talk" || stage.kind === "practice" && verb === "practice" ||
      stage.kind === "deliver" && (verb === "talk" || verb === "use");
    if (!legal) continue;
    if (stage.kind === "choice") {
      appendGameMessage(s, "dialogue", `quest-dialogue-${id}-${stage.id}`, `${object.name}: ${stage.description}`);
      s.dialogue ??= { id: `${id}-${stage.id}-${s.tick}`, questId: id, targetId: object.id, text: stage.description,
        choices: stage.choices!.map(({ id: choice, label }) => ({ id: choice, label })), expiresAt: s.tick + 34 };
      finish(s, stage.description); return;
    }
    if (stage.kind === "deliver") {
      const outputs = id === "bowyer" && stage.id === "commission"
        ? [{ itemId: "training-bow", quantity: 1 }, { itemId: "training-arrow", quantity: 6 }] : [];
      if (!exchangeItems(p.inventory, stage.items ?? [], outputs)) {
        finish(s, "Bring the requested supplies and make room for the commission."); return;
      }
      reward(s, p, outputs, {});
      appendGameMessage(s, "dialogue", `quest-dialogue-${id}-${stage.id}`, `${object.name}: I received the requested supplies. Thank you, Alden.`);
      (progress.counters ??= {})[`delivered-${stage.id}`] = 1;
    }
    if (stage.kind === "practice") {
      if (!itemCount(p.inventory, "training-bow") || !itemCount(p.inventory, "training-arrow")) {
        finish(s, "Bring the commissioned practice bow and blunt arrows."); return;
      }
      if (p.action?.kind !== "practice" || p.action.targetId !== object.id) {
        p.action = { kind: "practice", targetId: object.id, duration: 4, remaining: 4 };
        appendSimulationEffect(s, { kind: "action-start", actorId: "player", position: p.position,
          targetId: object.id, targetPosition: object.position, actionKind: "practice" });
      }
      p.activity = "Practising a measured bow shot";
      if (--p.action.remaining > 0) return;
      p.action = null; p.completed++;
      appendSimulationEffect(s, { kind: "action-result", actorId: "player", position: p.position,
        targetId: object.id, targetPosition: object.position, actionKind: "practice", success: true, amount: 1 });
      (progress.counters ??= {})[stage.id] = (progress.counters?.[stage.id] ?? 0) + 1;
      if (progress.counters[stage.id] < (stage.quantity ?? 1)) { finish(s, "Practice cycle complete"); return; }
    }
    if (stage.kind === "talk") appendGameMessage(s, "dialogue", `quest-dialogue-${id}-${stage.id}`,
      `${object.name}: Your work on ${QUESTS[id].name} is complete. Thank you, Alden.`);
    advanceStage(s, id); finish(s, stage.description);
    if (progress.stageId === "ready") questAction(s, id);
    return;
  }
  if (object.questId && verb === "talk") { questAction(s, object.questId); return; }
  finish(s, `${verb === "inspect" ? "Examined" : "Visited"} ${object.name}`);
}
function questAction(s: RpgState, id: string) {
  const q = QUESTS[id],
    state = s.quests[id],
    p = s.player;
  if (state.complete) {
    finish(s, "This quest is already complete");
    return;
  }
  if (!route(s, p, objectById(q.giverId)!)) return;
  if (!state.accepted) {
    if (q.prerequisites?.some((required) => !s.quests[required]?.complete)) {
      appendGameMessage(s, "dialogue", `quest-prerequisites-${id}`, `${objectById(q.giverId)!.name}: First complete ${q.prerequisites.map((required) => QUESTS[required].name).join(", ")}.`);
      finish(s, `First complete ${q.prerequisites.map((required) => QUESTS[required].name).join(", ")}.`); return;
    }
    state.accepted = true;
    appendGameMessage(s, "event", `quest-accepted-${id}`, `Accepted: ${q.name}.`);
    appendGameMessage(s, "dialogue", `quest-offer-${id}`, `${objectById(q.giverId)!.name}: ${q.description}`);
    journal(s, `Accepted: ${q.name}`);
    finish(s, `Accepted ${q.name}. Gather the requested supplies.`);
    return;
  }
  const stage = currentQuestStage(s, id);
  if (stage) {
    if (stage.targetId === q.giverId && ["talk", "deliver", "choice"].includes(stage.kind))
      questInteraction(s, objectById(q.giverId)!, "talk");
    else {
      appendGameMessage(s, "dialogue", `quest-reminder-${id}-${stage.id}`, `${objectById(q.giverId)!.name}: ${stage.description}`);
      finish(s, stage.description);
    }
    return;
  }
  const requirements = Object.entries(q.requirements ?? {}).every(
    ([skill, level]) => levelForXp(p.skills[skill as SkillId]) >= level!,
  );
  if (
    !requirements ||
    (!q.stages && q.items.some((i) => itemCount(p.inventory, i.itemId) < i.quantity)) ||
    (q.kills && state.kills < q.kills.quantity)
  ) {
    finish(s, "The quest requirements are not met yet");
    return;
  }
  if (
    !exchangeItems(p.inventory, q.stages ? [] : q.items, [
      { itemId: "coins", quantity: q.reward.coins },
      ...(id === "bowyer" ? [{ itemId: "shortbow", quantity: 1 }] : []),
      ...(id === "watch" ? [{ itemId: "watch-token", quantity: 1 }] : []),
    ])
  ) {
    finish(s, "Free backpack space for the quest reward");
    return;
  }
  state.complete = true;
  state.stageId = "complete";
  const gains: Partial<Record<SkillId, number>> = {};
  for (const [skill, xp] of Object.entries(q.reward.xp))
    gains[skill as SkillId] = award(s, p, skill as SkillId, xp!);
  reward(s, p, [{ itemId: "coins", quantity: q.reward.coins },
    ...(id === "bowyer" ? [{ itemId: "shortbow", quantity: 1 }] : []),
    ...(id === "watch" ? [{ itemId: "watch-token", quantity: 1 }] : [])], gains);
  journal(s, `Completed: ${q.name}. Unlocked ${q.reward.unlock}.`);
  appendGameMessage(s, "event", `quest-completed-${id}`, `Completed: ${q.name}. Unlocked ${q.reward.unlock.replaceAll("-", " ")}.`);
  finish(s, `Completed ${q.name}`);
}
function execute(s: RpgState, order: RpgOrder) {
  const p = s.player;
  if (order.type === "gate") {
    const target = objectById(order.objectId)!;
    if (!order.open && gateOccupied(s, target)) { finish(s, "Cannot close an occupied gate."); return; }
    if (!route(s, p, target)) return;
    if (s.gates[target.id] !== order.open) {
      s.gates = { ...s.gates, [target.id]: order.open }; invalidateChangedRoutes(s);
      appendGameMessage(s, "event", `gate-${target.id}-${order.open}`, `${order.open ? "Opened" : "Closed"} ${target.name}.`);
    }
    finish(s, `${target.name} is ${order.open ? "open" : "closed"}.`);
    return;
  }
  if (order.type === "talk-actor") {
    const npc = s.npcs.find((actor) => actor.id === order.actorId), path = actorApproachRoute(s, order.actorId);
    if (!npc || path === null) { finish(s, "That villager is no longer available or reachable."); return; }
    if (path.length) { p.path = path; p.activity = `Approaching ${npc.name}`; return; }
    const home = TOWNS.find((town) => town.id === npc.home)?.name ?? npc.home;
    const greetings: Record<string, string> = {
      woodcutter: `I’m a woodcutter from ${home}. The woods keep me busy.`,
      miner: `I’m a miner from ${home}. There is good stone to work nearby.`,
      fisher: `I’m a fisher from ${home}. I keep an eye on the river.`,
      smith: `I’m a smith from ${home}. A workshop always needs supplies.`,
    };
    appendGameMessage(s, "dialogue", `talk-actor-${npc.id}`, `${npc.name}: ${greetings[npc.role] ?? `I’m working for ${home}. Good to see you, Alden.`}`);
    finish(s, `Spoke with ${npc.name}.`);
    return;
  }
  if (order.type === "interact") {
    const target = objectById(order.objectId)!;
    if (target.kind === "sign" && order.verb === "inspect") {
      if (!route(s, p, target)) return;
      appendGameMessage(s, "dialogue", `sign-${target.id}`, `${target.name}: ${target.description ?? "An old village sign."}`);
      finish(s, `Read ${target.name}.`); return;
    }
    if (target.questId && order.verb === "talk" && !s.quests[target.questId].complete && s.control.source === "player") {
      const q = QUESTS[target.questId];
      s.control.goal = { id: `quest-${q.id}`, kind: "quest", questId: q.id, title: q.name };
      s.control.steps = goalSteps(s, s.control.goal); s.control.thought = null;
    }
    if (target.questId && !s.quests[target.questId].accepted && order.verb === "talk") {
      questAction(s, target.questId); return;
    }
    questInteraction(s, target, order.verb); return;
  }
  if (order.type === "travel-service") {
    const ferry = FERRIES[order.objectId];
    if (!s.quests[ferry.questId]?.complete) { finish(s, "Complete River Letters to open this ferry."); return; }
    if (!route(s, p, objectById(ferry.objectId)!)) return;
    if (!removeItems(p.inventory, "coins", ferry.cost)) { finish(s, "The ferry fare is five coins."); return; }
    p.position = { ...ferry.destination }; p.previousPosition = { ...p.position };
    p.movement = null;
    finish(s, ferry.name); return;
  }
  if (order.type === "attack") {
    fight(s, order.enemyId);
    return;
  }
  if (order.type === "eat") {
    if (s.tick < s.control.eatReadyAt) { p.action = null; p.activity = "Recovering before the next meal"; return; }
    const ate = food(s, order.itemId);
    finish(s, ate ? "Ate a healing meal" : "No edible food in the backpack");
    return;
  }
  if (order.type === "recover") {
    recover(s);
    return;
  }
  if (order.type === "quest") {
    // A direct visit is an intention to pursue this quest, including after accepting it.
    // Queued visits arrive here only when they actually start, so enqueueing stays side-effect free.
    if (s.control.source === "player" && !s.quests[order.questId].complete) {
      const q = QUESTS[order.questId];
      s.control.goal = {
        id: `quest-${q.id}`,
        kind: "quest",
        questId: q.id,
        title: q.name,
      };
      s.control.steps = goalSteps(s, s.control.goal);
      s.control.thought = null;
    }
    questAction(s, order.questId);
    return;
  }
  if (order.type === "loot") {
    const drop = s.drops.find((d) => d.id === order.dropId);
    if (!drop) {
      finish(s, "Those supplies have already been collected");
      return;
    }
    if (distance(p.position, drop.position) > 1) {
      p.path = findPath(p.position, drop.position, worldForState(s)) ?? [];
      p.activity = "Walking to the fallen supplies";
      return;
    }
    takeStacks(p.inventory, drop.items);
    if (!drop.items.length) s.drops = s.drops.filter((d) => d.id !== drop.id);
    finish(s, "Collected what fits; other supplies remain on the ground");
    return;
  }
  if (order.type === "move") {
    if (distance(p.position, order.position) === 0) {
      finish(s, "Reached the selected tile");
      return;
    }
    const path = findPath(p.position, order.position, worldForState(s));
    if (!path) finish(s, "The destination is unreachable");
    else {
      p.path = path;
      p.activity = "Traveling to the selected tile";
    }
    return;
  }
  if (order.type === "equip") {
    const ok = equip(s, order.itemId);
    finish(
      s,
      ok ? `Equipped ${ITEMS[order.itemId].name}` : "Cannot equip that item",
    );
    return;
  }
  if (order.type === "unequip") {
    const id = p.equipment[order.slot];
    if (id && addItems(p.inventory, id, 1)) {
      delete p.equipment[order.slot];
      finish(s, `Removed ${ITEMS[id].name}`);
    } else finish(s, "No equipped item or backpack space");
    return;
  }
  if (order.type === "unequip-ammo") {
    if (p.ammo && addItems(p.inventory, p.ammo.itemId, p.ammo.quantity)) {
      p.ammo = null; finish(s, "Returned equipped ammunition to the backpack.");
    } else finish(s, "No equipped arrows or backpack space.");
    return;
  }
  if (order.type === "gather") {
    let target = objectById(order.objectId)!;
    const problem = gatherProblem(p, RESOURCES[target.resourceId!]);
    if (problem) {
      finish(s, problem);
      return;
    }
    if (!s.resources[target.id].available && p.action?.kind !== "bank") {
      const alternative = nearest(
        p,
        (o) =>
          o.resourceId === target.resourceId && s.resources[o.id].available,
      );
      if (alternative) {
        target = alternative;
        order.objectId = target.id;
        p.action = null;
      }
    }
    if (gather(s, p, target)) {
      --order.quantity;
      const skillAchieved =
        s.control.source === "autonomous" &&
        s.control.goal?.kind === "skill" &&
        goalMet(s, s.control.goal);
      if (order.quantity === 0 || skillAchieved)
        finish(
          s,
          skillAchieved
            ? "Skill ambition achieved"
            : "Gathering batch complete",
        );
    }
    return;
  }
  if (order.type === "craft") {
    const problem = craftProblem(p, order.recipeId);
    if (problem) {
      finish(s, problem);
      return;
    }
    if (p.action?.kind === "bank") {
      bankDetour(s, p);
      return;
    }
    const recipe = RECIPES[order.recipeId],
      station = nearest(
        p,
        (o) => o.kind === recipe.station && stationAvailable(s, o),
      )!;
    if (!station) {
      finish(s, "Complete the local service quest to use that station");
      return;
    }
    if (!route(s, p, station)) return;
    p.activity = recipe.name;
    if (!pulse(s, p, "craft", recipe.id, recipe.ticks, station)) return;
    const probe = p.inventory.map((i) => ({ ...i }));
    if (!exchangeItems(probe, recipe.inputs, [recipe.output])) {
      appendSimulationEffect(s, { kind: "action-result", actorId: "player", position: p.position,
        targetId: station.id, targetPosition: station.position, actionKind: "craft", success: false, amount: 0 });
      bankDetour(s, p);
      return;
    }
    const chance =
      recipe.skill === "cooking"
        ? Math.min(
            1,
            recipe.success +
              (levelForXp(p.skills.cooking) - recipe.level) * 0.02,
          )
        : recipe.success;
    const success = random(s) < chance;
    const outputs = success
      ? [recipe.output]
      : recipe.skill === "cooking"
        ? [
            {
              itemId: recipe.output.itemId.replace("cooked-", "burnt-"),
              quantity: 1,
            },
          ]
        : [];
    if (!exchangeItems(p.inventory, recipe.inputs, outputs)) return;
    appendSimulationEffect(s, { kind: "action-result", actorId: "player", position: p.position,
      targetId: station.id, targetPosition: station.position, actionKind: "craft", success, amount: success ? recipe.output.quantity : 0 });
    if (success) {
      const xp = award(s, p, recipe.skill, recipe.xp);
      reward(s, p, outputs, { [recipe.skill]: xp });
    }
    p.completed++;
    if (--order.quantity === 0)
      finish(
        s,
        success
          ? "Crafting batch complete"
          : "The last attempt failed; its ingredients were consumed",
      );
    return;
  }
  if (order.type === "bank" || order.type === "withdraw") {
    const bank =
      order.type === "bank" && order.objectId
        ? objectById(order.objectId)!
        : nearest(p, (o) => o.kind === "bank")!;
    if (!route(s, p, bank)) return;
    if (order.type === "bank") {
      if (s.control.source === "autonomous" && !s.grave) bankOutput(s, p);
      else
        for (const i of [...p.inventory])
          if (addItems(s.bank, i.itemId, i.quantity, Infinity))
            removeItems(p.inventory, i.itemId, i.quantity);
      finish(s, "Deposited backpack into the connected personal bank");
    } else {
      let quantity = Math.min(order.quantity, itemCount(s.bank, order.itemId));
      if (!ITEMS[order.itemId].stackable)
        quantity = Math.min(quantity, 28 - inventorySlots(p.inventory));
      const staged = p.inventory.map((i) => ({ ...i }));
      if (
        quantity > 0 &&
        addItems(staged, order.itemId, quantity) &&
        removeItems(s.bank, order.itemId, quantity)
      ) {
        p.inventory = staged;
        finish(s, `Withdrew ${quantity} ${ITEMS[order.itemId].name}`);
      } else finish(s, "No banked items or backpack space available");
    }
    return;
  }
  if (order.type === "buy" || order.type === "sell") {
    const service = objectById(order.shopId)?.serviceId;
    if (service && !s.quests[service]?.complete) { finish(s, "Complete this service’s quest first."); return; }
    const shop = s.shops.find((x) => x.id === order.shopId)!,
      definition = SHOPS[order.shopId].stock[order.itemId],
      target = objectById(order.shopId)!;
    if (!route(s, p, target)) return;
    let quantity = order.quantity;
    if (order.type === "buy") {
      quantity = Math.min(
        quantity,
        shop.stock[order.itemId],
        Math.floor(itemCount(p.inventory, "coins") / definition.buy),
      );
      if (!ITEMS[order.itemId].stackable)
        quantity = Math.min(quantity, 28 - inventorySlots(p.inventory));
      if (
        quantity > 0 &&
        exchangeItems(
          p.inventory,
          [{ itemId: "coins", quantity: quantity * definition.buy }],
          [{ itemId: order.itemId, quantity }],
        )
      ) {
        shop.stock[order.itemId] -= quantity;
        finish(s, `Bought ${quantity} ${ITEMS[order.itemId].name}`);
      } else finish(s, "Purchase blocked: coins, stock or backpack space");
    } else {
      quantity = Math.min(
        quantity,
        itemCount(p.inventory, order.itemId),
        2_000_000_000 - shop.stock[order.itemId],
      );
      if (
        quantity > 0 &&
        exchangeItems(
          p.inventory,
          [{ itemId: order.itemId, quantity }],
          [{ itemId: "coins", quantity: quantity * definition.sell }],
        )
      ) {
        shop.stock[order.itemId] += quantity;
        finish(s, `Sold ${quantity} ${ITEMS[order.itemId].name}`);
      } else finish(s, "Sale blocked: no items or no backpack space for coins");
    }
    return;
  }
  finish(s, "This adventure is not yet available");
}
function autoOrder(s: RpgState): RpgOrder | null {
  if (s.grave && s.tick >= s.grave.retryAt)
    return inventorySlots(s.player.inventory) >= 28
      ? { type: "bank" }
      : { type: "recover" };
  const meal = s.player.inventory.find((i) => ITEMS[i.itemId].heals);
  if (s.player.health <= Math.ceil(maxHealth(s.player) * 0.5) && meal)
    return { type: "eat", itemId: meal.itemId };
  const drop = s.drops.find(
    (d) =>
      distance(s.player.position, d.position) < 15 &&
      d.items.some(
        (i) =>
          (ITEMS[i.itemId].stackable &&
            itemCount(s.player.inventory, i.itemId)) ||
          inventorySlots(s.player.inventory) < 28,
      ),
  );
  if (drop) return { type: "loot", dropId: drop.id };
  const p = s.player;
  let goal = s.control.goal;
  if (!goal || goalMet(s, goal)) {
    if (goal) {
      s.journal.push(`Ambition achieved: ${goal.title}`);
      s.journal = s.journal.slice(-60);
    }
    const next = suggestGoals(s)[0];
    if (!next) {
      s.control.reason = "Every available ambition is complete";
      s.control.thinkingUntil = s.tick + 100;
      return null;
    }
    goal = s.control.goal = next.goal;
  }
  s.control.steps = goalSteps(s, goal);
  s.control.reason = goal.title;
  if (!objectiveProgress(s, goal)) return null;
  return planGoal(s, goal);
}
function objectiveFingerprint(s: RpgState, goal: Ambition) {
  const p = s.player, held = (id: string) => itemCount(p.inventory, id) + itemCount(s.bank, id) +
    Object.values(p.equipment).filter((item) => item === id).length + (p.ammo?.itemId === id ? p.ammo.quantity : 0);
  const permanent = Object.values(ITEMS).filter((item) => item.kind === "gear" || item.kind === "tool")
    .filter((item) => held(item.id)).map((item) => item.id);
  const base: unknown[] = [permanent, held("coins")];
  if (goal.kind === "skill") base.push(p.skills[goal.skill!]);
  if (goal.kind === "gather") {
    const r = RESOURCES[goal.resourceId!];
    base.push(Math.min(goal.quantity!, held(r.itemId)), Math.min(XP_THRESHOLDS[r.level - 1], p.skills[r.skill]));
  }
  if (goal.kind === "equipment") {
    const item = ITEMS[goal.itemId!]; base.push(held(item.id));
    if (item.skill) base.push(Math.min(p.skills[item.skill], XP_THRESHOLDS[(item.level ?? 1) - 1]));
    if (item.rangedLevel) base.push(Math.min(p.skills.ranged, XP_THRESHOLDS[item.rangedLevel - 1]));
    base.push(Object.values(RESOURCES).map((r) => Math.min(28, held(r.itemId))));
  }
  if (goal.kind === "quest") {
    const q = QUESTS[goal.questId!], stage = currentQuestStage(s, q.id);
    base.push(s.quests[q.id], Object.entries(q.requirements ?? {}).map(([skill, level]) =>
      Math.min(p.skills[skill as SkillId], XP_THRESHOLDS[level! - 1])));
    const needs = stage?.items ?? (stage?.recipeId ? [{ itemId: RECIPES[stage.recipeId].output.itemId, quantity: stage.quantity ?? 1 }] : q.items);
    base.push(needs.map((item) => [item.itemId, Math.min(item.quantity, held(item.itemId))]));
    base.push(Object.values(RESOURCES).map((r) => Math.min(12, held(r.itemId))));
    if (stage?.kind === "kill") base.push(s.enemies.filter((e) => e.definitionId === stage.enemyId).map((e) => e.health));
  }
  if (goal.kind === "explore") base.push(s.control.visited.includes(goal.targetId!));
  return JSON.stringify(base);
}
function objectiveProgress(s: RpgState, goal: Ambition) {
  const fingerprint = objectiveFingerprint(s, goal), prior = s.control.progress;
  if (!prior || prior.goalId !== goal.id || prior.fingerprint !== fingerprint) {
    s.control.progress = { goalId: goal.id, fingerprint, tick: s.tick, failures: 0, blockedUntil: 0 }; return true;
  }
  if (s.tick - prior.tick < 1200) return true;
  prior.failures = Math.min(10000, prior.failures + 1); prior.tick = s.tick;
  prior.blockedUntil = s.tick + Math.min(600, 100 * prior.failures);
  const message = `Blocked: ${goal.title}. No objective progress; check the required tools, supplies, accessible services and route.`;
  appendGameMessage(s, "event", `blocker-${goal.id}`, message);
  finish(s, message);
  s.control.thinkingUntil = prior.blockedUntil;
  return false;
}
function planGoal(s: RpgState, goal: Ambition): RpgOrder | null {
  const p = s.player;
  if (goal.kind === "quest") return questPlan(s, goal.questId!);
  if (goal.kind === "gather") {
    const r = RESOURCES[goal.resourceId!];
    const preparation = prepareResource(s, r, goal);
    if (gatherProblem(p, r)) return preparation;
    const target = preferredResource(s, r.id, goal.targetId);
    const remaining =
      goal.quantity! -
      itemCount(p.inventory, r.itemId) -
      itemCount(s.bank, r.itemId);
    return target && remaining > 0
      ? {
          type: "gather",
          objectId: target.id,
          quantity: Math.min(
            remaining,
            Math.max(1, 28 - inventorySlots(p.inventory)),
          ),
        }
      : null;
  }
  if (goal.kind === "explore") {
    const target = objectById(goal.targetId!);
    if (!target) return null;
    if (adjacent(p, target)) {
      discover(s, target.id, target.name);
      return null;
    }
    const path = pathToObject(p.position, target, worldForState(s));
    return path?.length
      ? { type: "move", position: path[path.length - 1] }
      : null;
  }
  const skill =
    goal.kind === "skill"
      ? goal.skill!
      : (ITEMS[goal.itemId!]?.rangedLevel ? "ranged" : ITEMS[goal.itemId!]?.skill ?? "mining");
  if (
    goal.kind === "equipment" &&
    itemCount(s.bank, "coins") &&
    itemCount(p.inventory, "coins") < ITEMS[goal.itemId!].value
  )
    return {
      type: "withdraw",
      itemId: "coins",
      quantity: itemCount(s.bank, "coins"),
    };
  const gatheringSkill =
    skill === "smithing" ? "mining" : skill === "cooking" ? "fishing" : skill;
  const starterResource = Object.values(RESOURCES).find(
    (r) => r.skill === gatheringSkill && r.level === 1,
  );
  if (starterResource && !toolFor(p, starterResource))
    return prepareResource(s, starterResource, goal);
  if (
    skill === "smithing" &&
    !itemCount(p.inventory, "hammer") &&
    itemCount(s.bank, "hammer")
  )
    return { type: "withdraw", itemId: "hammer", quantity: 1 };
  if (goal.kind === "equipment") {
    const item = ITEMS[goal.itemId!];
    if (!item) return null;
    if (itemCount(s.bank, item.id))
      return { type: "withdraw", itemId: item.id, quantity: 1 };
    if (itemCount(p.inventory, item.id))
      return item.slot ? { type: "equip", itemId: item.id } : null;
    const shopObject = nearest(
      p,
      (o) =>
        o.kind === "shop" &&
        (!o.serviceId || !!s.quests[o.serviceId]?.complete) &&
        !!SHOPS[o.id]?.stock[item.id] &&
        (s.shops.find((x) => x.id === o.id)?.stock[item.id] ?? 0) > 0,
    );
    if (!shopObject) return null;
    if (levelForXp(p.skills[skill]) >= (item.rangedLevel ?? item.level ?? 1)) {
      if (
        itemCount(p.inventory, "coins") >=
        SHOPS[shopObject.id].stock[item.id].buy
      )
        return inventorySlots(p.inventory) >= 28 &&
          p.inventory.some((i) => ITEMS[i.itemId].kind === "resource")
          ? { type: "bank" }
          : {
              type: "buy",
              shopId: shopObject.id,
              itemId: item.id,
              quantity: 1,
            };
      const surplus = p.inventory.find(
        (i) =>
          ITEMS[i.itemId].kind === "resource" &&
          (SHOPS[shopObject.id].stock[i.itemId]?.sell ?? 0) > 0,
      );
      if (
        surplus &&
        (inventorySlots(p.inventory) >= 26 ||
          itemCount(p.inventory, "coins") +
            surplus.quantity *
              SHOPS[shopObject.id].stock[surplus.itemId].sell >=
            item.value)
      )
        return {
          type: "sell",
          shopId: shopObject.id,
          itemId: surplus.itemId,
          quantity: surplus.quantity,
        };
      const saved = s.bank.find(
        (i) =>
          ITEMS[i.itemId].kind === "resource" &&
          (SHOPS[shopObject.id].stock[i.itemId]?.sell ?? 0) > 0,
      );
      if (saved && inventorySlots(p.inventory) < 26)
        return {
          type: "withdraw",
          itemId: saved.itemId,
          quantity: Math.min(saved.quantity, 28 - inventorySlots(p.inventory)),
        };
      const trade = nearest(p, (o) => !!o.resourceId && !gatherProblem(p, RESOURCES[o.resourceId]) &&
        (SHOPS[shopObject.id].stock[RESOURCES[o.resourceId].itemId]?.sell ?? 0) > 0);
      if (trade) return { type: "gather", objectId: trade.id, quantity: Math.max(1, Math.min(
        28 - inventorySlots(p.inventory), Math.ceil((item.value - itemCount(p.inventory, "coins")) /
          SHOPS[shopObject.id].stock[RESOURCES[trade.resourceId!].itemId].sell))) };
    }
  }
  if (skill === "smithing" || skill === "cooking") {
    const recipe =
      skill === "smithing" ? RECIPES["bronze-bar"] : RECIPES["cooked-shrimp"];
    if (!craftProblem(p, recipe.id))
      return { type: "craft", recipeId: recipe.id, quantity: 1 };
    const missing = recipe.inputs.find(
      (i) => itemCount(p.inventory, i.itemId) < i.quantity,
    );
    if (missing && itemCount(s.bank, missing.itemId))
      return { type: "withdraw", itemId: missing.itemId, quantity: 1 };
    const target = nearest(
      p,
      (o) =>
        !!o.resourceId &&
        RESOURCES[o.resourceId].itemId === missing?.itemId &&
        !gatherProblem(p, RESOURCES[o.resourceId]),
    );
    return target ? { type: "gather", objectId: target.id, quantity: 1 } : null;
  }
  if (["attack", "strength", "defence", "hitpoints", "ranged"].includes(skill))
    return combatPlan(s, skill as SkillId);
  if (!["woodcutting", "mining", "fishing"].includes(skill)) return null;
  const clicked = goal.targetId ? objectById(goal.targetId) : undefined;
  const preferred = clicked?.resourceId
    ? RESOURCES[clicked.resourceId]
    : undefined;
  // A locked clicked resource remains the destination, while suitable resources train its prerequisites.
  const preparation =
    preferred && levelForXp(p.skills[skill]) >= preferred.level
      ? prepareResource(s, preferred, goal)
      : null;
  if (
    preferred &&
    levelForXp(p.skills[skill]) >= preferred.level &&
    gatherProblem(p, preferred)
  )
    return preparation;
  const target =
    (preferred && !gatherProblem(p, preferred)
      ? preferredResource(s, preferred.id, clicked?.id)
      : undefined) ??
    resourceFor(s, p, skill) ??
    resourceFor(s, p, skill, false);
  if (!target) {
    s.control.reason = `${goal.title}: obtain the required working tool first`;
    return null;
  }
  return {
    type: "gather",
    objectId: target.id,
    quantity: Math.max(1, 28 - inventorySlots(p.inventory)),
  };
}
function preferredResource(
  s: RpgState,
  resourceId: ResourceDefinition["id"],
  targetId?: string,
) {
  const clicked = targetId ? objectById(targetId) : undefined;
  return (
    (clicked?.resourceId === resourceId && s.resources[clicked.id].available
      ? clicked
      : undefined) ??
    nearest(
      s.player,
      (o) => o.resourceId === resourceId && s.resources[o.id].available,
    ) ??
    (clicked?.resourceId === resourceId
      ? clicked
      : nearest(s.player, (o) => o.resourceId === resourceId))
  );
}
function prepareResource(
  s: RpgState,
  r: ResourceDefinition,
  goal: Ambition,
): RpgOrder | null {
  const p = s.player;
  if (levelForXp(p.skills[r.skill]) < r.level) {
    const order = planGoal(s, {
      id: `prepare-${r.id}`,
      title: `Train ${r.skill} for ${r.name}`,
      kind: "skill",
      skill: r.skill,
      level: r.level,
    });
    // Reconsider after each prerequisite harvest so the selected resource unlocks immediately.
    if (order?.type === "gather") order.quantity = 1;
    return order;
  }
  const needed = !toolFor(p, r)
    ? Object.values(ITEMS)
        .filter(
          (i) =>
            i.tool === r.tool &&
            (i.level ?? 1) <= levelForXp(p.skills[r.skill]),
        )
        .sort((a, b) => a.value - b.value)[0]?.id
    : r.bait && !itemCount(p.inventory, r.bait)
      ? r.bait
      : undefined;
  if (!needed) return null;
  // Prefer any usable banked tool, including a better tier than the cheapest shop tool.
  const banked = !toolFor(p, r)
    ? s.bank.find(
        (i) =>
          ITEMS[i.itemId].tool === r.tool &&
          (ITEMS[i.itemId].level ?? 1) <= levelForXp(p.skills[r.skill]),
      )
    : s.bank.find((i) => i.itemId === needed);
  if (inventorySlots(p.inventory) >= 28) return { type: "bank" };
  if (banked) return { type: "withdraw", itemId: banked.itemId, quantity: 1 };
  if (itemCount(s.bank, "coins"))
    return {
      type: "withdraw",
      itemId: "coins",
      quantity: itemCount(s.bank, "coins"),
    };
  const shop = nearest(
    p,
    (o) =>
      o.kind === "shop" &&
      (!o.serviceId || !!s.quests[o.serviceId]?.complete) &&
      !!SHOPS[o.id]?.stock[needed] &&
      (s.shops.find((entry) => entry.id === o.id)?.stock[needed] ?? 0) > 0,
  );
  if (
    shop &&
    itemCount(p.inventory, "coins") >= SHOPS[shop.id].stock[needed].buy
  )
    return { type: "buy", shopId: shop.id, itemId: needed, quantity: 1 };
  // Earn missing tool/bait money through an already usable trade; never create free equipment.
  const surplus =
    shop &&
    p.inventory.find(
      (i) =>
        ITEMS[i.itemId].kind === "resource" &&
        (SHOPS[shop.id].stock[i.itemId]?.sell ?? 0) > 0,
    );
  if (shop && surplus)
    return {
      type: "sell",
      shopId: shop.id,
      itemId: surplus.itemId,
      quantity: surplus.quantity,
    };
  const earn = (shop ? nearest(p, (o) => !!o.resourceId && !gatherProblem(p, RESOURCES[o.resourceId]) &&
    (SHOPS[shop.id].stock[RESOURCES[o.resourceId].itemId]?.sell ?? 0) > 0) : undefined) ?? ["mining", "woodcutting", "fishing"]
    .map((skill) => resourceFor(s, p, skill))
    .find(Boolean);
  s.control.reason = `${goal.title}: earn and obtain ${ITEMS[needed].name} first`;
  return earn ? { type: "gather", objectId: earn.id, quantity: 1 } : null;
}
function acquire(
  s: RpgState,
  id: string,
  quantity: number,
  depth = 0,
): RpgOrder | null {
  if (depth > 4) return null;
  const p = s.player,
    owned = itemCount(p.inventory, id);
  if (owned >= quantity) return null;
  const saved = itemCount(s.bank, id);
  if (saved && inventorySlots(p.inventory) < 28)
    return {
      type: "withdraw",
      itemId: id,
      quantity: Math.min(
        quantity - owned,
        saved,
        ITEMS[id].stackable ? 2_000_000_000 : 28 - inventorySlots(p.inventory),
      ),
    };
  const r = Object.values(RESOURCES).find((r) => r.itemId === id);
  if (r) {
    if (gatherProblem(p, r))
      return planGoal(s, {
        id: `prepare-${r.skill}`,
        title: `Prepare ${r.skill}`,
        kind: "skill",
        skill: r.skill,
        level: r.level,
      });
    const target =
      nearest(p, (o) => o.resourceId === r.id && s.resources[o.id].available) ??
      nearest(p, (o) => o.resourceId === r.id);
    return target
      ? {
          type: "gather",
          objectId: target.id,
          quantity: Math.min(
            quantity - owned,
            Math.max(1, 28 - inventorySlots(p.inventory)),
          ),
        }
      : null;
  }
  const recipe = Object.values(RECIPES).find((r) => r.output.itemId === id);
  if (recipe) {
    if (levelForXp(p.skills[recipe.skill]) < recipe.level)
      return planGoal(s, {
        id: "recipe-training",
        title: "Train for the recipe",
        kind: "skill",
        skill: recipe.skill,
        level: recipe.level,
      });
    if (recipe.tool && !itemCount(p.inventory, recipe.tool))
      return acquire(s, recipe.tool, 1, depth + 1);
    for (const input of recipe.inputs)
      if (itemCount(p.inventory, input.itemId) < input.quantity)
        return acquire(s, input.itemId, input.quantity, depth + 1);
    return { type: "craft", recipeId: recipe.id, quantity: 1 };
  }
  return planGoal(s, {
    id: `obtain-${id}`,
    title: `Obtain ${ITEMS[id].name}`,
    kind: "equipment",
    itemId: id,
  });
}
function questPlan(s: RpgState, id: string): RpgOrder | null {
  const q = QUESTS[id],
    progress = s.quests[id],
    p = s.player;
  for (const required of q.prerequisites ?? [])
    if (!s.quests[required]?.complete) return questPlan(s, required);
  if (!progress.accepted) return { type: "quest", questId: id };
  for (const [skill, level] of Object.entries(q.requirements ?? {}))
    if (levelForXp(p.skills[skill as SkillId]) < level!)
      return planGoal(s, {
        id: `quest-train-${skill}`,
        title: `Train ${skill} for ${q.name}`,
        kind: "skill",
        skill: skill as SkillId,
        level,
      });
  const stage = currentQuestStage(s, id);
  if (stage) {
    s.control.reason = `${q.name}: ${stage.description}`;
    if (["gather", "craft", "deliver"].includes(stage.kind)) {
      const items = stage.items ?? (stage.recipeId ? [{ itemId: RECIPES[stage.recipeId].output.itemId, quantity: stage.quantity ?? 1 }] : []);
      for (const item of items) if (itemCount(p.inventory, item.itemId) < item.quantity) {
        if (inventorySlots(p.inventory) >= 28) return { type: "bank" };
        const order = acquire(s, item.itemId, item.quantity);
        if (order) return order;
        s.control.reason = `${q.name}: need ${item.quantity} ${ITEMS[item.itemId].name} (${itemCount(p.inventory, item.itemId)}/${item.quantity}). ${s.control.reason}`;
        s.control.thinkingUntil = s.tick + 10; return null;
      }
      if (stage.kind !== "deliver") { advanceStage(s, id); return questPlan(s, id); }
    }
    if (stage.kind === "kill") {
      if ((progress.counters?.[stage.id] ?? 0) >= (stage.quantity ?? 1)) { advanceStage(s, id); return questPlan(s, id); }
      return combatPlan(s, "attack", stage.enemyId);
    }
    if (stage.kind === "choice" && s.dialogue?.questId === id) return null;
    if (stage.kind === "practice") {
      for (const item of ["training-bow", "training-arrow"]) if (!itemCount(p.inventory, item)) {
        if (inventorySlots(p.inventory) >= 28) return { type: "bank" };
        if (itemCount(s.bank, item)) return { type: "withdraw", itemId: item, quantity: 1 };
        s.control.reason = "Recover Iori’s practice bow and arrows from the bank or grave.";
        return null;
      }
    }
    return { type: "interact", objectId: stage.targetId!, verb: stage.kind === "practice" ? "practice" :
      stage.kind === "inspect" || stage.kind === "visit" ? "inspect" : "talk" };
  }
  return { type: "quest", questId: id };
}
function combatPlan(
  s: RpgState,
  skill: SkillId,
  enemyType = "boar",
): RpgOrder | null {
  const p = s.player;
  const ranged = skill === "ranged";
  if (ranged) {
    if (inventorySlots(p.inventory) >= 27 && p.inventory.some((i) => ITEMS[i.itemId].kind === "resource")) return { type: "bank" };
    const bow = Object.values(ITEMS).filter((item) => item.weaponType === "bow" &&
      levelForXp(p.skills.ranged) >= (item.rangedLevel ?? 1) &&
      (itemCount(p.inventory, item.id) || p.equipment.weapon === item.id)).sort((a, b) => (b.rangedAttack ?? 0) - (a.rangedAttack ?? 0))[0];
    if (!bow) {
      const saved = s.bank.find((stack) => ITEMS[stack.itemId].weaponType === "bow" && levelForXp(p.skills.ranged) >= (ITEMS[stack.itemId].rangedLevel ?? 1));
      return saved ? { type: "withdraw", itemId: saved.itemId, quantity: 1 } : acquire(s, "shortbow", 1);
    }
    if (p.equipment.weapon !== bow.id) return { type: "equip", itemId: bow.id };
    if (!p.ammo) {
      const arrows = p.inventory.find((stack) => !!ITEMS[stack.itemId].ammoTier);
      if (arrows) return { type: "equip", itemId: arrows.itemId };
      const banked = s.bank.find((stack) => !!ITEMS[stack.itemId].ammoTier);
      if (banked) return { type: "withdraw", itemId: banked.itemId, quantity: Math.min(40, banked.quantity) };
      const vendor = nearest(p, (o) => o.kind === "shop" && (!o.serviceId || !!s.quests[o.serviceId]?.complete) &&
        (s.shops.find((shop) => shop.id === o.id)?.stock["bronze-arrow"] ?? 0) > 0);
      if (!vendor) { s.control.reason = "No arrows are stocked at an unlocked vendor yet."; return null; }
      const coins = itemCount(p.inventory, "coins");
      if (coins) return { type: "buy", shopId: vendor.id, itemId: "bronze-arrow", quantity: Math.min(40, coins) };
      if (itemCount(s.bank, "coins")) return { type: "withdraw", itemId: "coins", quantity: itemCount(s.bank, "coins") };
      const sale = p.inventory.find((stack) => ITEMS[stack.itemId].kind === "resource" && (SHOPS[vendor.id].stock[stack.itemId]?.sell ?? 0) > 0);
      if (sale) return { type: "sell", shopId: vendor.id, itemId: sale.itemId, quantity: sale.quantity };
      const stores = s.bank.find((stack) => ITEMS[stack.itemId].kind === "resource" && (SHOPS[vendor.id].stock[stack.itemId]?.sell ?? 0) > 0);
      if (stores) return { type: "withdraw", itemId: stores.itemId, quantity: Math.min(stores.quantity, 28 - inventorySlots(p.inventory)) };
      const trade = nearest(p, (o) => !!o.resourceId && !gatherProblem(p, RESOURCES[o.resourceId]) &&
        (SHOPS[vendor.id].stock[RESOURCES[o.resourceId].itemId]?.sell ?? 0) > 0);
      return trade ? { type: "gather", objectId: trade.id, quantity: 5 } : null;
    }
  }
  if (!ranged) {
  const sword = Object.values(ITEMS)
    .filter(
      (i) =>
        i.id.endsWith("-sword") &&
        levelForXp(p.skills.attack) >= (i.attackLevel ?? 1) &&
        itemCount(p.inventory, i.id) > 0,
    )
    .sort((a, b) => (b.attack ?? 0) - (a.attack ?? 0))[0];
  if (
    sword &&
    (ITEMS[p.equipment.weapon ?? ""]?.tool ||
      (ITEMS[p.equipment.weapon ?? ""]?.attack ?? 0) < (sword.attack ?? 0))
  )
    return { type: "equip", itemId: sword.id };
  const savedSword = s.bank.find(
    (i) =>
      i.itemId.endsWith("-sword") &&
      levelForXp(p.skills.attack) >= (ITEMS[i.itemId].attackLevel ?? 1),
  );
  if (savedSword && (!p.equipment.weapon || ITEMS[p.equipment.weapon]?.tool))
    return { type: "withdraw", itemId: savedSword.itemId, quantity: 1 };
  if (!p.equipment.weapon) return acquire(s, "bronze-sword", 1);
  }
  if (enemyType === "bandit" || enemyType === "captain") {
    for (const id of ["bronze-body", "bronze-legs", "bronze-med-helm"]) {
      if (!p.equipment[ITEMS[id].slot!]) {
        if (itemCount(p.inventory, id)) return { type: "equip", itemId: id };
        return acquire(s, id, 1);
      }
    }
  }
  // Let equipment funding sell a full bag before banking; otherwise bank→withdraw surplus loops forever.
  if (inventorySlots(p.inventory) >= 24 && p.inventory.some((i) => ITEMS[i.itemId].kind === "resource"))
    return { type: "bank" };
  const meals = p.inventory.reduce(
    (n, i) => n + (ITEMS[i.itemId].heals ? i.quantity : 0),
    0,
  );
  if (
    (p.health < maxHealth(p) * 0.6 && !meals) ||
    ((enemyType === "bandit" || enemyType === "captain") && meals < 4) || (ranged && meals < 2)
  ) {
    if (itemCount(s.bank, "cooked-shrimp"))
      return {
        type: "withdraw",
        itemId: "cooked-shrimp",
        quantity: Math.min(6, itemCount(s.bank, "cooked-shrimp")),
      };
    const shop = nearest(
      p,
      (o) =>
        o.kind === "shop" &&
        (!o.serviceId || !!s.quests[o.serviceId]?.complete) &&
        !!s.shops.find((x) => x.id === o.id)?.stock["cooked-shrimp"],
    );
    if (shop && itemCount(p.inventory, "coins") >= 10)
      return {
        type: "buy",
        shopId: shop.id,
        itemId: "cooked-shrimp",
        quantity: Math.min(6, Math.floor(itemCount(p.inventory, "coins") / 10)),
      };
    return acquire(
      s,
      "cooked-shrimp",
      Math.min(6, 28 - inventorySlots(p.inventory)) || 1,
    );
  }
  if (p.health < Math.ceil(maxHealth(p) * 0.6)) {
    const meal = p.inventory.find((i) => ITEMS[i.itemId].heals);
    if (meal) return { type: "eat", itemId: meal.itemId };
    s.control.reason = "Recovering health before another fight";
    return null;
  }
  s.control.style =
    ranged ? ["accurate", "rapid", "longrange"].includes(s.control.style) ? s.control.style : "accurate" :
      skill === "strength" || skill === "defence" ? skill : "attack";
  const enemy = s.enemies
    .filter((e) => e.definitionId === enemyType && e.health > 0)
    .sort(
      (a, b) => distance(p.position, a.home) - distance(p.position, b.home),
    )[0];
  if (!enemy) {
    s.control.thinkingUntil = s.tick + 5;
    return null;
  }
  return { type: "attack", enemyId: enemy.id };
}
function npcStep(s: RpgState, p: ActorState) {
  if (p.action?.kind === "bank") {
    bankDetour(s, p);
    return;
  }
  const stored = [...p.inventory, ...p.bank].reduce(
    (n, i) => n + (ITEMS[i.itemId].kind === "resource" ? i.quantity : 0),
    0,
  );
  if (stored >= 64) {
    if (p.inventory.some((i) => ITEMS[i.itemId].kind === "resource"))
      bankDetour(s, p);
    else {
      p.action = null;
      p.activity = "Personal stores are stocked; resting from work";
    }
    return;
  }
  if (inventorySlots(p.inventory) === 28) {
    bankDetour(s, p);
    return;
  }
  let target =
    p.action?.kind === "gather" ? objectById(p.action.targetId!) : undefined;
  if (!target || !s.resources[target.id].available)
    target = resourceFor(
      s,
      p,
      p.role === "miner"
        ? "mining"
        : p.role === "fisher"
          ? "fishing"
          : "woodcutting",
    );
  if (target) gather(s, p, target);
  else p.activity = "Waiting for local resources";
}
export function stepRpg(s: RpgState, count = 1): RpgState {
  if (!Number.isInteger(count) || count < 0 || count > 36000)
    throw Error("Invalid tick count");
  for (let n = 0; n < count; n++) {
    s.tick++;
    if (s.dialogue && s.tick >= s.dialogue.expiresAt) chooseDialogue(s, s.dialogue.choices[0].id);
    enemyStep(s);
    if (s.tick % 100 === 0)
      s.player.health = Math.min(maxHealth(s.player), s.player.health + 1);
    for (const r of Object.values(s.resources))
      if (!r.available && s.tick >= r.respawnAt) {
        r.available = true;
        r.respawnAt = 0;
      }
    for (const shop of s.shops)
      if (s.tick >= shop.restockAt) {
        for (const [id, entry] of Object.entries(SHOPS[shop.id].stock))
          shop.stock[id] += Math.sign(entry.max - shop.stock[id]);
        shop.restockAt = s.tick + 100;
      }
    for (const p of [s.player, ...s.npcs]) {
      p.previousPosition = { ...p.position };
      p.movement = null;
      if (p.id === 0 && s.control.waiting) {
        p.runEnergy = Math.min(10000, p.runEnergy + 15);
        continue;
      }
      if (p.id === 0 && s.control.active?.type === "talk-actor") {
        const actorId = s.control.active.actorId;
        const target = s.npcs.find((actor) => actor.id === actorId);
        const endpoint = p.path.at(-1);
        if (!target || target.health <= 0) { finish(s, "That villager is no longer available."); continue; }
        if (distance(p.position, target.position) <= 1 && lineOfSight(s, p.position, target.position)) p.path = [];
        else if (!endpoint || distance(endpoint, target.position) > 1 || !lineOfSight(s, endpoint, target.position)) {
          const prepared = actorApproachRoute(s, target.id);
          if (!prepared) { finish(s, "That villager is no longer reachable."); continue; }
          p.path = prepared;
        }
      }
      if (p.id === 0 && s.control.active?.type === "attack" && s.control.queue[0] && inventoryOrder(s.control.queue[0])) {
        // A short inventory transaction pauses, rather than silently discards, the engagement.
        p.runEnergy = Math.min(10000, p.runEnergy + 15);
        const next = s.control.queue[0];
        if (next.type === "eat" && s.tick < s.control.eatReadyAt) continue;
        const engagement = s.control.active, source = s.control.source;
        s.control.active = shiftOrder(s)!; s.control.source = "player";
        p.path = []; p.action = null;
        execute(s, s.control.active);
        s.control.active = engagement; s.control.source = source;
        continue;
      }
      if (
        p.id === 0 &&
        s.control.source === "autonomous" &&
        s.control.active?.type === "attack" &&
        p.health <= Math.max(3, Math.ceil(maxHealth(p) * 0.35))
      ) {
        const meal = p.inventory.find((i) => ITEMS[i.itemId].heals);
        if (meal) {
          food(s, meal.itemId);
          p.action = null;
          continue;
        }
        const safe = nearest(p, (o) => o.kind === "bank")!;
        finish(s, "Retreating to recover before another fight");
        const path = pathToObject(p.position, safe, worldForState(s));
        if (path?.length) {
          s.control.active = { type: "move", position: path[path.length - 1] };
          s.control.source = "autonomous";
          p.path = path;
        }
        continue;
      }
      if (p.path.length) {
        travel(s, p);
        continue;
      }
      if (p.id !== 0) {
        p.runEnergy = Math.min(10000, p.runEnergy + 15);
        npcStep(s, p);
        continue;
      }
      for (const town of TOWNS)
        if (
          distance(p.position, town.position) < 12 &&
          !s.control.visited.includes(town.id)
        )
          discover(s, town.id, town.name);
      for (const landmark of WORLD.objects.filter((o) => o.kind === "landmark" || o.kind === "bridge"))
        if (adjacent(p, landmark)) discover(s, landmark.id, landmark.name);
      if (s.control.thought && s.tick >= s.control.thought.expiresAt)
        s.control.thought = null;
      if (!s.control.thought && s.tick - s.control.lastThought >= 200) {
        const choices = suggestGoals(s);
        if (choices.length >= 2)
          s.control.thought = {
            id: `thought-${s.tick}`,
            title: "A useful next ambition",
            body: s.control.goal?.title ?? "There is work worth learning.",
            expiresAt: s.tick + 34,
            choices,
          };
        s.control.lastThought = s.tick;
      }
      if (!s.control.active) {
        if (s.control.queue.length) {
          s.control.active = shiftOrder(s)!;
          s.control.source = "player";
          const prepared = orderRoute(s, s.control.active);
          if (!prepared) { finish(s, "The queued target is no longer reachable."); continue; }
          beginPlayerOrder(s, s.control.active, prepared);
        } else if (s.tick >= s.control.thinkingUntil) {
          s.control.active = autoOrder(s);
          s.control.source = s.control.active ? "autonomous" : null;
        }
      }
      if (p.path.length) { travel(s, p); continue; }
      p.runEnergy = Math.min(10000, p.runEnergy + 15);
      const autonomous = s.control.source === "autonomous";
      if (s.control.active) execute(s, s.control.active);
      if (
        autonomous &&
        !s.control.active &&
        s.control.goal?.kind === "equipment" &&
        s.control.goal.itemId &&
        itemCount(p.inventory, s.control.goal.itemId)
      )
        equip(s, s.control.goal.itemId);
    }
  }
  return s;
}
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, max = 1e12): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const positive = (v: unknown, max = 2_000_000_000): v is number =>
  integer(v, max) && v > 0;
function position(v: unknown, w: WorldDefinition = WORLD): v is TilePosition {
  return (
    object(v) &&
    v.worldId === WORLD.id &&
    v.plane === 0 &&
    integer(v.x, WORLD.width - 1) &&
    integer(v.y, WORLD.height - 1) &&
    isWalkable(v as unknown as TilePosition, w)
  );
}
function validGoal(v: unknown): v is Ambition {
  if (
    !object(v) ||
    typeof v.id !== "string" ||
    !v.id ||
    v.id.length > 100 ||
    typeof v.title !== "string" ||
    !v.title ||
    v.title.length > 200
  )
    return false;
  if (
    v.kind !== "gather" &&
    (v.resourceId !== undefined || v.quantity !== undefined)
  )
    return false;
  if (
    v.targetId !== undefined &&
    (typeof v.targetId !== "string" || !objectById(v.targetId))
  )
    return false;
  if (v.kind === "gather") {
    if (
      typeof v.resourceId !== "string" ||
      !Object.hasOwn(RESOURCES, v.resourceId) ||
      !positive(v.quantity, 2_000_000_000)
    )
      return false;
    const resource = RESOURCES[v.resourceId as ResourceDefinition["id"]];
    return (
      (v.skill === undefined || v.skill === resource.skill) &&
      (v.targetId === undefined ||
        objectById(v.targetId as string)?.resourceId === v.resourceId)
    );
  }
  if (v.kind === "equipment")
    return (
      typeof v.itemId === "string" &&
      Object.hasOwn(ITEMS, v.itemId) &&
      ["tool", "gear"].includes(ITEMS[v.itemId].kind)
    );
  if (v.kind === "skill")
    return (
      typeof v.skill === "string" &&
      (SKILLS as readonly string[]).includes(v.skill) &&
      positive(v.level, 99) &&
      (v.targetId === undefined ||
        (!!objectById(v.targetId as string)?.resourceId &&
          RESOURCES[objectById(v.targetId as string)!.resourceId!].skill ===
            v.skill))
    );
  if (v.kind === "explore")
    return typeof v.targetId === "string" && !!objectById(v.targetId);
  if (v.kind === "quest")
    return typeof v.questId === "string" && Object.hasOwn(QUESTS, v.questId);
  return false;
}
function validOrder(v: unknown, w: WorldDefinition = WORLD): v is RpgOrder {
  if (!object(v)) return false;
  switch (v.type) {
    case "gate": return typeof v.objectId === "string" && objectById(v.objectId)?.kind === "gate" && typeof v.open === "boolean";
    case "talk-actor": return positive(v.actorId, WORLD.spawns.length - 1);
    case "unequip-ammo": return true;
    case "interact":
      return typeof v.objectId === "string" && !!objectById(v.objectId) &&
        ["talk", "inspect", "use", "practice"].includes(v.verb as string) &&
        (v.itemId === undefined || typeof v.itemId === "string" && Object.hasOwn(ITEMS, v.itemId));
    case "travel-service": return typeof v.objectId === "string" && Object.hasOwn(FERRIES, v.objectId);
    case "move":
      return position(v.position, w);
    case "gather":
      return (
        typeof v.objectId === "string" &&
        !!objectById(v.objectId)?.resourceId &&
        positive(v.quantity, 10000)
      );
    case "craft":
      return (
        typeof v.recipeId === "string" &&
        Object.hasOwn(RECIPES, v.recipeId) &&
        positive(v.quantity, 10000)
      );
    case "bank":
      return (
        v.objectId === undefined ||
        (typeof v.objectId === "string" &&
          objectById(v.objectId)?.kind === "bank")
      );
    case "withdraw":
      return (
        typeof v.itemId === "string" &&
        Object.hasOwn(ITEMS, v.itemId) &&
        positive(v.quantity)
      );
    case "buy":
    case "sell":
      return (
        typeof v.shopId === "string" &&
        Object.hasOwn(SHOPS, v.shopId) &&
        typeof v.itemId === "string" &&
        Object.hasOwn(SHOPS[v.shopId].stock, v.itemId) &&
        positive(v.quantity, 10000)
      );
    case "equip":
      return (
        typeof v.itemId === "string" &&
        Object.hasOwn(ITEMS, v.itemId) &&
        (!!ITEMS[v.itemId].slot || !!ITEMS[v.itemId].ammoTier)
      );
    case "unequip":
      return (
        typeof v.slot === "string" &&
        ["weapon", "shield", "head", "body", "legs", "cape"].includes(v.slot)
      );
    case "attack":
      return (
        typeof v.enemyId === "string" &&
        ENEMY_SPAWNS.some((e) => e.id === v.enemyId)
      );
    case "loot":
      return (
        typeof v.dropId === "string" &&
        ENEMY_SPAWNS.some((e) => `loot-${e.id}` === v.dropId || `arrows-${e.id}` === v.dropId)
      );
    case "quest":
      return typeof v.questId === "string" && Object.hasOwn(QUESTS, v.questId);
    case "recover":
      return true;
    case "eat":
      return (
        typeof v.itemId === "string" &&
        Object.hasOwn(ITEMS, v.itemId) &&
        !!ITEMS[v.itemId].heals
      );
    default:
      return false;
  }
}
function orderProblem(
  s: RpgState,
  order: RpgOrder,
  queued = false,
): string | null {
  const p = s.player;
  if (order.type === "gate" && !order.open && gateOccupied(s, objectById(order.objectId)!)) return "Cannot close an occupied gate.";
  if (order.type === "talk-actor" && !s.npcs.some((actor) => actor.id === order.actorId && actor.health > 0))
    return "That villager is not available.";
  if (order.type === "travel-service" && !s.quests[FERRIES[order.objectId].questId]?.complete)
    return "Complete River Letters to open this ferry.";
  if (order.type === "buy" || order.type === "sell") {
    const service = objectById(order.shopId)?.serviceId;
    if (service && !s.quests[service]?.complete) return `Complete ${QUESTS[service].name} to use this service.`;
  }
  if (order.type === "eat" && !itemCount(p.inventory, order.itemId))
    return "That food is not in the backpack.";
  if (order.type === "eat" && s.tick < s.control.eatReadyAt)
    return "Wait three ticks between meals.";
  if (order.type === "recover" && !s.grave)
    return "There is no backpack grave to recover.";
  if (order.type === "loot" && !s.drops.some((d) => d.id === order.dropId))
    return "Those ground supplies are not present.";
  if (
    order.type === "attack" &&
    !s.enemies.some((e) => e.id === order.enemyId && e.health > 0)
  )
    return "That enemy is not currently present.";
  if (!queued && order.type === "attack" && ITEMS[p.equipment.weapon ?? ""]?.weaponType === "bow" && !p.ammo)
    return "Load carried or banked arrows before shooting.";
  if (order.type === "quest" && s.quests[order.questId].complete)
    return "That quest has already been completed.";
  if (order.type === "gather")
    return gatherProblem(p, RESOURCES[objectById(order.objectId)!.resourceId!]);
  if (order.type === "craft") return craftProblem(p, order.recipeId, !queued);
  if (order.type === "equip") {
    const item = ITEMS[order.itemId];
    if (!queued && !itemCount(p.inventory, item.id))
      return "That item is not in your backpack.";
    if (
      levelForXp(p.skills.attack) < (item.attackLevel ?? 1) ||
      levelForXp(p.skills.defence) < (item.defenceLevel ?? 1) ||
      levelForXp(p.skills.ranged) < (item.rangedLevel ?? 1) ||
      (!queued && item.slot === "shield" && ITEMS[p.equipment.weapon ?? ""]?.twoHanded) ||
      (item.skill && levelForXp(p.skills[item.skill]) < (item.level ?? 1))
    )
      return "You do not meet the equipment requirements.";
    if (item.ammoTier && p.ammo?.itemId === item.id && p.ammo.quantity + itemCount(p.inventory, item.id) > 2_000_000_000)
      return "The equipped arrow stack is full.";
  }
  if (!queued && order.type === "unequip-ammo" && (!p.ammo ||
    (inventorySlots(p.inventory) >= 28 && !itemCount(p.inventory, p.ammo.itemId))))
    return "No equipped arrows or backpack space.";
  if (
    !queued && order.type === "unequip" &&
    (!p.equipment[order.slot] || inventorySlots(p.inventory) >= 28)
  )
    return "No equipped item or backpack space.";
  if (
    !queued &&
    order.type === "withdraw" &&
    itemCount(s.bank, order.itemId) < order.quantity
  )
    return "Not enough items in your personal bank.";
  if (
    !queued &&
    order.type === "sell" &&
    itemCount(p.inventory, order.itemId) < order.quantity
  )
    return "Not enough items to sell.";
  if (
    !queued &&
    order.type === "buy" &&
    (itemCount(p.inventory, "coins") <
      SHOPS[order.shopId].stock[order.itemId].buy ||
      !s.shops.find((x) => x.id === order.shopId)?.stock[order.itemId])
  )
    return "Not enough coins or shop stock.";
  return null;
}
const inventoryOrder = (order: RpgOrder) => ["equip", "unequip", "unequip-ammo", "eat"].includes(order.type);
function shiftOrder(s: RpgState) {
  const order = s.control.queue.shift(), index = s.control.directOrderIndex;
  if (index === 0) delete s.control.directOrderIndex;
  else if (index !== undefined) s.control.directOrderIndex = index - 1;
  return order;
}
function removeOrder(s: RpgState, index: number) {
  s.control.queue.splice(index, 1);
  const direct = s.control.directOrderIndex;
  if (direct === index) delete s.control.directOrderIndex;
  else if (direct !== undefined && direct > index) s.control.directOrderIndex = direct - 1;
}
/** Prepare movement without performing a transaction, spending RNG or changing the accepted intention. */
function orderRoute(s: RpgState, order: RpgOrder): TilePosition[] | null {
  const p = s.player;
  if (order.type === "talk-actor") return actorApproachRoute(s, order.actorId);
  if (order.type === "move") return findPath(p.position, order.position, worldForState(s));
  if (order.type === "attack") {
    const enemy = s.enemies.find((e) => e.id === order.enemyId);
    return enemy ? attackRoute(s, p, enemy) : null;
  }
  if (order.type === "recover") return recoveryRoute(s);
  if (order.type === "loot") {
    const drop = s.drops.find((d) => d.id === order.dropId);
    return drop ? distance(p.position, drop.position) <= 1 ? [] : findPath(p.position, drop.position, worldForState(s)) : null;
  }
  let target: WorldObject | undefined;
  if (order.type === "gather") {
    target = inventorySlots(p.inventory) === 28 ? nearest(p, (o) => o.kind === "bank") : objectById(order.objectId);
    if (target?.resourceId && !s.resources[target.id].available)
      target = nearest(p, (o) => o.resourceId === target!.resourceId && s.resources[o.id].available) ?? target;
  } else if (order.type === "craft") target = nearest(p, (o) => o.kind === RECIPES[order.recipeId].station && stationAvailable(s, o));
  else if (order.type === "bank" || order.type === "withdraw") target = order.type === "bank" && order.objectId
    ? objectById(order.objectId) : nearest(p, (o) => o.kind === "bank");
  else if (order.type === "buy" || order.type === "sell") target = objectById(order.shopId);
  else if (order.type === "quest") target = objectById(QUESTS[order.questId].giverId);
  else if (order.type === "interact" || order.type === "travel-service" || order.type === "gate") target = objectById(order.objectId);
  else return [];
  return target ? adjacent(p, target) ? [] : objectRoute(s, p.position, target) : null;
}
function beginPlayerOrder(s: RpgState, order: RpgOrder, path: TilePosition[]) {
  s.control.active = structuredClone(order); s.control.source = "player";
  s.player.path = path; s.player.action = null;
  if (order.type === "gather" && inventorySlots(s.player.inventory) === 28) {
    const bank = nearest(s.player, (o) => o.kind === "bank");
    if (bank) s.player.action = { kind: "bank", targetId: bank.id, duration: 1, remaining: 1 };
  }
  const questId = order.type === "quest" ? order.questId : order.type === "interact" && order.verb === "talk"
    ? objectById(order.objectId)?.questId : undefined;
  if (questId && !s.quests[questId].complete) {
    const q = QUESTS[questId];
    s.control.goal = { id: `quest-${q.id}`, kind: "quest", questId: q.id, title: q.name };
    s.control.steps = goalSteps(s, s.control.goal); s.control.thought = null;
  }
}
export function applyRpgCommand(
  s: RpgState,
  command: RpgCommand,
): { ok: boolean; message: string } {
  const ok = (message: string) => ({ ok: true, message }),
    fail = (message: string) => ({ ok: false, message });
  if (!object(command)) return fail("Invalid command.");
  if (command.type === "dialogue-choice") {
    if (!s.dialogue || s.tick >= s.dialogue.expiresAt || typeof command.choiceId !== "string" ||
      !s.dialogue.choices.some((choice) => choice.id === command.choiceId)) return fail("That dialogue choice is no longer available.");
    if (!chooseDialogue(s, command.choiceId)) return fail("That dialogue choice is not available.");
    s.control.thinkingUntil = s.tick + 1; return ok("Your choice guides the next stage.");
  }
  if (command.type === "cancel-order" || command.type === "reorder-order") {
    if (!integer(command.index, 7) || command.index >= s.control.queue.length)
      return fail("That queued intention does not exist.");
    if (command.type === "cancel-order") {
      removeOrder(s, command.index);
      return ok("Removed queued intention.");
    }
    if (command.direction !== -1 && command.direction !== 1)
      return fail("Invalid queue direction.");
    const next = command.index + command.direction;
    if (next < 0 || next >= s.control.queue.length)
      return fail("That intention is already at the edge.");
    [s.control.queue[command.index], s.control.queue[next]] = [
      s.control.queue[next],
      s.control.queue[command.index],
    ];
    if (s.control.directOrderIndex === command.index) s.control.directOrderIndex = next;
    else if (s.control.directOrderIndex === next) s.control.directOrderIndex = command.index;
    return ok("Reordered queued intention.");
  }
  if (command.type === "wait") {
    s.control.waiting = true;
    s.control.active = null;
    s.control.source = null;
    s.player.path = [];
    s.player.action = null;
    s.player.movement = null;
    s.player.previousPosition = { ...s.player.position };
    s.player.activity = "Waiting for your guidance";
    return ok("Alden will wait here; queued intentions are held.");
  }
  if (command.type === "resume") {
    s.control.waiting = false;
    s.control.thinkingUntil = s.tick + 1;
    return ok("Alden is considering his next intention.");
  }
  if (command.type === "style") {
    if (!["attack", "strength", "defence", "accurate", "rapid", "longrange"].includes(command.skill))
      return fail("Unknown combat style.");
    s.control.style = command.skill;
    if (s.player.action?.kind === "fight") s.player.action = null;
    return ok("Combat training style changed.");
  }
  if (command.type === "run") {
    if (typeof command.enabled !== "boolean")
      return fail("Choose running or walking.");
    if (command.enabled && s.player.runEnergy < 60)
      return fail(
        "Not enough run energy. Walk or wait to recover before running.",
      );
    s.control.running = command.enabled;
    return ok(
      command.enabled
        ? "Running enabled."
        : "Walking enabled; run energy will recover.",
    );
  }
  if (command.type === "goal") {
    if (!validGoal(command.goal))
      return fail("That ambition is not available.");
    s.control.goal = structuredClone(command.goal);
    delete s.control.progress;
    s.control.waiting = false;
    s.control.steps = goalSteps(s, command.goal);
    s.control.thought = null;
    finish(s);
    s.control.thinkingUntil = s.tick + 1;
    return ok(`Ambition: ${command.goal.title}`);
  }
  const order = command.type === "enqueue" ? command.order : command;
  if (!validOrder(order, worldForState(s)))
    return fail("This activity or target is not available.");
  const pendingInventory = s.control.source === "player" && !!s.control.active && inventoryOrder(s.control.active);
  const keepEngagement = s.control.active?.type === "attack" && inventoryOrder(order);
  const deferred = command.type === "enqueue" || pendingInventory || keepEngagement;
  const problem = orderProblem(s, order, deferred);
  if (problem) return fail(problem);
  if (deferred) {
    if (command.type !== "enqueue" && !inventoryOrder(order) && s.control.directOrderIndex !== undefined) {
      s.control.queue[s.control.directOrderIndex] = structuredClone(order);
      s.control.waiting = false;
      return ok("Replaced the pending direct intention; inventory actions remain in order.");
    }
    if (s.control.queue.length >= 8)
      return fail("The intention queue is full.");
    if (command.type === "enqueue") s.control.queue.push(structuredClone(order));
    else {
      const firstWorld = s.control.queue.findIndex((pending) => !inventoryOrder(pending));
      const index = firstWorld < 0 ? s.control.queue.length : firstWorld;
      s.control.queue.splice(index, 0, structuredClone(order));
      if (s.control.directOrderIndex !== undefined && s.control.directOrderIndex >= index) s.control.directOrderIndex++;
      if (!inventoryOrder(order)) s.control.directOrderIndex = index;
    }
    if (command.type === "enqueue" && s.control.source === "autonomous") finish(s);
    s.control.waiting = false;
    return ok("Added to the intention queue.");
  }
  const path = orderRoute(s, order);
  if (!path) return fail("That target is blocked or unreachable.");
  if (!inventoryOrder(order) && s.control.directOrderIndex !== undefined) removeOrder(s, s.control.directOrderIndex);
  s.control.waiting = false;
  beginPlayerOrder(s, order, path);
  s.control.reason = "Following your direct intention.";
  return ok("Following your intention.");
}
export function reconcileRpg(s: RpgState, now: number) {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8.64e15)
    throw Error("Invalid reconciliation time");
  const elapsed = Math.max(0, now - s.savedAt),
    effective = Math.min(elapsed, 86400000) * 0.25 + s.offlineRemainder,
    ticks = Math.floor(effective / TICK_MS);
  s.offlineRemainder = effective % TICK_MS;
  stepRpg(s, ticks);
  s.savedAt = Math.max(s.savedAt, now);
  s.calendar = calendarDate(s.savedAt);
  return { state: s, ticks };
}
function stacks(v: unknown, capacity = Infinity): v is ItemStack[] {
  return (
    Array.isArray(v) &&
    v.length <= Object.keys(ITEMS).length &&
    v.every(
      (i) =>
        object(i) &&
        typeof i.itemId === "string" &&
        Object.hasOwn(ITEMS, i.itemId) &&
        positive(i.quantity),
    ) &&
    new Set(v.map((i) => i.itemId)).size === v.length &&
    inventorySlots(v) <= capacity
  );
}
const text = (v: unknown, max = 500): v is string =>
  typeof v === "string" && v.length <= max;
const coordinatePosition = (v: unknown): v is TilePosition => object(v) && v.worldId === WORLD.id && v.plane === 0 &&
  integer(v.x, WORLD.width - 1) && integer(v.y, WORLD.height - 1);
const samePosition = (a: TilePosition, b: TilePosition) => a.worldId === b.worldId && a.plane === b.plane && a.x === b.x && a.y === b.y;
function validPresentationState(v: Record<string, unknown>) {
  if (!integer(v.tick) || !integer(v.effectSequence) || !integer(v.messageSequence) ||
    !Array.isArray(v.effects) || v.effects.length > 64 || !Array.isArray(v.messages) || v.messages.length > 100) return false;
  const actorId = (id: unknown) => typeof id === "string" && (id === "player" || /^npc-([1-9]|1\d|2[0-3])$/.test(id) || ENEMY_SPAWNS.some((e) => e.id === id));
  const kinds = ["gather", "craft", "fight", "bank", "buy", "sell", "quest", "recover", "rest", "eat", "practice"];
  let lastId = 0, lastTick = 0;
  for (const effect of v.effects) {
    if (!object(effect) || !positive(effect.id, v.effectSequence) || effect.id <= lastId || !integer(effect.tick, v.tick) || effect.tick < lastTick ||
      !["action-start", "action-result", "projectile", "hit", "defeat"].includes(effect.kind as string) ||
      !actorId(effect.actorId) || !coordinatePosition(effect.position) ||
      (effect.targetId !== undefined && !actorId(effect.targetId) && !(typeof effect.targetId === "string" && !!objectById(effect.targetId))) ||
      (effect.targetPosition !== undefined && !coordinatePosition(effect.targetPosition)) ||
      (effect.actionKind !== undefined && !kinds.includes(effect.actionKind as string)) ||
      (effect.success !== undefined && typeof effect.success !== "boolean") ||
      (effect.amount !== undefined && !integer(effect.amount, 2_000_000_000))) return false;
    lastId = effect.id; lastTick = effect.tick;
  }
  if (v.effects.length && lastId !== v.effectSequence) return false;
  lastId = 0; lastTick = 0;
  for (const message of v.messages) {
    if (!object(message) || !positive(message.id, v.messageSequence) || message.id <= lastId || !integer(message.tick, v.tick) || message.tick < lastTick ||
      !["event", "dialogue"].includes(message.category as string) || !text(message.key, 200) || !message.key ||
      !text(message.text, 1000) || !message.text || !positive(message.count)) return false;
    lastId = message.id; lastTick = message.tick;
  }
  return !v.messages.length || lastId === v.messageSequence;
}
export function validateRpgSave(v: unknown): RpgState | null {
  try {
    if (!object(v) || !object(v.quests)) return null;
    v = structuredClone(v);
    if (!object(v) || !object(v.quests)) return null;
    const candidate = v as unknown as RpgState;
    if (v.version !== 3 && v.version !== 4 && v.version !== 5) return null;
    const oldVersion = v.version, migrated = oldVersion !== 5;
    const hasRevision = v.worldRevision !== undefined, hasGates = v.gates !== undefined;
    if (hasRevision !== hasGates || hasRevision && (v.worldRevision !== 2 || !object(v.gates) ||
      Object.keys(v.gates).length !== GATE_IDS.length || !GATE_IDS.every((id) => typeof candidate.gates[id] === "boolean"))) return null;
    const worldMigrated = migrated || !hasRevision;
    if (!hasRevision) { v.worldRevision = 2; v.gates = { ...DEFAULT_GATES }; }
    if (migrated) {
      v.version = 5; v.effects = []; v.effectSequence = 0; v.messages = []; v.messageSequence = 0;
      if (object(v.control)) delete v.control.directOrderIndex;
      if (!Array.isArray(v.npcs)) return null;
      for (const actor of [v.player, ...v.npcs]) {
        if (!object(actor) || !object(actor.skills)) return null;
        if (oldVersion === 3) { actor.skills.ranged ??= 0; actor.ammo ??= null; }
        actor.movement = null;
      }
    }
    // Additive G2 normalization never mutates the archived/public input object.
    if (migrated)
      normalizeQuestProgress(candidate);
    if (migrated && object(v.resources)) for (const o of WORLD.objects.filter((o) => o.resourceId))
      if (!Object.hasOwn(v.resources, o.id)) v.resources[o.id] = { objectId: o.id, available: true, respawnAt: 0 };
    if (migrated && Array.isArray(v.enemies)) for (const spawn of ENEMY_SPAWNS) {
      if (!v.enemies.some((entry) => object(entry) && entry.id === spawn.id))
        v.enemies.push({ ...spawn, position: { ...spawn.position }, home: { ...spawn.position },
          health: ENEMIES[spawn.definitionId].health, respawnAt: 0, cooldown: 0, engagedUntil: 0 });
    }
    if (migrated && Array.isArray(v.shops)) for (const definition of Object.values(SHOPS)) {
      const shop = v.shops.find((entry) => object(entry) && entry.id === definition.id);
      if (!shop) v.shops.push({ id: definition.id, stock: Object.fromEntries(Object.entries(definition.stock).map(([id, entry]) => [id, entry.max])), restockAt: 100 });
      else if (object(shop) && object(shop.stock)) {
        const old = shop.stock;
        shop.stock = Object.fromEntries(Object.entries(definition.stock).map(([id, entry]) => [id, Object.hasOwn(old, id) ? old[id] : entry.max]));
      }
    }
    if (worldMigrated) {
      const actors = [candidate.player, ...candidate.npcs];
      for (const actor of actors) actor.movement = null;
      const coordinate = (p: TilePosition) => p?.worldId === WORLD.id && p.plane === 0 &&
        Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < WORLD.width && p.y >= 0 && p.y < WORLD.height;
      if (actors.some((actor) => !coordinate(actor.position) || !coordinate(actor.previousPosition) ||
        !Array.isArray(actor.path) || actor.path.some((p) => !coordinate(p)))) return null;
      const changed = actors.some((actor) => {
        if (!isWalkable(actor.position, worldForState(candidate)) || !isWalkable(actor.previousPosition, worldForState(candidate))) return true;
        let prior = actor.position;
        return actor.path.some((p) => { const legal = canStep(prior, p, worldForState(candidate)); prior = p; return !legal; });
      }) || [...candidate.enemies.map((e) => e.position), ...candidate.drops.map((d) => d.position),
        ...(candidate.grave ? [candidate.grave.position] : [])].some((p) => coordinate(p) && !isWalkable(p, worldForState(candidate)));
      if (changed) repairRpgPositions(candidate);
    }
    const w = worldForState(v as unknown as RpgState);
    if (
      v.version !== 5 ||
      v.worldRevision !== 2 || !object(v.gates) || Object.keys(v.gates).length !== GATE_IDS.length ||
      !GATE_IDS.every((id) => typeof candidate.gates[id] === "boolean") ||
      !integer(v.tick) ||
      !integer(v.savedAt, 8.64e15) ||
      !integer(v.seed, 4294967295) ||
      typeof v.calendar !== "string" ||
      v.calendar !== calendarDate(v.savedAt) ||
      !(
        typeof v.offlineRemainder === "number" &&
        Number.isFinite(v.offlineRemainder) &&
        v.offlineRemainder >= 0 &&
        v.offlineRemainder < TICK_MS
      ) ||
      !object(v.control) ||
      !Array.isArray(v.npcs) ||
      v.npcs.length !== 23 ||
      !stacks(v.bank) ||
      !Array.isArray(v.shops) ||
      v.shops.length !== Object.keys(SHOPS).length ||
      !Array.isArray(v.enemies) ||
      v.enemies.length !== ENEMY_SPAWNS.length ||
      !object(v.resources) ||
      Object.keys(v.quests).length !== Object.keys(QUESTS).length ||
      !Array.isArray(v.journal) ||
      v.journal.length > 60 ||
      !v.journal.every((i) => text(i)) || !validPresentationState(v)
    )
      return null;
    if (v.rewards !== undefined) {
      if (!Array.isArray(v.rewards) || v.rewards.length > 32) return null;
      let lastId = 0,
        lastTick = 0;
      for (const event of v.rewards) {
        if (
          !object(event) ||
          typeof event.id !== "string" ||
          !/^reward-[1-9]\d*$/.test(event.id) ||
          !positive(Number(event.id.slice(7)), v.tick) ||
          Number(event.id.slice(7)) <= lastId ||
          !positive(event.tick, v.tick) ||
          event.tick <= lastTick ||
          !stacks(event.items, 28) ||
          !object(event.xp) ||
          !Object.entries(event.xp).every(
            ([skill, xp]) =>
              (SKILLS as readonly string[]).includes(skill) && positive(xp),
          ) ||
          (!event.items.length && !Object.keys(event.xp).length)
        )
          return null;
        lastId = Number(event.id.slice(7));
        lastTick = event.tick;
      }
    }
    for (const id of Object.keys(QUESTS)) {
      const q = v.quests[id];
      if (
        !object(q) ||
        typeof q.accepted !== "boolean" ||
        typeof q.complete !== "boolean" ||
        !integer(q.kills, QUESTS[id].kills?.quantity ?? 0) ||
        (q.complete && !q.accepted) ||
        (!q.accepted && q.kills !== 0)
      )
        return null;
      const definition = QUESTS[id];
      if (typeof q.stageId !== "string" ||
        !["ready", "complete", ...(definition.stages ?? []).map((stage) => stage.id)].includes(q.stageId) ||
        (q.complete && q.stageId !== "complete") || !object(q.counters) || !object(q.choices) ||
        Object.entries(q.counters).some(([key, value]) => !integer(value, 10000) ||
          !(definition.stages ?? []).some((stage) => key === stage.id || key === `delivered-${stage.id}`)) ||
        Object.entries(q.choices).some(([key, value]) => !(definition.stages ?? []).some((stage) => stage.id === key && stage.choices?.some((choice) => choice.id === value)))) return null;
      if (q.complete && q.kills < (QUESTS[id].kills?.quantity ?? 0))
        return null;
    }
    for (const [i, e] of v.enemies.entries()) {
      const spawn = ENEMY_SPAWNS[i];
      if (
        !object(e) ||
        e.id !== spawn.id ||
        e.definitionId !== spawn.definitionId ||
        !position(e.position, w) ||
        !position(e.home, w) ||
        e.home.x !== spawn.position.x ||
        e.home.y !== spawn.position.y ||
        distance(e.position, e.home) > 8 ||
        !integer(e.health, ENEMIES[spawn.definitionId].health) ||
        !integer(e.respawnAt) ||
        !integer(e.engagedUntil) ||
        !integer(e.cooldown, ENEMIES[spawn.definitionId].attackTicks) ||
        (e.health === 0 ? e.respawnAt <= v.tick : e.respawnAt !== 0)
      )
        return null;
    }
    if (!Array.isArray(v.drops) || v.drops.length > ENEMY_SPAWNS.length * 2)
      return null;
    const dropIds = new Set<string>();
    for (const d of v.drops) {
      if (
        !object(d) ||
        typeof d.id !== "string" ||
        !ENEMY_SPAWNS.some((e) => `loot-${e.id}` === d.id || `arrows-${e.id}` === d.id) ||
        dropIds.has(d.id) ||
        !position(d.position, w) ||
        !stacks(d.items) ||
        !d.items.length ||
        d.expiresAt !== 0
      )
        return null;
      if ((d.id as string).startsWith("arrows-") && !(d.items as ItemStack[]).every((item) => !!ITEMS[item.itemId].ammoTier)) return null;
      dropIds.add(d.id);
    }
    if (
      v.grave !== null &&
      (!object(v.grave) ||
        !position(v.grave.position, w) ||
        !stacks(v.grave.items) ||
        !v.grave.items.length ||
        !integer(v.grave.attempts) ||
        !integer(v.grave.retryAt))
    )
      return null;
    for (const [index, p] of [v.player, ...v.npcs].entries()) {
      if (
        !object(p) ||
        p.id !== index ||
        !text(p.name, 100) ||
        !text(p.role, 100) ||
        !TOWNS.some((t) => t.id === p.home) ||
        !position(p.position, w) ||
        !position(p.previousPosition, w) ||
        !Array.isArray(p.path) ||
        p.path.length > 2000 ||
        !p.path.every((t) => position(t, w)) ||
        !object(p.skills) ||
        Object.keys(p.skills).length !== SKILLS.length ||
        !SKILLS.every((k) =>
          integer((p.skills as Record<string, unknown>)[k], 2_000_000_000),
        ) ||
        !stacks(p.inventory, 28) ||
        !stacks(p.bank) ||
        !object(p.equipment) ||
        !(p.ammo === null || object(p.ammo) && typeof p.ammo.itemId === "string" &&
          !!ITEMS[p.ammo.itemId]?.ammoTier && positive(p.ammo.quantity)) ||
        !positive(p.health, 99) ||
        p.health > levelForXp(p.skills.hitpoints as number) ||
        !integer(p.runEnergy, 10000) ||
        !integer(p.completed) ||
        !text(p.activity)
      )
        return null;
      let last = p.position;
      if (p.movement !== null) {
        const movement = p.movement, actor = p as unknown as ActorState;
        if (!object(movement) || !positive(movement.tick, v.tick) || movement.tick !== v.tick ||
          !["walk", "run"].includes(movement.mode as string) || !Array.isArray(movement.tiles) ||
          movement.tiles.length < 2 || movement.tiles.length > (movement.mode === "walk" ? 2 : 3) ||
          !movement.tiles.every((point) => position(point, w)) ||
          !samePosition(movement.tiles[0], actor.previousPosition) || !samePosition(movement.tiles.at(-1)!, actor.position)) return null;
        for (let i = 1; i < movement.tiles.length; i++) if (!canStep(movement.tiles[i - 1], movement.tiles[i], w)) return null;
      }
      if (ITEMS[(p.equipment as ActorState["equipment"]).weapon ?? ""]?.twoHanded &&
        (p.equipment as ActorState["equipment"]).shield) return null;
      for (const next of p.path) {
        if (!canStep(last, next, w)) return null;
        last = next;
      }
      for (const [slot, id] of Object.entries(p.equipment)) {
        if (
          typeof id !== "string" ||
          !Object.hasOwn(ITEMS, id) ||
          ITEMS[id].slot !== slot
        )
          return null;
        const item = ITEMS[id],
          skills = p.skills as ActorState["skills"];
        if (
          levelForXp(skills.attack) < (item.attackLevel ?? 1) ||
          levelForXp(skills.defence) < (item.defenceLevel ?? 1) ||
          levelForXp(skills.ranged) < (item.rangedLevel ?? 1) ||
          (item.skill && levelForXp(skills[item.skill]) < (item.level ?? 1))
        )
          return null;
      }
      if (p.action !== null) {
        const a = p.action;
        if (
          !object(a) ||
          typeof a.kind !== "string" ||
          !["gather", "craft", "bank", "rest", "fight", "practice"].includes(a.kind) ||
          !positive(a.duration, 100) ||
          !positive(a.remaining, a.duration)
        )
          return null;
        if (a.kind === "practice" && (index !== 0 || a.targetId !== "bowyer-target" || a.duration !== 4 ||
          currentQuestStage(candidate, "bowyer")?.kind !== "practice" || !candidate.quests.bowyer.accepted ||
          !itemCount((p as unknown as ActorState).inventory, "training-bow") ||
          !itemCount((p as unknown as ActorState).inventory, "training-arrow"))) return null;
        if (
          a.kind === "fight" &&
          (index !== 0 ||
            typeof a.targetId !== "string" ||
            !ENEMY_SPAWNS.some((e) => e.id === a.targetId) ||
            a.duration !==
              attackDuration(p as unknown as ActorState, candidate.control.style))
        )
          return null;
        if (a.kind === "gather") {
          if (
            typeof a.targetId !== "string" ||
            !objectById(a.targetId)?.resourceId
          )
            return null;
          const r = RESOURCES[objectById(a.targetId)!.resourceId!],
            actor = p as unknown as ActorState;
          if (gatherProblem(actor, r)) return null;
          const ticks =
            r.skill === "mining"
              ? r.ticks - ((toolFor(actor, r)!.tier ?? 1) - 1)
              : r.ticks;
          if (a.duration !== ticks) return null;
        }
        if (
          a.kind === "craft" &&
          (typeof a.recipeId !== "string" ||
            !Object.hasOwn(RECIPES, a.recipeId) ||
            a.duration !== RECIPES[a.recipeId].ticks ||
            craftProblem(p as unknown as ActorState, a.recipeId))
        )
          return null;
        if (
          a.kind === "bank" &&
          (typeof a.targetId !== "string" ||
            objectById(a.targetId)?.kind !== "bank")
        )
          return null;
      }
    }
    const c = v.control;
    if (c.progress !== undefined && (!object(c.progress) || !text(c.progress.goalId, 100) ||
      !text(c.progress.fingerprint, 10000) || !integer(c.progress.tick, v.tick) ||
      !integer(c.progress.failures, 10000) || !integer(c.progress.blockedUntil))) return null;
    if (v.dialogue !== undefined && v.dialogue !== null) {
      const d = v.dialogue;
      if (!object(d) || typeof d.questId !== "string" || !Object.hasOwn(QUESTS, d.questId) ||
        !text(d.id, 100) || !text(d.text) || !integer(d.expiresAt) || d.expiresAt <= v.tick ||
        typeof d.targetId !== "string" || !objectById(d.targetId) || !Array.isArray(d.choices)) return null;
      const stage = currentQuestStage(candidate, d.questId);
      if (stage?.kind !== "choice" || stage.targetId !== d.targetId ||
        JSON.stringify(d.choices) !== JSON.stringify(stage.choices?.map(({ id, label }) => ({ id, label })))) return null;
    }
    if (!integer(c.eatReadyAt)) return null;
    if (
      typeof c.waiting !== "boolean" ||
      (c.running !== undefined && typeof c.running !== "boolean") ||
      !Array.isArray(c.queue) ||
      c.queue.length > 8 ||
      !c.queue.every((o) => validOrder(o, w)) ||
      (c.directOrderIndex !== undefined && (!integer(c.directOrderIndex, c.queue.length - 1) || inventoryOrder(c.queue[c.directOrderIndex] as RpgOrder))) ||
      !(c.active === null || validOrder(c.active, w)) ||
      !(c.goal === null || validGoal(c.goal)) ||
      !integer(c.thinkingUntil) ||
      !text(c.reason) ||
      !Array.isArray(c.steps) ||
      c.steps.length > 10 ||
      !c.steps.every((i) => text(i)) ||
      typeof c.style !== "string" ||
      !["attack", "strength", "defence", "accurate", "rapid", "longrange"].includes(c.style) ||
      !Array.isArray(c.visited) ||
      c.visited.length > WORLD.objects.length ||
      !c.visited.every((i) => typeof i === "string" && !!objectById(i)) ||
      new Set(c.visited).size !== c.visited.length ||
      !integer(c.lastThought) ||
      ![undefined, null, "player", "autonomous"].includes(
        c.source as undefined,
      ) ||
      (c.active === null && c.source != null)
    )
      return null;
    if (
      c.waiting &&
      (c.active !== null ||
        (v.player as ActorState).action !== null ||
        (v.player as ActorState).path.length)
    )
      return null;
    const playerAction = (v.player as ActorState).action;
    if (playerAction && c.active === null) return null;
    if (playerAction?.kind === "practice" && (!object(c.active) || c.active.type !== "interact" ||
      c.active.verb !== "practice" || c.active.objectId !== playerAction.targetId)) return null;
    if (
      playerAction?.kind === "gather" &&
      (!object(c.active) ||
        c.active.type !== "gather" ||
        c.active.objectId !== playerAction.targetId)
    )
      return null;
    if (
      playerAction?.kind === "craft" &&
      (!object(c.active) ||
        c.active.type !== "craft" ||
        c.active.recipeId !== playerAction.recipeId)
    )
      return null;
    if (
      playerAction?.kind === "fight" &&
      (!object(c.active) ||
        c.active.type !== "attack" ||
        c.active.enemyId !== playerAction.targetId)
    )
      return null;
    if (c.thought !== null) {
      const t = c.thought;
      if (
        !object(t) ||
        !text(t.id, 100) ||
        !text(t.title) ||
        !text(t.body) ||
        !integer(t.expiresAt) ||
        !Array.isArray(t.choices) ||
        t.choices.length < 2 ||
        t.choices.length > 3 ||
        !t.choices.every(
          (ch) =>
            object(ch) &&
            text(ch.id, 100) &&
            text(ch.label) &&
            text(ch.description) &&
            validGoal(ch.goal),
        )
      )
        return null;
    }
    const resourceIds = WORLD.objects
      .filter((o) => o.resourceId)
      .map((o) => o.id);
    if (Object.keys(v.resources).length !== resourceIds.length) return null;
    for (const id of resourceIds) {
      const r = v.resources[id];
      if (
        !object(r) ||
        r.objectId !== id ||
        typeof r.available !== "boolean" ||
        !integer(r.respawnAt) ||
        (r.available ? r.respawnAt !== 0 : r.respawnAt <= v.tick)
      )
        return null;
    }
    const ids = new Set<string>();
    for (const shop of v.shops) {
      if (
        !object(shop) ||
        typeof shop.id !== "string" ||
        !Object.hasOwn(SHOPS, shop.id) ||
        ids.has(shop.id) ||
        !object(shop.stock) ||
        !integer(shop.restockAt) ||
        Object.keys(shop.stock).length !==
          Object.keys(SHOPS[shop.id].stock).length ||
        !Object.keys(SHOPS[shop.id].stock).every((id) =>
          integer((shop.stock as Record<string, unknown>)[id], 2_000_000_000),
        )
      )
        return null;
      ids.add(shop.id);
    }
    return structuredClone(v) as unknown as RpgState;
  } catch {
    return null;
  }
}
