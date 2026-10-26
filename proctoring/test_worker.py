import base64
import tempfile
import shutil

import unittest

from unittest.mock import patch

from types import SimpleNamespace

from observations import gaze_observation, match_positions, hand_gesture

from pathlib import Path



import cv2

import numpy as np

from worker import Analyzer





class RealModelTests(unittest.TestCase):

    @classmethod

    def setUpClass(cls):

        cls.analyzer = Analyzer()



    @classmethod

    def tearDownClass(cls):

        cls.analyzer.close()



    def analyze(self, image, session='fixture'):

        _, encoded = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 65])

        return self.analyzer.analyze({'sessionId': session, 'image': base64.b64encode(encoded).decode()})



    def image(self, name):

        frame = cv2.imread(str(Path(__file__).parent / 'fixtures' / name))

        scale = min(1, 480 / max(frame.shape[:2]))

        return cv2.resize(frame, (int(frame.shape[1] * scale), int(frame.shape[0] * scale)))



    def test_blank_frame_has_no_detected_face_pose_or_hands(self):

        result = self.analyze(np.zeros((240, 320, 3), dtype=np.uint8), 'blank')

        self.assertIsNone(result['positionShift'])

        self.assertFalse(result['faceTrackingReliable'])

        self.assertEqual(result['faceCount'], 0)

        self.assertEqual(result['handCount'], 0)

        self.assertFalse(result['upperBodyVisible'])



    def test_portrait_and_two_faces_use_real_model_inference(self):

        frame = self.image('portrait.jpg')

        result = self.analyze(frame, 'portrait')

        self.assertEqual(result['faceCount'], 1)

        self.assertTrue(result['upperBodyVisible'])

        self.assertTrue(result['faceTrackingReliable'])

        self.assertEqual(len(result['faceTracks']), 1)

        self.assertTrue(all(0 <= value <= 1 for value in result['faceTracks'][0]['bounds']))

        repeat = self.analyze(frame, 'portrait')

        self.assertEqual(result['directionEstimate']['method'], 'landmark-geometric-estimate')

        self.assertFalse(result['directionEstimate']['calibrated'])

        self.assertTrue(repeat['directionEstimate']['headReliable'])

        self.assertIn(repeat['directionEstimate']['framing'], ['useful_area','too_far','outside_useful_area'])

        self.assertIsNotNone(repeat['directionEstimate']['smoothedPoseDegrees'])

        self.assertEqual(result['faceTracks'][0]['trackId'], repeat['faceTracks'][0]['trackId'])

        self.assertEqual(set(result['headPoseDegrees']), {'yaw', 'pitch', 'roll'})

        self.assertIsInstance(result['gazeReliable'], bool)

        self.assertAlmostEqual(result['positionShift'], 0.0, places=2)

        self.assertIn(result['headOrientation'], ['roughly_forward', 'turned', 'unavailable'])

        self.assertEqual(self.analyze(np.hstack([frame, frame]), 'two')['faceCount'], 2)



    def test_hands_and_repeat_frame_movement(self):

        frame = self.image('right_hands.jpg')

        observed = self.analyze(frame, 'hands')

        self.assertEqual(observed['handCount'], 2)

        self.assertEqual(len(observed['handObservations']), 2)

        self.assertTrue(all(h['gesture'] in {'open_fingers','curled_fingers','mixed_fingers','unavailable'} for h in observed['handObservations']))

        repeat = self.analyze(frame, 'hands')

        self.assertLess(repeat['handMovement'], 0.02)

    def test_hand_movement_does_not_depend_on_sample_rate(self):
        # The same physical shift scores alike when samples arrive 0.5 s or 2 s apart.
        frame = self.image('right_hands.jpg')
        shifted = np.roll(frame, 24, axis=1)
        scores = {}
        for label, gap in (('fast', .5), ('slow', 2.)):
            with patch('worker.time.monotonic', side_effect=[300., 300. + gap]):
                self.analyze(frame, 'rate-' + label)
                scores[label] = self.analyze(shifted, 'rate-' + label)['handMovement']
        self.assertIsNotNone(scores['fast']); self.assertIsNotNone(scores['slow'])
        self.assertLess(abs(scores['fast'] - scores['slow']), .5 * max(scores['fast'], scores['slow']))



    def test_invalid_samples_fail_without_an_observation(self):

        with self.assertRaises(ValueError):

            self.analyzer.analyze({'sessionId': 'invalid', 'image': base64.b64encode(b'not a JPEG').decode()})



    def test_translated_portrait_produces_body_motion_and_keeps_anonymous_track(self):

        frame = self.image('portrait.jpg')

        with patch('worker.time.monotonic', return_value=100):
            first = self.analyze(frame, 'translated-body')

        shifted = cv2.warpAffine(frame, np.float32([[1, 0, 30], [0, 1, 15]]), (frame.shape[1], frame.shape[0]))

        with patch('worker.time.monotonic', return_value=102):
            result = self.analyze(shifted, 'translated-body')

        self.assertGreater(result['upperBodyMovement'], .02)

        self.assertGreater(result['positionShift'], .02)

        self.assertEqual(result['faceTracks'][0]['trackId'], first['faceTracks'][0]['trackId'])



    def test_translated_hands_produce_observed_motion(self):

        frame = self.image('right_hands.jpg')

        with patch('worker.time.monotonic', return_value=100):
            self.analyze(frame, 'translated-hands')

        shifted = cv2.warpAffine(frame, np.float32([[1, 0, 12], [0, 1, 0]]), (frame.shape[1], frame.shape[0]))

        with patch('worker.time.monotonic', return_value=102):
            result = self.analyze(shifted, 'translated-hands')

        self.assertGreaterEqual(result['handCount'], 1)

        self.assertIsNotNone(result['handMovement'])

        self.assertGreater(result['handMovement'], .005)



    def test_interrupted_sampling_resets_movement_continuity(self):

        frame = self.image('portrait.jpg')

        with patch('worker.time.monotonic', side_effect=[100, 110]):

            self.analyze(frame, 'interrupted')

            result = self.analyze(frame, 'interrupted')

        self.assertIsNone(result['upperBodyMovement'])

        self.assertEqual(result['positionShift'], 0)



    def test_face_loss_recovery_and_landmark_quality_states(self):

        frame = self.image('portrait.jpg')

        blank = np.zeros((240, 320, 3), dtype=np.uint8)

        with patch('worker.time.monotonic', side_effect=[100, 102, 104, 112]):

            first = self.analyze(frame, 'recovery')

            lost = self.analyze(blank, 'recovery')

            recovered = self.analyze(frame, 'recovery')

            absent = self.analyze(blank, 'recovery')

        self.assertEqual(first['faceState'], 'FACE_PRESENT')

        self.assertEqual(lost['faceState'], 'TRACKING_LOST')

        self.assertEqual(recovered['faceState'], 'FACE_PRESENT')

        self.assertEqual(first['faceTracks'][0]['trackId'], recovered['faceTracks'][0]['trackId'])

        self.assertEqual(absent['faceState'], 'FACE_NOT_DETECTED')

        self.assertEqual(len(first['faceTracks'][0]['landmarks']), 14)

        self.assertIsNone(first['faceQuality']['detectorConfidence'])

        self.assertEqual(first['faceQuality']['method'], 'image-and-geometry-checks')

        self.assertEqual(self.analyze(np.hstack([frame, frame]), 'multiple-state')['faceState'], 'MULTIPLE_FACES')



    def test_missing_model_is_identified_before_allocating_models(self):

        with patch('worker.MODELS', Path(__file__).parent / 'does-not-exist'):

            with self.assertRaises(FileNotFoundError):

                Analyzer()



    def test_optional_model_failure_preserves_real_face_inference(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent, prefix='.test-model-') as directory:
            source = Path(__file__).parent / 'models' / 'face_landmarker.task'
            shutil.copyfile(source, Path(directory) / 'face_landmarker.task')
            with patch('worker.MODELS', Path(directory)):
                analyzer = Analyzer()
            try:
                _, encoded = cv2.imencode('.jpg', self.image('portrait.jpg'))
                for tick in (100, 103):
                    with patch('worker.time.monotonic', return_value=tick):
                        result = analyzer.analyze({'sessionId': 'face-only', 'image': base64.b64encode(encoded).decode()})
                self.assertEqual(result['faceCount'], 1)
                self.assertEqual(result['moduleStatus'], dict(face='ready', pose='unavailable', hands='unavailable', phone='unavailable'))
                self.assertNotIn('phoneObservation', result)
                self.assertFalse(any(e['details']['signal'] in ('hands', 'pose', 'people') for e in result['events']))
            finally:
                analyzer.close()

    def test_optional_models_can_be_disabled_without_loading_them(self):
        with patch.dict('os.environ', PROCTORING_POSE_ENABLED='false', PROCTORING_HANDS_ENABLED='false', PROCTORING_PHONE_ENABLED='false'), patch('worker.mp.tasks.vision.HandLandmarker.create_from_options') as hand, patch('worker.mp.tasks.vision.PoseLandmarker.create_from_options') as pose, patch('worker.mp.tasks.vision.ObjectDetector.create_from_options') as phone:
            analyzer = Analyzer()
            try:
                self.assertEqual(analyzer.module_status, dict(face='ready', pose='disabled', hands='disabled', phone='disabled'))
                hand.assert_not_called()
                pose.assert_not_called()
                phone.assert_not_called()
            finally:
                analyzer.close()

    def phone_status(self, name, frames=4):
        # Same encoding as the live browser sample (640 px, JPEG 85); a scan on every frame.
        frame = cv2.imread(str(Path(__file__).parent / 'fixtures' / name))
        scale = 640 / max(frame.shape[:2])
        _, encoded = cv2.imencode('.jpg', cv2.resize(frame, (int(frame.shape[1]*scale), int(frame.shape[0]*scale))), [cv2.IMWRITE_JPEG_QUALITY, 85])
        with patch.object(self.analyzer.phones, 'interval', 0):
            for _ in range(frames):
                result = self.analyzer.analyze({'sessionId': 'phone-' + name, 'image': base64.b64encode(encoded).decode()})
        return result['phoneObservation']

    def test_real_phones_are_detected_and_confirmed_over_scans(self):
        self.assertEqual(self.phone_status('phones/iphone-cc0.jpg', frames=1)['status'], 'candidate')  # one scan is never enough
        for name in ('phones/iphone-cc0.jpg', 'phones/call-parking-lot.jpg'):
            with self.subTest(name=name):
                phone = self.phone_status(name)
                self.assertEqual(phone['status'], 'seen'); self.assertTrue(phone['heldInHand'])
                self.assertGreaterEqual(phone['score'], .3); self.assertEqual(len(phone['box']), 4)

    def test_hands_holding_other_things_are_not_phones(self):
        for name in ('phones/no-phone-glasses.jpg', 'phones/no-phone-gestures.jpg', 'portrait.jpg', 'right_hands.jpg'):
            with self.subTest(name=name):
                self.assertEqual(self.phone_status(name)['status'], 'not_seen')

    def test_oversized_dimensions_are_rejected(self):

        with self.assertRaises((ValueError, cv2.error)):

            self.analyze(np.zeros((1600, 100, 3), dtype=np.uint8))





