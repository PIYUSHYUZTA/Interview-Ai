"""Landing hero: the CC0 MakeHuman character as a capped portrait bust inside an original orbital halo."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from generate_assets import *
from web_assets import thin_strands, organize, is_character, is_camera_or_light
import bmesh
from mathutils import Matrix
reset()
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/avatar-source/mpfb.glb'))
# Blinks and a trace of a smile are the only expressions the hero uses.
keep = {'eyeBlinkLeft','eyeBlinkRight','mouthSmileLeft','mouthSmileRight'}
rig = None
for obj in list(bpy.context.scene.objects):
    if obj.type == 'MESH' and obj.data.shape_keys:
        for key in list(obj.data.shape_keys.key_blocks)[1:]:
            if key.name not in keep:
                obj.shape_key_remove(key)
    if obj.type == 'ARMATURE':
        rig = obj
        obj.name = 'HeroRig'
        # Same relaxed shoulders as the interview room, so the crop follows a natural pose.
        bpy.context.view_layer.update()
        for side, sign in [('Left',1),('Right',-1)]:
            bone = obj.pose.bones.get(side+'Arm')
            if bone:
                current = (bone.tail-bone.head).normalized()
                target = (obj.matrix_world.inverted().to_3x3() @ Vector((sign*.12,0,-1))).normalized()
                turn = current.rotation_difference(target).to_matrix().to_4x4()
                bone.matrix = Matrix.Translation(bone.head) @ turn @ Matrix.Translation(-bone.head) @ bone.matrix
        bpy.context.view_layer.update()
head_z = (rig.matrix_world @ rig.pose.bones['Head'].head).z
cut_z = head_z - .3
cap = material('Charcoal bust cap', 'charcoal', .2, .6)
# Crop in posed space (armature output keeps vertex order), then cap the open section.
depsgraph = bpy.context.evaluated_depsgraph_get()
for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    evaluated = obj.evaluated_get(depsgraph)
    posed = evaluated.to_mesh()
    below = {v.index for v in posed.vertices if (evaluated.matrix_world @ v.co).z < cut_z}
    evaluated.to_mesh_clear()
    if len(below) == len(obj.data.vertices):
        bpy.data.objects.remove(obj)
        continue
    if not below:
        continue
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.verts.ensure_lookup_table()
    bmesh.ops.delete(mesh, geom=[mesh.verts[i] for i in below], context='VERTS')
    filled = bmesh.ops.holes_fill(mesh, edges=[e for e in mesh.edges if e.is_boundary], sides=0)['faces']
    obj.data.materials.append(cap)
    for face in filled:
        face.material_index = len(obj.data.materials)-1
    mesh.to_mesh(obj.data)
    mesh.free()
# The lips stay closed, so the mouth interior is never exported. Hair cards keep
# full topology: decimating alpha cards breaks their silhouettes.
for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    if 'teeth' in obj.name or 'tongue' in obj.name:
        bpy.data.objects.remove(obj)
# Lash strands are minimal tubes already; halving their count is shape-key safe.
for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH' and 'eyelash' in o.name]:
    thin_strands(obj)
for image in bpy.data.images:
    limit = 1024 if 'female_diffuse' in image.name else 512
    if image.size[0] > limit:
        image.scale(limit,limit)
        image.pack()
for mat in bpy.data.materials:
    if 'casualsuit' in mat.name:
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            for link in list(bsdf.inputs['Base Color'].links): mat.node_tree.links.remove(link)
            bsdf.inputs['Base Color'].default_value=(*linear(PALETTE['charcoal']),1)
            bsdf.inputs['Roughness'].default_value=.6
# The halo uses the whole palette with restraint: Charcoal titanium orbits, one brushed
# Burnt Amber orbit with an Earth Brown core, Electric Teal and Cerulean light inlays,
# and a single Neon Rose lip.
metal = material('Charcoal titanium', 'charcoal', .92, .29)
brass = material('Burnt Amber brushed metal', 'amber', .9, .34)
earth = material('Earth Brown core metal', 'earth', .8, .4)
teal = material('Electric Teal light inlay', 'teal', .1, .22, 2.4)
cerulean = material('Cerulean light inlay', 'cerulean', .1, .22, 2.8)
rose = material('Neon Rose lip', 'rose', .6, .25, 1.2)
amber = brass
halo = pivot('HaloPivot', (0, .22, head_z+.08))
for index, (radius, rotation) in enumerate([(.34, (math.pi/2+.18, .12, 0)), (.43, (math.pi/2-.32, -.2, .3)), (.53, (math.pi/2+.42, .3, -.2))]):
    torus(f'HaloOrbit{index}', radius, .008 if index else .011, brass if index == 2 else metal, location=halo.location, rotation=rotation, parent=halo)
    torus(f'HaloInlay{index}', radius+.012, .0022, cerulean if index == 1 else teal, location=halo.location, rotation=rotation, parent=halo)
    if index == 2:
        torus('HaloEarthCore', radius-.009, .0035, earth, location=halo.location, rotation=rotation, parent=halo)
    if index == 1:
        torus('HaloRoseLip', radius-.011, .0022, rose, location=halo.location, rotation=rotation, parent=halo)
for index in range(14):
    a = index * math.tau / 14
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.004 if index % 4 else .007, location=(math.cos(a)*.6, .22+math.sin(a*2)*.08, head_z+.08+math.sin(a)*.5))
    assign(bpy.context.object, f'HaloParticle{index}', amber if index % 7 == 0 else teal, halo)
for frame, angle in [(1, 0), (121, math.pi), (241, math.tau)]:
    halo.rotation_euler.y = angle
    halo.keyframe_insert(data_path='rotation_euler', frame=frame)
bpy.context.scene.frame_set(1)
scene = bpy.context.scene
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (*linear(PALETTE['ink']), 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .05
target = Vector((0, 0, head_z-.03))
bpy.ops.object.camera_add(location=(0, -1.45, head_z+.02))
camera = bpy.context.object
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 50
scene.camera = camera
# Warm Ivory key, strong Cerulean rim, restrained Neon Rose kicker, low Burnt Amber bounce.
for name, location, color, energy, size in [('Key', (-1.1,-1.5,head_z+.5), 'ivory', 55, 1.2), ('Cerulean rim', (.9,.7,head_z+.3), 'cerulean', 420, .7), ('Rose kicker', (-1.,.6,head_z-.2), 'rose', 55, .5), ('Amber bounce', (.6,-1.2,head_z-.7), 'amber', 22, 1.4)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.name = name
    light.data.color = linear(PALETTE[color])
    light.data.energy = energy
    light.data.shape = 'DISK'
    light.data.size = size
    light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.film_transparent=True
organize(scene, {'Character': is_character, 'Camera and lights': is_camera_or_light, 'Halo': lambda obj: True})
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES/'hero-bust.blend'))
asset = OUTPUT/'hero-bust.glb'
bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',export_apply=False,export_animations=True,export_rest_position_armature=False,export_current_frame=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=82)
triangles = 0
for obj in scene.objects:
    if obj.type == 'MESH':
        mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
if triangles > 90000 or asset.stat().st_size > 6_000_000:
    raise RuntimeError(f'hero bust exceeded the web asset budget: {triangles} triangles, {asset.stat().st_size} bytes')
if options.render:
    scene.render.image_settings.file_format='WEBP'
    scene.render.image_settings.color_mode='RGBA'
    scene.render.image_settings.quality=82
    scene.render.filepath=str(OUTPUT/'hero-bust-poster.webp')
    bpy.ops.render.render(write_still=True)
source=ROOT/'assets/avatar-source/mpfb.glb'
receipt={'source':'assets/avatar-source/mpfb.glb','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'license':'CC0-1.0','preparedSource':'assets/blender/hero-bust.blend','file':'/models/hero-bust.glb','poster':'/models/hero-bust-poster.webp','blender':bpy.app.version_string,'triangles':triangles,'bytes':asset.stat().st_size,'sha256':hashlib.sha256(asset.read_bytes()).hexdigest()}
(OUTPUT/'hero-bust-manifest.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print('HERO_BUST',json.dumps(receipt))
