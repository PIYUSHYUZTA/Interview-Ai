import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';
import { FileSessionStore } from '../core/session/InterviewSessionStore.js';

// An API restart must not end a running interview's monitoring: the browser keeps its integrity token,
// and the restarted server validates it against the hash saved with the interview.
describe('API restart during an interview', () => {
  it('keeps camera samples and tab events authorised with the existing token, and still rejects wrong ones', async () => {
    const dataDirectory = mkdtempSync(path.join(tmpdir(), 'interview-restart-'));
    const observation = { faceTracks: [], faceState: 'FACE_PRESENT', faceCount: 1, faceTrackingReliable: true, headOrientation: 'roughly_forward', gazeDirection: 'roughly_centered', gazeReliable: true, directionEstimate: { headReliable: true, gazeReliable: true }, upperBodyVisible: false, upperBodyMovement: null, handCount: 0, handPositions: [], handMovement: null, positionShift: null };
    const image = readFileSync('proctoring/fixtures/blank.jpg').toString('base64');
    const open = async () => {
      // A persistent store, as in production (with authentication off the API would otherwise keep interviews in memory).
      const provider = new DeterministicProvider();
      const api = new ApiServer({ provider, authenticationRequired: false, dataDirectory, store: new FileSessionStore({ provider, seed: 42 }, path.join(dataDirectory, 'interviews')) });
      vi.spyOn((api as any).vision, 'analyze').mockImplementation(async () => observation);
      const server = await api.listen(0);
      return { api, server, base: `http://127.0.0.1:${server.port}` };
    };
    const frame = (base: string, id: string, token: string) => fetch(`${base}/interviews/${id}/proctoring-frame`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ consent: true, image, capturedAt: new Date().toISOString() }) });
    let first = await open();
    try {
      const session = await (await fetch(`${first.base}/interviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeText: STRONG_RESUME, numRounds: 1 }) })).json() as any;
      await fetch(`${first.base}/interviews/${session.sessionId}/start`, { method: 'POST' });
      expect((await frame(first.base, session.sessionId, session.integrityToken)).status).toBe(200);
      await first.server.close();

      first = await open(); // the "restarted" API: fresh process state, same saved interviews
      const after = await frame(first.base, session.sessionId, session.integrityToken);
      expect(after.status).toBe(200);
      expect(((await after.json()) as any).observation.faceCount).toBe(1);
      expect((await frame(first.base, session.sessionId, 'x'.repeat(session.integrityToken.length))).status).toBe(401);
      const event = await fetch(`${first.base}/interviews/${session.sessionId}/integrity-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.integrityToken}` }, body: JSON.stringify({ eventId: crypto.randomUUID(), eventType: 'camera_interrupted', occurredAt: new Date().toISOString(), durationMs: 5000 }) });
      expect(event.status).not.toBe(401);
      // The saved interview holds only a hash, never the token itself.
      const saved = JSON.stringify((await (first.api as any).store.load(session.sessionId)).serialize());
      expect(saved).not.toContain(session.integrityToken);
      expect(saved).toMatch(/"integrityTokenHash":"[0-9a-f]{64}"/);
    } finally { await first.server.close(); rmSync(dataDirectory, { recursive: true, force: true }); }
  });
});
