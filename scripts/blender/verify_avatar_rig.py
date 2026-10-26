"""Levels 1-2 of avatar verification, measured in Blender on the shipped web GLB.

Level 1 (complete 3D model): meshes, triangles, materials and embedded textures.
Level 2 (rigged character): every face shape and bone the runtime drives is applied in
isolation and must move the expected vertices; unrelated regions must stay still.
Run: blender -b --factory-startup --python scripts/blender/verify_avatar_rig.py -- <file.glb>
"""
import json
import sys
from math import radians

import bpy
from mathutils import Euler

path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=path)
scene = bpy.context.scene
depsgraph = bpy.context.evaluated_depsgraph_get()

def positions(obj):
    depsgraph.update()
    evaluated = obj.evaluated_get(depsgraph); mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return points

def displacement(obj, before):
    after = positions(obj)
    moved = [(b - a).length for a, b in zip(before, after)]
    return max(moved, default=0), sum(1 for m in moved if m > .0005), after

report = {'file': path, 'level1': {}, 'level2': {'shapes': {}, 'bones': {}}, 'failures': []}
meshes = [o for o in scene.objects if o.type == 'MESH']
triangles = 0
for obj in meshes:
    mesh = obj.evaluated_get(depsgraph).to_mesh(); mesh.calc_loop_triangles(); triangles += len(mesh.loop_triangles); obj.evaluated_get(depsgraph).to_mesh_clear()
textures = sorted({f'{image.name} {image.size[0]}x{image.size[1]}' for image in bpy.data.images if image.size[0]})
report['level1'] = {'meshes': len(meshes), 'triangles': triangles, 'materials': len(bpy.data.materials), 'textures': textures}
if triangles == 0 or not textures: report['failures'].append('level1: no geometry or textures')

rig = next((o for o in scene.objects if o.type == 'ARMATURE'), None)
skinned = [o for o in meshes if o.find_armature() == rig] if rig else []
if not rig or not skinned:
    report['failures'].append('level2: no armature or skinned meshes')
else:
    head_z = (rig.matrix_world @ rig.pose.bones['Head'].head).z
    # Scale and orientation: metres, Z-up after import, face toward -Y (glTF +Z, the web camera).
    head = rig.matrix_world @ rig.pose.bones['Head'].head
    eyes = [rig.matrix_world @ rig.pose.bones[name].head for name in ('LeftEye', 'RightEye') if name in rig.pose.bones]
    report['level1']['headHeightMetres'] = round(head.z, 3)
    report['level1']['eyesForwardOfHeadMetres'] = round(min((head.y - eye.y) for eye in eyes), 3) if eyes else None
    if not 1.4 <= head.z <= 1.9: report['failures'].append(f'level1: head joint at {head.z:.2f} m is not adult human scale')
    if not eyes or min(head.y - eye.y for eye in eyes) <= 0: report['failures'].append('level1: eyes are not forward of the head joint (wrong facing)')
    if eyes and abs(eyes[0].x + eyes[1].x) > .01: report['failures'].append('level1: eyes are not symmetric about the centre line')
    # Each runtime-driven shape alone, measured on every mesh that carries it (body, lashes, teeth...).
    for name in ['jawOpen','mouthClose','mouthFunnel','mouthPucker','mouthStretchLeft','mouthStretchRight','mouthPressLeft','mouthPressRight','viseme_aa','viseme_O','viseme_E','viseme_U','viseme_PP','viseme_FF','eyeBlinkLeft','eyeBlinkRight','mouthSmileLeft','browInnerUp']:
        carriers = [o for o in skinned if o.data.shape_keys and o.data.shape_keys.key_blocks.get(name)]
        if not carriers: report['failures'].append(f'level2: shape {name} missing'); continue
        most, count, lowest = 0, 0, head_z
        for obj in carriers:
            rest = positions(obj); key = obj.data.shape_keys.key_blocks[name]; key.value = 1
            moved, moved_count, after = displacement(obj, rest)
            lowest = min([lowest] + [a.z for a, b in zip(after, rest) if (a - b).length > .0005])
            key.value = 0; most = max(most, moved); count += moved_count
        report['level2']['shapes'][name] = {'meshes': [o.name for o in carriers], 'maxMillimetres': round(most * 1000, 2), 'verticesMoved': count, 'confinedToHead': lowest > head_z - .12}
        if most < .0008 or count < 5: report['failures'].append(f'level2: shape {name} does not visibly deform')
        if lowest <= head_z - .12: report['failures'].append(f'level2: shape {name} moves vertices below the face')
    # Bones the runtime rotates: Head (yaw) and LeftEye/RightEye (gaze), on the meshes weighted to them.
    for bone_name, angle in [('Head', 10), ('LeftEye', 12), ('RightEye', 12)]:
        bone = rig.pose.bones.get(bone_name)
        if not bone: report['failures'].append(f'level2: bone {bone_name} missing'); continue
        targets = [o for o in skinned if o.vertex_groups.get(bone_name)]
        if not targets: report['failures'].append(f'level2: no mesh weighted to {bone_name}'); continue
        before = {o.name: positions(o) for o in targets}
        bone.rotation_mode = 'XYZ'; bone.rotation_euler = Euler((0, 0, radians(angle)))
        most, count, lower = 0, 0, 0
        for obj in targets:
            moved, moved_count, after = displacement(obj, before[obj.name])
            most = max(most, moved); count += moved_count
            lower = max([lower] + [(a - b).length for a, b in zip(after, before[obj.name]) if b.z < head_z - .5])
        bone.rotation_euler = Euler((0, 0, 0))
        report['level2']['bones'][bone_name] = {'meshes': [o.name for o in targets], 'maxMillimetres': round(most * 1000, 2), 'verticesMoved': count, 'lowerBodyMaxMillimetres': round(lower * 1000, 3)}
        if most < .001: report['failures'].append(f'level2: bone {bone_name} does not deform its meshes')
        if lower > .0005: report['failures'].append(f'level2: bone {bone_name} moves the lower body')
    report['level2']['skinnedMeshes'] = sorted(o.name for o in skinned)
    report['level2']['bakedAnimationClips'] = len(bpy.data.actions)
print('AVATAR_RIG_REPORT ' + json.dumps(report))
sys.exit(1 if report['failures'] else 0)
