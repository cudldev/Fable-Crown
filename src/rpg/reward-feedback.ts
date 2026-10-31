import { ITEMS } from "./content";
import { levelForXp, skillName, XP_THRESHOLDS } from "./skills";
import type { RpgState, SkillId } from "./types";
import type { FeedbackFloater } from "../render/feedback";

export function xpProgress(xp: number) {
  const level = levelForXp(xp);
  const floor = XP_THRESHOLDS[level - 1]!;
  const ceiling = XP_THRESHOLDS[Math.min(98, level)]!;
  const span = Math.max(1, ceiling - floor);
  return {
    level,
    current: level === 99 ? span : xp - floor,
    span,
    remaining: Math.max(0, ceiling - xp),
  };
}
export const formatXp = (tenths: number) =>
  (tenths / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

/** Only committed rewards animate. Inventory moves/trades never invent gains. */
export function rewardFeedback(
  previous: RpgState,
  next: RpgState,
  now: number,
) {
  const known = new Set(previous.rewards?.map((r) => r.id));
  const events = (next.rewards ?? []).filter((r) => !known.has(r.id));
  const floaters: FeedbackFloater[] = [];
  const gains: Partial<Record<SkillId, number>> = {};
  for (const event of events) {
    if (event.items.length)
      floaters.push({
        id: `${event.id}-items`,
        text: event.items
          .map((i) => `+${i.quantity} ${ITEMS[i.itemId]?.name ?? i.itemId}`)
          .join(" · "),
        tone: "item",
        position: { ...next.player.position },
        startedAt: now,
      });
    for (const [skill, xp] of Object.entries(event.xp) as [SkillId, number][]) {
      gains[skill] = (gains[skill] ?? 0) + xp;
    }
  }
  for (const [skill, gain] of Object.entries(gains) as [SkillId, number][]) {
    const raised =
      levelForXp(next.player.skills[skill]) >
      levelForXp(previous.player.skills[skill]);
    floaters.push({
      id: `xp-${next.tick}-${skill}`,
      text: `+${formatXp(gain)} ${skillName(skill)} XP`,
      tone: "xp",
      position: { ...next.player.position },
      startedAt: now,
    });
    if (raised)
      floaters.push({
        id: `level-${next.tick}-${skill}`,
        text: `${skillName(skill)} level ${levelForXp(next.player.skills[skill])}!`,
        tone: "level",
        position: { ...next.player.position },
        startedAt: now,
      });
  }
  // Damage follows committed hits, never a guessed animation or a health snapshot.
  for (const effect of next.effects) {
    if (effect.id <= previous.effectSequence || effect.kind !== "hit" || !effect.targetPosition) continue;
    const damage = effect.amount ?? 0;
    floaters.push({
      id: `hit-${effect.id}`,
      text: damage > 0 ? `−${damage}` : "Miss",
      tone: damage > 0 ? effect.targetId === "player" ? "player-damage" : "damage" : "miss",
      position: { ...effect.targetPosition },
      targetId: effect.targetId,
      startedAt: now,
    });
  }
  if (next.player.health > previous.player.health && next.player.position.worldId === previous.player.position.worldId) {
    floaters.push({ id: `heal-${next.tick}-${next.player.health}`, text: `+${next.player.health - previous.player.health} HP`,
      tone: "heal", position: { ...next.player.position }, startedAt: now });
  }
  return {
    floaters: floaters.slice(-8),
    gains,
    announcement: floaters.map((f) => f.text).join(". "),
  };
}
