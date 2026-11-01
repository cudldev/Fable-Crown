"""Lead-only MCP recipe: preserve prior scene, review actual new valley source/VOX."""
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets/source/voxel/valley-onboarding/tent-v2'
HEIGHT = 2.0
previous = bpy.context.window.scene
for kind, job in [('mesh', BASE / 'trellis-01'), ('vox', BASE / 'vox-04')]:
    out = BASE / ('blender-' + kind)
    out.mkdir(exist_ok=True)
    editable = out / 'review.blend'
    if editable.exists():
        raise RuntimeError('Preserve prior editable art review: ' + str(editable))
    scene = bpy.data.scenes.new('Valley tent actual ' + kind)
    try:
        bpy.context.window.scene = scene
        if kind == 'mesh':
            data = np.load(job / 'raw-mesh.npz')
            vertices, faces, rgb = data['vertices'], data['faces'], np.clip(data['attributes'][:, :3], 0, 1)
            low, high = vertices.min(axis=0), vertices.max(axis=0)
            scale = HEIGHT / (high[2] - low[2])
            vertices = (vertices + np.array([-(low[0]+high[0])/2, -(low[1]+high[1])/2, -low[2]])) * scale
            vertices[:, 2] -= .125
            mesh = bpy.data.meshes.new('Unmodified learned tent shape at uniform 2m scale')
            mesh.from_pydata(vertices.tolist(), [], faces.tolist())
            mesh.update()
            obj = bpy.data.objects.new('Actual TRELLIS tent', mesh)
            scene.collection.objects.link(obj)
            attr = mesh.color_attributes.new(name='Generated_RGB', type='FLOAT_COLOR', domain='POINT')
            linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
            attr.data.foreach_set('color', np.column_stack((linear, np.ones(len(rgb)))).astype(np.float32).ravel())
            mat = bpy.data.materials.new('Actual generated RGB, no image projection')
            mat.use_nodes = True
            color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
            color.layer_name = attr.name
            shader = mat.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Roughness'].default_value = 1
            mat.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
            mesh.materials.append(mat)
        else:
            bpy.ops.import_scene.gltf(filepath=str(job / 'asset.glb'))
        meshes = [obj for obj in scene.objects if obj.type == 'MESH']
        points = [obj.matrix_world @ Vector(c) for obj in meshes for c in obj.bound_box]
        low = [min(c[i] for c in points) for i in range(3)]
        high = [max(c[i] for c in points) for i in range(3)]
        if abs(low[2]+.125) > 1e-5 or abs(high[2] - (HEIGHT-.125)) > 1e-5:
            raise RuntimeError('Actual review floor/height mismatch')
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 8
        scene.cycles.use_denoising = True
        scene.render.resolution_x = 800
        scene.render.resolution_y = 800
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.view_settings.view_transform = 'Standard'
        scene.world = bpy.data.worlds.new('Neutral tent review ambient')
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.8, .8, .8, 1)
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .8
        bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -.015))
        floor = bpy.context.object
        floor.name = 'Review-only ground'
        target = Vector((0, 0, .95))
        lamp_data = bpy.data.lights.new('Soft neutral key', 'AREA')
        lamp = bpy.data.objects.new('Soft neutral key', lamp_data)
        scene.collection.objects.link(lamp)
        lamp.location = (-3, -4, 6)
        lamp.rotation_euler = (target-lamp.location).to_track_quat('-Z', 'Y').to_euler()
        lamp_data.energy = 350
        lamp_data.size = 5
        camera_data = bpy.data.cameras.new('Common metric camera')
        camera = bpy.data.objects.new('Common metric camera', camera_data)
        scene.collection.objects.link(camera)
        camera_data.type = 'ORTHO'
        camera_data.ortho_scale = 4.7
        scene.camera = camera
        for name, position in [('iso', (5, -7, 5)), ('front', (0, -8, .95)), ('side', (8, 0, .95)), ('back', (0, 8, .95))]:
            camera.location = position
            camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = str(out / (name + '.png'))
            bpy.ops.render.render(write_still=True)
        restore = []
        for obj in meshes:
            for mat in obj.data.materials:
                if not mat or not mat.use_nodes:
                    continue
                nodes, links = mat.node_tree.nodes, mat.node_tree.links
                shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
                output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
                original = output.inputs['Surface'].links[0].from_socket
                emission = nodes.new('ShaderNodeEmission')
                base = shader.inputs['Base Color']
                if base.is_linked:
                    links.new(base.links[0].from_socket, emission.inputs['Color'])
                else:
                    emission.inputs['Color'].default_value = base.default_value
                links.new(emission.outputs[0], output.inputs['Surface'])
                restore.append((links, original, output))
        floor.hide_render = True
        camera.location = (5, -7, 5)
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(out / 'unlit.png')
        bpy.ops.render.render(write_still=True)
        for links, original, output in restore:
            links.new(original, output.inputs['Surface'])
        floor.hide_render = False
        bpy.data.libraries.write(str(editable), {scene}, fake_user=True, compress=True)
        (out / 'review.json').write_text(json.dumps({'actualGeometry': kind, 'boundsMin': low, 'boundsMax': high, 'height': HEIGHT, 'artApproved': False}, indent=2) + '\n')
    finally:
        bpy.context.window.scene = previous
print('VALLEY_TENT_REVIEW_SAVED', str(BASE))
