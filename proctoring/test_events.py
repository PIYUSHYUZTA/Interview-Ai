import unittest
from events import VisionEvents


def observation(face='FACE_PRESENT', head=None, gaze=None, body='visible'):
    return dict(faceState=face,directionEstimate=dict(headReliable=head is not None,headDirections=head or [],gazeReliable=gaze is not None,gazeDirections=gaze or [],framing='useful_area'),
        movementObservation=dict(handTracks=[],lostHands=[],body=dict(state=body,outsideUsefulArea=False),additionalPersonObserved=False))


class EventTests(unittest.TestCase):
    def setUp(self): self.emitter=VisionEvents()
    def update(self,t,obs,state=None): return self.emitter.update('session',t,1700000000000+int(t*1000),obs,state)

    def test_debounce_duplicates_and_no_invented_identity_or_confidence(self):
        obs=observation(face='FACE_NOT_DETECTED',body='unavailable')
        first,state=self.update(10,obs)
        self.assertEqual(first,[])
        events,state=self.update(12,obs,state)
        self.assertIn('face_not_detected',[e['eventType'] for e in events])
        for e in events:
            self.assertEqual(e['sessionId'],'session')
            self.assertIsNone(e['confidence'])
            self.assertEqual(e['durationMs'],2000)
            self.assertEqual(e['occurredAt'],1700000012000)
            self.assertNotEqual(e['eventType'],'face_verified')
        repeat,_=self.update(14,obs,state)
        self.assertEqual(repeat,[])

    def test_one_bad_frame_does_not_publish_loss(self):
        good=observation(head=[],gaze=[])
        _,state=self.update(10,good)
        _,state=self.update(12,good,state)
        _,state=self.update(14,observation(face='TRACKING_LOST'),state)
        events,_=self.update(16,good,state)
        self.assertNotIn('tracking_lost',[e['eventType'] for e in events])

    def test_cooldown_defers_recovery_without_losing_it(self):
        bad=observation(face='FACE_NOT_DETECTED')
        _,state=self.update(10,bad)
        _,state=self.update(12,bad,state)
        for t in [14,16,18,20]:
            events,state=self.update(t,observation(),state)
            self.assertNotIn('tracking_recovered',[e['eventType'] for e in events])
        events,state=self.update(22,observation(),state)
        recovered=[e for e in events if e['eventType']=='tracking_recovered' and e['details']['signal']=='face']
        self.assertEqual(len(recovered),1)
        self.assertEqual(recovered[0]['details']['phase'],'recovered')

    def test_gap_resets_debounce_duration(self):
        obs=observation(face='MULTIPLE_FACES')
        _,state=self.update(10,obs)
        result,state=self.update(20,obs,state)
        self.assertEqual(result,[])
        events,_=self.update(22,obs,state)
        event=next(e for e in events if e['eventType']=='multiple_faces_detected')
        self.assertEqual(event['durationMs'],2000)

    def test_multiple_faces_once_then_recovery_then_new_distinct_incident(self):
        state = None
        emitted = []
        for now in range(10, 34, 2):
            face = 'MULTIPLE_FACES' if now < 16 or now >= 28 else 'FACE_PRESENT'
            events, state = self.update(now, observation(face=face), state)
            emitted.extend(e for e in events if e['details']['signal'] == 'face')
        self.assertEqual([e['eventType'] for e in emitted],
            ['multiple_faces_detected', 'tracking_recovered', 'multiple_faces_detected'])
        self.assertEqual(len({e['eventId'] for e in emitted}), 3)
        self.assertTrue(all(e['severity'] == 'info' and e['confidence'] is None for e in emitted))

    def test_optional_model_outage_is_not_a_measured_hand_or_pose_loss(self):
        missing = observation(body='unavailable')
        missing['moduleStatus'] = dict(face='ready', hands='unavailable', pose='disabled')
        _, state = self.update(10, missing)
        events, _ = self.update(12, missing, state)
        self.assertFalse(any(e['details']['signal'] in ('hands', 'pose', 'people') for e in events))

    def test_direction_hand_and_framing_transitions_are_measured(self):
        obs=observation(head=['left'],gaze=['down'])
        obs['movementObservation']['body']['outsideUsefulArea']=True
        obs['movementObservation']['handTracks']=[dict(trackId=1,handedness='left',state='visible')]
        _,state=self.update(10,obs)
        events,_=self.update(12,obs,state)
        types={e['eventType'] for e in events}
        self.assertTrue({'head_orientation_changed','gaze_tracking_changed','hand_tracking_changed','candidate_out_of_frame'}.issubset(types))


if __name__=='__main__': unittest.main()
