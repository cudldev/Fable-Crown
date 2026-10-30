import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const art3d = JSON.parse(await readFile("dist/art3d/manifest.json", "utf8"));
const voxels = JSON.parse(await readFile("dist/art3d/voxel/manifest.json", "utf8"));
const terrain = JSON.parse(await readFile("dist/art3d/terrain/manifest.json", "utf8"));
const coreArt = [
  "art3d/manifest.json", ...art3d.files,
  "art3d/voxel/manifest.json", ...voxels.files,
  "art3d/terrain/manifest.json?v=" + terrain.version,
  ...terrain.files.map(file => file + "?v=" + terrain.version),
];
const hash = createHash("sha256").update(await readFile("dist/index.html"));
let bytes = 0;
for (const file of coreArt) {
  const buffer = await readFile("dist/" + file.split("?")[0]);
  hash.update(file).update(buffer); bytes += buffer.length;
}
const version = hash.digest("hex").slice(0, 12);
await writeFile("dist/world-assets.json", JSON.stringify({ version, bytes, files: coreArt }, null, 2) + "\n");
const files = ["./", "./index.html", "./manifest.webmanifest", "./crown.svg", "./crown-192.png", "./crown-512.png", "./world-assets.json",
  ...(await readdir("dist/assets")).map(file => "./assets/" + file)];
await writeFile("dist/sw.js", `const APP='fable-v3-${version}',ART='fable-art-${version}',FILES=${JSON.stringify(files)},CORE=${JSON.stringify(coreArt.map(file => "./" + file))};
self.addEventListener('install',e=>e.waitUntil(Promise.all([caches.open(APP).then(c=>c.addAll(FILES)),caches.open(ART).then(c=>c.addAll(CORE))]).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fable-')&&k!==APP&&k!==ART).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==location.origin)return;const art=url.pathname.startsWith(new URL('./art3d/',self.location.href).pathname);e.respondWith(caches.open(art?ART:APP).then(async c=>{const hit=await c.match(e.request,{ignoreVary:true});if(hit)return hit;if(e.request.mode==='navigate')return fetch(e.request).catch(()=>c.match('./index.html'));const response=await fetch(e.request);if(art&&response.ok)await c.put(e.request,response.clone());return response;}));});`);
console.log(`PWA: voxel world cached offline (${(bytes / 1048576).toFixed(1)} MiB).`);
