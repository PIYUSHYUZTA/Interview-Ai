"""Prepare the CC0 MakeHuman character and original interview architecture."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from generate_assets import *
reset()
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/avatar-source/mpfb.glb'))
keep = {'eyeBlinkLeft','eyeBlinkRight','mouthSmileLeft','mouthSmileRight','browInnerUp'}
for obj in list(bpy.context.scene.objects):
    if obj.type == 'MESH' and obj.data.shape_keys:
        for key in list(obj.data.shape_keys.key_blocks)[1:]:
            if not key.name.startswith('viseme_') and key.name not in keep:
                obj.shape_key_remove(key)
    if obj.type == 'ARMATURE':
        obj.name = 'InterviewerRig'
        # Lower the upper arms from the model's rest pose for a seated portrait.
        from mathutils import Matrix
        bpy.context.view_layer.update()
        for side, sign in [('Left',1),('Right',-1)]:
            bone = obj.pose.bones.get(side+'Arm')
            if bone:
                current = (bone.tail-bone.head).normalized()
                target = (obj.matrix_world.inverted().to_3x3() @ Vector((sign*.12,0,-1))).normalized()
                turn = current.rotation_difference(target).to_matrix().to_4x4()
                bone.matrix = Matrix.Translation(bone.head) @ turn @ Matrix.Translation(-bone.head) @ bone.matrix
        bpy.context.view_layer.update()
for image in bpy.data.images:
    limit = 2048 if 'female_diffuse' in image.name else 1024
    if image.size[0] > limit:
        image.scale(limit,limit)
        image.pack()
# Body/eye maps retain natural skin and eye colors. Architecture/clothing use brand tones.
for mat in bpy.data.materials:
    if 'casualsuit' in mat.name:
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            for link in list(bsdf.inputs['Base Color'].links): mat.node_tree.links.remove(link)
            bsdf.inputs['Base Color'].default_value=(*linear(PALETTE['charcoal']),1)
            bsdf.inputs['Roughness'].default_value=.65
ink=material('Ink architectural surface','ink',.08,.65)
metal=material('Earth architectural metal','earth',.8,.32)
teal=material('Teal studio light','teal',.1,.3,1.2)
amber=material('Amber studio accent','amber',.6,.3)
box('Floor',(0,0,-.025),(8,6,.05),ink)
box('Backdrop',(0,1.8,1.8),(8,.15,4),ink)
# Layered architecture provides perspective, occlusion and shadow receivers.
charcoal=material('Charcoal acoustic felt','charcoal',0,.95)
stone=material('Warm ivory ceramic','ivory',0,.72)
box('LeftReturn',(-2.3,.25,1.6),(.18,3.1,3.2),charcoal)
box('RightReturn',(2.3,.25,1.6),(.18,3.1,3.2),charcoal)
box('CeilingCoffer',(0,.3,3.05),(4.6,3.1,.14),charcoal)
box('InsetAcousticPanel',(0,1.65,1.65),(1.6,.1,2.3),charcoal)
for side in (-1,1):
    box('GalleryUpright'+str(side),(side*1.65,1.42,1.45),(.045,.24,2.2),metal)
    for level in (.65,1.15,1.8):
        box('GalleryShelf'+str(side)+str(level),(side*1.65,1.35,level),(.9,.48,.045),metal)
    box('ShelfLight'+str(side),(side*1.65,1.39,1.77),(.74,.018,.012),amber)
    for book in range(4):
        box('ReferenceVolume'+str(side)+str(book),(side*1.65-.18+book*.09,1.35,1.32),(.065,.19,.3+book*.018),charcoal if book%2 else metal)
    sphere('CeramicObject'+str(side),(side*1.65,1.35,1.94),(.11,.11,.12),stone)
# A substantial foreground work surface grounds the standing interviewer.
box('DeskPedestalLeft',(-.85,-.66,.42),(.12,.6,.84),metal)
box('DeskPedestalRight',(.85,-.66,.42),(.12,.6,.84),metal)
box('DeskFront',(0,-.96,.65),(2.3,.06,.43),charcoal)
box('InterviewNotebook',(.66,-.74,.925),(.35,.25,.018),metal)
box('NotebookPages',(.66,-.74,.938),(.33,.23,.008),stone)

for sign in (-1,1):
    box('ArchitecturalPier'+str(sign),(sign*1.4,1.04,1.6),(.11,.2,3.2),metal)
    box('TealReveal'+str(sign),(sign*1.33,.92,1.6),(.018,.03,2.8),teal)
    for index in range(5):
        box('AcousticSlat'+str(sign)+str(index),(sign*(1.7+index*.15),1.05,1.65),(.025,.15,3.3),metal)
box('Desk',(0,-.68,.88),(2.5,.8,.065),ink)
box('DeskRim',(0,-1.09,.88),(2.5,.015,.012),amber)
camera_and_lights((0,-2.35,1.48),(0,0,1.27))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32
scene.render.resolution_x=900;scene.render.resolution_y=650;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES/'human-interview-studio.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUTPUT/'human-interview-studio.glb'),export_format='GLB',export_apply=False,export_animations=False,export_rest_position_armature=False,export_current_frame=True,export_cameras=False,export_lights=False,export_image_quality=85)
if options.render:
    scene.render.filepath=str(SOURCES/'human-interview-studio-preview.png')
    bpy.ops.render.render(write_still=True)
asset=OUTPUT/'human-interview-studio.glb'
source=ROOT/'assets/avatar-source/mpfb.glb'
receipt={'source':'assets/avatar-source/mpfb.glb','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'license':'CC0-1.0','preparedSource':'assets/blender/human-interview-studio.blend','file':'/models/human-interview-studio.glb','bytes':asset.stat().st_size,'sha256':hashlib.sha256(asset.read_bytes()).hexdigest()}
(OUTPUT/'human-interviewer-manifest.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print('AVATAR_BYTES',(OUTPUT/'human-interview-studio.glb').stat().st_size)
