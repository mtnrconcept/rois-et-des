"""Export the actual authored Blender board as a compact, merged web asset."""
import bpy, json, math, time, sys, argparse
from pathlib import Path
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--base-blend',required=True)
parser.add_argument('--asset-dir',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.base_blend).resolve()))
DEST=Path(args.asset_dir).resolve()
DEST.mkdir(parents=True,exist_ok=True)
source=bpy.context.scene
deps=bpy.context.evaluated_depsgraph_get()
groups={}; skipped=[]; source_count=0

def visible_decoration(ob):
    if ob.type not in {'MESH','CURVE','FONT','SURFACE'} or ob.hide_render:return False
    center=sum((ob.matrix_world @ Vector(v) for v in ob.bound_box),Vector())/8
    if ob.name.startswith('Rose') and abs(center.x)<1.5 and abs(center.y)<1.5:
        skipped.append(ob.name);return False
    if ob.name.startswith('Jeton') or (ob.name.startswith(('Lion','Aigle')) and 14.1<abs(center.x)<15.1 and -4.2<center.y<5.6 and center.z<1.7):
        skipped.append(ob.name);return False
    return True

def web_material(mat):
    name=mat.name if mat else 'Pierre'
    col=tuple(mat.diffuse_color[:3]) if mat else (.45,.38,.27)
    metal=0.;rough=.6
    if mat and mat.use_nodes:
        bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if bs:
            metal=bs.inputs['Metallic'].default_value;rough=bs.inputs['Roughness'].default_value
            if not bs.inputs['Base Color'].is_linked:col=tuple(bs.inputs['Base Color'].default_value[:3])
    if 'Or raye' in name:col=(.60,.32,.075);metal=.78;rough=.32
    if 'Marbre ivoire' in name:col=(.73,.60,.41);metal=.05;rough=.38
    if 'Marbre noir' in name:col=(.035,.04,.038);metal=.05;rough=.37
    m=bpy.data.materials.new('WEB • '+name);m.use_nodes=True;m.diffuse_color=(*col,1)
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*col,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=max(.23,rough)
    if 'EAU' in name.upper() or 'EAU' in name:
        bs.inputs['Base Color'].default_value=(.012,.13,.19,1);bs.inputs['Metallic'].default_value=.42;bs.inputs['Roughness'].default_value=.22
    return m

for ob in list(source.objects):
    if not visible_decoration(ob):continue
    if ob.type in {'CURVE','FONT'}:ob.data.bevel_resolution=min(ob.data.bevel_resolution,1);ob.data.resolution_u=2
    for mod in ob.modifiers:
        if mod.type=='BEVEL':mod.segments=1
    ev=ob.evaluated_get(deps)
    me=ev.to_mesh()
    if not me:continue
    world=ob.matrix_world
    # Split meshes by material and merge all repeated decorations into a few draws.
    mats=list(me.materials)
    bymat={}
    for poly in me.polygons:bymat.setdefault(poly.material_index,[]).append(poly)
    for idx,polys in bymat.items():
        mat=mats[idx] if idx<len(mats) else None
        if ob.name.startswith('Case ') and mat:
            dark=(ord(ob.name[5])-65+int(ob.name[6])-1)%2==0
            choices=['BLENDERKIT • Marbre noir • variation','MARBRE • noir veine'] if dark else ['BLENDERKIT • Marbre ivoire • Simple marble','MARBRE • travertin dore']
            mat=next((bpy.data.materials.get(n) for n in choices if bpy.data.materials.get(n)),mat)
        key=mat.name if mat else 'Pierre'
        g=groups.setdefault(key,{'verts':[],'faces':[],'smooth':[],'mat':mat})
        used=sorted({v for p in polys for v in p.vertices});offset=len(g['verts']);mapping={v:i+offset for i,v in enumerate(used)}
        g['verts'].extend(tuple(world@me.vertices[v].co) for v in used)
        g['faces'].extend(tuple(mapping[v] for v in p.vertices) for p in polys)
        g['smooth'].extend(p.use_smooth for p in polys)
    ev.to_mesh_clear();source_count+=1
    if source_count%500==0:print('MERGED',source_count,flush=True)

out=bpy.data.scenes.new('Royal Fleet • Web export');bpy.context.window.scene=out
for name,g in groups.items():
    me=bpy.data.meshes.new(name);me.from_pydata(g['verts'],[],g['faces']);me.update()
    ob=bpy.data.objects.new(name,me);out.collection.objects.link(ob);ma=web_material(g['mat']);me.materials.append(ma)
    for p,sm in zip(me.polygons,g['smooth']):p.use_smooth=sm
    # Mild geometric variation substitutes procedural shading unsupported by glTF.
    if any(w in name for w in ['CALCAIRE','Marbre','CHENE']):
        colors=me.color_attributes.new(name='Patine',type='BYTE_COLOR',domain='CORNER')
        for loop in me.loops:
            p=me.vertices[loop.vertex_index].co
            patina=.83+.17*(.5+.5*math.sin(p.x*4.8+math.sin(p.y*5.2)+p.z*7.1))
            colors.data[loop.index].color=(*(v*patina for v in ma.diffuse_color[:3]),1)
        bs=ma.node_tree.nodes.get('Principled BSDF');base=bs.inputs['Base Color'].default_value[:]
        attr=ma.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Patine'
        ma.node_tree.links.new(attr.outputs['Color'],bs.inputs['Base Color'])
        # A connected attribute is exported as COLOR_0 by Blender's glTF exporter.
    ob.select_set(True)

def export(path):
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=False,use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_apply=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=14,export_draco_normal_quantization=10,export_yup=True)

export(DEST/'board.glb')
stats={'source_objects':source_count,'draw_meshes':len(groups),'vertices':sum(len(g['verts']) for g in groups.values()),'faces':sum(len(g['faces']) for g in groups.values()),'bytes':(DEST/'board.glb').stat().st_size,'removed_decorations':len(skipped),'chess':{'a1':[-3.85,1.56,3.85],'spacing':1.10},'source':'citadelle-des-marees.blend','compression':'Draco'}

checker=bpy.data.scenes.new('Royal Fleet • Race checker');bpy.context.window.scene=checker
def mat(name,col,metal):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*col,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=.3;return m
gold=mat('Checker • gold',(.68,.39,.09),.76);enamel=mat('Checker • enamel',(.5,.5,.5),.35)
for radius,depth,z,ma in [(.41,.15,.075,gold),(.366,.018,.159,enamel),(.366,.018,.0,enamel)]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=radius,depth=depth,location=(0,0,z));ob=bpy.context.object;ob.name=ma.name;ob.data.materials.append(ma)
for rr,zz in [(.39,.156),(.33,.173)]:
    bpy.ops.mesh.primitive_torus_add(major_radius=rr,minor_radius=.009,major_segments=48,minor_segments=6,location=(0,0,zz));bpy.context.object.data.materials.append(gold)
for k in range(8):
    a=k*math.pi/4;verts=[(0,0,.174),(.09*math.cos(a+.5),.09*math.sin(a+.5),.174),(.25*math.cos(a),.25*math.sin(a),.174)]
    me=bpy.data.meshes.new('Rose');me.from_pydata(verts,[],[(0,1,2)]);me.materials.append(gold);ob=bpy.data.objects.new('Rose des vents',me);checker.collection.objects.link(ob)
export(DEST/'checker.glb')
(DEST/'board-manifest.json').write_text(json.dumps(stats,indent=2),encoding='utf8')
print('WEB_BOARD_EXPORTED',json.dumps(stats),flush=True)
