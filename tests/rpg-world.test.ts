import { describe, expect, it } from 'vitest';
import { COLLISION, WORLD, TOWNS, canStep, containsTile, getWorld, interactionTiles, isWalkable, objectsById, terrainAt, tile } from '../src/rpg/world';
import { clearPathCache, findPath, pathToObject } from '../src/rpg/pathfinding';
import type { TilePosition, WorldDefinition } from '../src/rpg/types';

function fixture(): WorldDefinition {
  return { id: 'test', name: 'Collision fixture', width: 7, height: 7, chunkSize: 32,
    terrain: Array(49).fill('grass'), collision: Array(49).fill(0), objects: [], spawns: [], portals: [] };
}
const p = (x: number, y: number) => tile(x, y, 'test');
function assertPath(from: TilePosition, to: TilePosition, world = WORLD) {
  const path = findPath(from, to, world);
  expect(path).not.toBeNull();
  let previous = from;
  for (const next of path!) {
    expect(canStep(previous, next, world)).toBe(true);
    previous = next;
  }
  expect(previous).toEqual(to);
  return path!;
}

describe('tile frontier geometry', () => {
  it('authors a bounded deterministic world with 24 legal distinct spawns and resource variety', () => {
    expect(WORLD.width).toBe(256); expect(WORLD.height).toBe(192); expect(WORLD.chunkSize).toBe(32);
    expect(WORLD.terrain).toHaveLength(256 * 192); expect(WORLD.collision).toHaveLength(256 * 192);
    expect(getWorld('frontier')).toBe(WORLD); expect(getWorld('missing')).toBeUndefined();
    expect(WORLD.spawns).toHaveLength(24);
    expect(new Set(WORLD.spawns.map(s => `${s.x},${s.y}`)).size).toBe(24);
    expect(WORLD.spawns.every(s => isWalkable(s))).toBe(true);
    const resources = WORLD.objects.filter(o => o.resourceId);
    expect(resources.length).toBe(279);
    expect(new Set(resources.map(o => o.resourceId)).size).toBe(10);
    expect(new Set(WORLD.objects.map(o => o.id)).size).toBe(WORLD.objects.length);
    for (const o of WORLD.objects) {
      expect(containsTile(o.position, WORLD)).toBe(true);
      expect(o.position.x + o.width).toBeLessThanOrEqual(WORLD.width);
      expect(o.position.y + o.height).toBeLessThanOrEqual(WORLD.height);
      if (o.blocks) for (let dy = 0; dy < o.height; dy++) for (let dx = 0; dx < o.width; dx++) {
        expect(isWalkable(tile(o.position.x + dx, o.position.y + dy))).toBe(false);
      }
    }
  });
  it('keeps water and edges blocked and both named bridges traversable', () => {
    expect(terrainAt(tile(118, 95))).toBe('water'); expect(isWalkable(tile(118, 95))).toBe(false);
    for (const y of [47, 129]) for (let x = 113; x < 124; x++) expect(canStep(tile(x, y), tile(x + 1, y))).toBe(true);
    for (const position of [tile(0, 5), tile(255, 5), tile(5, 0), tile(5, 191), tile(-1, 5), tile(2.5, 4), tile(4, 4, 'frontier', 1)]) {
      expect(isWalkable(position)).toBe(false);
    }
    expect(terrainAt(tile(-1, 0))).toBeUndefined();
  });
  it('connects every town, service, quest giver, landmark and resource to the spawn component', () => {
    const reached = new Uint8Array(WORLD.width * WORLD.height), queue = [WORLD.spawns[0]];
    reached[queue[0].y * WORLD.width + queue[0].x] = 1;
    for (let head = 0; head < queue.length; head++) {
      const from = queue[head];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const to = tile(from.x + dx, from.y + dy), index = to.y * WORLD.width + to.x;
        if (!reached[index] && canStep(from, to)) { reached[index] = 1; queue.push(to); }
      }
    }
    for (const object of WORLD.objects) {
      expect(interactionTiles(object).some(t => reached[t.y * WORLD.width + t.x]), object.id).toBe(true);
    }
    expect(WORLD.spawns.every(t => reached[t.y * WORLD.width + t.x])).toBe(true);
    for (const town of TOWNS) for (const service of ['bank', 'furnace', 'anvil', 'range', 'shop']) {
      expect(objectsById[`${town.id}-${service}`]).toBeDefined();
    }
  });
  it('routes across the river using bridges, and returns independent stable cached paths', () => {
    const from = TOWNS[0].position, to = TOWNS[1].position;
    const path = assertPath(from, to), original = structuredClone(path);
    expect(path.some(p => p.x === 118 && [46, 47, 48, 128, 129, 130].includes(p.y))).toBe(true);
    path[0].x = -999; path.shift();
    expect(findPath(from, to)).toEqual(original);
    clearPathCache(); expect(findPath(from, to)).toEqual(original);
    expect(findPath(from, from)).toEqual([]);
    expect(findPath(from, tile(118, 95))).toBeNull();
    expect(findPath(from, { ...to, worldId: 'elsewhere' })).toBeNull();
    expect(findPath(from, { ...to, plane: 1 })).toBeNull();
  });
  it('finds legal interaction paths for services and each resource type', () => {
    const from = WORLD.spawns[0];
    const seen = new Set<string>();
    for (const object of WORLD.objects) {
      if (!['bank', 'furnace', 'anvil', 'range', 'shop', 'quest'].includes(object.kind) && (!object.resourceId || seen.has(object.resourceId))) continue;
      if (object.resourceId) seen.add(object.resourceId);
      const path = pathToObject(from, object);
      expect(path, object.id).not.toBeNull();
      const end = path!.at(-1) ?? from;
      expect(interactionTiles(object)).toContainEqual(end);
      assertPath(from, end);
    }
    expect(seen.size).toBe(10);
  });
});

