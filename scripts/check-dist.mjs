import { readFile, access, stat } from "node:fs/promises";
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
const voxels = JSON.parse(await readFile("dist/art3d/voxel/manifest.json", "utf8"));
const terrain = JSON.parse(await readFile("dist/art3d/terrain/manifest.json", "utf8"));
for (const path of ["art3d/terrain/manifest.json", ...terrain.files]) {
  if (!/^art3d\/terrain\/(manifest\.json|tiles\.bin)$/.test(path)) throw Error("Terrain path escaped deployment base");
  await access("dist/" + path);
  if (!sw.includes("./" + path + "?v=" + terrain.version)) throw Error("Versioned native terrain source cache missing from offline cache");
}
await checkTerrainAssets("dist/art3d/terrain");
for (const path of ["art3d/voxel/manifest.json", ...voxels.files]) {
  if (!/^art3d\/voxel\/(manifest\.json|[a-z0-9-]+\.vox)$/.test(path)) throw Error("Voxel path escaped deployment base");
  await access("dist/" + path);
  if (!sw.includes("./" + path)) throw Error("Voxel source missing from offline cache");
}
console.log(
  `Verified ${paths.length} HTML asset URLs, ${art.files.length} artwork files, manifest and worker cache scope at ${base}`,
);
