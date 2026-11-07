"""Convert the public Celtic Guardian DAE to a self-contained animated mobile GLB.
Source: Yu-Gi-Oh! The Duelists of the Roses, Models Resource, uploader 3D Mage.
https://models.spriters-resource.com/playstation_2/yugiohtheduelistsoftheroses/asset/478114/
Original mesh/UV/painted textures are retained. Requires Blender 4.3+.
"""
from pathlib import Path
import bpy, math, json, sys, xml.etree.ElementTree as ET
from mathutils import Vector, Matrix, Quaternion
BASE=Path(__file__).resolve().parents[1]
SOURCE=BASE/'work/model-research/celtic-guardian/Celtic Guardian.dae'
OUT=BASE/'src/assets/models/celtic-guardian.glb'
SCRATCH=BASE/'work/model-research'
NS={'c':'http://www.collada.org/2005/11/COLLADASchema'}

def load_mesh():
    root=ET.parse(SOURCE).getroot(); geom=root.find('.//c:geometry/c:mesh',NS)
    sources={}
    for source in geom.findall('c:source',NS):
        stride=int(source.find('c:technique_common/c:accessor',NS).get('stride','1'))
        values=list(map(float,source.find('c:float_array',NS).text.split()))
        sources[source.get('id')]=[values[i:i+stride] for i in range(0,len(values),stride)]
    vertex_source={v.get('id'):v.find('c:input[@semantic="POSITION"]',NS).get('source')[1:] for v in geom.findall('c:vertices',NS)}
    faces=[];uvs=[];normals=[];material_indices=[];symbols=[];positions=None
    for tris in geom.findall('c:triangles',NS):
        symbol=tris.get('material');symbols.append(symbol);inputs={i.get('semantic'):(int(i.get('offset')),i.get('source')[1:]) for i in tris.findall('c:input',NS)}
        stride=max(i[0] for i in inputs.values())+1
        source=vertex_source[inputs['VERTEX'][1]];positions=sources[source]
        indices=list(map(int,tris.find('c:p',NS).text.split()))
        for j in range(0,len(indices),stride*3):
            face=[]
            for k in range(3):
                start=j+k*stride;face.append(indices[start+inputs['VERTEX'][0]])
                uvs.append(sources[inputs['TEXCOORD'][1]][indices[start+inputs['TEXCOORD'][0]]])
                normals.append(sources[inputs['NORMAL'][1]][indices[start+inputs['NORMAL'][0]]])
            faces.append(face);material_indices.append(len(symbols)-1)
    lo=Vector(tuple(min(p[i]for p in positions)for i in range(3)));hi=Vector(tuple(max(p[i]for p in positions)for i in range(3)));s=1.8/(hi.z-lo.z)
    positions=[((p[0]-(lo.x+hi.x)/2)*s,(p[1]-(lo.y+hi.y)/2)*s,(p[2]-lo.z)*s)for p in positions]
    mesh=bpy.data.meshes.new('CelticGuardian_TexturedMesh');mesh.from_pydata(positions,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for loop,coord in zip(uv.data,uvs):loop.uv=coord
    for poly,mi in zip(mesh.polygons,material_indices):poly.material_index=mi;poly.use_smooth=True
    mesh.normals_split_custom_set(normals)
    obj=bpy.data.objects.new('CelticGuardian',mesh);bpy.context.collection.objects.link(obj)
    images={e.get('id'):e.find('c:init_from',NS).text for e in root.findall('c:library_images/c:image',NS)}
    effects={}
    for effect in root.findall('c:library_effects/c:effect',NS):
        image_ref=effect.find('.//c:surface/c:init_from',NS).text;effects[effect.get('id')]=images[image_ref]
    materials={m.get('id'):effects[m.find('c:instance_effect',NS).get('url')[1:]] for m in root.findall('c:library_materials/c:material',NS)}
    for symbol in symbols:
        image=bpy.data.images.load(str(SOURCE.parent/materials[symbol]),check_existing=True)
        image.pack();mat=bpy.data.materials.new('Celtic_'+Path(materials[symbol]).stem);mat.use_nodes=True
        shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.68;shader.inputs['Metallic'].default_value=.05
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear';mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
        # These PS2 texture exports have fully opaque alpha; no transparent sorting.
        shader.inputs['Alpha'].default_value=1;mat.use_backface_culling=False;mesh.materials.append(mat)
    return obj

def render_views(obj,prefix):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=False
    scene.render.resolution_x=600;scene.render.resolution_y=700;scene.render.resolution_percentage=100
    world=bpy.data.worlds.new('InspectionWorld');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.20,.25,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));floor=bpy.context.object;mat=bpy.data.materials.new('Ground');mat.diffuse_color=(.04,.065,.08,1);floor.data.materials.append(mat)
    lights=[]
    for loc,energy,size in [((3,-4,6),450,4),((-3,1,3),350,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=energy;l.data.size=size;l.rotation_euler=(Vector((0,0,1))-l.location).to_track_quat('-Z','Y').to_euler();lights.append(l)
    bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=2.5
    for suffix,location in [('front',(0,-5,1.6)),('side',(5,0,1.6)),('back',(0,5,1.6)),('threequarter',(3,-5,2.4))]:
        camera.location=location;camera.rotation_euler=(Vector((0,0,.95))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(SCRATCH/f'{prefix}-{suffix}.png');bpy.ops.render.render(write_still=True)
    for o in [floor,camera,*lights]:bpy.data.objects.remove(o,do_unlink=True)

def make_rig(obj):
    data=bpy.data.armatures.new('CelticGuardian_WeightedRig');rig=bpy.data.objects.new('CelticGuardianRig',data);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    specs=[('Root',(0,.15,0),(0,.15,.82),None),('Torso',(0,.15,.82),(0,.15,1.28),'Root'),('Head',(0,.16,1.27),(0,.16,1.49),'Torso'),('WeaponGrip',(0,.23,1.26),(-.10,-.13,1.0),'Torso'),('Cape',(0,.38,1.26),(0,.4,.1),'Torso')]
    for name,head,tail,parent in specs:
        bone=data.edit_bones.new(name);bone.head=head;bone.tail=tail
        if parent:bone.parent=data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    groups={name:obj.vertex_groups.new(name=name)for name,_,_,_ in specs}
    # Connected cape and blade pieces are unambiguous. Keep the blade rigid and
    # both hands on one shared weapon control so the two-handed grip never parts.
    adjacency=[set()for v in obj.data.vertices]
    for poly in obj.data.polygons:
        for index in poly.vertices:adjacency[index].update(poly.vertices)
    seen=set();cape=set();blade=set()
    for index in range(len(adjacency)):
        if index in seen:continue
        stack=[index];seen.add(index);members=[]
        while stack:
            v=stack.pop();members.append(v)
            for neighbor in adjacency[v]-seen:seen.add(neighbor);stack.append(neighbor)
        points=[obj.data.vertices[v].co for v in members];lo=[min(v[i]for v in points)for i in range(3)];hi=[max(v[i]for v in points)for i in range(3)]
        if hi[0]-lo[0]>.9 and lo[2]<.1:cape.update(members)
        if hi[2]>1.7 and lo[1]<-.5:blade.update(members)
    def ramp(value,lo,hi):
        t=max(0,min(1,(value-lo)/(hi-lo)));return t*t*(3-2*t)
    for v in obj.data.vertices:
        x,y,z=v.co;weights={}
        if v.index in blade:weights={'WeaponGrip':1}
        elif v.index in cape:
            amount=.72*(1-ramp(z,.15,1.22));weights={'Cape':amount,'Torso':1-amount}
        else:
            torso=ramp(z,.68,.96)
            head=ramp(z,1.24,1.34) if y>-.06 else 0
            # Hands/forearms are ahead of the breastplate, shoulders stay planted.
            weapon=(1-ramp(y,-.06,.15))*ramp(z,.82,.94)*(1-ramp(z,1.13,1.28))
            weights={'Root':1-torso,'Torso':torso*(1-head)*(1-weapon),'Head':torso*head,'WeaponGrip':torso*(1-head)*weapon}
        for name,weight in weights.items():
            if weight>1e-5:groups[name].add([v.index],weight,'REPLACE')
    modifier=obj.modifiers.new('WeightedBodyWeaponCape','ARMATURE');modifier.object=rig;obj.parent=rig
    rig['source']='Yu-Gi-Oh! The Duelists of the Roses / Konami; Models Resource upload by 3D Mage'
    rig['source_url']='https://models.spriters-resource.com/playstation_2/yugiohtheduelistsoftheroses/asset/478114/'
    rig['adaptation']='Original mesh and UV textures retained; project-authored weighted guard/attack animations.'
    return rig

def animate(rig):
    scene=bpy.context.scene;scene.render.fps=60
    rig.animation_data_create();actions=[]
    def rotate(name,angles):
        bone=rig.pose.bones[name];basis=bone.bone.matrix_local.to_quaternion()
        world=Quaternion((1,0,0),angles[0])@Quaternion((0,1,0),angles[1])@Quaternion((0,0,1),angles[2])
        bone.rotation_mode='QUATERNION';bone.rotation_quaternion=basis.inverted()@world@basis
    frames={
      'Idle':[(1,0,0,0,0),(49,.008,.015,.015,.014),(97,0,0,-.018,-.016),(145,-.006,-.012,.01,.014),(193,0,0,0,0)],
      'Attack':[(1,0,0,0,0),(13,-.11,-.1,-.05,-.06),(26,.21,.58,.06,.10),(38,.16,.43,.035,.08),(49,0,0,0,0)],
      'Hit':[(1,0,0,0,0),(7,-.07,-.14,-.08,-.12),(19,0,0,0,0)],
      'Defeat':[(1,0,0,0,0),(12,.1,.15,.1,.1),(26,.32,.35,.22,.18)]}
    for name,keys in frames.items():
        action=bpy.data.actions.new(name);rig.animation_data.action=action
        for frame,torso,weapon,head,cape in keys:
            for bone in rig.pose.bones:bone.rotation_mode='QUATERNION';bone.rotation_quaternion=(1,0,0,0);bone.location=(0,0,0)
            rotate('Torso',(torso*.22,0,torso));rotate('WeaponGrip',(weapon,0,0));rotate('Head',(head*.3,0,-head));rotate('Cape',(-cape,0,cape*.35))
            for bone in rig.pose.bones:bone.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=bone.name)
        # Smooth easing while preserving the sampled impact at 0.42 seconds.
        for curve in action.fcurves:
            for key in curve.keyframe_points:key.interpolation='BEZIER'
        actions.append(action);rig.animation_data.action=None
        track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,action);strip.name=name
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.rotation_quaternion=(1,0,0,0)
    return actions

bpy.ops.wm.read_factory_settings(use_empty=True)
obj=load_mesh()
if '--inspect' in sys.argv:
    render_views(obj,'celtic-original')
else:
    rig=make_rig(obj);actions=animate(rig)
    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_nla_strips=True,export_extras=True,export_image_format='AUTO')
    print('EXPORTED',OUT,OUT.stat().st_size,flush=True)
    if '--render' in sys.argv:
        rig.animation_data.use_nla=False;rig.animation_data.action=actions[0];bpy.context.scene.frame_set(1);render_views(obj,'celtic-final')
        rig.animation_data.action=actions[1];bpy.context.scene.frame_set(26);render_views(obj,'celtic-attack')
