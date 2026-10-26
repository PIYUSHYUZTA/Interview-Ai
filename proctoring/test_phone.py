import unittest
from unittest.mock import patch

from phone import PhoneEstimator, overlaps


class PhoneLogicTests(unittest.TestCase):
    BOX = [.4, .4, .5, .6]

    def setUp(self): self.model = PhoneEstimator()

    def play(self, scans, state=None, hands=()):
        results = []
        for now, detections in scans:
            result, state = self.model.update(now, detections, list(hands), state)
            results.append(result)
        return results, state

    def test_confirmed_only_after_several_scans(self):
        results, _ = self.play([(t, [(.5, self.BOX)]) for t in (0, 1, 2)])
        self.assertEqual([r['status'] for r in results], ['candidate', 'candidate', 'seen'])
        self.assertEqual(results[-1]['box'], self.BOX); self.assertEqual(results[-1]['score'], .5)

    def test_low_scores_and_single_flickers_never_confirm(self):
        results, _ = self.play([(t, [(.25, self.BOX)]) for t in range(6)])
        self.assertTrue(all(r['status'] == 'not_seen' for r in results))
        results, _ = self.play([(t, [(.6, self.BOX)] if t % 3 == 0 else []) for t in range(9)])
        self.assertFalse(any(r['status'] == 'seen' for r in results))

    def test_one_missed_scan_inside_a_streak_is_tolerated_and_duration_counts(self):
        results, _ = self.play([(t, [] if t == 2 else [(.5, self.BOX)]) for t in range(6)])
        self.assertEqual([r['status'] for r in results][3:], ['seen', 'seen', 'seen'])
        self.assertEqual(results[-1]['seenForMs'], 2000)

    def test_phone_gone_ends_it_and_a_gap_resets(self):
        results, state = self.play([(t, [(.5, self.BOX)]) for t in range(4)] + [(t, []) for t in (4, 5)])
        self.assertEqual(results[-1]['status'], 'candidate'); self.assertIsNone(results[-1]['box'])
        later, _ = self.play([(20, [(.5, self.BOX)])], state)
        self.assertEqual(later[0]['positiveScans'], 1); self.assertEqual(later[0]['seenForMs'], 0)

    def test_between_scans_the_last_result_is_reported(self):
        _, state = self.play([(t, [(.5, self.BOX)]) for t in (0, 1, 2)])
        self.assertFalse(self.model.due(2.5, state)); self.assertTrue(self.model.due(3, state))
        held, _ = self.model.update(2.5, [], [], state, scanned=False)
        self.assertEqual(held['status'], 'seen'); self.assertEqual(held['recentScans'], 3)

    def test_held_in_hand_uses_hand_landmarks(self):
        self.assertTrue(overlaps(self.BOX, [[(.45, .62)]]))
        self.assertFalse(overlaps(self.BOX, [[(.1, .1), (.9, .9)]]))
        results, _ = self.play([(t, [(.5, self.BOX)]) for t in (0, 1, 2)], hands=[[(.45, .5)]])
        self.assertTrue(results[-1]['heldInHand'])

    def test_settings(self):
        with patch.dict('os.environ', {'PROCTORING_PHONE_CONFIRM_SCANS': '1'}):
            self.model = PhoneEstimator()
        self.assertEqual(self.play([(0, [(.5, self.BOX)])])[0][0]['status'], 'seen')
        with patch.dict('os.environ', {'PROCTORING_PHONE_CONFIRM_SCANS': '5', 'PROCTORING_PHONE_SCAN_WINDOW': '4'}):
            with self.assertRaises(ValueError): PhoneEstimator()
        with patch.dict('os.environ', {'PROCTORING_PHONE_SCORE_THRESHOLD': '0.05'}):
            with self.assertRaises(ValueError): PhoneEstimator()


if __name__ == '__main__': unittest.main()
