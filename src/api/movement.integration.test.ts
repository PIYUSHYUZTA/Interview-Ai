import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';

describe('real hand and body observations through the API', () => {
  it('returns actual hand landmarks, stable tracks and loss/recovery without penalties', async () => {
    const api = new ApiServer({provider:new DeterministicProvider(),authenticationRequired:false});
    const running = await api.listen(0); const base=`http://127.0.0.1:${running.port}`;
    let clock: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const created = await (await fetch(`${base}/interviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resumeText:STRONG_RESUME,numRounds:1})})).json() as any;
      const started = await (await fetch(`${base}/interviews/${created.sessionId}/start`,{method:'POST'})).json() as any;
      let now=started.publicState.timing.sessionStartedAt+32000;
      clock=vi.spyOn(Date,'now');
      const frame=async(name:string) => {
        now+=2000;clock!.mockReturnValue(now);
        const response=await fetch(`${base}/interviews/${created.sessionId}/proctoring-frame`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${created.integrityToken}`},body:JSON.stringify({consent:true,image:readFileSync(`proctoring/fixtures/${name}.jpg`).toString('base64'),capturedAt:new Date(now).toISOString()})});
        expect(response.status).toBe(200);
        const result=await response.json() as any;
        expect(result.publicState.integrity.warningCount).toBe(0);
        return result.observation.movementObservation;
      };
      const first=await frame('right_hands');
      expect(first.handTracks).toHaveLength(2);
      expect(first.handTracks.every((h:any)=>h.landmarks.length===21 && h.landmarkConfidence===null)).toBe(true);
      expect(first.handTracks.every((h:any)=>['left','right','unknown'].includes(h.handedness))).toBe(true);
      const repeat=await frame('right_hands');
      expect(repeat.handTracks.map((h:any)=>h.trackId).sort()).toEqual(first.handTracks.map((h:any)=>h.trackId).sort());
      const absent=await frame('blank');
      expect(absent.handTracks).toHaveLength(0);
      expect(absent.lostHands).toHaveLength(2);
      expect(absent.lostHands.every((h:any)=>h.state==='tracking_lost')).toBe(true);
      const recovered=await frame('right_hands');
      expect(recovered.handTracks.every((h:any)=>h.transition==='recovered' && h.movement===null)).toBe(true);
      const portrait=await frame('portrait');
      expect(portrait.body.landmarks.length).toBeGreaterThanOrEqual(2);
      expect(portrait.visiblePoseCount).toBeGreaterThan(0);
      expect(portrait.interpretation).toBe('neutral-observation');
    } finally {clock?.mockRestore();await running.close();}
  },45000);
});
