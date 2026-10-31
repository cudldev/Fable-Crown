import { readFile, access, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { checkTerrainAssets } from "./check-terrain-assets.mjs";
const html = await readFile("dist/index.html", "utf8");
const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const script = paths.find((p) => p.endsWith(".js"));
if (!script) throw new Error("Missing application script");
const base = script.slice(0, script.indexOf("assets/"));
for (const path of paths) {
  if (!path.startsWith(base))
    throw new Error(`Asset escaped deployment base: ${path}`);
  await access("dist/" + path.slice(base.length));
}
const manifest = JSON.parse(
  await readFile("dist/manifest.webmanifest", "utf8"),
);
for (const key of ["start_url", "scope", "id"])
  if (manifest[key] !== "./") throw new Error(`Invalid relative PWA ${key}`);
const sw = await readFile("dist/sw.js", "utf8");
if (sw.includes('"/assets/') || !sw.includes("./index.html"))
  throw new Error("Invalid cache paths");
const art = JSON.parse(await readFile("dist/world-assets.json", "utf8"));
let bytes = 0;
for (const path of art.files) {
  if (!/^art3d\/[a-z0-9/?=.-]+$/.test(path)) throw Error("Invalid release artwork path");
  bytes += (await stat("dist/" + path.split("?")[0])).size;
}
if (bytes !== art.bytes) throw Error("Offline artwork size mismatch");
for (const path of ["art", "art3d/ink", "art3d/fitted", "art3d/alden.glb", "art3d/tree.glb"]) {
  if (await access("dist/" + path).then(() => true, () => false)) throw Error("Retired style shipped: " + path);
}
const models = JSON.parse(await readFile("dist/art3d/manifest.json", "utf8"));
for (const path of models.files) {
  if (!/^art3d\/[a-z0-9-]+\.(glb|png)$/.test(path))
    throw new Error("3D artwork path escaped deployment base");
  await access("dist/" + path);
  if (!sw.includes("./" + path)) throw new Error("3D artwork missing from offline cache");
}
const voxels = JSON.parse(await readFile("dist/art3d/voxel/baked.json", "utf8"));
const terrain = JSON.parse(await readFile("dist/art3d/terrain/surface.json", "utf8"));
await checkTerrainAssets("public/art3d/terrain");
for (const [kind, compiled, manifest, pack, generated] of [
  ["voxel", voxels, "baked.json", "meshes.bin", "voxel-bake-version.ts"],
  ["terrain", terrain, "surface.json", "surface.bin", "terrain-surface-version.ts"],
]) {
  const native = JSON.parse(await readFile(`public/art3d/${kind}/manifest.json`, "utf8"));
  const versionSource = await readFile("src/render/three/" + generated, "utf8");
  if (compiled.format !== 1 || compiled.sourceVersion !== native.version || compiled.pack !== pack || !versionSource.includes('"' + compiled.version + '"')) throw Error("Stale compiled " + kind);
  for (const name of [manifest, pack]) {
    const path = `art3d/${kind}/${name}?v=${compiled.version}`;
    if (!sw.includes("./" + path) || !art.files.includes(path)) throw Error("Compiled asset missing from offline cache: " + path);
  }
  const bytes = await readFile(`dist/art3d/${kind}/${pack}`);
  if (bytes.length !== compiled.bytes || createHash("sha256").update(bytes).digest("hex") !== compiled.packSha256) throw Error("Invalid compiled " + kind + " payload");
  if (kind === "voxel" && gunzipSync(bytes).length !== compiled.decodedBytes) throw Error("Invalid voxel bake decompressed size");
}
if (art.files.some(path => /\.vox(?:\?|$)|tiles\.bin/.test(path))) throw Error("Raw voxel sources must not be downloaded for gameplay");
for (const path of ["art3d/voxel/manifest.json", "art3d/voxel/tree.vox", "art3d/terrain/manifest.json", "art3d/terrain/tiles.bin"])
  if (await access("dist/" + path).then(() => true, () => false)) throw Error("Raw voxel source shipped: " + path);
console.log(
  `Verified ${paths.length} HTML asset URLs, ${art.files.length} artwork files, manifest and worker cache scope at ${base}`,
);
