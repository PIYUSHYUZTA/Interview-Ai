"""The interview room's backdrop (reference 4: a warm living room at dusk behind a holographic panel).

A simple interior built from code: a window of teal dusk light on the left, an amber floor lamp and shelves
on the right, the back of a sofa in the foreground (where the candidate sits), rendered with Cycles and a very
shallow depth of field so it reads as atmosphere, never as detail competing with the interview. Strict six
colours: ink, charcoal, ivory, teal, amber, earth.
Writes frontend/public/media/room-backdrop.webp (1920×1080) and room-backdrop-small.webp (960×540).
Run: blender -b --factory-startup --python scripts/blender/render_room_backdrop.py -- --project-root .
"""
import argparse
import math
from pathlib import Path
import sys

import bpy

options = argparse.ArgumentParser()
options.add_argument('--project-root', type=Path, required=True)
options = options.parse_args(sys.argv[sys.argv.index('--') + 1:])
MEDIA = options.project_root.resolve() / 'frontend/public/media'
MEDIA.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def srgb(hex_value):
    channel = lambda c: c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
    return tuple(channel(int(hex_value[i:i + 2], 16) / 255) for i in (1, 3, 5)) + (1,)


def material(name, color, roughness=.6, emission=None, strength=0., metallic=0.):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = srgb(color)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = srgb(emission)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


WALL = material('Wall', '#090907', .85)
FLOOR = material('Floor', '#6C5636', .45)
FABRIC = material('Sofa', '#090907', .9)
SHELF = material('Shelf', '#6C5636', .55)
BOOK_A = material('Book ivory', '#E8E4D3', .7)
BOOK_B = material('Book amber', '#B99D73', .6)
BRASS = material('Brass', '#B99D73', .3, metallic=1.)
SHADE = material('Lamp shade', '#E8E4D3', .8, emission='#B99D73', strength=6.)
DUSK = material('Window dusk', '#00AEBB', .5, emission='#00AEBB', strength=.55)
INK = material('Ink', '#031211', .7)
PLANT = material('Plant', '#031211', .8)


def box(name, location, scale, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object; obj.name = name; obj.scale = scale; obj.data.materials.append(mat)
    bevel = obj.modifiers.new('Bevel', 'BEVEL'); bevel.width = .02; bevel.segments = 3
    return obj


# Room shell: back wall at y = 4, left wall with a window, right wall, floor.
box('Floor', (0, 0, -.05), (6, 6, .05), FLOOR)
box('BackWall', (0, 4.05, 1.6), (6, .05, 1.7), WALL)
box('LeftWall', (-4.05, 0, 1.6), (.05, 6, 1.7), WALL)
box('RightWall', (4.05, 0, 1.6), (.05, 6, 1.7), WALL)
box('Window', (-2.4, 3.99, 1.75), (1.1, .02, 1.05), DUSK)
box('Mullion', (-2.4, 3.97, 1.75), (.025, .03, 1.05), INK)
box('Transom', (-2.4, 3.97, 2.1), (1.1, .03, .025), INK)
box('Sill', (-2.4, 3.9, .66), (1.2, .12, .03), SHELF)

# Shelves and books on the right; a floor lamp casting the amber key.
for level in range(4):
    box(f'Shelf{level}', (3.7, 2.2, .5 + level * .55), (.3, 1.1, .02), SHELF)
    for book in range(7):
        box(f'Book{level}{book}', (3.68, 1.25 + book * .27 + (level % 2) * .05, .5 + level * .55 + .17), (.18, .05 + (book % 3) * .02, .15 + (book % 2) * .04), BOOK_A if (book + level) % 3 else BOOK_B)
bpy.ops.mesh.primitive_cylinder_add(radius=.02, depth=1.6, location=(2.6, 3.2, .8)); bpy.context.object.data.materials.append(BRASS)
bpy.ops.mesh.primitive_cone_add(radius1=.32, radius2=.2, depth=.35, location=(2.6, 3.2, 1.7)); bpy.context.object.data.materials.append(SHADE)
lamp = bpy.data.lights.new('Lamp', 'POINT'); lamp.energy = 140; lamp.color = srgb('#B99D73')[:3]; lamp.shadow_soft_size = .3
obj = bpy.data.objects.new('Lamp', lamp); scene.collection.objects.link(obj); obj.location = (2.6, 3.2, 1.6)

# A side table, a plant by the window and a low cabinet under the space the hologram will fill.
box('Cabinet', (0, 3.6, .3), (1.6, .3, .3), SHELF)
box('Cup', (.9, 3.5, .66), (.05, .05, .06), BOOK_A)
bpy.ops.mesh.primitive_cylinder_add(radius=.18, depth=.4, location=(-3.3, 2.9, .2)); bpy.context.object.data.materials.append(INK)
for leaf in range(9):
    angle = leaf / 9 * math.tau
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.22, location=(-3.3 + math.cos(angle) * .25, 2.9 + math.sin(angle) * .25, .6 + (leaf % 3) * .25))
    bpy.context.object.scale = (.6, .6, 1.4); bpy.context.object.data.materials.append(PLANT)

# The back of the sofa in the foreground: the candidate's seat.
box('SofaBack', (-1.2, -1.9, .38), (1.9, .3, .38), FABRIC)
box('SofaArm', (-3.1, -1.3, .3), (.28, .8, .3), FABRIC)
box('Rug', (0, 1.2, .005), (2.2, 1.6, .005), BOOK_B)

# Cool dusk fill from the window side, very low ambient.
dusk = bpy.data.lights.new('Dusk', 'AREA'); dusk.energy = 160; dusk.size = 2.4; dusk.color = srgb('#00AEBB')[:3]
obj = bpy.data.objects.new('Dusk', dusk); scene.collection.objects.link(obj); obj.location = (-2.4, 3.6, 1.75); obj.rotation_euler = (math.radians(90), 0, 0)
world = bpy.data.worlds.new('Night'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = srgb('#031211')
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .15

# Camera from behind the sofa, focused near the back wall so the room melts into soft shapes.
camera_data = bpy.data.cameras.new('Camera'); camera = bpy.data.objects.new('Camera', camera_data)
scene.collection.objects.link(camera); scene.camera = camera
camera.location = (.2, -3.8, 1.45); camera.rotation_euler = (math.radians(83), 0, 0)
camera_data.lens = 24
camera_data.dof.use_dof = True; camera_data.dof.focus_distance = 2.2; camera_data.dof.aperture_fstop = 1.2

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
scene.cycles.samples = 160; scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.quality = 72
for name, (width, height) in {'room-backdrop.webp': (1920, 1080), 'room-backdrop-small.webp': (960, 540)}.items():
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = width, height, 100
    scene.render.filepath = str(MEDIA / name)
    bpy.ops.render.render(write_still=True)
print('ROOM_BACKDROP_DONE')
