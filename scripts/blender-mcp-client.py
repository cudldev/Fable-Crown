"""Local MCP client for reproducible project authoring commands.

Uses the real upstream MCP for Blender server through the official Python MCP
client. The server forwards bpy work to the running upstream Blender addon.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import timedelta
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]
PROMPT = "Can you use Blender MCP and properly  start creating a 3D modeling workflows for characters, environments, props"

async def main():
    env = {**os.environ, "DISABLE_TELEMETRY": "true", "BLENDER_HOST": "127.0.0.1", "BLENDER_PORT": "9876", "APPDATA": str(ROOT / ".tools/mcp-data"), "PYTHONUNBUFFERED": "1"}
    server = StdioServerParameters(command=str(ROOT / ".tools/blender-mcp-env/Scripts/python.exe"), args=["-c", "import logging; logging.basicConfig(level=logging.CRITICAL); from blender_mcp.server import main; main()"], env=env)
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=180)) as session:
            initialized = await session.initialize()
            action = sys.argv[1] if len(sys.argv) > 1 else "info"
            if action == "tools":
                result = await session.list_tools()
                print(json.dumps({"server": initialized.serverInfo.model_dump(), "tools": [{"name": t.name, "inputSchema": t.inputSchema} for t in result.tools]}, indent=2))
                return
            if action == "info":
                name, arguments = "get_scene_info", {"user_prompt": PROMPT}
            elif action in ("run", "code"):
                if action == "run":
                    source = Path(sys.argv[2]).resolve()
                    source.relative_to(ROOT)
                    # Read only our reviewed repository source; Blender runs the same file.
                    text = source.read_text(encoding="utf-8")
                    prefix = "import sys\nfrom pathlib import Path\nsys.modules.pop('pipeline', None)\nsys.path.insert(0, " + repr(str(ROOT / "assets/source/3d")) + ")\n"
                    text = prefix + text
                    text = "__name__ = '__main__'\n__file__ = " + repr(str(source)) + "\n" + text
                else:
                    text = sys.stdin.read()
                name, arguments = "execute_blender_code", {"code": text, "user_prompt": PROMPT}
            else:
                raise ValueError("Expected info, tools, run <repo-script.py>, or code (stdin)")
            result = await session.call_tool(name, arguments)
            for content in result.content:
                if content.type == "text":
                    print("\n".join(line for line in content.text.splitlines() if " | INFO:" not in line and not line.startswith("INFO Draco")))
                    if content.text.startswith(("Error ", "Rejected by", "Traceback")) or "Traceback (most recent call last)" in content.text:
                        raise RuntimeError("Blender MCP command failed; see diagnostic above")
            if result.isError:
                raise RuntimeError("Blender MCP reported a tool error")

if __name__ == "__main__":
    asyncio.run(main())
