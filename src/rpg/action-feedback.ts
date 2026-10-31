import { ENEMIES, RECIPES, RESOURCES } from "./content";
import { objectById } from "./world";
import type { RpgState } from "./types";

/** Read-only presentation of the actual tick action, not the planner's ambition. */
export function actionFeedback(state: RpgState) {
  const { player } = state;
  const action = player.action;
  if (!action || player.path.length || state.control.waiting) return null;
  const target = objectById(action.targetId ?? "");
  const resource = target?.resourceId ? RESOURCES[target.resourceId] : undefined;
  const label = action.kind === "gather"
    ? resource?.skill === "woodcutting" ? "Chopping" : resource?.skill === "mining" ? "Mining" : "Fishing"
    : action.kind === "craft" ? "Crafting" : action.kind === "fight" ? "Attacking"
      : action.kind === "rest" ? "Resting" : action.kind === "practice" ? "Practising" : action.kind;
  const enemy = state.enemies.find(value => value.id === action.targetId);
  const detail = action.kind === "craft" ? RECIPES[action.recipeId ?? ""]?.name
    : enemy ? ENEMIES[enemy.definitionId].name : target?.name;
  return { label, detail: detail ?? player.activity, skill: resource?.skill,
    duration: Math.max(1, action.duration), elapsed: Math.max(0, action.duration - action.remaining) };
}
