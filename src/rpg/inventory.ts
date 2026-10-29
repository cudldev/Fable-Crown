import type { ItemStack } from './types';
import { ITEMS } from './content';
export const BAG_SLOTS = 28;
export const itemCount = (items: ItemStack[], id: string) => items.find(i => i.itemId === id)?.quantity ?? 0;
export const inventorySlots = (items: ItemStack[]) => items.reduce((n, i) => n + (ITEMS[i.itemId]?.stackable ? 1 : i.quantity), 0);
export function addItems(items: ItemStack[], id: string, quantity: number, capacity = BAG_SLOTS): boolean {
  if (!Object.hasOwn(ITEMS, id) || !Number.isSafeInteger(quantity) || quantity <= 0) return false;
  const prior = items.find(i => i.itemId === id);
  if ((prior?.quantity ?? 0) + quantity > 2_000_000_000) return false;
  const extra = ITEMS[id].stackable ? (prior ? 0 : 1) : quantity;
  if (inventorySlots(items) + extra > capacity) return false;
  if (prior) prior.quantity += quantity; else items.push({ itemId: id, quantity });
  return true;
}
export function removeItems(items: ItemStack[], id: string, quantity: number): boolean {
  const index = items.findIndex(i => i.itemId === id);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || index < 0 || items[index].quantity < quantity) return false;
  items[index].quantity -= quantity;
  if (!items[index].quantity) items.splice(index, 1);
  return true;
}
/** Transaction staging makes input consumption and output insertion atomic. */
export function exchangeItems(items: ItemStack[], inputs: ItemStack[], outputs: ItemStack[], capacity = BAG_SLOTS): boolean {
  const staged = items.map(i => ({ ...i }));
  if (!inputs.every(i => removeItems(staged, i.itemId, i.quantity)) || !outputs.every(i => addItems(staged, i.itemId, i.quantity, capacity))) return false;
  items.splice(0, items.length, ...staged);
  return true;
}
