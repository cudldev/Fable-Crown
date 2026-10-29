import type { TilePosition, WorldDefinition, WorldObject } from "./types";
import { canStep, getWorld, interactionTiles, isWalkable } from "./world";

const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];
const distance = (a: TilePosition, b: TilePosition) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
interface Entry {
  index: number;
  g: number;
  f: number;
  serial: number;
}
class MinHeap {
  private items: Entry[] = [];
  get size() {
    return this.items.length;
  }
  private less(a: Entry, b: Entry) {
    return (
      a.f < b.f ||
      (a.f === b.f && (a.g > b.g || (a.g === b.g && a.serial < b.serial)))
    );
  }
  push(value: Entry) {
    let i = this.items.length;
    this.items.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(value, this.items[parent])) break;
      this.items[i] = this.items[parent];
      i = parent;
    }
    this.items[i] = value;
  }
  pop(): Entry {
    const first = this.items[0],
      last = this.items.pop()!;
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < this.items.length &&
          this.less(this.items[child + 1], this.items[child])
        )
          child++;
        if (!this.less(this.items[child], last)) break;
        this.items[i] = this.items[child];
        i = child;
      }
      this.items[i] = last;
    }
    return first;
  }
}

// Worlds are static geometry. Cache only routes requested, never an all-pairs graph.
let caches = new WeakMap<WorldDefinition, Map<string, TilePosition[] | null>>();
const copy = (path: TilePosition[] | null): TilePosition[] | null =>
  path && path.map((p) => ({ ...p }));
export function clearPathCache(world?: WorldDefinition): void {
  if (world) caches.delete(world);
  else caches = new WeakMap();
}

/** Returned steps exclude the start and include the destination; one step costs one tick walking. */
export function findPath(
  from: TilePosition,
  to: TilePosition,
  world = getWorld(from.worldId),
): TilePosition[] | null {
  if (
    !world ||
    from.worldId !== to.worldId ||
    from.plane !== to.plane ||
    !isWalkable(from, world) ||
    !isWalkable(to, world)
  )
    return null;
  if (!distance(from, to)) return [];
  let cache = caches.get(world);
  if (!cache) {
    cache = new Map();
    caches.set(world, cache);
  }
  const key = `${from.x},${from.y}:${to.x},${to.y}`;
  if (cache.has(key)) {
    const value = cache.get(key)!;
    cache.delete(key);
    cache.set(key, value);
    return copy(value);
  }
  const count = world.width * world.height;
  const costs = new Int32Array(count).fill(0x7fffffff),
    parents = new Int32Array(count).fill(-1),
    closed = new Uint8Array(count);
  const start = from.y * world.width + from.x,
    goal = to.y * world.width + to.x;
  const open = new MinHeap();
  let serial = 0;
  costs[start] = 0;
  open.push({ index: start, g: 0, f: distance(from, to), serial: serial++ });
  let result: TilePosition[] | null = null;
  while (open.size) {
    const current = open.pop();
    if (closed[current.index] || current.g !== costs[current.index]) continue;
    if (current.index === goal) {
      result = [];
      for (let index = goal; index !== start; index = parents[index])
        result.push({
          worldId: world.id,
          plane: from.plane,
          x: index % world.width,
          y: Math.floor(index / world.width),
        });
      result.reverse();
      break;
    }
    closed[current.index] = 1;
    const position = {
      ...from,
      x: current.index % world.width,
      y: Math.floor(current.index / world.width),
    };
    for (const [dx, dy] of DIRECTIONS) {
      const next = { ...position, x: position.x + dx, y: position.y + dy };
      if (!canStep(position, next, world)) continue;
      const index = next.y * world.width + next.x,
        g = current.g + 1;
      if (closed[index] || g >= costs[index]) continue;
      costs[index] = g;
      parents[index] = current.index;
      open.push({ index, g, f: g + distance(next, to), serial: serial++ });
    }
  }
  cache.set(key, copy(result));
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  return result;
}

export function pathToObject(
  from: TilePosition,
  object: WorldObject,
  world = getWorld(from.worldId),
): TilePosition[] | null {
  if (
    !world ||
    from.worldId !== object.position.worldId ||
    from.plane !== object.position.plane
  )
    return null;
  const candidates = interactionTiles(object, world).sort(
    (a, b) => distance(from, a) - distance(from, b) || a.y - b.y || a.x - b.x,
  );
  let best: TilePosition[] | null = null;
  for (const candidate of candidates) {
    if (best && distance(from, candidate) >= best.length) continue;
    const path = findPath(from, candidate, world);
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best;
}
