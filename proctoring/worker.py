"""JSON-lines worker. Frames exist in memory only; stdout contains observations only."""
import base64
import json
import math
import os
import sys
import time
from contextlib import ExitStack
from types import SimpleNamespace
from observations import match_positions
from direction import DirectionEstimator, setting
from movement import MovementEstimator
from events import VisionEvents
from phone import PhoneEstimator, to_box
from acceleration import Accelerator
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault('MPLCONFIGDIR', str(Path(__file__).parent / '.cache'))
os.environ.setdefault('OPENCV_IO_MAX_IMAGE_PIXELS', '1638400')
os.environ.setdefault('OPENCV_IO_MAX_IMAGE_WIDTH', '1280')
os.environ.setdefault('OPENCV_IO_MAX_IMAGE_HEIGHT', '1280')

try:
    import cv2
    import mediapipe as mp
    import numpy as np
except (ImportError, OSError):
    print(json.dumps({"ok": False, "code": "DEPENDENCY_LOAD_FAILED"}), flush=True)
    sys.exit(1)

MODELS = Path(__file__).parent / "models"


def enhance_low_light(image):
    """Local contrast enhancement (CLAHE on lightness) for dark frames; colour is preserved."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    lightness, a, b = cv2.split(lab)
    lightness = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(lightness)
    return cv2.cvtColor(cv2.merge((lightness, a, b)), cv2.COLOR_LAB2BGR)


def face_bounds(face):
    return min(p.x for p in face), min(p.y for p in face), max(p.x for p in face), max(p.y for p in face)


def same_face(a, b):
    """Two landmark sets describe one face when their centres are closer than ~half a face width."""
    ax0, ay0, ax1, ay1 = face_bounds(a); bx0, by0, bx1, by1 = face_bounds(b)
    reach = .5 * min(ax1 - ax0, bx1 - bx0)
    return math.dist(((ax0 + ax1) / 2, (ay0 + ay1) / 2), ((bx0 + bx1) / 2, (by0 + by1) / 2)) < max(reach, .02)


def crop_box(frame, cx, cy, size):
    """Square crop (normalised centre and edge) clamped to the frame; returns pixels and its normalised box."""
    height, width = frame.shape[:2]
    edge = max(16, int(size * min(width, height)))
    x0 = int(min(max(cx * width - edge / 2, 0), max(width - edge, 0)))
    y0 = int(min(max(cy * height - edge / 2, 0), max(height - edge, 0)))
    pixels = frame[y0:y0 + edge, x0:x0 + edge]
    return pixels, (x0 / width, y0 / height, pixels.shape[1] / width, pixels.shape[0] / height)


class Analyzer:
    def __init__(self):
        self.directions = DirectionEstimator()
        self.person_scan_interval = setting('PERSON_SCAN_SECONDS', 1, .25, 10)
        self.movements = MovementEstimator()
        self.phones = PhoneEstimator()
        self.dark_level = setting('FRAME_DARK_LEVEL', 20, 0, 120)
        self.flat_contrast = setting('FRAME_FLAT_CONTRAST', 6, 0, 60)
        self.events = VisionEvents()
        cv2.setNumThreads(int(setting('CPU_THREADS', 1, 1, 8)))
        required = ['face_landmarker.task']
        if any(not (MODELS / name).is_file() for name in required):
            raise FileNotFoundError('Required MediaPipe model asset missing')
        self.resources = ExitStack()
        vision = mp.tasks.vision
        loading = time.perf_counter()
        # Models are created once per worker process and reused for every frame and interview.
        self.accelerator = Accelerator(mp.tasks.BaseOptions)
        try:
            self.face = self.resources.enter_context(self.accelerator.create('face', vision.FaceLandmarker.create_from_options,
                lambda **kw: vision.FaceLandmarkerOptions(num_faces=3, min_face_detection_confidence=0.7, output_facial_transformation_matrixes=True, **kw),
                str(MODELS / "face_landmarker.task")))
            self.module_status = {'face': 'ready'}
            def optional_model(name, filename, factory, options):
                if os.environ.get('PROCTORING_' + name.upper() + '_ENABLED', 'true').lower() == 'false':
                    self.module_status[name] = 'disabled'
                    return None
                try:
                    model = self.resources.enter_context(self.accelerator.create(name, factory, options, str(MODELS / filename)))
                    self.module_status[name] = 'ready'
                    return model
                except Exception:
                    # Optional model failure must not disable face presence. No raw paths or frames logged.
                    self.module_status[name] = 'unavailable'
                    return None
            self.pose = optional_model('pose', 'pose_landmarker_lite.task', vision.PoseLandmarker.create_from_options,
                lambda **kw: vision.PoseLandmarkerOptions(num_poses=3, min_pose_detection_confidence=.7, **kw))
            self.hand = optional_model('hands', 'hand_landmarker.task', vision.HandLandmarker.create_from_options,
                lambda **kw: vision.HandLandmarkerOptions(num_hands=2, min_hand_detection_confidence=.7, **kw))
            # A genuine object detector (COCO); only its 'cell phone' class is used.
            self.phone = optional_model('phone', 'efficientdet_lite0.tflite', vision.ObjectDetector.create_from_options,
                lambda **kw: vision.ObjectDetectorOptions(score_threshold=self.phones.threshold, category_allowlist=['cell phone'], max_results=3, **kw))
        except Exception:
            self.resources.close()
            raise
        self.runtime = {'acceleration': self.accelerator.report(), 'modelLoadMs': round((time.perf_counter() - loading) * 1000)}
        self.previous = {}

    def close(self):
        self.resources.close()
        self.previous.clear()

    def detect_faces(self, rgb):
        return self.face.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))

    def scan_faces(self, frame, poses, dark):
        """Look again where the full frame can miss faces: each person the pose model sees (zoomed on
        the head), left/right tiles, the centre, and a contrast-enhanced frame when dark. Every face
        found is mapped back to full-frame coordinates; duplicates across views are merged."""
        height, width = frame.shape[:2]
        views = [('low-light', enhance_low_light(frame), (0., 0., 1., 1.))] if dark else []
        for pose in [p for p in poses.pose_landmarks if len(p) >= 13 and p[0].visibility >= .5]:
            span = math.dist((pose[11].x, pose[11].y), (pose[12].x, pose[12].y)) if min(pose[11].visibility, pose[12].visibility) >= .5 else .12
            pixels, box = crop_box(frame, pose[0].x, pose[0].y, min(.7, max(.22, span * 2.4)))
            views.append(('pose-guided', pixels, box))
        tile = int(width * .625)
        for x0 in (0, width - tile):
            views.append(('person-scan', frame[:, x0:x0 + tile], (x0 / width, 0., tile / width, 1.)))
        pixels, box = crop_box(frame, .5, .5, .45)
        views.append(('zoomed', pixels, box))
        found_landmarks, found_matrices, methods = [], [], []
        for name, pixels, box in views:
            if pixels.size == 0:
                continue
            if box[2] < 1. or box[3] < 1.:  # upscale so the short-range face model sees normal-sized faces
                scale = 640 / max(pixels.shape[:2])
                pixels = cv2.resize(pixels, (max(1, int(pixels.shape[1] * scale)), max(1, int(pixels.shape[0] * scale))), interpolation=cv2.INTER_CUBIC)
            result = self.detect_faces(cv2.cvtColor(pixels, cv2.COLOR_BGR2RGB))
            x0, y0, w, h = box
            for index, face in enumerate(result.face_landmarks):
                mapped = [SimpleNamespace(x=x0 + point.x * w, y=y0 + point.y * h, z=point.z * w) for point in face]
                matrix = result.facial_transformation_matrixes[index] if index < len(result.facial_transformation_matrixes) else None
                if not any(same_face(mapped, other) for other in found_landmarks):
                    found_landmarks.append(mapped); found_matrices.append(matrix); methods.append(name)
        return found_landmarks, found_matrices, methods

    def analyze(self, payload):
        started = time.perf_counter()
        raw = base64.b64decode(payload["image"], validate=True)
        if len(raw) > 180_000:
            raise ValueError("Frame exceeds 180 KB")
        if not raw.startswith(b'\xff\xd8\xff'):
            raise ValueError('Only JPEG camera samples are supported')
        frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None or max(frame.shape[:2]) > 1280:
            raise ValueError("Invalid or oversized frame")
        now = time.monotonic()
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        # Whole-frame usability: a very dark or uniform (covered/blank) image cannot show a face, so
        # "no face" in such a frame is a camera problem, not evidence that the candidate left.
        mean, spread = cv2.meanStdDev(cv2.cvtColor(cv2.resize(frame, (160, 120)), cv2.COLOR_BGR2GRAY))
        brightness, contrast = float(mean[0][0]), float(spread[0][0])
        frame_quality = {'brightness': round(brightness, 1), 'contrast': round(contrast, 1),
                         'usable': brightness >= self.dark_level and contrast >= self.flat_contrast}
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        stages = {}
        def timed(stage, run):
            began = time.perf_counter(); value = run(); stages[stage] = round((time.perf_counter() - began) * 1000, 1); return value
        faces = timed('face', lambda: self.face.detect(image))
        poses = timed('pose', lambda: self.pose.detect(image)) if self.pose is not None else SimpleNamespace(pose_landmarks=[])
        hands = timed('hands', lambda: self.hand.detect(image)) if self.hand is not None else SimpleNamespace(hand_landmarks=[], handedness=[])
        recovery = 'none'
        scan_previous = self.previous.get(payload['sessionId'], {})
        # Full-frame detection misses small/distant faces, notably a second person behind the candidate.
        # Re-scan when nothing was found, and about once a second otherwise.
        if not faces.face_landmarks or now - scan_previous.get('scan_at', -1e9) >= self.person_scan_interval:
            dark = not faces.face_landmarks and float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean()) < 45
            landmarks, matrices, methods = timed('personScan', lambda: self.scan_faces(frame, poses, dark))
            merged = list(faces.face_landmarks); merged_matrices = list(faces.facial_transformation_matrixes or [])
            added = []
            for face, matrix, method in zip(landmarks, matrices, methods):
                if not any(same_face(face, other) for other in merged):
                    merged.append(face); merged_matrices.append(matrix); added.append(method)
            if added:
                recovery = added[0] if not faces.face_landmarks and len(merged) == 1 else 'person-scan'
                faces = SimpleNamespace(face_landmarks=merged, facial_transformation_matrixes=[m for m in merged_matrices if m is not None] if all(m is not None for m in merged_matrices) else merged_matrices[:1] if merged_matrices and merged_matrices[0] is not None else [])
            scan_at = now
        else:
            scan_at = scan_previous.get('scan_at')
        orientation, gaze = "unavailable", "unavailable"
        head_pose, gaze_reliable = None, False
        if len(faces.face_landmarks) == 1:
            points = faces.face_landmarks[0]
            if faces.facial_transformation_matrixes:
                matrix = faces.facial_transformation_matrixes[0]
                yaw = math.degrees(math.atan2(matrix[0, 2], matrix[2, 2]))
                # Positive pitch = looking up. Verified on rendered frames with known head rotation
                # (fixtures/rendered-head); the earlier sign labelled a downward look as 'up'.
                pitch = math.degrees(math.atan2(matrix[1, 2], math.hypot(matrix[0, 2], matrix[2, 2])))
                roll = math.degrees(math.atan2(matrix[1, 0], matrix[0, 0]))
                head_pose = {"yaw": round(yaw, 1), "pitch": round(pitch, 1), "roll": round(roll, 1)}
                orientation = "turned" if abs(yaw) > 30 or abs(pitch) > 25 else "roughly_forward"
        self.previous = {key: value for key, value in self.previous.items() if now - value.get('at', now) <= 900}
        previous = self.previous.get(payload["sessionId"], {})
        if now - previous.get('at', now) > 6:
            previous = {}  # No continuity or stale movement across interruptions.
        bounds = [[min(1., max(0., min(p.x for p in face))), min(1., max(0., min(p.y for p in face))),
                   min(1., max(0., max(p.x for p in face))), min(1., max(0., max(p.y for p in face)))] for face in faces.face_landmarks]
        centers = [[(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] for b in bounds]
        movement, movement_state = self.movements.update(now, hands.hand_landmarks, hands.handedness,
            poses.pose_landmarks, bounds[0] if len(bounds) == 1 else None, previous.get('movement'))
        movement['additionalPersonObserved'] = movement['additionalPersonObserved'] or len(bounds) > 1
        if len(bounds) > 1:
            movement['body']['reliable'] = False
            movement['body']['state'] = 'ambiguous'
            movement_state['body'] = {}  # Do not carry a candidate anchor across ambiguous attribution.
        if self.phone is not None:
            scanned = self.phones.due(now, previous.get('phone'))
            # Spread the two once-a-second scans over different frames so no single frame pays for both,
            # unless the phone scan is already a full interval late.
            if scanned and scan_at == now and not self.phones.due(now - self.phones.interval, previous.get('phone')):
                scanned = False
            detections = []
            if scanned:
                height, width = frame.shape[:2]
                for found in timed('phone', lambda: self.phone.detect(image)).detections:
                    box = to_box(found, width, height)
                    if box and found.categories:
                        detections.append((float(found.categories[0].score), box))
            phone, phone_state = self.phones.update(now, detections, [[(p.x, p.y) for p in hand] for hand in hands.hand_landmarks], previous.get('phone'), scanned)
        else:
            phone, phone_state = None, None
        body_motion = movement['body']['movement']
        position_shift = movement['body']['positionShift']
        hand_details = [{k: hand[k] for k in ('position','gesture','movement')} for hand in movement['handTracks']]
        hand_positions = [h['position'] for h in movement['handTracks']]
        hand_motion = max((h['movement'] for h in movement['handTracks'] if h['movement'] is not None), default=None)
        last_face_at = now if centers else previous.get('last_face_at')
        old_faces = previous.get('faces', []) if previous.get('last_face_at') is not None and now - previous['last_face_at'] <= 6 else []
        face_matches = match_positions(centers, [f['center'] for f in old_faces])
        next_id = previous.get('next_id', 1)
        tracks = []
        for i, (center, box) in enumerate(zip(centers, bounds)):
            if i in face_matches:
                track_id = old_faces[face_matches[i]]['trackId']
            else:
                track_id, next_id = next_id, next_id + 1
            landmark_indices = [33, 133, 362, 263, 1, 4, 61, 291, 152, 10, 234, 454, 468, 473]
            sparse = [[round(min(1., max(0., faces.face_landmarks[i][index].x)), 3), round(min(1., max(0., faces.face_landmarks[i][index].y)), 3)] for index in landmark_indices if index < len(faces.face_landmarks[i])]
            tracks.append({'trackId': track_id, 'center': [round(x, 3) for x in center], 'bounds': [round(x, 3) for x in box], 'landmarks': sparse})
        checks = {'singleFace': len(tracks) == 1, 'largeEnough': False, 'wellLit': False, 'sharpEnough': False, 'forwardFacing': orientation == 'roughly_forward'}
        low_light = False
        if len(tracks) == 1:
            box = bounds[0]
            height, width = frame.shape[:2]
            roi = frame[max(0, int(box[1] * height)):min(height, int(math.ceil(box[3] * height))), max(0, int(box[0] * width)):min(width, int(math.ceil(box[2] * width)))]
            checks['largeEnough'] = (box[2] - box[0]) * (box[3] - box[1]) >= .025
            if roi.size:
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                if float(gray.mean()) < 40:
                    # Dark but detected: judge usability on the contrast-enhanced face, and say so.
                    gray = cv2.cvtColor(enhance_low_light(roi), cv2.COLOR_BGR2GRAY)
                    low_light = True
                checks['wellLit'] = 40 <= float(gray.mean()) <= 220
                checks['sharpEnough'] = float(cv2.Laplacian(gray, cv2.CV_64F).var()) >= 30
        quality = {'checks': checks, 'score': round(sum(checks.values()) / len(checks), 2), 'method': 'image-and-geometry-checks', 'detectorConfidence': None, 'lowLight': low_light, 'recovery': recovery}
        direction, direction_state = self.directions.update(now, head_pose,
            faces.face_landmarks[0] if len(tracks) == 1 else [], bounds[0] if len(tracks) == 1 else None,
            checks['singleFace'] and checks['wellLit'] and checks['sharpEnough'],
            previous.get('direction'), tracks[0]['trackId'] if len(tracks) == 1 else None)
        # Compatibility summaries now use reliable smoothed measurements, including vertical gaze.
        orientation = ('turned' if direction['headDirections'] else 'roughly_forward') if direction['headReliable'] else 'unavailable'
        gaze_reliable = direction['gazeReliable']
        gaze = ('possibly_sideways' if direction['gazeDirections'] else 'roughly_centered') if gaze_reliable else 'unavailable'
        if len(tracks) > 1:
            face_state = 'MULTIPLE_FACES'
        elif len(tracks) == 1:
            face_state = 'FACE_PRESENT' if all(checks.values()) else 'QUALITY_LOW'
        else:
            face_state = 'TRACKING_LOST' if last_face_at is not None and now - last_face_at <= 6 else 'FACE_NOT_DETECTED'
        if payload['sessionId'] not in self.previous and len(self.previous) >= 256:
            self.previous.pop(next(iter(self.previous)))
        self.previous[payload["sessionId"]] = {"at": now, "scan_at": scan_at, "movement": movement_state,
                                               "direction": direction_state, "phone": phone_state, "faces": [{k: v for k, v in track.items() if k != "landmarks"} for track in (tracks or old_faces)], "last_face_at": last_face_at, "next_id": next_id}
        result = {"movementObservation": movement, "directionEstimate": direction, "faceState": face_state, "faceQuality": quality, "faceTracks": tracks, "headPoseDegrees": head_pose, "gazeReliable": gaze_reliable, "handObservations": hand_details,
                "positionShift": round(position_shift, 3) if position_shift is not None else None,
                "faceTrackingReliable": len(faces.face_landmarks) == 1 and bool(faces.facial_transformation_matrixes),
                "faceCount": len(faces.face_landmarks), "headOrientation": orientation,
                "gazeDirection": gaze, "upperBodyVisible": movement['body']['center'] is not None,
                "upperBodyMovement": round(body_motion, 3) if body_motion is not None else None,
                "handCount": len(hand_positions), "handPositions": hand_positions,
                "handMovement": round(hand_motion, 3) if hand_motion is not None else None}
        result['moduleStatus'] = dict(self.module_status)
        result['frameQuality'] = frame_quality
        result['runtime'] = self.runtime
        # What Python actually decoded, so the browser can confirm the frame it sent arrived intact.
        result['frame'] = {'format': 'jpeg', 'width': int(frame.shape[1]), 'height': int(frame.shape[0]), 'bytes': len(raw),
                           'processingMs': round((time.perf_counter() - started) * 1000, 1), 'stagesMs': stages}
        if phone is not None:
            result['phoneObservation'] = phone
        occurred_at = payload.get('observedAt', round(datetime.now(timezone.utc).timestamp()*1000))
        if not isinstance(occurred_at, (int, float)) or not math.isfinite(occurred_at):
            raise ValueError('Invalid sample timestamp')
        result['events'], event_state = self.events.update(payload['sessionId'], now, occurred_at, result, previous.get('events'))
        self.previous[payload['sessionId']]['events'] = event_state
        return result



if __name__ == "__main__":
    analyzer = None
    for line in sys.stdin:
        payload = None
        try:
            payload = json.loads(line)
            if isinstance(payload, dict) and payload.get('command') == 'release':
                if analyzer is not None: analyzer.previous.pop(payload.get('sessionId'), None)
                continue  # Control messages have no stdout response and cannot steal a frame reply.
            if analyzer is None:
                analyzer = Analyzer()
            result = analyzer.analyze(payload)
            print(json.dumps({"ok": True, "observation": result}), flush=True)
        except Exception as error:
            if analyzer is not None and isinstance(payload, dict):
                analyzer.previous.pop(payload.get('sessionId'), None)
            code = 'MODEL_MISSING' if isinstance(error, FileNotFoundError) else 'INVALID_FRAME' if isinstance(error, (ValueError, KeyError, cv2.error)) else 'MODEL_OR_ANALYSIS_FAILED'
            print(json.dumps({"ok": False, "code": code, "error": code}), flush=True)
        finally:
            line = ""  # Do not retain the last base64 frame while waiting for stdin.
            payload = None
    if analyzer is not None:
        analyzer.close()
