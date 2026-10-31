import { expect, test, vi } from "vitest";
import { ContactDetail, footContactPixels } from "../src/render/three/contact-detail";
import type { WorldDefinition } from "../src/rpg/types";
import { DEFAULT_VISUAL_SETTINGS, normalizeVisualSettings, transportSettingsKey } from "../src/render/three/visual-settings";

test("contact field localizes fence posts and foundation edges while leaving open ground clear", () => {
  const world: WorldDefinition = { id: "contact", name: "Contact", width: 16, height: 16, chunkSize: 16, terrain: Array(256).fill("grass"), collision: Array(256).fill(0), spawns: [], portals: [], objects: [
    { id: "fence", name: "Fence", kind: "fence", position: { worldId: "contact", x: 4, y: 4, plane: 0 }, width: 1, height: 1, blocks: false },
    { id: "house", name: "House", kind: "building", position: { worldId: "contact", x: 8, y: 8, plane: 0 }, width: 3, height: 2, blocks: true },
  ] };
  const before = JSON.stringify(world), contact = new ContactDetail(world), image = contact.texture.image;
  const at = (x: number, z: number) => image.data![Math.floor((z + .5) * 8) * image.width + Math.floor((x + .5) * 8)];
  expect(at(4.44, 4)).toBeGreaterThan(120); expect(at(4, 4)).toBe(0); expect(at(1, 1)).toBe(0);
  expect(at(7.55, 8)).toBeGreaterThan(100); expect(at(7, 8)).toBe(0); expect(JSON.stringify(world)).toBe(before);
  const disposed = vi.fn(); contact.texture.addEventListener("dispose", disposed); contact.dispose();
  expect(disposed).toHaveBeenCalledOnce(); expect(contact.texture.image.data!.byteLength).toBe(1);
});
test("foot contacts fall off softly and the new visual controls normalize without new transport inputs", () => {
  const pixels = footContactPixels(), alpha = (x: number, y: number) => pixels[(y * 32 + x) * 4 + 3];
  expect(alpha(16, 16)).toBeGreaterThan(alpha(24, 16)); expect(alpha(24, 16)).toBeGreaterThan(alpha(31, 16)); expect(alpha(0, 0)).toBe(0);
  const visual = normalizeVisualSettings({ contactStrength: 4, atmosphereStrength: -1, colorBalance: Infinity });
  expect(visual).toMatchObject({ contactStrength: 1, atmosphereStrength: 0, colorBalance: .35 });
  expect(transportSettingsKey(visual)).toBe(transportSettingsKey(DEFAULT_VISUAL_SETTINGS));
});
