"""Reference-led revision. Original V1 is retained; every stage has its own source scene."""
from pathlib import Path
import sys, math, argparse, json, time
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parent;sys.path.insert(0,str(ROOT))
from build_model import Geometry, material, build_roof as old_roof
from facades import build_floor
from crown_refined import build_crown_refined
from scene_tools import setup_studio, export_asset, render, validate, aim
from record_event import record
PI=math.pi
TIERS=[(1,1.2,9.0,5.2),(2,8.4,6.6,3.45),(3,12.55,6.6,3.15),(4,16.4,6.6,3.15),(5,20.25,5.4,4.05)]

def palettes(refined):
    values={
      'red':('赭红木作',(.33,.135,.09),0,.52),
      'darkwood':('深色木门窗',(.095,.041,.024),0,.64),
      'cream':('米白额枋',(.62,.53,.38),0,.72),
      'teal':('青绿彩绘',(.075,.19,.145),0,.62),
      'gold':('细部描金',(.66,.37,.08),.3,.46),
      'stone':('灰白石',(.59,.58,.52),0,.75),
      'window':('暗木窗影',(.022,.03,.027),0,.6),
      'paint':('赭金彩绘',(.58,.32,.09),0,.58),
      'tile':('橙赭琉璃瓦',(.52,.22,.055),0,.44),
      'tilelight':('筒瓦釉面',(.64,.305,.075),0,.40),
      'tileedge':('瓦口陶胎',(.27,.125,.043),0,.58),
      'plinth':('独立展示台',(.055,.077,.076),.2,.58),
      'plaque':('墨底匾额',(.017,.026,.025),0,.50),
      'joint':('石缝',(.33,.33,.295),0,.8),
      'bronze':('铜色宝顶',(.28,.13,.07),.42,.58),
      'jewel':('暗红顶珠',(.31,.035,.019),.05,.46),
    }
    if not refined:
        values.update({'red':('V1朱红',(.34,.055,.025),.03,.42),'tile':('V1黄金瓦',(.66,.265,.026),.18,.3),'tilelight':('V1亮黄金瓦',(.80,.39,.044),.18,.31),'gold':('V1鎏金',(.78,.40,.055),.6,.32)})
    return {k:material(*args,noise=k in ['stone','red','cream']) for k,args in values.items()}

def platform(g):
    # Low stone terrace and a separate presentation plinth, instead of a tall stepped pyramid.
    for name,center,size,mat in [('Plinth',(0,-.35,.12),(26,27,.24),'plinth'),('Stone base',(0,-.35,.4),(24.6,25.6,.32),'stone'),('Terrace',(0,0,.8),(22.8,22.8,.52),'stone'),('Stone coping',(0,0,1.10),(23.0,23.0,.14),'stone')]:
        g.box('00_Base/'+name,center,size,mat)
    # Local broad stairs, not another continuous ring of steps.
    for side in range(4):
        a=side*PI/2;ca,sa=math.cos(a),math.sin(a)
        def p(x,y,z):return (ca*x-sa*y,sa*x+ca*y,z)
        for i in range(5):
            top=.42+.15*i;y=-12.7+.3*i
            g.box('00_Base/Approach stair',p(0,y,(top+.24)/2),(5.8,.50,top-.24),'stone',a)
        for sign in [-1,1]:
            g.beam('00_Base/Stair handrail',p(sign*3.15,-12.8,1.0),p(sign*3.15,-11.4,1.75),.15,.17,'stone')
            for j in range(4):
                y=-12.8+j*.46;bottom=.38+j*.19
                g.cylinder('00_Base/Stair baluster',p(sign*3.15,y,bottom+.31),.075,.62,'stone',10)
        for sign in [-1,1]:
            # Low freestanding stone rails on the terrace perimeter, clear of the entry.
            for j in range(7):
                x=sign*(3.5+j*1.19)
                g.box('00_Base/Stone posts',p(x,-11.18,1.55),(.18,.18,.84),'stone',a)
                g.box('00_Base/Stone capitals',p(x,-11.18,1.99),(.27,.27,.10),'stone',a)
                if j<6:
                    for zz in [1.35,1.84]:g.beam('00_Base/Stone rails',p(x,-11.18,zz),p(x+sign*1.19,-11.18,zz),.10,.12,'stone')
                    for k in [1,2,3]:g.box('00_Base/Stone balusters',p(x+sign*k*.2975,-11.18,1.6),(.075,.075,.47),'stone',a)
    for i in range(-11,12):
        for axis in [0,1]:
            g.box('00_Base/Paving joints',(i,0,1.172) if axis==0 else (0,i,1.172),(.012,22.5,.003) if axis==0 else (22.5,.012,.003),'joint')

