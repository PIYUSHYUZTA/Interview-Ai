import { describe, expect, it } from 'vitest';
import { updateVisionIntegrity, VISION_WARNING_TYPES, VISION_REVIEW_TYPES, type VisionEngineState, type VisionSignalsInput } from './VisionIntegrityEngine.js';
import { InterviewStateMachine, InterviewState } from './InterviewStateMachine.js';
import { warningMessage } from './IntegrityPolicy.js';
import { DeterministicProvider } from '../provider/DeterministicProvider.js';
import { buildProfile, backendRole, STRONG_RESUME, sessionConfig } from '../../testSupport/fixtures.js';

const config = { noticeMs: 15_000, handFaceMs: 30_000, phoneMs: 10_000, interruptionMs: 1_500, clearMs: 2_000, gapMs: 6_000, recoveryMs: 10_000, directionReview: true, positionThreshold: .15 };
const alone: VisionSignalsInput = { faceCount: 1, headOrientation: 'roughly_forward', gazeDirection: 'roughly_centered', gazeReliable: true, positionShift: 0, directionEstimate: { headReliable: true, gazeReliable: true }, frameQuality: { usable: true } };

/** Feed samples and collect every record and notice. */
function run(frames: { at: number; observation: VisionSignalsInput }[], state?: VisionEngineState) {
  const events: any[] = []; const notices: string[] = [];
  for (const { at, observation } of frames) {
    const output = updateVisionIntegrity({ sessionId: 's', now: at, eligibleAt: 30_000, observation, config, state });
    state = output.state; events.push(...output.events); notices.push(...output.notices);
  }
  return { events, notices, state: state! };
}
const samples = (from: number, to: number, step: number, observation: (at: number, i: number) => VisionSignalsInput) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => ({ at: from + i * step, observation: observation(from + i * step, i) }));

function machine() {
  const sm = new InterviewStateMachine(sessionConfig(buildProfile(STRONG_RESUME), backendRole()), { provider: new DeterministicProvider(), seed: 1 });
  sm.prepare(); sm.start();
  return sm;
}

