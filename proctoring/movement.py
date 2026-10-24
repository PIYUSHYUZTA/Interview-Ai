"""Sampled anonymous movement observations; no gesture intent or identity inference."""
import math
from direction import setting
from observations import hand_gesture, match_positions


def xy(point):
    return [point.x, point.y]


def finite(points):
    return all(math.isfinite(p.x) and math.isfinite(p.y) for p in points)


def smooth(points, prior, alpha):
    return [[a + alpha*(b-a) for a, b in zip(old, new)] for old, new in zip(prior, points)]


class MovementEstimator:
    def __init__(self):
        self.tau = setting('MOVEMENT_SMOOTHING_SECONDS', 2, .2, 10)
        self.gap = setting('MOVEMENT_GAP_SECONDS', 6, 3, 15)
        self.threshold = setting('MOVEMENT_THRESHOLD', .025, .005, .2)
        self.window = setting('MOVEMENT_WINDOW_SECONDS', 30, 10, 120)
        self.sustain = setting('MOVEMENT_SUSTAIN_SECONDS', 15, 5, 120)

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
            movement = math.dist(filtered[0], prior['landmarks'][0]) if was_visible else None
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
            tracks.append(dict(trackId=track_id, handedness=hand['handedness'], handednessScore=hand['handednessScore'],
                state='partial' if partial else 'visible', transition='entered' if prior is None else 'recovered' if not was_visible else 'continued',
                reliable=was_visible and not partial, landmarkConfidence=None, position=[round(x,4) for x in filtered[0]],
                landmarks=[[round(x,4) for x in p] for p in filtered], movement=round(movement,4) if movement is not None else None,
                relativeToFace=[round(x,3) for x in relative] if relative else None, gesture=hand_gesture(hand['points']), **report))
            saved.append(dict(id=track_id, raw=hand['position'], landmarks=filtered, handedness=hand['handedness'], last_seen=now, pattern=pattern))
        lost = []
        for prior in previous:
            if prior['id'] not in matched_ids:
                age = now-prior['last_seen']
                lost.append(dict(trackId=prior['id'], handedness=prior['handedness'], state='tracking_lost' if age <= self.gap else 'not_visible', missingForMs=round(age*1000)))
                if age <= self.gap: saved.append(prior)
        # Bound ghosts when new tracks enter during temporary loss.
        saved = sorted(saved, key=lambda h: h['last_seen'], reverse=True)[:4]
        usable_poses = [p for p in poses if len(p) >= 25 and finite(p) and min(p[11].visibility, p[12].visibility) >= .65]
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
            motion = math.dist(filtered, body_prior['center']) if connected else None
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
        result = dict(handTracks=tracks, lostHands=lost[:4], rejectedHands=rejected, body=body,
            visiblePoseCount=len(usable_poses), additionalPersonObserved=len(usable_poses)>1,
            coordinateSystem='unmirrored-camera', method='sampled-landmark-movement', interpretation='neutral-observation')
        return result, dict(at=now,hands=saved,next_id=next_id,body=state)
