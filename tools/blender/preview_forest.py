"""CPU asset QA, independent of the unavailable GUI/OpenGL viewport.
blender --background --factory-startup --python-exit-code 1 --python tools/blender/preview_forest.py
"""
import bpy
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[2]
scene=bpy.data.scenes.new('ForestPreview')
bpy.context.window.scene=scene
bpy.ops.import_scene.gltf(filepath=str(root/'public/assets/environment/forest-v1.glb'))
names=['alpine_spruce','scots_pine','silver_fir','mountain_pine']
for obj in scene.objects:
    if obj.type=='MESH':
        obj.hide_render=not obj.name.endswith('lod0')
        if not obj.hide_render:
            i=next(i for i,n in enumerate(names) if obj.name.startswith(n))
            obj.location.x=(i-1.5)*11
world=bpy.data.worlds.new('PreviewSky')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.65,.75,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.65
scene.world=world
light=bpy.data.lights.new('AfternoonSun','SUN'); light.energy=2.3;light.angle=.12
sun=bpy.data.objects.new('AfternoonSun',light);scene.collection.objects.link(sun)
sun.rotation_euler=(.65,-.45,-.6)
camera=bpy.data.cameras.new('AssetCamera')
cam=bpy.data.objects.new('AssetCamera',camera);scene.collection.objects.link(cam)
cam.location=(30,-68,26);cam.rotation_euler=(Vector((0,0,7))-cam.location).to_track_quat('-Z','Y').to_euler()
camera.type='ORTHO';camera.ortho_scale=53;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
scene.render.resolution_x=1200;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(root/'verification/environment-phase2/blender-tree-preview.png')
bpy.ops.render.render(write_still=True)
