"""Local Blender modeling, UV, shared PBR authoring and decimated LOD export.
Run from project: .tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python tools/blender/phase4a/build.py
No downloads. X right, Y forward, Z up in Blender. Assets in metres.
"""
import bpy, bmesh, math, json, random
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/assets/environment/phase4a'; OUT.mkdir(parents=True,exist_ok=True)
TEX=OUT/'textures'; TEX.mkdir(exist_ok=True)
bpy.context.window.scene=bpy.data.scenes.new('Phase4A authored library')
SEED=41027; N=1024
rng=np.random.default_rng(SEED)
yy,xx=np.mgrid[0:N,0:N]/N
def noise(freq, seed):
 r=np.random.default_rng(seed);grid=r.random((freq,freq))-.5
 x=xx*freq;y=yy*freq;xi=x.astype(int);yi=y.astype(int);a=x-xi;b=y-yi
 a=a*a*(3-2*a);b=b*b*(3-2*b)
 return ((1-a)*(1-b)*grid[yi%freq,xi%freq]+a*(1-b)*grid[yi%freq,(xi+1)%freq]+(1-a)*b*grid[(yi+1)%freq,xi%freq]+a*b*grid[(yi+1)%freq,(xi+1)%freq])
macro=noise(5,SEED); grain=noise(100,SEED+1); fine=rng.random((N,N))-.5
textures={}; mats={}
def image(name,a):
 im=bpy.data.images.new(name,width=N,height=N,alpha=True)
 if not name.endswith('-base'):im.colorspace_settings.name='Non-Color'
 rgba=np.ones((N,N,4),dtype=np.float32); rgba[:,:,:3]=np.clip(a,0,1)
 im.pixels.foreach_set(rgba.ravel()); im.filepath_raw=str(TEX/(name+'.png')); im.file_format='PNG'; im.save();return im
for family,base in [('rock',(.40,.385,.34)),('concrete',(.57,.55,.49)),('ground',(.34,.30,.22)),('metal',(.19,.25,.255))]:
 if family=='rock':
  strata=np.sin(math.tau*(yy*23+macro*.8+np.sin(xx*math.tau*3)*.3))
  cracks=np.maximum(0,.10-np.abs(strata))*.9
  h=.15*macro+.009*strata+.055*grain+.004*fine-cracks*.15
  shade=.16*macro+.08*grain+.028*fine-cracks*.2
 elif family=='concrete':
  pores=np.where(fine<-.48,-.045,0); h=.04*macro+.03*grain+pores
  shade=.13*macro+.05*grain+pores
 elif family=='ground':
  h=.2*grain+.045*fine+.1*macro;shade=.18*macro+.14*grain+.055*fine
 else:
  h=.018*grain+.002*fine;shade=.10*macro+.025*grain
 color=np.array(base)[None,None,:]+shade[:,:,None]
 dx=(np.roll(h,-1,axis=1)-np.roll(h,1,axis=1))*12
 dy=(np.roll(h,-1,axis=0)-np.roll(h,1,axis=0))*12
 norm=np.stack([-dx,-dy,np.ones_like(dx)],axis=2); norm/=np.linalg.norm(norm,axis=2)[:,:,None]
 baseim=image(family+'-base',color); normal=image(family+'-normal',norm*.5+.5)
 rough=np.clip((.6 if family=='metal' else .84)+grain*.2+macro*.1,.3,1)
 orm=image(family+'-orm',np.stack([np.clip(.94+macro*.1,0,1),rough,np.ones_like(rough)*(.65 if family=='metal' else 0)],axis=2))
 normal.colorspace_settings.name='Non-Color';orm.colorspace_settings.name='Non-Color'
 textures[family]=[baseim,normal,orm]
for name,family,tint in [('rock','rock',(1,1,1)),('weathered-rock','rock',(.82,.87,.82)),('lakeshore-stone','rock',(.68,.74,.73)),('concrete','concrete',(1,1,1)),('aged-concrete','concrete',(.8,.82,.77)),('gravel','ground',(1.15,1.1,1)),('dirt','ground',(.9,.8,.63)),('grass','ground',(.69,.90,.45)),('painted-metal','metal',(1,1,1)),('dark-metal','metal',(.45,.48,.49))]:
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*tint,1)
 nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
 for i,im in enumerate(textures[family]):
  t=nodes.new('ShaderNodeTexImage');t.image=im;t.label=['Shared base color','Shared normal','Shared AO roughness metal'][i]
  if i==0:links.new(t.outputs['Color'],bs.inputs['Base Color'])
  if i==1:
   n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.7;links.new(t.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],bs.inputs['Normal'])
  if i==2:
   split=nodes.new('ShaderNodeSeparateColor');links.new(t.outputs['Color'],split.inputs[0]);links.new(split.outputs['Green'],bs.inputs['Roughness']);links.new(split.outputs['Blue'],bs.inputs['Metallic'])
 mats[name]=m