def outline(half):
    s=half*.90+1.02;r=half+1.45;a=half*.55
    return [(-a,-r),(a,-r),(a,-s),(s,-s),(s,-a),(r,-a),(r,a),(s,a),(s,s),(a,s),(a,r),(-a,r),(-a,s),(-s,s),(-s,a),(-r,a),(-r,-a),(-s,-a),(-s,-s),(-a,-s)]

def roof(g,level,z,half):
    poly=outline(half);prefix=f'{level:02d}_Roof/';inner=.65;rise=2.10 if level==1 else 1.40
    convex=[]
    for i,p in enumerate(poly):
        a,b=poly[(i-1)%20],poly[(i+1)%20]
        convex.append(1.0 if (p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0])>0 else 0)
    def point(edge,u,t,dz=0):
        p,q=poly[edge],poly[(edge+1)%20];x=p[0]*(1-u)+q[0]*u;y=p[1]*(1-u)+q[1]*u
        f=inner+(1-inner)*t
        center_raise=.20 if edge%5==0 else -.10
        lift=.66*(convex[edge]*(1-u)**3+convex[(edge+1)%20]*u**3)
        return (x*f,y*f,z+rise*(1-t)**1.65+center_raise*t+lift*t**4+dz)
    for edge in range(20):
        length=math.dist(poly[edge],poly[(edge+1)%20]);nu=max(3,int(length/.22));nt=16
        vs=[point(edge,j/nu,i/nt) for i in range(nt+1) for j in range(nu+1)]
        fs=[(i*(nu+1)+j,(i+1)*(nu+1)+j,(i+1)*(nu+1)+j+1,i*(nu+1)+j+1) for i in range(nt) for j in range(nu)]
        g.poly(prefix+'Glazed roof planes',vs,fs,'tile')
        low=[(x,y,zz-.15) for x,y,zz in vs];g.poly(prefix+'Roof soffit',low,[tuple(reversed(f)) for f in fs],'darkwood')
        # Close all four curved boundary profiles with matching faces.
        count=len(vs);allvs=vs+low
        boundary=list(range(nu+1))+[i*(nu+1)+nu for i in range(1,nt+1)]+[nt*(nu+1)+j for j in range(nu-1,-1,-1)]+[i*(nu+1) for i in range(nt-1,0,-1)]
        g.poly(prefix+'Closed roof edges',allvs,[(a,b,b+count,a+count) for a,b in zip(boundary,boundary[1:]+boundary[:1])],'tileedge')
        for j in range(nu+1):g.tube(prefix+'Round tile ribs',[point(edge,j/nu,i/nt,.025) for i in range(nt+1)],.035,'tilelight',6)
        for row in range(1,10):g.tube(prefix+'Tile courses',[point(edge,j/nu,row/10,.015) for j in range(nu+1)],.013,'tileedge',5)
        edgepts=[point(edge,j/nu,1) for j in range(nu+1)]
        g.tube(prefix+'Eave ridge',edgepts,.083,'tilelight',8)
        g.tube(prefix+'Dark eave fascia',[(x,y,zz-.17) for x,y,zz in edgepts],.105,'darkwood',8)
        g.tube(prefix+'Painted underside trim',[(x,y,zz-.28) for x,y,zz in edgepts],.045,'teal',6)
        if convex[edge]:
            pts=[point(edge,0,i/nt,.06) for i in range(nt+1)]
            g.tube(prefix+'Hip ridge',pts,.073,'tilelight',8)
            end=Vector(pts[-1]);d=Vector((end.x,end.y,0)).normalized()
            g.tube(prefix+'Short ridge ornament',[end,end+d*.09+Vector((0,0,.07)),end+d*.16+Vector((0,0,.21))],.055,'bronze',8)

