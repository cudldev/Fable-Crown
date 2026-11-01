"""Find the already-installed local art runtime from a main checkout or worktree."""
from pathlib import Path

def authoring_root(project_root: Path) -> Path:
    for candidate in (project_root,*project_root.parents):
        if (candidate/'.tools/trellis-wsl-env').is_dir() and (candidate/'tools/trellis-vox/run_trellis.py').is_file():
            return candidate
    raise RuntimeError('Established local TRELLIS runtime not found; never replace with a paid service')
