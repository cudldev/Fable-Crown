const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require(process.env.FABLE_SHARP_MODULE || "sharp");
async function main() {
  const [name, source] = process.argv.slice(2);
  if (!name || !source) throw Error("name and source required");
  await fs.mkdir("public/art", { recursive: true });
  await fs.mkdir("assets/generated", { recursive: true });
  await fs.copyFile(source, path.join("assets/generated", name + ".png"));
  const meta = await sharp(source).metadata();
  await sharp(source)
    .webp({ quality: name.startsWith("region") ? 85 : 90 })
    .toFile(path.join("public/art", name + ".webp"));
  console.log(
    name,
    meta.width,
    meta.height,
    meta.hasAlpha ? "alpha" : "opaque",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
