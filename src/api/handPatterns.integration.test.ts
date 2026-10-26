import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';

// Controlled observations exercise server timing and policy; hand geometry is covered by test_movement.py.
describe('hand observations', () => {
  it('hand near face needs its own longer sustain; repeated patterns are review notes once per window', async () => {
    const api = new ApiServer({ provider: new DeterministicProvider(), authenticationRequired: false });
    const server = await api.listen(0); const base = `http://127.0.0.1:${server.port}`;
    const movement: Record<string, any> = { handTracks: [], lostHands: [], rejectedHands: 0, body: { state: 'unavailable', reliable: false, center: null, landmarks: [], movement: null, positionShift: null, shoulderTiltDegrees: null, outsideUsefulArea: false, visibility: null, unreliableForMs: 0, sustainedMovementMs: 0, movementEpisodes: 0, repeatedMovement: false, sustainedMovement: false }, visiblePoseCount: 0, additionalPersonObserved: false, coordinateSystem: 'unmirrored-camera', method: 'sampled-landmark-movement', interpretation: 'neutral-observation',
      handNearFace: true, handNearFaceSource: 'hand-landmarks', handNearFaceMs: 500, handPatterns: { windowSeconds: 120, handToFaceEpisodes: 0, sideReaches: 0, repeated: false, patterns: [] } };
    const observation = { faceTracks: [], faceState: 'FACE_PRESENT', faceCount: 1, faceTrackingReliable: true, headOrientation: 'roughly_forward', gazeDirection: 'roughly_centered', gazeReliable: true, directionEstimate: { headReliable: true, gazeReliable: true }, movementObservation: movement, upperBodyVisible: false, upperBodyMovement: null, handCount: 1, handPositions: [], handMovement: null, positionShift: null };
    const inference = vi.spyOn((api as any).vision, 'analyze').mockImplementation(async () => observation);
    let clock: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const session = await (await fetch(`${base}/interviews`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ resumeText: STRONG_RESUME, numRounds: 1 }) })).json() as any;
      const started = await (await fetch(`${base}/interviews/${session.sessionId}/start`, {method:'POST'})).json() as any;
      const start = started.publicState.timing.sessionStartedAt;
      const image = readFileSync('proctoring/fixtures/blank.jpg').toString('base64');
      clock = vi.spyOn(Date, 'now');
      const frame = async (offset: number) => {
        clock!.mockReturnValue(start+offset);
        const response = await fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`, {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.integrityToken}`},body:JSON.stringify({consent:true,image,capturedAt:new Date(Date.now()).toISOString()})});
        expect(response.status).toBe(200);
        const result = await response.json() as any;
        expect(result.publicState.integrity.warningCount).toBe(0);
        return result.notices as string[];
      };
      const events = async (type: string) => ((await (await fetch(`${base}/interviews/${session.sessionId}/diagnostics`)).json() as any).events as any[]).filter(e => e.eventType === type);
      // Hand held at the face from 32 s: the default 15 s vision threshold does not apply, 30 s does.
      const handNotice = (notices: string[]) => notices.some(n => n.startsWith('A hand was held near the face'));
      let first: number | null = null;
      for (let at = 32000; at <= 64000; at += 2000) if (handNotice(await frame(at)) && first === null) first = at;
      expect(first).toBe(62000);
      const near = await events('hand_near_face');
      expect(near).toHaveLength(1);
      expect(near[0]).toMatchObject({ policyDecision: 'context_only', tier: 'review' }); expect(near[0].warningNumber).toBeFalsy();
      // Hand lowered: bridged for up to 2 s, then the incident ends with one closing record.
      Object.assign(movement, { handNearFace: false, handNearFaceSource: null, handNearFaceMs: 0 });
      expect(handNotice(await frame(66000))).toBe(true);
      expect(await frame(68000)).toEqual([]);
      const ended = (await events('hand_near_face')).filter((e: any) => e.details.phase === 'recovered');
      expect(ended).toHaveLength(1); expect(ended[0].durationMs).toBe(32000);
      // The worker reports repeated hand-to-face movements and side reaches: one combined review note per window.
      movement.handPatterns = { windowSeconds: 120, handToFaceEpisodes: 4, sideReaches: 5, repeated: true, patterns: ['hand_to_face', 'side_reach'] };
      expect(await frame(70000)).toEqual(['4 hand-to-face movements and 5 reaches out of view at the side in about 120 s. Ordinary gesturing is not counted; this is not a cheating finding. Recorded as a review note only; no warning is counted.']);
      for (let at = 72000; at < 190000; at += 6000) expect(await frame(at)).toEqual([]);
      expect(await frame(190000)).toHaveLength(1);
      const patterns = await events('repeated_hand_pattern');
      expect(patterns).toHaveLength(2);
      expect(patterns.every((e: any) => e.policyDecision === 'context_only' && e.occurrences === 9 && !e.warningNumber)).toBe(true);
    } finally { clock?.mockRestore(); inference.mockRestore(); await server.close(); }
  });

  it('a confirmed phone: recovery prompt, then warning 1 of the shared policy; repeats in the cooldown are not counted; the report lists both', async () => {
    const api = new ApiServer({ provider: new DeterministicProvider(), authenticationRequired: false });
    const server = await api.listen(0); const base = `http://127.0.0.1:${server.port}`;
    const phone: Record<string, any> = { status: 'seen', positiveScans: 3, recentScans: 4, requiredScans: 3, score: .5, box: [.4,.4,.5,.6], heldInHand: true, seenForMs: 2000, scoreThreshold: .3, method: 'efficientdet-lite0-coco-cell-phone', calibrated: false };
    const observation: Record<string, any> = { faceTracks: [], faceState: 'FACE_PRESENT', faceCount: 1, faceTrackingReliable: true, headOrientation: 'roughly_forward', gazeDirection: 'roughly_centered', gazeReliable: true, directionEstimate: { headReliable: true, gazeReliable: true }, phoneObservation: phone, frameQuality: { brightness: 80, contrast: 40, usable: true }, upperBodyVisible: false, upperBodyMovement: null, handCount: 1, handPositions: [], handMovement: null, positionShift: null };
    const inference = vi.spyOn((api as any).vision, 'analyze').mockImplementation(async () => observation);
    let clock: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const session = await (await fetch(`${base}/interviews`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ resumeText: STRONG_RESUME, numRounds: 1, questionsPerRound: 1 }) })).json() as any;
      const started = await (await fetch(`${base}/interviews/${session.sessionId}/start`, {method:'POST'})).json() as any;
      const start = started.publicState.timing.sessionStartedAt;
      const image = readFileSync('proctoring/fixtures/blank.jpg').toString('base64');
      clock = vi.spyOn(Date, 'now');
      const frame = async (offset: number) => {
        clock!.mockReturnValue(start+offset);
        const response = await fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`, {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.integrityToken}`},body:JSON.stringify({consent:true,image,capturedAt:new Date(Date.now()).toISOString()})});
        expect(response.status).toBe(200);
        return await response.json() as any;
      };
      const events = async () => ((await (await fetch(`${base}/interviews/${session.sessionId}/diagnostics`)).json() as any).events as any[]).filter(e => e.eventType === 'phone_visible');
      const has = (result: any, prefix: string) => result.notices.some((n: string) => n.startsWith(prefix));
      // Confirmed from 32 s: a recovery prompt at 42 s (10 s), a counted warning at 52 s if it is still there.
      let prompt: number | null = null, counted: any = null;
      for (let at = 32000; at <= 56000; at += 1000) {
        const result = await frame(at);
        if (prompt === null && has(result, 'A phone appears to be in view. Please put it away.')) prompt = at;
        if (result.warning) { expect(counted).toBeNull(); counted = { at, ...result.warning, count: result.publicState.integrity.warningCount }; }
      }
      expect(prompt).toBe(42000);
      expect(counted).toMatchObject({ at: 52000, warningCount: 1, maximumWarnings: 2, terminated: false, count: 1 });
      expect(counted.message).toBe('Warning 1 of 2: an object the detector classified as a phone was visible for 20 s. Camera observations are approximate; this is not a determination of intent. Please correct this to continue; a further qualifying incident adds a second warning.');
      // A sample without a phone result (detector unavailable) is unknown: bridged briefly, not "no phone".
      delete observation.phoneObservation; expect(has(await frame(57000), 'An object the detector')).toBe(true);
      observation.phoneObservation = phone; await frame(58000);
      // Unconfirmed for more than 2 s ends the incident.
      phone.status = 'candidate'; for (const at of [59000, 60000, 61000]) await frame(at);
      // The phone returns: a new incident qualifies at 82 s, inside the 60 s cooldown after warning 1 -> recorded, not counted.
      phone.status = 'seen';
      for (let at = 62000; at <= 82000; at += 1000) { const result = await frame(at); expect(result.warning ?? null).toBeNull(); expect(result.publicState.integrity.warningCount).toBe(1); }
      const observed = (await events()).filter((e: any) => e.details.phase === 'observed');
      expect(observed.map((e: any) => [e.policyDecision, e.warningNumber])).toEqual([['confirmed_violation', 1], ['cooldown', 0]]);
      expect(observed[0]).toMatchObject({ tier: 'warning', confidence: .5, samples: { positive: 21, total: 21 } });
      const diagnostics = await (await fetch(`${base}/interviews/${session.sessionId}/diagnostics`)).json() as any;
      expect(diagnostics).toMatchObject({ warningCount: 1, visionWarningCount: 1, state: 'IN_PROGRESS' });
      // The report lists each incident once, with its warning number or cooldown status.
      const answered = await fetch(`${base}/interviews/${session.sessionId}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: started.currentQuestion.id, text: 'I implemented an API with explicit error handling, measured latency and tested recovery.' }) });
      expect(answered.status).toBe(200);
      const report = await (await fetch(`${base}/interviews/${session.sessionId}/results`)).json() as any;
      expect(report.integrityReview).toMatchObject({ totalWarnings: 1, tabWarnings: 0, cameraWarnings: 1 });
      expect(report.integrityReview.incidents.map((i: any) => [i.eventType, i.counted, i.warningNumber, i.startedAtMs, i.durationMs, i.ongoingAtEnd, i.confidence])).toEqual([
        ['phone_visible', true, 1, 32000, 26000, false, .5],    // 32–58 s, closed by the unconfirmed samples
        ['phone_visible', false, 0, 62000, 20000, true, .5],    // within the cooldown; still open when the interview ended
      ]);
      expect(report.integrityReview.incidents[0].explanation).toMatch(/^An object the detector .* for 26 s \(26 of 30 samples, mean score 0\.50\)\..*not a determination of intent\.$/);
      expect(report.integrityReview.note).toMatch(/a third qualifying incident ends the interview.*technical problems are never counted/);
    } finally { clock?.mockRestore(); inference.mockRestore(); await server.close(); }
  });

  it('three qualifying incidents end the interview through the frame path, with the reason recorded and capture refused afterwards', async () => {
    const api = new ApiServer({ provider: new DeterministicProvider(), authenticationRequired: false });
    const server = await api.listen(0); const base = `http://127.0.0.1:${server.port}`;
    const observation: Record<string, any> = { faceTracks: [], faceState: 'FACE_PRESENT', faceCount: 1, faceTrackingReliable: true, headOrientation: 'roughly_forward', gazeDirection: 'roughly_centered', gazeReliable: true, directionEstimate: { headReliable: true, gazeReliable: true }, frameQuality: { brightness: 80, contrast: 40, usable: true }, upperBodyVisible: false, upperBodyMovement: null, handCount: 0, handPositions: [], handMovement: null, positionShift: null };
    const inference = vi.spyOn((api as any).vision, 'analyze').mockImplementation(async () => observation);
    let clock: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const session = await (await fetch(`${base}/interviews`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ resumeText: STRONG_RESUME, numRounds: 1 }) })).json() as any;
      const started = await (await fetch(`${base}/interviews/${session.sessionId}/start`, {method:'POST'})).json() as any;
      const start = started.publicState.timing.sessionStartedAt;
      const image = readFileSync('proctoring/fixtures/blank.jpg').toString('base64');
      clock = vi.spyOn(Date, 'now');
      const frame = async (offset: number) => {
        clock!.mockReturnValue(start+offset);
        return fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`, {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.integrityToken}`},body:JSON.stringify({consent:true,image,capturedAt:new Date(Date.now()).toISOString()})});
      };
      const warnings: any[] = [];
      const incident = async (from: number, to: number, faces: number) => {
        observation.faceCount = faces;
        for (let at = from; at <= to; at += 1000) { const result = await (await frame(at)).json() as any; if (result.warning) warnings.push(result.warning); }
        observation.faceCount = 1;
        for (let at = to + 1000; at <= to + 4000; at += 1000) await frame(at);
      };
      await incident(32000, 60000, 2);      // warning 1 at 57 s
      // A camera disconnection in between is technical and adds nothing.
      const technical = await fetch(`${base}/interviews/${session.sessionId}/integrity-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.integrityToken}` }, body: JSON.stringify({ eventId: crypto.randomUUID(), eventType: 'camera_interrupted', occurredAt: new Date(Date.now()).toISOString(), durationMs: 10000 }) });
