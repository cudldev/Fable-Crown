import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  BILL,
  TICK_MS,
  type GameState,
  type IntentDraft,
  type PlayerCommand,
  type Resource,
  type Strategy,
} from "./types";
import {
  nearestSettlement,
  REGIONS,
  SETTLEMENTS,
  TARGETS,
  targetById,
  WORLD,
} from "./world";
import type { CameraState, WorldSelection } from "./view-types";
import { suggestIntentions } from './planner';
const Scene = lazy(() => import("./Scene"));
const base = import.meta.env.BASE_URL;
const strategies: Record<Strategy, string> = {
  local: "Gather locally",
  trade: "Trade for supplies · 24 coins",
  careful: "Take a gentler pace",
};
const resources: Resource[] = ["timber", "stone", "iron"];
function cameraInitial(): CameraState {
  try {
    const c = JSON.parse(localStorage.getItem("fable-camera-v2") || "null");
    if (
      c &&
      Number.isFinite(c.x) &&
      Number.isFinite(c.y) &&
      Number.isFinite(c.zoom) &&
      c.zoom > 0
    )
      return {
        ...c,
        x: Math.max(0, Math.min(WORLD.width, c.x)),
        y: Math.max(0, Math.min(WORLD.height, c.y)),
      };
  } catch {}
  return { x: 1360, y: 2210, zoom: 0.8, followId: 0, overview: false };
}
export default function App() {
  const [state, setState] = useState<GameState | null>(null),
    [camera, setCamera] = useState<CameraState>(cameraInitial),
    [selection, setSelection] = useState<WorldSelection | null>(null),
    [panel, setPanel] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [storageOkay, setStorageOkay] = useState(true),
    [thought, setThought] = useState(false),
    [quantity, setQuantity] = useState(10),
    [resource, setResource] = useState<Resource>("timber"),
    [repeat, setRepeat] = useState(false),
    [download, setDownload] = useState(""),
    [confirmReset, setConfirmReset] = useState(false),
    [worldSize, setWorldSize] = useState("");
  const worker = useRef<Worker | null>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const w = new Worker(new URL("./game.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e) => {
      setState(e.data.state);
      setStorageOkay(e.data.storageOkay);
      if (e.data.message) setMessage(e.data.message);
    };
    w.onerror = () =>
      setMessage("The village could not start. Reload to try again.");
    const visibility = () =>
      w.postMessage({ type: document.hidden ? "pause" : "resume" });
    document.addEventListener("visibilitychange", visibility);
    const pagehide = () => w.postMessage({ type: "pause" });
    window.addEventListener("pagehide", pagehide);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      w.terminate();
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("fable-camera-v2", JSON.stringify(camera));
    } catch {
      /* Camera persistence is optional. */
    }
  }, [camera]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanel(null);
        setSelection(null);
        setThought(false);
        setConfirmReset(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const send = (type: string, extra = {}) =>
    worker.current?.postMessage({ type, ...extra });
  const command = (command: PlayerCommand) => send("player", { command });
  const hero = state?.people[0];
  const home = hero ? nearestSettlement(hero) : SETTLEMENTS[0];
  const selectedTarget =
    selection?.kind === "target" ? targetById(selection.id) : undefined;
  const selectedPerson =
    selection?.kind === "person"
      ? state?.people.find((p) => p.id === selection.id)
      : undefined;
  const targetStore = selectedTarget?.settlementId || home.id;
  const active = state?.control.active;
  const ideas=state?suggestIntentions(state):[];
  const thinking=state&&!active&&!state.control.waiting&&state.control.thinkingUntil>state.tick;
  const thinkingSeconds=state?Math.max(0,Math.ceil((state.control.thinkingUntil-state.tick)*TICK_MS/1000)):0;
  function showIdeas(){setThought(!thought);setPanel(null);setSelection(null);}
  const order = (draft: IntentDraft, mode: "now" | "next") => {
    command({ type: "order", intent: draft, mode });
    setSelection(null);
  };
  function select(s: WorldSelection) {
    setPanel(null);
    setThought(false);
    setRepeat(false);
    if (s.kind === "ground") {
      order({ kind: "move", point: s.point }, "now");
      return;
    }
    setSelection(s);
    if (s.kind === "target")
      setResource(targetById(s.id)?.resources?.[0] || "timber");
  }
  function open(p: string) {
    setPanel(panel === p ? null : p);
    setSelection(null);
    setThought(false);
  }
  function draft(): IntentDraft {
    const t = selectedTarget!;
    if (t.kind === "forest" || t.kind === "mine")
      return { kind: "gather", targetId: t.id, resource, quantity, repeat };
    if (t.kind === "store")
      return {
        kind: "deposit",
        targetId: t.id,
        resource: hero?.carry?.resource || resource,
        quantity: hero?.carry?.amount || 10,
      };
    if (t.kind === "workshop")
      return {
        kind: state?.workshop.complete ? "forge" : "build",
        targetId: t.id,
        quantity: state?.workshop.complete ? quantity : 1,
        repeat,
      };
    return { kind: "move", targetId: t.id };
  }
  function exportSave() {
    if (!state) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ ...state, savedAt: Date.now() }, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "fable-crown-chronicle.json";
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Chronicle exported.");
  }
  async function downloadWorld() {
    if (!("caches" in window)) {
      setMessage("Offline storage is unavailable in this browser.");
      return;
    }
    setDownload("Preparing…");
    try {
      const response = await fetch(`${base}art/manifest.json`);
      if (!response.ok) throw Error();
      const manifest = (await response.json()) as {
        files: string[];
        bytes: number;
        version: string;
      };
      const cache = await caches.open("fable-art-" + manifest.version);
      for (let i = 0; i < manifest.files.length; i++) {
        const url = base + manifest.files[i];
        if (!(await cache.match(url, { ignoreVary: true })))
          await cache.add(url);
        setDownload(`${Math.round(((i + 1) / manifest.files.length) * 100)}%`);
      }
      setDownload("World saved offline");
    } catch {
      setDownload("Download paused · retry");
    }
  }
  useEffect(() => {
    if (panel === "menu" && !worldSize)
      fetch(`${base}art/manifest.json`)
        .then((r) => r.json())
        .then((m: { bytes: number }) =>
          setWorldSize(`${(m.bytes / 1048576).toFixed(1)} MB`),
        )
        .catch(() => {});
  }, [panel, worldSize]);
  const choices = selectedTarget ? draft() : null;
  const actionName =
    selectedTarget?.kind === "forest" || selectedTarget?.kind === "mine"
      ? `Gather ${repeat ? "continuously" : quantity} ${resource}`
      : selectedTarget?.kind === "store"
        ? "Deposit carried supplies"
        : selectedTarget?.kind === "workshop"
          ? state?.workshop.complete
            ? `Forge ${quantity} tools`
            : "Help build the workshop"
          : `Travel to ${selectedTarget?.name || "destination"}`;
  return (
    <main className="game-shell" aria-label="Fable Crown game">
      {state ? (
        <Suspense
          fallback={<div className="loading-screen">Unfolding the world…</div>}
        >
          <Scene
            state={state}
            camera={camera}
            onCameraChange={setCamera}
            selection={selection}
            onSelect={select}
          />
        </Suspense>
      ) : (
        <div className="loading-screen">
          <img src={`${base}crown.svg`} alt="" />
          <h1>Fable Crown</h1>
          <p>Waking the frontier…</p>
        </div>
      )}
      <header className="world-header">
        <button
          className="realm-plaque"
          onClick={() => open("world")}
          aria-label="Open world destinations"
        >
          <img src={`${base}crown.svg`} alt="" />
          <span>
            <small>FABLE CROWN</small>
            <strong>{home.name}</strong>
          </span>
          <span className="realm-arrow">⌄</span>
        </button>
        <div className="header-actions">
          <span className="calendar">{state?.calendar}</span>
          <button
            aria-label="World overview"
            onClick={() => {
              setCamera((c) => ({
                ...c,
                overview: !c.overview,
                followId: null,
              }));
              setSelection(null);
            }}
          >
            <span>⌖</span> World
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
              overview: false,
              zoom: Math.min(1.6, c.zoom * 1.25),
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
              overview: false,
              zoom: Math.max(0.18, c.zoom / 1.25),
            }))
          }
        >
          −
        </button>
        <button
          className={camera.followId === 0 ? "is-active" : ""}
          onClick={() =>
            setCamera((c) => ({
              ...c,
              followId: 0,
              overview: false,
              zoom: Math.max(0.65, c.zoom),
            }))
          }
          aria-label="Follow Alden"
        >
          Follow Alden
        </button>
      </div>
      {state && (
        <button
          className="thought-peek"
          aria-label={state.strategy?"Open Alden's ideas":undefined}
          aria-expanded={thought}
          onClick={showIdeas}
        >
          {state.strategy?'✧ Alden’s ideas':'✧ Alden has a thought'}{" "}
          <span>
            {!state.strategy
              ? `${Math.max(
                  0,
                  Math.ceil(((state.decisionAt - state.tick) * TICK_MS) / 1000),
                )}s`
              :state.control.waiting?'waiting':thinking?`choosing in ${thinkingSeconds}s`:active?.source==='player'?'following your lead':'thinking ahead'}
          </span>
        </button>
      )}
      {thought&&state&&state.strategy&&<section className="parchment thought-panel ideas-panel" aria-label="Alden's ideas">
        <button className="close" aria-label="Close thought" onClick={()=>setThought(false)}>×</button>
        <span className="eyebrow">ALDEN IS THINKING AHEAD</span>
        <h2>{state.control.waiting?'Ready when you are':'What shall I do next?'}</h2>
        <p className="plan-reason" aria-label="Current reasoning">{state.control.reason}</p>
        <div className="idea-list">{ideas.map((idea,n)=><button className={`choice plan-choice ${n===0?'recommended':''}`} key={idea.id} aria-label={`Choose idea: ${idea.title}`} onClick={()=>{order(idea.intent,'now');setThought(false);}}>
          <strong>{idea.title}</strong><span>{idea.thought}</span>
        </button>)}</div>
        <small>{state.control.waiting?'Alden will wait until you choose an idea or resume his intentions.':active?.source==='player'||state.control.queue.length?'He’ll finish your orders before choosing for himself. Pick an idea to change his current intention.':thinking?`He’ll choose his next action in ${thinkingSeconds}s if you leave it to him.`:'He keeps acting on his own. Pick an idea to guide him, or leave him to his plan.'}</small>
      </section>}
      {thought && state && !state.strategy && (
        <section
          className="parchment thought-panel"
          aria-label="Thought and intention"
        >
          <button
            className="close"
            aria-label="Close thought"
            onClick={() => setThought(false)}
          >
            ×
          </button>
          <span className="eyebrow">ALDEN’S THOUGHT</span>
          <h2>A forge for Oakrest</h2>
          <p>
            “Our people have willing hands. How shall we give them better
            tools?”
          </p>
          {(Object.keys(strategies) as Strategy[]).map((s) => (
            <button
              className="choice"
              key={s}
              onClick={() => {
                send("choose", { strategy: s });
                setThought(false);
              }}
            >
              {strategies[s]}
            </button>
          ))}
          <small>
            He’ll choose local gathering if you leave it to him. Your orders
            always take priority.
          </small>
        </section>
      )}
      {selectedTarget && state && (
        <section className="parchment context-panel" aria-label="Place actions">
          <button
            className="close"
            aria-label="Close place actions"
            onClick={() => setSelection(null)}
          >
            ×
          </button>
          <span className="eyebrow">
            {selectedTarget.kind} ·{" "}
            {SETTLEMENTS.find((s) => s.id === targetStore)?.name}
          </span>
          <h2>{selectedTarget.name}</h2>
          <p>{selectedTarget.description}</p>
          {(selectedTarget.kind === "forest" ||
            selectedTarget.kind === "mine" ||
            (selectedTarget.kind === "workshop" &&
              state.workshop.complete)) && (
            <div className="action-options">
              {selectedTarget.resources &&
                selectedTarget.resources.length > 1 && (
                  <label>
                    Resource
                    <select
                      aria-label="Resource"
                      value={resource}
                      onChange={(e) => setResource(e.target.value as Resource)}
                    >
                      {selectedTarget.resources.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                )}
              <label>
                Quantity
                <select
                  aria-label="Quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                >
                  {[2, 10, 20].map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                />{" "}
                Repeat until cancelled
              </label>
            </div>
          )}
          {selectedTarget.kind === "store" && (
            <>
              <div className="store-ledger">
                {resources.map((r) => (
                  <span key={r}>
                    {r}
                    <b>{state.stores[targetStore][r]}</b>
                  </span>
                ))}
              </div>
              <div className="withdraw">
                <label>
                  Withdraw
                  <select
                    aria-label="Withdraw resource"
                    value={resource}
                    onChange={(e) => setResource(e.target.value as Resource)}
                  >
                    {resources.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() =>
                    order(
                      {
                        kind: "withdraw",
                        targetId: selectedTarget.id,
                        resource,
                        quantity: 10,
                      },
                      "now",
                    )
                  }
                >
                  Take up to 10
                </button>
              </div>
            </>
          )}
          {selectedTarget.kind === "workshop" && !state.workshop.complete && (
            <div className="bill">
              {(["timber", "stone", "labor"] as const).map((r) => (
                <label key={r}>
                  {r}
                  <span>
                    {state.workshop[r]} / {BILL[r]}
                  </span>
                  <progress value={state.workshop[r]} max={BILL[r]} />
                </label>
              ))}
            </div>
          )}
          <div className="order-label">{actionName}</div>
          <div className="order-actions">
            <button className="primary" onClick={() => order(choices!, "now")}>
              Do now
            </button>
            <button
              onClick={() => order(choices!, "next")}
              disabled={state.control.queue.length >= 8}
            >
              Add next
            </button>
          </div>
          <small>
            Travel and prerequisites are included. Supplies are carried between
            places.
          </small>
        </section>
      )}
      {selectedPerson && (
        <section
          className="parchment context-panel"
          aria-label="Character details"
        >
          <button
            className="close"
            aria-label="Close character details"
            onClick={() => setSelection(null)}
          >
            ×
          </button>
          <span className="eyebrow">
            {selectedPerson.role} · {selectedPerson.homeId}
          </span>
          <h2>{selectedPerson.name}</h2>
          <p>{selectedPerson.personality}</p>
          <div className="activity-box">
            <b>{selectedPerson.action}</b>
            <span>{selectedPerson.remaining} ticks until next step</span>
          </div>
          <dl>
            <div>
              <dt>Experience</dt>
              <dd>
                {selectedPerson.xp} XP · level{" "}
                {1 + Math.floor(selectedPerson.xp / 100)}
              </dd>
            </div>
            <div>
              <dt>Carrying</dt>
              <dd>
                {selectedPerson.carry
                  ? `${selectedPerson.carry.amount} ${selectedPerson.carry.resource}`
                  : "Empty hands"}
              </dd>
            </div>
            <div>
              <dt>Tasks completed</dt>
              <dd>{selectedPerson.completed}</dd>
            </div>
          </dl>
          <button
            className="primary full"
            onClick={() => {
              setCamera((c) => ({
                ...c,
                overview: false,
                followId: selectedPerson.id,
                zoom: Math.max(0.65, c.zoom),
              }));
              setSelection(null);
            }}
          >
            Follow {selectedPerson.name}
          </button>
        </section>
      )}
      {panel && state && (
        <section
          className={`parchment drawer ${panel === "world" ? "wide-drawer" : ""}`}
          aria-label={`${panel} panel`}
        >
          <button
            className="close"
            aria-label="Close panel"
            onClick={() => setPanel(null)}
          >
            ×
          </button>
          {panel === "queue" && (
            <>
              <span className="eyebrow">YOUR GUIDANCE</span>
              <h2>Intentions</h2>
              <p>{state.control.reason}</p>
              <div className="queue-list">
                {active && (
                  <div className="queue-item active">
                    <span className="queue-number">Now</span>
                    <span>
                      <b>{active.label}</b>
                      <small>
                        {active.remaining} remaining · {active.source}
                      </small>
                    </span>
                    <button
                      aria-label="Cancel current intention"
                      onClick={() => command({ type: "cancel", id: active.id })}
                    >
                      ×
                    </button>
                  </div>
                )}
                {state.control.queue.map((i, n) => (
                  <div className="queue-item" key={i.id}>
                    <span className="queue-number">{n + 1}</span>
                    <span>
                      <b>{i.label}</b>
                      <small>
                        {i.remaining} remaining{i.repeat ? " · repeat" : ""}
                      </small>
                    </span>
                    <div className="queue-buttons">
                      <button
                        aria-label={`Move ${i.label} up`}
                        disabled={n === 0}
                        onClick={() =>
                          command({ type: "reorder", id: i.id, direction: -1 })
                        }
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${i.label} down`}
                        disabled={n === state.control.queue.length - 1}
                        onClick={() =>
                          command({ type: "reorder", id: i.id, direction: 1 })
                        }
                      >
                        ↓
                      </button>
                      <button
                        aria-label={`Cancel ${i.label}`}
                        onClick={() => command({ type: "cancel", id: i.id })}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!active && !state.control.queue.length && (
                <p>
                  No player orders. Tap a place in the world to give Alden an
                  intention.
                </p>
              )}
              <div className="order-actions">
                <button onClick={() => command({ type: "wait" })}>
                  Wait here
                </button>
                <button
                  className="primary"
                  onClick={() => command({ type: "autonomy" })}
                >
                  Let Alden decide
                </button>
              </div>
            </>
          )}
          {panel === "world" && (
            <>
              <span className="eyebrow">THE FRONTIER</span>
              <h2>A wider world</h2>
              <p>
                Three settlements · nine regions · 36× the original area.
                Journeys happen on foot.
              </p>
              <div className="destination-list">
                {TARGETS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelection({ kind: "target", id: t.id });
                      setPanel(null);
                      setCamera((c) => ({
                        ...c,
                        overview: false,
                        followId: null,
                        x: t.x,
                        y: t.y,
                        zoom: 0.65,
                      }));
                    }}
                  >
                    <span>
                      {t.name}
                      <small>
                        {t.kind} · {t.settlementId}
                      </small>
                    </span>
                    <span>›</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "bag" && (
            <>
              <span className="eyebrow">ALDEN’S SATCHEL</span>
              <h2>Supplies & experience</h2>
              <div className="activity-box">
                <b>
                  {hero?.carry
                    ? `${hero.carry.amount} / 10 ${hero.carry.resource}`
                    : "0 / 10 · empty hands"}
                </b>
                <span>
                  {hero?.xp} XP · level {1 + Math.floor((hero?.xp || 0) / 100)}{" "}
                  · {state.coins} village coins
                </span>
              </div>
              <p>
                Gathering, hauling, building and forging grant experience. Local
                stores keep their own supplies.
              </p>
              {SETTLEMENTS.map((s) => (
                <div className="store-summary" key={s.id}>
                  <b>{s.name}</b>
                  <span>
                    {resources
                      .map((r) => `${state.stores[s.id][r]} ${r}`)
                      .join(" · ")}
                  </span>
                  <button
                    onClick={() => {
                      setPanel(null);
                      setSelection({ kind: "target", id: `${s.id}-store` });
                    }}
                  >
                    Open store actions
                  </button>
                </div>
              ))}
            </>
          )}
          {panel === "journal" && (
            <>
              <span className="eyebrow">THE STORY SO FAR</span>
              <h2>Chronicle</h2>
              <div className="journal-list">
                {state.journal.map((j, i) => (
                  <p key={i}>✧ {j}</p>
                ))}
              </div>
              <small>
                Away progress runs at 25% speed, counting up to 24 hours per
                absence.
              </small>
            </>
          )}
          {panel === "people" && (
            <>
              <span className="eyebrow">PEOPLE OF THE FRONTIER</span>
              <h2>24 lives in motion</h2>
              <div className="destination-list">
                {state.people.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPanel(null);
                      setSelection({ kind: "person", id: p.id });
                    }}
                  >
                    <span>
                      {p.name}
                      <small>
                        {p.role} · {p.homeId}
                      </small>
                    </span>
                    <span>›</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "menu" && (
            <>
              <span className="eyebrow">FABLE CROWN</span>
              <h2>Your chronicle</h2>
              <p>
                Tap ground to travel. Tap people and places to inspect or act.
                Drag to explore, pinch or use +/− to zoom.
              </p>
              <p>
                “Do now” interrupts safely. “Add next” queues an intention.
                Alden thinks briefly after your queue ends, then acts on his
                own.
              </p>
              <div className="menu-grid">
                <button onClick={() => send("save")}>Save on device</button>
                <button onClick={exportSave}>Export chronicle</button>
                <button onClick={() => input.current?.click()}>
                  Import chronicle
                </button>
                <button onClick={() => open("people")}>
                  Inspect villagers
                </button>
                <button onClick={() => setConfirmReset(true)}>
                  New chapter
                </button>
              </div>
              <hr />
              <button
                className="primary full"
                onClick={downloadWorld}
                disabled={download.endsWith("%") || download === "Preparing…"}
              >
                {download ||
                  `Download world for offline play${worldSize ? " · " + worldSize : ""}`}
              </button>
              <small>
                Downloads the generated artwork from this site. Visited regions
                are cached automatically.{" "}
                {storageOkay
                  ? "Progress saves on this device."
                  : "Browser storage unavailable; export your chronicle."}
              </small>
              <p className="credits">
                Original generated watercolor/ink art · local deterministic
                simulation · no runtime AI or API key.
              </p>
            </>
          )}
        </section>
      )}
      {state && hero && (
        <footer className="intention-dock">
          <button
            className="hero-status"
            onClick={() => {
              setSelection({ kind: "person", id: 0 });
              setPanel(null);
            }}
          >
            <img src={`${base}art/prince.webp`} alt="" />
            <span>
              <strong>
                Alden <em>Lv. {1 + Math.floor(hero.xp / 100)}</em>
              </strong>
              <span className="doing-now">
                {state.control.waiting
                  ? "Waiting for your guidance"
                  : thinking
                    ? `Next: ${ideas[0]?.title||'Considering a useful task'}`
                    : hero.action==='Traveling'&&active?active.label:hero.action}
              </span>
            </span>
          </button>
          <button className="next-intention" aria-label="Inspect Alden's plan" onClick={showIdeas}>
            <small>{active ? active.source==='autonomous'?'ALDEN CHOSE':'YOUR INTENTION' : "NEXT IDEA"}</small>
            <span>
              {active?.label ||
                state.control.queue[0]?.label ||
                (state.control.waiting
                  ? "Choose an activity"
                  : ideas[0]?.title||"Considering a useful task")}
            </span>
          </button>
          <div className="dock-buttons">
            <button aria-label="Open intentions" onClick={() => open("queue")}>
              Intentions <b>{state.control.queue.length || ""}</b>
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
        <div className="toast" role="status">
          {message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}
      {confirmReset && (
        <div className="dialog-shade">
          <section
            className="parchment confirmation"
            role="dialog"
            aria-modal="true"
            aria-label="Begin a new chapter"
          >
            <h2>Begin again?</h2>
            <p>
              Export your chronicle first to keep this village. Starting again
              replaces this device’s save.
            </p>
            <div className="order-actions">
              <button onClick={() => setConfirmReset(false)}>
                Keep my village
              </button>
              <button
                className="primary"
                onClick={() => {
                  send("reset");
                  setConfirmReset(false);
                  setPanel(null);
                  setCamera({
                    x: 1360,
                    y: 2210,
                    zoom: 0.8,
                    overview: false,
                    followId: 0,
                  });
                }}
              >
                Begin again
              </button>
            </div>
          </section>
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
            if (f.size > 500000) throw Error();
            send("import", { value: JSON.parse(await f.text()) });
          } catch {
            setMessage(
              "That chronicle could not be read. Your village is safe.",
            );
          }
          e.target.value = "";
        }}
      />
    </main>
  );
}
