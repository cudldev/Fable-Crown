import type {
  ResourceId,
  Terrain,
  TilePosition,
  WorldDefinition,
  WorldObject,
  RpgState,
} from "./types";
export { findPath, pathToObject } from "./pathfinding";

export const COLLISION = {
  BLOCKED: 1,
  NORTH: 2,
  EAST: 4,
  SOUTH: 8,
  WEST: 16,
} as const;
export const tile = (
  x: number,
  y: number,
  worldId = "frontier",
  plane = 0,
): TilePosition => ({ worldId, x, y, plane });
export const TOWNS = [
  { id: "oakrest", name: "Oakrest", position: tile(52, 95) },
  { id: "briarford", name: "Briarford", position: tile(151, 43) },
  { id: "stonehaven", name: "Stonehaven", position: tile(207, 142) },
];

function buildFrontier(): WorldDefinition {
  const width = 256,
    height = 192;
  const world: WorldDefinition = {
    id: "frontier",
    name: "The Green Marches",
    width,
    height,
    chunkSize: 32,
    terrain: Array<Terrain>(width * height).fill("grass"),
    collision: Array<number>(width * height).fill(0),
    objects: [],
    spawns: [],
    portals: [],
  };
  const paint = (x: number, y: number, terrain: Terrain, blocked = false) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    world.terrain[y * width + x] = terrain;
    world.collision[y * width + x] = blocked ? COLLISION.BLOCKED : 0;
  };
  // Authored coordinate fields give repeatable ground variation without runtime RNG.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const highland =
        (x > 218 && y < 57) ||
        (x > 231 && y > 112) ||
        (x < 22 && y > 36 && y < 61);
      if (highland) paint(x, y, "stone");
      else if ((x * 17 + y * 31 + Math.floor(x / 11) * 7) % 113 < 5)
        paint(x, y, "dirt");
      if (x >= 114 && x <= 123) paint(x, y, "sand");
      if (x >= 116 && x <= 121) paint(x, y, "water", true);
      if (
        (x - 29) ** 2 + (y - 150) ** 2 < 45 ||
        (x - 191) ** 2 + (y - 77) ** 2 < 24
      )
        paint(x, y, "water", true);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1)
        world.collision[y * width + x] |= COLLISION.BLOCKED;
    }
  const road = (points: number[][]) => {
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1],
        [bx, by] = points[i];
      const length = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let j = 0; j <= length; j++) {
        const x = Math.round(ax + ((bx - ax) * j) / Math.max(1, length));
        const y = Math.round(ay + ((by - ay) * j) / Math.max(1, length));
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const index = (y + dy) * width + x + dx;
            if (world.terrain[index] !== "water") world.terrain[index] = "dirt";
          }
      }
    }
  };
  road([
    [52, 95],
    [93, 95],
    [110, 47],
    [130, 47],
    [151, 43],
  ]);
  road([
    [52, 95],
    [94, 115],
    [110, 129],
    [134, 129],
    [207, 142],
  ]);
  road([
    [151, 43],
    [174, 91],
    [207, 142],
  ]);
  const add = (
    id: string,
    name: string,
    kind: WorldObject["kind"],
    x: number,
    y: number,
    w = 1,
    h = 1,
    blocks = false,
    art?: string,
    resourceId?: ResourceId,
  ): WorldObject => {
    const object: WorldObject = {
      id,
      name,
      kind,
      position: tile(x, y),
      width: w,
      height: h,
      blocks,
      ...(art ? { art } : {}),
      ...(resourceId ? { resourceId } : {}),
    };
    world.objects.push(object);
    if (blocks)
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          world.collision[(y + dy) * width + x + dx] |= COLLISION.BLOCKED;
    return object;
  };
  for (const [id, name, y] of [
    ["north-bridge", "Willow bridge", 47],
    ["south-bridge", "Pilgrim bridge", 129],
  ] as const) {
    for (let dy = -1; dy <= 1; dy++)
      for (let x = 114; x <= 123; x++) paint(x, y + dy, "stone");
    add(id, name, "bridge", 114, y - 1, 10, 3, false, "bridge");
    // Parapets block north/south exits along the span, without blocking travel across it.
    for (let x = 116; x <= 121; x++) {
      world.collision[(y - 1) * width + x] |= COLLISION.NORTH;
      world.collision[(y + 1) * width + x] |= COLLISION.SOUTH;
    }
  }
  for (const town of TOWNS) {
    const { x, y } = town.position;
    for (let dy = -7; dy <= 7; dy++)
      for (let dx = -9; dx <= 9; dx++) paint(x + dx, y + dy, "dirt");
    add(town.id, `${town.name} square`, "landmark", x, y);
    add(
      `${town.id}-bank`,
      `${town.name} bank`,
      "bank",
      x + 5,
      y + 2,
      4,
      3,
      true,
      "store",
    );
    add(
      `${town.id}-furnace`,
      `${town.name} furnace`,
      "furnace",
      x + 8,
      y - 5,
      2,
      2,
      true,
      "workshop",
    );
    add(
      `${town.id}-anvil`,
      `${town.name} anvil`,
      "anvil",
      x + 5,
      y - 3,
      1,
      1,
      true,
    );
    add(
      `${town.id}-range`,
      `${town.name} cooking range`,
      "range",
      x - 5,
      y - 3,
      2,
      2,
      true,
    );
    const shop = add(
      `${town.id}-shop`,
      `${town.name} supplies`,
      "shop",
      x - 9,
      y + 2,
      4,
      3,
      true,
      "house",
    );
    shop.shopId = `${town.id}-shop`;
    add(
      `${town.id}-home`,
      `${town.name} cottages`,
      "building",
      x - 7,
      y + 8,
      5,
      3,
      true,
      "house",
    );
    add(
      `${town.id}-workshop`,
      `${town.name} workshop`,
      "building",
      x + 5,
      y + 9,
      4,
      3,
      true,
      "workshop",
    );
    // Eight distinct legal positions per settlement, clear of all service footprints.
    for (let i = 0; i < 8; i++)
      world.spawns.push(tile(x - 3 + (i % 4), y + 1 + Math.floor(i / 4)));
  }
  add(
    "oakrest-manor",
    "Alden’s manor",
    "building",
    49,
    82,
    6,
    5,
    true,
    "manor",
  );
  add("hill-shrine", "Hill shrine", "landmark", 80, 53, 2, 2, false, "ruins");
  add("east-watch", "Eastern watch", "building", 235, 99, 5, 4, true, "ruins");
  for (const [id, name, townIndex, questId] of [
    ["quest-forge", "Master smith Ren", 0, "forge"],
    ["quest-supper", "Cook Hana", 1, "supper"],
    ["quest-road", "Warden Toma", 2, "road"],
  ] as const) {
    const p = TOWNS[townIndex].position;
    add(id, name, "quest", p.x + 2, p.y - 1).questId = questId;
  }
  const treeNames = {
    tree: "Mosswood tree",
    oak: "Old oak",
    willow: "River willow",
  };
  const groves = [
    [27, 85],
    [135, 22],
    [180, 143],
  ];
  const mines = [
    [75, 78],
    [174, 30],
    [228, 140],
  ];
  for (let cluster = 0; cluster < 3; cluster++) {
    const town = TOWNS[cluster];
    const [gx, gy] = groves[cluster],
      [mx, my] = mines[cluster];
    add(
      `${town.id}-forest`,
      `${town.name} woodland`,
      "landmark",
      gx - 2,
      gy + 4,
    );
    add(`${town.id}-mine`, `${town.name} quarry`, "landmark", mx - 2, my + 2);
    road([
      [town.position.x, town.position.y],
      [gx - 2, gy + 4],
    ]);
    road([
      [town.position.x, town.position.y],
      [mx - 2, my + 2],
    ]);
    for (let i = 0; i < 12; i++) {
      const resource = (["tree", "tree", "oak", "willow"] as const)[i % 4];
      add(
        `${town.id}-tree-${i}`,
        treeNames[resource],
        "tree",
        gx + (i % 4) * 3,
        gy + Math.floor(i / 4) * 4,
        2,
        2,
        true,
        "forest",
        resource,
      );
    }
    for (let i = 0; i < 10; i++) {
      const resource = (["copper", "tin", "iron", "coal", "copper"] as const)[
        i % 5
      ];
      const x = mx + (i % 5) * 3,
        y = my + Math.floor(i / 5) * 4;
      if (!(world.collision[y * width + x] & COLLISION.BLOCKED))
        paint(x, y, "stone");
      add(
        `${town.id}-ore-${i}`,
        `${resource[0].toUpperCase()}${resource.slice(1)} outcrop`,
        "rock",
        x,
        y,
        1,
        1,
        true,
        "ore",
        resource,
      );
    }
  }
  for (const [side, x, y] of [
    ["west", 115, 91],
    ["north-east", 122, 57],
    ["south-east", 122, 148],
  ] as const) {
    for (let i = 0; i < 3; i++) {
      const resource = (["shrimp", "sardine", "trout"] as const)[i];
      add(
        `fish-${side}-${resource}`,
        `${resource[0].toUpperCase()}${resource.slice(1)} fishing`,
        "fish",
        x,
        y + i * 3,
        1,
        1,
        false,
        undefined,
        resource,
      );
    }
  }
  return world;
}

