import {
  BILL,
  TICK_MS,
  type ControlState,
  type GameState,
  type Intent,
  type IntentDraft,
  type Person,
  type PlayerCommand,
  type Point,
  type Resource,
  type Role,
  type SettlementId,
  type Strategy,
} from "./types";
import {
  findPath,
  isWalkable,
  nearestSettlement,
  SETTLEMENTS,
  targetById,
  WORLD,
  TARGETS,
} from "./world";
import { suggestIntentions } from "./planner";
const RESOURCES: Resource[] = ["timber", "stone", "iron"];
const ROLES: Role[] = ["prince", "woodcutter", "miner", "builder", "smith"];
const NAMES = [
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
const TRAITS = [
  "Hopeful and cooperative",
  "Patient and precise",
  "Bold and curious",
  "Practical and kind",
];
const zero = (): Record<Resource, number> => ({ timber: 0, stone: 0, iron: 0 });
const control = (tick = 0): ControlState => ({
  active: null,
  queue: [],
  thinkingUntil: tick + 6,
  waiting: false,
  reason: "Considering how to help the workshop.",
  nextId: 1,
  visited: [],
  lastAutonomous: "",
});
export function calendarDate(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function note(s: GameState, message: string): void {
  s.journal.unshift(message);
  s.journal.length = Math.min(12, s.journal.length);
}
function place(id: SettlementId, kind: string): Point {
  return targetById(`${id}-${kind}`)!;
}
const near = (a: Point, b: Point): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y) < 0.01;
function begin(p: Person, action: string, duration: number): void {
  p.action = action;
  p.remaining = p.duration = duration;
  p.fromX = p.targetX = p.x;
  p.fromY = p.targetY = p.y;
  p.path = [];
}
function walk(p: Person, to: Point): boolean {
  const path = findPath(p, to);
  if (!path) {
    begin(p, "Route unavailable", 6);
    return false;
  }
  p.path = path;
  p.action = "Traveling";
  p.fromX = p.x;
  p.fromY = p.y;
  p.targetX = to.x;
  p.targetY = to.y;
  let last: Point = p;
  let length = 0;
  for (const v of path) {
    length += Math.hypot(v.x - last.x, v.y - last.y);
    last = v;
  }
  p.remaining = p.duration = Math.max(1, Math.ceil(length / 36));
  return true;
}
function arrive(p: Person, to: Point): boolean {
  if (near(p, to)) return true;
  walk(p, to);
  return false;
}
function bank(s: GameState, p: Person, id: SettlementId): boolean {
  if (!arrive(p, place(id, "store"))) return false;
  if (p.carry) {
    s.stores[id][p.carry.resource] += p.carry.amount;
    p.carry = null;
    p.completed++;
    begin(p, "Waiting for supplies", 1);
  }
  return true;
}
function gatheringSpot(
  p: Person,
  resource: Resource,
  home: SettlementId,
): Point {
  const site = place(home, resource === "timber" ? "forest" : "mine");
  if (p.id === 0) return site;
  const [dx, dy] = [
    [-72, 32],
    [-24, 64],
    [28, 36],
    [76, 16],
    [-62, 86],
    [55, 78],
  ][p.id % 6]!;
  const spot = { x: site.x + dx!, y: site.y + dy! };
  return isWalkable(spot) ? spot : site;
}
function gather(p: Person, resource: Resource, home: SettlementId): void {
  if (arrive(p, gatheringSpot(p, resource, home))) {
    p.taskResource = resource;
    begin(p, `Gathering ${resource}`, 5 + (p.id % 2));
  }
}
function load(
  s: GameState,
  p: Person,
  home: SettlementId,
  r: Resource,
  amount: number,
): void {
  if (!arrive(p, place(home, "store"))) return;
  const n = Math.min(amount, s.stores[home][r], p.id === 0 ? 10 : 2);
  if (n > 0) {
    s.stores[home][r] -= n;
    p.carry = { resource: r, amount: n };
    begin(p, "Carrying supplies", 1);
  } else begin(p, "Waiting for supplies", 3);
}
function deliverBuild(s: GameState, p: Person): void {
  if (!arrive(p, place("oakrest", "workshop"))) return;
  if (p.carry && p.carry.resource !== "iron") {
    const r = p.carry.resource,
      n = Math.min(p.carry.amount, BILL[r] - s.workshop[r]);
    s.workshop[r] += n;
    s.spent[r] += n;
    p.carry.amount -= n;
    p.xp += n * 3;
    if (!p.carry.amount) p.carry = null;
    begin(p, "Waiting for supplies", 1);
  }
}
function build(s: GameState, p: Person): void {
  if (p.carry) {
    if (
      p.carry.resource !== "iron" &&
      s.workshop[p.carry.resource] < BILL[p.carry.resource]
    ) {
      const resource = p.carry.resource;
      const wanted = Math.min(10, BILL[resource] - s.workshop[resource]);
      if (p.id === 0 && p.carry.amount < wanted && near(p, gatheringSpot(p, resource, "oakrest")))
        gather(p, resource, "oakrest");
      else deliverBuild(s, p);
    }
    else bank(s, p, nearestSettlement(p).id);
    return;
  }
  const r = (["timber", "stone"] as const).find((r) => s.workshop[r] < BILL[r]);
  if (r) {
    if (s.stores.oakrest[r] > 0)
      load(s, p, "oakrest", r, BILL[r] - s.workshop[r]);
    else if (p.id === 0) gather(p, r, "oakrest");
    else begin(p, "Waiting for supplies", 3);
  } else if (arrive(p, place("oakrest", "workshop")))
    begin(p, "Building workshop", 2);
}
function forge(s: GameState, p: Person): void {
  if (p.carry?.resource !== "iron" && p.carry) {
    bank(s, p, nearestSettlement(p).id);
    return;
  }
  const wanted = p.id === 0 ? Math.min(10, Math.max(2, (s.control.active?.remaining ?? 1) * 2)) : 2;
  if (!p.carry) {
    if (s.stores.oakrest.iron >= 2) load(s, p, "oakrest", "iron", wanted);
    else if (p.id === 0) gather(p, "iron", "oakrest");
    else begin(p, "Waiting for supplies", 3);
  } else if (p.id === 0 && p.carry.amount < wanted && near(p, gatheringSpot(p, "iron", "oakrest"))) gather(p, "iron", "oakrest");
  else if (p.carry.amount < 2 && p.id === 0) gather(p, "iron", "oakrest");
  else if (p.carry.amount < 2) bank(s, p, "oakrest");
  else if (arrive(p, place("oakrest", "workshop")))
    begin(p, "Forging tools", 6);
}
function totalHeld(s: GameState, r: Resource, home: SettlementId): number {
  return (
    s.stores[home][r] +
    s.people
      .filter((p) => p.homeId === home)
      .reduce((n, p) => n + (p.carry?.resource === r ? p.carry.amount : 0), 0)
  );
}
function npc(s: GameState, p: Person): void {
  if (p.role === "woodcutter" || p.role === "miner") {
    if (p.carry) {
      bank(s, p, p.homeId);
      return;
    }
    const r =
      p.role === "woodcutter"
        ? "timber"
        : p.homeId === "oakrest" && s.workshop.stone >= BILL.stone
          ? "iron"
          : "stone";
    const limit = r === "timber" ? 64 : r === "stone" ? 48 : 24;
    if (totalHeld(s, r, p.homeId) >= limit)
      begin(p, "Resting by the square", 10);
    else gather(p, r, p.homeId);
  } else if (!s.workshop.complete) build(s, p);
  else if (p.id === 11) {
    p.role = "smith";
    if (s.workshop.forged < 12) forge(s, p);
    else if (p.carry) bank(s, p, "oakrest");
    else begin(p, "Resting by the square", 10);
  } else if (p.carry) bank(s, p, p.homeId);
  else if (
    arrive(
      p,
      SETTLEMENTS.find((t) => t.id === p.homeId)!,
    )
  )
    begin(p, "Resting by the square", 10);
}
export function intentLabel(d: IntentDraft): string {
  const t = d.targetId
    ? (targetById(d.targetId)?.name ?? d.targetId)
    : "selected ground";
  switch (d.kind) {
    case "move":
      return `Travel to ${t}`;
    case "gather":
      return `Gather ${d.repeat ? "repeated" : (d.quantity ?? 10)} ${d.resource ?? "timber"}`;
    case "deposit":
      return `Deposit ${d.quantity ?? 10} ${d.resource ?? "timber"} at ${t}`;
    case "withdraw":
      return `Withdraw ${d.quantity ?? 10} ${d.resource ?? "timber"} at ${t}`;
    case "build":
      return "Build the blacksmith workshop";
    case "forge":
      return `Forge ${d.quantity ?? 1} iron tool${d.quantity === 1 ? "" : "s"}`;
  }
}
function draftError(s: GameState, d: IntentDraft): string | null {
  if (
    !d ||
    !["move", "gather", "deposit", "withdraw", "build", "forge"].includes(
      d.kind,
    )
  )
    return "Unknown intention.";
  if (
    d.quantity !== undefined &&
    (!Number.isInteger(d.quantity) || d.quantity < 1 || d.quantity > 1000)
  )
    return "Quantity must be a whole number from 1 to 1000.";
  if (d.repeat !== undefined && typeof d.repeat !== "boolean")
    return "Invalid repeat flag.";
  if (d.resource !== undefined && !RESOURCES.includes(d.resource))
    return "Unknown resource.";
  const t = d.targetId ? targetById(d.targetId) : undefined;
  if (d.targetId && !t) return "Unknown destination.";
  if (d.kind === "move") {
    const p = d.point ?? t;
    if (!p || !isWalkable(p) || !findPath(s.people[0]!, p))
      return "That ground is blocked or unreachable.";
  }
  if (
    d.kind === "gather" &&
    (!d.resource || (t && !t.resources?.includes(d.resource)))
  )
    return "Choose a resource available at this gathering site.";
  if (
    (d.kind === "deposit" || d.kind === "withdraw") &&
    (!d.resource || t?.kind !== "store")
  )
    return "Choose a storehouse and resource.";
  if (d.kind === "forge" && !s.workshop.complete)
    return "The blacksmith workshop must open before tools can be forged.";
  if (d.kind === "build" && s.workshop.complete)
    return "The blacksmith workshop is already complete.";
  return null;
}
function makeIntent(
  s: GameState,
  d: IntentDraft,
  source: Intent["source"],
): Intent {
  const quantity =
    d.quantity ??
    (d.kind === "forge" || d.kind === "build" || d.kind === "move" ? 1 : 10);
  return {
    ...d,
    point: d.point ? { ...d.point } : undefined,
    id: `intent-${s.control.nextId++}`,
    quantity,
    remaining: quantity,
    repeat: d.repeat ?? false,
    source,
    label: intentLabel(d),
  };
}
function interrupt(p: Person): void {
  begin(p, "Considering intentions", 1);
  delete p.taskResource;
}
export function applyCommand(
  s: GameState,
  command: PlayerCommand,
): { ok: boolean; message: string } {
  const c = s.control,
    p = s.people[0]!;
  if (!command || typeof command !== "object")
    return { ok: false, message: "Invalid command." };
  if (command.type === "order") {
    if (command.mode !== "now" && command.mode !== "next")
      return { ok: false, message: "Invalid queue mode." };
    const error = draftError(s, command.intent);
    if (error) return { ok: false, message: error };
    if (
      c.queue.length >= 8 &&
      (command.mode === "next" || c.active?.source === "player")
    )
      return {
        ok: false,
        message: "The queue already contains eight intentions.",
      };
    const task = makeIntent(s, command.intent, "player");
    c.waiting = false;
    if (command.mode === "now") {
      if (c.active?.source === "player") c.queue.unshift(c.active);
      c.active = task;
      interrupt(p);
    } else {
      c.queue.push(task);
      if (!c.active) c.thinkingUntil = s.tick;
    }
    c.reason = `${command.mode === "now" ? "Following" : "Queued"}: ${task.label}.`;
    return { ok: true, message: c.reason };
  }
  if (command.type === "cancel") {
    if (c.active?.id === command.id) {
      c.active = null;
      interrupt(p);
      c.thinkingUntil = s.tick + 6;
    } else {
      const i = c.queue.findIndex((t) => t.id === command.id);
      if (i < 0)
        return { ok: false, message: "That intention is no longer queued." };
      c.queue.splice(i, 1);
    }
    c.reason = "Intention canceled; carried supplies are retained.";
    return { ok: true, message: c.reason };
  }
  if (command.type === "reorder") {
    const i = c.queue.findIndex((t) => t.id === command.id),
      j = i + command.direction;
    if (
      ![1, -1].includes(command.direction) ||
      i < 0 ||
      j < 0 ||
      j >= c.queue.length
    )
      return {
        ok: false,
        message: "That intention cannot move in this direction.",
      };
    [c.queue[i], c.queue[j]] = [c.queue[j]!, c.queue[i]!];
    return { ok: true, message: "Queue order updated." };
  }
  if (command.type === "wait") {
    c.waiting = true;
    interrupt(p);
    c.reason = "Waiting here until you resume intentions.";
    return { ok: true, message: c.reason };
  }
  if (command.type === "autonomy") {
    c.waiting = false;
    c.reason = "Resuming queued intentions, then independent work.";
    c.thinkingUntil = s.tick + 6;
    return { ok: true, message: c.reason };
  }
  return { ok: false, message: "Unknown command." };
}
function complete(s: GameState, p: Person, result?: string): void {
  const c = s.control;
  p.completed++;
  c.active = null;
  c.thinkingUntil = s.tick + 6;
  c.reason =
    result ??
    (c.queue.length
      ? "Taking the next queued intention."
      : "Considering the next useful task.");
  if (c.queue.length) {
    c.active = c.queue.shift()!;
    prince(s, p);
  } else begin(p, "Considering intentions", 1);
}
function prince(s: GameState, p: Person): void {
  const c = s.control;
  c.visited ??= [];
  for (const target of TARGETS) if (near(p, target) && !c.visited.includes(target.id)) c.visited.push(target.id);
  if (c.waiting) {
    begin(p, "Waiting for your signal", 1);
    return;
  }
  if (!c.active) {
    if (c.queue.length) c.active = c.queue.shift()!;
    else if (s.tick < c.thinkingUntil) {
      begin(p, "Considering intentions", 1);
      return;
    } else {
      const suggestion = suggestIntentions(s)[0]!;
      c.active = makeIntent(s, suggestion.intent, "autonomous");
      c.lastAutonomous = suggestion.id;
      c.reason = suggestion.thought;
    }
  }
  const a = c.active,
    target = a.targetId ? targetById(a.targetId) : undefined;
  if (a.source === "player") c.reason = `Following your intention: ${a.label}.`;
  if (a.kind === "move") {
    if (arrive(p, a.point ?? target!)) {
      if (target) c.visited = [...(c.visited ?? []).filter(id => id !== target.id), target.id];
      complete(s, p, `Reached ${target?.name ?? "the selected ground"}. Considering useful work nearby.`);
    }
  } else if (a.kind === "gather") {
    const home = target?.settlementId ?? nearestSettlement(p).id,
      r = a.resource!;
    if (
      p.carry &&
      (p.carry.resource !== r || p.carry.amount >= 10 || a.remaining <= 0)
    ) {
      bank(s, p, home);
      return;
    }
    if (a.remaining <= 0) {
      if (a.repeat) a.remaining = a.quantity;
      else {
        complete(s, p);
        return;
      }
    }
    gather(p, r, home);
  } else if (a.kind === "deposit") {
    if (!p.carry || p.carry.resource !== a.resource) {
      complete(
        s,
        p,
        "No matching carried supplies to deposit. Considering the next useful task.",
      );
      return;
    }
    if (arrive(p, target!)) {
      const n = Math.min(p.carry.amount, a.remaining);
      s.stores[target!.settlementId][a.resource!] += n;
      p.carry.amount -= n;
      if (!p.carry.amount) p.carry = null;
      a.remaining -= n;
      complete(s, p, `Deposited ${n} ${a.resource} at ${target!.name}.`);
    }
  } else if (a.kind === "withdraw") {
    if (p.carry && p.carry.resource !== a.resource) {
      complete(
        s,
        p,
        "Carrying another resource; deposit it before withdrawing.",
      );
      return;
    }
    if (arrive(p, target!)) {
      const n = Math.min(
        10 - (p.carry?.amount ?? 0),
        a.remaining,
        s.stores[target!.settlementId][a.resource!],
      );
      if (n) {
        s.stores[target!.settlementId][a.resource!] -= n;
        p.carry = { resource: a.resource!, amount: (p.carry?.amount ?? 0) + n };
        a.remaining -= n;
      }
      complete(
        s,
        p,
        `Withdrew ${n} ${a.resource} from ${target!.name}; carry limit is 10.`,
      );
    }
  } else if (a.kind === "build") {
    if (s.workshop.complete) complete(s, p);
    else build(s, p);
  } else if (a.kind === "forge") {
    if (a.remaining <= 0) {
      if (a.repeat) a.remaining = a.quantity;
      else {
        complete(s, p);
        return;
      }
    }
    if (!s.workshop.complete) {
      c.reason = "Waiting for the workshop to open.";
      begin(p, "Waiting for supplies", 3);
    } else forge(s, p);
  }
}
function finishWork(s: GameState, p: Person): void {
  if (p.action.startsWith("Gathering ") && p.taskResource) {
    const a = p.id === 0 ? s.control.active : null,
      r = p.taskResource;
    const capacity = (p.id === 0 ? 10 : 2) - (p.carry?.amount ?? 0);
    const amount = Math.min(
      2,
      capacity,
      a?.kind === "gather" ? a.remaining : 2,
    );
    if (amount > 0 && (!p.carry || p.carry.resource === r)) {
      p.carry = { resource: r, amount: (p.carry?.amount ?? 0) + amount };
      s.gathered[r] += amount;
      p.xp += amount * 4;
      p.completed++;
      if (a?.kind === "gather") a.remaining -= amount;
    }
  } else if (
    p.action === "Building workshop" &&
    !s.workshop.complete &&
    s.workshop.timber === BILL.timber &&
    s.workshop.stone === BILL.stone
  ) {
    s.workshop.labor = Math.min(BILL.labor, s.workshop.labor + 1);
    p.xp += 3;
    if (s.workshop.labor === BILL.labor) {
      s.workshop.complete = true;
      note(
        s,
        "The blacksmith workshop is open. Sora takes up the smith’s hammer.",
      );
    }
  } else if (
    p.action === "Forging tools" &&
    s.workshop.complete &&
    p.carry?.resource === "iron" &&
    p.carry.amount >= 2
  ) {
    p.carry.amount -= 2;
    if (!p.carry.amount) p.carry = null;
    s.spent.iron += 2;
    s.workshop.forged++;
    p.xp += 12;
    p.completed++;
    if (p.id === 0 && s.control.active?.kind === "forge")
      s.control.active.remaining--;
    if (s.workshop.forged === 1)
      note(s, "Our first iron tools are ready. Oakrest has a working forge.");
  }
  delete p.taskResource;
}
export function createGame(now: number): GameState {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8.64e15)
    throw new RangeError("Invalid wall time.");
  const s: GameState = {
    version: 2,
    tick: 0,
    savedAt: now,
    calendar: calendarDate(now),
    offlineRemainder: 0,
    strategy: null,
    decisionAt: 34,
    decisionReason:
      "Alden will choose local gathering after 20.4 seconds; direct intentions take priority.",
    people: [],
    stores: { oakrest: zero(), briarford: zero(), stonehaven: zero() },
    gathered: zero(),
    spent: zero(),
    coins: 40,
    workshop: { timber: 0, stone: 0, labor: 0, complete: false, forged: 0 },
    control: control(),
    journal: ["Alden’s ambition: build a blacksmith workshop for Oakrest."],
  };
  s.people = NAMES.map((name, id): Person => {
    const homeId: SettlementId =
      id < 16 ? "oakrest" : id < 20 ? "briarford" : "stonehaven";
    const home = SETTLEMENTS.find((t) => t.id === homeId)!;
    const role: Role =
      id === 0
        ? "prince"
        : id < 7
          ? "woodcutter"
          : id < 11
            ? "miner"
            : id < 16
              ? "builder"
              : id % 4 < 2
                ? "woodcutter"
                : "miner";
    const x = home.x + ((id % 4) - 2) * 20,
      y = home.y + Math.floor((id % 16) / 4) * 14;
    return {
      id,
      name,
      role,
      personality: TRAITS[id % 4]!,
      homeId,
      x,
      y,
      fromX: x,
      fromY: y,
      targetX: x,
      targetY: y,
      path: [],
      action: "Waiting for supplies",
      remaining: 1,
      duration: 1,
      carry: null,
      xp: 0,
      completed: 0,
    };
  });
  s.people.forEach((p) => (p.id === 0 ? prince(s, p) : npc(s, p)));
  return s;
}
export function chooseStrategy(s: GameState, strategy: Strategy): void {
  if (
    s.strategy !== null ||
    !["local", "trade", "careful"].includes(strategy) ||
    (strategy === "trade" && s.coins < 24)
  )
    return;
  s.strategy = strategy;
  if (strategy === "trade") {
    s.coins -= 24;
    for (const r of ["timber", "stone"] as const) {
      s.stores.oakrest[r] += 8;
      s.gathered[r] += 8;
    }
    s.decisionReason =
      "Paid the local merchant 24 coins for 8 timber and 8 stone delivered to Oakrest storage.";
  } else
    s.decisionReason =
      strategy === "careful"
        ? "Alden chose a measured approach: existing workers supply the same workshop bill."
        : "Alden chose local gathering, keeping Oakrest’s 40 coins for later.";
  note(s, s.decisionReason);
}
export function step(s: GameState, count = 1): GameState {
  if (!Number.isInteger(count) || count < 0 || count > 36000)
    throw new RangeError("Tick count must be between 0 and 36000.");
  for (let i = 0; i < count; i++) {
    s.tick++;
    if (s.strategy === null && s.tick >= s.decisionAt)
      chooseStrategy(s, "local");
    for (const p of s.people) {
      if (p.id === 0 && s.control.waiting) {
        begin(p, "Waiting for your signal", 1);
        continue;
      }
      if (p.path.length) {
        let distance = 36;
        while (distance > 0 && p.path.length) {
          const to = p.path[0]!,
            d = Math.hypot(to.x - p.x, to.y - p.y);
          if (d <= distance) {
            p.x = to.x;
            p.y = to.y;
            p.path.shift();
            distance -= d;
          } else {
            p.x += ((to.x - p.x) / d) * distance;
            p.y += ((to.y - p.y) / d) * distance;
            distance = 0;
          }
        }
        p.remaining = Math.max(1, p.remaining - 1);
        if (p.path.length) continue;
      } else {
        p.remaining--;
        if (p.remaining > 0) continue;
        finishWork(s, p);
      }
      if (p.id === 0) prince(s, p);
      else npc(s, p);
    }
  }
  return s;
}
export function reconcile(
  s: GameState,
  now: number,
): { state: GameState; ticks: number; elapsed: number } {
  if (!Number.isFinite(now) || now < 0 || now > 8.64e15)
    throw new RangeError("Invalid wall time.");
  const elapsed = Math.max(0, now - s.savedAt),
    effective = Math.min(elapsed, 86400000) * 0.25 + s.offlineRemainder,
    ticks = Math.floor(effective / TICK_MS);
  s.offlineRemainder = effective % TICK_MS;
  step(s, ticks);
  s.savedAt = Math.max(now, s.savedAt);
  s.calendar = calendarDate(s.savedAt);
  if (ticks > 0)
    note(
      s,
      `While you were away: ${ticks} ticks of work at quarter speed. Calendar: ${s.calendar}.`,
    );
  return { state: s, ticks, elapsed };
}
function object(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function integer(v: unknown, max = 1e12): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
}
function text(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length <= max;
}
function point(v: unknown, legacy = false): v is Point {
  return (
    object(v) &&
    typeof v.x === "number" &&
    Number.isFinite(v.x) &&
    typeof v.y === "number" &&
    Number.isFinite(v.y) &&
    v.x >= 0 &&
    v.y >= 0 &&
    v.x <= (legacy ? 1200 : WORLD.width) &&
    v.y <= (legacy ? 1200 : WORLD.height)
  );
}
const OLD_ACTIONS = [
  "Walking to forest",
  "Walking to mine",
  "Gathering timber",
  "Gathering stone",
  "Gathering iron",
  "Carrying supplies",
  "Fetching materials",
  "Delivering materials",
  "Building workshop",
  "Waiting for supplies",
  "Walking to forge",
  "Forging tools",
  "Resting by the square",
];
const ACTIONS = [
  ...OLD_ACTIONS,
  "Traveling",
  "Route unavailable",
  "Considering intentions",
  "Waiting for your signal",
];
function validLedger(v: unknown): v is Record<Resource, number> {
  return object(v) && RESOURCES.every((r) => integer(v[r]));
}
function validIntent(v: unknown, s: GameState): v is Intent {
  if (
    !object(v) ||
    !text(v.id, 60) ||
    !/^intent-\d+$/.test(v.id) ||
    !text(v.label, 200) ||
    !["player", "autonomous"].includes(String(v.source)) ||
    !integer(v.quantity, 1000) ||
    v.quantity < 1 ||
    !integer(v.remaining, v.quantity) ||
    typeof v.repeat !== "boolean"
  )
    return false;
  if (v.targetId !== undefined && !text(v.targetId, 80)) return false;
  if (v.point !== undefined && !point(v.point)) return false;
  // Completed build/forge intents can remain active for one tick after another actor finishes.
  const check = {
    ...s,
    workshop: {
      ...s.workshop,
      complete:
        v.kind === "forge"
          ? true
          : v.kind === "build"
            ? false
            : s.workshop.complete,
    },
  };
  return draftError(check, v as unknown as IntentDraft) === null;
}
function validCommon(v: Record<string, unknown>): boolean {
  return (
    integer(v.tick) &&
    integer(v.savedAt, 8.64e15) &&
    text(v.calendar, 10) &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.calendar) &&
    Number.isFinite(Date.parse(v.calendar)) &&
    typeof v.offlineRemainder === "number" &&
    Number.isFinite(v.offlineRemainder) &&
    v.offlineRemainder >= 0 &&
    v.offlineRemainder < TICK_MS &&
    integer(v.decisionAt) &&
    text(v.decisionReason, 1000) &&
    integer(v.coins, 40) &&
    (v.strategy === null ||
      ["local", "trade", "careful"].includes(String(v.strategy))) &&
    Array.isArray(v.journal) &&
    v.journal.length <= 12 &&
    v.journal.every((x) => text(x, 1000)) &&
    validLedger(v.gathered) &&
    validLedger(v.spent)
  );
}
function validWorkshop(v: Record<string, unknown>): boolean {
  const w = v.workshop;
  return (
    object(w) &&
    integer(w.timber, BILL.timber) &&
    integer(w.stone, BILL.stone) &&
    integer(w.labor, BILL.labor) &&
    typeof w.complete === "boolean" &&
    integer(w.forged) &&
    w.complete === (w.labor === BILL.labor) &&
    !(w.labor > 0 && (w.timber !== BILL.timber || w.stone !== BILL.stone)) &&
    object(v.spent) &&
    v.spent.timber === w.timber &&
    v.spent.stone === w.stone &&
    v.spent.iron === w.forged * 2
  );
}
function validPerson(v: unknown, id: number, legacy: boolean): boolean {
  if (
    !object(v) ||
    v.id !== id ||
    !text(v.name, 40) ||
    !text(v.personality, 100) ||
    !ROLES.includes(v.role as Role) ||
    !(legacy ? OLD_ACTIONS : ACTIONS).includes(String(v.action)) ||
    !integer(v.duration, legacy ? 100 : 5000) ||
    v.duration < 1 ||
    !integer(v.remaining, v.duration) ||
    v.remaining < 1 ||
    !integer(v.xp) ||
    !integer(v.completed)
  )
    return false;
  if (
    !["", "from", "target"].every((prefix) =>
      point(
        {
          x: v[prefix ? `${prefix}X` : "x"],
          y: v[prefix ? `${prefix}Y` : "y"],
        },
        legacy,
      ),
    )
  )
    return false;
  if (
    v.carry !== null &&
    (!object(v.carry) ||
      !RESOURCES.includes(v.carry.resource as Resource) ||
      !integer(v.carry.amount, legacy || id !== 0 ? 2 : 10) ||
      v.carry.amount < 1)
  )
    return false;
  if (id === 0 ? v.role !== "prince" : v.role === "prince") return false;
  if (legacy) return true;
  if (
    !SETTLEMENTS.some((t) => t.id === v.homeId) ||
    !Array.isArray(v.path) ||
    v.path.length > 128 ||
    !v.path.every((p) => point(p) && isWalkable(p)) ||
    !isWalkable(v as unknown as Point)
  )
    return false;
  if (
    v.taskResource !== undefined &&
    !RESOURCES.includes(v.taskResource as Resource)
  )
    return false;
  if (
    String(v.action).startsWith("Gathering ") &&
    v.taskResource !== String(v.action).slice(10)
  )
    return false;
  if (v.path.length > 0 && v.action !== "Traveling") return false;
  let from = v as unknown as Point;
  for (const dest of v.path as Point[]) {
    const n = Math.max(
      1,
      Math.ceil(Math.hypot(dest.x - from.x, dest.y - from.y) / 10),
    );
    for (let i = 0; i <= n; i++)
      if (
        !isWalkable({
          x: from.x + ((dest.x - from.x) * i) / n,
          y: from.y + ((dest.y - from.y) * i) / n,
        })
      )
        return false;
    from = dest;
  }
  return true;
}
function conserved(v: Record<string, unknown>, legacy: boolean): boolean {
  if (!Array.isArray(v.people) || !object(v.gathered) || !object(v.spent))
    return false;
  return RESOURCES.every((r) => {
    const held = (v.people as Person[]).reduce(
      (n, p) => n + (p.carry?.resource === r ? p.carry.amount : 0),
      0,
    );
    const stored = legacy
      ? (v.stock as Record<Resource, number>)[r]
      : Object.values(v.stores as GameState["stores"]).reduce(
          (n, store) => n + store[r],
          0,
        );
    return (
      (v.gathered as Record<Resource, number>)[r] ===
      stored + (v.spent as Record<Resource, number>)[r] + held
    );
  });
}
/** Validate V1 before migration; V2 imports never bypass inventory and navigation invariants. */
export function validateSave(value: unknown): GameState | null {
  try {
    if (
      !object(value) ||
      ![1, 2].includes(Number(value.version)) ||
      !validCommon(value) ||
      !validWorkshop(value) ||
      !Array.isArray(value.people)
    )
      return null;
    const legacy = value.version === 1;
    if (
      (value.version !== 1 && value.version !== 2) ||
      value.people.length !== (legacy ? 16 : 24) ||
      !value.people.every((p, id) => validPerson(p, id, legacy))
    )
      return null;
    if (
      value.people.some(
        (p) =>
          object(p) &&
          p.role === "smith" &&
          !(value.workshop as GameState["workshop"]).complete,
      )
    )
      return null;
    if (legacy) {
      if (!validLedger(value.stock) || !conserved(value, true)) return null;
      const s = createGame(value.savedAt as number),
        copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
      for (const key of [
        "tick",
        "savedAt",
        "calendar",
        "offlineRemainder",
        "strategy",
        "decisionAt",
        "decisionReason",
        "gathered",
        "spent",
        "coins",
        "workshop",
        "journal",
      ] as const)
        (s as unknown as Record<string, unknown>)[key] = copy[key];
      s.stores.oakrest = copy.stock as Record<Resource, number>;
      s.people.splice(
        0,
        16,
        ...(copy.people as Person[]).map((p) => ({
          ...p,
          homeId: "oakrest" as const,
          x: p.x + 850,
          y: p.y + 1800,
          fromX: p.x + 850,
          fromY: p.y + 1800,
          targetX: p.x + 850,
          targetY: p.y + 1800,
          path: [],
          action: "Waiting for supplies",
          remaining: 1,
          duration: 1,
        })),
      );
      // Legacy straight-line movement could cross a new building footprint.
      // Relocate only blocked actors; preserve their work, XP and supplies.
      for (const p of s.people) {
        if (isWalkable(p)) continue;
        let safe: Point | undefined;
        for (let radius = 10; radius <= 500 && !safe; radius += 10) {
          for (const [dx, dy] of [
            [0, radius],
            [radius, 0],
            [0, -radius],
            [-radius, 0],
          ]) {
            const candidate = { x: p.x + dx!, y: p.y + dy! };
            if (isWalkable(candidate)) {
              safe = candidate;
              break;
            }
          }
        }
        if (!safe) return null;
        Object.assign(p, safe, {
          fromX: safe.x,
          fromY: safe.y,
          targetX: safe.x,
          targetY: safe.y,
        });
      }
      s.control = control(s.tick);
      return s;
    }
    if (
      !object(value.stores) ||
      !SETTLEMENTS.every((t) =>
        validLedger((value.stores as Record<string, unknown>)[t.id]),
      ) ||
      Object.keys(value.stores).length !== 3 ||
      !conserved(value, false)
    )
      return null;
    const s = value as unknown as GameState,
      c = value.control;
    if (
      !object(c) ||
      !Array.isArray(c.queue) ||
      c.queue.length > 8 ||
      typeof c.waiting !== "boolean" ||
      !integer(c.thinkingUntil) ||
      !integer(c.nextId) ||
      c.nextId < 1 ||
      !text(c.reason, 1000) ||
      (c.visited !== undefined && (!Array.isArray(c.visited) || c.visited.length > TARGETS.length || !c.visited.every(id => typeof id === "string" && targetById(id)) || new Set(c.visited).size !== c.visited.length)) ||
      (c.lastAutonomous !== undefined && (!text(c.lastAutonomous, 100) || !/^(|finish-workshop|forge-tools|workshop-(timber|stone)|bank-(oakrest|briarford|stonehaven)|supply-(oakrest|briarford|stonehaven)-(timber|stone|iron)|visit-[a-z-]+)$/.test(c.lastAutonomous))) ||
      (typeof c.lastAutonomous === "string" && c.lastAutonomous.startsWith("visit-") && !targetById(c.lastAutonomous.slice(6))) ||
      (c.active !== null && !validIntent(c.active, s)) ||
      !c.queue.every((a) => validIntent(a, s))
    )
      return null;
    const intents = [c.active, ...c.queue].filter(
      (v): v is Intent => v !== null,
    ) as Intent[];
    if (
      new Set(intents.map((a) => a.id)).size !== intents.length ||
      intents.some((a) => Number(a.id.slice(7)) >= (c.nextId as number))
    )
      return null;
    for (const p of s.people) {
      if (
        p.action === "Building workshop" &&
        !near(p, place("oakrest", "workshop"))
      )
        return null;
      if (
        p.action === "Forging tools" &&
        (!s.workshop.complete ||
          !near(p, place("oakrest", "workshop")) ||
          p.carry?.resource !== "iron" ||
          p.carry.amount < 2)
      )
        return null;
      if (p.action.startsWith("Gathering ")) {
        const active = p.id === 0 ? s.control.active : null;
        const home =
          active?.kind === "gather"
            ? active.targetId
              ? targetById(active.targetId)!.settlementId
              : nearestSettlement(p).id
            : p.homeId;
        if (
          !(
            near(p, gatheringSpot(p, p.taskResource!, home)) ||
            near(
              p,
              place(home, p.taskResource === "timber" ? "forest" : "mine"),
            )
          ) ||
          (p.carry && p.carry.resource !== p.taskResource)
        )
          return null;
      }
    }
    const restored = JSON.parse(JSON.stringify(value)) as GameState;
    restored.control.visited ??= [];
    restored.control.lastAutonomous ??= "";
    return restored;
  } catch {
    return null;
  }
}
