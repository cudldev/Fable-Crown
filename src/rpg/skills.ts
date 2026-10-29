import { SKILLS, type SkillId } from "./types";
export const XP_THRESHOLDS: number[] = [0];
let total = 0;
for (let level = 1; level < 99; level++) {
  total += Math.floor(level + 300 * 2 ** (level / 7));
  XP_THRESHOLDS.push(Math.floor(total / 4) * 10);
}
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < 99 && xp >= XP_THRESHOLDS[level]!) level++;
  return level;
}
export function startingSkills(): Record<SkillId, number> {
  return Object.fromEntries(
    SKILLS.map((s) => [s, s === "hitpoints" ? 11540 : 0]),
  ) as Record<SkillId, number>;
}
export const skillName = (s: SkillId) => s[0]!.toUpperCase() + s.slice(1);
