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





if __name__ == '__main__': unittest.main()

