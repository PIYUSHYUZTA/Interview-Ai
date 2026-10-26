"""Approximate camera-coordinate directions, not calibrated eye tracking or intent.

No images or biometric templates are retained. Missing/poor samples reset smoothing, except a
blink: closed eyes briefly hold the previous gaze estimate instead of restarting it.
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
        self.blink_hold = setting('BLINK_HOLD_SECONDS', .8, 0, 3)
        self.turn_yaw = setting('HEAD_TURN_YAW_DEG', 25, 10, 70)
        self.turn_min = setting('HEAD_TURN_MIN_SECONDS', 1, .3, 5)
        self.turn_window = setting('HEAD_TURN_WINDOW_SECONDS', 60, 10, 600)
        self.turn_repeats = setting('REPEATED_HEAD_TURNS', 4, 2, 20)

    @staticmethod
    def eyes_closed(points):
        """Both lids nearly shut relative to eye width: a blink (or closed eyes), not a gaze change."""
        if len(points) < 478:
            return False
        for (a, b), (upper, lower) in [((33, 133), (159, 145)), ((362, 263), (386, 374))]:
            span = math.dist((points[a].x, points[a].y), (points[b].x, points[b].y))
            if span < .008 or math.dist((points[upper].x, points[upper].y), (points[lower].x, points[lower].y)) / span >= .10:
                return False
        return True

    def head_turns(self, now, yaw, old, continuous):
        """Count raw-yaw turns held for at least turn_min; a turn ends when the head comes back
        within the hysteresis band. Quick glances and the smoothed slow drift do not count."""
        times = [t for t in old.get('turn_times', []) if now-t <= self.turn_window]
        start = old.get('turn_start') if continuous else None
        counted = old.get('turn_counted', False) if start is not None else False
        if yaw is None:
            start, counted = None, False
        elif abs(yaw) > self.turn_yaw:
            if start is None:
                start, counted = now, False
            if not counted and now-start >= self.turn_min:
                times.append(start); counted = True
        elif abs(yaw) < self.turn_yaw*.7:
            start, counted = None, False
        return times, start, counted

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
        eye_usable = valid and abs(pose['yaw']) <= self.yaw and abs(pose['pitch']) <= self.pitch
        eye = self.eyes(points) if eye_usable else None
        closed = eye_usable and eye is None and self.eyes_closed(points)
        # A blink keeps the last estimate (no update, no reset) for up to blink_hold seconds.
        held = closed and continuous and old.get('eye') is not None and now-old.get('eye_at', now) <= self.blink_hold
        eye_continuous = continuous and eye is not None and old.get('eye') is not None
        eye_at = now if eye is not None else old.get('eye_at') if held else None
        if held:
            eye, eye_count = old['eye'], old.get('eye_count', 0)
        else:
            eye = [p+alpha*(v-p) for p, v in zip(old['eye'], eye)] if eye_continuous else eye
            eye_count = old.get('eye_count', 0)+1 if eye_continuous else 1 if eye is not None else 0
        turn_times, turn_start, turn_counted = self.head_turns(now, pose['yaw'] if valid else None, old, continuous)
        gaze = []
        if eye_count >= 2:
            if abs(eye[0]-.5) > self.eye_x: gaze.append('right' if eye[0] > .5 else 'left')
            if abs(eye[1]-.5) > self.eye_y: gaze.append('down' if eye[1] > .5 else 'up')
        uncertain_since = old.get('uncertain_since') if not reliable else None
        if not reliable and uncertain_since is None: uncertain_since = now
        eye_uncertain = None if eye_count >= 2 else old.get('eye_uncertain', now)
        if eye_count < 2 and eye_uncertain is None: eye_uncertain = now
        reason = 'usable' if reliable else 'missing_pose' if pose is None else framing if framing != 'useful_area' else 'image_quality' if not quality else 'warming_up'
        state = dict(at=now, track=track, pose=smooth, count=count, eye=eye, eye_count=eye_count, eye_at=eye_at, uncertain_since=uncertain_since, eye_uncertain=eye_uncertain,
                     turn_times=turn_times, turn_start=turn_start, turn_counted=turn_counted)
        result = dict(headDirections=head if reliable else ['unavailable'], gazeDirections=gaze if eye_count >= 2 else ['unavailable'],
                      headReliable=reliable, gazeReliable=eye_count >= 2, framing=framing,
                      smoothedPoseDegrees={k: round(v, 1) for k, v in smooth.items()} if smooth else None,
                      headChangeDegrees=round(math.sqrt(sum(difference(smooth[k], old['pose'][k])**2 for k in smooth)), 1) if continuous else None,
                      unreliableForMs=round((now-uncertain_since)*1000) if uncertain_since is not None else 0,
                      gazeUnreliableForMs=round((now-eye_uncertain)*1000) if eye_uncertain is not None else 0, reliabilityReason=reason,
                      gazeOffset={'horizontal': round(eye[0]-.5, 3), 'vertical': round(eye[1]-.5, 3)} if eye is not None else None,
                      validSamples=count, eyesClosed=bool(closed), blinkHeld=bool(held),
                      recentHeadTurns=len(turn_times), headTurnWindowSeconds=round(self.turn_window), repeatedHeadTurns=len(turn_times) >= self.turn_repeats,
                      method='landmark-geometric-estimate', coordinateSystem='unmirrored-camera', calibrated=False)
        return result, state
