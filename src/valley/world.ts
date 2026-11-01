import type { ResourceId, WorldDefinition, WorldObject, RpgState } from "../rpg/types";
import { canStep, COLLISION, isWalkable, tile, WORLD, worldForState, worldVariantKey } from "../rpg/world";
import { COTTAGE_TICKS, FIRST_BILL, FORGE_TICKS } from "./contracts";
import type { FurnitureId, GroundEdit, ValleyCommand, ValleyData, ValleyResult } from "./contracts";

/** Inclusive tile-centre bounds. x/z coordinates use the original frontier world. */
export const VALLEY_BOUNDS = { minX: 8, maxX: 87, minZ: 136, maxZ: 183 } as const;
export const OWNED_BOUNDS = { minX: 16, maxX: 79, minZ: 144, maxZ: 175 } as const;
export const VALLEY_ENTRANCE = { x: 48, z: 136 } as const;
export type QuarterTurn = 0 | 1 | 2 | 3;
export interface ValleyPoint { x: number; z: number }
export interface ValleyRect extends ValleyPoint { width: number; height: number }
/** Extra presentation metadata; original WorldObject fields remain valid. */
export interface ValleyWorldObject extends WorldObject {
  rotation?: QuarterTurn;
  groundPadHeight?: number;
  entrance?: ValleyPoint;
}
const boundsContain = (b: typeof VALLEY_BOUNDS | typeof OWNED_BOUNDS, x: number, z: number) =>
  Number.isFinite(x) && Number.isFinite(z) && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
export const inValley = (x: number, z: number): boolean => boundsContain(VALLEY_BOUNDS, x, z);
export const isOwned = (x: number, z: number): boolean => boundsContain(OWNED_BOUNDS, x, z);
const keyAt = (x: number, z: number) => `${x},${z}`;
const integerPoint = (x: number, z: number) => Number.isInteger(x) && Number.isInteger(z);
const quarterTurn = (r: number): r is QuarterTurn => Number.isInteger(r) && r >= 0 && r <= 3;
const inRect = (p: ValleyPoint, r: ValleyRect) => p.x >= r.x && p.x < r.x + r.width && p.z >= r.z && p.z < r.z + r.height;
const cells = (r: ValleyRect): ValleyPoint[] => {
  const result: ValleyPoint[] = [];
  for (let z = r.z; z < r.z + r.height; z++) for (let x = r.x; x < r.x + r.width; x++) result.push({ x, z });
  return result;
};
const objectRect = (o: WorldObject): ValleyRect => ({ x: o.position.x, z: o.position.y, width: o.width, height: o.height });
const rotatePoint = (x: number, z: number, width: number, height: number, r: QuarterTurn): ValleyPoint => {
  if (r === 1) return { x: height - 1 - z, z: x };
  if (r === 2) return { x: width - 1 - x, z: height - 1 - z };
  if (r === 3) return { x: z, z: width - 1 - x };
  return { x, z };
};
type Home = NonNullable<ValleyData["home"]>;
/** Anchor is the top-left of the rotated reserved pad, not of the cottage. */
export function homeFootprints(homeOrData: Home | ValleyData) {
  const home = "home" in homeOrData ? homeOrData.home : homeOrData;
  if (!home) return null;
  const point = (x: number, z: number): ValleyPoint => {
    const p = rotatePoint(x, z, 10, 8, home.rotation);
    return { x: home.x + p.x, z: home.z + p.z };
  };
  const rect = (x: number, z: number, width: number, height: number): ValleyRect => {
    const ps = [point(x, z), point(x + width - 1, z), point(x, z + height - 1), point(x + width - 1, z + height - 1)];
    return { x: Math.min(...ps.map(p => p.x)), z: Math.min(...ps.map(p => p.z)),
      width: home.rotation % 2 ? height : width, height: home.rotation % 2 ? width : height };
  };
  return { pad: rect(0, 0, 10, 8), tent: rect(0, 2, 3, 3), cottage: rect(4, 1, 6, 5),
    apron: rect(0, 6, 10, 2), door: point(7, 5), approach: point(7, 6),
    tentDoor: point(1, 4), tentApproach: point(1, 5), workbench: point(4, 2), planningTable: point(9, 2),
    // Keep a route from the door into the living space, even after furnishing.
    passage: [point(7, 2), point(7, 3), point(7, 4), point(7, 5), point(7, 6), point(7, 7)] };
}
export const FURNITURE_FOOTPRINTS: Record<FurnitureId, { width: number; height: number }> = {
  stool: { width: 1, height: 1 }, table: { width: 2, height: 2 }, bed: { width: 2, height: 3 },
  shelf: { width: 2, height: 1 }, chest: { width: 2, height: 1 }, planter: { width: 1, height: 1 },
};
export function furnitureFootprint(itemId: FurnitureId, x: number, z: number, rotation: QuarterTurn): ValleyRect {
  const size = FURNITURE_FOOTPRINTS[itemId];
  return { x, z, width: rotation % 2 ? size.height : size.width, height: rotation % 2 ? size.width : size.height };
}

