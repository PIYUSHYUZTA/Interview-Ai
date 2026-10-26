"""Phone visibility from a genuine object detector (EfficientDet-Lite0, COCO 'cell phone' class).

Hand landmarks cannot recognise objects; this module only interprets object-detector boxes. A
phone counts as seen only after several detections in a short span of scans, because the detector
also gives low-score 'cell phone' boxes to hands holding other things. 'Seen' means an object the
model scored as a phone was visible to the camera, never that it was used.
"""
import math
from direction import setting


def overlaps(box, hand_points, margin=.05):
    """True when any hand landmark falls inside the box grown by margin."""
    x0, y0, x1, y1 = box[0]-margin, box[1]-margin, box[2]+margin, box[3]+margin
    return any(x0 <= x <= x1 and y0 <= y <= y1 for hand in hand_points for x, y in hand)


class PhoneEstimator:
    def __init__(self):
        self.threshold = setting('PHONE_SCORE_THRESHOLD', .3, .1, .9)
        self.interval = setting('PHONE_SCAN_SECONDS', 1, 0, 10)
        self.confirm = int(setting('PHONE_CONFIRM_SCANS', 3, 1, 10))
        self.window = int(setting('PHONE_SCAN_WINDOW', 4, 1, 20))
        self.gap = setting('PHONE_GAP_SECONDS', 6, 2, 30)
        if self.confirm > self.window:
            raise ValueError('Invalid phone setting: PHONE_CONFIRM_SCANS exceeds PHONE_SCAN_WINDOW')

    def due(self, now, old):
        return now-(old or {}).get('scan_at', -1e9) >= self.interval

    def update(self, now, detections, hand_points, old=None, scanned=True):
        """detections: [(score, [x0, y0, x1, y1])] normalised, already restricted to 'cell phone'.
        Between scans (scanned=False) the last result is reported unchanged."""
        old = old or {}
        scans = [s for s in old.get('scans', []) if now-s[0] <= self.gap]
        if scanned:
            best = max((d for d in detections if d[0] >= self.threshold), key=lambda d: d[0], default=None)
            scans = (scans + [[now, best[0] if best else None, best[1] if best else None]])[-self.window:]
        positives = [s for s in scans if s[1] is not None]
        seen = len(positives) >= self.confirm
        since = (old.get('since') or now) if seen else None
        latest = positives[-1] if positives else None
        box = [round(v, 4) for v in latest[2]] if latest and scans and scans[-1][1] is not None else None
        status = 'not_scanned' if not scans else 'seen' if seen else 'candidate' if positives else 'not_seen'
        result = dict(status=status, positiveScans=len(positives), recentScans=len(scans), requiredScans=self.confirm,
            score=round(latest[1], 2) if box else None, box=box, heldInHand=bool(box) and overlaps(box, hand_points),
            seenForMs=round((now-since)*1000) if since is not None else 0, scoreThreshold=self.threshold,
            method='efficientdet-lite0-coco-cell-phone', calibrated=False)
        state = dict(scans=scans, since=since, scan_at=now if scanned else old.get('scan_at'))
        return result, state


def to_box(detection, width, height):
    """MediaPipe pixel bounding box -> normalised [x0, y0, x1, y1] clamped to the frame."""
    b = detection.bounding_box
    clamp = lambda v: min(1., max(0., v))
    box = [clamp(b.origin_x/width), clamp(b.origin_y/height), clamp((b.origin_x+b.width)/width), clamp((b.origin_y+b.height)/height)]
    return box if all(math.isfinite(v) for v in box) and box[2] > box[0] and box[3] > box[1] else None
