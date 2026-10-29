import { useEffect, useRef, useState } from "react";
import TileScene, {
  type TileCamera,
  type TileSelection,
} from "../render/TileScene";
import { WORLD, TOWNS, objectById } from "./world";
import { SKILLS, type RpgState, type RpgCommand, type RpgOrder } from "./types";
import { levelForXp, skillName, XP_THRESHOLDS } from "./skills";
import "./rpg.css";
const base = import.meta.env.BASE_URL;
const itemName = (id: string) =>
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
    [quantity, setQuantity] = useState(10);
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
  const selectedObject =
    selection?.kind === "object" ? objectById(selection.id) : undefined;
  const person =
    selection?.kind === "actor" && state
      ? [state.player, ...state.npcs].find((p) => p.id === selection.id)
      : undefined;
  const player = state?.player;
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
              position: { ...selectedObject.position },
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
              ? `Harvest ${selectedObject.resourceId} with the right tool and skill level.`
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
                {WORLD.objects
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
              </div>
            </>
          )}
          {panel === "thoughts" && (
            <>
              <span className="eyebrow">ALDEN’S INTENTIONS</span>
              <h2>{state.control.goal?.title ?? "The road ahead"}</h2>
              <p>{state.control.reason}</p>
              {state.control.steps.length > 0 && (
                <ol>
                  {state.control.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
              {state.control.thought?.choices.map((choice) => (
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
              ))}
              <small>
                Alden handles the steps. Leave him to his plan, or choose a
                different ambition.
              </small>
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
                    next = XP_THRESHOLDS[Math.min(98, level)]!;
                  return (
                    <button
                      key={skill}
                      onClick={() => {
                        command({
                          type: "goal",
                          goal: {
                            id: `train-${skill}`,
                            kind: "skill",
                            title: `Train ${skillName(skill)} to ${Math.min(99, level + 1)}`,
                            skill,
                            level: Math.min(99, level + 1),
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
              <div className="rpg-item-list">
                {state.player.inventory.map((item) => (
                  <div key={item.itemId}>
                    <span>
                      {itemName(item.itemId)} <b>×{item.quantity}</b>
                    </span>
                    <button
                      onClick={() =>
                        command({ type: "equip", itemId: item.itemId })
                      }
                    >
                      Use / equip
                    </button>
                  </div>
                ))}
              </div>
              <h3>Equipped</h3>
              {Object.entries(state.player.equipment).map(([slot, item]) => (
                <p key={slot}>
                  {slot}: {itemName(item)}
                </p>
              ))}
              <button className="full" onClick={() => order({ type: "bank" })}>
                Bank carried items
              </button>
              <h3>Personal bank</h3>
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
                          quantity: Math.min(10, item.quantity),
                        })
                      }
                    >
                      Take 10
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
          {(panel.startsWith("shop:") || panel.startsWith("craft:")) && (
            <>
              <h2>{panel.startsWith("shop:") ? "Supplies" : "Crafting"}</h2>
              <p>
                Activity definitions are being connected to the new chapter.
              </p>
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