def add_plaque(g,center,width,height,angle,text):
    x,y,z=center
    g.box('01_Plaque/Frame',center,(width+.16,.18,height+.14),'gold',angle)
    outward=Vector((math.sin(angle),-math.cos(angle),0))
    face=Vector(center)+outward*.13
    g.box('01_Plaque/Lacquer',face,(width,.085,height),'plaque',angle)
    return {'center':tuple(face+outward*.055),'width':width,'height':height,'angle':angle,'text':text}

def text_objects(plaques,mats):
    font=bpy.data.fonts.load(str(ROOT/'assets'/'Songti-full.ttf'))
    col=bpy.data.collections.get('05_Plaque')
    if not col:col=bpy.data.collections.new('05_Plaque');bpy.context.scene.collection.children.link(col)
    for item in plaques:
        if not item.get('text'):continue
        curve=bpy.data.curves.new(item['text'],'FONT');curve.body=item['text'];curve.font=font
        curve.align_x='CENTER';curve.align_y='CENTER';curve.size=min(item['height']*.74,item['width']/len(item['text'])*.87)
        curve.extrude=.012;curve.bevel_depth=.003;curve.resolution_u=6;curve.materials.append(mats['gold'])
        ob=bpy.data.objects.new('匾额_'+item['text'],curve);col.objects.link(ob);ob.location=item['center'];ob.rotation_euler=(PI/2,0,item.get('angle',0))
        bpy.context.view_layer.update()
        width=max(p[0] for p in ob.bound_box)-min(p[0] for p in ob.bound_box)
        height=max(p[1] for p in ob.bound_box)-min(p[1] for p in ob.bound_box)
        if width>0 and height>0:curve.size*=min(item['width']*.88/width,item['height']*.83/height)

def main():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    ap=argparse.ArgumentParser();ap.add_argument('--stage',choices=['structure','roof','final'],default='final');ap.add_argument('--views',action='store_true');a=ap.parse_args(args)
    record('开始生成 '+a.stage);started=time.monotonic()
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for c in list(bpy.data.collections):bpy.data.collections.remove(c)
    mats=palettes(a.stage=='final');g=Geometry();platform(g)
    for level,z,half,height in TIERS:
        build_floor(g,level,z,half,height,refined=a.stage=='final')
        if level<5:
            if a.stage=='structure':old_roof(g,level,z+height-.1,half)
            else:roof(g,level,z+height-.1,half)
    plaques=build_crown_refined(g,z=24.2,half=5.4)
    plaques.append(add_plaque(g,(0,-9.19,5.34),3.0,1.02,0,'夢雲吞氣'))
    objects=g.flush(mats);text_objects(plaques,mats)
    top=max(v.co.z for o in objects for v in o.data.vertices);sz=51.4/(top-1.2);sx=30/18
    for ob in list(bpy.context.scene.objects):
        if ob.type=='MESH':
            for v in ob.data.vertices:v.co.x*=sx;v.co.y*=sx;v.co.z*=sz
        else:ob.location.x*=sx;ob.location.y*=sx;ob.location.z*=sz;ob.scale=(sx,sx,sz)
    setup_studio();scene=bpy.context.scene
    scene['Reference study']='Publicly sourced real photographs; procedural approximate reconstruction, not photogrammetry.'
    scene['stage']=a.stage;scene['Source version']='V1 preserved under baseline/';scene['height_above_terrace_m']=51.4
    scene['main_storey_widths_m']=[30.0,22.0,22.0,22.0,18.0]
    notes=bpy.data.texts.new('优化记录');notes.write((ROOT/'quality_contract.json').read_text())
    bpy.ops.file.pack_all();bpy.ops.object.select_all(action='DESELECT')
    path=ROOT/'stages'/f'{a.stage}.blend'
    if a.stage=='final':path=ROOT/'黄鹤楼_实景优化.blend'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
    validate(a.stage)
    if a.stage=='final':export_asset(ROOT/'assets'/'refined.glb')
    rendertime=render(ROOT/'stages'/f'{a.stage}.png',percent=70 if a.stage!='final' else 100,samples=16 if a.stage!='final' else 24)
    record('完成 '+a.stage,seconds=round(time.monotonic()-started,2),render_seconds=rendertime,scene=str(path.name))
    if a.views:
        for view in ['front','side','rear','top','detail']:
            render(ROOT/'previews'/f'{view}.png',view,percent=65,samples=12)
        record('多角度渲染完成')
    print('STAGE_COMPLETE',a.stage,flush=True)

if __name__=='__main__':main()
