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


  it('blinks and brief unreliable samples do not reset sustained gaze; repeated head turns are noted once per window', async () => {
    const api = new ApiServer({ provider: new DeterministicProvider(), authenticationRequired: false });
    const server = await api.listen(0); const base = `http://127.0.0.1:${server.port}`;
    const direction: Record<string, unknown> = { headReliable: true, gazeReliable: true };
    const observation = { faceTracks: [], faceState: 'FACE_PRESENT', faceCount: 1, faceTrackingReliable: true, headOrientation: 'roughly_forward', gazeDirection: 'possibly_sideways', gazeReliable: true, directionEstimate: direction, upperBodyVisible: false, upperBodyMovement: null, handCount: 0, handPositions: [], handMovement: null, positionShift: null };
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
      const gazeNotice = (notices: string[]) => notices.some(n => n.startsWith('The approximate, uncalibrated eye direction'));
      // Sideways gaze with an unreadable sample (eyes closed past the blink hold) every fourth second.
      let firstNotice: number | null = null;
      for (let at = 32000; at <= 50000; at += 1000) {
        direction.gazeReliable = observation.gazeReliable = (at / 1000) % 4 !== 0;
        if (gazeNotice(await frame(at)) && firstNotice === null) firstNotice = at;
      }
      expect(firstNotice).toBe(49000); // starts at 33 s (32 s was unreadable); 48 s is unreadable, so 15 s is confirmed at 49 s
      // One centred sample is bridged (temporal smoothing); more than 2 s of confirmed centred samples ends the incident.
      observation.gazeDirection = 'roughly_centered';
      expect(gazeNotice(await frame(51000))).toBe(true);
      await frame(52000); await frame(53000);
      observation.gazeDirection = 'possibly_sideways';
      for (let at = 54000; at <= 67000; at += 1000) expect(await frame(at)).toEqual([]); // a new incident needs a fresh 15 s
      // Unreadable for longer than the 1.5 s tolerance also ends it.
      direction.gazeReliable = observation.gazeReliable = false; await frame(68000); await frame(69000);
      direction.gazeReliable = observation.gazeReliable = true;
      for (let at = 70000; at <= 80000; at += 1000) expect(await frame(at)).toEqual([]);
      const gaze = await events('gaze_away');
      expect(gaze.map((e: any) => e.details.phase)).toEqual(['observed', 'recovered']); // one incident: qualified once, ended once
      expect(gaze[1].durationMs).toBe(17000);
      expect(gaze[0]).toMatchObject({ tier: 'review', policyDecision: 'context_only' });
      expect(gaze[0].explanation).toMatch(/cannot tell what you were looking at\. Recorded as a review note only; no warning is counted\.$/);
      // Repeated head turns reported by the worker: one review note per window, with its occurrence count.
      observation.gazeDirection = 'roughly_centered';
      Object.assign(direction, { repeatedHeadTurns: true, recentHeadTurns: 4, headTurnWindowSeconds: 60 });
      expect((await frame(81000)).join()).toMatch(/^4 held head turns \(each over a second\) in about 60 s\. .*Recorded as a review note only; no warning is counted\.$/);
      for (let at = 82000; at <= 140000; at += 2000) expect(await frame(at)).toEqual([]);
      expect(await frame(141000)).toHaveLength(1);
      const turns = await events('repeated_head_turns');
      expect(turns).toHaveLength(2);
      expect(turns.every((e: any) => e.occurrences === 4 && e.tier === 'review' && !e.warningNumber)).toBe(true);
    } finally { clock?.mockRestore(); inference.mockRestore(); await server.close(); }
  });
});