// The entrance remains a public, unbuildable and uneditable route into the plot.
const entranceCorridor = (x: number, z: number) => x >= 46 && x <= 50 && z >= 136 && z <= 146;
const baseWater = (x: number, z: number) => WORLD.terrain[z * WORLD.width + x] === "water";
const shore = (x: number, z: number) => {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (baseWater(x + dx, z + dz)) return true;
  return false;
};
const groundAt = (data: ValleyData, x: number, z: number): GroundEdit =>
  isOwned(x, z) && !baseWater(x, z) ? data.ground[keyAt(x, z)] ?? { level: 0, path: false } : { level: 0, path: false };
const stairDirection = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
/** Flat terraces are exact half-metres. Stairs rise in four authored 0.125m treads. */
export function sampleValleyGround(data: ValleyData, x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const tx = Math.floor(x + .5), tz = Math.floor(z + .5), ground = groundAt(data, tx, tz);
  if (ground.stairs === undefined) return ground.level * .5;
  const [dx, dz] = stairDirection[ground.stairs];
  const progress = Math.max(0, Math.min(1 - Number.EPSILON, .5 + (x - tx) * dx + (z - tz) * dz));
  return ground.level * .5 + (Math.floor(progress * 4) + 1) * .125;
}
/** Only the low and high ends of a stair connect. Its side faces are risers. */
function edgeHeight(data: ValleyData, x: number, z: number, dx: number, dz: number): number | null {
  const g = groundAt(data, x, z);
  if (g.stairs === undefined) return g.level;
  const [sx, sz] = stairDirection[g.stairs], dot = sx * dx + sz * dz;
  return dot === 0 ? null : g.level + (dot > 0 ? 1 : 0);
}
const elevationConnects = (data: ValleyData, x: number, z: number, dx: number, dz: number) => {
  const a = edgeHeight(data, x, z, dx, dz), b = edgeHeight(data, x + dx, z + dz, -dx, -dz);
  return a !== null && b !== null && a === b;
};

const STATIC_OBJECTS: ValleyWorldObject[] = [];
function staticObject(id: string, name: string, kind: WorldObject["kind"], x: number, z: number,
  art?: string, resourceId?: ResourceId, blocks = false, width = 1, height = 1): ValleyWorldObject {
  const object: ValleyWorldObject = { id: `valley-${id}`, name, kind, position: tile(x, z), width, height, blocks,
    ...(art ? { art } : {}), ...(resourceId ? { resourceId } : {}) };
  STATIC_OBJECTS.push(object);
  return object;
}
for (const [i, [x, z]] of [[18, 139], [25, 139], [34, 139], [41, 139], [56, 139], [64, 139],
  [11, 147], [11, 152], [11, 157], [11, 163], [11, 169], [11, 175]].entries())
  staticObject(`tree-${i}`, "Valley timber tree", "tree", x, z, "iso-tree", "tree", true);
