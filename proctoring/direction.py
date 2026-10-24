"""Approximate camera-coordinate directions, not calibrated eye tracking or intent.

No images or biometric templates are retained. Missing/poor samples reset smoothing.
"""
import math
import os
from observations import eye_ratio


def setting(name, default, low, high):
    value = float(os.environ.get('PROCTORING_' + name, default))
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Invalid direction setting: ' + name)
    return value


class DirectionEstimator:
    def __init__(self):
        self.yaw = setting('HEAD_YAW_DEG', 30, 10, 70)
        self.pitch = setting('HEAD_PITCH_DEG', 25, 10, 60)
        self.eye_x = setting('GAZE_HORIZONTAL_THRESHOLD', .25, .1, .4)
        self.eye_y = setting('GAZE_VERTICAL_THRESHOLD', .30, .15, .45)
        self.tau = setting('SMOOTHING_SECONDS', 3, .2, 10)
        self.gap = setting('TRACKING_GAP_SECONDS', 6, 3, 15)
        self.area = setting('MIN_FACE_AREA', .025, .005, .15)
        self.margin = setting('FRAME_MARGIN', .02, 0, .15)

    def eyes(self, points):
        if len(points) < 478:
            return None
        values = []
        for corners, iris, lids in [((33, 133), 468, (159, 145)), ((362, 263), 473, (386, 374))]:
            x = eye_ratio(points, corners, iris, lids)
            if x is None:
                return None
            a, b = (points[i] for i in corners)
            upper, lower = (points[i] for i in lids)
            # Project on the eye-axis normal so roll does not become vertical gaze.
            dx, dy = b.x-a.x, b.y-a.y
            if dx < 0:
                dx, dy = -dx, -dy
            nx, ny = -dy, dx
            opening = (lower.x-upper.x)*nx + (lower.y-upper.y)*ny
            if opening <= 0:
                return None
            pupil = points[iris]
            y = ((pupil.x-upper.x)*nx + (pupil.y-upper.y)*ny) / opening
            if not math.isfinite(y) or not -.1 <= y <= 1.1:
                return None
            values.append((x, y))
        if abs(values[0][0]-values[1][0]) > .20 or abs(values[0][1]-values[1][1]) > .25:
            return None
        return [(a+b)/2 for a, b in zip(*values)]

    def update(self, now, pose, points, box, quality, old=None, track=None):
        old = old or {}
        area = (box[2]-box[0])*(box[3]-box[1]) if box else 0
        framing = 'unavailable' if box is None else 'too_far' if area < self.area else 'outside_useful_area' if min(box[0], box[1], 1-box[2], 1-box[3]) < self.margin else 'useful_area'
        valid = pose is not None and framing == 'useful_area' and quality
        continuous = valid and old.get('track') == track and 0 < now-old.get('at', now) <= self.gap and old.get('pose') is not None
        alpha = 1-math.exp(-(now-old['at'])/self.tau) if continuous else 1
        def difference(value, prior):
            return (value-prior+180) % 360-180
        smooth = {k: (old['pose'][k] + alpha*difference(v, old['pose'][k])+180) % 360-180 for k, v in pose.items()} if continuous else pose if valid else None
        count = old.get('count', 0)+1 if continuous else 1 if valid else 0
        reliable = count >= 2
        head = []
        if reliable:
            if abs(smooth['yaw']) > self.yaw: head.append('right' if smooth['yaw'] > 0 else 'left')
            if abs(smooth['pitch']) > self.pitch: head.append('up' if smooth['pitch'] > 0 else 'down')
        eye = self.eyes(points) if valid and abs(pose['yaw']) <= self.yaw and abs(pose['pitch']) <= self.pitch else None
        eye_continuous = continuous and eye is not None and old.get('eye') is not None
        eye = [p+alpha*(v-p) for p, v in zip(old['eye'], eye)] if eye_continuous else eye
        eye_count = old.get('eye_count', 0)+1 if eye_continuous else 1 if eye is not None else 0
        gaze = []
        if eye_count >= 2:
            if abs(eye[0]-.5) > self.eye_x: gaze.append('right' if eye[0] > .5 else 'left')
            if abs(eye[1]-.5) > self.eye_y: gaze.append('down' if eye[1] > .5 else 'up')
        uncertain_since = old.get('uncertain_since') if not reliable else None
        if not reliable and uncertain_since is None: uncertain_since = now
        eye_uncertain = None if eye_count >= 2 else old.get('eye_uncertain', now)
        if eye_count < 2 and eye_uncertain is None: eye_uncertain = now
        reason = 'usable' if reliable else 'missing_pose' if pose is None else framing if framing != 'useful_area' else 'image_quality' if not quality else 'warming_up'
        state = dict(at=now, track=track, pose=smooth, count=count, eye=eye, eye_count=eye_count, uncertain_since=uncertain_since, eye_uncertain=eye_uncertain)
        result = dict(headDirections=head if reliable else ['unavailable'], gazeDirections=gaze if eye_count >= 2 else ['unavailable'],
                      headReliable=reliable, gazeReliable=eye_count >= 2, framing=framing,
                      smoothedPoseDegrees={k: round(v, 1) for k, v in smooth.items()} if smooth else None,
                      headChangeDegrees=round(math.sqrt(sum(difference(smooth[k], old['pose'][k])**2 for k in smooth)), 1) if continuous else None,
                      unreliableForMs=round((now-uncertain_since)*1000) if uncertain_since is not None else 0,
                      gazeUnreliableForMs=round((now-eye_uncertain)*1000) if eye_uncertain is not None else 0, reliabilityReason=reason,
                      validSamples=count, method='landmark-geometric-estimate', coordinateSystem='unmirrored-camera', calibrated=False)
        return result, state
