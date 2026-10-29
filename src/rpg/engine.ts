import {
  SKILLS,
  TICK_MS,
  type ActorState,
  type RpgState,
  type RpgCommand,
  type TilePosition,
} from "./types";
import { WORLD, TOWNS, isWalkable, canStep, findPath } from "./world";
import { startingSkills } from "./skills";
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
    const position = { ...WORLD.spawns[id]! };
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
                ? "builder"
                : "smith",
      home: id < 8 ? "oakrest" : id < 16 ? "briarford" : "stonehaven",
      position,
      previousPosition: { ...position },
      path: [],
      skills: startingSkills(),
      inventory: [],
      equipment: {},
      health: 10,
      runEnergy: 10000,
      action: null,
      activity: "Considering the road ahead",
      completed: 0,
      bank: [],
    };
  });
  actors[0]!.inventory = [
    { itemId: "coins", quantity: 25 },
    { itemId: "bronze-axe", quantity: 1 },
    { itemId: "bronze-pickaxe", quantity: 1 },
    { itemId: "small-net", quantity: 1 },
    { itemId: "hammer", quantity: 1 },
    { itemId: "cooked-shrimp", quantity: 6 },
  ];
  actors[0]!.equipment = {
    weapon: "bronze-sword",
    shield: "bronze-shield",
    cape: "prince-cape",
  };
  return {
    version: 3,
    tick: 0,
    savedAt: now,
    calendar: calendarDate(now),
    offlineRemainder: 0,
    seed,
    player: actors[0]!,
    npcs: actors.slice(1),
    resources: Object.fromEntries(
      WORLD.objects
        .filter((o) => o.resourceId)
        .map((o) => [o.id, { objectId: o.id, available: true, respawnAt: 0 }]),
    ),
    bank: [],
    shops: TOWNS.map((t) => ({ id: t.id, stock: {}, restockAt: 0 })),
    enemies: [],
    quests: {},
    grave: null,
    control: {
      waiting: false,
      active: null,
      queue: [],
      goal: null,
      thinkingUntil: 6,
      reason: "I should learn my way around Oakrest.",
      steps: [],
      style: "attack",
      visited: [],
      thought: null,
      lastThought: 0,
    },
    journal: [
      "A new chapter begins. Earlier village chronicles remain archived.",
    ],
  };
}
function travel(p: ActorState) {
  p.previousPosition = { ...p.position };
  let steps = p.runEnergy > 0 ? 2 : 1;
  while (steps-- && p.path.length) {
    const next = p.path[0]!;
    if (!canStep(p.position, next)) {
      p.path = [];
      p.activity = "The route changed; considering another path";
      return;
    }
    p.position = { ...next };
    p.path.shift();
    if (steps >= 0 && p.runEnergy > 0)
      p.runEnergy = Math.max(0, p.runEnergy - 60);
  }
  if (!p.path.length) p.activity = "Reached the destination";
}
export function stepRpg(s: RpgState, count = 1): RpgState {
  if (!Number.isInteger(count) || count < 0 || count > 36000)
    throw Error("Invalid tick count");
  for (let n = 0; n < count; n++) {
    s.tick++;
    for (const p of [s.player, ...s.npcs]) {
      p.previousPosition = { ...p.position };
      if (p.id === 0 && s.control.waiting) continue;
      if (p.path.length) {
        travel(p);
        if (p.id === 0 && !p.path.length && s.control.active?.type === "move") {
          s.control.active = null;
          s.control.thinkingUntil = s.tick + 6;
        }
        continue;
      }
      p.runEnergy = Math.min(10000, p.runEnergy + 15);
      if (p.id > 0 && s.tick % 20 === p.id % 20) {
        const town = TOWNS.find((t) => t.id === p.home)!;
        const locations = WORLD.objects.filter(
          (o) =>
            o.position.worldId === p.position.worldId &&
            o.id.startsWith(town.id) &&
            o.kind === "landmark",
        );
        const to =
          locations[
            (Math.floor(s.tick / 20) + p.id) % Math.max(1, locations.length)
          ]?.position ?? town.position;
        p.path = findPath(p.position, to) ?? [];
        p.activity = "Walking around " + town.name;
      }
    }
  }
  return s;
}
export function applyRpgCommand(
  s: RpgState,
  command: RpgCommand,
): { ok: boolean; message: string } {
  if (command.type === "wait") {
    s.control.waiting = true;
    s.player.path = [];
    s.player.action = null;
    s.player.activity = "Waiting for your guidance";
    return { ok: true, message: "Alden will wait here." };
  }
  if (command.type === "resume") {
    s.control.waiting = false;
    s.control.thinkingUntil = s.tick + 6;
    return { ok: true, message: "Alden is considering his next intention." };
  }
  if (command.type === "move") {
    const path = findPath(s.player.position, command.position);
    if (!path)
      return { ok: false, message: "That tile is blocked or unreachable." };
    s.control.waiting = false;
    s.control.active = command;
    s.player.path = path;
    s.player.action = null;
    s.player.activity = "Traveling to the selected tile";
    s.control.reason = "Following your tile destination.";
    return { ok: true, message: "Following the tile route." };
  }
  return {
    ok: false,
    message: "This activity is being prepared for the next stage.",
  };
}
export function reconcileRpg(s: RpgState, now: number) {
  const elapsed = Math.max(0, now - s.savedAt),
    effective = Math.min(elapsed, 86400000) * 0.25 + s.offlineRemainder,
    ticks = Math.floor(effective / TICK_MS);
  s.offlineRemainder = effective % TICK_MS;
  stepRpg(s, ticks);
  s.savedAt = Math.max(s.savedAt, now);
  s.calendar = calendarDate(s.savedAt);
  return { state: s, ticks };
}
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, max = 1e12): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
function position(v: unknown): v is TilePosition {
  return (
    object(v) &&
    v.worldId === WORLD.id &&
    v.plane === 0 &&
    integer(v.x, WORLD.width - 1) &&
    integer(v.y, WORLD.height - 1) &&
    isWalkable(v as unknown as TilePosition)
  );
}
export function validateRpgSave(v: unknown): RpgState | null {
  try {
    if (
      !object(v) ||
      v.version !== 3 ||
      !integer(v.tick) ||
      !integer(v.savedAt, 8.64e15) ||
      !integer(v.seed, 4294967295) ||
      !(
        typeof v.offlineRemainder === "number" &&
        Number.isFinite(v.offlineRemainder) &&
        v.offlineRemainder >= 0 &&
        v.offlineRemainder < 600
      ) ||
      !object(v.control) ||
      !Array.isArray(v.npcs) ||
      v.npcs.length !== 23 ||
      !Array.isArray(v.bank) ||
      !Array.isArray(v.shops) ||
      !Array.isArray(v.enemies) ||
      !object(v.resources) ||
      !object(v.quests) ||
      !Array.isArray(v.journal)
    )
      return null;
    for (const p of [v.player, ...v.npcs]) {
      if (
        !object(p) ||
        !integer(p.id, 23) ||
        typeof p.name !== "string" ||
        !position(p.position) ||
        !position(p.previousPosition) ||
        !Array.isArray(p.path) ||
        p.path.length > 2000 ||
        !p.path.every(position) ||
        !object(p.skills) ||
        !SKILLS.every((k) =>
          integer((p.skills as Record<string, unknown>)[k], 2000000000),
        ) ||
        !Array.isArray(p.inventory) ||
        !object(p.equipment) ||
        !integer(p.health, 99) ||
        !integer(p.runEnergy, 10000)
      )
        return null;
      let last = p.position;
      for (const next of p.path) {
        if (!canStep(last, next)) return null;
        last = next;
      }
    }
    if (
      typeof v.control.waiting !== "boolean" ||
      !Array.isArray(v.control.queue) ||
      v.control.queue.length > 8 ||
      !integer(v.control.thinkingUntil) ||
      typeof v.control.reason !== "string"
    )
      return null;
    return structuredClone(v) as unknown as RpgState;
  } catch {
    return null;
  }
}