describe('VisionIntegrityEngine', () => {
  it('a ten-minute continuing event at 2 samples/s yields one qualifying record, after a recovery prompt', () => {
    const { events, notices } = run(samples(30_000, 630_000, 500, () => ({ ...alone, faceCount: 2 })));
    expect(events).toHaveLength(1);
    // Sustained 15 s -> recovery prompt; still there 10 s later -> one qualifying record.
    expect(events[0]).toMatchObject({ eventType: 'multiple_faces', tier: 'warning', occurrences: 1, durationMs: 25_000, occurredAt: 55_000, confidence: null, details: { phase: 'observed' } });
    expect(events[0].explanation).toMatch(/^Up to 2 faces were visible for at least 25 s \(51 of 51 samples\)\..*not a determination of intent\.$/);
    expect(notices[0]).toBe('More than one face is in view. Please make sure you are alone for the interview. If this continues for about 10 more seconds it will count as an integrity warning.');
    expect(notices.filter(n => n.startsWith('More than one face is in view'))).toHaveLength(20); // 45–54.5 s
    expect(notices).toHaveLength(1171); // display while ongoing, not records
  });

  it('recovering during the prompt leaves no record', () => {
    const frames = [...samples(30_000, 50_000, 500, () => ({ ...alone, faceCount: 0 })), ...samples(50_500, 60_000, 500, () => alone)];
    const { events, notices } = run(frames);
    expect(events).toEqual([]);
    expect(notices.some(n => n.startsWith('We cannot see your face'))).toBe(true);
  });

  it('temporal smoothing: single-frame misses are bridged; a confirmed absence over 2 s ends the incident with one closing record', () => {
    const flicker = run(samples(30_000, 60_000, 500, (_, i) => ({ ...alone, faceCount: i % 3 === 2 ? 1 : 2 })));
    expect(flicker.events.map(e => e.details.phase)).toEqual(['observed']);
    const after = run(samples(60_500, 63_000, 500, () => alone), flicker.state);
    expect(after.events).toHaveLength(1);
    expect(after.events[0]).toMatchObject({ eventId: `${flicker.events[0].eventId}-ended`, durationMs: 30_000, details: { phase: 'recovered' }, samples: { positive: 41, total: 66 } });
  });

  it('brief incidents below the sustain time leave no record at all', () => {
    const frames = samples(30_000, 120_000, 500, (at) => ({ ...alone, faceCount: Math.floor(at / 10_000) % 2 ? 0 : 1 })); // 10 s absences
    expect(run(frames).events).toEqual([]);
  });

  it('unusable frames are technical: never face absence, recorded only as camera_obstructed', () => {
    const covered = { ...alone, faceCount: 0, frameQuality: { usable: false } };
    const { events, notices } = run(samples(30_000, 120_000, 500, () => covered));
    expect(events.map(e => [e.eventType, e.tier])).toEqual([['camera_obstructed', 'review']]);
    expect(notices.some(n => n.startsWith('We cannot see your face'))).toBe(false);
    // An usable empty frame after the covered one starts a fresh absence incident.
    const usable = run(samples(120_500, 150_000, 500, () => ({ ...alone, faceCount: 0 })), run(samples(30_000, 120_000, 500, () => covered)).state);
    expect(usable.events.map(e => [e.eventType, e.details.phase])).toEqual([['camera_obstructed', 'recovered'], ['face_absent', 'observed']]);
  });

  it('unknown samples are bridged briefly; a sampling gap (camera off, network) ends every incident at the last sample', () => {
    const phone = (status: string | null) => ({ ...alone, ...(status ? { phoneObservation: { status, score: .6, heldInHand: true } } : {}) });
    const seen = run(samples(30_000, 55_000, 500, (_, i) => phone(i % 4 === 3 ? null : 'seen')));
    expect(seen.events.map(e => [e.eventType, e.details.phase, e.confidence, e.occurredAt])).toEqual([['phone_visible', 'observed', .6, 50_000]]);
    const resumed = run([{ at: 70_000, observation: phone('seen') }], seen.state); // 15 s without samples
    expect(resumed.events.map(e => [e.details.phase, e.occurredAt, e.durationMs])).toEqual([['recovered', 55_000, 25_000]]);
  });

  it('nothing opens during the monitoring grace period', () => {
    expect(run(samples(0, 29_500, 500, () => ({ ...alone, faceCount: 0 }))).events).toEqual([]);
    const late = run(samples(0, 56_000, 500, () => ({ ...alone, faceCount: 0 })));
    expect(late.events[0]).toMatchObject({ eventType: 'face_absent', occurredAt: 55_000, durationMs: 25_000 });
  });

  it('count signals carry an occurrence count and are recorded once per window', () => {
    const turning = { ...alone, directionEstimate: { headReliable: true, gazeReliable: true, repeatedHeadTurns: true, recentHeadTurns: 5, headTurnWindowSeconds: 60 } };
    const { events } = run(samples(30_000, 160_000, 1000, () => turning));
    expect(events.map(e => [e.eventType, e.occurredAt, e.occurrences, e.tier])).toEqual([['repeated_head_turns', 30_000, 5, 'review'], ['repeated_head_turns', 90_000, 5, 'review'], ['repeated_head_turns', 150_000, 5, 'review']]);
  });

  it('direction signals are off when direction review is disabled', () => {
    const away = { ...alone, gazeDirection: 'possibly_sideways', headOrientation: 'turned' };
    let state: VisionEngineState | undefined; let count = 0;
    for (const f of samples(30_000, 60_000, 500, () => away)) {
      const o = updateVisionIntegrity({ sessionId: 's', now: f.at, eligibleAt: 30_000, observation: f.observation, config: { ...config, directionReview: false }, state });
      state = o.state; count += o.events.length;
    }
    expect(count).toBe(0);
  });

  it('tiers: only strong, validated signals can become warnings', () => {
    expect(VISION_WARNING_TYPES).toEqual(['multiple_faces', 'face_absent', 'phone_visible']);
    expect(VISION_REVIEW_TYPES).toEqual(['gaze_away', 'head_turned', 'hand_near_face', 'position_changed', 'camera_obstructed', 'repeated_head_turns', 'repeated_hand_pattern']);
  });
});

