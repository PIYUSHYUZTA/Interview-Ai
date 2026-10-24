import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';

// Delay inference to exercise real session locking, not computer-vision accuracy.
const observation = { faceCount: 0, faceTrackingReliable: false, headOrientation: 'unavailable', gazeDirection: 'unavailable', upperBodyVisible: false, upperBodyMovement: null, handCount: 0, handPositions: [], handMovement: null, positionShift: null };
describe('proctoring concurrency', () => {
  it('does not let slow inference delay termination or restore a terminal session', async () => {
    const api = new ApiServer({ provider: new DeterministicProvider(), authenticationRequired: false });
    const server = await api.listen(0); const base = `http://127.0.0.1:${server.port}`;
    let release!: (value: any) => void; let began!: () => void;
    const entered = new Promise<void>(resolve => began = resolve);
    const inference = vi.spyOn((api as any).vision, 'analyze').mockImplementation(() => { began(); return new Promise(resolve => release = resolve); });
    let clock: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const session = await (await fetch(`${base}/interviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeText: STRONG_RESUME, numRounds: 1 }) })).json() as any;
      const started = await (await fetch(`${base}/interviews/${session.sessionId}/start`, { method: 'POST' })).json() as any;
      const start = started.publicState.timing.sessionStartedAt;
      clock = vi.spyOn(Date, 'now');
      const incident = (index: number) => fetch(`${base}/interviews/${session.sessionId}/integrity-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.integrityToken}` }, body: JSON.stringify({ eventId: crypto.randomUUID(), eventType: 'tab_hidden', durationMs: 5500, occurredAt: new Date(start + 40000 + index * 25000).toISOString() }) });
      for (let index = 0; index < 2; index++) { clock.mockReturnValue(start + 40000 + index * 25000); expect((await incident(index)).status).toBe(200); clock.mockReturnValue(Date.now()+2000); expect((await fetch(`${base}/interviews/${session.sessionId}/integrity-events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.integrityToken}`},body:JSON.stringify({eventId:crypto.randomUUID(),eventType:'tab_visible',durationMs:2000,occurredAt:new Date(Date.now()).toISOString()})})).status).toBe(200); }
      clock.mockReturnValue(start + 90000);
      const frame = fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.integrityToken}` }, body: JSON.stringify({ consent: true, image: readFileSync('proctoring/fixtures/blank.jpg').toString('base64'), capturedAt: new Date(Date.now()).toISOString() }) });
      await entered;
      const termination = incident(2);
      const timely = await Promise.race([termination, new Promise<null>(resolve => setTimeout(() => resolve(null), 300))]);
      release(observation);
      const frameResponse = await frame; const terminalResponse = await termination;
      expect(timely, 'termination should not wait for Python').not.toBeNull();
      expect(terminalResponse.status).toBe(200);
      expect(await terminalResponse.json()).toMatchObject({ terminated: true, warningCount: 3 });
      expect(frameResponse.status).toBe(410);
      expect((await fetch(`${base}/interviews/${session.sessionId}/next-question`, { method: 'POST' })).status).toBe(410);
    } finally { release?.(observation); clock?.mockRestore(); inference.mockRestore(); await server.close(); }
  });
});

