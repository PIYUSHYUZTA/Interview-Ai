import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';

// Controlled observations exercise actual server timing, persistence and policy.
// Real landmark geometry/inference is covered separately by Python/worker tests.
describe('neutral directional review', () => {
  it.each([true, false])('sustained observations, unreliable resets and accommodation enabled=%s', async (enabled) => {
    const api = new ApiServer({ provider: new DeterministicProvider(), authenticationRequired: false, config: { visualDirectionReviewEnabled: enabled } });
    const server = await api.listen(0); const base = `http://127.0.0.1:${server.port}`;
    const observation = { faceTracks: [], faceState: 'QUALITY_LOW', faceCount: 1, faceTrackingReliable: true, headOrientation: 'turned', gazeDirection: 'possibly_sideways', gazeReliable: true, directionEstimate: { headReliable: true, gazeReliable: true }, upperBodyVisible: false, upperBodyMovement: null, handCount: 0, handPositions: [], handMovement: null, positionShift: null };
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
        return result;
      };
      expect((await frame(32000)).notices).toEqual([]);
      observation.directionEstimate.headReliable = observation.directionEstimate.gazeReliable = false;
      expect((await frame(34000)).notices).toEqual([]);
      observation.directionEstimate.headReliable = observation.directionEstimate.gazeReliable = true;
      for (let at=36000; at<=54000; at+=2000) await frame(at);
      const diagnostics = await (await fetch(`${base}/interviews/${session.sessionId}/diagnostics`)).json() as any;
      const reviews = diagnostics.events.filter((e: any) => ['head_turned','gaze_away'].includes(e.eventType));
      expect(reviews).toHaveLength(enabled ? 2 : 0); // one record per continuous incident
      expect(reviews.every((e: any) => !e.warningNumber)).toBe(true);
      expect(diagnostics.warningCount).toBe(0);
    } finally { clock?.mockRestore(); inference.mockRestore(); await server.close(); }
  });
});