for (let i = 0; i < 6; i++) staticObject(`ore-${i}`, i % 2 ? "Tin outcrop" : "Copper outcrop", "rock",
  83, 147 + i * 5, "ore", i % 2 ? "tin" : "copper", true);
staticObject("pond-shrimp", "Quiet pond shrimp", "fish", 36, 150, undefined, "shrimp");
staticObject("entrance-sign", "Welcome to your valley", "sign", 45, 138, "prop-sign").description =
  "Your land begins south of this path. Timber is north and west; copper and tin are east. The pond is peaceful.";
staticObject("wilderness-sign", "Wilderness trail — danger ahead", "sign", 86, 178, "prop-sign").description =
  "The safe valley ends east of this sign. Wildlife and combat are optional; prepare equipment and food before leaving.";
staticObject("workbench", "Communal carpentry workbench", "decor", 69, 139, "prop-supplies", undefined, true, 2, 1).serviceId = "valley-carpentry";
staticObject("caravan", "Travelling supply caravan", "shop", 73, 139, "prop-supplies", undefined, true, 3, 2).shopId = "valley-caravan";
staticObject("brazier", "Communal smelting brazier", "furnace", 78, 139, "iso-workshop", undefined, true);
staticObject("cooking-fire", "Communal cooking fire", "range", 81, 139, undefined, undefined, true);

