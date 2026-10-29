import type {
  Point,
  Region,
  Settlement,
  SettlementId,
  WorldTarget,
} from "./types";

export const WORLD = { width: 6600, height: 4440 };
export const SETTLEMENTS: Settlement[] = [
  {
    id: "oakrest",
    name: "Oakrest",
    x: 1360,
    y: 2210,
    description: "Alden’s frontier home and the new blacksmith workshop.",
  },
  {
    id: "briarford",
    name: "Briarford",
    x: 3900,
    y: 1000,
    description: "A riverside farming and timber hamlet.",
  },
  {
    id: "stonehaven",
    name: "Stonehaven",
    x: 5350,
    y: 3300,
    description: "A quarry settlement beneath the eastern hills.",
  },
];
const target = (
  id: string,
  name: string,
  kind: WorldTarget["kind"],
  settlementId: SettlementId,
  x: number,
  y: number,
  resources?: WorldTarget["resources"],
): WorldTarget => ({
  id,
  name,
  kind,
  settlementId,
  x,
  y,
  description: `${name}, ${SETTLEMENTS.find((s) => s.id === settlementId)!.name}.`,
  ...(resources ? { resources } : {}),
});
export const TARGETS: WorldTarget[] = [
  target("oakrest", "Oakrest square", "settlement", "oakrest", 1360, 2210),
  target("oakrest-manor", "Alden’s manor", "manor", "oakrest", 1370, 2030),
  target("oakrest-store", "Oakrest storehouse", "store", "oakrest", 1465, 2270),
  target(
    "oakrest-forest",
    "Oakrest woodland",
    "forest",
    "oakrest",
    1070,
    2150,
    ["timber"],
  ),
  target("oakrest-mine", "Oakrest mine", "mine", "oakrest", 1700, 2060, [
    "stone",
    "iron",
  ]),
  target(
    "oakrest-workshop",
    "Blacksmith workshop",
    "workshop",
    "oakrest",
    1665,
    2330,
  ),
  target("briarford", "Briarford green", "settlement", "briarford", 3900, 1000),
  target("briarford-store", "Briarford barn", "store", "briarford", 4040, 1060),
  target("briarford-forest", "Briar wood", "forest", "briarford", 3640, 900, [
    "timber",
  ]),
  target(
    "briarford-mine",
    "Briarford outcrop",
    "mine",
    "briarford",
    4180,
    870,
    ["stone", "iron"],
  ),
  target(
    "stonehaven",
    "Stonehaven square",
    "settlement",
    "stonehaven",
    5350,
    3300,
  ),
  target(
    "stonehaven-store",
    "Stonehaven warehouse",
    "store",
    "stonehaven",
    5480,
    3380,
  ),
  target(
    "stonehaven-forest",
    "Eastern woodland",
    "forest",
    "stonehaven",
    5090,
    3220,
    ["timber"],
  ),
  target(
    "stonehaven-mine",
    "Stonehaven quarry",
    "mine",
    "stonehaven",
    5630,
    3170,
    ["stone", "iron"],
  ),
  target("north-bridge", "Willow bridge", "landmark", "briarford", 3000, 1100),
  target(
    "south-bridge",
    "Pilgrim bridge",
    "landmark",
    "stonehaven",
    3000,
    3000,
  ),
  target("hill-shrine", "Hill shrine", "landmark", "oakrest", 2050, 1200),
  target("east-watch", "Eastern watch", "landmark", "stonehaven", 6000, 2300),
];
const regionNames = [
  "Mosswood",
  "Briarford",
  "Northern highlands",
  "Oakrest",
  "Two bridges",
  "Eastern watch",
  "Green marches",
  "Pilgrim road",
  "Stonehaven",
];
export const REGIONS: Region[] = regionNames.map((name, i) => ({
  id: `region-${i}`,
  name,
  x: (i % 3) * 2200,
  y: Math.floor(i / 3) * 1480,
  width: 2200,
  height: 1480,
  image: `art/region-${i}.webp`,
}));
export interface Building {
  id: string;
  kind: "manor" | "store" | "workshop" | "house";
  x: number;
  y: number;
  width: number;
  height: number;
  targetId: string;
}
export const BUILDINGS: Building[] = TARGETS.filter((t) =>
  ["manor", "store", "workshop"].includes(t.kind),
).map((t) => ({
  id: `${t.id}-building`,
  kind: t.kind as Building["kind"],
  x: t.x - 70,
  y: t.y - (t.kind === "store" ? 125 : t.kind === "workshop" ? 125 : 165),
  width: 140,
  height: t.kind === "store" ? 85 : t.kind === "workshop" ? 85 : 125,
  targetId: t.id,
}));
// Homes have the same footprints in navigation and rendering.
for (const town of SETTLEMENTS)
  for (const [i, dx, dy] of [
    [0, -270, 160],
    [1, 30, 250],
    [2, 290, 235],
  ]) {
    BUILDINGS.push({
      id: `${town.id}-home-${i}`,
      kind: "house",
      x: town.x + dx!,
      y: town.y + dy!,
      width: 140,
      height: 95,
      targetId: town.id,
    });
  }