class MockModelLifecycleTests(unittest.TestCase):
    """Model factories/resources mocked. No detection or physical camera assertions."""
    def setUp(self):
        assets = patch('worker.Path.is_file', return_value=True)
        assets.start()
        self.addCleanup(assets.stop)

    def test_close_releases_model_context_and_session_cache_once(self):
        # Mock model allocation only: this test proves ownership/cleanup, not detection.
        with patch.dict('os.environ', PROCTORING_POSE_ENABLED='false', PROCTORING_HANDS_ENABLED='false'), patch('worker.mp.tasks.vision.FaceLandmarker.create_from_options') as factory:
            analyzer = Analyzer()
            analyzer.previous['ending-session'] = {'at': 100}
            analyzer.close()
            analyzer.close()
            factory.return_value.__enter__.assert_called_once()
            factory.return_value.__exit__.assert_called_once()
            self.assertEqual(analyzer.previous, {})

    def test_required_model_initialization_failure_closes_resource_stack(self):
        with patch('worker.ExitStack') as resources, patch('worker.mp.tasks.vision.FaceLandmarker.create_from_options', side_effect=RuntimeError('model initialization failed')):
            with self.assertRaises(RuntimeError):
                Analyzer()
            resources.return_value.close.assert_called_once()



class GeometryTests(unittest.TestCase):

    def eyes(self, ratio=.5):

        points = [SimpleNamespace(x=0., y=0.) for _ in range(478)]

        for left, right, iris, top, bottom, offset in [(33, 133, 468, 159, 145, .2), (362, 263, 473, 386, 374, .6)]:

            points[left] = SimpleNamespace(x=offset, y=.4)

            points[right] = SimpleNamespace(x=offset + .1, y=.4)

            points[iris] = SimpleNamespace(x=offset + .1 * ratio, y=.4)

            points[top] = SimpleNamespace(x=offset + .05, y=.39)

            points[bottom] = SimpleNamespace(x=offset + .05, y=.41)

        return points



    def test_two_open_eyes_centered_and_sideways(self):

        self.assertEqual(gaze_observation(self.eyes(), 'roughly_forward'), ('roughly_centered', True))

        self.assertEqual(gaze_observation(self.eyes(.1), 'roughly_forward'), ('possibly_sideways', True))



    def test_blinks_and_head_turns_are_not_reliable_gaze(self):

        points = self.eyes()

        points[159] = points[145]

        self.assertEqual(gaze_observation(points, 'roughly_forward'), ('unavailable', False))

        self.assertEqual(gaze_observation(self.eyes(), 'turned'), ('unavailable', False))



    def test_disagreeing_eyes_are_uncertain(self):

        points = self.eyes(.1)

        points[473].x = .69

        self.assertEqual(gaze_observation(points, 'roughly_forward'), ('unavailable', False))



    def test_detection_order_does_not_create_hand_motion(self):

        self.assertEqual(match_positions([[.9, .9], [.1, .1]], [[.1, .1], [.9, .9]]), {0: 1, 1: 0})

        self.assertEqual(match_positions([[.9, .9]], [[.1, .1]]), {})



    def test_supported_finger_poses(self):

        points = [SimpleNamespace(x=0., y=.1) for _ in range(21)]

        points[0] = SimpleNamespace(x=0., y=0.)

        for tip in (8, 12, 16, 20):

            points[tip].y = .2

        self.assertEqual(hand_gesture(points), 'open_fingers')

        for tip in (8, 12, 16, 20):

            points[tip].y = .05

        self.assertEqual(hand_gesture(points), 'curled_fingers')

        self.assertEqual(hand_gesture([]), 'unavailable')





if __name__ == '__main__':

    unittest.main()

