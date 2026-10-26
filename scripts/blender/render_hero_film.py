"""Cinematic landing film: a seamless 10 s loop of the hero bust, rendered with Cycles.

Reuses assets/blender/hero-bust.blend (run prepare_hero_bust.py first). Adds a wide 16:9
camera on a slow orbit with shallow depth of field, a linear halo turn, a small head turn
and two blinks; every animated value returns to its first-frame state, so the MP4 loops
without a seam. Writes frontend/public/media/hero-film.mp4 and hero-film-poster.webp.
Run: blender -b assets/blender/hero-bust.blend --python scripts/blender/render_hero_film.py -- --project-root . [--preview]
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
options.add_argument('--preview', action='store_true', help='render only the poster frame')
options.add_argument('--seam-check', action='store_true', help='compare frame 1 with frame 241 (the frame after the loop) and exit')
options = options.parse_args(sys.argv[sys.argv.index('--') + 1:])
ROOT = options.project_root.resolve()
MEDIA = ROOT / 'frontend' / 'public' / 'media'
MEDIA.mkdir(parents=True, exist_ok=True)
FRAMES, FPS = 240, 24

scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.fps = FPS
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
head_bone = rig.pose.bones['Head']
head = rig.matrix_world @ head_bone.head
eyes = head + Vector((0, -.09, .07))

# Halo: one full linear turn over the loop (the source keys ease in and out).
halo = bpy.data.objects['HaloPivot']
halo.animation_data_clear()
for frame, angle in [(1, 0), (FRAMES + 1, math.tau)]:
    halo.rotation_euler.y = angle
    halo.keyframe_insert(data_path='rotation_euler', index=1, frame=frame)
for curve in halo.animation_data.action.fcurves if hasattr(halo.animation_data.action, 'fcurves') else []:
    for key in curve.keyframe_points:
        key.interpolation = 'LINEAR'

# Head: a restrained turn that returns to centre.
head_bone.rotation_mode = 'XYZ'
for frame, yaw in [(1, 0), (61, 3), (121, 0), (181, -3), (FRAMES + 1, 0)]:
    head_bone.rotation_euler = (0, 0, math.radians(yaw))
    head_bone.keyframe_insert(data_path='rotation_euler', frame=frame)

# Two natural blinks on every mesh that carries the blink shapes (skin, lashes, brows).
for obj in scene.objects:
    keys = obj.data.shape_keys.key_blocks if obj.type == 'MESH' and obj.data.shape_keys else {}
    for name in ('eyeBlinkLeft', 'eyeBlinkRight'):
        key = keys.get(name) if keys else None
        if not key:
            continue
        for start in (70, 188):
            for frame, value in [(start, 0), (start + 2, 1), (start + 5, 0)]:
                key.value = value
                key.keyframe_insert(data_path='value', frame=frame)

# Camera: wide 16:9, subject on the right third, slow orbit that closes on itself.
for obj in [o for o in scene.objects if o.type == 'CAMERA']:
    bpy.data.objects.remove(obj)
focus = bpy.data.objects.new('FilmFocus', None); scene.collection.objects.link(focus); focus.location = eyes
aim = bpy.data.objects.new('FilmAim', None); scene.collection.objects.link(aim); aim.location = head + Vector((0, 0, .02))
bpy.ops.object.camera_add()
camera = bpy.context.object; camera.name = 'FilmCamera'; scene.camera = camera
camera.data.lens = 55
camera.data.shift_x = -.2
camera.data.dof.use_dof = True
camera.data.dof.focus_object = focus
camera.data.dof.aperture_fstop = 2.2
track = camera.constraints.new('TRACK_TO'); track.target = aim; track.track_axis = 'TRACK_NEGATIVE_Z'; track.up_axis = 'UP_Y'
for step in range(9):
    t = step / 8
    angle = math.radians(14) * math.sin(t * math.tau)
    radius = 1.9 - .06 * math.sin(t * math.tau * 2) ** 2
    camera.location = head + Vector((math.sin(angle) * radius, -math.cos(angle) * radius, .03 + .025 * math.sin(t * math.tau)))
    camera.keyframe_insert(data_path='location', frame=1 + round(t * FRAMES))

# Atmosphere: Ink Black world, no transparency, cinematic tone.
scene.render.film_transparent = False
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items_static] else 'None'

# GPU Cycles with denoising.
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1280, 720, 100

if options.seam_check:
    # A seamless loop needs the frame after the last to equal the first.
    import numpy
    scene.render.resolution_percentage = 25
    scene.render.image_settings.file_format = 'PNG'
    pixels = []
    for frame in (1, FRAMES + 1):
        scene.frame_set(frame)
        scene.render.filepath = str(MEDIA / f'.seam-{frame}.png')
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(scene.render.filepath)
        pixels.append(numpy.array(image.pixels[:]).reshape(-1, 4)[:, :3]); bpy.data.images.remove(image)
        Path(scene.render.filepath).unlink()
    print('HERO_FILM_SEAM', json.dumps({'meanAbsoluteDifference': round(float(numpy.abs(pixels[0] - pixels[1]).mean() * 255), 3), 'scale': '0-255'}))
    sys.exit(0)
# Poster: the first frame, so the still and the loop start are identical.
scene.frame_set(1)
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.quality = 80
scene.render.filepath = str(MEDIA / 'hero-film-poster.webp')
bpy.ops.render.render(write_still=True)
receipt = {'generator': 'scripts/blender/render_hero_film.py', 'blender': bpy.app.version_string, 'device': scene.cycles.device, 'frames': FRAMES, 'fps': FPS, 'size': [1280, 720], 'poster': '/media/hero-film-poster.webp'}
if not options.preview:
    # Blender 5 exposes the FFmpeg encoder only once the output media type is video.
    if hasattr(scene.render.image_settings, 'media_type'):
        scene.render.image_settings.media_type = 'VIDEO'
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.constant_rate_factor = 'MEDIUM'
    scene.render.ffmpeg.ffmpeg_preset = 'GOOD'
    scene.render.ffmpeg.gopsize = FPS
    scene.render.ffmpeg.audio_codec = 'NONE'
    scene.render.filepath = str(MEDIA / 'hero-film.mp4')
    scene.render.use_file_extension = False
    bpy.ops.render.render(animation=True)
    film = MEDIA / 'hero-film.mp4'
    receipt.update({'file': '/media/hero-film.mp4', 'bytes': film.stat().st_size, 'sha256': hashlib.sha256(film.read_bytes()).hexdigest()})
(MEDIA / 'hero-film-manifest.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print('HERO_FILM', json.dumps(receipt))
