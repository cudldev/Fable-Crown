import PixelPortrait from "../render/PixelPortrait";
import { clampGameplayZoom, MAX_GAMEPLAY_ZOOM } from "../render/camera-limits";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type TileCamera,
  type TileSelection,
} from "../render/scene-types";
import { SceneHost } from "../render/SceneHost";
import {
  WORLD,
  TOWNS,
  objectById,
  interactionTiles,
  worldForState,
  findPath,
  pathToObject,
  FERRIES,
} from "./world";
import {
  SKILLS,
  type RpgState,
  type RpgCommand,
  type RpgOrder,
  type CommandReceipt,
} from "./types";
import { levelForXp, skillName } from "./skills";
import { ITEMS, RESOURCES, RECIPES, SHOPS, ENEMIES, QUESTS } from "./content";
import { itemCount, inventorySlots, stackLimitFor } from "./inventory";
import { suggestGoals } from "./planning";
import { useRewardFeedback } from "./useRewardFeedback";
import { formatXp, xpProgress } from "./reward-feedback";
import { contextGoals } from "./context-goals";
import { Minimap } from "../render/Minimap";
import { useGameAudio } from "./useGameAudio";
import { examineObject, itemUses } from "./interactions";
import { MessagePanel } from "./MessagePanel";
import { IntentionReadout } from "./IntentionReadout";
import { PlannerPanel, LastDeliberation } from "./PlannerPanel";
import { explainIntention } from "./intention-explanation";
import { starterChoices } from "./starter";
import { actionFeedback } from "./action-feedback";
import { defaultInteraction } from "./default-interaction";
import { WorldContextMenu, type WorldMenuItem } from "./WorldContextMenu";
import type { TilePosition } from "./types";
import type { SkillId, EquipmentSlot, CombatStyle } from "./types";
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
      zoom: MAX_GAMEPLAY_ZOOM,
      follow: true,
      overview: false,
      grid: false,
    }),
    [selection, setSelection] = useState<TileSelection | null>(null),
    [panel, setPanel] = useState<string | null>(null),
    [notice, setNotice] = useState({ text: "", sequence: 0 }),
    [hasArchive, setHasArchive] = useState(false),
    [storageOkay, setStorageOkay] = useState(true),
    [offline, setOffline] = useState(""),
    [worldSize, setWorldSize] = useState(""),
    [quantity, setQuantity] = useState(10),
    [bagItem, setBagItem] = useState<string | null>(null);
  const [feedbackEpoch, setFeedbackEpoch] = useState(0);
  const [bagSearch, setBagSearch] = useState("");
  const [bagFilter, setBagFilter] = useState("all");
  const [bagGrouped, setBagGrouped] = useState(false);
  const [bagSort, setBagSort] = useState("packed");
  const [worldMenu, setWorldMenu] = useState<{ selection: TileSelection; x: number; y: number } | null>(null);
  const [usingItem, setUsingItem] = useState<string | null>(null);
  const lastManualKey = useRef(0);
  const dock = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!dock.current) return;
    const footer = dock.current, shell = footer.closest("main");
    const observer = new ResizeObserver(() => shell?.style.setProperty("--dock-height", `${footer.offsetHeight}px`));
    observer.observe(footer);
    return () => observer.disconnect();
  }, [!!state]);
  const message = notice.text;
  const setMessage = (text: string) => setNotice(current => ({ text, sequence: current.sequence + 1 }));
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [rejection, setRejection] = useState<CommandReceipt | null>(null);
  const [commandNotice, setCommandNotice] = useState<{
    text: string;
    pending: boolean;
  } | null>(null);
  const requestSequence = useRef(0),
    latestRequest = useRef("");
  const reward = useRewardFeedback(state, feedbackEpoch);
  const audio = useGameAudio(state, feedbackEpoch);
  const [mapDestination, setMapDestination] = useState<TilePosition | null>(
      null,
    ),
    [examining, setExamining] = useState(false);
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
      if (e.data.resetFeedback) {
        setWorldMenu(null); setUsingItem(null);
        setFeedbackEpoch((value) => value + 1);
        setCommandNotice(null);
        setMessagesOpen(false);
        setRejection(null);
        latestRequest.current = "";
      }
      const receipt = e.data.receipt as CommandReceipt | undefined;
      if (receipt) setRejection(receipt.accepted ? null : receipt);
      if (receipt && receipt.requestId === latestRequest.current)
        setCommandNotice({
          text: `${receipt.accepted ? "Accepted" : "Rejected"} · ${receipt.message}`,
          pending: false,
        });
      setHasArchive(e.data.hasArchive);
      setStorageOkay(e.data.storageOkay);
      if (
        e.data.message &&
        !receipt?.accepted &&
        !/^(A new journey begins|Your journey continues)/.test(e.data.message)
      )
        setMessage(e.data.message);
    };
    w.onerror = () => {
      setCommandNotice(null);
      setMessage("The RPG chapter could not start. Reload to try again.");
    };
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
    if (!message || usingItem) return;
    const t = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(t);
  }, [message, notice.sequence, usingItem]);
  useEffect(() => {
    if (!commandNotice || commandNotice.pending) return;
    const timer = setTimeout(() => setCommandNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [commandNotice]);
  useEffect(() => {
    if (!commandNotice || commandNotice.pending) return;
    const timer = setTimeout(() => setCommandNotice(null), 1800);
    return () => clearTimeout(timer);
  }, [commandNotice]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setWorldMenu(null);
        setUsingItem(null);
        setMessage("");
        setMapDestination(null);
        setBagItem(null);
        setExamining(false);
        setSelection(null);
        setPanel(null);
        setMessagesOpen(false);
        command({ type: "cancel" });
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (panel === "menu" && !worldSize)
      fetch(`${base}world-assets.json`)
        .then((r) => r.json())
        .then((m) => setWorldSize(`${(m.bytes / 1048576).toFixed(1)} MiB`))
        .catch(() => {});
  }, [panel, worldSize]);
  const send = (type: string, extra = {}) => {
    if (type === "save" || type === "import") setMessage("");
    worker.current?.postMessage({ type, ...extra });
  };
  const command = (command: RpgCommand) => {
    const requestId = `request-${++requestSequence.current}`;
    latestRequest.current = requestId;
    const label =
      command.type === "goal"
        ? command.goal.title
        : command.type === "enqueue"
          ? `Queue ${command.order.type}`
          : command.type.replaceAll("-", " ");
    setCommandNotice({ text: `Requested · ${label}`, pending: true });
    send("command", { command, requestId });
  };
  const order = (o: RpgOrder, next = false) => {
    command(next ? { type: "enqueue", order: o } : o);
    setSelection(null);
    setMapDestination(null);
    setWorldMenu(null);
  };
  useEffect(() => {
    const move = (event: KeyboardEvent) => {
      const direction = ({ w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] } as Record<string, number[]>)[event.key.toLowerCase()];
      if (!direction || !state || panel || worldMenu || selection && selection.kind !== "tile" || event.ctrlKey || event.metaKey || event.altKey ||
        (event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      if (event.repeat && performance.now() - lastManualKey.current < 180) return;
      lastManualKey.current = performance.now();
      const position = { ...state.player.position, x: state.player.position.x + direction[0], y: state.player.position.y + direction[1] };
      if (findPath(state.player.position, position, worldForState(state))?.length !== 1) return;
      command({ type: "move", position });
      setCamera(current => ({ ...current, follow: true, overview: false }));
    };
    window.addEventListener("keydown", move);
    return () => window.removeEventListener("keydown", move);
  }, [state, panel, selection, worldMenu]);
  const open = (p: string) => {
    setWorldMenu(null);
    setMessagesOpen(false);
    setPanel(panel === p ? null : p);
    setSelection(null);
  };
  const select = (s: TileSelection) => {
    setWorldMenu(null);
    setMessagesOpen(false);
    setMapDestination(null);
    setExamining(false);
    setPanel(null);
    setSelection(s);
  };
  const interact = (selected: TileSelection) => {
    if (!state) return;
    setWorldMenu(null);
    if (usingItem && selected.kind === "object") {
      const target = objectById(selected.id), use = target && itemUses(state, usingItem, target)[0];
      if (!use) { setMessage(`You cannot use ${itemName(usingItem)} there. Escape cancels item use.`); return; }
      setUsingItem(null); setPanel(null); setSelection(null); setMessage("");
      if (use.command.type === "goal") command({ type: "autoplay", enabled: false });
      command(use.command); return;
    }
    setUsingItem(null);
    const action = defaultInteraction(state, selected);
    if (action.blocked) { setMessage(action.blocked); return; }
    if (!action.order) { select(selected); return; }
    setPanel(null); setMessagesOpen(false);
    order(action.order);
  };
  const menuItems: WorldMenuItem[] = [];
  if (state && worldMenu) {
    const selected = worldMenu.selection, action = defaultInteraction(state, selected);
    menuItems.push({ label: usingItem && selected.kind === "object" ? `Use ${itemName(usingItem)} → ${objectById(selected.id)?.name}` : action.label, run: () => interact(selected) });
    if (action.order && !usingItem) menuItems.push({ label: "Add next", run: () => {
      if (action.blocked) setMessage(action.blocked!);
      else order(action.order!, true);
    } });
    if (selected.kind !== "tile") menuItems.push({ label: "More options", run: () => select(selected) });
    menuItems.push({ label: "Examine", run: () => { select(selected); setExamining(true); } });
  }
  const world = state ? worldForState(state) : WORLD;
  const selectedObject =
    selection?.kind === "object"
      ? world.objects.find((o) => o.id === selection.id)
      : undefined;
  const previewRoute = useMemo(() => {
    if (!state) return [];
    return (
      (mapDestination
        ? findPath(state.player.position, mapDestination, world)
        : selectedObject
          ? pathToObject(state.player.position, selectedObject, world)
          : []) ?? []
    );
  }, [
    state?.player.position.x,
    state?.player.position.y,
    world,
    mapDestination,
    selectedObject,
  ]);
  const person =
    selection?.kind === "actor" && state
      ? [state.player, ...state.npcs].find((p) => p.id === selection.id)
      : undefined;
  const player = state?.player;
  const intention = state ? explainIntention(state) : null;
  const work = state ? actionFeedback(state) : null;
  const feedbackSkill = work?.skill ?? reward.skill;
  const autoplay = state?.control.autoplay !== false && !state?.control.waiting;
  const hasBow = ITEMS[player?.equipment.weapon ?? ""]?.weaponType === "bow";
  const combatSkill: SkillId =
    state && ["attack", "strength", "defence"].includes(state.control.style)
      ? (state.control.style as SkillId)
      : "ranged";
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
    if (o.type === "interact")
      return `${o.verb} · ${objectById(o.objectId)?.name ?? o.objectId}`;
    if (o.type === "travel-service")
      return FERRIES[o.objectId]?.name ?? "Take the ferry";
    if (o.type === "talk-actor")
      return `Talk to ${state?.npcs.find((actor) => actor.id === o.actorId)?.name ?? "villager"}`;
    if (o.type === "gate")
      return `${o.open ? "Open" : "Close"} ${objectById(o.objectId)?.name ?? "gate"}`;
    if (o.type === "unequip-ammo") return "Remove equipped arrows";
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
          { length: bagGrouped || ITEMS[item.itemId]?.stackable ? 1 : item.quantity },
          () => ({
            ...item,
            quantity: bagGrouped || ITEMS[item.itemId]?.stackable ? item.quantity : 1,
          }),
        ),
      )
    : [];
  const visibleBag = bagSlots.filter(item => (bagFilter === "all" || ITEMS[item.itemId]?.kind === bagFilter) &&
    itemName(item.itemId).toLowerCase().includes(bagSearch.trim().toLowerCase()));
  if (bagSort !== "packed") visibleBag.sort((a, b) => bagSort === "value"
    ? (ITEMS[b.itemId]?.value ?? 0) - (ITEMS[a.itemId]?.value ?? 0) || itemName(a.itemId).localeCompare(itemName(b.itemId))
    : itemName(a.itemId).localeCompare(itemName(b.itemId)));
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
              : skill === "ranged"
                ? i.rangedLevel
                : false,
        )
        .map((i) => ({
          name: i.name,
          level:
            skill === "attack"
              ? i.attackLevel!
              : skill === "ranged"
                ? i.rangedLevel!
                : i.defenceLevel!,
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
      const m = (await (await fetch(`${base}world-assets.json`)).json()) as {
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
          : selectedObject.kind === "ferry"
            ? ({
                type: "travel-service",
                objectId: selectedObject.id,
              } as RpgOrder)
            : selectedObject.kind === "gate"
              ? ({
                  type: "gate",
                  objectId: selectedObject.id,
                  open: !(state?.gates[selectedObject.id] ?? true),
                } as RpgOrder)
              : ["clue", "target", "sign"].includes(selectedObject.kind)
                ? ({
                    type: "interact",
                    objectId: selectedObject.id,
                    verb:
                      selectedObject.kind === "target" ? "practice" : "inspect",
                  } as RpgOrder)
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
    <main
      className="game-shell rpg-shell"
      aria-label="Fable Crown RPG"
      data-messages-open={messagesOpen}
      data-panel-open={!!panel || (!!selection && selection.kind !== "tile")}
    >
      {state ? (
        <SceneHost
          state={state}
          camera={camera}
          onCamera={setCamera}
          selection={worldMenu?.selection ?? selection}
          onSelect={select}
          onInteract={interact}
          onContextMenu={(selected, point) => { setSelection(null); setPanel(null); setMessagesOpen(false); setMapDestination(null); setWorldMenu({ selection: selected, ...point }); }}
          feedback={reward.floaters}
          presentationEpoch={feedbackEpoch}
          onWorkContact={audio.workContact}
          onFootstep={audio.footstep}
          previewRoute={previewRoute}
        />
      ) : (
        <div className="loading-screen">
          <h1>Fable Crown</h1>
          <p>Opening a new chapter…</p>
        </div>
      )}
      {worldMenu && <WorldContextMenu x={worldMenu.x} y={worldMenu.y} items={menuItems} onClose={() => setWorldMenu(null)} />}
      {state && (
        <MessagePanel
          messages={state.messages}
          epoch={feedbackEpoch}
          expanded={messagesOpen}
          rejection={rejection}
          onExpandedChange={(value) => {
            setMessagesOpen(value);
            if (value) {
              setPanel(null);
              setSelection(null);
            }
          }}
        />
      )}
      {state && (
        <Minimap
          state={state}
          previewRoute={previewRoute}
          onDestination={(position) => {
            setMessagesOpen(false);
            setMapDestination(position);
            setSelection(null);
            setPanel(null);
            setCamera((c) => ({
              ...c,
              x: position.x,
              y: position.y,
              follow: false,
              overview: false,
            }));
          }}
        />
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
      {mapDestination && state && (
        <section
          className="parchment context-panel"
          aria-label="Travel preview"
        >
          <button
            className="close"
            aria-label="Close travel preview"
            onClick={() => setMapDestination(null)}
          >
            ×
          </button>
          <span className="eyebrow">ROUTE PREVIEW</span>
          <h2>Explore the frontier</h2>
          <p>
            Tile {mapDestination.x}, {mapDestination.y} ·{" "}
            {previewRoute.length
              ? `${previewRoute.length} tile steps`
              : "Already here or no walkable route"}
          </p>
          <div className="order-actions">
            <button
              disabled={!previewRoute.length}
              onClick={() => order({ type: "move", position: mapDestination })}
            >
              Travel here
            </button>
            <button
              disabled={!previewRoute.length}
              onClick={() =>
                order({ type: "move", position: mapDestination }, true)
              }
            >
              Add next
            </button>
          </div>
        </section>
      )}
      <div className="camera-controls">
        {state && (
          <button
            className="rpg-run-control"
            aria-label="Toggle running"
            aria-pressed={state.control.running !== false}
            onClick={() =>
              command({ type: "run", enabled: state.control.running === false })
            }
            title="Run: up to two tiles per tick. Walk to recover energy."
          >
            <span>
              {state.control.running !== false ? "Run" : "Walk"} ·{" "}
              {Math.floor(state.player.runEnergy / 100)}%
            </span>
            <progress
              aria-label="Run energy"
              value={state.player.runEnergy}
              max={10000}
            />
          </button>
        )}
        <button
          aria-label="Zoom in"
          onClick={() =>
            setCamera((c) => ({
              ...c,
              zoom: clampGameplayZoom(c.zoom * 1.25),
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
              zoom: clampGameplayZoom(c.zoom / 1.25),
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
      {state && intention && (
        <IntentionReadout
          view={intention}
          waiting={state.control.waiting}
          autoplay={autoplay}
          onAutoplay={() => command({ type: "autoplay", enabled: !autoplay })}
          onThoughts={() => open("thoughts")}
          onWait={() =>
            command({ type: state.control.waiting ? "resume" : "wait" })
          }
          onFocus={() => {
            const target = intention.targetPosition;
            if (target) {
              setPanel(null);
              setSelection(null);
              setMessagesOpen(false);
              setMapDestination(null);
              setCamera((c) => ({
                ...c,
                x: target.x,
                y: target.y,
                follow: false,
                overview: false,
                zoom: clampGameplayZoom(c.zoom),
              }));
            }
          }}
        />
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
          <div className="order-actions">
            <button onClick={() => setExamining((v) => !v)}>Examine</button>
            {selectedObject.questId && (
              <button
                onClick={() =>
                  order({
                    type: "interact",
                    objectId: selectedObject.id,
                    verb: "talk",
                  })
                }
              >
                Talk
              </button>
            )}
          </div>
          {examining && (
            <p className="rpg-current-order">
              {examineObject(state, selectedObject)}
            </p>
          )}
          {bagItem && itemCount(state.player.inventory, bagItem) > 0 && (
            <div className="context-goals" aria-label="Use carried item">
              <small>Selected: {itemName(bagItem)}</small>
              {itemUses(state, bagItem, selectedObject).length ? (
                itemUses(state, bagItem, selectedObject).map((use) => (
                  <button
                    key={use.label}
                    onClick={() => {
                      command(use.command);
                      setSelection(null);
                    }}
                  >
                    {use.label}
                  </button>
                ))
              ) : (
                <small>This item has no use here.</small>
              )}
            </div>
          )}
          <p>
            {selectedObject.resourceId
              ? `${RESOURCES[selectedObject.resourceId].name} · ${skillName(RESOURCES[selectedObject.resourceId].skill)} ${RESOURCES[selectedObject.resourceId].level} · ${(RESOURCES[selectedObject.resourceId].xp / 10).toFixed(1)} XP per success. Bring a ${RESOURCES[selectedObject.resourceId].tool}.`
              : (selectedObject.description ??
                "A place to visit and use in the frontier.")}
          </p>
          {selectedObject.resourceId && (
            <label>
              Quantity
              <select
                aria-label="Quantity"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              >
                {[1, 5, 10, 28].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          )}
          {selectedObject.kind !== "quest" &&
            ![
              "building",
              "landmark",
              "bridge",
              "gate",
              "sign",
              "fence",
              "decor",
            ].includes(selectedObject.kind) && (
              <div className="context-goals" aria-label="Goals for this place">
                {contextGoals(state, selectedObject, quantity).map((choice) => (
                  <button
                    key={choice.id}
                    className="choice"
                    onClick={() => {
                      command({ type: "goal", goal: choice.goal });
                      setSelection(null);
                    }}
                  >
                    <strong>{choice.label}</strong>
                    <small>{choice.description}</small>
                  </button>
                ))}
              </div>
            )}
          {selectedObject.questId && QUESTS[selectedObject.questId] && (
            <>
              <p>{QUESTS[selectedObject.questId].description}</p>
              <button
                className="primary full"
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
          {selectedObject.kind === "ferry" && FERRIES[selectedObject.id] && (
            <p>
              {state.quests[FERRIES[selectedObject.id].questId]?.complete
                ? `${FERRIES[selectedObject.id].name} · ${FERRIES[selectedObject.id].cost} coins per passage.`
                : "Complete River Letters to restore this ferry."}
            </p>
          )}
          {selectedObject.resourceId ? (
            <details className="rpg-direct-orders">
              <summary>Single action or queued order</summary>
              <div className="order-actions">
                <button onClick={() => order(contextualOrder!)}>Do now</button>
                <button onClick={() => order(contextualOrder!, true)}>
                  Add next
                </button>
              </div>
            </details>
          ) : (
            <div className="order-actions">
              <button
                className="primary"
                onClick={() => order(contextualOrder!)}
              >
                {selectedObject.kind === "gate"
                  ? (state.gates[selectedObject.id] ?? true)
                    ? "Close gate"
                    : "Open gate"
                  : selectedObject.kind === "sign"
                    ? "Read sign"
                    : "Do now"}
              </button>
              <button onClick={() => order(contextualOrder!, true)}>
                Add next
              </button>
            </div>
          )}
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
      {state?.dialogue && (
        <section
          className="parchment rpg-story-choice"
          aria-label="Quest conversation"
          aria-live="polite"
        >
          <span className="eyebrow">
            {QUESTS[state.dialogue.questId]?.name}
          </span>
          <p>{state.dialogue.text}</p>
          <div className="context-goals">
            {state.dialogue.choices.map((choice) => (
              <button
                key={choice.id}
                onClick={() =>
                  command({ type: "dialogue-choice", choiceId: choice.id })
                }
              >
                {choice.label}
              </button>
            ))}
          </div>
          <small>
            Alden will choose {state.dialogue.choices[0]?.label.toLowerCase()}{" "}
            in{" "}
            {Math.max(
              0,
              Math.ceil((state.dialogue.expiresAt - state.tick) * 0.6),
            )}
            s.
          </small>
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
          <button
            onClick={() =>
              person.id === 0
                ? open("thoughts")
                : order({ type: "talk-actor", actorId: person.id })
            }
          >
            {person.id === 0 ? "Thoughts" : "Talk"}
          </button>
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
                  skill: combatSkill,
                  level: Math.min(
                    99,
                    levelForXp(state.player.skills[combatSkill]) + 1,
                  ),
                  title: `Train ${skillName(combatSkill)}`,
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
          className={`parchment drawer ${panel === "thoughts" ? "thought-panel" : ""} ${panel === "bag" ? "wide-drawer inventory-drawer" : ""}`}
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
          {panel === "personality" && (
            <PlannerPanel
              state={state}
              onApply={(profile) =>
                command({ type: "planner-profile", profile })
              }
              onChoose={() => {
                command({ type: "reconsider" });
                setPanel("thoughts");
              }}
            />
          )}
          {panel === "thoughts" && (
            <>
              <span className="eyebrow">ALDEN’S INTENTIONS</span>
              <h2>{state.control.goal?.title ?? "The road ahead"}</h2>
              {intention && (
                <section
                  className="rpg-decision-detail"
                  aria-label="Current intention explained"
                >
                  <p>
                    <strong>Now:</strong> {intention.title}
                  </p>
                  <p>
                    <strong>Why:</strong> {intention.reason}
                  </p>
                  <p>
                    <strong>Next:</strong> {intention.next}
                  </p>
                  <small>
                    {intention.phase === "wait"
                      ? "Alden is paused. Villagers continue their routines."
                      : intention.phase === "blocked"
                        ? "Alden needs help with this blocker."
                        : intention.source === "player"
                          ? "Following your direct instructions."
                          : "Alden chose this step for his ambition."}
                  </small>
                </section>
              )}
              <LastDeliberation state={state} />
              <button className="full" onClick={() => open("personality")}>
                Personality & priorities
              </button>
              {state.control.thought?.id === "starter-oakrest" && (
                <p>{state.control.thought.body}</p>
              )}
              {state.control.goal?.kind === "gather" &&
                state.control.goal.resourceId &&
                (() => {
                  const g = state.control.goal,
                    r = RESOURCES[g.resourceId!],
                    held =
                      itemCount(state.player.inventory, r.itemId) +
                      itemCount(state.bank, r.itemId);
                  return (
                    <div className="rpg-goal-progress">
                      <progress
                        aria-label="Gathering goal progress"
                        value={Math.min(held, g.quantity!)}
                        max={g.quantity}
                      />
                      <small>
                        {held} / {g.quantity} {ITEMS[r.itemId].name} carried or
                        banked
                      </small>
                    </div>
                  );
                })()}
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
                  This suggestion closes in{" "}
                  {Math.max(
                    0,
                    Math.ceil(
                      (state.control.thought.expiresAt - state.tick) * 0.6,
                    ),
                  )}
                  s.
                </small>
              )}
              {state.control.thought?.id !== "starter-oakrest" &&
                !state.quests.forge.complete && (
                  <details className="rpg-starting-choices">
                    <summary>Ways to begin in Oakrest</summary>
                    {starterChoices(state).map((choice) => (
                      <button
                        className="choice plan-choice full"
                        key={choice.id}
                        onClick={() => {
                          command({ type: "goal", goal: choice.goal });
                          setPanel(null);
                        }}
                      >
                        <strong>{choice.label}</strong>
                        <span>{choice.description}</span>
                      </button>
                    ))}
                  </details>
                )}
              <small>
                Alden handles the steps. Leave him to his plan, or choose a
                different ambition. Wait stops the current action and holds your
                queued orders.
              </small>
              {!!state.control.decisions?.length && (
                <details
                  className="rpg-decision-history"
                  aria-label="Recent plan changes"
                >
                  <summary>Recent plan changes</summary>
                  <ol>
                    {state.control.decisions
                      .slice()
                      .reverse()
                      .map((decision, i) => (
                        <li key={`${decision.tick}-${i}`}>
                          <small>
                            {decision.source === "player"
                              ? "Your order"
                              : "Alden decided"}{" "}
                            · {Math.floor((state.tick - decision.tick) * 0.6)}s
                            ago
                          </small>
                          <strong>{decision.title}</strong>
                          <p>{decision.reason}</p>
                          <p>Next: {decision.next}</p>
                        </li>
                      ))}
                  </ol>
                </details>
              )}
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
                <p>{autoplay ? "No queued orders. Alden continues his ambition." : "No queued orders. Manual control holds until you choose an action or turn autoplay on."}</p>
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
                    progress = xpProgress(xp),
                    level = progress.level,
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
                        aria-label={`${skillName(skill)} level progress`}
                        value={progress.current}
                        max={progress.span}
                      />
                      <small>
                        {Math.floor(xp / 10)} XP ·{" "}
                        {level < 99
                          ? `${formatXp(progress.remaining)} to level ${level + 1} · ${Math.floor((progress.current / progress.span) * 100)}%`
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
                <strong>{inventorySlots(state.player.inventory)} / 28 slots</strong> · {28 - inventorySlots(state.player.inventory)} free · {itemCount(state.player.inventory, "coins").toLocaleString()} coins
              </p>
              <progress className="bag-capacity" aria-label="Backpack space used" value={inventorySlots(state.player.inventory)} max={28} />
              <div className="bag-tools">
                <label>Find an item<input type="search" aria-label="Search inventory" placeholder="Name…" value={bagSearch} onChange={event => setBagSearch(event.target.value)} /></label>
                <label>Show<select aria-label="Inventory category" value={bagFilter} onChange={event => setBagFilter(event.target.value)}>
                  <option value="all">Everything</option><option value="food">Food</option><option value="gear">Gear</option><option value="tool">Tools</option><option value="resource">Materials</option><option value="supply">Supplies</option><option value="currency">Coins</option>
                </select></label>
                <label>Sort<select aria-label="Inventory sort" value={bagSort} onChange={event => setBagSort(event.target.value)}><option value="packed">Packed order</option><option value="name">Name</option><option value="value">Value</option></select></label>
                <button aria-pressed={bagGrouped} onClick={() => setBagGrouped(value => !value)}>Group items {bagGrouped ? "on" : "off"}</button>
              </div>
              <small className="bag-help">Select an item to equip, eat or use it. Grouping changes the view; logs, ores and food still use one slot each.</small>
              <div className="rpg-backpack" aria-label="Backpack">
                {Array.from({ length: bagGrouped || bagSearch || bagFilter !== "all" ? visibleBag.length : 28 }, (_, i) => {
                  const item = visibleBag[i];
                  return (
                    <button
                      key={item ? `${item.itemId}:${visibleBag.slice(0, i).filter(slot => slot.itemId === item.itemId).length}` : `empty:${i}`}
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
                            {itemName(item.itemId)}
                          </span>
                          <small>
                            {item.quantity > 1
                              ? `×${item.quantity.toLocaleString()}`
                              : ITEMS[item.itemId]?.kind}
                          </small>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              {!visibleBag.length && <p>No matching items.</p>}
              <button className="full" onClick={() => { order({ type: "bank" }); setPanel(null); }}>Take backpack to bank</button>
              {bagItem && itemCount(state.player.inventory, bagItem) > 0 && (
                <div className="rpg-item-inspect">
                  <h3>{itemName(bagItem)}</h3>
                  <p>
                    {itemCount(state.player.inventory, bagItem)} carried · stack
                    limit {stackLimitFor(bagItem).toLocaleString()} ·{" "}
                    {ITEMS[bagItem]?.stackable
                      ? "1 slot"
                      : `${itemCount(state.player.inventory, bagItem)} slots`}
                    .{" "}
                    {ITEMS[bagItem]?.skill
                      ? `${skillName(ITEMS[bagItem].skill!)} ${ITEMS[bagItem].level ?? 1} ${ITEMS[bagItem].kind === "food" ? "to make" : "to use"}. `
                      : ""}
                    {ITEMS[bagItem]?.attackLevel
                      ? `Attack ${ITEMS[bagItem].attackLevel} to wield. `
                      : ""}
                    {ITEMS[bagItem]?.rangedLevel
                      ? `Ranged ${ITEMS[bagItem].rangedLevel} to wield. `
                      : ""}
                    {ITEMS[bagItem]?.twoHanded ? "Uses both hands. " : ""}
                    {ITEMS[bagItem]?.heals
                      ? `Restores ${ITEMS[bagItem].heals} health. `
                      : ""}
                    {ITEMS[bagItem]?.weight ?? 0} kg
                  </p>
                  {ITEMS[bagItem]?.slot && <p className="item-comparison">
                    <strong>{ITEMS[bagItem].slot} · {ITEMS[bagItem].twoHanded ? "two hands" : "one slot"}</strong><br />
                    Attack {ITEMS[bagItem].attack ?? ITEMS[bagItem].rangedAttack ?? 0} · Strength {ITEMS[bagItem].strength ?? ITEMS[bagItem].rangedStrength ?? 0} · Defence {ITEMS[bagItem].defence ?? 0}<br />
                    Currently equipped: {state.player.equipment[ITEMS[bagItem].slot!] ? itemName(state.player.equipment[ITEMS[bagItem].slot!]!) : "Empty"}
                  </p>}
                  <button
                    onClick={() => {
                      setPanel(null);
                      setUsingItem(bagItem);
                      setMessage(`Select a place to use ${itemName(bagItem)}.`);
                    }}
                  >
                    Use on a place
                  </button>
                  {(ITEMS[bagItem]?.slot ||
                    (ITEMS[bagItem]?.kind === "supply" &&
                      ITEMS[bagItem]?.ammoTier)) && (
                    <button
                      onClick={() =>
                        command({ type: "equip", itemId: bagItem })
                      }
                    >
                      {ITEMS[bagItem]?.kind === "supply"
                        ? "Equip arrows"
                        : "Equip"}
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
                  (sum, id) =>
                    sum +
                    ((hasBow ? ITEMS[id]?.rangedAttack : ITEMS[id]?.attack) ??
                      0),
                  0,
                )}{" "}
                {hasBow ? "ranged accuracy" : "attack"} ·{" "}
                {Object.values(state.player.equipment).reduce(
                  (sum, id) =>
                    sum +
                    ((hasBow
                      ? ITEMS[id]?.rangedStrength
                      : ITEMS[id]?.strength) ?? 0),
                  hasBow
                    ? (ITEMS[state.player.ammo?.itemId ?? ""]?.rangedStrength ??
                        0)
                    : 0,
                )}{" "}
                {hasBow ? "ranged strength" : "strength"} ·{" "}
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
                      skill: e.target.value as CombatStyle,
                    })
                  }
                >
                  {ITEMS[state.player.equipment.weapon ?? ""]?.weaponType ===
                  "bow" ? (
                    <>
                      <option value="accurate">Accurate · Ranged XP</option>
                      <option value="rapid">Rapid · faster shots</option>
                      <option value="longrange">
                        Longrange · Ranged & Defence XP
                      </option>
                    </>
                  ) : (
                    <>
                      <option value="attack">Attack · accuracy</option>
                      <option value="strength">Strength · damage</option>
                      <option value="defence">Defence · protection</option>
                    </>
                  )}
                </select>
              </label>
              {ITEMS[state.player.equipment.weapon ?? ""]?.weaponType ===
                "bow" && (
                <p>
                  {state.control.style === "rapid" ? "3" : "4"} ticks per shot ·{" "}
                  {state.control.style === "longrange" ? "9" : "7"} tile range ·
                  one arrow per shot. Clear sight required.
                </p>
              )}
              <div className="rpg-bank-row" aria-label="Equipped ammunition">
                <span>
                  Arrows:{" "}
                  {state.player.ammo
                    ? `${itemName(state.player.ammo.itemId)} ×${state.player.ammo.quantity}`
                    : "None equipped"}
                </span>
                {state.player.ammo && (
                  <button onClick={() => command({ type: "unequip-ammo" })}>
                    Remove arrows
                  </button>
                )}
              </div>
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
                const stage = q.stages?.find(
                  (stage) => stage.id === progress?.stageId,
                );
                const missingPrerequisites =
                  q.prerequisites?.filter(
                    (id) => !state.quests[id]?.complete,
                  ) ?? [];
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
                    <p>
                      {progress?.complete
                        ? "Supplies delivered and rewards claimed."
                        : q.description}
                    </p>
                    {progress?.accepted && !progress.complete && stage && (
                      <p className="rpg-current-order">
                        Next: {stage.description}
                        {(stage.kind === "practice" ||
                          stage.kind === "kill") && (
                          <small>
                            {" "}
                            · {progress.counters?.[stage.id] ?? 0}/
                            {stage.quantity ?? 1}
                          </small>
                        )}
                      </p>
                    )}
                    {missingPrerequisites.length > 0 && (
                      <p>
                        First complete:{" "}
                        {missingPrerequisites
                          .map((id) => QUESTS[id]?.name ?? id)
                          .join(", ")}
                      </p>
                    )}
                    {stage?.kind === "craft" &&
                      stage.recipeId &&
                      !progress?.complete && (
                        <p>
                          {itemName(RECIPES[stage.recipeId].output.itemId)} ·{" "}
                          {itemCount(
                            state.player.inventory,
                            RECIPES[stage.recipeId].output.itemId,
                          ) +
                            itemCount(
                              state.bank,
                              RECIPES[stage.recipeId].output.itemId,
                            )}
                          /{stage.quantity ?? 1} packed or banked
                        </p>
                      )}
                    {!progress?.complete &&
                      state.control.goal?.questId === q.id && (
                        <p className="rpg-current-order">
                          Now: {state.player.activity}
                        </p>
                      )}
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
                    {(progress?.complete
                      ? q.items
                      : stage?.kind === "gather" || stage?.kind === "deliver"
                        ? (stage.items ?? [])
                        : !progress?.accepted
                          ? q.items
                          : []
                    ).map((i) => (
                      <p key={i.itemId}>
                        {progress?.complete
                          ? `✓ ${i.quantity} ${itemName(i.itemId)} delivered`
                          : `${itemName(i.itemId)} · ${itemCount(state.player.inventory, i.itemId) + itemCount(state.bank, i.itemId)}/${i.quantity} packed or banked`}
                      </p>
                    ))}
                    {q.kills &&
                      (!stage ||
                        stage.kind === "kill" ||
                        progress?.complete) && (
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
                      {progress?.complete ? "Unlocked" : "Unlock"}:{" "}
                      {q.reward.unlock.replaceAll("-", " ")}
                    </small>
                    {!progress?.complete && (
                      <button
                        className="full"
                        disabled={missingPrerequisites.length > 0}
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
                Left-click or tap to walk, gather or attack. Right-click or hold
                a touch to choose other options. Escape cancels current and queued orders.
                Drag, pinch or use the wheel to explore. WASD moves Alden one tile at a time.
                Direct world orders switch to manual control. Turn Autoplay on
                to let Alden choose adventures again.
              </p>
              <div className="menu-grid">
                <button onClick={() => {
                  const url = new URL(location.href);
                  url.searchParams.set("assetReview", "1");
                  location.assign(url);
                }}>Open art workbench</button>
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
              <h3>Sound</h3>
              <button
                className="full"
                aria-pressed={!audio.settings.muted}
                onClick={() => audio.setMuted(!audio.settings.muted)}
              >
                {audio.settings.muted ? "Enable sound" : "Mute sound"}
              </button>
              <label className="rpg-combat-style">
                Volume
                <input
                  aria-label="Sound volume"
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(audio.settings.volume * 100)}
                  onChange={(e) =>
                    audio.setVolume(Number(e.target.value) / 100)
                  }
                />
              </label>
              <small>
                {!audio.available
                  ? "Audio is unavailable; gameplay continues."
                  : audio.unlocked
                    ? "Original sounds play for actions and gains."
                    : "Audio starts after a tap or key press."}
              </small>
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
        <footer ref={dock} className="intention-dock" data-working={!!work}>
          <button
            className="hero-status"
            aria-label="Inspect Alden"
            onClick={() => {
              setSelection({ kind: "actor", id: 0 });
              setPanel(null);
            }}
          >
            <PixelPortrait />
            <span>
              <strong>
                Alden{" "}
                <em>
                  HP {player.health}/{levelForXp(player.skills.hitpoints)}
                </em>
              </strong>
              <progress className={`hero-health ${player.health <= levelForXp(player.skills.hitpoints) * .3 ? "low" : ""}`} aria-label="Alden health" value={player.health} max={levelForXp(player.skills.hitpoints)} />
              <span className="doing-now">
                {work ? `${work.label} · ${work.detail}` : intention?.title ?? player.activity}
              </span>
              {work && <span className="hud-work" data-testid="hud-work-status">
                <progress aria-label={`${work.label} cycle progress`} value={work.elapsed} max={work.duration} />
                <small>{work.elapsed}/{work.duration} ticks · {Math.ceil((work.duration - work.elapsed) * .6)}s to attempt</small>
              </span>}
              <span
                className={`rpg-xp-inline ${reward.gain ? "gained" : ""}`}
                aria-label="Recent skill experience"
              >
                <span>
                  {skillName(feedbackSkill)}{" "}
                  {levelForXp(player.skills[feedbackSkill])}
                  {reward.gain > 0 && feedbackSkill === reward.skill && <b> +{formatXp(reward.gain)} XP</b>}
                </span>
                <progress
                  aria-label={`${skillName(feedbackSkill)} experience progress`}
                  value={xpProgress(player.skills[feedbackSkill]).current}
                  max={xpProgress(player.skills[feedbackSkill]).span}
                />
                <small>
                  {levelForXp(player.skills[feedbackSkill]) === 99
                    ? "Mastered"
                    : `${formatXp(xpProgress(player.skills[feedbackSkill]).remaining)} XP to next level`}
                </small>
              </span>
            </span>
          </button>
          <button
            className="next-intention"
            aria-label="Inspect current ambition"
            onClick={() => open("thoughts")}
          >
            <small
              aria-label="Command acknowledgement"
              data-pending={commandNotice?.pending ?? false}
              aria-live="polite"
            >
              {commandNotice?.text ?? "AMBITION"}
            </small>
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
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {reward.announcement}
      </div>
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
