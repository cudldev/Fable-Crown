import type { UnitTool } from "./pixel-units";
export function heldToolForActor(actor: { id: number; role: string; equipment?: { weapon?: string } }, pose?: string): UnitTool {
  if (pose) return ({ cut: "axe", mine: "pickaxe", smith: "hammer", cook: "hammer", fish: "rod", melee: "sword", bow: "bow" } as Record<string, UnitTool>)[pose] ?? "none";
  if (actor.id === 0) return actor.equipment?.weapon ? actor.equipment.weapon.includes("bow") ? "bow" : "sword" : "none";
  return ({ woodcutter: "axe", miner: "pickaxe", fisher: "rod", smith: "hammer", builder: "hammer", cook: "hammer" } as Record<string, UnitTool>)[actor.role] ?? "none";
}
export function heldToolForEnemy(id: string): UnitTool { return id === "boar" || id === "rock-mite" ? "none" : id === "ranged-outlaw" ? "bow" : "sword"; }