expect(technical.status).toBe(200);
      expect((await technical.json() as any).warningCount).toBe(1);
      await incident(140000, 170000, 0);    // warning 2 at 165 s
      await incident(260000, 290000, 2);    // third qualifying incident at 285 s -> interview ends
      expect(warnings.map(w => [w.warningCount, w.terminated])).toEqual([[1, false], [2, false], [3, true]]);
      expect(warnings[1].message).toMatch(/^Warning 2 of 2 — final warning: no face was visible for 25 s while the camera image was usable\./);
      expect(warnings[2].message).toMatch(/^Interview ended — third qualifying incident: more than one face was visible for 25 s\./);
      const after = await frame(300000);
      expect(after.status).toBeGreaterThanOrEqual(400); // capture refused after termination
      const results = await fetch(`${base}/interviews/${session.sessionId}/results`);
      expect(results.status).toBe(410);
      const body = await results.json() as any;
      expect(body.publicState.state).toBe('TERMINATED_FOR_INTEGRITY');
      expect(body.publicState.integrity.terminationReason).toBe('The interview ended after three separate qualifying incidents: 1) more than one face was visible for 25 s; 2) no face was visible for 25 s while the camera image was usable; 3) more than one face was visible for 25 s. Each incident was sustained and recorded separately; camera observations are approximate, and this is not a determination of intent.');
      expect(body.integrityReview.incidents.filter((i: any) => i.counted).map((i: any) => i.warningNumber)).toEqual([1, 2, 3]);
    } finally { clock?.mockRestore(); inference.mockRestore(); await server.close(); }
  });
});
