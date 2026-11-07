"""Retarget the documented private Duel Links sources to compact animated GLBs.
Run scripts/import-duel-links.mjs first. Original character meshes/UVs/textures
are retained; guard poses and Idle/Attack/Hit/Defeat clips are project-authored.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Quaternion
BASE=Path(__file__).resolve().parents[1]
WORK=BASE/'work'
SOURCE=WORK/'model-research'
OUT=BASE/'src/assets/models'

def radians(angles):return [math.radians(v) for v in angles]
def pose_rotation(bone,angles):
    # Author in consistent Blender world axes instead of each game's bone roll.
    basis=bone.bone.matrix_local.to_quaternion()
    angles=radians(angles)
    q=Quaternion((1,0,0),angles[0])@Quaternion((0,1,0),angles[1])@Quaternion((0,0,1),angles[2])
    bone.rotation_mode='QUATERNION';bone.rotation_quaternion=basis.inverted()@q@basis

def setup_materials(kind,folder,data):
    cache={};images={}
    for old in list(bpy.data.materials):
        record=data['materials'].get(old.name)
        if not record:continue
        filename=record['maps'].get('map','')
        key=filename
        if key in cache:replacement=cache[key]
        else:
            replacement=bpy.data.materials.new('Arena_'+kind+'_'+Path(filename).stem);replacement.use_nodes=True;cache[key]=replacement
            nodes=replacement.node_tree.nodes;shader=nodes.get('Principled BSDF');links=replacement.node_tree.links
            shader.inputs['Roughness'].default_value=.44 if kind=='dragon' else .64
            shader.inputs['Metallic'].default_value=.27 if kind=='dragon' else .08
            shader.inputs['Base Color'].default_value=(.7,.7,.72,1)
            path=folder/filename
            if path.is_file():
                if filename not in images:
                    image=bpy.data.images.load(str(path),check_existing=True);image.colorspace_settings.name='sRGB';images[filename]=image
                tex=nodes.new('ShaderNodeTexImage');tex.image=images[filename];links.new(tex.outputs['Color'],shader.inputs['Base Color'])
                # A restrained fill preserves the painted anime details on mobile.
                links.new(tex.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=.12 if kind=='dragon' else .16
                if kind=='dragon':
                    normalfile=filename.replace('_tex','_nomal_tex')
                    if (folder/normalfile).is_file():
                        normalimage=bpy.data.images.load(str(folder/normalfile),check_existing=True);normalimage.scale(256,256);normalimage.colorspace_settings.name='Non-Color'
                        normaltex=nodes.new('ShaderNodeTexImage');normaltex.image=normalimage
                        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.3;links.new(normaltex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
            shader.inputs['Alpha'].default_value=1
            # Exported source alphas are shader masks, not body transparency.
            replacement.use_backface_culling=False
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH':
                for slot in obj.material_slots:
                    if slot.material==old:slot.material=replacement
    return cache

def alias_bones(rig,kind):
    mapping={'MMD_004007_L_Wing1':'WingLeft','MMD_004007_R_Wing1':'WingRight','MMD_004007_Head':'Head','MMD_004007_chin':'Jaw','MMD_004007_Neck':'Neck','MMD_004007_tail1':'Tail'} if kind=='dragon' else {'MMD_004041_LeftArm':'ArmLeft','MMD_004041_RightArm':'ArmRight','MMD_004041_Head':'Head'}
    for old,new in mapping.items():
        if old in rig.data.bones:rig.data.bones[old].name=new

def animate(rig,kind):
    rig.animation_data_clear();rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=60
    if kind=='dragon':
        base={'WingLeft':(0,0,95),'WingRight':(0,0,-95),'Neck':(-24,0,0),'MMD_004007_Neck1':(-17,0,0),'MMD_004007_Neck2':(-8,0,0),'MMD_004007_Neck3':(8,0,0),'Head':(19,0,0),'Jaw':(7,0,0),'Tail':(0,0,5),'MMD_004007_tail2':(0,0,-8),'MMD_004007_tail3':(0,0,6),'MMD_004007_LBicep':(10,42,-18),'MMD_004007_RBicep':(10,-42,18)}
    else:
        base={'ArmRight':(-20,-7,-4),'MMD_004041_RightForeArm':(-35,0,0),'MMD_004041_RightHand':(-35,0,0),'ArmLeft':(-16,8,8),'MMD_004041_LeftForeArm':(-28,0,-8),'MMD_004041_Spine1':(0,0,-4),'MMD_004041_Spine2':(0,0,4),'Head':(0,0,0),'MMD_004041_RearSkirt1':(0,0,0),'MMD_004041_FrontSkirt1':(0,0,0)}
    actions=[]
    for name,duration in [('Idle',3.2),('Attack',.85),('Hit',.3),('Defeat',.42)]:
        action=bpy.data.actions.new(name);rig.animation_data.action=action
        if name=='Idle':times=[0,.8,1.6,2.4,3.2]
        elif name=='Attack':times=[0,.17,.32,.42,.58,.85]
        elif name=='Hit':times=[0,.09,.18,.3]
        else:times=[0,.16,.42]
        for time in times:
            values={k:list(v) for k,v in base.items()}
            if name=='Idle':
                wave=math.sin(time*math.tau/3.2)
                if kind=='dragon':
                    values['WingLeft'][2]+=wave*4;values['WingRight'][2]-=wave*4;values['Head'][0]+=wave*1.5;values['Tail'][2]+=wave*3;values['MMD_004007_tail2'][2]-=wave*3
                else:
                    values['ArmRight'][0]+=wave*1.2;values['ArmLeft'][0]-=wave*.7;values['Head'][2]+=wave*.8;values['MMD_004041_RearSkirt1'][0]+=wave*1.8;values['MMD_004041_FrontSkirt1'][0]-=wave*.6
            elif name=='Attack':
                # Anticipation, release at the presentation's 0.42 s impact, recovery.
                wind=math.sin(math.pi*min(1,time/.32)) if time<.32 else 0
                strike=math.sin(math.pi*(time-.2)/.65) if time>=.2 else 0
                strike=max(0,strike)
                if kind=='dragon':
                    values['WingLeft'][2]+=wind*13-strike*9;values['WingRight'][2]-=wind*13-strike*9
                    values['Neck'][0]+=-wind*7+strike*8;values['Head'][0]+=-wind*7+strike*5;values['Jaw'][0]+=strike*24
                    values['Tail'][2]-=strike*9
                else:
                    values['ArmRight'][0]+=-wind*16-strike*30;values['MMD_004041_RightForeArm'][0]+=-wind*12+strike*10
                    values['MMD_004041_RightHand'][0]+=strike*90;values['ArmLeft'][0]-=strike*23
                    values['MMD_004041_Spine1'][2]+=-wind*7+strike*12;values['Head'][2]-=strike*4
                    values['MMD_004041_RearSkirt1'][0]+=strike*5
            elif name=='Hit':
                recoil=math.sin(math.pi*time/.3)
                values['Head'][0]-=recoil*8
                values['Neck' if kind=='dragon' else 'MMD_004041_Spine1'][0]-=recoil*5
            else:
                fall=(time/.42)**1.5;values['Head'][0]+=fall*24
                values['Neck' if kind=='dragon' else 'MMD_004041_Spine1'][0]+=fall*18
                if kind=='dragon':values['WingLeft'][2]-=fall*22;values['WingRight'][2]+=fall*22
                else:values['ArmRight'][0]+=fall*17
            frame=round(time*60)+1
            for bone_name,angles in values.items():
                bone=rig.pose.bones.get(bone_name)
                if bone:
                    pose_rotation(bone,angles);bone.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=bone_name)
                    if kind=='dragon' and bone_name in ('WingLeft','WingRight'):
                        bone.scale=(1.55,1.55,1.55);bone.keyframe_insert(data_path='scale',frame=frame,group=bone_name)
        for curve in action.fcurves:
            for key in curve.keyframe_points:key.interpolation='BEZIER'
        actions.append(action);rig.animation_data.action=None
        track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,action)
    rig.animation_data.action=None;scene.frame_set(1)
    return actions

def inspect_render(kind,rig,actions):
    from importlib.util import spec_from_file_location,module_from_spec
    # Reuse the standalone inspection stage without importing/converting another asset.
    scene=bpy.context.scene;rig.animation_data.use_nla=False;rig.animation_data.action=actions[0];scene.frame_set(1)
    deps=bpy.context.evaluated_depsgraph_get();meshes=[o for o in scene.objects if o.type=='MESH' and o.name!='Icosphere']
    points=[o.matrix_world@Vector(p) for o in [m.evaluated_get(deps) for m in meshes] for p in o.bound_box]
    low=Vector([min(p[i]for p in points)for i in range(3)]);high=Vector([max(p[i]for p in points)for i in range(3)]);target=(low+high)/2;height=high.z-low.z;width=high.x-low.x;radius=max(height,width)*1.15
    scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=False
    scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100
    world=bpy.data.worlds.new('InspectionWorld');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.13,.18,.23,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
    bpy.ops.mesh.primitive_plane_add(size=20,location=(0,0,low.z-.001));floor=bpy.context.object;ground=bpy.data.materials.new('Stage');ground.diffuse_color=(.02,.04,.055,1);floor.data.materials.append(ground)
    for factor,color,power in [((2,-3,4),(1,.87,.72),1.4),((-3,-1,2),(.57,.78,1),1),((0,3,3),(.7,.95,1),1.8)]:
        bpy.ops.object.light_add(type='AREA',location=target+Vector(factor)*radius);light=bpy.context.object;light.data.energy=power*radius*radius*100;light.data.color=color;light.data.size=radius*2;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=radius*1.35
    for name,action,frame in [('idle',actions[0],1),('attack',actions[1],26)]:
        rig.animation_data.action=action;scene.frame_set(frame)
        camera.location=target+Vector((1,-3,1.0))*radius;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(WORK/f'{kind}-{name}-preview.png');bpy.ops.render.render(write_still=True)

for kind,folder,filename in [('dragon','blue-eyes-duel-links/Blue-Eyes White Dragon','blue-eyes-white-dragon'),('mage','dark-magician-duel-links/Dark Magician','dark-magician')]:
    if '--dragon-only' in sys.argv and kind!='dragon':continue
    if '--mage-only' in sys.argv and kind!='mage':continue
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(WORK/f'{kind}-intermediate.glb'))
    data=json.loads((WORK/f'{kind}-import.json').read_text());setup_materials(kind,SOURCE/folder,data)
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('_')];rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    alias_bones(rig,kind)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();body=bpy.context.object;body.name='BlueEyes_TexturedSkin' if kind=='dragon' else 'DarkMagician_TexturedSkin'
    # Weld the COLLADA triangle stream before exporting indexed glTF geometry.
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.0000001);bpy.ops.object.mode_set(mode='OBJECT')
    if kind=='dragon':
        modifier=body.modifiers.new('MobileSilhouetteBudget','DECIMATE');modifier.ratio=.85;modifier.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    actions=animate(rig,kind)
    rig['source']='Yu-Gi-Oh! Duel Links / Konami; Models Resource';rig['source_url']='https://models.spriters-resource.com/mobile/yugiohduellinks/asset/'+('304698/' if kind=='dragon' else '304700/')
    rig['adaptation']='Original textured skin and game skeleton; project-authored guard, attack, hit and defeat animations.'
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=rig
    path=OUT/(filename+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_nla_strips=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=90,export_optimize_animation_size=True)
    print('EXPORTED',kind,path.stat().st_size,flush=True)
    if '--render' in sys.argv:inspect_render(kind,rig,actions)
