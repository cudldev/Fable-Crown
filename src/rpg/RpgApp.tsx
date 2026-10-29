import { useEffect, useRef, useState } from "react";
import TileScene, {
  type TileCamera,
  type TileSelection,
} from "../render/TileScene";
import {
  WORLD,
  TOWNS,
  objectById,
  interactionTiles,
  worldForState,
} from "./world";
import { SKILLS, type RpgState, type RpgCommand, type RpgOrder } from "./types";
import { levelForXp, skillName, XP_THRESHOLDS } from "./skills";
import { ITEMS, RESOURCES, RECIPES, SHOPS, ENEMIES, QUESTS } from "./content";
import { itemCount, inventorySlots } from "./inventory";
import { suggestGoals } from "./planning";
import type { SkillId, EquipmentSlot } from "./types";
import "./rpg.css";
const base = import.meta.env.BASE_URL;
const itemName = (id: string) =>
  ITEMS[id]?.name ??
  id
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function RpgApp() {
  const [state, setState] = useState<RpgState | null>(null),
    [camera, setCamera] = useState<TileCamera>({
      x: 52,
      y: 95,
      zoom: 0.85,
      follow: true,
      overview: false,
      grid: false,
    }),
    [selection, setSelection] = useState<TileSelection | null>(null),
    [panel, setPanel] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [hasArchive, setHasArchive] = useState(false),
    [storageOkay, setStorageOkay] = useState(true),
    [offline, setOffline] = useState(""),
    [worldSize, setWorldSize] = useState(""),
    [quantity, setQuantity] = useState(10),
    [bagItem, setBagItem] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const w = new Worker(new URL("./game.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e) => {
      if ("archive" in e.data) {
        if (e.data.archive)
          download(e.data.archive, "fable-crown-archived-chapter.json");
        return;
      }
      setState(e.data.state);
      setHasArchive(e.data.hasArchive);
      setStorageOkay(e.data.storageOkay);
      if (e.data.message) setMessage(e.data.message);
    };
    w.onerror = () =>
      setMessage("The RPG chapter could not start. Reload to try again.");
    const visibility = () =>
        w.postMessage({ type: document.hidden ? "pause" : "resume" }),
      hide = () => w.postMessage({ type: "pause" });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    return () => {
      w.terminate();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelection(null);
        setPanel(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (panel === "menu" && !worldSize)
      fetch(`${base}art/manifest.json`)
        .then((r) => r.json())
        .then((m) => setWorldSize(`${(m.bytes / 1048576).toFixed(1)} MiB`))
        .catch(() => {});
  }, [panel, worldSize]);
  const send = (type: string, extra = {}) =>
    worker.current?.postMessage({ type, ...extra });
  const command = (command: RpgCommand) => send("command", { command });
  const order = (o: RpgOrder, next = false) => {
    command(next ? { type: "enqueue", order: o } : o);
    setSelection(null);
  };
  const open = (p: string) => {
    setPanel(panel === p ? null : p);
    setSelection(null);
  };
  const select = (s: TileSelection) => {
    setPanel(null);
    if (s.kind === "tile") {
      order({ type: "move", position: s.position });
      setSelection(s);
    } else setSelection(s);
  };
  const world = state ? worldForState(state) : WORLD;
  const selectedObject =
    selection?.kind === "object"
      ? world.objects.find((o) => o.id === selection.id)
      : undefined;
  const person =
    selection?.kind === "actor" && state
      ? [state.player, ...state.npcs].find((p) => p.id === selection.id)
      : undefined;
  const player = state?.player;
  const enemy =
    selection?.kind === "enemy"
      ? state?.enemies.find((e) => e.id === selection.id)
      : undefined;
  const drop =
    selection?.kind === "drop"
      ? state?.drops.find((d) => d.id === selection.id)
      : undefined;
  const grave = selection?.kind === "grave" ? state?.grave : undefined;
  const labelOrder = (o: RpgOrder) => {
    if (o.type === "move") return `Travel to ${o.position.x}, ${o.position.y}`;
    if (o.type === "gather")
      return `Gather ${o.quantity} · ${objectById(o.objectId)?.name ?? "resources"}`;
    if (o.type === "craft")
      return `Make ${o.quantity} · ${RECIPES[o.recipeId]?.name ?? o.recipeId}`;
    if (o.type === "buy" || o.type === "sell")
      return `${o.type === "buy" ? "Buy" : "Sell"} ${o.quantity} ${itemName(o.itemId)}`;
    if (o.type === "quest")
      return QUESTS[o.questId]?.name ?? "Visit quest giver";
    if (o.type === "attack")
      return `Fight ${ENEMIES[state?.enemies.find((e) => e.id === o.enemyId)?.definitionId ?? ""]?.name ?? "enemy"}`;
    if (o.type === "withdraw")
      return `Withdraw ${o.quantity} ${itemName(o.itemId)}`;
    if (o.type === "equip" || o.type === "eat")
      return `${o.type} ${itemName(o.itemId)}`;
    return o.type === "recover"
      ? "Recover backpack"
      : o.type === "loot"
        ? "Collect loot"
        : o.type === "unequip"
          ? `Remove ${o.slot}`
          : "Deposit backpack";
  };
  const bagSlots = player
    ? player.inventory.flatMap((item) =>
        Array.from(
          { length: ITEMS[item.itemId]?.stackable ? 1 : item.quantity },
          () => ({
            ...item,
            quantity: ITEMS[item.itemId]?.stackable ? item.quantity : 1,
          }),
        ),
      )
    : [];
  function nextUnlock(skill: SkillId, level: number) {
    const options = [
      ...Object.values(RESOURCES)
        .filter((r) => r.skill === skill)
        .map((r) => ({ name: r.name, level: r.level })),
      ...Object.values(RECIPES)
        .filter((r) => r.skill === skill)
        .map((r) => ({ name: r.name, level: r.level })),
      ...Object.values(ITEMS)
        .filter((i) => i.skill === skill)
        .map((i) => ({ name: i.name, level: i.level ?? 1 })),
      ...Object.values(ITEMS)
        .filter((i) =>
          skill === "attack"
            ? i.attackLevel
            : skill === "defence"
              ? i.defenceLevel
              : false,
        )
        .map((i) => ({
          name: i.name,
          level: skill === "attack" ? i.attackLevel! : i.defenceLevel!,
        })),
    ]
      .filter((o) => o.level > level)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    return options[0];
  }
  const town = player
    ? TOWNS.reduce((a, b) =>
        Math.hypot(
          a.position.x - player.position.x,
          a.position.y - player.position.y,
        ) <
        Math.hypot(
          b.position.x - player.position.x,
          b.position.y - player.position.y,
        )
          ? a
          : b,
      )
    : TOWNS[0]!;
  async function offlineWorld() {
    setOffline("Preparing…");
    try {
      const m = (await (await fetch(`${base}art/manifest.json`)).json()) as {
        version: string;
        files: string[];
      };
      const cache = await caches.open("fable-art-" + m.version);
      for (let i = 0; i < m.files.length; i++) {
        const url = base + m.files[i];
        if (!(await cache.match(url, { ignoreVary: true })))
          await cache.add(url);
        setOffline(`${Math.round(((i + 1) / m.files.length) * 100)}%`);
      }
      setOffline("World saved offline");
    } catch {
      setOffline("Download paused · retry");
    }
  }
  const contextualOrder = selectedObject
    ? selectedObject.resourceId
      ? ({ type: "gather", objectId: selectedObject.id, quantity } as RpgOrder)
      : selectedObject.kind === "bank"
        ? ({ type: "bank", objectId: selectedObject.id } as RpgOrder)
        : selectedObject.questId
          ? ({ type: "quest", questId: selectedObject.questId } as RpgOrder)
          : ({
              type: "move",
              position: {
                ...(selectedObject.blocks
                  ? (interactionTiles(selectedObject, world)[0] ??
                    selectedObject.position)
                  : selectedObject.position),
              },
            } as RpgOrder)
    : null;
  return (
    <main className="game-shell rpg-shell" aria-label="Fable Crown RPG">
      {state ? (
        <TileScene
          state={state}
          camera={camera}
          onCamera={setCamera}
          selection={selection}
          onSelect={select}
        />
      ) : (
        <div className="loading-screen">
          <h1>Fable Crown</h1>
          <p>Opening a new chapter…</p>
        </div>
      )}
      <header className="world-header">
        <button
          className="realm-plaque"
          aria-label="Open destinations"
          onClick={() => open("world")}
        >
          <img src={`${base}crown.svg`} alt="" />
          <span>
            <small>FABLE CROWN</small>
            <strong>{town.name}</strong>
          </span>
        </button>
        <div className="header-actions">
          <button
            aria-label="World overview"
            onClick={() =>
              setCamera((c) => ({ ...c, overview: !c.overview, follow: false }))
            }
          >
            ⌖ World
          </button>
          <button aria-label="Open game menu" onClick={() => open("menu")}>
            ☰
          </button>
        </div>
      </header>
      <div className="camera-controls">
        <button
          aria-label="Zoom in"
          onClick={() =>
            setCamera((c) => ({
              ...c,
              zoom: Math.min(2, c.zoom * 1.25),
              overview: false,
            }))
          }
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          onClick={() =>
            setCamera((c) => ({
              ...c,
              zoom: Math.max(0.15, c.zoom / 1.25),
              overview: false,
            }))
          }
        >
          −
        </button>
        <button
          aria-label="Follow Alden"
          onClick={() =>
            setCamera((c) => ({ ...c, follow: true, overview: false }))
          }
        >
          Follow Alden
        </button>
        <button
          aria-label="Toggle tile grid"
          aria-pressed={camera.grid}
          onClick={() => setCamera((c) => ({ ...c, grid: !c.grid }))}
        >
          ▦
        </button>
      </div>
      {state && (
        <button
          className="thought-peek"
          aria-label="Open thoughts"
          onClick={() => open("thoughts")}
        >
          ✧ Alden’s thoughts{" "}
          <span>
            {state.control.waiting
              ? "waiting"
              : state.control.goal
                ? "pursuing a goal"
                : "thinking ahead"}
          </span>
        </button>
      )}
      {selectedObject && state && (
        <section
          className="parchment context-panel"
          aria-label="Object actions"
        >
          <button
            className="close"
            aria-label="Close actions"
            onClick={() => setSelection(null)}
          >
            ×
          </button>
          <span className="eyebrow">
            {selectedObject.kind} · {selectedObject.position.x},{" "}
            {selectedObject.position.y}
          </span>
          <h2>{selectedObject.name}</h2>
          <p>
            {selectedObject.resourceId
              ? `${RESOURCES[selectedObject.resourceId].name} · ${skillName(RESOURCES[selectedObject.resourceId].skill)} ${RESOURCES[selectedObject.resourceId].level} · ${(RESOURCES[selectedObject.resourceId].xp / 10).toFixed(1)} XP per success. Bring a ${RESOURCES[selectedObject.resourceId].tool}.`
              : "A place to visit and use in the frontier."}
          </p>
          {selectedObject.resourceId && (
            <label>
              Quantity
              <select
                aria-label="Quantity"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              >
                {[1, 10, 28].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          )}
          {selectedObject.questId && QUESTS[selectedObject.questId] && (
            <>
              <p>{QUESTS[selectedObject.questId].description}</p>
              <button
                className="full"
                onClick={() => {
                  const q = QUESTS[selectedObject.questId!];
                  command({
                    type: "goal",
                    goal: {
                      id: `quest-${q.id}`,
                      title: q.name,
                      kind: "quest",
                      questId: q.id,
                    },
                  });
                  setSelection(null);
                }}
              >
                Make this my ambition
              </button>
            </>
          )}
          <div className="order-actions">
            <button className="primary" onClick={() => order(contextualOrder!)}>
              Do now
            </button>
            <button onClick={() => order(contextualOrder!, true)}>
              Add next
            </button>
          </div>
          {selectedObject.kind === "shop" && (
            <button
              className="full"
              onClick={() => open("shop:" + selectedObject.shopId)}
            >
              Browse supplies
            </button>
          )}
          {["furnace", "anvil", "range"].includes(selectedObject.kind) && (
            <button
              className="full"
              onClick={() => open("craft:" + selectedObject.kind)}
            >
              Craft here
            </button>
          )}
        </section>
      )}
      {person && (
        <section
          className="parchment context-panel"
          aria-label="Character details"
        >
          <button
            className="close"
            aria-label="Close actions"
            onClick={() => setSelection(null)}
          >
            ×
          </button>
          <span className="eyebrow">{person.role}</span>
          <h2>{person.name}</h2>
          <p>{person.activity}</p>
          <p>
            Health {person.health} · Run energy{" "}
            {Math.floor(person.runEnergy / 100)}%
          </p>
          <p>
            Tile {person.position.x}, {person.position.y}
          </p>
          {SKILLS.map((s) => (
            <span className="rpg-skill-mini" key={s}>
              {skillName(s)} {levelForXp(person.skills[s])}
            </span>
          ))}
        </section>
      )}
      {enemy && state && (
        <section className="parchment context-panel" aria-label="Enemy actions">
          <button
            className="close"
            aria-label="Close actions"
            onClick={() => setSelection(null)}
          >
            ×
          </button>
          <span className="eyebrow">
            WILDERNESS · {enemy.position.x}, {enemy.position.y}
          </span>
          <h2>{ENEMIES[enemy.definitionId].name}</h2>
          <p>
            Health {enemy.health}/{ENEMIES[enemy.definitionId].health} ·{" "}
            {ENEMIES[enemy.definitionId].aggressive
              ? "Defends hostile ground"
              : "Attacks when challenged"}
          </p>
          <p>
            Bring food and suitable equipment. Alden can prepare before
            training.
          </p>
          <div className="order-actions">
            <button
              className="primary"
              disabled={enemy.health <= 0}
              onClick={() => order({ type: "attack", enemyId: enemy.id })}
            >
              Attack now
            </button>
            <button
              disabled={enemy.health <= 0}
              onClick={() => order({ type: "attack", enemyId: enemy.id }, true)}
            >
              Add next
            </button>
          </div>
          <button
            className="full"
            onClick={() => {
              command({
                type: "goal",
                goal: {
                  id: "train-combat",
                  kind: "skill",
                  skill: state.control.style,
                  level: Math.min(
                    99,
                    levelForXp(state.player.skills[state.control.style]) + 1,
                  ),
                  title: `Train ${skillName(state.control.style)}`,
                },
              });
              setSelection(null);
            }}
          >
            Prepare and train
          </button>
        </section>
      )}
      {(drop || grave) && (
        <section
          className="parchment context-panel"
          aria-label="Recovery actions"
        >
          <button
            className="close"
            aria-label="Close actions"
            onClick={() => setSelection(null)}
          >
            ×
          </button>
          <span className="eyebrow">
            {grave ? "YOUR RECOVERABLE BACKPACK" : "GROUND LOOT"}
          </span>
          <h2>{grave ? "Alden’s grave" : "Spoils of the road"}</h2>
          {(drop ?? grave)!.items.map((i) => (
            <p key={i.itemId}>
              {itemName(i.itemId)} ×{i.quantity}
            </p>
          ))}
          <button
            className="primary full"
            onClick={() =>
              order(
                grave
                  ? { type: "recover" }
                  : { type: "loot", dropId: drop!.id },
              )
            }
          >
            {grave ? "Recover backpack" : "Collect loot"}
          </button>
        </section>
      )}
      {panel && state && (
        <section
          className={`parchment drawer ${panel === "thoughts" ? "thought-panel" : ""}`}
          aria-label={`${panel} panel`}
        >
          <button
            className="close"
            aria-label="Close panel"
            onClick={() => setPanel(null)}
          >
            ×
          </button>
          {panel === "world" && (
            <>
              <span className="eyebrow">THE FRONTIER</span>
              <h2>Paths worth taking</h2>
              <p>256 × 192 tiles · 3 settlements</p>
              <div className="destination-list">
                {world.objects
                  .filter(
                    (o) =>
                      o.kind === "landmark" ||
                      o.kind === "bank" ||
                      o.kind === "quest",
                  )
                  .map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setSelection({ kind: "object", id: o.id });
                        setPanel(null);
                        setCamera((c) => ({
                          ...c,
                          x: o.position.x,
                          y: o.position.y,
                          follow: false,
                          overview: false,
                        }));
                      }}
                    >
                      <span>
                        {o.name}
                        <small>
                          {o.position.x}, {o.position.y} · {o.kind}
                        </small>
                      </span>
                      <span>›</span>
                    </button>
                  ))}
                <h3>Beyond the towns</h3>
                {Object.keys(ENEMIES).map((type) => {
                  const e = state.enemies.find(
                    (e) => e.definitionId === type && e.health > 0,
                  );
                  return (
                    e && (
                      <button
                        key={type}
                        onClick={() => {
                          setSelection({ kind: "enemy", id: e.id });
                          setPanel(null);
                          setCamera((c) => ({
                            ...c,
                            x: e.position.x,
                            y: e.position.y,
                            follow: false,
                            overview: false,
                          }));
                        }}
                      >
                        <span>
                          {ENEMIES[type].name}
                          <small>
                            {e.position.x}, {e.position.y} ·{" "}
                            {ENEMIES[type].aggressive ? "hostile" : "challenge"}
                          </small>
                        </span>
                        <span>›</span>
                      </button>
                    )
                  );
                })}
              </div>
            </>
          )}
          {panel === "thoughts" && (
            <>
              <span className="eyebrow">ALDEN’S INTENTIONS</span>
              <h2>{state.control.goal?.title ?? "The road ahead"}</h2>
              <p>{state.control.reason}</p>
              <p className="rpg-current-order">
                Now:{" "}
                {state.control.active
                  ? labelOrder(state.control.active)
                  : state.player.activity}
              </p>
              {state.control.steps.length > 0 && (
                <ol>
                  {state.control.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
              {(state.control.thought?.choices ?? suggestGoals(state)).map(
                (choice) => (
                  <button
                    className="choice plan-choice full"
                    key={choice.id}
                    aria-label={`Choose thought: ${choice.label}`}
                    onClick={() => {
                      command({ type: "goal", goal: choice.goal });
                      setPanel(null);
                    }}
                  >
                    <strong>{choice.label}</strong>
                    <span>{choice.description}</span>
                  </button>
                ),
              )}
              {state.control.thought && (
                <small>
                  Continues automatically in{" "}
                  {Math.max(
                    0,
                    Math.ceil(
                      (state.control.thought.expiresAt - state.tick) * 0.6,
                    ),
                  )}
                  s.
                </small>
              )}
              <small>
                Alden handles the steps. Leave him to his plan, or choose a
                different ambition. Wait stops the current action and holds your
                queued orders.
              </small>
              <h3>Next orders · {state.control.queue.length}/8</h3>
              {state.control.queue.length ? (
                state.control.queue.map((o, i) => (
                  <div className="rpg-queued-order" key={`${i}-${o.type}`}>
                    <span>
                      {i + 1}. {labelOrder(o)}
                    </span>
                    <div>
                      <button
                        aria-label={`Move order ${i + 1} earlier`}
                        disabled={i === 0}
                        onClick={() =>
                          command({
                            type: "reorder-order",
                            index: i,
                            direction: -1,
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move order ${i + 1} later`}
                        disabled={i === state.control.queue.length - 1}
                        onClick={() =>
                          command({
                            type: "reorder-order",
                            index: i,
                            direction: 1,
                          })
                        }
                      >
                        ↓
                      </button>
                      <button
                        aria-label={`Remove order ${i + 1}`}
                        onClick={() =>
                          command({ type: "cancel-order", index: i })
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p>No queued orders. Alden continues his ambition.</p>
              )}
              <div className="order-actions">
                <button onClick={() => command({ type: "wait" })}>
                  Wait here
                </button>
                <button
                  className="primary"
                  onClick={() => command({ type: "resume" })}
                >
                  Let Alden decide
                </button>
              </div>
            </>
          )}
          {panel === "skills" && (
            <>
              <span className="eyebrow">A JOURNEY OF PRACTICE</span>
              <h2>Skills</h2>
              <div className="rpg-skill-list">
                {SKILLS.map((skill) => {
                  const xp = state.player.skills[skill],
                    level = levelForXp(xp),
                    start = XP_THRESHOLDS[level - 1]!,
                    next = XP_THRESHOLDS[Math.min(98, level)]!,
                    unlock = nextUnlock(skill, level),
                    target = unlock?.level ?? Math.min(99, level + 1);
                  return (
                    <button
                      key={skill}
                      onClick={() => {
                        command({
                          type: "goal",
                          goal: {
                            id: `train-${skill}`,
                            kind: "skill",
                            title: `Train ${skillName(skill)} to ${target}`,
                            skill,
                            level: target,
                          },
                        });
                        setPanel(null);
                      }}
                    >
                      <span>
                        <strong>{skillName(skill)}</strong>
                        <b>{level}</b>
                      </span>
                      <progress
                        value={xp - start}
                        max={Math.max(1, next - start)}
                      />
                      <small>
                        {Math.floor(xp / 10)} XP ·{" "}
                        {level < 99
                          ? `${Math.ceil((next - xp) / 10)} to level ${level + 1}`
                          : "Mastered"}
                      </small>
                      {unlock && (
                        <small className="rpg-unlock">
                          Next: {unlock.name} · {unlock.level}
                        </small>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {panel === "bag" && (
            <>
              <span className="eyebrow">ALDEN’S PACK</span>
              <h2>Inventory & equipment</h2>
              <p aria-label="Backpack capacity">
                {inventorySlots(state.player.inventory)} / 28 slots · coins and
                supplies stack
              </p>
              <div className="rpg-backpack" aria-label="Backpack">
                {Array.from({ length: 28 }, (_, i) => {
                  const item = bagSlots[i];
                  return (
                    <button
                      key={i}
                      disabled={!item}
                      title={item ? itemName(item.itemId) : "Empty slot"}
                      aria-label={
                        item
                          ? `${itemName(item.itemId)}, ${item.quantity}`
                          : `Empty backpack slot ${i + 1}`
                      }
                      aria-pressed={item && bagItem === item.itemId}
                      className={
                        item ? `item-${ITEMS[item.itemId]?.kind}` : "empty"
                      }
                      onClick={() => setBagItem(item?.itemId ?? null)}
                    >
                      {item && (
                        <>
                          <span>
                            {itemName(item.itemId)
                              .split(" ")
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 3)}
                          </span>
                          <small>
                            {item.quantity > 1
                              ? item.quantity
                              : itemName(item.itemId).split(" ").at(-1)}
                          </small>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              {bagItem && itemCount(state.player.inventory, bagItem) > 0 && (
                <div className="rpg-item-inspect">
                  <h3>{itemName(bagItem)}</h3>
                  <p>
                    {ITEMS[bagItem]?.skill
                      ? `${skillName(ITEMS[bagItem].skill!)} ${ITEMS[bagItem].level ?? 1} ${ITEMS[bagItem].kind === "food" ? "to make" : "to use"}. `
                      : ""}
                    {ITEMS[bagItem]?.attackLevel
                      ? `Attack ${ITEMS[bagItem].attackLevel} to wield. `
                      : ""}
                    {ITEMS[bagItem]?.heals
                      ? `Restores ${ITEMS[bagItem].heals} health. `
                      : ""}
                    {ITEMS[bagItem]?.weight ?? 0} kg
                  </p>
                  {ITEMS[bagItem]?.slot && (
                    <button
                      onClick={() =>
                        command({ type: "equip", itemId: bagItem })
                      }
                    >
                      Equip
                    </button>
                  )}
                  {ITEMS[bagItem]?.kind === "food" && (
                    <button
                      onClick={() => command({ type: "eat", itemId: bagItem })}
                    >
                      Eat
                    </button>
                  )}
                </div>
              )}
              <h3>Equipped</h3>
              <p>
                Bonuses:{" "}
                {Object.values(state.player.equipment).reduce(
                  (sum, id) => sum + (ITEMS[id]?.attack ?? 0),
                  0,
                )}{" "}
                attack ·{" "}
                {Object.values(state.player.equipment).reduce(
                  (sum, id) => sum + (ITEMS[id]?.strength ?? 0),
                  0,
                )}{" "}
                strength ·{" "}
                {Object.values(state.player.equipment).reduce(
                  (sum, id) => sum + (ITEMS[id]?.defence ?? 0),
                  0,
                )}{" "}
                defence
              </p>
              <label className="rpg-combat-style">
                Train with each hit
                <select
                  aria-label="Combat style"
                  value={state.control.style}
                  onChange={(e) =>
                    command({
                      type: "style",
                      skill: e.target.value as
                        "attack" | "strength" | "defence",
                    })
                  }
                >
                  <option value="attack">Attack · accuracy</option>
                  <option value="strength">Strength · damage</option>
                  <option value="defence">Defence · protection</option>
                </select>
              </label>
              {Object.entries(state.player.equipment).map(([slot, item]) => (
                <div className="rpg-bank-row" key={slot}>
                  <span>
                    {slot}: {itemName(item)}
                  </span>
                  <button
                    onClick={() =>
                      command({ type: "unequip", slot: slot as EquipmentSlot })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button className="full" onClick={() => order({ type: "bank" })}>
                Bank carried items
              </button>
              <h3>Personal bank</h3>
              <label className="rpg-combat-style">
                Withdraw quantity
                <select
                  aria-label="Withdraw quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                >
                  {[1, 5, 10, 28].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              {state.bank.length ? (
                state.bank.map((item) => (
                  <div className="rpg-bank-row" key={item.itemId}>
                    <span>
                      {itemName(item.itemId)} ×{item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        command({
                          type: "withdraw",
                          itemId: item.itemId,
                          quantity: Math.min(quantity, item.quantity),
                        })
                      }
                    >
                      Take {Math.min(quantity, item.quantity)}
                    </button>
                  </div>
                ))
              ) : (
                <p>Your connected bank is empty.</p>
              )}
            </>
          )}
          {panel === "journal" && (
            <>
              <span className="eyebrow">YOUR CHAPTER</span>
              <h2>Chronicle</h2>
              {Object.values(QUESTS).map((q) => {
                const progress = state.quests[q.id];
                return (
                  <article className="rpg-quest" key={q.id}>
                    <span className="eyebrow">
                      {progress?.complete
                        ? "COMPLETE"
                        : progress?.accepted
                          ? "IN PROGRESS"
                          : "A NEW OPPORTUNITY"}
                    </span>
                    <h3>{q.name}</h3>
                    <p>{q.description}</p>
                    {q.requirements && (
                      <small>
                        Skills:{" "}
                        {Object.entries(q.requirements)
                          .map(
                            ([skill, level]) =>
                              `${skillName(skill as SkillId)} ${level}`,
                          )
                          .join(" · ")}
                      </small>
                    )}
                    {q.items.map((i) => (
                      <p key={i.itemId}>
                        {itemName(i.itemId)} ·{" "}
                        {itemCount(state.player.inventory, i.itemId) +
                          itemCount(state.bank, i.itemId)}
                        /{i.quantity} packed or banked
                      </p>
                    ))}
                    {q.kills && (
                      <p>
                        {ENEMIES[q.kills.enemyId]?.name ?? q.kills.enemyId} ·{" "}
                        {progress?.kills ?? 0}/{q.kills.quantity} defeated
                      </p>
                    )}
                    <small>
                      Reward: {q.reward.coins} coins ·{" "}
                      {Object.entries(q.reward.xp)
                        .map(
                          ([skill, xp]) =>
                            `${xp! / 10} ${skillName(skill as SkillId)} XP`,
                        )
                        .join(" · ")}
                      <br />
                      Unlock: {q.reward.unlock.replaceAll("-", " ")}
                    </small>
                    {!progress?.complete && (
                      <button
                        className="full"
                        onClick={() => {
                          command({
                            type: "goal",
                            goal: {
                              id: `quest-${q.id}`,
                              title: q.name,
                              kind: "quest",
                              questId: q.id,
                            },
                          });
                          setPanel(null);
                        }}
                      >
                        Pursue this quest
                      </button>
                    )}
                  </article>
                );
              })}
              {state.grave && (
                <article className="rpg-quest">
                  <h3>Your backpack awaits</h3>
                  <p>
                    Tile {state.grave.position.x}, {state.grave.position.y}.
                    Equipment stayed with you. Carried items remain recoverable.
                  </p>
                  <button onClick={() => order({ type: "recover" })}>
                    Recover backpack
                  </button>
                </article>
              )}
              {state.journal.map((line, i) => (
                <p key={i}>✧ {line}</p>
              ))}
            </>
          )}
          {panel === "menu" && (
            <>
              <span className="eyebrow">FABLE CROWN</span>
              <h2>A new RPG chapter</h2>
              <p>
                Click a tile to travel. Inspect places to act. Drag, pinch or
                use the wheel to explore. Alden follows his ambitions without
                constant orders.
              </p>
              <div className="menu-grid">
                <button onClick={() => send("save")}>Save on device</button>
                <button
                  onClick={() =>
                    download(
                      { ...state, savedAt: Date.now() },
                      "fable-crown-rpg.json",
                    )
                  }
                >
                  Export RPG chronicle
                </button>
                <button onClick={() => input.current?.click()}>
                  Import RPG chronicle
                </button>
                {hasArchive && (
                  <button onClick={() => send("archive")}>
                    Export archived chapter
                  </button>
                )}
                <button
                  onClick={() => {
                    if (
                      confirm(
                        "Start a fresh RPG chapter? Export this chapter first to keep it.",
                      )
                    )
                      send("reset");
                  }}
                >
                  New RPG chapter
                </button>
              </div>
              <hr />
              <button
                className="primary full"
                disabled={offline.endsWith("%") || offline === "Preparing…"}
                onClick={offlineWorld}
              >
                {offline ||
                  `Save world offline${worldSize ? " · " + worldSize : ""}`}
              </button>
              <small>
                {storageOkay
                  ? "Progress saves on this device."
                  : "Browser storage unavailable. Export your chapter."}{" "}
                Earlier village saves are stored separately. No server or API
                key is required.
              </small>
            </>
          )}
          {panel.startsWith("shop:") &&
            (() => {
              const id = panel.slice(5),
                shop = SHOPS[id],
                stock = state.shops.find((s) => s.id === id)?.stock ?? {};
              return (
                <>
                  <span className="eyebrow">LOCAL MERCHANT</span>
                  <h2>{shop?.name ?? "Supplies"}</h2>
                  <p>
                    {itemCount(state.player.inventory, "coins")} coins in your
                    pack. Alden travels to the shop before trading.
                  </p>
                  <div className="rpg-shop-list">
                    {Object.entries(shop?.stock ?? {}).map(([item, price]) => (
                      <article key={item}>
                        <strong>{itemName(item)}</strong>
                        <small>
                          {stock[item] ?? 0} in stock · {price.buy} coins
                        </small>
                        <div className="order-actions">
                          <button
                            disabled={
                              !(stock[item] > 0) ||
                              itemCount(state.player.inventory, "coins") <
                                price.buy
                            }
                            onClick={() =>
                              order({
                                type: "buy",
                                shopId: id,
                                itemId: item,
                                quantity: 1,
                              })
                            }
                          >
                            Buy 1
                          </button>
                          {["tool", "gear"].includes(ITEMS[item]?.kind) && (
                            <button
                              onClick={() => {
                                command({
                                  type: "goal",
                                  goal: {
                                    id: `obtain-${item}`,
                                    title: `Obtain ${itemName(item)}`,
                                    kind: "equipment",
                                    itemId: item,
                                  },
                                });
                                setPanel(null);
                              }}
                            >
                              Aim for this
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  <h3>Sell from your pack</h3>
                  {state.player.inventory
                    .filter(
                      (i) =>
                        i.itemId !== "coins" && shop?.stock[i.itemId]?.sell > 0,
                    )
                    .map((i) => (
                      <div className="rpg-bank-row" key={i.itemId}>
                        <span>
                          {itemName(i.itemId)} ×{i.quantity}
                        </span>
                        <button
                          onClick={() =>
                            order({
                              type: "sell",
                              shopId: id,
                              itemId: i.itemId,
                              quantity: i.quantity,
                            })
                          }
                        >
                          Sell all · {shop.stock[i.itemId].sell * i.quantity}
                        </button>
                      </div>
                    ))}
                </>
              );
            })()}
          {panel.startsWith("craft:") && (
            <>
              <span className="eyebrow">{panel.slice(6)}</span>
              <h2>Make something useful</h2>
              <p>
                Recipes use the ingredients in your pack. Take supplies from
                your bank before crafting.
              </p>
              <label>
                Quantity{" "}
                <select
                  aria-label="Craft quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                >
                  {[1, 5, 10, 28].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="rpg-shop-list">
                {Object.values(RECIPES)
                  .filter((r) => r.station === panel.slice(6))
                  .map((r) => {
                    const allowed =
                      levelForXp(state.player.skills[r.skill]) >= r.level;
                    return (
                      <article key={r.id}>
                        <strong>{r.name}</strong>
                        <small>
                          {skillName(r.skill)} {r.level} · {r.xp / 10} XP ·{" "}
                          {r.ticks * 0.6}s
                        </small>
                        <p>
                          {r.inputs
                            .map(
                              (i) =>
                                `${itemName(i.itemId)} ${itemCount(state.player.inventory, i.itemId)}/${i.quantity}`,
                            )
                            .join(" · ")}
                        </p>
                        <button
                          disabled={!allowed}
                          onClick={() =>
                            order({ type: "craft", recipeId: r.id, quantity })
                          }
                        >
                          {allowed
                            ? `Make ${quantity}`
                            : `Requires level ${r.level}`}
                        </button>
                      </article>
                    );
                  })}
              </div>
            </>
          )}
        </section>
      )}
      {player && state && (
        <footer className="intention-dock">
          <button
            className="hero-status"
            aria-label="Inspect Alden"
            onClick={() => {
              setSelection({ kind: "actor", id: 0 });
              setPanel(null);
            }}
          >
            <img src={`${base}art/prince.webp`} alt="" />
            <span>
              <strong>
                Alden{" "}
                <em>
                  HP {player.health}/{levelForXp(player.skills.hitpoints)}
                </em>
              </strong>
              <span className="doing-now">{player.activity}</span>
            </span>
          </button>
          <button
            className="next-intention"
            aria-label="Inspect current ambition"
            onClick={() => open("thoughts")}
          >
            <small>AMBITION</small>
            <span>{state.control.goal?.title ?? state.control.reason}</span>
          </button>
          <div className="dock-buttons">
            <button aria-label="Open skills" onClick={() => open("skills")}>
              Skills
            </button>
            <button aria-label="Open inventory" onClick={() => open("bag")}>
              Bag
            </button>
            <button aria-label="Open chronicle" onClick={() => open("journal")}>
              Journal
            </button>
          </div>
        </footer>
      )}
      {message && (
        <div role="status" className="toast">
          {message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}
      <input
        hidden
        ref={input}
        type="file"
        accept="application/json,.json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            if (f.size > 2000000) throw Error();
            send("import", { value: JSON.parse(await f.text()) });
          } catch {
            setMessage(
              "That chronicle could not be read. Your chapter is safe.",
            );
          }
          e.target.value = "";
        }}
      />
    </main>
  );
}
