"""Head and eye movement on recorded frames with ground truth (fixtures/rendered-head).

The frames are rendered by scripts/blender/render_head_sequence.py from the project's rigged human
interviewer: a synthetic face, but real 3-D head rotation and eye rotation, with angles measured from the
posed geometry. They run through the real worker (OpenCV decode, MediaPipe) at the live cadence.
This is an automated test on recorded frames, not a live-camera test.
"""
import base64
import itertools
import json
import statistics
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2

import worker

FIXTURES = Path(__file__).parent / 'fixtures' / 'rendered-head'


def correlation(xs, ys):
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sx = sum((x - mx) ** 2 for x in xs) ** .5; sy = sum((y - my) ** 2 for y in ys) ** .5
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


class RenderedMotionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.labels = json.loads((FIXTURES / 'labels.json').read_text())['frames']
        cls.analyzer = worker.Analyzer()
        cls.images = {f['file']: base64.b64encode(cv2.imencode('.jpg', cv2.imread(str(FIXTURES / f['file'])), [cv2.IMWRITE_JPEG_QUALITY, 70])[1]).decode() for f in cls.labels}
        cls.results = cls.play([f['file'] for f in cls.labels], 'sequence')

    @classmethod
    def tearDownClass(cls):
        cls.analyzer.close()

    @classmethod
    def play(cls, files, session):
        """Frames 0.5 s apart, as sampled live."""
        clock = itertools.count(1000., .5)
        with patch('worker.time.monotonic', side_effect=lambda: next(clock)):
            return [cls.analyzer.analyze({'sessionId': session, 'image': cls.images[name]}) for name in files]

    def segment(self, name):
        return [(f, r) for f, r in zip(self.labels, self.results) if f['segment'] == name]

    def test_face_and_landmarks_found_in_every_frame(self):
        self.assertTrue(all(r['faceCount'] == 1 and r['headPoseDegrees'] for r in self.results))

    def test_head_yaw_follows_the_real_rotation(self):
        pairs = [(f['headYawDeg'], r['headPoseDegrees']['yaw']) for f, r in self.segment('head-yaw')]
        # Convention: estimated yaw > 0 when the face turns toward image right (truth < 0 in the labels).
        self.assertGreater(correlation([-t for t, _ in pairs], [e for _, e in pairs]), .99)
        self.assertLess(max(abs(e + t) for t, e in pairs), 4)

    def test_head_pitch_sign_and_trend(self):
        pairs = [(f['headPitchDeg'], r['headPoseDegrees']['pitch']) for f, r in self.segment('head-pitch')]
        rest = statistics.fmean(e for t, e in pairs if t == 0)
        self.assertGreater(correlation([t for t, _ in pairs], [e for _, e in pairs]), .95)
        for truth, estimate in pairs:
            if abs(truth) >= 20:  # looking down reads lower than rest, looking up higher (this caught a sign bug)
                self.assertEqual(estimate > rest, truth > 0, (truth, estimate, rest))

    def test_eye_movement_moves_the_gaze_estimate_while_the_head_stays_still(self):
        eyes = self.segment('eyes')
        self.assertTrue(all(abs(r['headPoseDegrees']['yaw']) < 2 for _, r in eyes))
        offsets = [(f['eyeYawRelativeToHeadDeg'], r['directionEstimate']['gazeOffset']['horizontal']) for f, r in eyes]
        first, second = offsets[:10], offsets[10:]
        # Eyes toward image right (truth < 0) push the smoothed iris offset positive; the other way, negative.
        self.assertGreater(max(o for _, o in first), .03)
        self.assertLess(min(o for _, o in second), -.02)
        # Small, real eye movements (about 11 degrees here) stay below the off-centre threshold by design.
        self.assertTrue(all(r['directionEstimate']['gazeDirections'] == [] for _, r in eyes[1:]))

    def test_gaze_is_withheld_when_the_head_is_turned_far(self):
        for f, r in self.segment('head-yaw'):
            if abs(f['headYawDeg']) >= 39:
                self.assertEqual(r['directionEstimate']['gazeDirections'], ['unavailable'])

    def test_brief_natural_turns_raise_no_direction(self):
        self.assertTrue(all(r['directionEstimate']['headDirections'] in ([], ['unavailable']) for r in self.results))

    def test_held_turns_get_the_right_direction(self):
        by_truth = lambda key, value: next(f['file'] for f in self.labels if f[key] == value)
        for frame, expected in ((by_truth('headYawDeg', -39.7), 'right'), (by_truth('headYawDeg', 39.7), 'left'),
                                (by_truth('headPitchDeg', -30.0), 'down'), (by_truth('headPitchDeg', 30.0), None)):
            with self.subTest(frame=frame, expected=expected):
                held = self.play([frame] * 12, f'hold-{frame}')[-1]['directionEstimate']
                if expected is None:
                    # Looking up 30 degrees reads ~22 degrees here: below the 25 degree threshold, so no label.
                    self.assertEqual(held['headDirections'], [])
                else:
                    self.assertEqual(held['headDirections'], [expected])


if __name__ == '__main__': unittest.main()
