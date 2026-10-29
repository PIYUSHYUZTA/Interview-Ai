"""The landing's "Instrument": an obsidian monolith inside brass orbits, built from code and rendered with Cycles.

One scene, three outputs, all in the product palette (ink #031211, ivory #E8E4D3, teal #00AEBB, cerulean
#007BA7, brass #B99D73, earth #6C5636, charcoal #090907, one rose #FF2D95 signal):
  - frontend/public/models/landing-instrument.glb   the real-time asset for the scroll-driven chapter scene
  - frontend/public/media/instrument-{listen,adapt,develop}.webp   Cycles stills, one per chapter, used when
    WebGL is unavailable, on low-power devices and under reduced motion
  - frontend/public/media/instrument-loop.mp4 (+ poster)   a seamless 6 s loop behind the final call to action
Every animated value in the loop returns to its first-frame state (tori are symmetric under a half turn about
any diameter; the orbit makes a full turn), so the MP4 loops without a seam.
Run: blender -b --factory-startup --python scripts/blender/build_landing_artifact.py -- --project-root . [--preview]
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

options = argparse.ArgumentParser()
options.add_argument('--project-root', type=Path, required=True)
options.add_argument('--preview', action='store_true', help='export the GLB and render the stills only')
options = options.parse_args(sys.argv[sys.argv.index('--') + 1:])
ROOT = options.project_root.resolve()
MODELS, MEDIA, SOURCE = ROOT / 'frontend/public/models', ROOT / 'frontend/public/media', ROOT / 'assets/blender'
for folder in (MODELS, MEDIA, SOURCE):
    folder.mkdir(parents=True, exist_ok=True)
FRAMES, FPS = 144, 24

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.fps = FPS


def srgb(hex_value):
    """Palette hex to linear RGBA, as Blender colour sockets expect."""
    channel = lambda c: c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
    return tuple(channel(int(hex_value[i:i + 2], 16) / 255) for i in (1, 3, 5)) + (1,)


def material(name, color, metallic=0., roughness=.5, coat=0., emission=None, strength=0.):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = srgb(color)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    if emission:
        bsdf.inputs['Emission Color'].default_value = srgb(emission)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


OBSIDIAN = material('Obsidian', '#090907', roughness=.14, coat=1.)
INK = material('Ink plinth', '#031211', roughness=.42)
BRASS = material('Brass', '#B99D73', metallic=1., roughness=.24)
EARTH = material('Earth brass', '#6C5636', metallic=1., roughness=.34)
IVORY = material('Ivory pearl', '#E8E4D3', roughness=.32, coat=.6)
SHARD = material('Teal crystal', '#00707A', metallic=.6, roughness=.08, coat=1., emission='#00AEBB', strength=.12)
CERULEAN = material('Cerulean crystal', '#007BA7', metallic=.6, roughness=.1, coat=1., emission='#007BA7', strength=.08)
SEAM = material('Listening line', '#00AEBB', emission='#00AEBB', strength=9.)
SIGNAL = material('Rose signal', '#FF2D95', emission='#FF2D95', strength=7.)
FLOOR = material('Charcoal floor', '#090907', roughness=.28)

artifact = []  # exported to the GLB; the floor, lights and camera stay render-only


def keep(obj, mat, name, smooth=True):
    obj.name = name
    obj.data.materials.append(mat)
    if smooth and hasattr(obj.data, 'shade_smooth'):
        obj.data.shade_smooth()
    artifact.append(obj)
    return obj


# The monolith: a bevelled obsidian slab with a single teal listening line down its face.
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 1.4))
monolith = bpy.context.object
monolith.scale = (.45, .09, 1.2)
bpy.ops.object.transform_apply(scale=True)
bevel = monolith.modifiers.new('Bevel', 'BEVEL'); bevel.width = .035; bevel.segments = 4
keep(monolith, OBSIDIAN, 'Monolith', smooth=False)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40)) if hasattr(bpy.ops.object, 'shade_smooth_by_angle') else None
bpy.ops.mesh.primitive_cube_add(location=(0, -.092, 1.42))
seam = bpy.context.object; seam.scale = (.006, .004, .92)
bpy.ops.object.transform_apply(scale=True)
keep(seam, SEAM, 'ListeningLine', smooth=False)

# The plinth it stands on.
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.25, depth=.16, location=(0, 0, .12))
plinth = keep(bpy.context.object, INK, 'Plinth', smooth=False)
plinth_bevel = plinth.modifiers.new('Bevel', 'BEVEL'); plinth_bevel.width = .02; plinth_bevel.segments = 3

# Brass orbits: a vertical halo behind the slab and a tilted inner ring through it.
bpy.ops.mesh.primitive_torus_add(major_radius=1.38, minor_radius=.032, major_segments=160, minor_segments=20, location=(0, .38, 1.5), rotation=(math.radians(90), 0, 0))
ring_outer = keep(bpy.context.object, BRASS, 'RingOuter')
bpy.ops.mesh.primitive_torus_add(major_radius=1.04, minor_radius=.016, major_segments=144, minor_segments=14, location=(0, 0, 1.5), rotation=(math.radians(72), math.radians(24), 0))
ring_inner = keep(bpy.context.object, EARTH, 'RingInner')

# Pearls and the one rose signal ride an orbit parented to a pivot, so the loop can turn them together.
orbit = bpy.data.objects.new('Orbit', None); scene.collection.objects.link(orbit)
orbit.location = (0, 0, 1.5); orbit.rotation_euler = (math.radians(68), math.radians(-18), 0)
artifact.append(orbit)
for index in range(8):
    angle = index / 8 * math.tau
    rose = index == 5
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=.05 if rose else .035 + .012 * (index % 3))
    pearl = keep(bpy.context.object, SIGNAL if rose else IVORY, 'Signal' if rose else f'Pearl{index}')
    pearl.parent = orbit
    pearl.location = (math.cos(angle) * 1.72, math.sin(angle) * 1.72, 0)

# Faceted crystals: low-subdivision icospheres, stretched, scattered off the axis.
for index, (x, y, z, size, tilt) in enumerate([(-2.1, .6, 2.5, .2, 20), (2.25, .3, .9, .16, -35), (1.7, -1.1, 2.75, .11, 50), (-1.55, -1.25, .75, .13, -15), (-2.5, 1.4, 1.35, .09, 70)]):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(x, y, z), rotation=(math.radians(tilt), math.radians(tilt * .6), math.radians(tilt * 1.3)))
    shard = bpy.context.object
    shard.scale = (size * .42, size * .42, size * 1.25)
    keep(shard, CERULEAN if index % 2 else SHARD, f'Shard{index}', smooth=False)


# ── Export the real-time asset ──
bpy.ops.object.select_all(action='DESELECT')
for obj in artifact:
    obj.select_set(True)
glb = MODELS / 'landing-instrument.glb'
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_texcoords=False, export_yup=True)

# ── Render-only: a glossy charcoal floor, the lights and the camera ──
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
bpy.context.object.data.materials.append(FLOOR)
world = bpy.data.worlds.new('Ink'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = srgb('#031211')
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35


def light(name, kind, color, energy, location, size=1.):
    data = bpy.data.lights.new(name, kind); data.color = srgb(color)[:3]; data.energy = energy
    if kind == 'AREA':
        data.size = size
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = location
    track = obj.constraints.new('TRACK_TO'); track.target = monolith; track.track_axis = 'TRACK_NEGATIVE_Z'; track.up_axis = 'UP_Y'
    return obj


light('Brass key', 'AREA', '#B99D73', 900, (-3.4, -3.2, 4.4), 2.4)
light('Teal rim', 'AREA', '#00AEBB', 700, (3.2, 2.6, 2.8), 1.6)
light('Cerulean fill', 'AREA', '#007BA7', 160, (-2.6, -1.2, .6), 1.2)
light('Ivory top', 'SPOT', '#E8E4D3', 260, (0, -1.0, 5.6))
# Behind the slab: teal light spills around its edges and across the floor (the doorway the conversation opens).
light('Teal doorway', 'AREA', '#00AEBB', 1400, (0, 1.9, 1.5), 1.8)
# A broad, dim brass card in front: its reflection draws a soft gradient down the obsidian face.
light('Brass card', 'AREA', '#B99D73', 220, (1.2, -4.2, 3.4), 3.0)

aim = bpy.data.objects.new('Aim', None); scene.collection.objects.link(aim); aim.location = (0, 0, 1.45)
camera_data = bpy.data.cameras.new('Camera'); camera = bpy.data.objects.new('Camera', camera_data)
scene.collection.objects.link(camera); scene.camera = camera
camera_data.dof.use_dof = True; camera_data.dof.focus_object = aim; camera_data.dof.aperture_fstop = 2.8
track = camera.constraints.new('TRACK_TO'); track.target = aim; track.track_axis = 'TRACK_NEGATIVE_Z'; track.up_axis = 'UP_Y'

scene.view_settings.view_transform = 'AgX'
looks = [item.identifier for item in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items_static]
scene.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in looks else 'None'
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
scene.cycles.use_denoising = True
scene.render.film_transparent = False

# ── Chapter stills: the same three camera positions the web scene travels between ──
CHAPTERS = {
    'listen': {'camera': (0, -6.4, 1.35), 'lens': 50, 'shift': (0, 0)},
    'adapt': {'camera': (4.6, -4.4, 1.9), 'lens': 50, 'shift': (0, 0)},
    'develop': {'camera': (1.1, -3.6, 5.0), 'lens': 42, 'shift': (0, 0)},
}
scene.cycles.samples = 96
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1600, 1000, 100
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.quality = 78
for name, shot in CHAPTERS.items():
    camera.location = shot['camera']; camera_data.lens = shot['lens']
    camera_data.shift_x, camera_data.shift_y = shot['shift']
    scene.render.filepath = str(MEDIA / f'instrument-{name}.webp')
    bpy.ops.render.render(write_still=True)

receipt = {'generator': 'scripts/blender/build_landing_artifact.py', 'blender': bpy.app.version_string, 'device': scene.cycles.device,
           'model': {'file': '/models/landing-instrument.glb', 'bytes': glb.stat().st_size, 'sha256': hashlib.sha256(glb.read_bytes()).hexdigest(), 'objects': sorted(o.name for o in artifact)},
           'stills': {name: {'file': f'/media/instrument-{name}.webp', **shot} for name, shot in CHAPTERS.items()}}

# ── The closing loop: a low, slow look through the orbits toward the doorway ──
camera.location = (.5, -6.8, 1.1); camera_data.lens = 36
camera_data.shift_x, camera_data.shift_y = -.22, .02
for obj, axis, turn in [(ring_outer, 2, math.pi), (ring_inner, 2, math.pi), (orbit, 2, math.tau)]:
    start = obj.rotation_euler[axis]
    for frame, value in [(1, start), (FRAMES + 1, start + turn)]:
        obj.rotation_euler[axis] = value
        obj.keyframe_insert(data_path='rotation_euler', index=axis, frame=frame)
    action = obj.animation_data.action
    for curve in getattr(action, 'fcurves', []):
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'
for step in range(5):  # a breath of camera drift that closes on itself
    t = step / 4
    camera.location = (.5 + .22 * math.sin(t * math.tau), -6.8, 1.1 + .06 * math.sin(t * math.tau * 2))
    camera.keyframe_insert(data_path='location', frame=1 + round(t * FRAMES))
scene.cycles.samples = 40
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.frame_set(1)
scene.render.filepath = str(MEDIA / 'instrument-loop-poster.webp')
bpy.ops.render.render(write_still=True)
receipt['loop'] = {'poster': '/media/instrument-loop-poster.webp', 'frames': FRAMES, 'fps': FPS, 'size': [1280, 720]}
if not options.preview:
    if hasattr(scene.render.image_settings, 'media_type'):
        scene.render.image_settings.media_type = 'VIDEO'
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.constant_rate_factor = 'MEDIUM'
    scene.render.ffmpeg.ffmpeg_preset = 'GOOD'
    scene.render.ffmpeg.gopsize = FPS
    scene.render.ffmpeg.audio_codec = 'NONE'
    scene.render.filepath = str(MEDIA / 'instrument-loop.mp4')
    scene.render.use_file_extension = False
    bpy.ops.render.render(animation=True)
    film = MEDIA / 'instrument-loop.mp4'
    receipt['loop'].update({'file': '/media/instrument-loop.mp4', 'bytes': film.stat().st_size, 'sha256': hashlib.sha256(film.read_bytes()).hexdigest()})
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'landing-instrument.blend'))
(MEDIA / 'instrument-manifest.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print('INSTRUMENT_DONE', json.dumps(receipt['model']))
