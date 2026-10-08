"""Read-only scene diagnostic: evaluate each plaque glyph without saving the scene."""
import bpy
import json
from pathlib import Path

report = {'scene': bpy.data.filepath, 'plaques': [], 'glyphs': []}
fonts = []
for obj in list(bpy.context.scene.objects):
    if obj.type == 'FONT':
        report['plaques'].append({'name': obj.name, 'text': obj.data.body,
                                 'font': obj.data.font.filepath,
                                 'location': list(obj.location)})
        if obj.data.font not in fonts:
            fonts.append(obj.data.font)
for font in fonts:
    for character in '夢雲吞氣樓鶴黃目極天楚黄鹤楼':
        data = bpy.data.curves.new('diagnostic_character', 'FONT')
        data.body = character
        data.font = font
        obj = bpy.data.objects.new('diagnostic_character', data)
        bpy.context.scene.collection.objects.link(obj)
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        report['glyphs'].append({'character': character, 'font': font.filepath,
                                'vertices': len(mesh.vertices),
                                'polygons': len(mesh.polygons)})
        evaluated.to_mesh_clear()
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.curves.remove(data)
out = Path(__file__).with_name('font-diagnostic.json')
out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print('FONT_DIAGNOSTIC', json.dumps(report, ensure_ascii=False), flush=True)
