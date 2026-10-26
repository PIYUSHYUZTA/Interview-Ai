"""Sampled anonymous movement observations; no gesture intent or identity inference."""
import math
from direction import setting
from observations import hand_gesture, match_positions


def xy(point):
    return [point.x, point.y]


def finite(points):
    return all(math.isfinite(p.x) and math.isfinite(p.y) for p in points)


def box_distance(points, box):
    """Shortest distance from any point to the box (0 inside), in box widths."""
    width = box[2]-box[0]
    return min(math.hypot(max(box[0]-x, 0, x-box[2]), max(box[1]-y, 0, y-box[3])) for x, y in points) / width


def smooth(points, prior, alpha):
    return [[a + alpha*(b-a) for a, b in zip(old, new)] for old, new in zip(prior, points)]


class MovementEstimator:
    def __init__(self):
        self.tau = setting('MOVEMENT_SMOOTHING_SECONDS', 2, .2, 10)
        self.gap = setting('MOVEMENT_GAP_SECONDS', 6, 3, 15)
        self.threshold = setting('MOVEMENT_THRESHOLD', .025, .005, .2)
        self.window = setting('MOVEMENT_WINDOW_SECONDS', 30, 10, 120)
        self.sustain = setting('MOVEMENT_SUSTAIN_SECONDS', 15, 5, 120)
        self.reference = setting('MOVEMENT_REFERENCE_SECONDS', 2, .5, 5)
        self.face_distance = setting('HAND_FACE_DISTANCE', .3, 0, 1.5)
        self.face_gap = setting('HAND_FACE_GAP_SECONDS', 1.5, 0, 5)
        self.pattern_min = setting('HAND_PATTERN_MIN_SECONDS', 1, .3, 5)
        self.pattern_window = setting('HAND_PATTERN_WINDOW_SECONDS', 120, 30, 600)
        self.pattern_repeats = setting('REPEATED_HAND_PATTERN', 4, 2, 20)
        self.edge = setting('HAND_EDGE_MARGIN', .06, .01, .2)

    @staticmethod
    def head_region(face_box, poses):
        """The face box when the face landmarker found one; otherwise a head box from the pose model
        (nose and ears, sized by the shoulders), which still works when a hand covers the face."""
        if face_box and min(face_box[2]-face_box[0], face_box[3]-face_box[1]) > .01:
            return face_box, 'face'
        if len(poses) != 1 or poses[0][0].visibility < .5:
            return None, None
        p = poses[0]
        ears = math.dist(xy(p[7]), xy(p[8])) if min(p[7].visibility, p[8].visibility) >= .5 else 0
        width = max(ears*1.3, math.dist(xy(p[11]), xy(p[12]))*.45, .04)
        return [p[0].x-width/2, p[0].y-width*.65, p[0].x+width/2, p[0].y+width*.65], 'pose'

    def patterns(self, now, near, near_source, exits, old, continuous):
        """Hand-to-face approaches (each held >= pattern_min) and reaches out of the side of the
        frame (gone >= pattern_min), counted in a window. Talking with the hands, a single touch of
        the face or resting hands below the frame are ordinary and not counted."""
        prior = old.get('patterns', {})
        if not continuous:  # a sampling gap ends the current streak but keeps the window's counts
            prior = dict(prior, near_since=None, near_last=None, near_counted=False)
        keep = lambda key: [t for t in prior.get(key, []) if now-t <= self.pattern_window]
        approaches, reaches = keep('approaches'), keep('reaches') + [t for t in exits if now-t <= self.pattern_window]
        since, last, counted = prior.get('near_since'), prior.get('near_last'), prior.get('near_counted', False)
        if near:
            if since is None or last is None or now-last > self.face_gap:
                since, counted = now, False
            last = now
        elif last is None or now-last > self.face_gap:
            since = last = None; counted = False
        if since is not None and not counted and (last-since) >= self.pattern_min:
            approaches.append(since); counted = True
        repeated = [name for name, times in (('hand_to_face', approaches), ('side_reach', reaches)) if len(times) >= self.pattern_repeats]
        report = dict(handNearFace=bool(near), handNearFaceSource=near_source if near else None,
            handNearFaceMs=round((now-since)*1000) if since is not None else 0,
            handPatterns=dict(windowSeconds=round(self.pattern_window), handToFaceEpisodes=len(approaches), sideReaches=len(reaches),
                repeated=bool(repeated), patterns=repeated))
        return report, dict(approaches=approaches[-40:], reaches=reaches[-40:], near_since=since, near_last=last, near_counted=counted)

    def per_reference(self, displacement, elapsed):
        """Movement thresholds are calibrated to ~2 s between samples. Faster sampling scales the
        displacement up to that window (never amplifying slower samples), so the same physical motion
        scores the same at any sample rate."""
        return displacement * self.reference / elapsed if 0 < elapsed < self.reference else displacement

    def pattern(self, now, movement, prior, continuous):
        prior = prior if continuous else {}
        moving = movement is not None and movement >= self.threshold
        episodes = [t for t in prior.get('episodes', []) if now-t <= self.window]
        if moving and not prior.get('moving', False): episodes.append(now)
        since = prior.get('since', now) if moving else None
        if since is None and moving: since = now
        duration = now-since if since is not None else 0
        return dict(moving=moving, since=since, episodes=episodes[-60:]), dict(
            sustainedMovementMs=round(duration*1000), movementEpisodes=len(episodes),
            repeatedMovement=len(episodes) >= 3, sustainedMovement=moving and duration >= self.sustain)

    def update(self, now, hands, handedness, poses, face_box, old=None):
        old = old or {}
        continuous = 0 < now-old.get('at', now) <= self.gap
        alpha = 1-math.exp(-(now-old['at'])/self.tau) if continuous else 1
        previous = old.get('hands', []) if continuous else []
        usable_poses = [p for p in poses if len(p) >= 25 and finite(p) and min(p[11].visibility, p[12].visibility) >= .65]
        head, head_source = self.head_region(face_box, usable_poses)
        visible, rejected = [], 0
        for i, points in enumerate(hands):
            if len(points) != 21 or not finite(points) or not all(-.1 <= p.x <= 1.1 and -.1 <= p.y <= 1.1 for p in points):
                rejected += 1
                continue
            span = math.hypot(max(p.x for p in points)-min(p.x for p in points), max(p.y for p in points)-min(p.y for p in points))
            if not .025 <= span <= 1.4 or math.dist(xy(points[0]), xy(points[9])) < .008:
                rejected += 1
                continue
            categories = handedness[i] if i < len(handedness) else []
            score = float(categories[0].score) if categories else None
            if score is not None and (not math.isfinite(score) or not 0 <= score <= 1): score = None
            label = (categories[0].category_name or '').lower() if categories and score is not None and score >= .75 else 'unknown'
            if label not in ('left', 'right'): label = 'unknown'
            visible.append(dict(points=points, position=xy(points[0]), handedness=label, handednessScore=score))
        matches = match_positions([h['position'] for h in visible], [h['raw'] for h in previous], maximum=.25)
        next_id = old.get('next_id', 1)
        tracks, saved, matched_ids = [], [], set()
        for i, hand in enumerate(visible):
            prior = previous[matches[i]] if i in matches else None
            if prior and (now-prior['last_seen'] > self.gap or (hand['handedness'] != 'unknown' and prior['handedness'] != 'unknown' and hand['handedness'] != prior['handedness'])):
                prior = None
            points = [xy(p) for p in hand['points']]
            was_visible = prior is not None and prior['last_seen'] == old.get('at')
            filtered = smooth(points, prior['landmarks'], alpha) if was_visible else points
            movement = self.per_reference(math.dist(filtered[0], prior['landmarks'][0]), now-old['at']) if was_visible else None
            pattern, report = self.pattern(now, movement, prior.get('pattern', {}) if prior else {}, was_visible)
            track_id = prior['id'] if prior else next_id
            if prior is None: next_id += 1
            matched_ids.add(track_id)
            partial = not all(0 <= p.x <= 1 and 0 <= p.y <= 1 for p in hand['points'])
            relative = None
            if face_box:
                center = [(face_box[0]+face_box[2])/2, (face_box[1]+face_box[3])/2]
                width, height = face_box[2]-face_box[0], face_box[3]-face_box[1]
                if min(width, height) > .01:
                    relative = [(filtered[0][0]-center[0])/width, (filtered[0][1]-center[1])/height]
            distance = box_distance(filtered, head) if head else None
            tracks.append(dict(trackId=track_id, nearFace=distance is not None and distance <= self.face_distance,
                faceDistance=round(distance, 3) if distance is not None else None, handedness=hand['handedness'], handednessScore=hand['handednessScore'],
                state='partial' if partial else 'visible', transition='entered' if prior is None else 'recovered' if not was_visible else 'continued',
                reliable=was_visible and not partial, landmarkConfidence=None, position=[round(x,4) for x in filtered[0]],
                landmarks=[[round(x,4) for x in p] for p in filtered], movement=round(movement,4) if movement is not None else None,
                relativeToFace=[round(x,3) for x in relative] if relative else None, gesture=hand_gesture(hand['points']), **report))
            saved.append(dict(id=track_id, raw=hand['position'], landmarks=filtered, handedness=hand['handedness'], last_seen=now, pattern=pattern))
        lost, exits = [], []
        for prior in previous:
            if prior['id'] not in matched_ids:
                age = now-prior['last_seen']
                # A hand that vanished at the left/right edge and stays gone counts as one reach out of view.
                if prior['last_seen'] == old.get('at') and not (self.edge <= prior['raw'][0] <= 1-self.edge):
                    prior['side_exit'] = prior['last_seen']
                if prior.get('side_exit') is not None and not prior.get('exit_counted') and age >= self.pattern_min:
                    exits.append(prior['side_exit']); prior['exit_counted'] = True
                lost.append(dict(trackId=prior['id'], handedness=prior['handedness'], state='tracking_lost' if age <= self.gap else 'not_visible', missingForMs=round(age*1000)))
                if age <= self.gap: saved.append(prior)
        # Bound ghosts when new tracks enter during temporary loss.
        saved = sorted(saved, key=lambda h: h['last_seen'], reverse=True)[:4]
        body_prior = old.get('body', {}) if continuous else {}
        body = dict(state='ambiguous' if len(usable_poses)>1 else 'tracking_lost' if body_prior.get('center') else 'unavailable', reliable=False,
            center=None, landmarks=[], movement=None, positionShift=None, shoulderTiltDegrees=None, outsideUsefulArea=False,
            visibility=None, unreliableForMs=0, sustainedMovementMs=0, movementEpisodes=0, repeatedMovement=False, sustainedMovement=False)
        state = {}
        if len(usable_poses) == 1:
            p = usable_poses[0]
            center = [(p[11].x+p[12].x)/2, (p[11].y+p[12].y)/2]
            connected = body_prior.get('center') is not None and body_prior.get('last_seen') == old.get('at')
            filtered = smooth([center], [body_prior['center']], alpha)[0] if connected else center
            motion = self.per_reference(math.dist(filtered, body_prior['center']), now-old['at']) if connected else None
            anchor = body_prior.get('anchor', filtered) if connected else filtered
            pattern, report = self.pattern(now, motion, body_prior.get('pattern', {}), connected)
            outside = any(not .03 <= v <= .97 for index in [11,12] for v in xy(p[index]))
            visible_points = [dict(index=i, position=[round(v,4) for v in xy(p[i])], visibility=round(p[i].visibility,3)) for i in [0,11,12,13,14,15,16,23,24] if p[i].visibility >= .65]
            body.update(state='outside_useful_area' if outside else 'visible', reliable=connected and not outside, center=[round(v,4) for v in filtered],
                landmarks=visible_points, movement=round(motion,4) if motion is not None else None,
                positionShift=round(math.dist(filtered,anchor),4), shoulderTiltDegrees=round(math.degrees(math.atan2(p[12].y-p[11].y, abs(p[12].x-p[11].x))),1),
                outsideUsefulArea=outside, visibility=round(min(p[11].visibility,p[12].visibility),3), **report)
            state = dict(center=filtered,anchor=anchor,last_seen=now,pattern=pattern)
        else:
            since = body_prior.get('unreliable_since', now)
            body['unreliableForMs'] = round((now-since)*1000)
            last_seen = body_prior.get('last_seen')
            if last_seen is not None and now-last_seen <= self.gap:
                state = dict(center=body_prior.get('center'), last_seen=last_seen, unreliable_since=since)
            else:
                body['state'] = 'ambiguous' if len(usable_poses)>1 else 'unavailable'
                state = dict(unreliable_since=since)
        near = any(t['nearFace'] for t in tracks)
        near_source = 'hand-landmarks' if near else None
        if not near and head and len(usable_poses) == 1:
            # The hand model often misses a hand pressed against the face; the pose wrists/index still show it.
            wrists = [xy(usable_poses[0][i]) for i in (15, 16, 19, 20) if usable_poses[0][i].visibility >= .5]
            if wrists and box_distance(wrists, head) <= self.face_distance:
                near, near_source = True, 'pose-wrist'
        pattern_report, pattern_state = self.patterns(now, near, near_source, exits, old, continuous)
        result = dict(handTracks=tracks, lostHands=lost[:4], rejectedHands=rejected, body=body, headRegionSource=head_source, **pattern_report,
            visiblePoseCount=len(usable_poses), additionalPersonObserved=len(usable_poses)>1,
            coordinateSystem='unmirrored-camera', method='sampled-landmark-movement', interpretation='neutral-observation')
        return result, dict(at=now,hands=saved,next_id=next_id,body=state,patterns=pattern_state)