export const WORLD = buildFrontier();
export const ENEMY_SPAWNS = [
  { id: "boar-0", definitionId: "boar", position: tile(65, 112) },
  { id: "boar-1", definitionId: "boar", position: tile(141, 63) },
  { id: "boar-2", definitionId: "boar", position: tile(196, 155) },
  { id: "rock-mite-0", definitionId: "rock-mite", position: tile(87, 69) },
  { id: "rock-mite-1", definitionId: "rock-mite", position: tile(183, 24) },
  { id: "rock-mite-2", definitionId: "rock-mite", position: tile(239, 148) },
  { id: "bandit-0", definitionId: "bandit", position: tile(107, 81) },
  { id: "bandit-1", definitionId: "bandit", position: tile(135, 112) },
  { id: "bandit-2", definitionId: "bandit", position: tile(216, 119) },
];
let roadWorld: WorldDefinition | undefined;
/** Only the unlocked static variant is cached; shared WORLD is never mutated. */
export function worldForState(
  state: Pick<RpgState, "quests">,
): WorldDefinition {
  if (!state.quests.road?.complete) return WORLD;
  if (!roadWorld) {
    roadWorld = {
      ...WORLD,
      terrain: [...WORLD.terrain],
      collision: [...WORLD.collision],
      objects: [...WORLD.objects],
    };
    for (let y = 94; y <= 96; y++)
      for (let x = 114; x <= 123; x++) {
        roadWorld.terrain[y * WORLD.width + x] = "stone";
        roadWorld.collision[y * WORLD.width + x] = 0;
      }
    roadWorld.objects.push({
      id: "road-bridge",
      name: "Restored Thorn-Road crossing",
      kind: "bridge",
      position: tile(114, 94),
      width: 10,
      height: 3,
      blocks: false,
      art: "bridge",
    });
  }
  return roadWorld;
}
export const WORLDS: Record<string, WorldDefinition> = { [WORLD.id]: WORLD };
export const objectsById: Record<string, WorldObject> = Object.fromEntries(
  WORLD.objects.map((object) => [object.id, object]),
);
export const getWorld = (id: string): WorldDefinition | undefined =>
  Object.hasOwn(WORLDS, id) ? WORLDS[id] : undefined;