describe('three-warning policy in the state machine', () => {
  const tab = (sm: InterviewStateMachine, at: number, id: string) => sm.recordIntegrityWarning({ sessionId: sm.sessionId, eventId: id, eventType: 'tab_hidden', occurredAt: sm.timing.sessionStartedAt! + at, durationMs: 6_000, confidence: null, details: { source: 'browser', signal: 'tab_hidden', trackingState: 'hidden', phase: 'observed' } });
  const feeder = (sm: InterviewStateMachine) => {
    let state: VisionEngineState | undefined; const start = sm.timing.sessionStartedAt!;
    return (from: number, to: number, observation: VisionSignalsInput) => {
      for (let at = from; at <= to; at += 500) {
        if (sm.state === InterviewState.TERMINATED_FOR_INTEGRITY) return;
        const output = updateVisionIntegrity({ sessionId: sm.sessionId, now: start + at, eligibleAt: start + 30_000, observation, config, state });
        state = output.state; for (const event of output.events) sm.recordIntegrityWarning(event);
      }
    };
  };

  it('camera and tab incidents share one counter: warning 1, warning 2, then the third ends the interview with a recorded reason', () => {
    const sm = machine(); const feed = feeder(sm);
    feed(30_000, 60_000, { ...alone, faceCount: 2 });     // qualifies at 55 s -> warning 1
    feed(60_500, 64_000, alone);
    feed(64_500, 95_000, { ...alone, faceCount: 2 });     // qualifies at 89.5 s, inside the 60 s cooldown -> recorded, not counted
    feed(95_500, 99_000, alone);
    feed(200_000, 230_000, { ...alone, faceCount: 0 });   // qualifies at 225 s -> warning 2 (final)
    feed(230_500, 234_000, alone);
    const counted = sm.integrityEvents.filter(e => e.warningNumber > 0);
    expect(counted.map(e => [e.eventType, e.warningNumber])).toEqual([['multiple_faces', 1], ['face_absent', 2]]);
    expect(sm.integrityEvents.filter(e => e.details?.phase === 'observed').map(e => e.policyDecision)).toEqual(['confirmed_violation', 'cooldown', 'confirmed_violation']);
    expect(warningMessage(counted[0], 1)).toBe('Warning 1 of 2: more than one face was visible for 25 s. Camera observations are approximate; this is not a determination of intent. Please correct this to continue; a further qualifying incident adds a second warning.');
    expect(warningMessage(counted[1], 2)).toMatch(/^Warning 2 of 2 — final warning: no face was visible for 25 s while the camera image was usable\..* Another qualifying incident will end this interview\.$/);
    expect(sm.state).toBe(InterviewState.IN_PROGRESS);
    const third = tab(sm, 300_000, 'tab-3');
    expect(third).toMatchObject({ warningCount: 3, terminated: true });
    expect(sm.state).toBe(InterviewState.TERMINATED_FOR_INTEGRITY);
    expect(sm.toPublicState().integrity).toMatchObject({ warningCount: 3, visionWarningCount: 2 });
    expect(sm.toPublicState().integrity.terminationReason).toBe('The interview ended after three separate qualifying incidents: 1) more than one face was visible for 25 s; 2) no face was visible for 25 s while the camera image was usable; 3) the interview tab was hidden for 6 s. Each incident was sustained and recorded separately; camera observations are approximate, and this is not a determination of intent.');
    // Persisted: restore keeps the counter, reason and terminal state; replays stay idempotent.
    const restored = InterviewStateMachine.deserialize(sm.serialize(), { provider: new DeterministicProvider(), seed: 1 });
    expect(restored.toPublicState().integrity).toMatchObject({ warningCount: 3, visionWarningCount: 2, terminationReason: sm.toPublicState().integrity.terminationReason });
    expect(restored.state).toBe(InterviewState.TERMINATED_FOR_INTEGRITY);
  });

  it('repeated frames of one event, replays and simultaneous signals never add warnings', () => {
    const sm = machine(); const feed = feeder(sm);
    // A second person walks in holding a phone: two signals from one moment.
    feed(30_000, 70_000, { ...alone, faceCount: 2, phoneObservation: { status: 'seen', score: .7, heldInHand: true } });
    for (const event of [...sm.integrityEvents]) sm.recordIntegrityWarning(event); // replayed records
    expect(sm.toPublicState().integrity.warningCount).toBe(1);
    expect(sm.integrityEvents.filter(e => e.details?.phase === 'observed').map(e => [e.eventType, e.policyDecision])).toEqual([['phone_visible', 'confirmed_violation'], ['multiple_faces', 'cooldown']]);
  });

  it('technical problems never count: camera loss, unusable frames, pipeline errors, review notes', () => {
    const sm = machine(); const feed = feeder(sm); const start = sm.timing.sessionStartedAt!;
    feed(30_000, 120_000, { ...alone, faceCount: 0, frameQuality: { usable: false } });      // covered/dark camera
    feed(120_500, 200_000, { ...alone, gazeDirection: 'possibly_sideways', headOrientation: 'turned' }); // review notes
    for (const [type, at] of [['camera_interrupted', 210_000], ['microphone_interrupted', 220_000], ['connection_interrupted', 230_000]] as const)
      sm.recordIntegrityWarning({ sessionId: sm.sessionId, eventId: type, eventType: type, occurredAt: start + at, durationMs: 8_000, confidence: null, severity: 'technical', details: { source: 'browser', signal: type, trackingState: 'interrupted', phase: 'technical' } });
    expect(sm.toPublicState().integrity.warningCount).toBe(0);
    expect(sm.integrityEvents.length).toBeGreaterThan(3);
  });

  it('a camera incident right after a tab warning is recorded but not counted', () => {
    const sm = machine(); const feed = feeder(sm);
    expect(tab(sm, 40_000, 'tab-1').warningCount).toBe(1);
    feed(41_000, 70_000, { ...alone, faceCount: 2 });   // qualifies at 66 s, within 60 s of the tab warning
    expect(sm.toPublicState().integrity.warningCount).toBe(1);
    expect(sm.integrityEvents.find(e => e.eventType === 'multiple_faces')?.policyDecision).toBe('cooldown');
  });
});
