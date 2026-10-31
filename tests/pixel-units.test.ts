import { describe, expect, test } from "vitest";
import { createUnitSheet, createHeldUnitSheet, UNIT_TOOLS, UNIT_FRAME_COUNT, UNIT_FRAME_SIZE, UNIT_KINDS, unitKindForActor, unitKindForEnemy, type UnitSheet } from "../src/render/pixel-units";

function pixels(sheet: UnitSheet, frame: number) {
  const result: { x: number; y: number; index: number }[] = [];
  for (let y = 0; y < UNIT_FRAME_SIZE; y++) for (let x = 0; x < UNIT_FRAME_SIZE; x++) {
    const index = (y * sheet.width + frame * UNIT_FRAME_SIZE + x) * 4;
    if (sheet.rgba[index + 3]) result.push({ x, y, index });
  }
  return result;
}

function normalizedMask(sheet: UnitSheet, frame: number): string {
  const occupied = pixels(sheet, frame);
  const left = Math.min(...occupied.map(pixel => pixel.x)), top = Math.min(...occupied.map(pixel => pixel.y));
  return occupied.map(pixel => `${pixel.x-left},${pixel.y-top}`).join(";");
}

function sameFrame(sheet: UnitSheet, a: number, b: number, channel: "rgba" | "normal" = "rgba"): boolean {
  const buffer = sheet[channel];
  for (let y = 0; y < UNIT_FRAME_SIZE; y++) for (let x = 0; x < UNIT_FRAME_SIZE; x++) {
    const ai = (y * sheet.width + a * UNIT_FRAME_SIZE + x) * 4;
    const bi = (y * sheet.width + b * UNIT_FRAME_SIZE + x) * 4;
    for (let c = 0; c < 4; c++) if (buffer[ai+c] !== buffer[bi+c]) return false;
  }
  return true;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

describe("authored pixel unit art", () => {
  test.each(UNIT_KINDS)("%s has bounded opaque frames, matching normals and an invariant ground pivot", kind => {
    const sheet = createUnitSheet(kind, 2);
    expect(sheet.width).toBe(UNIT_FRAME_SIZE * UNIT_FRAME_COUNT);
    expect(sheet.height).toBe(UNIT_FRAME_SIZE);
    expect(sheet.rgba.length).toBe(sheet.width * sheet.height * 4);
    expect(sheet.normal.length).toBe(sheet.rgba.length);
    expect([sheet.frameSize, sheet.frameCount, sheet.footX, sheet.footY]).toEqual([32, 10, 16, 28]);
    const idle = pixels(sheet, 0);
    const idleTop = Math.min(...idle.map(pixel => pixel.y));
    expect(sheet.bodyHeight).toBe(28 - idleTop);
    for (let frame = 0; frame < UNIT_FRAME_COUNT; frame++) {
      const occupied = pixels(sheet, frame);
      expect(occupied.length).toBeGreaterThan(35);
      expect(Math.min(...occupied.map(pixel => pixel.x))).toBeGreaterThan(0);
      expect(Math.max(...occupied.map(pixel => pixel.x))).toBeLessThan(31);
      expect(Math.min(...occupied.map(pixel => pixel.y))).toBeGreaterThan(0);
      expect(Math.max(...occupied.map(pixel => pixel.y))).toBe(27);
      let nonOpaquePixels = 0, maxNormalError = 0, minNormalZ = 1;
      // Scan every occupied pixel, but report aggregate errors rather than invoking
      // the assertion framework for every channel of every cell.
      for (const { index } of occupied) {
        if (sheet.rgba[index + 3] !== 255 || sheet.normal[index + 3] !== 255) nonOpaquePixels++;
        const nx = sheet.normal[index]! / 255 * 2 - 1;
        const ny = sheet.normal[index + 1]! / 255 * 2 - 1;
        const nz = sheet.normal[index + 2]! / 255 * 2 - 1;
        maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(nx, ny, nz) - 1));
        minNormalZ = Math.min(minNormalZ, nz);
      }
      expect(nonOpaquePixels, kind + ' frame ' + frame + ' nonopaque occupied cells').toBe(0);
      expect(maxNormalError, kind + ' frame ' + frame + ' maximum normal-length error').toBeLessThan(.005);
      expect(minNormalZ, kind + ' frame ' + frame + ' minimum outward normal').toBeGreaterThan(.5);
    }
    let alphaMismatches = 0, fractionalAlphaPixels = 0;
    for (let index = 3; index < sheet.rgba.length; index += 4) {
      if (sheet.normal[index] !== sheet.rgba[index]) alphaMismatches++;
      if (sheet.rgba[index] !== 0 && sheet.rgba[index] !== 255) fractionalAlphaPixels++;
    }
    expect({ alphaMismatches, fractionalAlphaPixels }).toEqual({ alphaMismatches: 0, fractionalAlphaPixels: 0 });
  });

  test.each(UNIT_KINDS)("%s keeps every body frame static and all holding equipment separate", kind => {
    const sheet = createUnitSheet(kind);
    for (let frame = 1; frame < UNIT_FRAME_COUNT; frame++) {
      expect(sameFrame(sheet, 0, frame), kind + " body frame " + frame).toBe(true);
      expect(sameFrame(sheet, 0, frame, "normal"), kind + " body normal frame " + frame).toBe(true);
    }
    if (kind !== "boar" && kind !== "rock-mite")
      expect(pixels(sheet, 0).every(pixel => pixel.x < 24), "no baked held equipment").toBe(true);
  });

  test("Alden preserves the measured half-cell offsets without a baked hand or sword", () => {
    const sheet = createUnitSheet("prince", 0), body = pixels(sheet, 0);
    const left = Math.min(...body.map(pixel => pixel.x)), right = Math.max(...body.map(pixel => pixel.x));
    const top = Math.min(...body.map(pixel => pixel.y)), bottom = Math.max(...body.map(pixel => pixel.y));
    expect({ left, right, top, bottom }).toEqual({ left: 7, right: 23, top: 10, bottom: 27 });
    expect(sheet.bodyHeight).toBe(18);
    const rowWidths = Array.from({ length: 18 }, (_, row) => body.filter(pixel => pixel.y === top + row).length);
    expect(rowWidths).toEqual([8,8,12,12,12,12,12,12,16,16,17,17,17,17,17,17,8,8]);
    const colorAt = (index: number) => sheet.rgba[index]! * 65536 + sheet.rgba[index+1]! * 256 + sheet.rgba[index+2]!;
    const skinRows = new Set(body.filter(({ index }) => colorAt(index) === 0xfdd59b).map(pixel => pixel.y));
    expect([...skinRows]).toEqual([14,15,16,17,18,19]);
    // Reference tool steel, grip and holding-hand colors must exist only in the held sheet.
    const heldColors = new Set([0xb2aca9, 0xd0cac4, 0x94543c, 0xfdd69b]);
    expect(body.every(pixel => !heldColors.has(colorAt(pixel.index)))).toBe(true);
    const clasp = body.filter(({ y, index }) => y === 22 && colorAt(index) === 0xf9c765);
    expect(clasp.map(pixel => pixel.x)).toEqual([14,15,16,17]);
    const boots = body.filter(({ index }) => colorAt(index) === 0x804b3a);
    expect(boots.length).toBe(16);
    expect(boots.every(pixel => pixel.y === 26 || pixel.y === 27)).toBe(true);
  });

  test("all human variants retain a substantial natural skin face band with only eye marks", () => {
    for (const kind of UNIT_KINDS.filter(value => value !== "boar" && value !== "rock-mite")) {
      for (let variant = 0; variant < 4; variant++) {
        const sheet = createUnitSheet(kind, variant);
        const face = pixels(sheet, 0).filter(pixel => pixel.x >= 10 && pixel.x <= 21 && pixel.y >= 14 && pixel.y < 20);
        const skin = face.filter(({ index }) => {
          const color = sheet.rgba[index]! * 65536 + sheet.rgba[index+1]! * 256 + sheet.rgba[index+2]!;
          return [0xf2c08b, 0xcc915f, 0xa46f48, 0xe2a874, 0xfdd59b].includes(color);
        });
        expect(skin.length, kind + " variant " + variant + " natural face area").toBeGreaterThanOrEqual(32);
        const eyes = face.filter(({ index }) => sheet.rgba[index] === 60 && sheet.rgba[index+1] === 38 && sheet.rgba[index+2] === 28);
        expect(eyes.length, kind + " paired2×2fine eye clusters").toBe(8);
      }
    }
  });

  test("held equipment is a separate same-pitch layer with only one fine-pixel hand step", () => {
    const body = createUnitSheet("prince"), signatures: string[] = [];
    for (const tool of UNIT_TOOLS) {
      const held = createHeldUnitSheet("prince", 0, tool);
      expect([held.width, held.height, held.frameSize, held.frameCount, held.footX, held.footY, held.bodyHeight])
        .toEqual([body.width, body.height, body.frameSize, body.frameCount, body.footX, body.footY, body.bodyHeight]);
      const rest = pixels(held, 0), moved = pixels(held, 1);
      expect(rest.length).toBeGreaterThan(0);
      expect(moved.length).toBe(rest.length);
      expect(sameFrame(held, 0, 1)).toBe(false);
      for (let frame = 2; frame < UNIT_FRAME_COUNT; frame++) expect(sameFrame(held, 0, frame)).toBe(true);
      const translatedPixelsMatch = rest.every(pixel => {
        const target = ((pixel.y - 1) * held.width + UNIT_FRAME_SIZE + pixel.x) * 4;
        return [0,1,2,3].every(channel => held.rgba[target+channel] === held.rgba[pixel.index+channel]
          && held.normal[target+channel] === held.normal[pixel.index+channel]);
      });
      expect(translatedPixelsMatch, tool + " moves exactly one fine source pixel").toBe(true);
      expect(Math.min(...rest.map(pixel => pixel.x))).toBeGreaterThan(0);
      expect(Math.max(...rest.map(pixel => pixel.x))).toBeLessThan(31);
      let alphaMismatches = 0, nonBinaryAlpha = 0, maxNormalError = 0;
      for (let index = 0; index < held.rgba.length; index += 4) {
        const alpha = held.rgba[index+3];
        if (held.normal[index+3] !== alpha) alphaMismatches++;
        if (alpha !== 0 && alpha !== 255) nonBinaryAlpha++;
        if (alpha) {
          const nx = held.normal[index]!/255*2-1, ny = held.normal[index+1]!/255*2-1, nz = held.normal[index+2]!/255*2-1;
          maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(nx,ny,nz)-1));
        }
      }
      expect({ alphaMismatches, nonBinaryAlpha }).toEqual({ alphaMismatches: 0, nonBinaryAlpha: 0 });
      expect(maxNormalError).toBeLessThan(.005);
      signatures.push(normalizedMask(held, 0));
    }
    expect(new Set(signatures).size, "none and all six selected tools have distinct layers").toBe(UNIT_TOOLS.length);
    expect(sameBytes(body.rgba, createUnitSheet("prince").rgba), "tool changes never mutate body art").toBe(true);
    const bare = pixels(createHeldUnitSheet("prince", 0, "none"), 0);
    expect(bare.map(pixel => [pixel.x, pixel.y])).toEqual([[24,24],[25,24],[24,25],[25,25]]);
  });

  test("all humanoids expose only a holding-hand overlay and creatures expose no held pixels", () => {
    for (const kind of UNIT_KINDS) {
      const body = createUnitSheet(kind, 2), hand = createHeldUnitSheet(kind, 2, "none");
      expect([hand.frameSize, hand.footX, hand.footY, hand.bodyHeight])
        .toEqual([body.frameSize, body.footX, body.footY, body.bodyHeight]);
      if (kind === "boar" || kind === "rock-mite") {
        for (const tool of UNIT_TOOLS) expect(pixels(createHeldUnitSheet(kind, 2, tool), 0).length).toBe(0);
      } else {
        expect(pixels(hand, 0).length).toBe(4);
        expect(sameFrame(body, 0, 1)).toBe(true);
      }
    }
  });

  test("all human families use the accepted fine-cell density and species retain their own silhouettes", () => {
    const appearances = new Set<string>();
    for (const kind of UNIT_KINDS) {
      const sheet = createUnitSheet(kind, 0), art = pixels(sheet, 0);
      const bounds = {
        width: Math.max(...art.map(pixel => pixel.x)) - Math.min(...art.map(pixel => pixel.x)) + 1,
        height: Math.max(...art.map(pixel => pixel.y)) - Math.min(...art.map(pixel => pixel.y)) + 1,
      };
      if (kind === "boar") expect(bounds).toEqual({ width: 16, height: 14 });
      else if (kind === "rock-mite") expect(bounds).toEqual({ width: 20, height: 12 });
      else {
        expect(bounds, kind + " follows the measured fine grid").toEqual({ width: 17, height: 18 });
        expect(sheet.bodyHeight).toBe(18);
        const hand = createHeldUnitSheet(kind, 0, "none");
        expect(pixels(hand, 0).map(pixel => [pixel.x, pixel.y])).toEqual([[24,24],[25,24],[24,25],[25,25]]);
        // Distinct role palettes/costumes must survive shared silhouette proportions.
        let hash = 2166136261;
        for (const value of sheet.rgba) hash = Math.imul(hash ^ value, 16777619) >>> 0;
        appearances.add(String(hash));
      }
      expect(sheet.bodyHeight).toBe(bounds.height);
      expect(createHeldUnitSheet(kind, 0, "hammer").bodyHeight).toBe(bounds.height);
    }
    expect(appearances.size).toBe(UNIT_KINDS.length - 2);
  });

  test("variants are deterministic, owned buffers and visibly different without changing scale", () => {
    const first = createUnitSheet("woodcutter", 1), again = createUnitSheet("woodcutter", 1), other = createUnitSheet("woodcutter", 2);
    expect(sameBytes(first.rgba, again.rgba), "repeat diffuse pixels").toBe(true);
    expect(sameBytes(first.normal, again.normal), "repeat normal pixels").toBe(true);
    expect(first.rgba).not.toBe(again.rgba);
    expect(first.normal).not.toBe(again.normal);
    expect(sameBytes(first.rgba, other.rgba), "variant appearance differs").toBe(false);
    expect(sameBytes(createUnitSheet("prince", Number.NaN).rgba, createUnitSheet("prince").rgba), "invalid variant uses default").toBe(true);
  });

  test("cast resolvers cover player, professions, service people and every enemy family", () => {
    expect(unitKindForActor({ id: 0, role: "unknown", name: "Alden" })).toBe("prince");
    for (const role of ["woodcutter", "miner", "fisher", "smith", "builder", "cook", "merchant"] as const)
      expect(unitKindForActor({ id: 5, role, name: "Villager" })).toBe(role);
    expect(unitKindForActor({ id: 1000, role: "shopkeeper", name: "Nell" })).toBe("merchant");
    for (const id of ["boar", "rock-mite", "bandit", "captain", "armoured-outlaw", "ranged-outlaw"] as const)
      expect(unitKindForEnemy(id)).toBe(id);
    expect(unitKindForEnemy("unknown-enemy")).toBe("bandit");
  });
});