manifest={'blender':bpy.app.version_string,'seed':SEED,'textureSize':N,'textureFamilies':list(textures),'materials':list(mats),'units':'metres','command':__doc__.splitlines()[1],'meshes':[]}
def asset(name,verts,faces,material,uvscale=5):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.validate();mesh.update();mesh.materials.append(mats[material])
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
 uv=mesh.uv_layers.new(name='Shared metric UV')
 for poly in mesh.polygons:
  # Dominant-plane UV authoring gives cliff sides and cut ledges consistent texel density.
  n=poly.normal; axis=max(range(3),key=lambda a:abs(n[a])); axes=[a for a in range(3) if a!=axis]
  for li in poly.loop_indices:
   p=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(p[axes[0]]/uvscale,p[axes[1]]/uvscale)
 obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj)
 bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 # Angle-limited smoothing preserves fracture shelves while eliminating polygon banding.
 for p in mesh.polygons:p.use_smooth=name.startswith(('cliff','boulder','shore','rubble'))
 if name.startswith(('cliff','boulder','shore','rubble')):mesh.set_sharp_from_angle(angle=math.radians(32))
 for lod,ratio in enumerate([1,.38,.12]):
  clone=obj.copy();clone.data=mesh.copy();clone.name=f'{name}_lod{lod}';bpy.context.scene.collection.objects.link(clone)
  clone['materialKey']=material
  bpy.context.view_layer.objects.active=clone
  if lod:
   mod=clone.modifiers.new('Silhouette-preserving decimation','DECIMATE');mod.ratio=ratio if name.startswith(('cliff','boulder','shore','rubble')) else max(.65,ratio);bpy.ops.object.modifier_apply(modifier=mod.name)
  clone.data.validate();clone.data.update()
  clone.data.calc_loop_triangles();manifest['meshes'].append({'name':clone.name,'material':material,'vertices':len(clone.data.vertices),'triangles':len(clone.data.loop_triangles),'lod':lod})
 obj.hide_set(True);obj.hide_render=True;obj.select_set(False)
 # Exclude authoring source from exported scene, keep it in the saved blend library.
 for c in list(obj.users_collection):c.objects.unlink(obj)
def cliff(name,variant):
 # Stratified escarpment with deep flutes, lateral shear and eroded shelves; not radial terrain cones.
 nx,nz=56,48;v=[];f=[]
 formations=[(-14,1.8,-2.4),(-8.5,3.2,1.3),(-3,1.4,-3.1),(3.3,2.4,.8),(8.7,1.9,-1.8),(14.1,2.7,1.1)]
 shelves=[(2.8,.7,.8,-.06),(7.3,.9,1.5,.13),(10.1,.6,.7,-.09),(16.6,1.2,1.8,.07),(23.8,.8,.9,-.12)]
 for iz in range(nz+1):
  t=iz/nz
  for ix in range(nx+1):
   u=ix/nx; y=(u-.5)*34
   envelope=max(0,math.sin(math.pi*u))**.38
   top=3+envelope*(24+4*math.sin(u*12+variant)+2*math.sin(u*31+1.2))
   z=-3+t*(top+3)
   fracture=sum(depth*max(0,1-abs((y-center-variant+z*.06*(j%3-1))/(width*1.7))) for j,(center,width,depth) in enumerate(formations))
   ledge=0
   for j,(level,width,depth,tilt) in enumerate(shelves):
    # Discontinuous, unequal geological benches, measured in metres rather than a periodic height fraction.
    active=.25+.75*(.5+.5*math.sin(u*7.3+j*2.1+variant))
    band=z-level-tilt*y-.3*math.sin(y*.23+j)
    ledge-=depth*active*max(0,1-abs(band/(width*1.4)))
   x=envelope*(-6.8+2.2*t+fracture+ledge+.23*math.sin(y*1.7+z*.4+variant))
   v.append((x,y,z))
 for z in range(nz):
  for x in range(nx):
   i=z*(nx+1)+x;f.append((i,i+1,i+nx+2,i+nx+1))
 # Explicit top/back quads avoid triangulating a large nonplanar ngon across the crest.
 back=len(v)
 for iz in range(nz+1):
  for ix in range(nx+1):
   front=v[iz*(nx+1)+ix];envelope=max(0,math.sin(math.pi*ix/nx))**.38
   v.append((envelope*(7+1.5*math.sin(ix*.2))+.05,front[1],front[2]))
 for iz in range(nz):
  for ix in range(nx):
   i=back+iz*(nx+1)+ix;f.append((i,i+nx+1,i+nx+2,i+1))
 for ix in range(nx):
  i=nz*(nx+1)+ix;f.append((i,i+1,back+i+1,back+i))
  f.append((ix,back+ix,back+ix+1,ix+1))
 for iz in range(nz):
  i=iz*(nx+1);f.append((i,i+nx+1,back+i+nx+1,back+i))
  i+=nx;f.append((i,back+i,back+i+nx+1,i+nx+1))
 asset(name,v,f,'rock',6)
