"""Geometry-only observations. Labels describe visible pose, never identity or intent."""
import math
from itertools import permutations


def eye_ratio(points, corners, iris, lids):
    a, b = (points[i] for i in corners)
    if a.x > b.x:
        a, b = b, a
    dx, dy = b.x - a.x, b.y - a.y
    span = math.hypot(dx, dy)
    if span < .008:
        return None
    upper, lower = (points[i] for i in lids)
    if math.hypot(upper.x - lower.x, upper.y - lower.y) / span < .10:
        return None  # Blinking/closed eyes do not support eye-direction estimation.
    pupil = points[iris]
    ratio = ((pupil.x - a.x) * dx + (pupil.y - a.y) * dy) / (span * span)
    return ratio if math.isfinite(ratio) and -.1 <= ratio <= 1.1 else None


def gaze_observation(points, orientation):
    if len(points) < 478 or orientation != 'roughly_forward':
        return 'unavailable', False
    ratios = [eye_ratio(points, (33, 133), 468, (159, 145)),
              eye_ratio(points, (362, 263), 473, (386, 374))]
    if any(r is None for r in ratios) or abs(ratios[0] - ratios[1]) > .20:
        return 'unavailable', False
    ratio = sum(ratios) / 2
    return ('possibly_sideways' if ratio < .25 or ratio > .75 else 'roughly_centered'), True


def match_positions(current, previous, maximum=.25):
    """Minimum-distance one-to-one association; no biometric matching."""
    if not current or not previous:
        return {}
    # At most three faces or two hands. Dummy positions permit new/unmatched tracks.
    choices = list(range(len(previous))) + [None] * len(current)
    best, cost = {}, float('inf')
    for assignment in permutations(choices, len(current)):
        candidate, total = {}, 0.0
        for i, old in enumerate(assignment):
            distance = math.dist(current[i], previous[old]) if old is not None else maximum
            if old is not None and distance < maximum:
                candidate[i] = old
                total += distance
            else:
                total += maximum
        if total < cost:
            best, cost = candidate, total
    return best


def hand_gesture(points):
    if len(points) != 21:
        return 'unavailable'
    wrist = points[0]
    def distance(a, b):
        return math.hypot(a.x - b.x, a.y - b.y)
    extended = []
    for tip, joint in ((8, 6), (12, 10), (16, 14), (20, 18)):
        base = distance(points[joint], wrist)
        if base < .015:
            return 'unavailable'
        extended.append(distance(points[tip], wrist) > base * 1.18)
    # Deliberately coarse; thumb pose and gesture meaning are not classified.
    return 'open_fingers' if all(extended) else 'curled_fingers' if not any(extended) else 'mixed_fingers'
