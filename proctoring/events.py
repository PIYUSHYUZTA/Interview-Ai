"""Debounced measurement transitions using the application's integrity-event names.

Confidence is null: the landmark result supplies no calibrated event probability.
Durations use monotonic time; occurredAt is the backend-supplied UTC sample time.
"""
import uuid
from direction import setting


class VisionEvents:
    def __init__(self):
        self.debounce = setting('EVENT_DEBOUNCE_SECONDS', 2, .5, 10)
        self.cooldown = setting('EVENT_COOLDOWN_SECONDS', 10, 2, 120)

    def update(self, session_id, now, occurred_at, observation, old=None):
        old = old or {}
        if now-old.get('at', now) > 6:
            old = {}  # A sampling interruption is not continuous visual evidence.
        signals = dict(old.get('signals', {}))
        direction = observation.get('directionEstimate', {})
        movement = observation.get('movementObservation', {})
        body = movement.get('body', {})
        face = observation['faceState']
        face_type = dict(FACE_PRESENT='face_detected', FACE_NOT_DETECTED='face_not_detected', TRACKING_LOST='tracking_lost', MULTIPLE_FACES='multiple_faces_detected', QUALITY_LOW='tracking_unreliable')[face]
        head = ','.join(direction.get('headDirections', [])) or 'forward'
        gaze = ','.join(direction.get('gazeDirections', [])) or 'centered'
        hands = '|'.join(sorted(f"{h['trackId']}:{h['handedness']}:{h['state']}" for h in movement.get('handTracks', [])))
        hands += '|' + '|'.join(sorted(f"{h['trackId']}:{h['state']}" for h in movement.get('lostHands', [])))
        framing = bool(body.get('outsideUsefulArea')) or direction.get('framing') == 'outside_useful_area'
        observations = [
            ('face', face, face_type, face == 'FACE_PRESENT'),
            ('head', head if direction.get('headReliable') else 'unavailable', 'head_orientation_changed', head == 'forward'),
            ('gaze', gaze if direction.get('gazeReliable') else 'unavailable', 'gaze_tracking_changed', gaze == 'centered'),
            ('hands', hands, 'hand_tracking_changed', not movement.get('lostHands')),
            ('pose', body.get('state', 'unavailable'), 'pose_tracking_unavailable', body.get('state') == 'visible'),
            ('framing', str(framing), 'candidate_out_of_frame', not framing),
            ('people', str(bool(movement.get('additionalPersonObserved'))), 'additional_person_detected', not movement.get('additionalPersonObserved')),
        ]
        # Missing optional models are availability information, not measured landmark loss.
        modules = observation.get('moduleStatus', {})
        observations = [item for item in observations
            if not (item[0] == 'hands' and modules.get('hands', 'ready') != 'ready')
            and not (item[0] in ('pose', 'people') and modules.get('pose', 'ready') != 'ready')]
        events = []
        for signal, value, event_type, recovered in observations:
            previous = signals.get(signal, {})
            pending = previous.get('pending') == value
            since = previous.get('since', now) if pending else now
            samples = previous.get('samples', 0)+1 if pending else 1
            entry = dict(previous, pending=value, since=since, samples=samples)
            if samples >= 2 and now-since >= self.debounce and previous.get('stable') != value:
                # Only publish recovery after an actual stable incident. Initial absence of
                # a deviation, unavailable directions, and invisible hands are not detections.
                publish = signal == 'face' or (signal in ('head','gaze') and value != 'unavailable') or signal == 'hands' or not recovered or previous.get('stable') is not None
                if signal == 'hands' and value == '|' and previous.get('stable') is None: publish = False
                if publish and now-previous.get('emitted_at', -1e9) >= self.cooldown:
                    recovery = recovered and previous.get('stable') is not None and signal != 'hands'
                    output_type = 'tracking_recovered' if recovery and signal in ('face','pose','framing','people') else event_type
                    events.append(dict(sessionId=session_id, eventId=str(uuid.uuid4()), eventType=output_type,
                        occurredAt=occurred_at, confidence=None, durationMs=round((now-since)*1000), severity='info',
                        details=dict(source='vision', signal=signal, trackingState=str(value)[:200], phase='recovered' if recovery else 'observed')))
                    entry['emitted_at'] = now
                    entry['stable'] = value
                elif not publish:
                    entry['stable'] = value
                # During cooldown retain the old published state so a stable transition
                # (especially recovery) is retried rather than silently lost.
            signals[signal] = entry
        return events, dict(at=now, signals=signals)
