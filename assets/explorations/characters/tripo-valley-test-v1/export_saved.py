"""Export the current saved/edited trial without rebuilding bones, weights or clips.

Optional EXPORT_PATH is supplied by the lead through live Blender MCP.
Default output is a new sibling file, never the current runtime asset.
"""
import bpy
from pathlib import Path
OUT=Path(__file__).resolve().parent
target=Path(globals().get('EXPORT_PATH',OUT/'character-manual-export.glb')).resolve()
target.relative_to(OUT.resolve())
if target.exists():raise RuntimeError('Use an unused versioned output to preserve previous exports.')
scene=bpy.context.scene
arm=next(o for o in scene.objects if o.type=='ARMATURE' and o.get('rig_revision'))
mesh=next(o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' and m.object==arm for m in o.modifiers))
tracks=[(track,track.mute) for track in arm.animation_data.nla_tracks]
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=arm
try:
    for track,_ in tracks:track.mute=False
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,use_active_scene=True,
        export_animations=True,export_animation_mode='NLA_TRACKS',export_anim_slide_to_zero=True,
        export_skins=True,export_def_bones=True,export_force_sampling=True,export_frame_range=False,
        export_materials='EXPORT',export_yup=True,export_extras=True,export_morph=False)
finally:
    for track,mute in tracks:track.mute=mute
print(str(target))
