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

def check_web_images(name, gltf, data, skin_limit, other_limit):
    """Embedded maps must be WebP/PNG/JPEG within the size ceilings, and every image must be used."""
    length = struct.unpack_from('<I', data, 12)[0]
    binary = data[20 + length + 8:]
    used = {texture.get('source', texture.get('extensions', {}).get('EXT_texture_webp', {}).get('source')) for texture in gltf.get('textures', [])}
    for index, image in enumerate(gltf.get('images', [])):
        assert index in used, f'{name}: unused embedded image {image.get("name")}'
        view = gltf['bufferViews'][image['bufferView']]
        blob = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        if blob[:4] == b'RIFF' and blob[8:12] == b'WEBP':
            kind = blob[12:16]
            width, height = (((blob[26] | blob[27] << 8) & 0x3FFF), ((blob[28] | blob[29] << 8) & 0x3FFF)) if kind == b'VP8 ' else (1 + (blob[21] | (blob[22] & 0x3F) << 8), 1 + ((blob[22] >> 6) | blob[23] << 2 | (blob[24] & 0x0F) << 10)) if kind == b'VP8L' else (1 + int.from_bytes(blob[24:27], 'little'), 1 + int.from_bytes(blob[27:30], 'little'))
        elif blob[:8] == b'\x89PNG\r\n\x1a\n':
            width, height = struct.unpack('>II', blob[16:24])
        else:
            raise AssertionError(f'{name}: image {image.get("name")} is not WebP or PNG')
        limit = skin_limit if 'skin' in image.get('name', '') or 'female_diffuse' in image.get('name', '') or 'lightskinned' in image.get('name', '') else other_limit
        assert max(width, height) <= limit, f'{name}: {image.get("name")} is {width}x{height}, over {limit}px'


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
    assert {'eyeBlinkLeft','eyeBlinkRight','viseme_PP','viseme_aa','viseme_FF','mouthSmileLeft','jawOpen','mouthFunnel','mouthPucker','mouthStretchLeft','mouthPressLeft'} <= names
    assert {'Head','InterviewerRig','Backdrop','Desk'} <= {node.get('name') for node in gltf['nodes']}
    triangles = sum(gltf['accessors'][primitive['indices']]['count']//3 for mesh in gltf['meshes'] for primitive in mesh['primitives'])
    assert triangles <= 100_000
    check_web_images(path.name, gltf, data, skin_limit=2048, other_limit=1024)
    print(f'PASS human: {len(data):,} bytes, {triangles:,} triangles, embedded textures, skin and facial morphs verified')

# Landing hero: skinned bust with blink/smile shapes, an animated halo and its poster.
path = ROOT / 'frontend/public/models/hero-bust.glb'
if path.exists():
    data = path.read_bytes()
    magic, version, size = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and size == len(data)
    length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20+length])
    receipt = json.loads((path.parent/'hero-bust-manifest.json').read_text(encoding='utf-8'))
    assert receipt['sha256'] == hashlib.sha256(data).hexdigest() and receipt['bytes'] == len(data)
    assert receipt['sourceSha256'] == hashlib.sha256((ROOT/receipt['source']).read_bytes()).hexdigest()
    assert len(data) <= 6_000_000 and gltf.get('skins') and gltf.get('animations')
    assert all('uri' not in entry for entry in gltf['buffers'])
    names = {name for mesh in gltf['meshes'] for name in mesh.get('extras', {}).get('targetNames', [])}
    assert {'eyeBlinkLeft', 'eyeBlinkRight', 'mouthSmileLeft'} <= names
    assert {'Head', 'LeftEye', 'RightEye', 'HaloPivot'} <= {node.get('name') for node in gltf['nodes']}
    triangles = sum(gltf['accessors'][primitive['indices']]['count']//3 for mesh in gltf['meshes'] for primitive in mesh['primitives'])
    assert triangles <= 90_000
    check_web_images(path.name, gltf, data, skin_limit=1024, other_limit=512)
    poster = ROOT / 'frontend/public/models/hero-bust-poster.webp'
    assert poster.exists() and poster.read_bytes()[8:12] == b'WEBP' and poster.stat().st_size <= 200_000
    print(f'PASS hero-bust: {len(data):,} bytes, {triangles:,} triangles, {len(gltf["animations"])} animation clip, WebP textures and {poster.stat().st_size // 1024} KB poster verified')

# Cinematic film rendered from the hero bust: real MP4 container, receipt hash and a web budget.
film_receipt = ROOT / 'frontend/public/media/hero-film-manifest.json'
if film_receipt.exists():
    receipt = json.loads(film_receipt.read_text(encoding='utf-8'))
    poster = ROOT / 'frontend/public/media/hero-film-poster.webp'
    assert poster.exists() and poster.read_bytes()[8:12] == b'WEBP' and poster.stat().st_size <= 150_000
    film = ROOT / 'frontend/public' / receipt['file'].lstrip('/')
    data = film.read_bytes()
    assert data[4:8] == b'ftyp', 'hero film is not an MP4 container'
    assert receipt['bytes'] == len(data) and receipt['sha256'] == hashlib.sha256(data).hexdigest()
    assert len(data) <= 6_000_000, f'hero film is {len(data):,} bytes, over the 6 MB budget'
    print(f"PASS hero-film: {len(data):,} bytes, {receipt['frames']} frames at {receipt['fps']} fps, {receipt['size'][0]}x{receipt['size'][1]}, rendered on {receipt['device']}, SHA256 verified")
