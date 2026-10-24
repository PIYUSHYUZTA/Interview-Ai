"""Original procedural product assets. Run with Blender, not system Python."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument('--project-root', type=Path, required=True)
args.add_argument('--render', action='store_true')
options = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
ROOT = options.project_root.resolve()
bpy.context.preferences.filepaths.file_preview_type = 'NONE'
bpy.context.preferences.filepaths.save_version = 0
SOURCES = ROOT / 'assets' / 'blender'
OUTPUT = ROOT / 'frontend' / 'public' / 'models'
SOURCES.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)
PALETTE = {'ink': '031211', 'ivory': 'E8E4D3', 'teal': '00AEBB', 'charcoal': '090907', 'earth': '6C5636', 'amber': 'B99D73'}


def linear(hex_color):
    rgb = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)


def material(name, color, metal=0, rough=.35, emission=0, alpha=1, transmission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear(PALETTE[color]), alpha)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = mat.diffuse_color
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Alpha'].default_value = alpha
    bsdf.inputs['Transmission Weight'].default_value = transmission
    bsdf.inputs['IOR'].default_value = 1.45
    bsdf.inputs['Emission Color'].default_value = (*linear(PALETTE[color]), 1)
    bsdf.inputs['Emission Strength'].default_value = emission
    return mat


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for library in (bpy.data.meshes, bpy.data.materials, bpy.data.actions, bpy.data.cameras, bpy.data.lights):
        for block in list(library):
            if block.users == 0:
                library.remove(block)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 241
    bpy.context.scene.render.fps = 30


def assign(obj, name, mat, parent=None):
    obj.name = name
    obj.data.materials.append(mat)
    if parent:
        bpy.context.view_layer.update()
        world = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = world
    return obj


def sphere(name, position, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=position)
    obj = bpy.context.object
    obj.scale = scale
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return assign(obj, name, mat, parent)


def box(name, position, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new('Machined edges', 'BEVEL')
    bevel.width = .025
    bevel.segments = 2
    return assign(obj, name, mat)


def torus(name, radius, tube, mat, location=(0, 0, 0), rotation=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=96, minor_segments=8, major_radius=radius, minor_radius=tube, location=location, rotation=rotation)
    for polygon in bpy.context.object.data.polygons:
        polygon.use_smooth = True
    return assign(bpy.context.object, name, mat, parent)


def pivot(name, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj


def core():
    reset()
    metal = material('Ink titanium', 'ink', .92, .29)
    bronze = material('Brushed earth alloy', 'earth', .88, .3)
    amber = material('Amber rim metal', 'amber', .82, .25)
    teal = material('Teal light inlay', 'teal', .1, .22, 2)
    facet = material('Charcoal ceramic facets', 'charcoal', .7, .28)
    glass = material('Optical ivory glass', 'ivory', 0, .12, transmission=.9)
    p = pivot('CorePivot')
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.68)
    crystal = assign(bpy.context.object, 'IntelligenceCrystal', facet, p)
    crystal.rotation_euler = (.2, .35, .12)
    # An open exoskeleton reveals the inner light without a heavy solid shell.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.76)
    cage = assign(bpy.context.object, 'TitaniumExoskeleton', bronze, p)
    wire = cage.modifiers.new('Precision structural ribs', 'WIREFRAME')
    wire.thickness = .014
    bevel = cage.modifiers.new('Polished rib edges', 'BEVEL')
    bevel.width = .006
    bevel.segments = 2
    cage.rotation_euler = crystal.rotation_euler.copy()
    for index, (radius, rotation) in enumerate([(1.36, (1.15, .2, .1)), (1.1, (.4, -.4, .35)), (.89, (1.5, 1.15, -.5))]):
        torus(f'AlloyOrbit{index}', radius, .04 if index else .052, metal, rotation=rotation, parent=p)
        torus(f'LightInlay{index}', radius+(.055 if index == 0 else .043), .006, teal, rotation=rotation, parent=p)
        torus(f'WarmMachinedLip{index}', radius-.038, .006, amber, rotation=rotation, parent=p)
    # Three thin optical blades: real glTF transmission, not opaque painted glass.
    for index in range(3):
        angle = index * math.tau / 3
        blade = box(f'OpticalBlade{index}', (math.cos(angle)*.95, math.sin(angle)*.95, .12), (.15, .035, .62), glass)
        blade.rotation_euler = (.25, -.3, angle)
        bpy.context.view_layer.update()
        world = blade.matrix_world.copy()
        blade.parent = p
        blade.matrix_world = world
    for index in range(18):
        a = index * math.tau / 18
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.009 if index % 3 else .016, location=(math.cos(a)*1.56, math.sin(a)*1.56, math.sin(a*2)*.32))
        assign(bpy.context.object, f'LightParticle{index}', teal if index % 3 else amber, p)
    for frame, angle in [(1, 0), (121, math.pi), (241, math.tau)]:
        p.rotation_euler.z = angle
        p.keyframe_insert(data_path='rotation_euler', frame=frame)
    bpy.context.scene.frame_set(1)
    return (0, -6, 1.6), (0, 0, 0)


def studio():
    reset()
    dark = material('Charcoal ceramic', 'charcoal', .4, .27)
    ink = material('Ink architectural surface', 'ink', .05, .65)
    alloy = material('Brown brushed alloy', 'earth', .8, .28)
    amber = material('Amber edge alloy', 'amber', .7, .2)
    teal = material('Teal intelligent light', 'teal', .2, .2, 1.7)
    visor = material('Dark visor', 'ink', .9, .12)
    box('Floor', (0, 0, -.08), (5, 4, .16), ink)
    box('Backdrop', (0, 1.35, 1.7), (5, .14, 3.5), ink)
    for sign in (-1, 1):
        box(f'Frame{sign}', (sign*1.45, 1.2, 1.65), (.055, .15, 2.8), alloy)
        box(f'ArchitecturalLight{sign}', (sign*1.38, 1.1, 1.65), (.015, .025, 2.35), teal)
    torus('StageRim', .84, .018, amber, location=(0, 0, .02))
    sphere('ShoulderShell', (0, 0, .77), (.58, .26, .38), dark)
    sphere('Torso', (0, .015, .47), (.36, .24, .45), dark)
    sphere('ChestLight', (0, -.228, .68), (.09, .018, .09), teal)
    sphere('Neck', (0, 0, 1.17), (.14, .13, .22), alloy)
    head = pivot('HeadPivot', (0, 0, 1.63))
    sphere('HeadShell', (0, 0, 1.63), (.37, .29, .44), dark, head)
    sphere('Visor', (0, -.245, 1.7), (.3, .075, .18), visor, head)
    for sign in (-1, 1):
        sphere(f'Optic{sign}', (sign*.126, -.309, 1.72), (.075, .012, .012), teal, head)
    torus('VoiceAperture', .064, .009, teal, location=(0, -.284, 1.47), rotation=(math.pi/2, 0, 0), parent=head)
    for frame, angle in [(1, 0), (61, .035), (121, -.035), (181, 0), (241, 0)]:
        head.rotation_euler.z = angle
        head.keyframe_insert(data_path='rotation_euler', frame=frame)
    bpy.context.scene.frame_set(1)
    return (0, -5.2, 1.9), (0, 0, 1.18)


def camera_and_lights(position, target):
    scene = bpy.context.scene
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (*linear(PALETTE['ink']), 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .25
    bpy.ops.object.camera_add(location=position)
    camera = bpy.context.object
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 48
    scene.camera = camera
    for name, location, color, energy, size in [('Key', (-3,-4,4), 'ivory', 650, 4), ('Teal rim', (3,0,3), 'teal', 500, 3), ('Warm fill', (-2,1,2), 'amber', 300, 2)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.name = name
        light.data.color = linear(PALETTE[color])
        light.data.energy = energy
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (Vector(target) - light.location).to_track_quat('-Z', 'Y').to_euler()


if __name__ == '__main__':
    manifest = {'generator': 'scripts/blender/generate_assets.py', 'blender': bpy.app.version_string, 'palette': PALETTE, 'assets': []}
    for name, build in [('intelligence-core', core), ('interview-studio', studio)]:
        position, target = build()
        camera_and_lights(position, target)
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 32
        scene.render.resolution_x = 640
        scene.render.resolution_y = 640 if name == 'intelligence-core' else 480
        scene.render.resolution_percentage = 100
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES / f'{name}.blend'))
        output = OUTPUT / f'{name}.glb'
        bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_apply=True, export_animations=True, export_cameras=False, export_lights=False, export_texcoords=False)
        triangles = 0
        for obj in scene.objects:
            if obj.type == 'MESH':
                mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
                mesh.calc_loop_triangles()
                triangles += len(mesh.loop_triangles)
                obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
        if triangles > 30000 or output.stat().st_size > 2_000_000:
            raise RuntimeError(f'{name} exceeded the web asset budget')
        manifest['assets'].append({'file': f'/models/{name}.glb', 'bytes': output.stat().st_size, 'triangles': triangles, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'source': f'assets/blender/{name}.blend'})
        if options.render:
            scene.render.filepath = str(SOURCES / f'{name}-preview.png')
            bpy.ops.render.render(write_still=True)
    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(manifest, indent=2))