describe('tile navigation edge rules', () => {
  it('uses equal-cost diagonals and deterministic shortest paths', () => {
    const world = fixture();
    expect(assertPath(p(0, 0), p(6, 4), world)).toHaveLength(6);
    world.collision[2 * 7 + 2] = COLLISION.BLOCKED;
    clearPathCache(world);
    const route = assertPath(p(0, 0), p(6, 4), world);
    expect(route.length).toBe(6);
    expect(findPath(p(0, 0), p(6, 4), world)).toEqual(route);
  });
  it('respects each directional edge from either side and never cuts blocked corners', () => {
    for (const [dx, dy, edge] of [[0, -1, COLLISION.NORTH], [1, 0, COLLISION.EAST], [0, 1, COLLISION.SOUTH], [-1, 0, COLLISION.WEST]]) {
      const world = fixture(), from = p(3, 3), to = p(3 + dx, 3 + dy);
      world.collision[3 * 7 + 3] = edge;
      expect(canStep(from, to, world)).toBe(false); expect(canStep(to, from, world)).toBe(false);
      expect(assertPath(from, to, world).length).toBeGreaterThan(1);
    }
    const world = fixture();
    world.collision[2 * 7 + 3] = COLLISION.BLOCKED;
    expect(canStep(p(2, 2), p(3, 3), world)).toBe(false);
    world.collision[2 * 7 + 3] = COLLISION.SOUTH;
    expect(canStep(p(2, 2), p(3, 3), world)).toBe(false);
  });
  it('bounds unreachable searches and rejects nonadjacent, invalid and cross-world moves', () => {
    const world = fixture();
    for (let y = 0; y < 7; y++) world.collision[y * 7 + 3] = COLLISION.BLOCKED;
    expect(findPath(p(1, 3), p(5, 3), world)).toBeNull();
    expect(findPath(p(-1, 2), p(2, 2), world)).toBeNull();
    expect(canStep(p(1, 1), p(3, 1), world)).toBe(false);
    expect(canStep(p(1, 1), p(1, 1), world)).toBe(false);
    expect(canStep(p(1, 1), tile(2, 1), world)).toBe(false);
  });
});
