"""Original procedural Yellow Crane Tower. Run with Blender 4.5+ --background --python.
Reads only the sibling facades.py and an OS font; no pre-existing project assets.
"""
from pathlib import Path
import sys, math, json, collections, argparse
import bpy
from mathutils import Vector, Quaternion

OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(OUT))
from facades import build_floor
from crown import build_crown
PI=math.pi

class Geometry:
    def __init__(self): self.parts={}
    def poly(self,name,vertices,faces,mat):
        vs, fs=self.parts.setdefault((name,mat),([],[]))
        off=len(vs); vs.extend(tuple(v) for v in vertices)
        fs.extend(tuple(i+off for i in f) for f in faces)
    def box(self,name,center,size,mat,rot=0):
        c,s=math.cos(rot),math.sin(rot); x,y,z=size
        vs=[]
        for a,b,d in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            a*=x/2;b*=y/2;d*=z/2
            vs.append((center[0]+c*a-s*b,center[1]+s*a+c*b,center[2]+d))
        self.poly(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    def beam(self,name,a,b,width,depth,mat):
        a,b=Vector(a),Vector(b); direction=(b-a).normalized()
        helper=Vector((0,0,1)) if abs(direction.z)<.95 else Vector((1,0,0))
        u=direction.cross(helper).normalized()*width/2;v=direction.cross(u).normalized()*depth/2
        vs=[p+u*i+v*j for p in [a,b] for i,j in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        self.poly(name,vs,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    def tube(self,name,points,radius,mat,sides=8):
        if len(points)<2:return
        ps=list(map(Vector,points));vs=[];fs=[]
        for i,p in enumerate(ps):
            d=(ps[min(i+1,len(ps)-1)]-ps[max(i-1,0)]).normalized()
            h=Vector((0,0,1)) if abs(d.z)<.95 else Vector((1,0,0))
            u=d.cross(h).normalized();v=d.cross(u).normalized()
            for j in range(sides):
                a=2*PI*j/sides;vs.append(p+radius*(u*math.cos(a)+v*math.sin(a)))
        for i in range(len(ps)-1):
            for j in range(sides):
                k=(j+1)%sides;a=i*sides;b=(i+1)*sides
                fs.append((a+j,a+k,b+k,b+j))
        fs.extend([tuple(reversed(range(sides))),tuple((len(ps)-1)*sides+j for j in range(sides))])
        self.poly(name,vs,fs,mat)
    def cylinder(self,name,center,radius,depth,mat,sides=12):
        x,y,z=center;self.tube(name,[(x,y,z-depth/2),(x,y,z+depth/2)],radius,mat,sides)
    def flush(self,materials):
        result=[]
        for (name,mat),(vs,fs) in self.parts.items():
            mesh=bpy.data.meshes.new(name+' mesh');mesh.from_pydata(vs,[],fs);mesh.materials.append(materials[mat]);mesh.update()
            obj=bpy.data.objects.new(name,mesh)
            col_name=name[:8] if name.startswith('Floor_') else ('06_Crown' if name.startswith('Crown_Pavilion_') else name.split('/')[0])
            col=bpy.data.collections.get(col_name)
            if not col:col=bpy.data.collections.new(col_name);bpy.context.scene.collection.children.link(col)
            col.objects.link(obj);result.append(obj)
            if any(t in name.lower() for t in ['tile','ridge','柱','column','curve','finial']):
                for p in mesh.polygons:p.use_smooth=True
        return result

def material(name,color,metallic=0,roughness=.5,noise=False):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    nt=m.node_tree;bs=nt.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metallic;bs.inputs['Roughness'].default_value=roughness
    if noise:
        tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=8;tex.inputs['Detail'].default_value=2
        bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.03
        nt.links.new(tex.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    return m

def roof_outline(half):
    s=half+.6;r=half+1.9;a=half*.63
    return [(-a,-r),(a,-r),(a,-s),(s,-s),(s,-a),(r,-a),(r,a),(s,a),(s,s),(a,s),(a,r),(-a,r),(-a,s),(-s,s),(-s,a),(-r,a),(-r,-a),(-s,-a),(-s,-s),(-a,-s)]

def build_roof(g,level,z,half,top=False):
    outline=roof_outline(half);prefix=f'{level:02d}_Roof/';inner=.018 if top else .62
    rise=5.3 if top else 2.0
    convex=[]
    for i,p in enumerate(outline):
        prev=outline[(i-1)%len(outline)];nxt=outline[(i+1)%len(outline)]
        cross=(p[0]-prev[0])*(nxt[1]-p[1])-(p[1]-prev[1])*(nxt[0]-p[0])
        convex.append(1.0 if cross>0 else .05)
    def point(edge,u,t,dz=0):
        p,q=outline[edge],outline[(edge+1)%20]
        x=p[0]*(1-u)+q[0]*u;y=p[1]*(1-u)+q[1]*u
        factor=inner+(1-inner)*t
        up=.95*(convex[edge]*(1-u)**4+convex[(edge+1)%20]*u**4)
        return (x*factor,y*factor,z+rise*(1-t)**1.7+up*t**5+dz)
    for edge in range(20):
        p,q=outline[edge],outline[(edge+1)%20];length=math.dist(p,q)
        nu=max(4,int(length/.24));nt=18
        vs=[point(edge,j/nu,i/nt) for i in range(nt+1) for j in range(nu+1)]
        fs=[]
        for i in range(nt):
            for j in range(nu):
                a=i*(nu+1)+j;fs.append((a,a+nu+1,a+nu+2,a+1))
        g.poly(prefix+'Glazed roof planes',vs,fs,'tile' if edge%3 else 'tilelight')
        # Copper-red soffit, rolled eaves and individually modeled round tile ribs.
        edgepts=[point(edge,j/nu,1) for j in range(nu+1)]
        g.tube(prefix+'Eave ridge',edgepts,.115,'gold',10)
        g.tube(prefix+'Dark eave fascia',[(x,y,zz-.20) for x,y,zz in edgepts],.16,'darkwood',8)
        g.tube(prefix+'Painted underside trim',[(x,y,zz-.32) for x,y,zz in edgepts],.065,'teal',8)
        lower=[(x,y,zz-.16) for x,y,zz in vs]
        g.poly(prefix+'Roof soffit',lower,[tuple(reversed(f)) for f in fs],'red')
        for j in range(nu+1):
            u=j/nu
            g.tube(prefix+'Round tile ribs',[point(edge,u,i/nt,.035) for i in range(nt+1)],.044,'tilelight',6)
        # Fine horizontal tile overlaps articulate the curves in close-up.
        for k in range(2,13):
            t=k/13
            g.tube(prefix+'Tile courses',[point(edge,j/nu,t,.026) for j in range(nu+1)],.017,'tileedge',5)
        if convex[edge]>.5:
            path=[point(edge,0,i/nt,.07) for i in range(nt+1)]
            g.tube(prefix+'Hip ridge',path,.10,'gold',8)
            end=Vector(path[-1]);d=Vector((end.x,end.y,0)).normalized()
            ornament=[end+d*(.10*k)+Vector((0,0,.12*k+.035*k*k)) for k in range(5)]
            g.tube(prefix+'Upturned corner tips',ornament,.08,'gold',8)
            # Small abstract ridge guardians, without using external sculpture assets.
            for t in [.79,.86,.93]:
                x,y,zz=point(edge,0,t,.16)
                g.cylinder(prefix+'Ridge guardians',(x,y,zz+.10),.075,.19,'gold',8)
    if top:
        g.cylinder('06_Crown/Finial base',(0,0,z+rise+.08),.34,.38,'gold',16)
        pts=[(0,0,z+rise+.20),(0,0,z+rise+1.10)]
        g.tube('06_Crown/Finial mast',pts,.075,'gold',16)
        # Stacked traditional jewel-shaped finial.
        for dz,r,h in [(.4,.25,.3),(.76,.18,.22),(1.06,.11,.20)]:
            rings=[(0,r*.3),(h*.35,r),(h*.67,r*.75),(h,0.02)];verts=[]
            for zz,rr in rings:
                for j in range(20):verts.append((rr*math.cos(2*PI*j/20),rr*math.sin(2*PI*j/20),z+rise+dz+zz))
            faces=[(i*20+j,i*20+(j+1)%20,(i+1)*20+(j+1)%20,(i+1)*20+j) for i in range(3) for j in range(20)]
            g.poly('06_Crown/Finial jewels',verts,faces,'gold')

def platform(g):
    for i,(w,d,z,h,mat) in enumerate([(25,25,.22,.44,'plinth'),(23.5,23.5,.50,.12,'gold'),(23,23,.72,.32,'stone'),(21.5,21.5,1.14,.52,'stone'),(19.8,19.8,1.67,.54,'stone'),(18.4,18.4,2.22,.56,'stone'),(18.7,18.7,2.62,.24,'cream')]):
        g.box('00_Base/Terrace '+str(i),(0,0,z),(w,d,h),mat)
    # Broad stairs on all four sides; front axis is negative Y.
    for a in range(4):
        rot=a*PI/2
        for i in range(10):
            zz=.82+i*.19;yy=-11.6+i*.26
            x=-yy*math.sin(rot);y=yy*math.cos(rot)
            g.box('00_Base/Stairways',(x,y,zz/2+.42),(4.5,.44,zz-.84 if zz>.84 else .12),'stone',rot)
    # Inlaid path and terrace paving seams.
    for i in range(-11,12):
        for axis in range(2):
            center=(i,0,.903) if axis==0 else (0,i,.903)
            size=(.018,23,.006) if axis==0 else (23,.018,.006)
            g.box('00_Base/Paving joints',center,size,'joint')
    # Terrace balustrade with entrances at cardinal axes.
    for side in range(4):
        angle=side*PI/2
        def p(u,v,z):return (u*math.cos(angle)-v*math.sin(angle),u*math.sin(angle)+v*math.cos(angle),z)
        for direction in [-1,1]:
            for i in range(6):
                u=direction*(3.1+i*1.22)
                g.box('00_Base/Terrace balusters',p(u,-9.1,3.17),(.23,.23,1.0),'stone',angle)
                g.box('00_Base/Terrace capitals',p(u,-9.1,3.73),(.32,.32,.13),'cream',angle)
                if i<5:
                    nxt=u+direction*1.22
                    for h in [2.98,3.55]:g.beam('00_Base/Terrace rails',p(u,-9.1,h),p(nxt,-9.1,h),.13,.15,'stone')
                    for t in [.25,.5,.75]:g.beam('00_Base/Terrace fretwork',p(u+(nxt-u)*t,-9.1,3.0),p(u+(nxt-u)*t,-9.1,3.54),.075,.075,'stone')

def plaque(g,z,half,width,level):
    y=-half-.27
    g.box(f'{level:02d}_Plaque/Gold frame',(0,y,z),(width,.23,1.05),'gold')
    g.box(f'{level:02d}_Plaque/Dark lacquer',(0,y-.14,z),(width-.14,.08,.91),'plaque')

def lettering(materials):
    font_path='/System/Library/Fonts/Supplemental/Songti.ttc'
    font=bpy.data.fonts.load(font_path) if Path(font_path).exists() else None
    for level,z,radius,angle in [(5,30.8,4.445,i*PI/2) for i in range(4)]+[(1,5.5,7.57,0)]:
        curve=bpy.data.curves.new('黄鹤楼 / Raised lettering','FONT');curve.body='黄鹤楼';curve.align_x='CENTER';curve.align_y='CENTER'
        curve.size=.67 if level==5 else .74;curve.extrude=.018;curve.bevel_depth=.005;curve.resolution_u=8
        if font:curve.font=font
        col=bpy.data.collections.get(f'{level:02d}_Plaque')
        if not col:col=bpy.data.collections.new(f'{level:02d}_Plaque');bpy.context.scene.collection.children.link(col)
        ob=bpy.data.objects.new('黄鹤楼 · 匾额',curve);col.objects.link(ob)
        ob.location=(radius*math.sin(angle),-radius*math.cos(angle),z);ob.rotation_euler=(PI/2,0,angle);curve.materials.append(materials['gold'])

def point_at(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def main():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        if col.name=='Collection':bpy.data.collections.remove(col)
    colors={
      'red':('朱砂 · Vermilion lacquer',(.34,.055,.025),.03,.42),
      'darkwood':('深色木作 · Rosewood',(.09,.023,.013),0,.5),
      'cream':('暖白 · Limestone',(.72,.63,.45),0,.64),
      'teal':('青绿 · Painted beam',(.025,.19,.16),.1,.42),
      'gold':('鎏金 · Gilded ornament',(.78,.40,.055),.6,.32),
      'stone':('汉白石 · Carved stone',(.58,.54,.44),0,.72),
      'window':('窗影 · Window recess',(.027,.037,.03),.0,.55),
      'paint':('彩绘 · Ochre detail',(.81,.57,.18),.1,.48),
      'tile':('琉璃瓦 · Glazed amber',(.66,.265,.026),.18,.3),
      'tilelight':('筒瓦 · Golden glaze',(.80,.39,.044),.18,.31),
      'tileedge':('瓦口 · Fired ochre',(.42,.16,.014),.12,.42),
      'plinth':('展台 · Midnight bronze',(.035,.068,.071),.5,.44),
      'plaque':('匾额 · Indigo lacquer',(.012,.032,.039),.1,.33),
      'joint':('石缝 · Mortar',(.28,.28,.23),0,.8),
    }
    mats={k:material(*args,noise=k in ['stone','cream','red']) for k,args in colors.items()}
    g=Geometry();platform(g)
    floors=[(1,2.8,7.1,4.0),(2,8.5,6.3,3.6),(3,14.1,6.3,3.6),(4,19.7,6.3,3.6),(5,25.3,5.3,3.6)]
    for level,z,half,height in floors:
        build_floor(g,level,z,half,height)
        build_roof(g,level,z+height-.12,half,top=level==5)
    build_crown(g)
    plaque(g,5.5,7.1,3.2,1)
    objects=g.flush(mats);lettering(mats)
    # Apply consistent overall scale: tallest building point is 51.4 m above terrace.
    actual_top=max(v.co.z for ob in objects for v in ob.data.vertices)
    scale=51.4/(actual_top-2.8)
    model_objects=list(bpy.context.scene.objects)
    for ob in model_objects:
        if ob.type=='MESH':
            for v in ob.data.vertices:v.co*=scale
        else:ob.location*=scale;ob.scale*=scale
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.length_unit='METERS'
    scene['Model']='黄鹤楼 / Yellow Crane Tower — independent procedural interpretation'
    scene['Isolation']='Created from scratch. No pre-existing gta-wh project assets read or reused.'
    scene['Accuracy']='Exterior study; not a measured architectural survey. Approximate 51.4 m above terrace.'
    studio=bpy.data.collections.new('90_Studio');scene.collection.children.link(studio)
    floor_mesh=bpy.data.meshes.new('Studio ground mesh');floor_mesh.from_pydata([(-2000,-2000,-.025),(2000,-2000,-.025),(2000,2000,-.025),(-2000,2000,-.025)],[],[(0,1,2,3)])
    floor=bpy.data.objects.new('Studio ground',floor_mesh);studio.objects.link(floor);floor_mesh.materials.append(material('Studio · blue grey',(.105,.16,.19),0,.9));floor.hide_set(True)
    world=bpy.data.worlds.new('Soft studio sky');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.46,.62,.74,1);world.node_tree.nodes['Background'].inputs[1].default_value=.40
    def light(name,typ,loc,power,size,color):
        data=bpy.data.lights.new(name,typ);data.energy=power;data.color=color
        if typ=='AREA':data.shape='DISK';data.size=size
        else:data.angle=.15
        ob=bpy.data.objects.new(name,data);studio.objects.link(ob);ob.location=loc;point_at(ob,(0,0,22));return ob
    light('Sun · late afternoon','SUN',(-35,-40,70),2.3,0,(1,.83,.63))
    light('Softbox · front','AREA',(20,-45,48),4500,30,(.77,.87,1))
    light('Rim · roof edges','AREA',(-25,25,48),6000,22,(1,.64,.32))
    camera_data=bpy.data.cameras.new('Hero camera');camera=bpy.data.objects.new('Hero camera',camera_data);studio.objects.link(camera);camera.location=(65,-105,58);point_at(camera,(0,0,26));camera_data.type='ORTHO';camera_data.ortho_scale=69;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
    scene.render.resolution_x=1500;scene.render.resolution_y=1650;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    for area in [a for screen in bpy.data.screens for a in screen.areas]:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=92
            area.spaces.active.region_3d.view_location=(0,0,25)
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            area.spaces.active.clip_end=1000
            area.spaces.active.shading.type='MATERIAL'
    bpy.ops.object.select_all(action='DESELECT')
    # Embed the font and add readable reconstruction notes inside the .blend file.
    notes=bpy.data.texts.new('README · 模型说明')
    notes.write('黄鹤楼｜全新程序化外观模型\n独立生成，无旧项目素材。五层、十二翼角屋檐、朱柱、格窗、石栏。\n可在集合中按楼层及材质选择编辑。90_Studio 为独立摄影棚。\n全模型材质为程序化材质；不依赖外部贴图。屋檐/斗拱/平面比例为艺术化近似，并非测绘数据。\n来源与生成脚本见同目录。')
    bpy.ops.file.pack_all()
    scene.render.filepath=str(OUT/'preview.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'黄鹤楼.blend'))
    stats={'objects':len(model_objects),'mesh_objects':len(objects),'vertices':sum(len(o.data.vertices) for o in objects),'faces':sum(len(o.data.polygons) for o in objects),'roof_tiers':5,'wing_corners':60,'scale_factor':scale,'blender_version':bpy.app.version_string,'source_assets':'none','external_textures':0}
    (OUT/'model_info.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2))
    print('MODEL_SAVED',json.dumps(stats),flush=True)
    if '--draft' in sys.argv:
        scene.render.resolution_percentage=55;scene.cycles.samples=16
        scene.render.filepath=str(OUT/'draft.png')
        bpy.ops.render.render(write_still=True)
        return
    bpy.ops.render.render(write_still=True)
    camera.location=(0,-105,39);point_at(camera,(0,0,26));camera_data.ortho_scale=66
    scene.render.resolution_x=1250;scene.render.resolution_y=1450;scene.render.filepath=str(OUT/'front.png');scene.cycles.samples=32
    bpy.ops.render.render(write_still=True)
    print('RENDERS_DONE',flush=True)

if __name__=='__main__':main()
