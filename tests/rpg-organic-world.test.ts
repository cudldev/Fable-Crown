import { describe, expect, it } from "vitest";
import { COLLISION, canStep, FERRIES, interactionTiles, isWalkable, riverAt, tile, WORLD } from "../src/rpg/world";
import { ITEMS, RECIPES, SHOPS } from "../src/rpg/content";
describe("organic connected frontier", () => {
  it("places 240 distinct single-tile trees off roads and varies river width/center while retaining crossings", () => {
    const trees = WORLD.objects.filter((o) => o.kind === "tree");
    expect(trees).toHaveLength(240); expect(new Set(trees.map((o) => `${o.position.x},${o.position.y}`)).size).toBe(240);
    for (const tree of trees) { expect(tree.width).toBe(1); expect(tree.height).toBe(1); expect(tree.art).toMatch(/^iso-(tree|oak|willow)$/);
      expect(WORLD.terrain[tree.position.y * WORLD.width + tree.position.x]).toBe("grass"); expect(isWalkable(tree.position)).toBe(false); }
    expect(new Set(Array.from({ length: 192 }, (_, y) => riverAt(y).center)).size).toBeGreaterThan(15);
    expect(new Set(Array.from({ length: 192 }, (_, y) => riverAt(y).width))).toEqual(new Set([4, 5, 6, 7]));
    for (const y of [47, 95, 129]) expect(riverAt(y).center).toBe(119);
    for (const y of [47, 129]) for (let x = 112; x < 125; x++) expect(canStep(tile(x, y), tile(x + 1, y))).toBe(true);
    expect(isWalkable(tile(119, 95))).toBe(false);
  });
  it("connects all resources, interiors, clues, target, camp and ferries through legal directional movement", () => {
    const reached = new Uint8Array(WORLD.width * WORLD.height), queue = [WORLD.spawns[0]];
    reached[queue[0].y * WORLD.width + queue[0].x] = 1;
    for (let head = 0; head < queue.length; head++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const from = queue[head], next = tile(from.x + dx, from.y + dy), index = next.y * WORLD.width + next.x;
      if (!reached[index] && canStep(from, next)) { reached[index] = 1; queue.push(next); }
    }
    for (const object of WORLD.objects) expect(interactionTiles(object).some((p) => reached[p.y * WORLD.width + p.x]), object.id).toBe(true);
    for (const object of WORLD.objects.filter((o) => o.cutaway)) {
      const door = tile(object.position.x + Math.floor(object.width / 2), object.position.y + object.height - 1);
      expect(reached[door.y * WORLD.width + door.x], object.id).toBe(1);
      expect(canStep(tile(door.x, door.y + 1), door), object.id).toBe(true);
      const wall = object.position;
      expect(WORLD.collision[wall.y * WORLD.width + wall.x] & COLLISION.NORTH).toBeTruthy();
      expect(canStep(tile(wall.x, wall.y - 1), wall)).toBe(false);
    }
    for (const o of WORLD.objects.filter((o) => o.kind === "fish")) {
      expect(isWalkable(o.position)).toBe(true);
      expect([-1, 1].some((dx) => WORLD.terrain[o.position.y * WORLD.width + o.position.x + dx] === "water")).toBe(true);
    }
    for (const ferry of Object.values(FERRIES)) expect(isWalkable(ferry.destination)).toBe(true);
  });
  it("gives specialized vendors different trades and keeps higher metal milestones outside low-level recipes", () => {
    expect(SHOPS["oakrest-shop"].stock["steel-pickaxe"].buy).toBe(500);
    expect(SHOPS["oakrest-shop"].stock["mithril-body"]).toBeUndefined();
    expect(SHOPS["stonehaven-shop"].stock["steel-bar"]).toBeDefined();
    expect(SHOPS["stonehaven-shop"].stock["raw-trout"]).toBeUndefined();
    expect(SHOPS["briarford-shop"].stock["fishing-rod"]).toBeDefined();
    expect(SHOPS["briarford-shop"].stock["bronze-body"]).toBeUndefined();
    expect(Object.keys(RECIPES).some((id) => /black|mithril/.test(id))).toBe(false);
    expect(ITEMS["black-pickaxe"].level).toBe(11); expect(ITEMS["mithril-sword"].attackLevel).toBe(20);
  });
});