export interface Blocker {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export const BLOCKERS: Blocker[] = [
  ...BUILDINGS,
  { id: "north-cliff", x: 4500, y: 300, width: 350, height: 220 },
  { id: "east-cliff", x: 5940, y: 2720, width: 360, height: 240 },
  { id: "western-cliff", x: 440, y: 1050, width: 420, height: 180 },
];
export const ROADS: Point[][] = [
  [
    { x: 1360, y: 2210 },
    { x: 2400, y: 2210 },
    { x: 2820, y: 1100 },
    { x: 3180, y: 1100 },
    { x: 3900, y: 1000 },
  ],
  [
    { x: 1360, y: 2210 },
    { x: 2400, y: 2600 },
    { x: 2820, y: 3000 },
    { x: 3180, y: 3000 },
    { x: 5350, y: 3300 },
  ],
  [
    { x: 3900, y: 1000 },
    { x: 4600, y: 1900 },
    { x: 5350, y: 3300 },
  ],
];
export const targetById = (id: string): WorldTarget | undefined =>
  TARGETS.find((t) => t.id === id);
export function nearestSettlement(p: Point): Settlement {
  return SETTLEMENTS.reduce((a, b) =>
    Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y)
      ? a
      : b,
  );
}
export function isWalkable(p: Point): boolean {
  if (
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y) ||
    p.x < 20 ||
    p.y < 20 ||
    p.x > WORLD.width - 20 ||
    p.y > WORLD.height - 20
  )
    return false;
  if (
    p.x >= 2920 &&
    p.x <= 3080 &&
    Math.abs(p.y - 1100) > 100 &&
    Math.abs(p.y - 3000) > 100
  )
    return false;
  return !BLOCKERS.some(
    (b) =>
      p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height,
  );
}
function clear(a: Point, b: Point): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 10));
  for (let i = 0; i <= n; i++)
    if (
      !isWalkable({
        x: a.x + ((b.x - a.x) * i) / n,
        y: a.y + ((b.y - a.y) * i) / n,
      })
    )
      return false;
  return true;
}
const routeCache = new Map<string, Point[] | null>();
/** Reuse static routes, returning fresh waypoints because actors consume their paths. */
export function findPath(from: Point, to: Point): Point[] | null {
  const key = `${from.x},${from.y}>${to.x},${to.y}`;
  if (!routeCache.has(key)) {
    if (routeCache.size >= 512)
      routeCache.delete(routeCache.keys().next().value!);
    routeCache.set(key, route(from, to));
  }
  return routeCache.get(key)?.map((p) => ({ ...p })) ?? null;
}
/** Deterministic visibility graph around inflated obstacle corners and the two bridges. */
function route(from: Point, to: Point): Point[] | null {
  if (!isWalkable(from) || !isWalkable(to)) return null;
  if (clear(from, to)) return [{ x: to.x, y: to.y }];
  const nodes: Point[] = [from, to];
  for (const b of BLOCKERS)
    for (const x of [b.x - 20, b.x + b.width + 20])
      for (const y of [b.y - 20, b.y + b.height + 20])
        if (isWalkable({ x, y })) nodes.push({ x, y });
  for (const y of [1020, 1100, 1180, 2920, 3000, 3080])
    for (const x of [2890, 3110]) nodes.push({ x, y });
  const d = nodes.map(() => Infinity),
    prev = nodes.map(() => -1),
    done = new Set<number>();
  d[0] = 0;
  while (done.size < nodes.length) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!done.has(i) && (u < 0 || d[i]! < d[u]!)) u = i;
    if (u < 0 || !Number.isFinite(d[u])) return null;
    if (u === 1) break;
    done.add(u);
    for (let v = 1; v < nodes.length; v++)
      if (!done.has(v) && clear(nodes[u]!, nodes[v]!)) {
        const nd =
          d[u]! +
          Math.hypot(nodes[u]!.x - nodes[v]!.x, nodes[u]!.y - nodes[v]!.y);
        if (nd < d[v]!) {
          d[v] = nd;
          prev[v] = u;
        }
      }
  }
  if (prev[1] === -1) return null;
  const path: Point[] = [];
  let i = 1;
  while (i !== 0) {
    path.unshift({ x: nodes[i]!.x, y: nodes[i]!.y });
    i = prev[i]!;
  }
  return path;
}
