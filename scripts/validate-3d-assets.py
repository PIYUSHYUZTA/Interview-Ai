"""Validate generated GLB structure, embedded resources, animation and budgets."""
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'frontend/public/models/manifest.json').read_text(encoding='utf-8'))
required_nodes = {'intelligence-core.glb': {'CorePivot', 'IntelligenceCrystal'}, 'interview-studio.glb': {'HeadPivot', 'VoiceAperture', 'Backdrop'}}
for asset in manifest['assets']:
    path = ROOT / 'frontend/public' / asset['file'].lstrip('/')
    data = path.read_bytes()
    magic, version, size = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and size == len(data), path
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    gltf = json.loads(data[20:20+length])
    assert all('uri' not in buffer for buffer in gltf['buffers']), 'Unexpected external resource'
    assert not gltf.get('images'), 'This pipeline intentionally exports no texture dependencies'
    assert hashlib.sha256(data).hexdigest() == asset['sha256']
    assert len(data) == asset['bytes'] and len(data) < 2_000_000
    assert (ROOT / asset['source']).is_file()
    assert required_nodes[path.name] <= {node.get('name') for node in gltf['nodes']}
    assert gltf.get('animations') and all(clip['channels'] for clip in gltf['animations'])
    if path.name == 'intelligence-core.glb':
        assert 'KHR_materials_transmission' in gltf.get('extensionsUsed', []), 'Optical glass must export real transmission'
        assert any(material.get('extensions', {}).get('KHR_materials_transmission', {}).get('transmissionFactor', 0) > .8 for material in gltf['materials'])
        assert {'OpticalBlade0', 'TitaniumExoskeleton'} <= {node.get('name') for node in gltf['nodes']}
    triangles = 0
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            assert primitive.get('mode', 4) == 4
            triangles += gltf['accessors'][primitive['indices']]['count'] // 3
    assert 0 < triangles <= 30000
    for view in gltf['bufferViews']:
        assert view.get('byteOffset', 0) + view['byteLength'] <= gltf['buffers'][view['buffer']]['byteLength']
    print(f"PASS {path.name}: {len(data):,} bytes, {triangles:,} triangles, {len(gltf['animations'])} animation clips, SHA256 verified")

# The human uses a separate, explicit budget for its rig, facial morphs and maps.
path = ROOT / 'frontend/public/models/human-interview-studio.glb'
if path.exists():
    data = path.read_bytes()
    magic, version, size = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and size == len(data)
    length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20+length])
    receipt=json.loads((path.parent/'human-interviewer-manifest.json').read_text(encoding='utf-8'))
    assert receipt['sha256']==hashlib.sha256(data).hexdigest() and receipt['bytes']==len(data)
    assert receipt['sourceSha256']==hashlib.sha256((ROOT/receipt['source']).read_bytes()).hexdigest()
    assert len(data) <= 15_000_000 and gltf.get('skins')
    assert all('uri' not in entry for entry in gltf['buffers'])
    assert all('bufferView' in entry for entry in gltf['images'])
    names = {name for mesh in gltf['meshes'] for name in mesh.get('extras', {}).get('targetNames', [])}
    assert {'eyeBlinkLeft','eyeBlinkRight','viseme_PP','viseme_aa','viseme_FF','mouthSmileLeft'} <= names
    assert {'Head','InterviewerRig','Backdrop','Desk'} <= {node.get('name') for node in gltf['nodes']}
    triangles = sum(gltf['accessors'][primitive['indices']]['count']//3 for mesh in gltf['meshes'] for primitive in mesh['primitives'])
    assert triangles <= 100_000
    print(f'PASS human: {len(data):,} bytes, {triangles:,} triangles, embedded textures, skin and facial morphs verified')
