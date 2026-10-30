// Development-only Blender MCP authoring. Nothing here ships to the browser.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = (...parts) => path.join(root, ...parts);
const python = process.env.BLENDER_MCP_PYTHON || local(".tools", "blender-mcp-env", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");
const client = local("scripts", "blender-mcp-client.py");
const catalog = ["bank", "forge", "tree", "alden", "anvil", "crate", "lantern"];
const command = process.argv[2] || "status";
const args = process.argv.slice(3);
function runClient(args, input) {
  if (!existsSync(python)) throw Error("Install the pinned local Blender MCP environment; see docs/ART_PIPELINE.md.");
  const result = spawnSync(python, [client, ...args], { cwd: root, input, stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"], env: { ...process.env, DISABLE_TELEMETRY: "true" }, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error("Blender MCP authoring failed; generated assets have not passed the export gate.");
}
if (command === "start") {
  mkdirSync(local(".tools"), { recursive: true });
  const reachable = await new Promise(resolve => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 9876 });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
  if (reachable) { console.log("A local Blender bridge is already listening; use npm run art:status to verify MCP."); process.exit(0); }
  const blender = process.env.BLENDER_BIN || "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe";
  if (!existsSync(blender)) throw Error("Set BLENDER_BIN to your Blender executable.");
  const child = spawn(blender, ["--factory-startup", "--python", local("scripts", "blender-mcp-bootstrap.py")], {
    cwd: root, detached: true, windowsHide: true,
    stdio: ["ignore", openSync(local(".tools", "blender.log"), "a"), openSync(local(".tools", "blender-error.log"), "a")],
    env: { ...process.env, DISABLE_TELEMETRY: "true" },
  });
  child.unref(); console.log(`Started a separate Blender MCP session (PID ${child.pid}). Verify with npm run art:status.`);
} else if (command === "status") {
  runClient(["info"]);
} else if (command === "generate") {
  if (!args.includes("--replace-sources")) throw Error("Generation replaces recipe-owned .blend files. To keep manual edits, use art:export. To intentionally regenerate, append --replace-sources.");
  const category = args.find(arg => !arg.startsWith("--")) || "all";
  const recipes = { environment: "build_environment.py", character: "build_character.py", props: "build_props.py" };
  if (category !== "all" && !(category in recipes)) throw Error("Choose environment, character, props or all.");
  for (const [key, filename] of Object.entries(recipes)) if (category === "all" || category === key) runClient(["run", local("assets", "source", "3d", filename)]);
} else if (command === "export") {
  const ids = args.length ? args : catalog;
  if (ids.some(id => !catalog.includes(id))) throw Error("Unknown asset ID.");
  const sources = ids.map(id => local("assets", "source", "3d", `${id}.blend`));
  if (sources.some(file => !existsSync(file))) throw Error("An editable Blender source is missing.");
  for (const file of sources) {
    // Loading a .blend invalidates the current UI context until Blender returns
    // to its event loop. Export in a separate MCP request after that boundary.
    runClient(["code"], `import bpy\nbpy.ops.wm.open_mainfile(filepath=${JSON.stringify(file)})`);
    runClient(["code"], ["import sys", `sys.path.insert(0, ${JSON.stringify(local("assets", "source", "3d"))})`, "sys.modules.pop('pipeline', None)", "import pipeline", "pipeline.export_current()"].join("\n"));
  }
} else {
  throw Error("Use start, status, generate or export.");
}
if (command === "generate" || command === "export") {
  const checked = spawnSync(process.execPath, [local("scripts", "check-art3d.mjs"), "--write"], { cwd: root, stdio: "inherit", windowsHide: true });
  if (checked.status !== 0) process.exit(checked.status || 1);
}
