import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, DataTexture, DoubleSide,
  Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial,
  NearestFilter, NearestMipmapNearestFilter, RepeatWrapping, RGBAFormat,
  SphereGeometry, SRGBColorSpace, Vector3,
} from "three";
import type { ActorState, WorldObject, Terrain } from "../../rpg/types";
import type { ActorArt, ArtLibrary, LightAnchor, ObjectArt } from "./contracts";

/** Original code-authored test art. All roots use one tile = one metre, +Z front. */
export function createArtLibrary(): ArtLibrary {
  const geometries = new Set<BufferGeometry>();
  const materials = new Map<string, MeshLambertMaterial>();
  const textures = new Set<DataTexture>();
  const own = <T extends BufferGeometry>(geometry: T): T => { geometries.add(geometry); return geometry; };
  const box = own(new BoxGeometry(1, 1, 1));
  const cylinder = own(new CylinderGeometry(1, 1, 1, 6));
  const tapered = own(new CylinderGeometry(.7, 1, 1, 7));
  const crown = own(new IcosahedronGeometry(1, 0));
  const rounded = own(new SphereGeometry(1, 7, 4));
  const cone = own(new CylinderGeometry(0, 1, 1, 6));
  const roofShape = own(new BufferGeometry());
  // Triangular-prism gable; roof ridgeline runs along local Z.
  const roofVertices = [
    -.5, 0, -.5, .5, 0, -.5, 0, 1, -.5,
    -.5, 0, .5, 0, 1, .5, .5, 0, .5,
    -.5, 0, -.5, 0, 1, -.5, 0, 1, .5,
    -.5, 0, -.5, 0, 1, .5, -.5, 0, .5,
    .5, 0, -.5, .5, 0, .5, 0, 1, .5,
    .5, 0, -.5, 0, 1, .5, 0, 1, -.5,
  ];
  for (let i = 0; i < roofVertices.length; i += 9) {
    for (let axis = 0; axis < 3; axis++) {
      const value = roofVertices[i + axis];
      roofVertices[i + axis] = roofVertices[i + 6 + axis];
      roofVertices[i + 6 + axis] = value;
    }
  }
  roofShape.setAttribute("position", new Float32BufferAttribute(roofVertices, 3));
  roofShape.setAttribute("uv", new Float32BufferAttribute([
    0, 0, 1, 0, .5, 1, 0, 0, .5, 1, 1, 0,
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0,
  ], 2));
  roofShape.computeVertexNormals();
  const capeShape = own(new BufferGeometry());
  capeShape.setAttribute("position", new Float32BufferAttribute([
    -.24, 0, 0, -.37, -.83, -.13, .37, -.83, -.13,
    -.24, 0, 0, .37, -.83, -.13, .24, 0, 0,
  ], 3));
  capeShape.setAttribute("uv", new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1], 2));
  capeShape.computeVertexNormals();

  type Pattern = "stone" | "wood" | "roof" | "cloth" | "grass" | "dirt" | "water" | "sand" | "leaf";
  function material(name: string, hex: number, pattern: Pattern = "cloth", emissive = 0): MeshLambertMaterial {
    const found = materials.get(name); if (found) return found;
    const size = 32, data = new Uint8Array(size * size * 4), color = new Color(hex);
    let seed = [...name].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7919);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      let value = 1;
      const n = seed % 101;
      if (pattern === "stone") value = y % 8 === 0 || (x + (Math.floor(y / 8) % 2) * 8) % 16 === 0 ? .81 : n < 8 ? .94 : 1;
      if (pattern === "wood") value = x % 8 === 0 ? .72 : (x + Math.floor(y / 5)) % 13 === 0 ? .9 : n < 6 ? 1.1 : 1;
      if (pattern === "roof") value = y % 8 === 0 ? .75 : Math.floor(y / 8) % 2 ? .94 : 1.05;
      if (pattern === "cloth") value = n < 3 ? .93 : 1;
      if (pattern === "leaf") value = Math.floor(x / 4 + y / 5) % 5 === 0 ? .87 : n < 7 ? 1.09 : 1;
      if (pattern === "grass") value = n < 3 ? .88 : n > 97 ? 1.08 : 1;
      if (pattern === "dirt" || pattern === "sand") value = n < 8 ? .92 : n > 95 ? 1.06 : 1;
      if (pattern === "water") value = y % 7 === 0 && x % 13 < 5 ? 1.19 : Math.floor(y / 7) % 2 ? .96 : 1;
      const i = (y * size + x) * 4;
      // Color channels are converted back to sRGB because the texture declares sRGB data.
      const pixel = color.clone().multiplyScalar(value).convertLinearToSRGB();
      data[i] = Math.min(255, Math.round(pixel.r * 255));
      data[i + 1] = Math.min(255, Math.round(pixel.g * 255));
      data[i + 2] = Math.min(255, Math.round(pixel.b * 255));
      data[i + 3] = 255;
    }
    const texture = new DataTexture(data, size, size, RGBAFormat);
    texture.colorSpace = SRGBColorSpace; texture.magFilter = NearestFilter;
    texture.minFilter = NearestMipmapNearestFilter; texture.generateMipmaps = true;
    texture.wrapS = texture.wrapT = RepeatWrapping; texture.needsUpdate = true;
    texture.name = `pixel-${name}`; textures.add(texture);
    const mat = new MeshLambertMaterial({ color: 0xffffff, map: texture, flatShading: true, emissive });
    mat.name = name; materials.set(name, mat); return mat;
  }
  const m = {
    plaster: material("ochre-plaster", 0xb9ad8c, "stone"),
    stone: material("slate-stone", 0x7b8180, "stone"),
    lightStone: material("limestone", 0xa3a390, "stone"),
    darkStone: material("charcoal-stone", 0x494f50, "stone"),
    wood: material("weathered-oak", 0x72583c, "wood"),
    darkWood: material("dark-timber", 0x44382b, "wood"),
    paleWood: material("cut-timber", 0xa18b61, "wood"),
    roof: material("dusty-terracotta", 0x8c5342, "roof"),
    blueRoof: material("slate-roof", 0x4f5b61, "roof"),
    leaf: material("olive-foliage", 0x54674a, "leaf"),
    leafLight: material("moss-foliage", 0x6c7b51, "leaf"),
    leafDark: material("fir-foliage", 0x3e5849, "leaf"),
    gold: material("old-gold", 0xc3a45c),
    blue: material("alden-blue", 0x345a8a),
    cream: material("linen", 0xc6bea1),
    dark: material("near-black", 0x292b2b),
    iron: material("iron", 0x4f5b60),
    skin: material("warm-skin", 0xc5a17b),
    glow: material("forge-coal", 0xd77630, "cloth", 0x8a2c08),
    window: material("amber-window", 0xd3ae63, "cloth", 0x6c3b0c),
  };
  const terrain: Record<Terrain, MeshLambertMaterial> = {
    grass: material("ground-grass", 0x788366, "grass"),
    dirt: material("ground-dirt", 0xa29474, "dirt"),
    sand: material("ground-sand", 0xb2aa8a, "sand"),
    stone: material("ground-stone", 0x8d8e83, "stone"),
    water: material("ground-water", 0x527582, "water"),
  };
  function mesh(parent: Group, geometry: BufferGeometry, mat: MeshLambertMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number, name = "") {
    const result = new Mesh(geometry, mat); result.position.set(x, y, z); result.scale.set(sx, sy, sz);
    result.castShadow = result.receiveShadow = true; result.name = name; parent.add(result); return result;
  }
  const block = (p: Group, mat: MeshLambertMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number, name = "") => mesh(p, box, mat, x, y, z, sx, sy, sz, name);
  function subgroup(parent: Group, name: string, x = 0, y = 0, z = 0) {
    const group = new Group(); group.name = name; group.position.set(x, y, z); parent.add(group); return group;
  }
  function barrel(parent: Group, x: number, z: number, scale = 1) {
    const b = subgroup(parent, "barrel", x, 0, z);
    mesh(b, cylinder, m.wood, 0, .32 * scale, 0, .24 * scale, .58 * scale, .24 * scale);
    for (const y of [.12, .5]) mesh(b, cylinder, m.iron, 0, y * scale, 0, .252 * scale, .06 * scale, .252 * scale);
    mesh(b, cylinder, m.paleWood, 0, .617 * scale, 0, .2 * scale, .02 * scale, .2 * scale);
  }
  function crate(parent: Group, x: number, z: number, scale = 1) {
    const c = subgroup(parent, "supply-crate", x, 0, z);
    block(c, m.wood, 0, .29 * scale, 0, .57 * scale, .57 * scale, .57 * scale);
    for (const dx of [-.24, .24]) block(c, m.paleWood, dx * scale, .29 * scale, .292 * scale, .065 * scale, .57 * scale, .045 * scale);
    const brace = block(c, m.paleWood, 0, .29 * scale, .315 * scale, .07 * scale, .65 * scale, .04 * scale); brace.rotation.z = -.7;
  }
  function lantern(parent: Group, x: number, y: number, z: number) {
    block(parent, m.darkWood, x, y + .18, z, .14, .08, .17, "lantern-cap");
    block(parent, m.window, x, y, z, .12, .26, .14, "lantern-glass");
    block(parent, m.darkWood, x, y - .16, z, .16, .06, .18);
  }
  const light = (x: number, y: number, z: number, kind: LightAnchor["kind"], intensity = 7, distance = 5): LightAnchor => ({ position: new Vector3(x, y, z), kind, color: kind === "forge" ? 0xff9a4c : 0xffd18a, intensity, distance });
  function banner(parent: Group, x: number, y: number, z: number) {
    block(parent, m.blue, x, y, z, .52, .88, .045, "royal-banner");
    block(parent, m.gold, x, y - .36, z + .03, .5, .055, .02);
    block(parent, m.gold, x, y + .08, z + .035, .08, .39, .02);
    block(parent, m.gold, x, y + .08, z + .04, .3, .075, .02);
  }
  function roof(parent: Group, width: number, depth: number, height: number, y: number, mat = m.roof) {
    const result = subgroup(parent, "removable-roof", 0, y, 0);
    mesh(result, roofShape, mat, 0, 0, 0, width, height, depth, "gable");
    for (const x of [-width / 2, width / 2]) block(result, m.darkWood, x, .015, 0, .13, .13, depth);
    block(result, m.darkWood, 0, height, 0, .13, .13, depth);
    return result;
  }
  function building(object: WorldObject): ObjectArt {
    const group = new Group(); group.name = `building:${object.id}`;
    const width = object.width * .94, depth = object.height * .94;
    const manor = object.art?.includes("manor"), workshop = object.art?.includes("workshop") || object.kind === "furnace";
    const wallHeight = manor ? 3.05 : object.kind === "furnace" ? 1.75 : 2.1;
    const floor = block(group, manor ? m.lightStone : m.stone, 0, .025, 0, width, .05, depth, "walkable-floor");
    floor.castShadow = false;
    // Open south front preserves actual same-world entrances and work visibility.
    block(group, manor ? m.lightStone : m.plaster, 0, wallHeight / 2, -depth / 2, width, wallHeight, .16, "back-wall");
    for (const x of [-width / 2, width / 2]) {
      block(group, manor ? m.lightStone : m.plaster, x, wallHeight / 2, 0, .13, wallHeight, depth, "side-wall");
      block(group, m.darkWood, x, wallHeight / 2, depth / 2, .16, wallHeight, .17, "front-post");
      block(group, m.darkWood, x, wallHeight / 2, -depth / 2, .16, wallHeight, .17);
    }
    block(group, m.darkWood, 0, wallHeight - .07, depth / 2, width, .16, .17, "front-beam");
    block(group, m.darkWood, 0, .36, -depth / 2 + .1, width, .13, .07);
    const top = roof(group, width + .36, depth + .4, manor ? 1.35 : .92, wallHeight, workshop ? m.blueRoof : m.roof);
    const lights: LightAnchor[] = [];
    const chimneyX = width * .31, chimneyZ = -depth * .25;
    block(top, m.stone, chimneyX, .65, chimneyZ, .45, 1.3, .46, "chimney");
    block(top, m.darkStone, chimneyX, 1.33, chimneyZ, .52, .1, .54, "chimney-mouth");
    if (workshop) {
      const forgeZ = -depth * .2;
      block(group, m.darkStone, width * .18, .5, forgeZ, Math.min(1, width * .4), 1, .67, "forge-hearth");
      block(group, m.glow, width * .18, .71, forgeZ + .35, Math.min(.68, width * .28), .31, .04, "live-coals");
      mesh(group, cone, m.glow, width * .18 - .12, 1.03, forgeZ + .18, .16, .47, .12, "flame");
      mesh(group, cone, m.window, width * .18 + .15, .97, forgeZ + .22, .13, .34, .12);
      lights.push(light(width * .18, 1.15, forgeZ + .65, "forge", 15, 6));
      block(group, m.darkWood, -width * .25, .67, -depth * .3, .65, .13, .45, "tool-bench");
      for (const x of [-width * .25 - .2, -width * .25 + .2]) block(group, m.wood, x, .31, -depth * .3, .09, .62, .09);
      for (let i = 0; i < 3; i++) block(group, m.iron, -width * .27 + i * .16, 1.1, -depth / 2 + .12, .06, .46, .05, "hanging-tool");
      const anvil = subgroup(group, "indoor-anvil", -width * .24, 0, depth * .19); makeAnvil(anvil);
    } else if (object.kind === "bank" || object.kind === "shop") {
      block(group, m.wood, 0, .72, depth * .12, width * .72, .18, .52, "service-counter");
      block(group, m.darkWood, 0, .34, depth * .12, width * .67, .65, .4);
      for (const x of [-.18, .03, .22]) mesh(group, cylinder, m.gold, x, .85 + (x === .03 ? .09 : 0), depth * .12, .09, .08, .09, "coin-stack");
      crate(group, -width * .28, -depth * .28, .8); barrel(group, width * .3, -depth * .27, .85);
      block(group, m.darkWood, width * .36, 1.55, depth / 2 + .08, .57, .62, .12, "service-sign");
      if (object.kind === "bank") {
        for (const x of [width * .36 - .11, width * .36 + .1]) mesh(group, cylinder, m.gold, x, 1.56, depth / 2 + .16, .1, .04, .1).rotation.x = Math.PI / 2;
      } else block(group, m.paleWood, width * .36, 1.56, depth / 2 + .16, .32, .28, .05);
    } else {
      block(group, m.wood, -width * .28, .44, -depth * .24, .9, .85, .6, "cupboard");
      block(group, m.wood, width * .21, .65, -depth * .22, .8, .12, .6, "table");
      barrel(group, width * .28, depth * .23, .8);
      if (manor) {
        banner(group, -width * .33, 1.6, depth / 2 + .13); banner(group, width * .33, 1.6, depth / 2 + .13);
        for (const x of [-width / 2, width / 2]) {
          block(top, m.lightStone, x, .3, -depth * .28, .72, 1.05, .85, "manor-turret");
          mesh(top, cone, m.blueRoof, x, 1.05, -depth * .28, .57, .75, .57);
        }
      }
    }
    for (const x of [-width * .33, width * .33]) {
      lantern(group, x, 1.47, depth / 2 + .1);
      lights.push(light(x, 1.45, depth / 2 + .34, "lantern", 4.5, 4));
    }
    block(group, m.darkWood, 0, 1.38, -depth / 2 + .1, .65, .63, .06, "window-frame");
    block(group, m.window, 0, 1.38, -depth / 2 + .14, .47, .47, .025, "window-glass");
    block(group, m.darkWood, 0, 1.38, -depth / 2 + .17, .04, .5, .04);
    lights.push(light(0, 1.4, -depth / 2 - .3, "window", 4, 4));
    return { group, roof: top, lights };
  }
  function makeAnvil(group: Group) {
    mesh(group, tapered, m.darkWood, 0, .26, 0, .3, .5, .28, "anvil-stump");
    block(group, m.iron, 0, .55, 0, .33, .23, .27, "anvil-waist");
    block(group, m.iron, 0, .72, 0, .62, .15, .3, "anvil-face");
    const horn = mesh(group, cone, m.iron, .39, .72, 0, .13, .29, .13, "anvil-horn"); horn.rotation.z = -Math.PI / 2;
  }
  function fence(group: Group, gate = false) {
    for (const x of [-.44, .44]) block(group, m.darkWood, x, .46, 0, .12, .92, .12);
    const panel = subgroup(group, gate ? "hinged-gate" : "fence-rails", gate ? -.44 : 0);
    const offset = gate ? .44 : 0;
    for (const y of [.3, .66]) block(panel, m.wood, offset, y, .005, .85, .11, .075);
    if (gate) {
      const brace = block(panel, m.paleWood, offset, .48, .055, .08, .82, .055); brace.rotation.z = -.88;
      block(panel, m.iron, .79, .62, .07, .07, .08, .08);
    }
    return panel;
  }
  function createObject(object: WorldObject): ObjectArt {
    if (["bank", "shop", "building", "furnace"].includes(object.kind)) return building(object);
    const group = new Group(); group.name = `object:${object.id}`;
    const result: ObjectArt = { group, lights: [] };
    if (object.kind === "tree") {
      const available = subgroup(group, "tree-canopy"), depleted = subgroup(group, "chopped-stump"); depleted.visible = false;
      const oak = object.resourceId === "oak", willow = object.resourceId === "willow";
      mesh(available, tapered, m.wood, 0, 1.05, 0, .17, 2.1, .17, "single-trunk");
      const colors = willow ? [m.leafDark, m.leaf, m.leafDark] : [m.leaf, m.leafLight, m.leaf];
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3 + object.position.x;
        const canopy = mesh(available, crown, colors[i], Math.cos(angle) * .33, 2.25 + i * .28, Math.sin(angle) * .32, oak ? 1.03 : .85, willow ? 1.15 : .86, oak ? 1.03 : .85, "foliage-mass");
        canopy.rotation.y = angle;
      }
      mesh(depleted, cylinder, m.wood, 0, .2, 0, .23, .4, .23);
      mesh(depleted, cylinder, m.paleWood, 0, .405, 0, .23, .015, .23, "cut-ring");
      result.available = available; result.depleted = depleted;
    } else if (object.kind === "rock") {
      const available = subgroup(group, "ore-outcrop"), depleted = subgroup(group, "exhausted-rock"); depleted.visible = false;
      const oreColors: Record<string, number> = { copper: 0x9b704d, tin: 0xa5aaa0, iron: 0x846c59, coal: 0x373c39 };
      for (let i = 0; i < 3; i++) {
        const rock = mesh(available, crown, m.stone, (i - 1) * .22, .39 + (i === 1 ? .17 : 0), (i % 2) * .18, .47, .56, .43); rock.rotation.y = i * 1.7;
      }
      const ore = material(`ore-${object.resourceId}`, oreColors[object.resourceId ?? ""] ?? 0x9c8a63, "stone");
      for (let i = 0; i < 3; i++) mesh(available, crown, ore, (i - 1) * .23, .58 + (i % 2) * .19, .31, .13, .16, .065, "ore-vein");
      mesh(depleted, crown, m.darkStone, 0, .2, 0, .55, .27, .48);
      result.available = available; result.depleted = depleted;
    } else if (object.kind === "anvil") makeAnvil(group);
    else if (object.kind === "range") {
      block(group, m.lightStone, 0, .42, 0, object.width * .75, .85, object.height * .7, "cooking-stove");
      block(group, m.iron, 0, .9, 0, object.width * .81, .09, object.height * .73);
      block(group, m.glow, 0, .4, object.height * .35 + .012, .48, .25, .03, "cooking-fire");
      mesh(group, cylinder, m.iron, .2, 1, -.1, .25, .17, .25, "cooking-pot");
      result.lights.push(light(0, .55, object.height * .35 + .3, "forge", 7, 4));
    } else if (object.kind === "fence" || object.kind === "gate") {
      const panel = fence(group, object.kind === "gate");
      if (object.orientation === "y") group.rotation.y = Math.PI / 2;
      if (object.kind === "gate") result.gate = panel;
    } else if (object.kind === "bridge") {
      const w = object.width, d = object.height;
      // Deck stays at tile height; low side rails do not suggest an impassable step.
      block(group, m.lightStone, 0, -.01, 0, w, .12, d, "walkable-bridge-deck");
      for (const z of [-d / 2 + .1, d / 2 - .1]) {
        block(group, m.stone, 0, .38, z, w, .32, .19, "bridge-parapet");
        for (const x of [-w / 2 + .17, 0, w / 2 - .17]) block(group, m.lightStone, x, .36, z, .32, .72, .32);
      }
    } else if (object.kind === "sign" || object.kind === "landmark") {
      if (object.kind === "landmark" && !object.art) return result;
      block(group, m.darkWood, 0, .57, 0, .11, 1.14, .12);
      block(group, m.wood, 0, .97, .02, .82, .36, .1, "notice-board");
      block(group, m.paleWood, 0, 1.02, .08, .54, .035, .02);
      block(group, m.paleWood, -.07, .92, .08, .4, .035, .02);
    } else if (object.kind === "target") {
      for (const x of [-.24, .24]) block(group, m.wood, x, .55, 0, .09, 1.1, .1).rotation.z = x * -.4;
      const disc = mesh(group, cylinder, m.paleWood, 0, 1.05, 0, .43, .12, .43, "archery-target"); disc.rotation.x = Math.PI / 2;
      for (const [radius, mat, z] of [[.28, m.roof, .075], [.12, m.cream, .09]] as const) {
        const ring = mesh(group, cylinder, mat, 0, 1.05, z, radius, .025, radius); ring.rotation.x = Math.PI / 2;
      }
    } else if (object.kind === "fish") {
      const basket = mesh(group, cylinder, m.wood, .14, .22, 0, .26, .44, .26, "fishing-basket"); basket.rotation.y = .2;
      block(group, m.paleWood, .14, .46, 0, .32, .04, .15);
      const rod = block(group, m.darkWood, -.18, .5, .05, .035, 1, .035, "resting-rod"); rod.rotation.z = -.45;
    } else if (object.kind === "ferry") {
      block(group, m.wood, 0, .12, 0, .94, .2, .65, "ferry-boat");
      for (const x of [-.4, .4]) block(group, m.darkWood, x, .3, 0, .08, .3, .68);
      block(group, m.paleWood, 0, .26, 0, .8, .1, .16, "ferry-seat");
    } else if (object.kind === "quest") {
      const actor = createActor({ id: 1000 + object.position.x, name: object.name, role: object.questId === "forge" ? "smith" : object.questId === "supper" ? "cook" : "merchant" });
      actor.group.name = "quest-giver"; group.add(actor.group);
    } else if (object.kind === "clue") {
      block(group, m.wood, 0, .32, 0, .6, .64, .42, "clue-stand");
      const ledger = block(group, m.cream, 0, .66, .015, .48, .06, .35, "open-ledger"); ledger.rotation.x = .15;
      block(group, m.darkWood, 0, .7, .03, .025, .015, .29);
    } else if (object.art?.includes("crops")) {
      block(group, terrain.dirt, 0, .035, 0, .94, .06, .94, "cultivated-bed");
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) mesh(group, crown, x % 2 ? m.leafLight : m.leaf, (x - 1) * .28, .18, (z - 1) * .29, .13, .19, .12, "vegetable");
    } else if (object.kind === "decor") {
      crate(group, -.18, -.07, .9); barrel(group, .27, .18, .7);
      const log = mesh(group, cylinder, m.wood, -.1, .7, -.07, .13, .65, .13, "stacked-log"); log.rotation.z = Math.PI / 2;
    }
    return result;
  }

  function makeTool(parent: Group, kind: string) {
    if (kind === "bow") {
      // A few angled stave sections preserve the chunky model language without a tube mesh.
      const upper = block(parent, m.wood, 0, .37, .13, .055, .52, .055, "bow-upper-stave"); upper.rotation.x = -.42;
      const lower = block(parent, m.wood, 0, -.1, .13, .055, .52, .055, "bow-lower-stave"); lower.rotation.x = .42;
      block(parent, m.darkWood, 0, .135, .235, .08, .16, .065, "bow-grip");
      const string = block(parent, m.cream, 0, .135, .025, .012, .94, .012, "bow-string"); string.castShadow = false;
    } else if (kind === "fisher") {
      const rod = block(parent, m.wood, 0, .46, .06, .04, 1.25, .04, "fishing-rod"); rod.rotation.x = .6;
      const line = block(parent, m.cream, 0, .45, .65, .012, .7, .012, "fishing-line"); line.castShadow = false;
    } else if (kind === "merchant" || kind === "builder" || kind === "cook") {
      block(parent, m.darkWood, 0, -.08, .08, .055, .36, .055, "hand-tool-handle");
      block(parent, kind === "cook" ? m.wood : m.iron, 0, .12, .08, .26, .13, .11, kind === "cook" ? "spoon" : "hammer");
    } else {
      block(parent, m.wood, 0, .11, .06, .055, .66, .055, "tool-handle");
      if (kind === "miner") {
        const pick = block(parent, m.iron, 0, .41, .06, .61, .08, .09, "pickaxe-head"); pick.rotation.z = -.12;
      } else if (kind === "woodcutter") {
        block(parent, m.iron, .13, .36, .06, .29, .28, .09, "axe-head");
        block(parent, m.lightStone, .29, .36, .06, .035, .27, .095, "axe-edge");
      } else if (kind === "smith") block(parent, m.iron, 0, .42, .06, .34, .18, .16, "smith-hammer");
      else {
        block(parent, m.iron, 0, .33, .07, .1, .69, .045, "sword-blade");
        block(parent, m.gold, 0, -.02, .07, .3, .055, .08, "sword-guard");
      }
    }
  }
  function createActor(actor: Pick<ActorState, "id" | "role" | "name">): ActorArt {
    const group = new Group(); group.name = `actor:${actor.name}`;
    const body = subgroup(group, "body"), prince = actor.id === 0;
    const clothes: Record<string, number> = { woodcutter: 0x596c4d, miner: 0x737b75, smith: 0x5e5043, builder: 0x9a875f, fisher: 0x69848a, cook: 0xa59a85, merchant: 0x79677e };
    const cloth = prince ? m.blue : material(`coat-${actor.role}`, clothes[actor.role] ?? (actor.id % 2 ? 0x7a7155 : 0x6b7c76));
    const hairColors = [0x5c3b28, 0x3e332b, 0x9b865b, 0x8a8a7d];
    const hair = material(`hair-${prince ? 0 : actor.id % 4}`, hairColors[prince ? 0 : actor.id % 4]);
    const skin = prince || actor.id % 3 ? m.skin : material("deep-skin", 0x92704f);
    block(body, cloth, 0, 1.02, 0, .57, .6, .32, "tunic");
    block(body, prince ? m.cream : m.darkWood, 0, .84, .18, .42, .31, .025, "shirt-or-apron");
    block(body, m.darkWood, 0, .73, 0, .59, .08, .35, "belt");
    block(body, m.gold, .04, .73, .19, .095, .09, .04, "buckle");
    const legs: Group[] = [], arms: Group[] = [];
    for (const side of [-1, 1]) {
      const leg = subgroup(body, side < 0 ? "left-leg" : "right-leg", side * .16, .7, 0);
      block(leg, prince ? m.darkStone : m.darkWood, 0, -.23, 0, .21, .46, .24, "trousers");
      block(leg, m.darkWood, 0, -.58, .055, .25, .24, .36, "boot"); legs.push(leg);
      const arm = subgroup(body, side < 0 ? "left-arm" : "right-arm", side * .36, 1.24, 0);
      block(arm, prince ? m.cream : cloth, 0, -.13, 0, .21, .28, .25, "sleeve");
      block(arm, skin, 0, -.36, .015, .18, .24, .21, "forearm"); arms.push(arm);
    }
    block(body, skin, 0, 1.56, .025, .45, .44, .42, "head");
    const top = mesh(body, crown, hair, 0, 1.78, -.005, .32, .2, .29, "angular-hair"); top.rotation.y = .2;
    block(body, hair, 0, 1.57, -.19, .46, .35, .1, "back-hair");
    block(body, hair, -.17, 1.69, .24, .13, .17, .045, "fringe");
    for (const x of [-.1, .1]) block(body, m.dark, x, 1.57, .241, .055, .055, .015, "pixel-eye");
    block(body, skin, 0, 1.48, .255, .08, .075, .07, "nose");
    const tool = subgroup(arms[1], "tool", 0, -.46, .055);
    const defaultPose = ({ woodcutter: "cut", miner: "mine", fisher: "fish", smith: "smith", builder: "smith", cook: "smith" } as Record<string, string>)[actor.role] ?? "melee";
    for (const [pose, kind] of [["cut", "woodcutter"], ["mine", "miner"], ["fish", "fisher"], ["smith", "smith"], ["melee", "prince"], ["bow", "bow"]] as const) {
      const variant = subgroup(tool, `tool-${pose}`); makeTool(variant, kind);
      variant.visible = pose === defaultPose;
    }
    // Presentation enables a tool for an actual action; possessing a model grants no equipment.
    tool.visible = false;
    let cape: Mesh | undefined;
    if (prince) {
      const capeMaterial = material("royal-cape", 0x345a8a); capeMaterial.side = DoubleSide;
      cape = mesh(body, capeShape, capeMaterial, 0, 1.3, -.18, 1, 1, 1, "royal-cape");
      block(body, m.gold, -.28, 1.29, .02, .14, .09, .37, "gold-shoulder-trim");
      block(body, m.gold, .28, 1.29, .02, .14, .09, .37, "gold-shoulder-trim");
    } else if (actor.role === "fisher" || actor.role === "woodcutter") {
      mesh(body, cylinder, m.paleWood, 0, 1.79, 0, .4, .055, .37, "hat-brim");
      mesh(body, tapered, m.paleWood, 0, 1.9, 0, .23, .2, .23, "hat-crown");
    } else if (actor.role === "smith" || actor.role === "miner") {
      mesh(body, rounded, actor.role === "miner" ? m.lightStone : m.darkWood, 0, 1.76, -.005, .27, .16, .25, "work-cap");
    }
    return { group, body, leftArm: arms[0], rightArm: arms[1], leftLeg: legs[0], rightLeg: legs[1], tool, cape };
  }
  function createEnemy(definitionId: string) {
    const group = new Group(); group.name = `enemy:${definitionId}`;
    if (definitionId === "boar") {
      const hide = material("boar-hide", 0x75614c, "cloth");
      mesh(group, rounded, hide, 0, .6, 0, .45, .43, .68);
      mesh(group, crown, hide, 0, .55, .61, .3, .29, .32, "boar-head");
      block(group, m.darkWood, 0, .47, .87, .29, .19, .15, "snout");
      for (const side of [-1, 1]) {
        mesh(group, cone, m.cream, side * .2, .43, .85, .055, .24, .055, "tusk").rotation.x = .5;
        mesh(group, cone, hide, side * .2, .83, .56, .1, .2, .08, "ear");
        block(group, m.dark, side * .2, .64, .8, .04, .045, .03, "eye");
        for (const z of [-.4, .37]) block(group, m.darkWood, side * .29, .21, z, .15, .42, .16, "leg");
      }
    } else if (definitionId === "rock-mite") {
      mesh(group, crown, m.darkStone, 0, .42, 0, .56, .44, .56, "mite-shell");
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const leg = block(group, m.wood, side * .5, .2, (i - 1) * .3, .45, .08, .1, "mite-leg"); leg.rotation.z = side * -.4;
      }
      for (const x of [-.12, .12]) block(group, m.glow, x, .36, .49, .065, .055, .025, "mite-eye");
    } else {
      const actor = createActor({ id: 999, name: definitionId, role: "bandit" }); group.add(actor.group);
      const hood = mesh(actor.body, crown, definitionId === "armoured-outlaw" ? m.iron : m.darkWood, 0, 1.76, -.03, .32, .22, .3, "outlaw-hood"); hood.rotation.y = .3;
      if (definitionId === "captain") block(actor.body, m.roof, 0, 1.2, -.23, .61, .48, .05, "captain-mantle");
    }
    return group;
  }
  let disposed = false;
  return {
    terrain, createObject, createActor, createEnemy,
    dispose() {
      if (disposed) return; disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const mat of materials.values()) mat.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
