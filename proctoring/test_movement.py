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


if __name__ == '__main__': unittest.main()