/** Bounded content-keyed cache; elapsed construction ticks do not allocate a world each tick. */
const worlds = new Map<string, WorldDefinition>();
const materials = new WeakMap<WorldDefinition,Map<string,WorldDefinition["terrain"]>>();
function geometryKey(data: ValleyData): string {
  return JSON.stringify([data.layoutRevision, data.home, data.paid === FIRST_BILL, data.cottageTicks >= COTTAGE_TICKS,
    data.cottageTicks >= COTTAGE_TICKS && data.forge.ticks >= FORGE_TICKS,
    data.cottageTicks >= COTTAGE_TICKS && (data.forge.logs > 0 || data.forge.bars > 0 || data.forge.ticks > 0),
    data.introduced, data.furniture, data.plants, Object.keys(data.ground).sort().map(k => [k, data.ground[k]])]);
}
function addObject(world: WorldDefinition, object: ValleyWorldObject) {
  world.objects.push(object);
  if (object.blocks) for (const { x, z } of cells(objectRect(object))) world.collision[z * world.width + x] |= COLLISION.BLOCKED;
}
function building(world: WorldDefinition, data: ValleyData, id: string, name: string, rect: ValleyRect,
  art: string, door: ValleyPoint, rotation: QuarterTurn) {
  const object: ValleyWorldObject = { id, name, kind: "building", position: tile(rect.x, rect.z),
    width: rect.width, height: rect.height, blocks: false, cutaway: true, art, rotation, entrance: door,
    groundPadHeight: sampleValleyGround(data, rect.x, rect.z) };
  addObject(world, object);
  // Edge walls retain genuinely walk-in interiors. Door side follows the rotated pad.
  const doorSide = [COLLISION.SOUTH, COLLISION.WEST, COLLISION.NORTH, COLLISION.EAST][rotation];
  for (const p of cells(rect)) {
    let mask = 0;
    if (p.x === rect.x) mask |= COLLISION.WEST;
    if (p.x === rect.x + rect.width - 1) mask |= COLLISION.EAST;
    if (p.z === rect.z) mask |= COLLISION.NORTH;
    if (p.z === rect.z + rect.height - 1) mask |= COLLISION.SOUTH;
    if (p.x === door.x && p.z === door.z) mask &= ~doorSide;
    world.collision[p.z * world.width + p.x] |= mask;
  }
}
export function createValleyWorld(data: ValleyData,chapter?:RpgState): WorldDefinition {
  const base=chapter?worldForState(chapter):WORLD;
  const key = geometryKey(data)+(chapter?worldVariantKey(chapter):"base"), cached = worlds.get(key);
  if (cached) { worlds.delete(key); worlds.set(key, cached); return cached; }
  const pathKey=Object.keys(data.ground).filter(key=>data.ground[key].path).sort().join(";");
  let cache=materials.get(base);if(!cache){cache=new Map();materials.set(base,cache);}
  let terrain=cache.get(pathKey);
  if(!terrain){terrain=[...base.terrain];
    for(let z=OWNED_BOUNDS.minZ;z<=OWNED_BOUNDS.maxZ;z++)for(let x=OWNED_BOUNDS.minX;x<=OWNED_BOUNDS.maxX;x++)
      if(!baseWater(x,z))terrain[z*base.width+x]=groundAt(data,x,z).path?"dirt":"grass";
    cache.set(pathKey,terrain);if(cache.size>8)cache.delete(cache.keys().next().value!);
  }
  const world: WorldDefinition = { ...base, terrain, collision: [...base.collision],
    objects: [...base.objects], spawns: [...base.spawns], portals: [...base.portals] };
  // Original chapter content and the pond are never removed. Quiet owned ground has no initial structures.
  for (const object of STATIC_OBJECTS) addObject(world, { ...object, position: { ...object.position } });
  // Reuse existing pixel NPC figures until the visitor-specific draft art is reviewed.
  const visitors = [
    { id: "builder", name: "Rowan the builder", x: 51, z: 141 },
    ...(data.introduced.includes("merchant") ? [{ id: "merchant", name: "Pella the merchant", x: 75, z: 142 }] : []),
    ...(data.introduced.includes("smith") ? [{ id: "smith", name: "Garrick the smith", x: 76, z: 178 }] : []),
  ];
  for (const visitor of visitors) addObject(world, { id: `valley-visitor-${visitor.id}`, name: visitor.name, kind: "quest",
    serviceId: `valley-visitor-${visitor.id}`, art: `valley-visitor-${visitor.id}`, position: tile(visitor.x, visitor.z),
    width: 1, height: 1, blocks: false, description: "Visitor appearance draft: existing pixel NPC placeholder." });
  const home = data.home, footprint = homeFootprints(data);
  if (home && footprint) {
    if (!home.tentPacked) building(world, data, "valley-home-tent", "Your tent", footprint.tent, "valley-tent", footprint.tentDoor, home.rotation);
    if (data.paid === FIRST_BILL) building(world, data, "valley-home-cottage",
      data.cottageTicks >= COTTAGE_TICKS ? "Your cottage" : "Cottage construction", footprint.cottage,
      data.cottageTicks >= COTTAGE_TICKS ? "valley-cottage" : "valley-cottage-build", footprint.door, home.rotation);
    if (data.cottageTicks >= COTTAGE_TICKS) {
      for (const [id, name, p] of [["workbench", "Your carpentry workbench", footprint.workbench],
        ["planning-table", "Your planning table", footprint.planningTable]] as const)
        addObject(world, { id: `valley-home-${id}`, name, kind: "decor", position: tile(p.x, p.z),
          width: 1, height: 1, blocks: false, art: "valley-built-in", serviceId: `valley-${id}` });
    }
  }
  if (data.cottageTicks >= COTTAGE_TICKS && (data.forge.logs > 0 || data.forge.bars > 0 || data.forge.ticks > 0)) {
    if (data.forge.ticks >= FORGE_TICKS) {
      building(world, data, "valley-public-forge", "Public forge", { x: 70, z: 178, width: 4, height: 3 },
        "valley-forge", { x: 72, z: 180 }, 0);
      addObject(world, { id: "valley-public-anvil", name: "Public forge anvil", kind: "anvil", position: tile(71, 179),
        width: 1, height: 1, blocks: true, art: "valley-built-in", serviceId: "valley-forge" });
    } else addObject(world, { id: "valley-public-forge", name: "Public forge construction", kind: "building", position: tile(70, 178),
      width: 4, height: 3, blocks: true, art: "valley-forge-build" });
  }
  for (const furniture of data.furniture) {
    const rect = furnitureFootprint(furniture.itemId, furniture.x, furniture.z, furniture.rotation);
    addObject(world, { id: `valley-furniture-${furniture.id}`, name: `Handmade ${furniture.itemId}`, kind: "decor",
      position: tile(rect.x, rect.z), width: rect.width, height: rect.height, blocks: true,
      art: `valley-${furniture.itemId}`, rotation: furniture.rotation, groundPadHeight: sampleValleyGround(data, rect.x, rect.z) });
  }
  for (const plant of data.plants) addObject(world, { id: `valley-plant-${plant.id}`, name: plant.kind === "flowers" ? "Planted flowers" : "Young sapling",
    kind: "decor", position: tile(plant.x, plant.z), width: 1, height: 1, blocks: false,
    art: plant.kind === "flowers" ? "valley-flowers" : "valley-sapling", groundPadHeight: sampleValleyGround(data, plant.x, plant.z) });
  // Compose terrace edges with existing walls, never clear original collision flags.
  for (let z = OWNED_BOUNDS.minZ - 1; z <= OWNED_BOUNDS.maxZ + 1; z++) for (let x = OWNED_BOUNDS.minX - 1; x <= OWNED_BOUNDS.maxX + 1; x++) {
    for (const [dx, dz, bit] of [[0, -1, COLLISION.NORTH], [1, 0, COLLISION.EAST], [0, 1, COLLISION.SOUTH], [-1, 0, COLLISION.WEST]])
      if (!elevationConnects(data, x, z, dx, dz)) world.collision[z * world.width + x] |= bit;
  }
  worlds.set(key, world);
  if (worlds.size > 8) worlds.delete(worlds.keys().next().value!);
  return world;
}

