"""Lead-owned MCP review of actual recipe exports; preserve the active scene."""
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
JOBS = ('barrel-04',)
previous = bpy.context.window.scene


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = 1
    return mat


def box(name, location, scale, color):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material(name, color))


try:
    for job in JOBS:
        folder = ROOT/'assets/explorations/voxel/recipe-system-v1'/job
        source = folder/'review.blend'
        if source.exists(): raise RuntimeError('Preserve existing editable review '+str(source))
        report = json.loads((folder/'report.json').read_text())
        low, high = report['occupied_bounds_units']['min'], report['occupied_bounds_units']['max']
        height = high[2]
        scene = bpy.data.scenes.new('Voxel recipe review '+job)
        bpy.context.window.scene = scene
        bpy.ops.import_scene.gltf(filepath=str(folder/'asset.glb'))
        meshes = [o for o in scene.objects if o.type == 'MESH']
        points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
        imported_low = [min(p[i] for p in points) for i in range(3)]
        imported_high = [max(p[i] for p in points) for i in range(3)]
        if max(abs(a-b) for a,b in zip(imported_low+imported_high,low+high)) > 1e-5:
            raise RuntimeError('Actual Blender import bounds disagree with recipe '+job)
        ground = max(high[0]-low[0],high[1]-low[1])*1.15
        box('Review only grass tile', (0,0,-.01), (ground,ground,.02), (.30,.37,.14))
        box('Review only backdrop', (0,0,-.08), (200,200,.1), (.72,.68,.57))
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 16
        scene.cycles.use_denoising = True
        scene.render.resolution_x, scene.render.resolution_y = 900, 900
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.view_settings.view_transform = 'AgX'
        scene.world = bpy.data.worlds.new('Soft recipe review world')
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
        focus = Vector((0,0,height*.48))
        data = bpy.data.lights.new('Recipe key', 'AREA')
        lamp = bpy.data.objects.new('Recipe key', data)
        scene.collection.objects.link(lamp)
        lamp.location = (-height,height*-1.3,height*2)
        lamp.rotation_euler = (focus-lamp.location).to_track_quat('-Z','Y').to_euler()
        data.energy, data.size = 45*height**2, height
        data = bpy.data.cameras.new('Orthographic recipe camera')
        camera = bpy.data.objects.new('Orthographic recipe camera', data)
        scene.collection.objects.link(camera)
        camera.location = (-height*1.5,-height*2,height*1.5)
        camera.rotation_euler = (focus-camera.location).to_track_quat('-Z','Y').to_euler()
        data.type, data.ortho_scale = 'ORTHO', height*1.45
        scene.camera = camera
        scene.render.filepath = str(folder/'blender-preview.png')
        bpy.ops.render.render(write_still=True)
        scene['status'] = 'Actual exported GLB; presentation ground separate; art acceptance pending'
        bpy.data.libraries.write(str(source), {scene}, fake_user=True, compress=True)
        (folder/'blender-review.json').write_text(json.dumps({'bounds_min':imported_low,'bounds_max':imported_high,'source':'review.blend','actual_export_reviewed':True,'art_approved':False},indent=2)+'\n')
        print('RECIPE_REVIEW_SAVED', job)
finally:
    bpy.context.window.scene = previous
