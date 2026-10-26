"""Measure phone detection through the real worker on the phone fixtures (not a benchmark).

Each image is analysed as a short still sequence with a scan on every frame, exactly as the
worker runs it (JPEG in, Python models, confirmation over several scans). Prints one row per
image and the found / missed / false-positive counts.

    .venv-proctoring\\Scripts\\python.exe scripts\\measure-phone-detection.py
"""
import base64
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault('PROCTORING_PHONE_SCAN_SECONDS', '0')
sys.path.insert(0, str(ROOT / 'proctoring'))
import cv2  # noqa: E402
from worker import Analyzer  # noqa: E402

FIXTURES = ROOT / 'proctoring' / 'fixtures'
CASES = [(p, not p.name.startswith('no-phone')) for p in sorted((FIXTURES / 'phones').glob('*.jpg'))]
CASES += [(FIXTURES / 'portrait.jpg', False), (FIXTURES / 'right_hands.jpg', False)]

analyzer = Analyzer()
found = missed = false_positive = 0
for path, has_phone in CASES:
    image = cv2.imread(str(path))
    scale = 640 / max(image.shape[:2])
    image = cv2.resize(image, (int(image.shape[1] * scale), int(image.shape[0] * scale)))
    data = base64.b64encode(cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 85])[1]).decode()
    started = time.perf_counter()
    for _ in range(4):
        result = analyzer.analyze({'sessionId': path.name, 'image': data})
    phone = result['phoneObservation']
    seen = phone['status'] == 'seen'
    found += has_phone and seen; missed += has_phone and not seen; false_positive += seen and not has_phone
    print(f"{path.name:24s} phone={'yes' if has_phone else 'no ':3s} -> {phone['status']:9s} score={phone['score']} inHand={phone['heldInHand']} box={phone['box']} "
          f"({(time.perf_counter() - started) / 4 * 1000:.0f} ms/frame incl. face/pose/hands)")
print(f'found {found}/{found + missed} phones, {false_positive} false positives in {sum(1 for _, p in CASES if not p)} phone-free images '
      f"(threshold {analyzer.phones.threshold}, {analyzer.phones.confirm} of {analyzer.phones.window} scans)")
analyzer.close()