cliff('cliff-a',0);cliff('cliff-b',1.7)
def rock(name,size,seed):
 r=random.Random(seed);nu,nv=28,16;v=[];f=[]
 phases=[r.random()*6 for _ in range(4)]
 planes=[]
 for k in range(22):
  a=r.uniform(0,math.tau);z=r.uniform(-1,1);rad=math.sqrt(1-z*z)
  planes.append(((rad*math.cos(a),rad*math.sin(a),z),r.uniform(.77,1.06)))
 for j in range(nv+1):
  lat=-math.pi/2+math.pi*j/nv
  for i in range(nu):
   a=i*math.tau/nu
   direction=(math.cos(lat)*math.cos(a),math.cos(lat)*math.sin(a),math.sin(lat))
   q=min([1.15]+[dist/dot for n,dist in planes if (dot:=sum(n[k]*direction[k] for k in range(3)))>.01])
   q*=1+.012*math.sin(a*13+lat*17+phases[0])
   x=math.cos(lat)*math.cos(a)*size[0]*q;y=math.cos(lat)*math.sin(a)*size[1]*q
   z=max(-.6,math.sin(lat)*size[2]*q+size[2]*.65)
   v.append((x,y,z))
 for j in range(nv):
  for i in range(nu):f.append((j*nu+i,j*nu+(i+1)%nu,(j+1)*nu+(i+1)%nu,(j+1)*nu+i))
 asset(name,v,f,'lakeshore-stone' if 'shore' in name else 'weathered-rock',3)
rock('boulder',(3.8,3.1,2.8),1);rock('shore-shelf',(6,3,1.2),2);rock('rubble',(1.4,1.1,.8),3)
def extrude(v,f,section,y0,y1):
 b=len(v);n=len(section);v.extend([(x,y,z) for y in [y0,y1] for x,z in section]);f.extend([tuple(b+i for i in reversed(range(n))),tuple(b+n+i for i in range(n))]);f.extend([(b+i,b+(i+1)%n,b+(i+1)%n+n,b+i+n) for i in range(n)])
# Prestressed concrete deck underside, box-girder cross sections and chamfered fascia.
v=[];f=[]
extrude(v,f,[(-17.8,-.18),(17.8,-.18),(17.8,-.7),(15.5,-1.05),(-15.5,-1.05),(-17.8,-.7)],-6,6)
for x in [-12,-4,4,12]:extrude(v,f,[(x-1.1,-.85),(x+1.1,-.85),(x+.8,-2.8),(x+.55,-3.05),(x-.55,-3.05),(x-.8,-2.8)],-6,6)
for side in [-1,1]:
 x=side*17.1
 extrude(v,f,[(x-.48,-.2),(x+.48,-.2),(x+.4,.45),(x+.18,1),(x-.18,1),(x-.4,.45)],-6,6)
asset('deck',v,f,'concrete',4)
v=[];f=[]
# Tapered twin-column bent and haunched cap. Cap kept beneath girder soffit.
extrude(v,f,[(-15,-3.12),(15,-3.12),(15,-3.8),(10,-4.6),(-10,-4.6),(-15,-3.8)],-1.3,1.3)
for x in [-10,10]:
 extrude(v,f,[(x-1.25,-4.2),(x+1.25,-4.2),(x+.8,-13),(x-.8,-13)],-1,1)
 extrude(v,f,[(x-2,-12),(x+2,-12),(x+2,-14),(x-2,-14)],-2,2)
asset('pier',v,f,'aged-concrete',4)
v=[];f=[]
for x in [-17.1,17.1]:
 for z in [1.15,1.65]:extrude(v,f,[(x-.065,z-.06),(x+.065,z-.06),(x+.065,z+.06),(x-.065,z+.06)],-6,6)
 for y in [-5.5,-2.75,0,2.75,5.5]:extrude(v,f,[(x-.08,.75),(x+.08,.75),(x+.08,1.72),(x-.08,1.72)],y-.06,y+.06)
asset('railing',v,f,'painted-metal',2)
v=[];f=[]
for x in [-16.4,16.4]:extrude(v,f,[(x-.12,-.8),(x+.12,-.8),(x+.12,-3.4),(x-.12,-3.4)],-.15,.15)
asset('drain',v,f,'dark-metal',2)
v=[];f=[]
extrude(v,f,[(-18,-.25),(18,-.25),(18,-10),(-18,-10)],-1,1)
for x in [-18,18]:extrude(v,f,[(x-1,-.25),(x+1,-.25),(x+1,-8),(x-1,-8)],-7,1)
asset('abutment',v,f,'aged-concrete',4)
# Keep native material/UV sources, but ship only placeholder material names + shared external runtime textures.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'verification/environment-phase4a/phase4a-library.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'environment.glb'),export_format='GLB',use_active_scene=True,export_yup=True,export_materials='PLACEHOLDER',export_extras=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('PHASE4A_EXPORT',len(manifest['meshes']),'meshes',sum(m['triangles'] for m in manifest['meshes']))
