import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { InMemorySessionStore } from '../core/session/InterviewSessionStore.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';

describe('integrated Python vision and backend integrity policy', () => {
  afterEach(() => vi.restoreAllMocks());
  it('analyzes real JPEGs through Python, gates access, and treats a blank camera image as technical, never a warning', async () => {
    const provider = new DeterministicProvider();
    const store = new InMemorySessionStore({ provider });
    const api = new ApiServer({ provider, store, authenticationRequired: false });
    const server = await api.listen(0);
    const base = `http://127.0.0.1:${server.port}`;
    try {
      const created = await fetch(`${base}/interviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeText: STRONG_RESUME, numRounds: 1 }) });
      const session = await created.json() as any;
      expect(created.status).toBe(201);
      expect(session.integrityPolicy.maximumWarnings).toBe(2);
      const started = await (await fetch(`${base}/interviews/${session.sessionId}/start`, { method: 'POST' })).json() as any;
      const startedAt = started.publicState.timing.sessionStartedAt;
      const clock = vi.spyOn(Date, 'now');
      const image = readFileSync('proctoring/fixtures/blank.jpg').toString('base64');
      const sample = (token: string, at: number) => fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ consent: true, image, capturedAt: new Date(at).toISOString() }),
      });
      clock.mockReturnValue(startedAt + 31_000);
      expect((await sample('wrong-token', Date.now())).status).toBe(401);
      for (let index = 0; index <= 8; index++) {
        clock.mockReturnValue(startedAt + 31_000 + index * 2000);
        const response = await sample(session.integrityToken, Date.now());
        expect(response.status).toBe(200);
        const result = await response.json() as any;
        expect(result.observation).toMatchObject({ faceCount: 0, handCount: 0, upperBodyVisible: false });
        expect(result.publicState.integrity.warningCount).toBe(0);
        // A black frame cannot show a face: technical (camera_obstructed), never face absence or a warning.
        if (index === 8) expect(result.notices[0]).toMatch(/too dark or uniform to analyse .*Treated as a technical problem\. Recorded as a review note only; no warning is counted\.$/);
      }
      const event = { eventId: crypto.randomUUID(), eventType: 'camera_interrupted', occurredAt: new Date(Date.now()).toISOString(), durationMs: 5000 };
      const technical = await fetch(`${base}/interviews/${session.sessionId}/integrity-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.integrityToken}` }, body: JSON.stringify(event) });
      expect(technical.status).toBe(200);
      expect(await technical.json()).toMatchObject({ warningCount: 0, terminated: false });
      const answer = await fetch(`${base}/interviews/${session.sessionId}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: started.currentQuestion.id, text: 'I would validate the design through a concrete example and tests.' }) });
      expect((await answer.json() as any).publicState.state).toBe('EVALUATING');
      clock.mockReturnValue(Date.now() + 2000);
      expect((await sample(session.integrityToken, Date.now())).status).toBe(200);
      const diagnostics = await (await fetch(`${base}/interviews/${session.sessionId}/diagnostics`)).json() as any;
      expect(diagnostics.python).toMatchObject({ service: 'connected', framesReceived: 10, framesAnalyzed: 10, failures: 0 });
      expect(diagnostics.policy.penaltySignals).toEqual(['tab_hidden', 'multiple_faces', 'face_absent', 'phone_visible']);
      expect(diagnostics.events.map((event: any) => event.eventType)).toContain('camera_interrupted');
      expect(JSON.stringify(diagnostics)).not.toContain(image);
      const restored = await store.load(session.sessionId);
      expect(restored!.integrityEvents.map((item) => item.eventType)).toEqual(['camera_obstructed', 'camera_interrupted', 'camera_recovered']);
      expect(restored!.integrityEvents.every((item) => !item.warningNumber)).toBe(true);
      expect(JSON.stringify(restored!.serialize())).not.toContain(image);
    } finally { await server.close(); }
  }, 45_000);
});
