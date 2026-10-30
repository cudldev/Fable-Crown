"""Start the installed upstream Blender MCP addon for this project session only.

No user startup scene/preferences are overwritten. No remote asset services or
addon update timers are registered. The upstream server listens on loopback.
"""
import importlib.util
import os
import sys
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
os.environ["DISABLE_TELEMETRY"] = "true"
addon_path = ROOT / ".tools/blender-mcp-env/Lib/site-packages/blender_mcp/bundled/addon.py"
if not addon_path.is_file():
    raise RuntimeError("Install the pinned project-local Blender MCP environment first")
spec = importlib.util.spec_from_file_location("fable_blender_mcp_addon", addon_path)
addon = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = addon
spec.loader.exec_module(addon)
# The addon dispatcher expects these settings even when integrations are off.
# Register only the disabled switches, not its update/network/UI setup hooks.
for integration in ("polyhaven", "hyper3d", "sketchfab", "polypizza", "hunyuan3d", "tripo", "meshy"):
    setattr(bpy.types.Scene, "blendermcp_use_" + integration, bpy.props.BoolProperty(default=False))
server = addon.BlenderMCPServer(host="127.0.0.1", port=9876)
bpy.types.blendermcp_server = server
server.start()
if not server.running:
    raise RuntimeError("Blender MCP requires a GUI event loop; omit --background")
print("FABLE_BLENDER_MCP_READY", server.host, server.port, flush=True)
