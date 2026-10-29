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
if (names.filter((n) => /^region-\d.webp$/.test(n)).length !== 9)
  throw Error("All nine authored regions are required.");
await writeFile(
  "public/art/manifest.json",
  JSON.stringify(
    {
      version: hash.digest("hex").slice(0, 12),
      bytes,
      files: names.map((n) => "art/" + n),
    },
    null,
    2,
  ),
);
console.log(
  `Prepared ${names.length} generated runtime assets (${(bytes / 1048576).toFixed(1)} MiB).`,
);
