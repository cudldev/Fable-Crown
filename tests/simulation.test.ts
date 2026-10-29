import { describe, expect, it } from "vitest";
import {
  applyCommand,
  calendarDate,
  chooseStrategy,
  createGame,
  reconcile,
  step,
  validateSave,
} from "../src/simulation";
import {
  BILL,
  TICK_MS,
  type GameState,
  type Resource,
  type Strategy,
  type IntentDraft,
} from "../src/types";
import { isWalkable, targetById } from "../src/world";
const NOW = Date.UTC(2026, 9, 29, 12);
function conservation(s: GameState): void {
  for (const r of ["timber", "stone", "iron"] as Resource[]) {
    const carried = s.people.reduce(
      (n, p) => n + (p.carry?.resource === r ? p.carry.amount : 0),
      0,
    );
    expect(s.gathered[r]).toBe(
      Object.values(s.stores).reduce((n, v) => n + v[r], 0) +
        s.spent[r] +
        carried,
    );
    for (const v of Object.values(s.stores))
      expect(v[r]).toBeGreaterThanOrEqual(0);
  }
  for (const p of s.people) {
    expect(isWalkable(p)).toBe(true);
    expect(p.carry?.amount ?? 0).toBeLessThanOrEqual(p.id === 0 ? 10 : 2);
  }
}
function until(s: GameState, check: () => boolean, limit = 1200): void {
  for (let i = 0; i < limit && !check(); i++) {
    step(s);
    conservation(s);
  }
  expect(check()).toBe(true);
}
const order = (
  s: GameState,
  intent: IntentDraft,
  mode: "now" | "next" = "now",
) => applyCommand(s, { type: "order", intent, mode });
function v1(s: GameState): Record<string, unknown> {
  const copy = structuredClone(s) as unknown as Record<string, unknown>;
  copy.version = 1;
  copy.stock = s.stores.oakrest;
  delete copy.stores;
  delete copy.control;
  copy.people = s.people.slice(0, 16).map((p) => ({
    ...p,
    x: p.x - 850,
    y: p.y - 1800,
    fromX: p.x - 850,
    fromY: p.y - 1800,
    targetX: p.x - 850,
    targetY: p.y - 1800,
    action: "Waiting for supplies",
    remaining: 1,
    duration: 1,
    path: undefined,
    homeId: undefined,
  }));
  return copy;
}
describe("autonomous settlement", () => {
  it.each([null, "local", "trade", "careful"] as (Strategy | null)[])(
    "completes workshop and tools with %s",
    (strategy) => {
      const s = createGame(NOW);
      if (strategy) chooseStrategy(s, strategy);
      until(s, () => s.workshop.complete && s.workshop.forged > 0);
      expect(s.people).toHaveLength(24);
      expect(s.workshop.timber).toBe(BILL.timber);
      expect(s.workshop.stone).toBe(BILL.stone);
      expect(s.people[0]!.xp).toBeGreaterThan(0);
      expect(s.people.some((p) => p.role === "smith")).toBe(true);
      expect(s.coins).toBe(strategy === "trade" ? 16 : 40);
      expect(validateSave(s)).not.toBeNull();
      expect(s.stores.briarford.timber).toBeGreaterThan(0);
      expect(s.stores.stonehaven.stone).toBeGreaterThan(0);
    },
  );
  it("chooses automatically at exactly 34 ticks while gathering already works", () => {
    const s = createGame(NOW);
    step(s, 33);
    expect(s.strategy).toBeNull();
    expect(s.gathered.timber).toBeGreaterThan(0);
    step(s);
    expect(s.strategy).toBe("local");
    expect(s.tick * TICK_MS).toBe(20400);
    chooseStrategy(s, "trade");
    expect(s.coins).toBe(40);
  });
  it("deterministically replays queues across saves", () => {
    const s = createGame(NOW);
    order(s, {
      kind: "gather",
      targetId: "briarford-forest",
      resource: "timber",
      quantity: 20,
    });
    order(s, { kind: "move", targetId: "stonehaven" }, "next");
    step(s, 47);
    const t = validateSave(structuredClone(s));
    expect(t).not.toBeNull();
    step(s, 1000);
    step(t!, 1000);
    expect(t).toEqual(s);
    conservation(s);
  });
  it("rests after finite buffers", () => {
    const s = createGame(NOW);
    step(s, 6000);
    const gathered = structuredClone(s.gathered);
    step(s, 6000);
    expect(s.gathered).toEqual(gathered);
    expect(validateSave(s)).not.toBeNull();
  });
});
describe("player intentions", () => {
  it("interrupts travel next tick, preserves player progress first in queue", () => {
    const s = createGame(NOW);
    order(s, {
      kind: "gather",
      targetId: "briarford-forest",
      resource: "timber",
      quantity: 20,
    });
    step(s, 4);
    const old = structuredClone(s.control.active!);
    order(s, { kind: "move", targetId: "oakrest" });
    expect(s.control.queue[0]).toEqual(old);
    step(s);
    expect(s.people[0]!.path.at(-1)).toEqual({ x: 1360, y: 2210 });
  });
  it("interrupts work without creating resources and cancel retains carried items", () => {
    const s = createGame(NOW);
    order(s, {
      kind: "gather",
      resource: "timber",
      targetId: "oakrest-forest",
      quantity: 20,
    });
    until(s, () => !!s.people[0]!.carry);
    const carry = structuredClone(s.people[0]!.carry);
    applyCommand(s, { type: "cancel", id: s.control.active!.id });
    expect(s.people[0]!.carry).toEqual(carry);
    conservation(s);
  });
  it("orders 20 units with banking at the selected settlement", () => {
    const s = createGame(NOW);
    order(s, {
      kind: "gather",
      resource: "timber",
      targetId: "briarford-forest",
      quantity: 20,
    });
    until(s, () => s.control.active === null);
    expect(s.stores.briarford.timber).toBeGreaterThanOrEqual(20);
    expect(s.people[0]!.carry).toBeNull();
    expect(s.people[0]!.completed).toBeGreaterThanOrEqual(10);
  });
  it("repeats until canceled and wait holds position and work", () => {
    const s = createGame(NOW);
    order(s, {
      kind: "gather",
      resource: "stone",
      targetId: "oakrest-mine",
      quantity: 2,
      repeat: true,
    });
    step(s, 100);
    expect(s.control.active?.kind).toBe("gather");
    const p = s.people[0]!,
      before = structuredClone(p);
    applyCommand(s, { type: "wait" });
    step(s, 20);
    expect([p.x, p.y, p.xp, p.carry]).toEqual([
      before.x,
      before.y,
      before.xp,
      before.carry,
    ]);
    applyCommand(s, { type: "autonomy" });
    step(s, 10);
    expect(s.control.waiting).toBe(false);
    conservation(s);
  });
  it("queues eight, rejects overflow, reorders and cancels", () => {
    const s = createGame(NOW);
    order(s, { kind: "move", targetId: "briarford" });
    for (let i = 0; i < 8; i++)
      expect(
        order(
          s,
          { kind: "move", targetId: i % 2 ? "oakrest" : "stonehaven" },
          "next",
        ).ok,
      ).toBe(true);
    expect(order(s, { kind: "move", targetId: "oakrest" }, "next").ok).toBe(
      false,
    );
    const id = s.control.queue[1]!.id;
    expect(applyCommand(s, { type: "reorder", id, direction: -1 }).ok).toBe(
      true,
    );
    expect(s.control.queue[0]!.id).toBe(id);
    expect(applyCommand(s, { type: "cancel", id }).ok).toBe(true);
    expect(s.control.queue).toHaveLength(7);
  });
  it("advances queue without thinking and thinks six ticks when empty", () => {
    const s = createGame(NOW);
    order(s, { kind: "move", point: { x: s.people[0]!.x, y: s.people[0]!.y } });
    order(s, { kind: "move", targetId: "briarford" }, "next");
    step(s);
    expect(s.control.active?.targetId).toBe("briarford");
    expect(s.people[0]!.action).toBe("Traveling");
    applyCommand(s, { type: "cancel", id: s.control.active!.id });
    step(s, 5);
    expect(s.control.active).toBeNull();
    step(s);
    expect(s.control.active?.kind).toBe("build");
  });
  it("rejects blocked moves and premature forging", () => {
    const s = createGame(NOW);
    expect(order(s, { kind: "move", point: { x: 3000, y: 2200 } }).ok).toBe(
      false,
    );
    expect(order(s, { kind: "forge" }).ok).toBe(false);
    expect(
      order(s, { kind: "gather", resource: "iron", targetId: "oakrest-forest" })
        .ok,
    ).toBe(false);
  });
  it("withdraws and deposits actual materials with a ten-unit cap", () => {
    const s = createGame(NOW);
    applyCommand(s, { type: "wait" });
    step(s, 100);
    const p = s.people[0]!,
      store = targetById("oakrest-store")!;
    Object.assign(p, { x: store.x, y: store.y });
    const initial = s.stores.oakrest.timber;
    expect(initial).toBeGreaterThan(10);
    order(s, {
      kind: "withdraw",
      resource: "timber",
      targetId: "oakrest-store",
      quantity: 20,
    });
    step(s);
    expect(p.carry).toEqual({ resource: "timber", amount: 10 });
    expect(s.stores.oakrest.timber).toBe(initial - 10);
    order(s, {
      kind: "deposit",
      resource: "timber",
      targetId: "oakrest-store",
      quantity: 2,
    });
    step(s);
    expect(p.carry?.amount).toBe(8);
    expect(s.stores.oakrest.timber).toBe(initial - 8);
    conservation(s);
  });
  it("direct build and forge fetch and consume real materials", () => {
    const s = createGame(NOW);
    order(s, { kind: "build" });
    until(s, () => s.workshop.complete);
    order(s, { kind: "forge", quantity: 2 });
    until(s, () => s.control.active === null);
    expect(s.workshop.forged).toBeGreaterThanOrEqual(2);
    expect(s.spent.iron).toBe(s.workshop.forged * 2);
    conservation(s);
  });
});
it("keeps repeated forging active until canceled", () => {
  const s = createGame(NOW);
  until(s, () => s.workshop.complete);
  order(s, { kind: "forge", quantity: 1, repeat: true });
  const activeId = s.control.active!.id;
  until(s, () => s.people[0]!.completed >= 20 && s.workshop.forged >= 5, 3000);
  expect(s.control.active?.id).toBe(activeId);
  expect(s.control.active?.repeat).toBe(true);
  expect(applyCommand(s, { type: "cancel", id: activeId }).ok).toBe(true);
  expect(s.control.active).toBeNull();
  conservation(s);
});
describe("offline reconciliation", () => {
  it.each([
    [0, 0],
    [1, 1500],
    [24, 36000],
    [72, 36000],
  ])("caps %s hours at %s ticks", (hours, ticks) => {
    const s = createGame(NOW);
    order(s, { kind: "move", targetId: "briarford" });
    const now = NOW + hours * 3600000;
    expect(reconcile(s, now).ticks).toBe(ticks);
    const committed = JSON.stringify(s);
    expect(reconcile(s, now).ticks).toBe(0);
    expect(JSON.stringify(s)).toBe(committed);
    conservation(s);
    expect(validateSave(s)).not.toBeNull();
  });
  it("preserves fractions and ignores clock regressions", () => {
    const s = createGame(NOW);
    expect(reconcile(s, NOW + 1200).ticks).toBe(0);
    expect(s.offlineRemainder).toBe(300);
    expect(reconcile(s, NOW + 2400).ticks).toBe(1);
    const copy = JSON.stringify(s);
    reconcile(s, NOW + 1200);
    expect(JSON.stringify(s)).toBe(copy);
  });
  it("uses local calendar boundaries", () => {
    expect(calendarDate(new Date(2026, 9, 28, 23, 59).getTime())).toBe(
      "2026-10-28",
    );
    expect(calendarDate(new Date(2026, 9, 29, 0, 1).getTime())).toBe(
      "2026-10-29",
    );
  });
});
describe("save validation and V1 migration", () => {
  it("preserves legacy time, positions, resources, workshop and XP", () => {
    const s = createGame(NOW);
    const old = v1(s);
    old.tick = 123;
    old.coins = 16;
    (old.people as PersonLike[])[0]!.xp = 88;
    const migrated = validateSave(old)!;
    expect(migrated).not.toBeNull();
    expect(migrated.version).toBe(2);
    expect(migrated.tick).toBe(123);
    expect(migrated.savedAt).toBe(NOW);
    expect(migrated.coins).toBe(16);
    expect(migrated.people[0]!.xp).toBe(88);
    expect(migrated.people.slice(0, 16).map((p) => [p.x, p.y])).toEqual(
      s.people.slice(0, 16).map((p) => [p.x, p.y]),
    );
    expect(migrated.stores.briarford).toEqual({ timber: 0, stone: 0, iron: 0 });
    expect(validateSave(migrated)).not.toBeNull();
    conservation(migrated);
  });
  it("migrates carried supplies and partial construction without changing the ledger", () => {
    const old = v1(createGame(NOW));
    old.stock = { timber: 5, stone: 3, iron: 4 };
    old.spent = { timber: 6, stone: 4, iron: 0 };
    old.gathered = { timber: 13, stone: 7, iron: 4 };
    old.workshop = {
      timber: 6,
      stone: 4,
      labor: 0,
      complete: false,
      forged: 0,
    };
    (old.people as { carry: unknown }[])[0]!.carry = {
      resource: "timber",
      amount: 2,
    };
    const s = validateSave(old)!;
    expect(s).not.toBeNull();
    expect(s.gathered).toEqual(old.gathered);
    expect(s.spent).toEqual(old.spent);
    expect(s.workshop).toEqual(old.workshop);
    expect(s.stores.oakrest).toEqual(old.stock);
    expect(s.people[0]!.carry).toEqual({ resource: "timber", amount: 2 });
    until(s, () => s.workshop.complete);
    expect(validateSave(s)).not.toBeNull();
  });
  it("moves legacy actors out of new footprints while preserving their progress", () => {
    const old = v1(createGame(NOW));
    const p = (old.people as Record<string, unknown>[])[0]!;
    Object.assign(p, {
      x: 615,
      y: 390,
      fromX: 615,
      fromY: 390,
      targetX: 615,
      targetY: 390,
      xp: 77,
    });
    const migrated = validateSave(old)!;
    expect(migrated).not.toBeNull();
    expect(isWalkable(migrated.people[0]!)).toBe(true);
    expect(migrated.people[0]!.xp).toBe(77);
    expect(validateSave(migrated)).not.toBeNull();
    conservation(migrated);
  });
  it("rejects legacy actor and movement corruption before migration", () => {
    for (const patch of [
      { duration: 101 },
      { action: "invent resources" },
      { x: 1201 },
      { carry: { resource: "iron", amount: 3 } },
    ]) {
      const old = v1(createGame(NOW));
      Object.assign((old.people as object[])[0]!, patch);
      expect(validateSave(old)).toBeNull();
    }
  });
  it.each([null, {}, [], "save", { version: 2 }, { version: 1, people: [{}] }])(
    "rejects malformed %s",
    (v) => expect(validateSave(v)).toBeNull(),
  );
  it("rejects corrupted ledgers, queues, paths, roles and work", () => {
    const original = createGame(NOW);
    const mutations: ((s: GameState) => void)[] = [
      (s) => {
        s.stores.briarford.timber = 999;
      },
      (s) => {
        s.people[0]!.duration = 0;
      },
      (s) => {
        s.workshop.complete = true;
      },
      (s) => {
        s.people[1]!.role = "prince";
      },
      (s) => {
        s.control.nextId = 0;
      },
      (s) => {
        s.people[0]!.path = [{ x: 3000, y: 2200 }];
      },
    ];
    for (const mutate of mutations) {
      const s = structuredClone(original);
      mutate(s);
      expect(validateSave(s)).toBeNull();
    }
    const old = v1(original);
    old.stock = { timber: 99, stone: 0, iron: 0 };
    expect(validateSave(old)).toBeNull();
  });
});
interface PersonLike {
  xp: number;
}
