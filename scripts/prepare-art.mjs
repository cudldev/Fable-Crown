import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
const names = (await readdir("public/art"))
  .filter((f) => f.endsWith(".webp"))
  .sort();
const hash = createHash("sha256");
let bytes = 0;
for (const name of names) {
  const data = await readFile("public/art/" + name);
  hash.update(name).update(data);
  bytes += (await stat("public/art/" + name)).size;
}
for (const name of [
  "tile-grass",
  "tile-dirt",
  "tile-stone",
  "tile-water",
  "prince",
  "enemy-boar",
  "enemy-rock-mite",
  "enemy-bandit",
  "actor-fisher",
  "anvil",
  "cooking-range",
])
  if (!names.includes(name + ".webp"))
    throw Error(`Missing tile RPG artwork: ${name}`);
const output = JSON.stringify(
  {
    version: hash.digest("hex").slice(0, 12),
    bytes,
    files: names.map((n) => "art/" + n),
  },
  null,
  2,
);
// Repeated root/subpath builds share the same artwork. Avoid rewriting identical
// files while Windows scanners or preview tools may still hold a read handle.
let current = "";
try {
  current = await readFile("public/art/manifest.json", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (current !== output) await writeFile("public/art/manifest.json", output);
console.log(
  `Prepared ${names.length} generated runtime assets (${(bytes / 1048576).toFixed(1)} MiB).`,
);
