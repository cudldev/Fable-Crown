const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require(process.env.FABLE_SHARP_MODULE || "sharp");
async function main() {
  const [name, source, version] = process.argv.slice(2);
  if (!name || !source) throw Error("name and source required");
  if (version && !/^v\d+$/.test(version)) throw Error("Invalid asset version");
  const originals = version
    ? path.join("assets/generated", version)
    : "assets/generated";
  await fs.mkdir("public/art", { recursive: true });
  await fs.mkdir(originals, { recursive: true });
  await fs.copyFile(source, path.join(originals, name + ".png"));
  const meta = await sharp(source).metadata();
  if (version && meta.hasAlpha) {
    const { data, info } = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let left = info.width,
      top = info.height,
      right = 0,
      bottom = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * 4 + 3] > 64) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    let weight = 0,
      weightedX = 0;
    for (let y = Math.floor(bottom - (bottom - top) * 0.08); y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const a = data[(y * info.width + x) * 4 + 3];
        if (a > 64) {
          weight += a;
          weightedX += x * a;
        }
      }
    const frame = {
      width: info.width,
      height: info.height,
      boundsWidth: right - left + 1,
      boundsHeight: bottom - top + 1,
      pivotX: Math.round(weightedX / weight),
      pivotY: bottom,
    };
    const framePath = path.join(originals, "frames.json");
    let frames = {};
    try {
      frames = JSON.parse(await fs.readFile(framePath, "utf8"));
    } catch {}
    frames[name] = frame;
    await fs.writeFile(framePath, JSON.stringify(frames, null, 2) + "\n");
    const versions = (await fs.readdir("assets/generated"))
      .filter((name) => /^v\d+$/.test(name))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    const mergedFrames = {};
    for (const assetVersion of versions) {
      try {
        Object.assign(
          mergedFrames,
          JSON.parse(
            await fs.readFile(
              path.join("assets/generated", assetVersion, "frames.json"),
              "utf8",
            ),
          ),
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await fs.writeFile(
      "src/art-frames.ts",
      `// Generated alpha bounds and foot anchors; source pixels are unchanged.\nexport const artFrames: Record<string,{width:number;height:number;boundsWidth:number;boundsHeight:number;pivotX:number;pivotY:number}> = ${JSON.stringify(mergedFrames, null, 2)};\n`,
    );
  }
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
