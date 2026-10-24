import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';
import { InMemorySessionStore } from '../core/session/InterviewSessionStore.js';

const blank = {faceState:'FACE_NOT_DETECTED',faceTracks:[],faceCount:0,faceTrackingReliable:false,headOrientation:'unavailable',gazeDirection:'unavailable',gazeReliable:false,upperBodyVisible:false,upperBodyMovement:null,handCount:0,handPositions:[],handMovement:null,positionShift:null,events:[] as any[]};

async function setup() {
  const provider=new DeterministicProvider(), store=new InMemorySessionStore({provider});
  const api=new ApiServer({provider,store,authenticationRequired:false});
  const running=await api.listen(0),base=`http://127.0.0.1:${running.port}`;
  const session=await(await fetch(`${base}/interviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resumeText:STRONG_RESUME,numRounds:1})})).json() as any;
  const start=await(await fetch(`${base}/interviews/${session.sessionId}/start`,{method:'POST'})).json() as any;
  const sample=()=>fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.integrityToken}`},body:JSON.stringify({consent:true,image:readFileSync('proctoring/fixtures/blank.jpg').toString('base64'),capturedAt:new Date(Date.now()).toISOString()})});
  return {api,running,base,store,session,start,sample};
}

describe('timestamped proctoring event delivery',()=>{
  it('persists real Python events from actual frames, with unknown confidence and no penalties',async()=>{
    const app=await setup();
    try {
      expect((await app.sample()).status).toBe(200);
      await new Promise(resolve=>setTimeout(resolve,2100));
      const response=await app.sample();expect(response.status).toBe(200);
      const result=await response.json() as any;
      const event=result.observation.events.find((e:any)=>e.eventType==='face_not_detected');
      expect(event).toMatchObject({sessionId:app.session.sessionId,confidence:null,severity:'info',details:{source:'vision',signal:'face',phase:'observed'}});
      expect(event.durationMs).toBeGreaterThanOrEqual(2000);
      expect(Math.abs(event.occurredAt-Date.now())).toBeLessThan(5000);
      const stored=await app.store.load(app.session.sessionId);
      expect(stored!.serialize().integrity?.events).toContainEqual({...event,warningNumber:0,policyDecision:'context_only'});
      const diagnostics=await(await fetch(`${app.base}/interviews/${app.session.sessionId}/diagnostics`)).json() as any;
      expect(diagnostics.events.some((e:any)=>e.eventId===event.eventId && e.details.source==='vision')).toBe(true);
      expect(result.publicState.integrity.warningCount).toBe(0);
    } finally {await app.running.close();}
  },45000);

  it('deduplicates deliveries, rejects foreign/stale/low-confidence events and disallows browser vision spoofing',async()=>{
    const app=await setup();let clock:ReturnType<typeof vi.spyOn>|undefined;
    const inference=vi.spyOn((app.api as any).vision,'analyze');
    try {
      let now=app.start.publicState.timing.sessionStartedAt+32000;
      clock=vi.spyOn(Date,'now').mockReturnValue(now);
      const event={sessionId:app.session.sessionId,eventId:crypto.randomUUID(),eventType:'tracking_lost',occurredAt:now,durationMs:2000,confidence:null,severity:'info',details:{source:'vision',signal:'face',trackingState:'lost',phase:'observed'}};
      inference.mockResolvedValue({...blank,events:[event,{...event,eventId:crypto.randomUUID(),sessionId:'other'},{...event,eventId:crypto.randomUUID(),occurredAt:now-61000},{...event,eventId:crypto.randomUUID(),confidence:.1}]});
      expect((await app.sample()).status).toBe(200);
      clock.mockReturnValue(now+=2000);expect((await app.sample()).status).toBe(200);
      const stored=await app.store.load(app.session.sessionId);
      expect(stored!.integrityEvents.filter(e=>e.eventType==='tracking_lost')).toHaveLength(1);
      const spoof=await fetch(`${app.base}/interviews/${app.session.sessionId}/integrity-events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${app.session.integrityToken}`},body:JSON.stringify({...event,occurredAt:new Date(now).toISOString()})});
      expect(spoof.status).toBe(400);
      expect(stored!.toPublicState().integrity.warningCount).toBe(0);
    } finally {clock?.mockRestore();inference.mockRestore();await app.running.close();}
  });

  it('records one technical failure per outage and a recovery on resumed inference',async()=>{
    const app=await setup();let clock:ReturnType<typeof vi.spyOn>|undefined;
    const inference=vi.spyOn((app.api as any).vision,'analyze');
    try {
      let now=app.start.publicState.timing.sessionStartedAt+32000;
      clock=vi.spyOn(Date,'now').mockReturnValue(now);
      inference.mockRejectedValue(new Error('controlled model failure'));
      expect((await app.sample()).status).toBe(503);
      clock.mockReturnValue(now+=2000);expect((await app.sample()).status).toBe(503);
      inference.mockResolvedValue(blank);
      clock.mockReturnValue(now+=2000);expect((await app.sample()).status).toBe(200);
      clock.mockReturnValue(now+=2000);expect((await app.sample()).status).toBe(200);
      const stored=await app.store.load(app.session.sessionId);
      expect(stored!.integrityEvents.map(e=>e.eventType)).toEqual(['vision_pipeline_error','vision_pipeline_recovered']);
      expect(stored!.integrityEvents.every(e=>e.severity==='technical'&&e.warningNumber===0)).toBe(true);
      expect(stored!.toPublicState().integrity.warningCount).toBe(0);
    } finally {clock?.mockRestore();inference.mockRestore();await app.running.close();}
  });
});
