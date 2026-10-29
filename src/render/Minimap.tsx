import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { RpgState, TilePosition } from "../rpg/types";
import { TOWNS, worldForState } from "../rpg/world";
import { QUESTS } from "../rpg/content";
import "./minimap.css";

interface Props {
  state: RpgState;
  onDestination: (position: TilePosition) => void;
  previewRoute?: TilePosition[];
}
/** North-up overview. Picking a place only asks the host to preview it. */
export function Minimap({ state, onDestination, previewRoute = [] }: Props) {
  const world = worldForState(state);
  const ground = useRef<HTMLCanvasElement>(null);
  const terrain = useRef<HTMLCanvasElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [cursor, setCursor] = useState<TilePosition | null>(null);
  const viewWidth = expanded ? world.width : Math.min(80, world.width);
  const viewHeight = expanded ? world.height : Math.min(60, world.height);
  const viewX = expanded
    ? 0
    : Math.max(
        0,
        Math.min(
          world.width - viewWidth,
          state.player.position.x - viewWidth / 2,
        ),
      );
  const viewY = expanded
    ? 0
    : Math.max(
        0,
        Math.min(
          world.height - viewHeight,
          state.player.position.y - viewHeight / 2,
        ),
      );
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = world.width;
    canvas.height = world.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const colors = {
      grass: "#9ba878",
      dirt: "#e2c796",
      stone: "#b7b0a1",
      water: "#6c979e",
      sand: "#d7c99b",
    };
    for (let y = 0; y < world.height; y++)
      for (let x = 0; x < world.width; x++) {
        ctx.fillStyle = colors[world.terrain[y * world.width + x]!];
        ctx.fillRect(x, y, 1, 1);
      }
    terrain.current = canvas;
  }, [world]);
  useEffect(() => {
    const canvas = ground.current;
    if (!canvas || !terrain.current) return;
    canvas.width = viewWidth;
    canvas.height = viewHeight;
    canvas
      .getContext("2d")
      ?.drawImage(
        terrain.current,
        viewX,
        viewY,
        viewWidth,
        viewHeight,
        0,
        0,
        viewWidth,
        viewHeight,
      );
  }, [world, viewX, viewY, viewWidth, viewHeight]);
  const select = (x: number, y: number) => {
    const position = {
      worldId: world.id,
      plane: state.player.position.plane,
      x: Math.max(0, Math.min(world.width - 1, Math.round(x))),
      y: Math.max(0, Math.min(world.height - 1, Math.round(y))),
    };
    setCursor(position);
    onDestination(position);
  };
  const keyboard = (event: KeyboardEvent<SVGSVGElement>) => {
    const point = cursor ?? state.player.position;
    const direction: Record<string, [number, number]> = {
      ArrowUp: [0, -4],
      ArrowDown: [0, 4],
      ArrowLeft: [-4, 0],
      ArrowRight: [4, 0],
    };
    if (direction[event.key]) {
      event.preventDefault();
      const [x, y] = direction[event.key]!;
      select(point.x + x, point.y + y);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(point.x, point.y);
    }
  };
  const route = previewRoute.length
    ? [state.player.position, ...previewRoute]
    : [state.player.position, ...state.player.path];
  const objectiveIds = new Set(
    Object.entries(state.quests)
      .filter(([, progress]) => progress.accepted && !progress.complete)
      .map(
        ([id, progress]) =>
          QUESTS[id]?.stages?.find((stage) => stage.id === progress.stageId)
            ?.targetId,
      ),
  );
  return (
    <aside
      className={`rpg-minimap ${expanded ? "expanded" : ""}`}
      aria-label="Frontier minimap"
    >
      <div className="minimap-heading">
        <span>N ↑</span>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "Shrink map" : "Expand map"}
        >
          {expanded ? "− Map" : "+ Map"}
        </button>
      </div>
      <div className="minimap-surface">
        <canvas ref={ground} aria-hidden="true" />
        <svg
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
          preserveAspectRatio="none"
          role="button"
          tabIndex={0}
          aria-label="Preview a map destination. Arrow keys pan preview; Enter selects. No movement order is issued."
          onKeyDown={keyboard}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            select(
              viewX + ((event.clientX - rect.left) / rect.width) * viewWidth,
              viewY + ((event.clientY - rect.top) / rect.height) * viewHeight,
            );
          }}
        >
          <polyline
            points={route.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={previewRoute.length ? "#a6f3f2" : "#fff1b8"}
            strokeWidth="2.5"
            strokeDasharray={previewRoute.length ? "5 3" : undefined}
          />
          {TOWNS.filter((town) => town.position.worldId === world.id).map(
            (town) => (
              <g key={town.id}>
                <rect
                  x={town.position.x - 4}
                  y={town.position.y - 3}
                  width="8"
                  height="6"
                  fill="#f5e1b0"
                  stroke="#493d2b"
                />
                <title>{town.name}</title>
                {expanded && (
                  <text
                    x={town.position.x}
                    y={town.position.y - 8}
                    textAnchor="middle"
                  >
                    {town.name}
                  </text>
                )}
              </g>
            ),
          )}
          {world.objects
            .filter((object) =>
              ["bank", "shop", "furnace", "anvil", "range", "quest"].includes(
                object.kind,
              ),
            )
            .map((object) => (
              <g key={object.id}>
                <circle
                  cx={object.position.x}
                  cy={object.position.y}
                  r={object.kind === "quest" ? 2.8 : 2}
                  fill={
                    object.kind === "quest"
                      ? state.quests[object.questId ?? ""]?.complete
                        ? "#d5d3bb"
                        : "#ffe391"
                      : object.kind === "bank"
                        ? "#f1f1dc"
                        : "#51412f"
                  }
                />
                <title>{object.name}</title>
              </g>
            ))}
          {state.enemies
            .filter((enemy) => enemy.health > 0)
            .map((enemy) => (
              <g key={enemy.id}>
                <path
                  d={`M${enemy.position.x},${enemy.position.y - 3}l3,6h-6z`}
                  fill="#9d3933"
                />
                <title>Danger</title>
              </g>
            ))}
          {world.objects
            .filter(
              (object) =>
                object.kind === "ferry" || objectiveIds.has(object.id),
            )
            .map((object) => (
              <g key={`objective-${object.id}`}>
                <circle
                  cx={object.position.x}
                  cy={object.position.y}
                  r="3.5"
                  fill={object.kind === "ferry" ? "#6bc6d6" : "#f3c666"}
                  stroke="#51412f"
                  strokeWidth=".8"
                />
                <title>
                  {object.kind === "ferry"
                    ? `Ferry: ${object.name}`
                    : `Quest objective: ${object.name}`}
                </title>
              </g>
            ))}
          {cursor && (
            <circle
              cx={cursor.x}
              cy={cursor.y}
              r="5"
              fill="none"
              stroke="#b3ffff"
              strokeWidth="2"
            />
          )}
          <circle
            cx={state.player.position.x}
            cy={state.player.position.y}
            r="4"
            fill="#275b94"
            stroke="#fff2c3"
            strokeWidth="2"
          >
            <title>Alden</title>
          </circle>
        </svg>
      </div>
      {expanded && (
        <p>
          ● Alden · ◆ services · ! quests · ▲ danger
          <br />
          Choose a place to preview its route.
        </p>
      )}
    </aside>
  );
}
