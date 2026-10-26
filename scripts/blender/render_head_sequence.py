"""Render a recorded head/eye-movement sequence of the rigged interviewer for vision tests.

The frames are synthetic (a rendered 3D human, not a person), but the movement is real 3D rotation
with ground truth measured from the posed geometry: head yaw/pitch from the Head bone's forward
direction and eye yaw from the eye bones, in the camera's frame. A 2-D image warp cannot do this.

Run: blender -b --factory-startup --python scripts/blender/render_head_sequence.py -- <file.glb> <out_dir> [--preview]
Writes <out_dir>/NNN.jpg (480x600) and <out_dir>/labels.json.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

args = sys.argv[sys.argv.index('--') + 1:]
glb, out_dir, preview = os.path.abspath(args[0]), os.path.abspath(args[1]), '--preview' in args  # Blender resolves relative render paths against its own root
os.makedirs(out_dir, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
bones = rig.pose.bones
for name in ('Head', 'LeftEye', 'RightEye'):
    bones[name].rotation_mode = 'XYZ'


def world(point):
    return rig.matrix_world @ point


def update():
    bpy.context.view_layer.update()


depsgraph = bpy.context.evaluated_depsgraph_get()


def eye_points():
    update()
    return world(bones['LeftEye'].head), world(bones['RightEye'].head), world(bones['Head'].head)


def heading(vector):
    """Compass angle of a vector seen from above (degrees)."""
    return math.degrees(math.atan2(vector.y, vector.x))


def head_angles():
    """Head yaw = heading change of the line between the eyes; pitch = elevation change of the eyes above
    the head joint. Both are measured on the posed rig, independent of each bone's axis convention."""
    left, right, joint = eye_points()
    middle = (left + right) / 2
    up = middle - joint
    return heading(right - left), math.degrees(math.asin(up.z / up.length))


# The pupil: the most forward vertex weighted to each eye bone (the face looks toward -Y).
eye_meshes = [o for o in scene.objects if o.type == 'MESH' and o.find_armature() == rig]
def pupil_vertex(group_name):
    best = None
    for obj in eye_meshes:
        group = obj.vertex_groups.get(group_name)
        if not group: continue
        for vertex in obj.data.vertices:
            if any(g.group == group.index and g.weight >= .45 for g in vertex.groups):  # eyes are half-weighted to their bone
                y = (obj.matrix_world @ vertex.co).y
                if best is None or y < best[2]: best = (obj, vertex.index, y)
    return best[:2]


pupils = {name: pupil_vertex(name) for name in ('LeftEye', 'RightEye')}


def pupil_heading(name):
    """Heading of the eye's line of sight: eye centre -> evaluated pupil vertex."""
    update()
    obj, index = pupils[name]
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh(); point = evaluated.matrix_world @ mesh.vertices[index].co; evaluated.to_mesh_clear()
    return heading(point - world(bones[name].head))


def strongest_axis(bone_name, measure, exclude=()):
    bone = bones[bone_name]; base = measure()
    best, best_change = 0, -1
    for axis in [a for a in range(3) if a not in exclude]:
        rotation = [0, 0, 0]; rotation[axis] = math.radians(15)
        bone.rotation_euler = Euler(rotation)
        change = abs((measure() - base + 180) % 360 - 180)
        if change > best_change: best, best_change = axis, change
        bone.rotation_euler = Euler((0, 0, 0))
    return best


head_yaw_axis = strongest_axis('Head', lambda: head_angles()[0])
head_pitch_axis = strongest_axis('Head', lambda: head_angles()[1], exclude=(head_yaw_axis,))
eye_yaw_axis = strongest_axis('LeftEye', lambda: pupil_heading('LeftEye'))
rest_heading, rest_elevation = head_angles()
rest_pupils = {name: pupil_heading(name) for name in pupils}
left_eye, right_eye, _ = eye_points()
eyes = (left_eye + right_eye) / 2
forward = Vector((0, -1, 0))