export const objectById = (id: string): WorldObject | undefined =>
  Object.hasOwn(objectsById, id) ? objectsById[id] : undefined;

export function containsTile(
  position: TilePosition,
  world: WorldDefinition,
): boolean {
  return (
    position.worldId === world.id &&
    position.plane === 0 &&
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < world.width &&
    position.y < world.height
  );
}
export function terrainAt(
  position: TilePosition,
  world = getWorld(position.worldId),
): Terrain | undefined {
  return world && containsTile(position, world)
    ? world.terrain[position.y * world.width + position.x]
    : undefined;
}
export function isWalkable(
  position: TilePosition,
  world = getWorld(position.worldId),
): boolean {
  return (
    !!world &&
    containsTile(position, world) &&
    world.terrain[position.y * world.width + position.x] !== "water" &&
    !(
      world.collision[position.y * world.width + position.x] & COLLISION.BLOCKED
    )
  );
}
function cardinalStep(
  from: TilePosition,
  to: TilePosition,
  world: WorldDefinition,
): boolean {
  if (!isWalkable(from, world) || !isWalkable(to, world)) return false;
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const outgoing =
    dx > 0
      ? COLLISION.EAST
      : dx < 0
        ? COLLISION.WEST
        : dy > 0
          ? COLLISION.SOUTH
          : COLLISION.NORTH;
  const incoming =
    dx > 0
      ? COLLISION.WEST
      : dx < 0
        ? COLLISION.EAST
        : dy > 0
          ? COLLISION.NORTH
          : COLLISION.SOUTH;
  return (
    !(world.collision[from.y * world.width + from.x] & outgoing) &&
    !(world.collision[to.y * world.width + to.x] & incoming)
  );
}
export function canStep(
  from: TilePosition,
  to: TilePosition,
  world = getWorld(from.worldId),
): boolean {
  if (
    !world ||
    from.worldId !== to.worldId ||
    from.plane !== to.plane ||
    !isWalkable(from, world) ||
    !isWalkable(to, world)
  )
    return false;
  const dx = to.x - from.x,
    dy = to.y - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
  if (!dx || !dy) return cardinalStep(from, to, world);
  const across = { ...from, x: to.x },
    down = { ...from, y: to.y };
  // Both orthogonal routes must be legal: walls cannot be crossed at a corner.
  return (
    cardinalStep(from, across, world) &&
    cardinalStep(from, down, world) &&
    cardinalStep(across, to, world) &&
    cardinalStep(down, to, world)
  );
}

export function interactionTiles(
  object: WorldObject,
  world = getWorld(object.position.worldId),
): TilePosition[] {
  if (!world || !containsTile(object.position, world)) return [];
  const candidates: TilePosition[] = [];
  for (
    let y = object.position.y - 1;
    y <= object.position.y + object.height;
    y++
  ) {
    for (
      let x = object.position.x - 1;
      x <= object.position.x + object.width;
      x++
    ) {
      const inside =
        x >= object.position.x &&
        x < object.position.x + object.width &&
        y >= object.position.y &&
        y < object.position.y + object.height;
      if (inside && object.blocks) continue;
      const p = tile(x, y, world.id);
      if (isWalkable(p, world)) candidates.push(p);
    }
  }
  return candidates;
}
