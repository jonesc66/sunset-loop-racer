"""Deterministic Phase 3 asset library. Local Blender only, no source downloads.
Run blender.exe --background --factory-startup --python tools/blender/generate_environment.py
Metres, script coordinates X/right Y/forward Z/up; glTF exports Y-up.
"""
import bpy, bmesh, math, random, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/environment/phase3'
OUT.mkdir(parents=True, exist_ok=True)
bpy.context.window.scene = bpy.data.scenes.new('Phase3Library')
mat = bpy.data.materials.new('EnvironmentPalette'); mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Roughness'].default_value = .87
node = mat.node_tree.nodes.new('ShaderNodeVertexColor'); node.layer_name = 'Color'
mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
STONE=(.32,.35,.34); WOOD=(.22,.105,.044); WALL=(.65,.59,.43); ROOF=(.18,.08,.045); METAL=(.18,.24,.26); GLASS=(.09,.24,.29)
manifest={'blender':bpy.app.version_string,'seed':9031,'units':'metres','output':str(OUT/'environment-v1.glb'),'command':'blender.exe --background --factory-startup --python tools/blender/generate_environment.py','meshes':[]}
names=['cliff','rock','alpine','chalet','barn','church','warehouse','garage','tank','fence','hay','pole','bridge','tunnel','portal','utility']
for name in names:
 for lod in range(3):
  vertices=[]; faces=[]; colors=[]; rng=random.Random(9031)
  def poly(v,f,c):
   off=len(vertices); vertices.extend(v); colors.extend([(*c,1)]*len(v)); faces.extend([tuple(off+i for i in face) for face in f])
  def box(x,y,z,w,d,h,c):
   poly([(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],c)
  def building(w,d,h,c):
   box(0,0,-.8,w+.4,d+.4,1.9,STONE)
   box(0,0,h/2,w,d,h,c)
   # Gabled wall infill, projecting eaves and a thin roof with visible fascia.
   poly([(-w/2,-d/2,h),(w/2,-d/2,h),(0,-d/2,h+2.8),(-w/2,d/2,h),(w/2,d/2,h),(0,d/2,h+2.8)],[(0,2,1),(3,4,5),(0,3,5,2),(1,2,5,4)],c)
   for side in [-1,1]:
    x=side*(w/2+.8)
    poly([(0,-d/2-.8,h+3),(x,-d/2-.8,h-.12),(x,d/2+.8,h-.12),(0,d/2+.8,h+3),(0,-d/2-.8,h+2.78),(x,-d/2-.8,h-.34),(x,d/2+.8,h-.34),(0,d/2+.8,h+2.78)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(1,5,6,2)],ROOF)
   box(-w*.12,-d/2-.07,1.45,1.55,.20,2.9,WOOD)
   for level in ([h*.38,h*.78] if name!='barn' else [h*.72]):
    for x in [-w*.32,w*.32]:
     for side in [-1,1]:
      y=side*(d/2+.08)
      box(x,y,level,1.65,.14,1.8,WOOD)
      box(x,y+side*.09,level,1.37,.06,1.52,GLASS)
      if lod<2:
       box(x,y+side*.14,level,.075,.08,1.55,WALL)
       box(x,y+side*.14,level,1.4,.08,.075,WALL)
       box(x,y+side*.12,level-.94,1.9,.42,.16,STONE)
       for dx in [-1.02,1.02]:box(x+dx,y,level,.35,.12,1.78,WOOD)
   for side in [-1,1]:
    for y in [-d*.24,d*.24]:
     for level in [h*.38,h*.78]:
      x=side*(w/2+.08)
      box(x,y,level,.14,1.65,1.8,WOOD)
      box(x+side*.09,y,level,.06,1.37,1.52,GLASS)
      if lod<2:
       box(x+side*.14,y,level,.08,.075,1.55,WALL)
       box(x+side*.14,y,level,.08,1.4,.075,WALL)
       box(x+side*.12,y,level-.94,.42,1.9,.16,STONE)
   if lod<2:
    box(-w*.12,-d/2-.55,.12,2.4,1.1,.24,STONE)
    box(-w*.12,-d/2-.85,-.08,2.8,1.7,.2,STONE)
    box(w*.24,d*.15,h+2.3,.9,1,3.4,STONE)
    box(w*.24,d*.15,h+4.05,1.2,1.3,.22,STONE)
    for x in [-w/2-.45,w/2+.45]:box(x,0,h-.18,.12,d+1.6,.14,METAL)
   if lod==0:
    # Separate thin slate courses follow the roof slope rather than thick roof slabs.
    for side in [-1,1]:
     for row in range(1,12):
      t=row/12;x=side*(w/2+.8)*t;z=h+3-3.12*t
      box(x,0,z+.025,.08,d+1.6,.045,tuple(v*(.9+.12*rng.random()) for v in ROOF))
    for x in [-w/2+.12,w/2-.12]:box(x,-d/2-.06,h/2,.18,.16,h,WOOD)
  if name in ['cliff','rock','alpine']:
   n=[32,20,12][lod];rows=[20,12,7][lod];w,h,d={'cliff':(12,28,12),'rock':(4,5,4),'alpine':(17,38,15)}[name]
   v=[];f=[]
   planes=[]
   for k in range(19):
    angle=rng.uniform(0,math.tau);zz=rng.uniform(-1,1);rr=math.sqrt(1-zz*zz);planes.append(((rr*math.cos(angle),rr*math.sin(angle),zz),rng.uniform(.8,1.04)))
   for ring in range(rows+1):
    t=ring/rows;lat=-math.pi/2+math.pi*t
    for i in range(n):
     a=i*math.tau/n
     if name=='rock':
      direction=(math.cos(lat)*math.cos(a),math.cos(lat)*math.sin(a),math.sin(lat))
      q=min([1.1]+[dist/dot for normal,dist in planes if (dot:=sum(normal[k]*direction[k] for k in range(3)))>.01])
      v.append((direction[0]*w*q,direction[1]*d*q,max(-.6,direction[2]*h*.6*q+h*.42)))
     else:
      taper=max(0,1-t)**(.64 if name=='alpine' else .42)
      fracture=.13*math.sin(a*3+t*5)+.075*math.sin(a*7-t*9)+.045*math.sin(t*42+a*2)
      radius=taper*(.9+fracture)
      top=h*(.80+.12*math.sin(a*2+.4)**2+.08*math.sin(a*5)**2)*(1-.16*t*math.sin(a*3)**2)
      v.append((math.cos(a)*w*radius+2.2*t*t,math.sin(a)*d*radius-1.8*t*t,-2+t*(top+2)))
   for ring in range(rows):
    for i in range(n):f.append((ring*n+i,ring*n+(i+1)%n,(ring+1)*n+(i+1)%n,(ring+1)*n+i))
   f.extend([tuple(reversed(range(n))),tuple(range(rows*n,(rows+1)*n))]);poly(v,f,(.235,.25,.23))
   for i,point in enumerate(v):
    shade=.8+.16*math.sin(point[0]*.7+point[2]*.4)+.1*math.sin(point[1]*1.3)+.08*math.sin(point[2]*2.1+point[0]*.2)
    colors[i]=(.235*shade,.25*shade,.23*shade,1)
    if name=='alpine' and point[2]>h*.69+math.sin(point[0])*.8:colors[i]=(.64,.69,.68,1)
  elif name in ['chalet','barn','church']:
   building(12 if name!='barn' else 17,12,7 if name!='church' else 10,WALL if name!='barn' else WOOD)
   if name=='church':
    box(0,-4,12,3,3,12,WALL);box(0,-4,20,.3,.3,4,WOOD);box(0,-4,20.6,2.2,.3,.3,WOOD)
  elif name in ['warehouse','garage']:
   w=24 if name=='warehouse' else 16;box(0,0,5,w,16,10,METAL);box(0,0,10,w+1,17,.5,STONE)
   box(0,0,-2,w,16,4,STONE)
   for x in [-w*.27,w*.27]:box(x,-8.05,3.4,w*.35,.15,6.8,(.38,.42,.4))
   if lod<2:
    for x in range(-int(w/2),int(w/2),2):box(x,-8.16,7.8,.12,.13,3,METAL)
    for y in [-6,-3,0,3,6]:
     for side in [-1,1]:box(side*(w/2+.08),y,5,.16,.16,10,(.26,.29,.29))
    for x in [-w*.2,w*.2]:box(x,1,10.65,2.2,2.2,1.1,(.36,.39,.37))
  elif name=='tank':
   n=16-lod*4;v=[(math.cos(i*math.tau/n)*4,math.sin(i*math.tau/n)*4,z) for z in [0,11] for i in range(n)]
   poly(v,[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],(.5,.53,.5))
  elif name=='fence':
   for y in [-4,4]:box(0,y,1.2,.25,.25,2.4,WOOD)
   for z in [.8,1.7]:box(0,0,z,.16,8,.18,WOOD)
  elif name=='hay':box(0,0,1,3,2,2,(.56,.4,.13))
  elif name=='pole':
   box(0,0,6,.4,.4,12,WOOD);box(0,0,11.4,4,.25,.25,WOOD)
   for x in [-1.6,0,1.6]:box(x,0,11.7,.2,.2,.6,GLASS)
  elif name=='utility':box(0,0,1.4,2,1.4,2.8,METAL)
  elif name=='bridge':
   # Ten-metre module; deck remains below the runtime road spline.
   box(0,0,-.65,36,10,1.2,STONE)
   for x in [-17.5,17.5]:
    box(x,0,1,1,10,2,STONE);box(x,0,-2,1,10,3,METAL)
    box(x,0,-6,2,2,11,STONE)
   if lod<2:
    for y in [-4,0,4]:box(0,y,-2,34,.4,.5,METAL)
   if lod==0:box(0,-4.95,.015,25,.08,.02,METAL)
  elif name in ['tunnel','portal']:
   depth=6 if name=='tunnel' else 3
   for x in [-20,20]:box(x,0,3,2,depth,6,STONE)
   segments=24 if lod==0 else 16
   outerWidth=20.5 if name=='tunnel' else 27
   outerRise=5.2 if name=='tunnel' else 10
   for i in range(segments):
    a=i*math.pi/segments;b=(i+1)*math.pi/segments
    section=[(19*math.cos(a),6+4*math.sin(a)),(19*math.cos(b),6+4*math.sin(b)),(outerWidth*math.cos(b),6+outerRise*math.sin(b)),(outerWidth*math.cos(a),6+outerRise*math.sin(a))]
    poly([(x,y,z) for y in [-depth/2,depth/2] for x,z in section],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],STONE)
   for x in [-18.5,18.5]:
    box(x,0,.25,1,depth,.5,(.47,.47,.41))
    for z in [2.2,4.1]:box(x,0,z,.14,depth,.10,METAL)
   if lod<2:
    for x in [-12,12]:box(x,0,8.9,1,1,.16,(.9,.8,.55))
   if name=='portal':
    for x in [-24,24]:box(x,0,3,9,5,6,STONE)
  mesh=bpy.data.meshes.new(name+str(lod));mesh.from_pydata(vertices,[],faces);mesh.materials.append(mat)
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
  if name in ['cliff','rock','alpine']:
   for face in mesh.polygons:face.use_smooth=True
   mesh.set_sharp_from_angle(angle=math.radians(35))
  attr=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
  for i,c in enumerate(colors):attr.data[i].color=c
  obj=bpy.data.objects.new(f'{name}_lod{lod}',mesh);bpy.context.scene.collection.objects.link(obj)
  uv=mesh.uv_layers.new(name='Metric UV')
  for face in mesh.polygons:
   axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
   for li in face.loop_indices:
    co=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]],co[axes[1]])
  mesh.calc_loop_triangles();manifest['meshes'].append({'name':obj.name,'triangles':len(mesh.loop_triangles)})
bpy.ops.export_scene.gltf(filepath=str(OUT/'environment-v1.glb'),export_format='GLB',use_active_scene=True,export_yup=True,export_materials='EXPORT')
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