/** Continuous action integration: rounded cells share the same walls and stair edges as tile routes. */
export function canTraverseValley(data: ValleyData, fromX: number, fromZ: number, x: number, z: number, chapter?: RpgState): boolean {
  if (![fromX, fromZ, x, z].every(Number.isFinite)) return false;
  const world = createValleyWorld(data, chapter), from = tile(Math.floor(fromX + .5), Math.floor(fromZ + .5)), to = tile(Math.floor(x + .5), Math.floor(z + .5));
  if (from.x === to.x && from.y === to.y) return isWalkable(to, world);
  return canStep(from, to, world);
}
function reachable(data: ValleyData, start: ValleyPoint, targets: ValleyPoint[]): boolean {
  const world = createValleyWorld(data), queue = [{ x: Math.round(start.x), z: Math.round(start.z) }], seen = new Set<string>();
  if (!isWalkable(tile(queue[0].x, queue[0].z), world)) return false;
  seen.add(keyAt(queue[0].x, queue[0].z));
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [dx, dz] of stairDirection) {
      const x = p.x + dx, z = p.z + dz, key = keyAt(x, z);
      if (!inValley(x, z) || seen.has(key) || !canStep(tile(p.x, p.z), tile(x, z), world)) continue;
      seen.add(key); queue.push({ x, z });
    }
  }
  return targets.every(p => seen.has(keyAt(Math.round(p.x), Math.round(p.z))));
}
function flat(data: ValleyData, ps: ValleyPoint[]): boolean {
  const first = groundAt(data, ps[0].x, ps[0].z).level;
  return ps.every(p => { const g = groundAt(data, p.x, p.z); return g.stairs === undefined && g.level === first; });
}
function originalOccupied(p: ValleyPoint): boolean { return WORLD.objects.some(o => inRect(p, objectRect(o))); }
function staticOccupied(p: ValleyPoint): boolean { return STATIC_OBJECTS.some(o => inRect(p, objectRect(o))); }
export function validateHomePlacement(data: ValleyData, x: number, z: number, rotation: number): string | null {
  if (!integerPoint(x, z) || !quarterTurn(rotation)) return "Choose a whole tile and a quarter-turn rotation.";
  const home: Home = { x, z, rotation, tentPacked: false }, footprint = homeFootprints(home)!, ps = cells(footprint.pad);
  if (!ps.every(p => isOwned(p.x, p.z))) return "The complete home pad must fit inside your land.";
  if (ps.some(p => shore(p.x, p.z))) return "Leave the pond and its one-tile shore clear.";
  if (ps.some(p => entranceCorridor(p.x, p.z))) return "Keep the valley entrance path clear.";
  if (ps.some(p => originalOccupied(p) || staticOccupied(p) || data.plants.some(v => v.x === p.x && v.z === p.z) ||
    data.furniture.some(f => inRect(p, furnitureFootprint(f.itemId, f.x, f.z, f.rotation))))) return "Choose an empty home pad.";
  if (!flat(data, ps)) return "The home needs one flat terrace, with no stairs.";
  const candidate = { ...data, home };
  if (!reachable(candidate, VALLEY_ENTRANCE, [footprint.tentApproach, footprint.approach])) return "Your front door needs a route to the valley entrance.";
  return null;
}
export function validateFurniturePlacement(data: ValleyData, itemId: FurnitureId, x: number, z: number, rotation: number, ignoreId?: string, player?:ValleyPoint): string | null {
  if (!Object.hasOwn(FURNITURE_FOOTPRINTS, itemId) || !integerPoint(x, z) || !quarterTurn(rotation)) return "Choose a furnishing, whole tile and quarter-turn rotation.";
  const furnishing=furnitureFootprint(itemId,x,z,rotation);
  if(player&&player.x+.2>furnishing.x-.5&&player.x-.2<furnishing.x+furnishing.width-.5&&player.z+.2>furnishing.z-.5&&player.z-.2<furnishing.z+furnishing.height-.5)
    return "Step clear of the furnishing's footprint before placing it.";
  const ps = cells(furnitureFootprint(itemId, x, z, rotation)), footprint = homeFootprints(data);
  if (!ps.every(p => isOwned(p.x, p.z))) return "Keep the whole furnishing on your land.";
  if (ps.some(p => shore(p.x, p.z))) return "Leave the pond and its shore clear.";
  if (ps.some(p => entranceCorridor(p.x, p.z))) return "Keep the valley entrance path clear.";
  if (!flat(data, ps)) return "Furnishings need a flat terrace, with no stairs.";
  for (const p of ps) {
    if (originalOccupied(p) || staticOccupied(p) || data.furniture.some(f => f.id !== ignoreId && inRect(p, furnitureFootprint(f.itemId, f.x, f.z, f.rotation))) ||
      data.plants.some(v => v.x === p.x && v.z === p.z)) return "That place is occupied.";
    if (footprint) {
      if ((!data.home?.tentPacked && inRect(p, footprint.tent)) || inRect(p, footprint.apron) ||
        footprint.passage.some(v => v.x === p.x && v.z === p.z)) return "Keep the tent and home entrance clear.";
      if (inRect(p, footprint.cottage) && (data.cottageTicks < COTTAGE_TICKS || p.x === footprint.cottage.x ||
        p.x === footprint.cottage.x + footprint.cottage.width - 1 || p.z === footprint.cottage.z ||
        p.z === footprint.cottage.z + footprint.cottage.height - 1)) return "Keep cottage walls and construction space clear.";
    }
  }
  const candidate: ValleyData = { ...data, furniture: [...data.furniture.filter(f => f.id !== ignoreId), { id: "placement-preview", itemId, x, z, rotation }] };
  const targets = footprint ? [footprint.approach, footprint.door] : [];
  if (!reachable(candidate, VALLEY_ENTRANCE, targets)) return "Leave a route to your home.";
  return null;
}
type TerrainOperation = Extract<ValleyCommand, { type: "terrain" }>["operation"];
const result = (ok: boolean, message: string): ValleyResult => ({ ok, message });
function groundProtection(data: ValleyData, x: number, z: number): string | null {
  if (!integerPoint(x, z) || !isOwned(x, z)) return "Ground work stays inside your land.";
  if (shore(x, z)) return "The pond and its shore cannot be edited.";
  if (entranceCorridor(x, z)) return "Keep the valley entrance path clear.";
  const p = { x, z }, footprint = homeFootprints(data);
  if (footprint && inRect(p, footprint.pad)) return "The reserved home pad and apron must stay level.";
  if (originalOccupied(p) || staticOccupied(p) || data.furniture.some(f => inRect(p, furnitureFootprint(f.itemId, f.x, f.z, f.rotation))) ||
    data.plants.some(v => v.x === x && v.z === z)) return "Move belongings and plants before editing this tile.";
  return null;
}
function safeGroundChange(data: ValleyData, key: string, value: GroundEdit | null, playerPosition?: ValleyPoint): boolean {
  const ground = { ...data.ground };
  if (value) ground[key] = value; else delete ground[key];
  const candidate = { ...data, ground, layoutRevision: data.layoutRevision + 1 }, footprint = homeFootprints(candidate);
  const targets: ValleyPoint[] = [];
  if (footprint) {
    targets.push(footprint.approach);
    if (!data.home?.tentPacked) targets.push(footprint.tentApproach);
  }
  if (footprint && data.paid === FIRST_BILL) targets.push(footprint.door);
  if (playerPosition) targets.push(playerPosition);
  return reachable(candidate, VALLEY_ENTRANCE, targets);
}
/** Mutates only ground, bounded undo history and geometry revision; never awards XP/items. */
export function editValleyGround(data: ValleyData, x: number, z: number, operation: TerrainOperation, playerPosition?: ValleyPoint): ValleyResult {
  const protection = groundProtection(data, x, z);
  if (protection) return result(false, protection);
  if (operation !== "path" && operation !== "grass" && data.cottageTicks < COTTAGE_TICKS) return result(false, "Terrace editing unlocks when your cottage is complete.");
  const key = keyAt(x, z), before = data.ground[key] ? { ...data.ground[key] } : null;
  const next: GroundEdit = { ...(before ?? { level: 0, path: false }) };
  if (operation === "path" || operation === "grass") next.path = operation === "path";
  else if (operation === "raise" || operation === "lower") {
    const level = next.level + (operation === "raise" ? 1 : -1);
    if (level < -1 || level > 1) return result(false, "Terraces stay within half a metre of the original ground.");
    next.level = level as GroundEdit["level"]; delete next.stairs;
  } else {
    const direction = ["stairs-north", "stairs-east", "stairs-south", "stairs-west"].indexOf(operation);
    if (direction < 0) return result(false, "Unknown ground operation.");
    next.stairs = direction as QuarterTurn;
    // level stores the lower stair socket; upper support stays within +0.5m.
    if (next.level === 1) next.level = 0;
  }
  const after = next.level === 0 && !next.path && next.stairs === undefined ? null : next;
  if (JSON.stringify(before) === JSON.stringify(after)) return result(false, "That tile already has this ground.");
  if (!safeGroundChange(data, key, after, playerPosition)) return result(false, "Keep yourself and your home connected to the valley entrance.");
  if (after) data.ground[key] = after; else delete data.ground[key];
  data.undo.push({ key, before, after: after ? { ...after } : null });
  if (data.undo.length > 32) data.undo.splice(0, data.undo.length - 32);
  data.layoutRevision++;
  return result(true, "Ground updated.");
}
export function undoValleyGround(data: ValleyData, playerPosition?: ValleyPoint): ValleyResult {
  const entry = data.undo.at(-1);
  if (!entry) return result(false, "There is no ground edit to undo.");
  const [x, z] = entry.key.split(",").map(Number), protection = groundProtection(data, x, z);
  if (protection) return result(false, protection);
  if (!safeGroundChange(data, entry.key, entry.before, playerPosition)) return result(false, "Move to connected ground before undoing this edit.");
  if (entry.before) data.ground[entry.key] = { ...entry.before }; else delete data.ground[entry.key];
  data.undo.pop(); data.layoutRevision++;
  return result(true, "Ground edit undone.");
}
