from pathlib import Path
import bpy, re, json, math, time
from mathutils import Vector
ROOT=Path(__file__).resolve().parent

def aim(ob,p):ob.rotation_euler=(Vector(p)-ob.location).to_track_quat('-Z','Y').to_euler()

def semantic(ob):
    n=ob.name
    if n.startswith('Floor_'):return n[:8].lower()
    if re.match(r'\d\d_Roof',n):return 'roof_'+n[:2]
    if n.startswith('00_Base'):return 'base'
    if n.startswith(('06_Crown','Crown')):return 'crown'
    if 'Plaque' in n or '匾额' in n:return 'plaque'
    return 'detail'

def setup_studio():
    scene=bpy.context.scene
    col=bpy.data.collections.get('90_Studio')
    if col:
        for ob in list(col.objects):bpy.data.objects.remove(ob,do_unlink=True)
        bpy.data.collections.remove(col)
    col=bpy.data.collections.new('90_Studio');scene.collection.children.link(col)
    mesh=bpy.data.meshes.new('Studio plane');mesh.from_pydata([(-2000,-2000,-.02),(2000,-2000,-.02),(2000,2000,-.02),(-2000,2000,-.02)],[],[(0,1,2,3)])
    floor=bpy.data.objects.new('Studio ground',mesh);col.objects.link(floor)
    mat=bpy.data.materials.new('Studio neutral');mat.diffuse_color=(.22,.26,.27,1);mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.22,.26,.27,1)
    mesh.materials.append(mat);floor.hide_set(True)
    world=bpy.data.worlds.new('Daylight review');world.use_nodes=True;scene.world=world
    world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.72,.8,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.65
    for name,typ,loc,power,color,size in [('Sun','SUN',(-45,-70,100),1.9,(1,.91,.8),0),('Fill','AREA',(55,-50,65),7500,(.83,.91,1),40),('Rim','AREA',(-30,40,80),8500,(1,.85,.65),32)]:
        data=bpy.data.lights.new(name,typ);data.energy=power;data.color=color
        if typ=='AREA':data.shape='DISK';data.size=size
        else:data.angle=.18
        ob=bpy.data.objects.new(name,data);col.objects.link(ob);ob.location=loc;aim(ob,(0,0,23))
    data=bpy.data.cameras.new('Review camera');camera=bpy.data.objects.new('Review camera',data);col.objects.link(camera)
    camera.location=(69,-110,66);aim(camera,(0,0,26));data.type='ORTHO';data.ortho_scale=75;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
    scene.render.resolution_x=1200;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.unit_settings.system='METRIC'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                s=area.spaces.active;s.clip_end=1000;s.region_3d.view_distance=92;s.region_3d.view_location=(0,0,25);s.region_3d.view_rotation=camera.rotation_euler.to_quaternion();s.shading.type='MATERIAL'

def export_asset(path):
    bpy.ops.object.select_all(action='DESELECT');copies=[]
    candidates=[o for o in bpy.context.scene.objects if o.type in ('MESH','FONT') and o.name!='Studio ground']
    for ob in candidates:
        ob['semantic_group']=semantic(ob)
        if ob.type=='FONT':
            dupe=ob.copy();dupe.data=ob.data.copy();bpy.context.scene.collection.objects.link(dupe)
            bpy.context.view_layer.objects.active=dupe;dupe.select_set(True);bpy.ops.object.convert(target='MESH');dupe.select_set(False);copies.append(dupe)
    for ob in candidates:
        if ob.type=='MESH':ob.select_set(True)
    for ob in copies:ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
    for ob in copies:bpy.data.objects.remove(ob,do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')

def render(path,view='hero',percent=70,samples=16):
    scene=bpy.context.scene;cam=scene.camera
    positions={'hero':(69,-110,66),'front':(0,-120,37),'side':(120,0,37),'rear':(0,120,37),'top':(55,-70,110),'detail':(35,-58,62)}
    target=(0,0,26) if view!='detail' else (0,0,41)
    cam.location=positions[view];aim(cam,target);cam.data.ortho_scale=75 if view!='detail' else 28
    scene.render.resolution_percentage=percent;scene.cycles.samples=samples;scene.render.filepath=str(path)
    start=time.monotonic();bpy.ops.render.render(write_still=True)
    return round(time.monotonic()-start,3)

def validate(stage):
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='Studio ground']
    invalid=[o.name for o in meshes if any(not math.isfinite(c) for v in o.data.vertices for c in v.co)]
    assert not invalid,invalid
    assert not bpy.data.libraries
    images=[i.filepath for i in bpy.data.images if i.source=='FILE' and not i.packed_file]
    assert not images,images
    stat={'stage':stage,'mesh_objects':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'faces':sum(len(o.data.polygons) for o in meshes),'unpacked_images':images,'linked_libraries':0,'packed_fonts':sum(bool(f.packed_file) for f in bpy.data.fonts),'geometry_finite':True,'top_z':max(v.co.z for o in meshes for v in o.data.vertices)}
    (ROOT/'logs'/f'{stage}_validation.json').write_text(json.dumps(stat,indent=2))
    print('VALIDATED',json.dumps(stat),flush=True);return stat
