import bpy,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_tools import validate,ROOT
report=validate('reloaded_final')
assert all(f.packed_file for f in bpy.data.fonts if f.filepath and f.filepath!='<builtin>')
dg=bpy.context.evaluated_depsgraph_get();glyphs={}
for ob in bpy.context.scene.objects:
    if ob.type=='FONT':
        evaluated=ob.evaluated_get(dg);mesh=evaluated.to_mesh();glyphs[ob.data.body]=len(mesh.vertices)
        assert len(mesh.vertices)>0,ob.data.body;evaluated.to_mesh_clear()
assert set(glyphs)=={'樓鶴黃','目極天楚','夢雲吞氣'},glyphs
report['font_meshes']=glyphs;report['reloaded_saved_blend']=True
(ROOT/'logs'/'reloaded_final_validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('FINAL_RELOAD_VALIDATED',json.dumps(report,ensure_ascii=False))
