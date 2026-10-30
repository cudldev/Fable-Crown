"""Fable Crown editable asset sources. Run with Blender's bundled Python.

Blender authoring: Z up, front -Y. glTF export: Y up, front +Z.
One Blender metre = one game tile. Generated .blend files remain editable.
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/source/3d"
OUTPUT = ROOT / "public/art3d"
PALETTE = {
    "plaster": "b7ab8c", "plaster_light": "c7bda1", "stone": "7e8787",
    "stone_light": "a3aaa1", "stone_dark": "515d60", "wood": "775c40",
    "wood_light": "a68a5d", "wood_dark": "49392d", "roof": "885343",
    "roof_light": "a56a50", "roof_dark": "643f36", "slate": "4e5c68",
    "leaf": "5f704c", "leaf_light": "7b8958", "leaf_dark": "3e5946",
    "bark": "67513a", "blue": "365c88", "blue_light": "537ca1",
    "blue_dark": "263e60", "gold": "b99b59", "gold_light": "d0b879",
    "linen": "c7bda4", "linen_shadow": "9d9683", "leather": "68503a",
    "leather_dark": "40392e", "skin": "c59c77", "skin_shadow": "a27858",
    "hair": "65452f", "hair_light": "896442", "hair_dark": "403329",
    "iron": "59656b", "iron_light": "879297", "black": "252e32",
    "ember": "e18739", "flame": "e9b45c", "window": "c3a15f",
    "moss": "687653", "copper": "9e7755", "soil": "8d8067",
    "cream": "d0c7ae", "water": "557985", "red": "955d4a",
}
SWATCHES = list(PALETTE)
ATLAS_SIZE, CELL, TEXELS_PER_UNIT = 512, 64, 16

def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    try:
        bpy.context.scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1

def atlas_material():
    found = bpy.data.materials.get("FC_PixelAtlas")
    if found:
        return found
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image = bpy.data.images.new("FC_PixelAtlas", width=ATLAS_SIZE, height=ATLAS_SIZE, alpha=False)
    pixels = [0.0] * (ATLAS_SIZE * ATLAS_SIZE * 4)
    for index, name in enumerate(SWATCHES):
        color = tuple(int(PALETTE[name][i:i+2], 16) / 255 for i in (0, 2, 4))
        ox, oy = index % 8 * CELL, index // 8 * CELL
        seed = int(hashlib.sha256(name.encode()).hexdigest()[:8], 16)
        for y in range(CELL):
            for x in range(CELL):
                noise = ((x // 2 * 17 + y // 2 * 31 + seed) % 113)
                factor = .96 if noise < 8 else 1.035 if noise > 108 else 1
                if "wood" in name or name in ("bark", "leather"):
                    factor = .84 if x % 16 == 0 else .93 if (x + y // 8) % 19 == 0 else factor
                elif name.startswith("roof") or name == "slate":
                    factor = .83 if y % 16 == 0 else .94 if (x + (y // 16 % 2) * 16) % 32 == 0 else factor
                elif name.startswith("stone") or name == "plaster":
                    factor = .9 if y % 24 == 0 and name != "plaster" else factor
                elif name.startswith("leaf"):
                    factor = .92 if (x // 4 + y // 4 * 3) % 11 < 2 else factor
                p = ((oy + y) * ATLAS_SIZE + ox + x) * 4
                pixels[p:p+4] = [min(1, channel * factor) for channel in color] + [1]
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(OUTPUT / "palette.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    material = bpy.data.materials.new("FC_PixelAtlas")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1
    bsdf.inputs["Metallic"].default_value = 0
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Closest"
    material.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    return material

def empty(name, loc=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    return obj

def uv(obj, swatch):
    """Planar pixel-scale UVs into a shared palette cell; avoids stretched noise."""
    index = SWATCHES.index(swatch)
    layer = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for poly in obj.data.polygons:
        normal = poly.normal
        axes = (0, 1) if abs(normal.z) > .7 else (0, 2) if abs(normal.y) > .5 else (1, 2)
        points = [obj.data.vertices[obj.data.loops[i].vertex_index].co for i in poly.loop_indices]
        minimum = [min(p[a] for p in points) for a in axes]
        for loop_index, point in zip(poly.loop_indices, points):
            coords = [min(CELL-2, max(0, (point[axis] - minimum[n]) * TEXELS_PER_UNIT)) + 1 for n, axis in enumerate(axes)]
            layer.data[loop_index].uv = ((index % 8 * CELL + coords[0]) / ATLAS_SIZE, (index // 8 * CELL + coords[1]) / ATLAS_SIZE)
    obj.data.materials.clear()
    obj.data.materials.append(atlas_material())
    return obj

def mesh(name, vertices, faces, swatch, parent=None, loc=(0, 0, 0)):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    uv(obj, swatch)
    return obj

def cube(name, loc, size, swatch, parent=None, bevel=0):
    x, y, z = [s / 2 for s in size]
    vertices = [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    faces = [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]
    obj = mesh(name, vertices, faces, swatch, parent, loc)
    if bevel:
        modifier = obj.modifiers.new("Small silhouette bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
    return obj

def cylinder(name, loc, radius, depth, swatch, parent=None, vertices=8, top_radius=None):
    rt = radius if top_radius is None else top_radius
    points = [(math.cos(i*math.tau/vertices)*r, math.sin(i*math.tau/vertices)*r, z) for r,z in ((radius,-depth/2),(rt,depth/2)) for i in range(vertices)]
    faces = [tuple(reversed(range(vertices))), tuple(range(vertices,vertices*2))]
    faces += [(i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices) for i in range(vertices)]
    return mesh(name, points, faces, swatch, parent, loc)

def beam(name, start, end, thickness, swatch, parent=None):
    direction = Vector(end)-Vector(start)
    obj = cube(name, (Vector(start)+Vector(end))/2, (thickness,thickness,direction.length), swatch, parent)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj

def finish(asset_id, root):
    """Save editable source FIRST, then export selected asset hierarchy as GLB."""
    bpy.context.scene["fc_asset_id"] = asset_id
    bpy.context.scene["fc_root"] = root.name
    bpy.context.scene["fc_front"] = "-Y (glTF +Z)"
    bpy.context.scene["fc_texels_per_unit"] = TEXELS_PER_UNIT
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    SOURCE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (asset_id + ".blend")))
    export_current()

def export_current():
    scene = bpy.context.scene
    asset_id = scene.get("fc_asset_id")
    if not asset_id:
        raise RuntimeError("Source needs fc_asset_id scene property")
    root = bpy.data.objects.get(scene.get("fc_root", ""))
    if root is None:
        raise RuntimeError("Source root missing")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (asset_id + ".glb")), export_format="GLB", use_selection=True, export_yup=True, export_texcoords=True, export_normals=True, export_materials="EXPORT", export_extras=True, export_animations=False)
    print("FC_ASSET_EXPORTED", asset_id)

if __name__ == "__main__":
    export_current()
