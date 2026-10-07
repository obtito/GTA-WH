"""Render the saved scene and validate its portable asset dependencies."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector

out=Path(__file__).resolve().parent
scene=bpy.context.scene
ground=bpy.data.objects.get('Studio ground')
if ground and max(abs(v.co.x) for v in ground.data.vertices)<1000:
    for v in ground.data.vertices:v.co.x*=10;v.co.y*=10
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'黄鹤楼.blend'))
objects=[o for o in scene.objects if o.type=='MESH' and o.name!='Studio ground']
assert len(objects)>100, 'Missing tower geometry'
assert not list(bpy.data.libraries), 'Unexpected linked library'
assert all(math.isfinite(c) for o in objects for v in o.data.vertices for c in v.co)
assert all(len(o.data.vertices)>0 and len(o.data.polygons)>0 for o in objects)
external_images=[i.filepath for i in bpy.data.images if i.source=='FILE' and not i.packed_file]
assert not external_images, external_images
fonts=[f for f in bpy.data.fonts if f.filepath and f.filepath!='<builtin>']
assert all(f.packed_file for f in fonts), 'Unpacked font'
zmax=max(v.co.z for o in objects for v in o.data.vertices)
report={'valid':True,'blender_version':bpy.app.version_string,'mesh_objects':len(objects),'vertices':sum(len(o.data.vertices) for o in objects),'top_z_m':round(zmax,4),'linked_libraries':0,'unpacked_image_dependencies':external_images,'packed_fonts':len(fonts),'collections':sorted(c.name for c in bpy.data.collections)}
(out/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('VALIDATION_OK',json.dumps(report),flush=True)
if '--validate-only' not in __import__('sys').argv:
    scene.render.resolution_percentage=100
    scene.render.filepath=str(out/'preview.png')
    scene.cycles.samples=40
    bpy.ops.render.render(write_still=True)
    camera=scene.camera;camera.location=(0,-105,39)
    camera.rotation_euler=(Vector((0,0,26))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=66
    scene.render.resolution_x=1250;scene.render.resolution_y=1450;scene.render.filepath=str(out/'front.png');scene.cycles.samples=28
    bpy.ops.render.render(write_still=True)
    print('FINAL_RENDERS_DONE',flush=True)
