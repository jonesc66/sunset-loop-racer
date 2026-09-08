"""Blender 4.5.9 LTS: deterministic, opaque branch-cluster trees for WebGL.
Run: blender --background --factory-startup --python tools/blender/generate_forest.py
No input assets. Seed 48120; output is public/assets/environment/forest-v1.glb.
Local Z-up metres, base at origin; glTF exporter converts to Y-up.
"""
import bpy
import math
import random
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'assets' / 'environment'
OUT.mkdir(parents=True, exist_ok=True)
# A new isolated scene avoids touching user scenes and requires no delete operation.
scene = bpy.data.scenes.new('GeneratedForest')
bpy.context.window.scene = scene
material = bpy.data.materials.new('ForestVertexColor')
material.use_nodes = True
nodes = material.node_tree.nodes
bsdf = nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = 0.96
color = nodes.new('ShaderNodeVertexColor')
color.layer_name = 'Color'
material.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])

SPECIES = [
    # name, height, radius, whorls, branches/whorl, bare trunk fraction, droop
    ('alpine_spruce', 14.5, 3.0, 12, 7, 0.14, 0.30),
    ('scots_pine', 12.0, 4.0, 8, 6, 0.42, -0.12),
    ('silver_fir', 17.0, 3.8, 13, 8, 0.10, 0.12),
    ('mountain_pine', 8.5, 3.6, 8, 7, 0.12, -0.20),
]
manifest = {'blender': bpy.app.version_string, 'seed': 48120, 'units': 'metres', 'up': 'Y', 'meshes': []}

for species, (name, height, radius, levels, branch_count, bare, droop) in enumerate(SPECIES):
    for lod in range(3):
        rng = random.Random(48120 + species * 131 + lod * 7)
        vertices, faces, colors = [], [], []
        def vertex(p, c):
            vertices.append(tuple(p)); colors.append((*c, 1.0)); return len(vertices) - 1
        def tube(a, b, r0, r1, c, sides=5):
            a, b = Vector(a), Vector(b)
            axis = (b-a).normalized()
            u = axis.cross(Vector((0, 1, 0))).normalized()
            if u.length < 0.01: u = Vector((1, 0, 0))
            v = axis.cross(u)
            start = len(vertices)
            for p, r in [(a, r0), (b, r1)]:
                for j in range(sides):
                    angle = j * math.tau / sides
                    vertex(p + (u*math.cos(angle)+v*math.sin(angle))*r, c)
            for j in range(sides):
                k = (j+1) % sides
                faces.extend([(start+j,start+k,start+sides+k),(start+j,start+sides+k,start+sides+j)])
            for j in range(1,sides-1):
                faces.extend([(start,start+j+1,start+j),(start+sides,start+sides+j,start+sides+j+1)])
        def tuft(center, direction, length, width, c):
            # Irregular pointed needle clusters along branchlets, never stacked cones.
            center, axis = Vector(center), Vector(direction).normalized()
            u = axis.cross(Vector((0,0,1))).normalized()
            if u.length < .01: u = Vector((1,0,0))
            v = axis.cross(u)
            base = vertex(center-axis*length*.48,c)
            tip = vertex(center+axis*length*.65,c)
            ring=[]
            for k in range(5 if lod==0 else 4):
                angle=k*math.tau/(5 if lod==0 else 4)
                p=center+(u*math.cos(angle)+v*math.sin(angle)) * width * rng.uniform(.76,1.20)
                ring.append(vertex(p,tuple(x*rng.uniform(.82,1.16) for x in c)))
            for j in range(len(ring)):
                faces.extend([(base,ring[(j+1)%len(ring)],ring[j]),(tip,ring[j],ring[(j+1)%len(ring)])])
        lean = Vector((.35*(species-1.3), .22*math.sin(species), height))
        bark = (.105,.071,.043)
        tube((0,0,0),lean,height*.018,.025,bark,7 if lod==0 else 5)
        used_levels = levels if lod==0 else max(4,levels//(2 if lod==1 else 3))
        for layer in range(used_levels):
            t=layer/max(1,used_levels-1)
            z=height*(bare+(1-bare)*t*.94)
            envelope=(1-t)**(.72 if species!=1 else .38)
            for branch in range(branch_count if lod==0 else max(3,branch_count-2)):
                angle=branch*math.tau/branch_count+layer*2.399+rng.uniform(-.25,.25)
                radial=Vector((math.cos(angle),math.sin(angle),0))
                origin=lean*(z/height)
                origin.z=max(z+rng.uniform(-.65,.65)*height/levels,1.1+radius*max(droop,0))
                span=radius*envelope*rng.uniform(.68,1.18)+.12
                end=origin+radial*span+Vector((0,0,-span*droop+rng.uniform(-.16,.24)))
                if lod==0: tube(origin,end,.042*(1-t)+.013,.009,bark,4)
                segments=5 if lod==0 else 2 if lod==1 else 1
                for n in range(segments):
                    f=.30+.65*(n+1)/segments
                    p=origin.lerp(end,f)
                    green=(.030+rng.random()*.023,.090+rng.random()*.043,.030+rng.random()*.018)
                    lateral=Vector((-radial.y,radial.x,.24))
                    for side in (-1,1):
                        direction=radial*.72+lateral*side*.55+Vector((0,0,rng.uniform(.08,.38)))
                        tuft(p+direction*.20,direction,span*(.24 if lod==0 else .55)+.27,span*(.065 if lod==0 else .12)+.095,green)
        tuft(lean,(.1,0,1),1.0,.24,(.052,.14,.044))
        mesh=bpy.data.meshes.new(f'{name}_lod{lod}')
        mesh.from_pydata(vertices,[],faces)
        mesh.update()
        attr=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
        for i,c in enumerate(colors): attr.data[i].color=c
        for polygon in mesh.polygons: polygon.use_smooth=True
        obj=bpy.data.objects.new(mesh.name,mesh)
        scene.collection.objects.link(obj)
        mesh.materials.append(material)
        obj['species']=name; obj['lod']=lod
        manifest['meshes'].append({'name':mesh.name,'triangles':len(faces),'vertices':len(vertices),'height':height})

bpy.ops.export_scene.gltf(filepath=str(OUT/'forest-v1.glb'),export_format='GLB',use_active_scene=True,
    export_yup=True,export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Color',export_normals=True,export_texcoords=False)
(OUT/'forest-v1.manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print('FOREST_GENERATED',json.dumps(manifest))
