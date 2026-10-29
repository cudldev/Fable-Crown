import type { Ambition, RpgState, Thought } from './types';
import { ITEMS } from './content';
import { levelForXp } from './skills';
import { itemCount } from './inventory';
export function ownsItem(s: RpgState, id: string) { return itemCount(s.player.inventory, id) + itemCount(s.bank, id) + Object.values(s.player.equipment).filter(i => i === id).length > 0; }
export function goalMet(s: RpgState, goal: Ambition) {
  if (goal.kind === 'equipment') return !!goal.itemId && ownsItem(s, goal.itemId);
  if (goal.kind === 'skill') return !!goal.skill && !!goal.level && levelForXp(s.player.skills[goal.skill]) >= goal.level;
  if (goal.kind === 'explore') return !!goal.targetId && s.control.visited.includes(goal.targetId);
  return false;
}
export function suggestGoals(s: RpgState): Thought['choices'] {
  const choices: Thought['choices'] = [];
  const tool = !ownsItem(s, 'iron-pickaxe') && !ownsItem(s, 'steel-pickaxe') ? 'iron-pickaxe' : !ownsItem(s, 'steel-pickaxe') ? 'steel-pickaxe' : !ownsItem(s, 'steel-axe') ? 'steel-axe' : null;
  if (tool) choices.push({ id: `obtain-${tool}`, label: `Earn a ${ITEMS[tool].name}`, description: 'Gather and sell supplies, then visit a shop for a lasting tool upgrade.', goal: { id: `obtain-${tool}`, kind: 'equipment', title: `Obtain a ${ITEMS[tool].name}`, itemId: tool } });
  for (const skill of ['mining', 'woodcutting', 'fishing'] as const) {
    if (choices.length === 3) break;
    const level = levelForXp(s.player.skills[skill]);
    if (level === 99) continue;
    const next = skill === 'mining' && level < 6 ? 6 : Math.min(99, level < 5 ? 5 : Math.ceil((level + 1) / 5) * 5);
    choices.push({ id: `train-${skill}-${next}`, label: `Train ${skill} to ${next}`, description: `Work with local resources, bank full bags, and build ${skill} experience.`, goal: { id: `train-${skill}-${next}`, kind: 'skill', title: `${skill} level ${next}`, skill, level: next } });
  }
  if (choices.length < 3) choices.push({ id: 'explore-shrine', label: 'Visit the hill shrine', description: 'Follow a legal tile route to a new landmark.', goal: { id: 'explore-shrine', kind: 'explore', title: 'Visit the hill shrine', targetId: 'hill-shrine' } });
  return choices;
}
export function goalSteps(s: RpgState, goal: Ambition): string[] {
  if (goalMet(s, goal)) return ['Ambition achieved'];
  if (goal.kind === 'equipment' && goal.itemId && ITEMS[goal.itemId]) {
    const item = ITEMS[goal.itemId];
    return [...(item.skill && levelForXp(s.player.skills[item.skill]) < (item.level ?? 1) ? [`Train ${item.skill} to ${item.level}`] : []), `Earn ${item.value} coins by gathering and selling surplus`, `Visit a supplies shop and buy ${item.name}`, 'Use the improved tool'];
  }
  if (goal.kind === 'skill') return [`Gather legal ${goal.skill} resources`, 'Bank full backpacks and resume training', `Reach level ${goal.level}`];
  return [`Travel to ${goal.title}`];
}
