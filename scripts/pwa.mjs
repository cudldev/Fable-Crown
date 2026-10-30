import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const manifest = JSON.parse(await readFile("dist/art/manifest.json", "utf8"));
const coreArt = manifest.files;
const art3d = JSON.parse(await readFile("dist/art3d/manifest.json", "utf8"));
const files = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./crown.svg",
  "./crown-192.png",
  "./crown-512.png",
  "./art/manifest.json",
  "./art3d/manifest.json",
  ...art3d.files.map((file) => "./" + file),
  ...(await readdir("dist/assets")).map((f) => "./assets/" + f),
];
const hash = createHash("sha256")
  .update(await readFile("dist/index.html"))
  .update(manifest.version)
  .update(art3d.version)
  .digest("hex")
  .slice(0, 12);
await writeFile(
  "dist/sw.js",
  `const APP='fable-v3-${hash}',ART='fable-art-${manifest.version}',FILES=${JSON.stringify(files)},CORE=${JSON.stringify(coreArt.map((f) => "./" + f))};
self.addEventListener('install',e=>e.waitUntil(Promise.all([caches.open(APP).then(c=>c.addAll(FILES)),caches.open(ART).then(c=>c.addAll(CORE))]).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fable-')&&k!==APP&&k!==ART).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==location.origin)return;const art=url.pathname.startsWith(new URL('./art/',self.location.href).pathname)&&!url.pathname.endsWith('manifest.json');if(art){e.respondWith(caches.open(ART).then(async c=>{const hit=await c.match(e.request,{ignoreVary:true});if(hit)return hit;const response=await fetch(e.request);if(response.ok)await c.put(e.request,response.clone());return response;}));}else e.respondWith(caches.open(APP).then(async c=>{const hit=await c.match(e.request,{ignoreVary:true});if(hit)return hit;if(e.request.mode==='navigate')return fetch(e.request).catch(()=>c.match('./index.html'));return fetch(e.request);}));});`,
);
console.log(
  "PWA: tile RPG shell and generated artwork preloaded for offline travel.",
);
