import type { PlannerProfile, RpgState } from "./types";

/** Neutral traits keep the authored, quest-led journey. Values are preferences, never XP. */
export const DEFAULT_PLANNER_PROFILE: Readonly<PlannerProfile> = Object.freeze({
  curiosity: 50, craftsmanship: 50, helpfulness: 50, adventurousness: 50, caution: 50,
});

export const PLANNER_TRAITS: ReadonlyArray<{ key: keyof PlannerProfile; label: string; description: string }> = [
  { key: "curiosity", label: "Curiosity", description: "Favour discovering unvisited places." },
  { key: "craftsmanship", label: "Craftsmanship", description: "Favour useful tools, resources and production skills." },
  { key: "helpfulness", label: "Helpfulness", description: "Favour villagers’ unfinished stories and deliveries." },
  { key: "adventurousness", label: "Adventurousness", description: "Favour combat practice when equipment and meals are ready." },
  { key: "caution", label: "Caution", description: "Prefer safer, nearby work and prepare more carefully for combat." },
];

export const PLANNER_PRESETS: ReadonlyArray<{ id: string; name: string; description: string; profile: PlannerProfile }> = [
  { id: "balanced", name: "Balanced", description: "Follow village stories with room for other interests.", profile: { ...DEFAULT_PLANNER_PROFILE } },
  { id: "artisan", name: "Artisan", description: "Invest in tools and a well-stocked workshop.", profile: { curiosity: 25, craftsmanship: 100, helpfulness: 35, adventurousness: 20, caution: 65 } },
  { id: "explorer", name: "Explorer", description: "Seek new landmarks and prepare for field adventures.", profile: { curiosity: 100, craftsmanship: 25, helpfulness: 25, adventurousness: 80, caution: 35 } },
  { id: "guardian", name: "Guardian", description: "Help neighbours and put safety first.", profile: { curiosity: 30, craftsmanship: 45, helpfulness: 100, adventurousness: 35, caution: 90 } },
];

/** Fresh values; reading an older V5 snapshot never mutates or upgrades it. */
export function getPlannerProfile(s: RpgState): PlannerProfile {
  const profile = { ...DEFAULT_PLANNER_PROFILE };
  for (const { key } of PLANNER_TRAITS) {
    const value = s.control.profile?.[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100) profile[key] = value;
  }
  return profile;
}
