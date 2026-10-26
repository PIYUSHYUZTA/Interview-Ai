"""Web-delivery helpers shared by the prepare scripts: shape-key-safe hair-strand
reduction and a reusable scene layout. Run inside Blender."""
import bmesh
import bpy


def thin_strands(obj, keep_every=2):
    """Keep one of every `keep_every` hair strands (connected islands), e.g. eyelashes.

    MakeHuman lashes are already minimal per strand (a 3-segment triangular tube), so the
    cost is strand count, not strand detail. Deleting whole islands only removes vertices,
    so shape keys (blinks), UVs and skin weights stay valid on everything that remains.
    Returns (triangles before, triangles after).
    """
    mesh = obj.data
    before = sum(len(p.vertices) - 2 for p in mesh.polygons)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    seen, islands = set(), []
    for start in bm.verts:
        if start.index in seen:
            continue
        island, stack = [], [start]
        while stack:
            vert = stack.pop()
            if vert.index in seen:
                continue
            seen.add(vert.index); island.append(vert)
            stack.extend(e.other_vert(vert) for e in vert.link_edges)
        islands.append(island)
    islands.sort(key=lambda island: min(v.index for v in island))
    doomed = [v for index, island in enumerate(islands) if index % keep_every for v in island]
    bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    after = sum(len(p.vertices) - 2 for p in mesh.polygons)
    return before, after


def organize(scene, groups):
    """Move objects into named collections so each .blend is easy to reuse.

    `groups` maps a collection name to a predicate on the object; the first match wins.
    Export is unaffected: glTF still exports every visible object.
    """
    for name in groups:
        if name not in bpy.data.collections:
            scene.collection.children.link(bpy.data.collections.new(name))
    for obj in list(scene.objects):
        target = next((bpy.data.collections[name] for name, test in groups.items() if test(obj)), None)
        if target is None or target in obj.users_collection:
            continue
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        target.objects.link(obj)
    # Drop empty leftovers: Blender's default collection, the glTF importer's, earlier builds'.
    for collection in list(scene.collection.children):
        if collection.name not in groups and not collection.objects and not collection.children:
            bpy.data.collections.remove(collection)


def is_character(obj):
    return obj.type == 'ARMATURE' or (obj.type == 'MESH' and obj.find_armature() is not None)


def is_camera_or_light(obj):
    return obj.type in {'CAMERA', 'LIGHT'}
