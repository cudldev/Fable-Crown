"""Read-only Blender/MCP audit of the loaded ink character's source density.

Run via scripts/blender-mcp-client.py. Does not save or regenerate the mesh.
Counts identify inspection priorities; they do not certify good edge flow.
"""
import bpy
import json
from collections import defaultdict
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs/art-audit/ink-study/topology-audit.json'

def region(name):
    lower = name.lower()
    if lower.startswith('ink-'):
        return 'ink strokes'
    if any(word in lower for word in ('almond', 'iris', 'pupil')):
        return 'eyes'
    if lower.startswith('hair'):
        return 'hair'
    if any(lower.startswith(word) for word in ('head', 'ear', 'nose', 'neck')):
        return 'head, neck and ears'
    if lower.startswith(('leftarm', 'rightarm')):
        return 'arms and hands'
    if lower.startswith(('leftleg', 'rightleg')):
        return 'legs and boots'
    if lower.startswith('cape'):
        return 'cape and clasps'
    return 'torso, collar and accessories'

def main():
    source = ROOT / 'assets/source/3d/alden-ink.blend'
    if Path(bpy.data.filepath).resolve() != source.resolve() or bpy.data.is_dirty:
        raise RuntimeError('Audit requires the saved, unmodified alden-ink.blend; save intentional changes or reload first.')
    root = bpy.data.objects.get('asset-alden-ink')
    if root is None or bpy.context.scene.get('fc_asset_id') != 'alden-ink':
        raise RuntimeError('Load the saved alden-ink.blend first; audit never loads or edits a scene.')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    rows = []
    groups = defaultdict(lambda: dict(objects=0, source_vertices=0, source_quads=0,
                                     source_triangles=0, source_ngons=0, evaluated_triangles=0))
    for obj in root.children_recursive:
        if obj.type != 'MESH':
            continue
        data, matrix = obj.data, obj.matrix_world
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        evaluated_triangles = len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
        lengths = sorted((matrix.to_3x3() @ (data.vertices[a].co - data.vertices[b].co)).length
                         for a, b in (edge.vertices for edge in data.edges))
        adjacent = [set() for _ in data.vertices]
        edge_faces = defaultdict(int)
        for edge in data.edges:
            a, b = edge.vertices
            adjacent[a].add(b)
            adjacent[b].add(a)
        for face in data.polygons:
            for a, b in face.edge_keys:
                edge_faces[tuple(sorted((a, b)))] += 1
        unseen, islands = set(range(len(data.vertices))), 0
        while unseen:
            islands += 1
            stack = [unseen.pop()]
            while stack:
                for neighbor in adjacent[stack.pop()]:
                    if neighbor in unseen:
                        unseen.remove(neighbor)
                        stack.append(neighbor)
        row = dict(name=obj.name, region=region(obj.name), source_vertices=len(data.vertices),
                   source_edges=len(data.edges), source_quads=sum(len(p.vertices) == 4 for p in data.polygons),
                   source_triangles=sum(len(p.vertices) == 3 for p in data.polygons),
                   source_ngons=sum(len(p.vertices) > 4 for p in data.polygons),
                   evaluated_triangles=evaluated_triangles, connected_islands=islands,
                   boundary_edges=sum(value == 1 for value in edge_faces.values()),
                   edges_over_two_faces=sum(value > 2 for value in edge_faces.values()),
                   loose_vertices=sum(not neighbors for neighbors in adjacent),
                   edge_length_metres=dict(min=lengths[0], median=median(lengths), max=lengths[-1]) if lengths else None,
                   armature_modifiers=sum(m.type == 'ARMATURE' for m in obj.modifiers),
                   vertex_groups=len(obj.vertex_groups))
        rows.append(row)
        group = groups[row['region']]
        group['objects'] += 1
        for key in group:
            if key != 'objects':
                group[key] += row[key]
    result = dict(source='assets/source/3d/alden-ink.blend', method='saved source meshes; evaluated modifiers for triangles; all source edges in local metre scale transformed to world',
                  limitations='No camera-visible density, UV stretch, self-intersection or deformation quality measurement. Open clothing boundaries are not automatically defects.',
                  armatures=sum(obj.type == 'ARMATURE' for obj in root.children_recursive),
                  regions=dict(groups), objects=rows)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: result[key] for key in ('source', 'armatures', 'regions')}, indent=2))

if __name__ == '__main__':
    main()
