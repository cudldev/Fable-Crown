import { readFile, access } from "node:fs/promises";
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
console.log(
  `Verified ${paths.length} HTML asset URLs, manifest and worker cache scope at ${base}`,
);