# Webcam-like view: in front of the face at ~0.6 m, slightly above eye level, portrait 480x600.
camera_data = bpy.data.cameras.new('webcam'); camera_data.lens = 35
camera = bpy.data.objects.new('webcam', camera_data); scene.collection.objects.link(camera)
camera.location = eyes + Vector((forward.x, forward.y, 0)).normalized() * .62 + Vector((0, 0, .03))
camera.rotation_euler = (eyes - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_forward = (eyes - camera.location).normalized()
scene.camera = camera
# Soft key light from the camera side plus fill, like a lit desk.
for label, offset, energy in (('key', Vector((.35, 0, .25)), 60), ('fill', Vector((-.4, 0, .1)), 25)):
    light = bpy.data.objects.new(label, bpy.data.lights.new(label, 'AREA')); light.data.energy = energy; light.data.size = .6
    light.location = camera.location + offset; light.rotation_euler = (eyes - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(light)
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 480, 600, 100
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16 if preview else 48
scene.cycles.use_denoising = True
try:
    preferences = bpy.context.preferences.addons['cycles'].preferences
    for backend in ('OPTIX', 'CUDA'):
        try:
            preferences.compute_device_type = backend; preferences.get_devices()
            if any(d.type == backend for d in preferences.devices):
                for device in preferences.devices: device.use = True
                scene.cycles.device = 'GPU'; break
        except TypeError:
            continue
except KeyError:
    pass
scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 90

# The sequence: natural head turns (yaw both ways, then pitch), then eye movement with the head still.
yaw_steps = [0, 8, 16, 24, 32, 40, 40, 40, 32, 24, 16, 8, 0, 0, -8, -16, -24, -32, -40, -40, -40, -32, -24, -16, -8, 0, 0]
pitch_steps = [0, 10, 20, 30, 30, 30, 20, 10, 0, -10, -20, -30, -30, -30, -20, -10, 0, 0]
eye_steps = [0, 0, 10, 20, 25, 25, 25, 20, 10, 0, 0, -10, -20, -25, -25, -25, -20, -10, 0, 0]
plan = [('head-yaw', a, 0, 0) for a in yaw_steps] + [('head-pitch', 0, a, 0) for a in pitch_steps] + [('eyes', 0, 0, a) for a in eye_steps]
if preview: plan = [('head-yaw', 0, 0, 0), ('head-yaw', 40, 0, 0), ('head-pitch', 0, 20, 0), ('eyes', 0, 0, 25)]
labels = []
for index, (segment, yaw, pitch, eye) in enumerate(plan):
    head_rotation = [0, 0, 0]; head_rotation[head_yaw_axis] = math.radians(yaw); head_rotation[head_pitch_axis] = math.radians(pitch)
    bones['Head'].rotation_euler = Euler(head_rotation)
    eye_rotation = [0, 0, 0]; eye_rotation[eye_yaw_axis] = math.radians(eye)
    bones['LeftEye'].rotation_euler = Euler(eye_rotation); bones['RightEye'].rotation_euler = Euler(eye_rotation)
    yaw_now, elevation_now = head_angles()
    # Sign: positive yaw/eye = the subject turns to their own left (toward image right in an unmirrored view).
    head_yaw = round(-((yaw_now - rest_heading + 180) % 360 - 180), 1)
    head_pitch = round(elevation_now - rest_elevation, 1)
    eye_turn = sum(((pupil_heading(n) - rest_pupils[n] + 180) % 360 - 180) for n in pupils) / 2
    eye_yaw = round(-eye_turn - head_yaw, 1)
    scene.render.filepath = os.path.join(out_dir, f'{index:03d}.jpg')
    bpy.ops.render.render(write_still=True)
    labels.append({'file': f'{index:03d}.jpg', 'segment': segment, 'headYawDeg': head_yaw, 'headPitchDeg': head_pitch, 'eyeYawRelativeToHeadDeg': eye_yaw,
                   'boneInput': {'headYaw': yaw, 'headPitch': pitch, 'eyeYaw': eye}})
with open(os.path.join(out_dir, 'labels.json'), 'w') as handle:
    json.dump({'source': os.path.basename(glb), 'camera': {'distanceMetres': .62, 'lensMm': 35, 'size': [480, 600]},
               'axes': {'headYaw': head_yaw_axis, 'headPitch': head_pitch_axis, 'eyeYaw': eye_yaw_axis},
               'convention': 'degrees relative to the rest pose. headYawDeg < 0: the face turns toward image right (the subject own left); headPitchDeg < 0: looking down; eyeYawRelativeToHeadDeg: pupil rotation measured on the eye mesh (about half the bone input, the eyes are half-weighted)',
               'frames': labels}, handle, indent=1)
print('rendered', len(labels), 'frames to', out_dir)
