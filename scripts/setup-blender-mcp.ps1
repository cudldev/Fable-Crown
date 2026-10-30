param(
  [string]$BlenderPython = 'C:/Program Files/Blender Foundation/Blender 5.1/5.1/python/bin/python.exe'
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $BlenderPython)) { throw 'Pass -BlenderPython with your Blender bundled Python executable.' }
$taskTools = Join-Path $taskRoot '.tools'
$taskUv = Join-Path $taskTools 'uv/bin/uv.exe'
if (-not (Test-Path -LiteralPath $taskUv)) {
  New-Item -ItemType Directory -Force (Join-Path $taskTools 'uv') | Out-Null
  $taskZip = Join-Path $taskTools 'uv/uv.zip'
  Invoke-WebRequest -Uri 'https://github.com/astral-sh/uv/releases/download/0.13.6/uv-x86_64-pc-windows-msvc.zip' -OutFile $taskZip
  Expand-Archive -LiteralPath $taskZip -DestinationPath (Join-Path $taskTools 'uv/bin') -Force
}
$env:UV_CACHE_DIR = Join-Path $taskTools 'uv-cache'
$taskEnvironment = Join-Path $taskTools 'blender-mcp-env'
& $taskUv venv --python $BlenderPython $taskEnvironment --allow-existing
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the local art environment.' }
& $taskUv --system-certs pip sync --python (Join-Path $taskEnvironment 'Scripts/python.exe') (Join-Path $PSScriptRoot 'art-tools-requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install the pinned Blender MCP tools.' }
Write-Output 'Blender MCP tools installed locally. Run npm run art:start, then npm run art:status.'
