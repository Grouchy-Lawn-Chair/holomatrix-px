"""Derived EMT mounts. Original six-part source is preserved.
1 BU = 1 mm. Adapt bore only; retain source tie channel and head/base interface.
"""
import bpy, bmesh, json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent
out=root/'public/hardware/emt'
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=.001
def load(n):
    bpy.ops.wm.stl_import(filepath=str(out/f'emt-part-{n}.stl'))
    obj=bpy.context.object
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.001)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.0001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if n==1:
        # The embossed size letter contains legacy zero-width internal edges.
        # Remove only wire edges; fill small source boundary loops before trim.
        wires=[e for e in bm.edges if not e.link_faces]
        if wires:bmesh.ops.delete(bm,geom=wires,context='EDGES')
        boundary=[e for e in bm.edges if e.is_boundary]
        if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=12)
    bm.to_mesh(obj.data);bm.free()
    return obj
def boolean(obj,other,operation):
    bpy.context.view_layer.objects.active=obj
    modifier=obj.modifiers.new('Derived '+operation,'BOOLEAN');modifier.operation=operation;modifier.solver='EXACT';modifier.object=other
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(other,do_unlink=True)
def export(obj,name):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.wm.stl_export(filepath=str(out/name),export_selected_objects=True,global_scale=1,use_scene_unit=False)
def audit(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    result={'vertices':len(bm.verts),'faces':len(bm.faces),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'bad_edges':[[list(v.co) for v in e.verts] for e in bm.edges if not e.is_manifold],'volume_mm3':abs(bm.calc_volume())}
    bm.free();return result
report=[]
base=load(1);base.name='Base derived - floor clearance only'
# Slot roof is at original X=-2.509, source-normalized coordinates.
# Seat it on the 25.396 mm wall top; keep the mouth above the 2.1 mm floor.
roof=-2.509
cut_x=roof-(25.396-2.3)
bpy.ops.mesh.primitive_cube_add(size=1,location=(cut_x-50,0,5))
cutter=bpy.context.object;cutter.scale=(100,100,100)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
boolean(base,cutter,'DIFFERENCE')
bm=bmesh.new();bm.from_mesh(base.data)
bad=list({v for e in bm.edges if not e.is_manifold for v in e.verts})
if bad:bmesh.ops.remove_doubles(bm,verts=bad,dist=.16)
bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.0001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(base.data);bm.free()
for v in base.data.vertices:
    x,y,z=v.co
    v.co=(z-5.415,y,x-roof+25.396)
# Axis permutation reverses handedness: restore outward faces.
bm=bmesh.new();bm.from_mesh(base.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(base.data);bm.free()
# Relieve the rounded slot roof locally for flat-topped paired walls.
# Preserve the original wide side gap; no wall-top clamping interference.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,25.496/2))
slot=bpy.context.object;slot.scale=(4.8,60,25.496);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
boolean(base,slot,'DIFFERENCE')
export(base,'base-assembled.stl');report.append({'part':'base',**audit(base)})
for x in [-1.05,1.05]:
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,0,(2.1+25.396)/2))
    wall=bpy.context.object;wall.scale=(2,50,25.396-2.1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    check=base.copy();check.data=base.data.copy();scene.collection.objects.link(check)
    boolean(check,wall,'INTERSECT');print('BASE_WALL_INTERSECTION',x,audit(check)['volume_mm3']);bpy.data.objects.remove(check,do_unlink=True)
for od in [23.5,21.336]:
    head=load(2);head.name=f'Head OD {od} plus 0.6 mm diametral allowance'
    center_x=32.899017333984375/2
    bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=17.2,depth=18.1,location=(center_x,0,9.05))
    fill=bpy.context.object
    bpy.ops.mesh.primitive_cube_add(size=1,location=(center_x+50,0,9.05))
    cutter=bpy.context.object;cutter.scale=(100,100,100);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    boolean(fill,cutter,'DIFFERENCE');boolean(head,fill,'UNION')
    bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=(od+.6)/2,depth=30,location=(center_x,0,9.05))
    boolean(head,bpy.context.object,'DIFFERENCE')
    # Head quarter-turn relative to base: pipe axis follows seam, not across it.
    # Source mating face restored, no whole-part scaling.
    for v in head.data.vertices:
        x,y,z=v.co
        v.co=(-y,z-9.05,x+24.1658-roof+25.396)
    bm=bmesh.new();bm.from_mesh(head.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(head.data);bm.free()
    # Recut the receiving stem after the quarter turn, with 0.05 mm normal
    # allowance. This removes the legacy decorative/interface interference.
    receiver=base.copy();receiver.data=base.data.copy();scene.collection.objects.link(receiver)
    receiver.data.update()
    for v in receiver.data.vertices:v.co+=v.normal*.05
    boolean(head,receiver,'DIFFERENCE')
    name=f'head-{od}-assembled.stl'
    export(head,name);report.append({'part':name,'pipe_od_mm':od,'diametral_allowance_mm':.6,'pipe_center_rear_mm':center_x+24.1658-roof+25.396,**audit(head)})
    check=base.copy();check.data=base.data.copy();scene.collection.objects.link(check)
    operand=head.copy();operand.data=head.data.copy();scene.collection.objects.link(operand)
    boolean(check,operand,'INTERSECT')
    print('BASE_HEAD_INTERSECTION',od,audit(check)['volume_mm3'])
    bpy.data.objects.remove(check,do_unlink=True)
    head.hide_render=True
(out/'derived-report.json').write_text(json.dumps(report,indent=2))
scene['regeneration']='build_emt_mounts.py; source extraction extract_emt_hardware.py'
scene['validation']='Mesh topology only. Physical PETG, glue, zip tie retention and loading untested.'
bpy.ops.wm.save_as_mainfile(filepath=str(out/'emt-derived-v1.blend'))
print('DERIVED_EMT',json.dumps(report))
