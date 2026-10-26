import unittest

from unittest.mock import patch

from direction import DirectionEstimator

import test_worker





class DirectionTests(unittest.TestCase):

    def setUp(self):

        self.estimator = DirectionEstimator()

        self.points = test_worker.GeometryTests().eyes()

        self.box = [.2, .2, .7, .8]



    def sample(self, time, old=None, yaw=0, pitch=0, points=None, quality=True, box=None, track=1):

        return self.estimator.update(time, dict(yaw=yaw, pitch=pitch, roll=0),

            self.points if points is None else points, self.box if box is None else box, quality, old, track)



    def test_all_head_directions_and_minimum_samples(self):

        for yaw, pitch, expected in [(50,0,'right'),(-50,0,'left'),(0,45,'up'),(0,-45,'down')]:

            first, state = self.sample(10, yaw=yaw, pitch=pitch)

            self.assertFalse(first['headReliable'])

            result, _ = self.sample(12, state, yaw=yaw, pitch=pitch)

            self.assertEqual(result['headDirections'], [expected])

            self.assertFalse(result['gazeReliable'])



    def test_four_eye_directions_and_blink_recovery(self):

        for x, y, expected in [(.1,.4,'left'),(.9,.4,'right'),(.5,.391,'up'),(.5,.409,'down')]:

            points = test_worker.GeometryTests().eyes(x)

            points[468].y = points[473].y = y

            _, state = self.sample(10, points=points)

            result, state = self.sample(12, state, points=points)

            self.assertEqual(result['gazeDirections'], [expected])

            points[159] = points[145]

            blink, _ = self.sample(14, state, points=points)

            self.assertFalse(blink['gazeReliable'])



    def test_single_spike_smoothed_and_gap_resets(self):

        _, state = self.sample(10)

        _, state = self.sample(12, state)

        spike, state = self.sample(14, state, yaw=50)

        self.assertEqual(spike['headDirections'], [])

        self.assertLess(spike['smoothedPoseDegrees']['yaw'], 30)

        self.assertGreater(spike['headChangeDegrees'], 0)

        gap, _ = self.sample(23, state, yaw=50)

        self.assertFalse(gap['headReliable'])

        self.assertIsNone(gap['headChangeDegrees'])



    def test_bad_quality_track_change_and_framing(self):

        _, state = self.sample(10)

        bad, state = self.sample(12, state, quality=False)

        self.assertFalse(bad['headReliable'])

        bad, state = self.sample(14, state, quality=False)

        self.assertEqual(bad['unreliableForMs'], 4000)

        result, _ = self.sample(16, state, track=2)

        self.assertFalse(result['headReliable'])

        far, _ = self.sample(18, box=[.4,.4,.45,.45])

        self.assertEqual(far['framing'], 'too_far')

        edge, _ = self.sample(20, box=[0,.2,.5,.8])

        self.assertEqual(edge['framing'], 'outside_useful_area')

        self.assertFalse(edge['gazeReliable'])



    def test_head_threshold_boundary_and_gaze_threshold_boundary(self):
        # Synthetic landmark geometry: exact head threshold is allowed; crossing is reported.
        for yaw, expected in [(29.99, []), (30, []), (30.01, ['right'])]:
            with self.subTest(yaw=yaw):
                _, state = self.sample(10, yaw=yaw)
                result, _ = self.sample(12, state, yaw=yaw)
                self.assertEqual(result['headDirections'], expected)
        for ratio, expected in [(.749, []), (.751, ['right'])]:
            with self.subTest(iris_ratio=ratio):
                points = test_worker.GeometryTests().eyes(ratio)
                _, state = self.sample(10, points=points)
                result, _ = self.sample(12, state, points=points)
                self.assertTrue(result['gazeReliable'])
                self.assertEqual(result['gazeDirections'], expected)

    def test_config_validation_and_accommodation_threshold(self):

        with patch.dict('os.environ', {'PROCTORING_HEAD_YAW_DEG': '60'}):

            estimator = DirectionEstimator()

        _, state = estimator.update(10, dict(yaw=50,pitch=0,roll=0), self.points, self.box, True, track=1)

        result, _ = estimator.update(12, dict(yaw=50,pitch=0,roll=0), self.points, self.box, True, state, 1)

        self.assertEqual(result['headDirections'], [])

        with patch.dict('os.environ', {'PROCTORING_SMOOTHING_SECONDS': 'NaN'}):

            with self.assertRaises(ValueError): DirectionEstimator()





    # Scenario tests at the live cadence (~2 analysed samples per second).

    def closed(self, ratio=.5):
        points = test_worker.GeometryTests().eyes(ratio)
        points[159], points[386] = points[145], points[374]
        return points

    def play(self, frames, state=None):
        results = []
        for time, kwargs in frames:
            result, state = self.sample(time, state, **kwargs)
            results.append(result)
        return results, state

    def test_blink_holds_gaze_instead_of_resetting_it(self):
        side = test_worker.GeometryTests().eyes(.9)
        results, state = self.play([(0, dict(points=side)), (.5, dict(points=side))])
        self.assertEqual(results[-1]['gazeDirections'], ['right'])
        blink, state = self.sample(1.0, state, points=self.closed(.9))
        self.assertTrue(blink['eyesClosed']); self.assertTrue(blink['blinkHeld'])
        self.assertTrue(blink['gazeReliable']); self.assertEqual(blink['gazeDirections'], ['right'])
        reopened, state = self.sample(1.5, state, points=side)
        self.assertEqual(reopened['gazeDirections'], ['right']); self.assertFalse(reopened['blinkHeld'])
        # Eyes kept closed beyond the hold are not a gaze estimate any more.
        results, _ = self.play([(t, dict(points=self.closed(.9))) for t in (2.0, 2.5, 3.0)], state)
        self.assertTrue(results[0]['blinkHeld'])
        self.assertFalse(results[-1]['gazeReliable']); self.assertEqual(results[-1]['gazeDirections'], ['unavailable'])

    def test_blinking_while_centred_never_reports_a_direction(self):
        centre = test_worker.GeometryTests().eyes(.5)
        frames = [(i*.5, dict(points=self.closed() if i % 6 == 5 else centre)) for i in range(40)]
        results, _ = self.play(frames)
        self.assertTrue(all(r['gazeDirections'] in ([], ['unavailable']) for r in results))
        self.assertTrue(all(r['gazeReliable'] for r in results[1:]))

    def test_brief_glance_is_smoothed_away(self):
        centre, glance = (test_worker.GeometryTests().eyes(r) for r in (.5, .95))
        frames = [(i*.5, dict(points=glance if i in (12, 13) else centre)) for i in range(24)]
        results, _ = self.play(frames)
        self.assertTrue(all(r['gazeDirections'] == [] for r in results[1:]))

    def test_sustained_gaze_deviation_is_reported_after_several_frames(self):
        centre, side = (test_worker.GeometryTests().eyes(r) for r in (.5, .9))
        frames = [(i*.5, dict(points=side if i >= 10 else centre)) for i in range(30)]
        results, _ = self.play(frames)
        flagged = [i for i, r in enumerate(results) if r['gazeDirections'] == ['right']]
        self.assertTrue(flagged)
        self.assertGreaterEqual(flagged[0], 14)  # not on the first deviating frames
        self.assertEqual(flagged, list(range(flagged[0], 30)))

    def test_repeated_head_turns_are_counted_but_quick_glances_are_not(self):
        # Quick glances: one sample turned, then forward again.
        frames = [(i*.5, dict(yaw=45 if i % 6 == 3 else 0)) for i in range(48)]
        results, _ = self.play(frames)
        self.assertEqual(results[-1]['recentHeadTurns'], 0); self.assertFalse(results[-1]['repeatedHeadTurns'])
        # Held turns: 1.5 s turned, 3 s forward, four times.
        frames = [(i*.5, dict(yaw=(-45 if (i//9) % 2 else 45) if i % 9 < 3 else 0)) for i in range(36)]
        results, state = self.play(frames)
        self.assertEqual(results[-1]['recentHeadTurns'], 4); self.assertTrue(results[-1]['repeatedHeadTurns'])
        self.assertEqual(max(r['recentHeadTurns'] for r in results[:27]), 3)
        self.assertFalse(any(r['repeatedHeadTurns'] for r in results[:27]))
        # One long turn counts once; turns leave the window after it elapses.
        later, _ = self.play([(t, dict(yaw=0)) for t in (60, 61, 80)], state)
        self.assertLess(later[-1]['recentHeadTurns'], 4); self.assertFalse(later[-1]['repeatedHeadTurns'])

    def test_one_long_turn_counts_once(self):
        results, _ = self.play([(i*.5, dict(yaw=45)) for i in range(30)])
        self.assertEqual(results[-1]['recentHeadTurns'], 1)

    def test_turn_and_blink_settings_are_configurable(self):
        with patch.dict('os.environ', {'PROCTORING_REPEATED_HEAD_TURNS': '2', 'PROCTORING_BLINK_HOLD_SECONDS': '0'}):
            self.estimator = DirectionEstimator()
        frames = [(i*.5, dict(yaw=45 if i % 9 < 3 else 0)) for i in range(18)]
        results, _ = self.play(frames)
        self.assertTrue(results[-1]['repeatedHeadTurns'])
        side = test_worker.GeometryTests().eyes(.9)
        _, state = self.play([(100, dict(points=side)), (100.5, dict(points=side))])
        blink, _ = self.sample(101, state, points=self.closed(.9))
        self.assertFalse(blink['blinkHeld']); self.assertFalse(blink['gazeReliable'])
        with patch.dict('os.environ', {'PROCTORING_HEAD_TURN_MIN_SECONDS': '0'}):
            with self.assertRaises(ValueError): DirectionEstimator()


if __name__ == '__main__': unittest.main()

