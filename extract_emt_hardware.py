"""Extract original connected EMT parts without rescaling or editing the source."""
import bpy, json
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parent
out = root / 'public' / 'hardware' / 'emt'
out.mkdir(parents=True, exist_ok=True)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = .001
bpy.ops.wm.stl_import(filepath=r'C:\Users\Mitchell\Downloads\8 Bit - Clips for EMT.stl')
source = bpy.context.object
source.name = 'Original EMT six-part source (mm)'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')
parts = list(bpy.context.selected_objects)
report=[]
for i,obj in enumerate(sorted(parts,key=lambda o:(round(o.location.y),o.name))):
    coords=[obj.matrix_world@v.co for v in obj.data.vertices]
    lo=Vector(tuple(min(v[n] for v in coords) for n in range(3)))
    hi=Vector(tuple(max(v[n] for v in coords) for n in range(3)))
    # Normalize only the origin. No dimensional change or mesh cleanup.
    offset=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    for v,p in zip(obj.data.vertices,coords):v.co=p-offset
    obj.matrix_world.identity()
    obj.name=f'emt-part-{i+1}'
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.wm.stl_export(filepath=str(out/f'{obj.name}.stl'),export_selected_objects=True,global_scale=1,use_scene_unit=False)
    report.append({'file':f'{obj.name}.stl','dimensions_mm':list(hi-lo),'source_min':list(lo),'source_max':list(hi)})
    obj.location=Vector(((i%3)*75,(i//3)*75,0))
    obj['source_file']='8 Bit - Clips for EMT.stl'
    obj['modification']='origin normalization only; dimensions unchanged'
(out/'parts.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'emt-extracted-v1.blend'))
print('EMT_PARTS',json.dumps(report))
