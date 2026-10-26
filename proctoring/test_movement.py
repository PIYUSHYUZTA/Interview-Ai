import math
import unittest
from types import SimpleNamespace as Point
from movement import MovementEstimator


def hand(x=.3, y=.4):
    return [Point(x=x+(i%4)*.015, y=y+(i//4)*.012) for i in range(21)]


def side(name):
    return [Point(category_name=name,score=.95)]


def pose(x=.5, visibility=.95):
    result = [Point(x=x,y=.4,visibility=visibility) for _ in range(33)]
    result[11].x, result[12].x = x-.1,x+.1
    return result


class MovementTests(unittest.TestCase):
    def setUp(self): self.model = MovementEstimator()

    def sample(self, now, old=None, hands=None, sides=None, poses=None):
        return self.model.update(now,hands or [],sides or [],poses or [],[.3,.2,.7,.6],old)

    def test_ids_survive_detection_order_changes_and_smoothing(self):
        first, state = self.sample(10,hands=[hand(.2),hand(.7)],sides=[side('Left'),side('Right')])
        second, _ = self.sample(12,state,hands=[hand(.72),hand(.22)],sides=[side('Right'),side('Left')])
        self.assertEqual([t['trackId'] for t in second['handTracks']], [2,1])
        self.assertTrue(all(t['reliable'] for t in second['handTracks']))
        self.assertEqual(second['handTracks'][0]['handedness'],'right')
        self.assertGreater(second['handTracks'][0]['movement'],0)
        self.assertLess(second['handTracks'][0]['movement'],.02)
        self.assertEqual(len(second['handTracks'][0]['landmarks']),21)
        self.assertIsNone(second['handTracks'][0]['landmarkConfidence'])
        self.assertEqual(first['handTracks'][0]['transition'],'entered')

    def test_missing_recovery_and_expiry_without_stale_movement(self):
        _, state = self.sample(10,hands=[hand()],sides=[side('Left')])
        missing, state = self.sample(12,state)
        self.assertEqual(missing['lostHands'][0]['state'],'tracking_lost')
        recovered, state = self.sample(14,state,hands=[hand()],sides=[side('Left')])
        self.assertEqual(recovered['handTracks'][0]['transition'],'recovered')
        self.assertEqual(recovered['handTracks'][0]['trackId'],1)
        self.assertIsNone(recovered['handTracks'][0]['movement'])
        for t in [16,18,20,22]: expired, state = self.sample(t,state)
        self.assertEqual(expired['lostHands'][0]['state'],'not_visible')
        returned, _ = self.sample(24,state,hands=[hand()],sides=[side('Left')])
        self.assertEqual(returned['handTracks'][0]['trackId'],2)

    def test_relative_face_position_partial_and_invalid_geometry(self):
        result, _ = self.sample(10,hands=[hand(.5,.4)])
        self.assertEqual(result['handTracks'][0]['relativeToFace'],[0,0])
        self.assertEqual(result['handTracks'][0]['handedness'],'unknown')
        partial, _ = self.sample(12,hands=[hand(.98)])
        self.assertEqual(partial['handTracks'][0]['state'],'partial')
        invalid = hand(); invalid[3].x = math.nan
        bad, _ = self.sample(14,hands=[invalid])
        self.assertEqual(bad['rejectedHands'],1)
        self.assertEqual(bad['handTracks'],[])
        collapsed = [Point(x=.4,y=.4) for _ in range(21)]
        bad, _ = self.sample(16,hands=[collapsed])
        self.assertEqual(bad['rejectedHands'],1)

    def test_pose_confidence_missing_and_additional_people(self):
        _, state = self.sample(10,poses=[pose()])
        visible, state = self.sample(12,state,poses=[pose(.6)])
        self.assertTrue(visible['body']['reliable'])
        self.assertGreater(visible['body']['movement'],0)
        self.assertLess(visible['body']['movement'],.1)
        self.assertEqual(len(visible['body']['landmarks']),9)
        lost, state = self.sample(14,state,poses=[pose(visibility=.1)])
        self.assertFalse(lost['body']['reliable'])
        self.assertEqual(lost['body']['state'],'tracking_lost')
        lost, state = self.sample(16,state)
        self.assertEqual(lost['body']['unreliableForMs'],2000)
        recovered, _ = self.sample(18,state,poses=[pose()])
        self.assertIsNone(recovered['body']['movement'])
        multiple, _ = self.sample(20,poses=[pose(.2),pose(.8)])
        self.assertTrue(multiple['additionalPersonObserved'])
        self.assertEqual(multiple['body']['state'],'ambiguous')
        self.assertFalse(multiple['body']['reliable'])
        outside, _ = self.sample(22,poses=[pose(.04)])
        self.assertTrue(outside['body']['outsideUsefulArea'])

    def test_repeated_and_sustained_movement_patterns_are_neutral(self):
        state = {}
        for now,movement in [(10,.05),(12,0),(14,.05),(16,0),(18,.05)]:
            state, report = self.model.pattern(now,movement,state,True)
        self.assertTrue(report['repeatedMovement'])
        self.assertFalse(report['sustainedMovement'])
        for now in range(20,36,2): state, report = self.model.pattern(now,.05,state,True)
        self.assertTrue(report['sustainedMovement'])
        _, reset = self.model.pattern(50,.1,state,False)
        self.assertFalse(reset['repeatedMovement'])
        self.assertEqual(reset['sustainedMovementMs'],0)

    def test_sampling_gap_resets_tracks_and_pose_motion(self):
        _, state = self.sample(10,hands=[hand()],poses=[pose()])
        result, _ = self.sample(20,state,hands=[hand()],poses=[pose(.6)])
        self.assertFalse(result['handTracks'][0]['reliable'])
        self.assertIsNone(result['body']['movement'])


class HandPatternTests(unittest.TestCase):
    """Scenarios at the live cadence (~2 samples/s). Face box [.3,.2,.7,.6]; hand() spans ~.045 x .06."""
    NEAR, AWAY = (.45, .3), (.05, .85)

    def setUp(self): self.model = MovementEstimator()

    def play(self, frames, state=None, face=(.3,.2,.7,.6)):
        results = []
        for now, hands, poses in frames:
            result, state = self.model.update(now, hands, [side('Right')]*len(hands), poses, list(face) if face else None, state)
            results.append(result)
        return results, state

    def at(self, place):
        return [hand(*place)]

    def test_near_face_versus_away(self):
        results, _ = self.play([(0, self.at(self.NEAR), []), (.5, self.at(self.AWAY), [])])
        self.assertTrue(results[0]['handNearFace']); self.assertEqual(results[0]['handTracks'][0]['faceDistance'], 0)
        self.assertEqual(results[0]['handNearFaceSource'], 'hand-landmarks'); self.assertEqual(results[0]['headRegionSource'], 'face')
        self.assertFalse(results[1]['handNearFace']); self.assertGreater(results[1]['handTracks'][0]['faceDistance'], .3)

    def test_brief_touch_is_not_an_episode(self):
        frames = [(i*.5, self.at(self.NEAR if i == 6 else self.AWAY), []) for i in range(20)]
        results, _ = self.play(frames)
        self.assertTrue(results[6]['handNearFace'])
        self.assertEqual(results[-1]['handPatterns']['handToFaceEpisodes'], 0)
        self.assertEqual(results[-1]['handNearFaceMs'], 0)

    def test_sustained_near_face_survives_missed_detections(self):
        # 20 s with the hand at the face; the hand model misses it on every fifth sample.
        frames = [(i*.5, [] if i % 5 == 4 else self.at(self.NEAR), []) for i in range(41)]
        results, _ = self.play(frames)
        self.assertGreaterEqual(results[-1]['handNearFaceMs'], 19500)
        self.assertEqual(results[-1]['handPatterns']['handToFaceEpisodes'], 1)
        # A longer absence ends the streak.
        later, _ = self.play([(t, self.at(self.AWAY), []) for t in (21, 21.5, 22, 22.5)], _)
        self.assertEqual(later[-1]['handNearFaceMs'], 0)

    def test_repeated_hand_to_face_is_a_pattern_but_three_times_is_not(self):
        cycle = lambda n: [(i*.5, self.at(self.NEAR if i % 9 < 3 else self.AWAY), []) for i in range(9*n)]
        three, _ = self.play(cycle(3))
        self.assertEqual(three[-1]['handPatterns']['handToFaceEpisodes'], 3); self.assertFalse(three[-1]['handPatterns']['repeated'])
        self.model = MovementEstimator()
        four, _ = self.play(cycle(4))
        self.assertEqual(four[-1]['handPatterns']['patterns'], ['hand_to_face'])

    def test_ordinary_gesturing_is_not_an_unusual_pattern(self):
        # A minute of large hand movement while talking, below the face.
        frames = [(i*.5, [hand(.15+.12*((i//2) % 3), .75)], []) for i in range(120)]  # move, pause, move ...
        results, _ = self.play(frames)
        self.assertTrue(any(t['repeatedMovement'] for r in results for t in r['handTracks']))  # moving a lot...
        self.assertFalse(any(r['handPatterns']['repeated'] or r['handNearFace'] for r in results))  # ...is not unusual

    def test_side_reaches_counted_but_resting_hands_below_frame_are_not(self):
        def reaches(place, n):
            frames, t = [], 0.
            for _ in range(n):
                frames += [(t, self.at(place), []), (t+.5, self.at(place), []), (t+1, [], []), (t+1.5, [], []), (t+2, [], [])]
                t += 3
            return self.play(frames)[0][-1]['handPatterns']
        self.assertEqual(reaches((.96, .5), 4)['patterns'], ['side_reach'])
        self.model = MovementEstimator()
        bottom = reaches((.5, .95), 4)
        self.assertEqual(bottom['sideReaches'], 0); self.assertFalse(bottom['repeated'])
        self.model = MovementEstimator()
        flicker = self.play([(i*.5, [] if i % 4 == 3 else self.at((.96, .5)), []) for i in range(40)])[0][-1]['handPatterns']
        self.assertEqual(flicker['sideReaches'], 0)  # single missed detections are not reaches

    def test_pose_wrist_and_pose_head_cover_a_hand_hiding_the_face(self):
        body = pose()
        body[0].x, body[0].y = .5, .3
        body[7].x, body[8].x = .44, .56; body[7].y = body[8].y = .3
        body[15].x, body[15].y = .52, .34
        for i in (16, 19, 20): body[i].visibility = .1
        results, _ = self.play([(0, [], [body])], face=None)
        self.assertEqual(results[0]['headRegionSource'], 'pose')
        self.assertTrue(results[0]['handNearFace']); self.assertEqual(results[0]['handNearFaceSource'], 'pose-wrist')
        body[15].y = .8
        results, _ = self.play([(1, [], [body])], face=None)
        self.assertFalse(results[0]['handNearFace'])

    def test_pattern_settings_are_configurable(self):
        from unittest.mock import patch
        with patch.dict('os.environ', {'PROCTORING_REPEATED_HAND_PATTERN': '2', 'PROCTORING_HAND_FACE_DISTANCE': '0'}):
            self.model = MovementEstimator()
        results, _ = self.play([(i*.5, self.at(self.NEAR if i % 9 < 3 else self.AWAY), []) for i in range(18)])
        self.assertTrue(results[-1]['handPatterns']['repeated'])
        with patch.dict('os.environ', {'PROCTORING_HAND_PATTERN_WINDOW_SECONDS': '5'}):
            with self.assertRaises(ValueError): MovementEstimator()


if __name__ == '__main__': unittest.main()
