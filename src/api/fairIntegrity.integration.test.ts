import { describe,expect,it,vi } from 'vitest';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { InMemorySessionStore } from '../core/session/InterviewSessionStore.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';

describe('fair, atomic integrity enforcement',()=>{
  it('requires recovery, commits the third violation atomically and rejects further progression',async()=>{
    const provider=new DeterministicProvider(),store=new InMemorySessionStore({provider});
    const api=new ApiServer({provider,store,authenticationRequired:false}),running=await api.listen(0),base=`http://127.0.0.1:${running.port}`;
    let clock:ReturnType<typeof vi.spyOn>|undefined;let save:ReturnType<typeof vi.spyOn>|undefined;
    try {
      const created=await(await fetch(`${base}/interviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resumeText:STRONG_RESUME,numRounds:1})})).json() as any;
      const start=await(await fetch(`${base}/interviews/${created.sessionId}/start`,{method:'POST'})).json() as any;
      const began=start.publicState.timing.sessionStartedAt;
      clock=vi.spyOn(Date,'now');
      const event=(type:string,offset:number,id=crypto.randomUUID())=>{
        clock!.mockReturnValue(began+offset);
        return fetch(`${base}/interviews/${created.sessionId}/integrity-events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${created.integrityToken}`},body:JSON.stringify({eventId:id,eventType:type,occurredAt:new Date(Date.now()).toISOString(),durationMs:type==='tab_visible'?2000:5000,warningCount:0})});
      };
      expect(await(await event('tab_hidden',35000)).json()).toMatchObject({warningCount:1,terminated:false});
      expect(await(await event('tab_hidden',95000)).json()).toMatchObject({warningCount:1,suppressed:true});
      expect((await event('tab_visible',97000)).status).toBe(200);
      expect(await(await event('camera_interrupted',100000)).json()).toMatchObject({warningCount:1,terminated:false});
      expect(await(await event('tab_hidden',120000)).json()).toMatchObject({warningCount:2,terminated:false});
      expect((await event('tab_visible',122000)).status).toBe(200);
      const third=crypto.randomUUID();
      save=vi.spyOn(store,'save').mockRejectedValueOnce(new Error('controlled storage failure'));
      expect((await event('tab_hidden',145000,third)).status).toBe(500);
      const unchanged=(await store.load(created.sessionId))!;
      expect(unchanged.state).toBe('IN_PROGRESS');expect(unchanged.toPublicState().integrity.warningCount).toBe(2);
      expect(unchanged.integrityEvents.some(e=>e.eventId===third)).toBe(false);
      const responses=await Promise.all([event('tab_hidden',145000,third),event('tab_hidden',145000,third)]);
      expect(responses.map(r=>r.status).sort()).toEqual([200,401]);
      const committed=(await store.load(created.sessionId))!;
      expect(committed.state).toBe('TERMINATED_FOR_INTEGRITY');expect(committed.currentQuestion).toBeNull();
      expect(committed.toPublicState().integrity.warningCount).toBe(3);
      expect(committed.integrityEvents.filter(e=>e.warningNumber>0)).toHaveLength(3);
      expect(committed.integrityEvents.filter(e=>e.eventId===third)).toHaveLength(1);
      expect(committed.toPublicState().integrity.terminationReason).toMatch(/^The interview ended after three separate qualifying incidents: 1\) the interview tab was hidden for \d+ s; 2\) the interview tab was hidden for \d+ s; 3\) the interview tab was hidden for \d+ s\. .*not a determination of intent\.$/);
      for(const path of ['start','next-question','answer','complete'])expect((await fetch(`${base}/interviews/${created.sessionId}/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'local state cannot bypass termination'})})).status).toBe(410);
    }finally{save?.mockRestore();clock?.mockRestore();await running.close();}
  });
});
