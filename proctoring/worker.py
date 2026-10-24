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


class Analyzer:
    def __init__(self):
        self.directions = DirectionEstimator()
        self.movements = MovementEstimator()
        self.events = VisionEvents()
        cv2.setNumThreads(int(setting('CPU_THREADS', 1, 1, 8)))
        required = ['face_landmarker.task']
        if any(not (MODELS / name).is_file() for name in required):
            raise FileNotFoundError('Required MediaPipe model asset missing')
        self.resources = ExitStack()
        vision = mp.tasks.vision
        base = mp.tasks.BaseOptions
        try:
            self.face = self.resources.enter_context(vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
                base_options=base(model_asset_path=str(MODELS / "face_landmarker.task"), delegate=base.Delegate.CPU),
                num_faces=3, min_face_detection_confidence=0.7,
                output_facial_transformation_matrixes=True)))
            self.module_status = {'face': 'ready'}
            def optional_model(name, filename, factory, options):
                if os.environ.get('PROCTORING_' + name.upper() + '_ENABLED', 'true').lower() == 'false':
                    self.module_status[name] = 'disabled'
                    return None
                try:
                    model = self.resources.enter_context(factory(options(
                        base_options=base(model_asset_path=str(MODELS / filename), delegate=base.Delegate.CPU))))
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
        except Exception:
            self.resources.close()
            raise
        self.previous = {}

    def close(self):
        self.resources.close()
        self.previous.clear()

    def analyze(self, payload):
        raw = base64.b64decode(payload["image"], validate=True)
        if len(raw) > 180_000:
            raise ValueError("Frame exceeds 180 KB")
        if not raw.startswith(b'\xff\xd8\xff'):
            raise ValueError('Only JPEG camera samples are supported')
        frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None or max(frame.shape[:2]) > 1280:
            raise ValueError("Invalid or oversized frame")
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        faces = self.face.detect(image)
        poses = self.pose.detect(image) if self.pose is not None else SimpleNamespace(pose_landmarks=[])
        hands = self.hand.detect(image) if self.hand is not None else SimpleNamespace(hand_landmarks=[], handedness=[])
        orientation, gaze = "unavailable", "unavailable"
        head_pose, gaze_reliable = None, False
        if len(faces.face_landmarks) == 1:
            points = faces.face_landmarks[0]
            if faces.facial_transformation_matrixes:
                matrix = faces.facial_transformation_matrixes[0]
                yaw = math.degrees(math.atan2(matrix[0, 2], matrix[2, 2]))
                pitch = math.degrees(math.atan2(-matrix[1, 2], math.hypot(matrix[0, 2], matrix[2, 2])))
                roll = math.degrees(math.atan2(matrix[1, 0], matrix[0, 0]))
                head_pose = {"yaw": round(yaw, 1), "pitch": round(pitch, 1), "roll": round(roll, 1)}
                orientation = "turned" if abs(yaw) > 30 or abs(pitch) > 25 else "roughly_forward"
        now = time.monotonic()
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
        if len(tracks) == 1:
            box = bounds[0]
            height, width = frame.shape[:2]
            roi = frame[max(0, int(box[1] * height)):min(height, int(math.ceil(box[3] * height))), max(0, int(box[0] * width)):min(width, int(math.ceil(box[2] * width)))]
            checks['largeEnough'] = (box[2] - box[0]) * (box[3] - box[1]) >= .025
            if roi.size:
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                checks['wellLit'] = 40 <= float(gray.mean()) <= 220
                checks['sharpEnough'] = float(cv2.Laplacian(gray, cv2.CV_64F).var()) >= 30
        quality = {'checks': checks, 'score': round(sum(checks.values()) / len(checks), 2), 'method': 'image-and-geometry-checks', 'detectorConfidence': None}
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
        self.previous[payload["sessionId"]] = {"at": now, "movement": movement_state,
                                               "direction": direction_state, "faces": [{k: v for k, v in track.items() if k != "landmarks"} for track in (tracks or old_faces)], "last_face_at": last_face_at, "next_id": next_id}
        result = {"movementObservation": movement, "directionEstimate": direction, "faceState": face_state, "faceQuality": quality, "faceTracks": tracks, "headPoseDegrees": head_pose, "gazeReliable": gaze_reliable, "handObservations": hand_details,
                "positionShift": round(position_shift, 3) if position_shift is not None else None,
                "faceTrackingReliable": len(faces.face_landmarks) == 1 and bool(faces.facial_transformation_matrixes),
                "faceCount": len(faces.face_landmarks), "headOrientation": orientation,
                "gazeDirection": gaze, "upperBodyVisible": movement['body']['center'] is not None,
                "upperBodyMovement": round(body_motion, 3) if body_motion is not None else None,
                "handCount": len(hand_positions), "handPositions": hand_positions,
                "handMovement": round(hand_motion, 3) if hand_motion is not None else None}
        result['moduleStatus'] = dict(self.module_status)
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
