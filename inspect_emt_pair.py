import bpy, math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent
folder=root/'public/hardware/emt'
for obj in bpy.context.scene.objects:obj.hide_render=True
for index in [1,2]:
    bpy.ops.wm.stl_import(filepath=str(folder/f'emt-part-{index}.stl'))
    obj=bpy.context.object
    # Restore source-relative assembly positions, keeping millimeter scale.
    if index==1:obj.location=(-300.4942, -634.1099,63.506)
    else:obj.location=(-276.3284,-634.1099,59)
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='SINGLE'
scene.display.shading.single_color=(.3,.7,.7)
scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH'
data=bpy.data.cameras.new('Inspection');camera=bpy.data.objects.new('Inspection',data);scene.collection.objects.link(camera)
center=Vector((-292,-634,68));scene.camera=camera;data.type='ORTHO';data.ortho_scale=88;data.clip_end=10000
scene.render.resolution_x=900;scene.render.resolution_y=700;scene.render.resolution_percentage=100
for name,direction in [('top',(0,0,1)),('side',(0,-1,0)),('angle',(1,-1,1))]:
    camera.location=center+Vector(direction)*200
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(folder/f'pair-{name}.png');bpy.ops.render.render(write_still=True)
