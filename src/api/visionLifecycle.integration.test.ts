import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { InMemorySessionStore } from '../core/session/InterviewSessionStore.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';

const image=readFileSync('proctoring/fixtures/blank.jpg').toString('base64');
const observation={faceState:'FACE_NOT_DETECTED',faceTracks:[],faceCount:0,faceTrackingReliable:false,headOrientation:'unavailable',gazeDirection:'unavailable',upperBodyVisible:false,upperBodyMovement:null,handCount:0,handPositions:[],handMovement:null,positionShift:null,events:[]};
const json={'Content-Type':'application/json'};

describe('vision session lifecycle',()=>{
  it('cancels disconnected frame requests without a misconduct event and allows a fresh retry',async()=>{
    const provider=new DeterministicProvider(),store=new InMemorySessionStore({provider}),api=new ApiServer({provider,store,authenticationRequired:false});
    const server=await api.listen(0),base=`http://127.0.0.1:${server.port}`;
    let begin!:()=>void,release!:(value:any)=>void,cancelled!:()=>void;
    const entered=new Promise<void>(resolve=>begin=resolve),cancelledPromise=new Promise<void>(resolve=>cancelled=resolve);
    const worker=(api as any).vision;
    const inference=vi.spyOn(worker,'analyze').mockImplementationOnce(()=>{begin();return new Promise(resolve=>release=resolve);});
    const original=worker.releaseSession.bind(worker);const cancel=vi.spyOn(worker,'releaseSession').mockImplementation((id:any)=>{original(id);cancelled();});
    let clock:ReturnType<typeof vi.spyOn>|undefined;
    try {
      const session=await(await fetch(`${base}/interviews`,{method:'POST',headers:json,body:JSON.stringify({resumeText:STRONG_RESUME,numRounds:1})})).json() as any;
      await fetch(`${base}/interviews/${session.sessionId}/start`,{method:'POST'});
      const controller=new AbortController();
      const frame=(signal?:AbortSignal)=>fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`,{method:'POST',headers:{...json,Authorization:`Bearer ${session.integrityToken}`},signal,body:JSON.stringify({consent:true,image,capturedAt:new Date(Date.now()).toISOString()})});
      const pending=frame(controller.signal).catch(()=>null);await entered;controller.abort();await pending;
      expect(await Promise.race([cancelledPromise.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),1500))])).toBe(true);
      release(observation);
      for(let i=0;i<30&&(api as any).visionPending.has(session.sessionId);i++) await new Promise(resolve=>setTimeout(resolve,10));
      expect((api as any).visionPending.has(session.sessionId)).toBe(false);
      expect((await store.load(session.sessionId))!.integrityEvents).toEqual([]);
      clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+2000);
      expect((await frame()).status).toBe(200); // Actual worker after the cancelled controlled inference.
    }finally{release?.(observation);clock?.mockRestore();inference.mockRestore();cancel.mockRestore();await server.close();}
  },30000);
  it('enforces account ownership, active state, token and timestamp before inference',async()=>{
    const api=new ApiServer({provider:new DeterministicProvider(),dataDirectory:path.resolve(`.browser-verification/vision-owner-${Date.now()}`)});
    const server=await api.listen(0),base=`http://127.0.0.1:${server.port}`;
    const inference=vi.spyOn((api as any).vision,'analyze');
    try {
      const register=async(name:string)=>{const response=await fetch(`${base}/auth/register`,{method:'POST',headers:json,body:JSON.stringify({name,email:`${name}-${crypto.randomUUID()}@example.test`,password:'VisionOwnerPass!2026'})});expect(response.status).toBe(201);return response.headers.get('set-cookie')!.split(';')[0];};
      const owner=await register('owner'),other=await register('other');
      const session=await(await fetch(`${base}/interviews`,{method:'POST',headers:{...json,Cookie:owner},body:JSON.stringify({resumeText:STRONG_RESUME,numRounds:1})})).json() as any;
      const frame=(cookie:string,token=session.integrityToken,at=Date.now())=>fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`,{method:'POST',headers:{...json,...(cookie?{Cookie:cookie}:{}),Authorization:`Bearer ${token}`},body:JSON.stringify({consent:true,image,capturedAt:new Date(at).toISOString()})});
      expect((await frame(other)).status).toBe(404);expect((await frame('')).status).toBe(401);
      expect((await frame(owner)).status).toBe(409);
      expect((await fetch(`${base}/interviews/${session.sessionId}/start`,{method:'POST',headers:{Cookie:owner}})).status).toBe(200);
      expect((await frame(owner,'wrong')).status).toBe(401);
      expect((await frame(owner,session.integrityToken,Date.now()-20000)).status).toBe(422);
      expect(inference).not.toHaveBeenCalled();
    }finally{inference.mockRestore();await server.close();}
  });

  it('releases one real cached session without corrupting another session frame reply',async()=>{
    const api=new ApiServer({provider:new DeterministicProvider(),authenticationRequired:false});const server=await api.listen(0),base=`http://127.0.0.1:${server.port}`;
    let clock:ReturnType<typeof vi.spyOn>|undefined;
    try {
      const create=async()=>{const session=await(await fetch(`${base}/interviews`,{method:'POST',headers:json,body:JSON.stringify({resumeText:STRONG_RESUME,numRounds:1})})).json() as any;await fetch(`${base}/interviews/${session.sessionId}/start`,{method:'POST'});return session;};
      const a=await create(),b=await create();let now=Date.now();clock=vi.spyOn(Date,'now');
      const frame=async(session:any)=>{clock!.mockReturnValue(now+=2000);return fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`,{method:'POST',headers:{...json,Authorization:`Bearer ${session.integrityToken}`},body:JSON.stringify({consent:true,image,capturedAt:new Date(now).toISOString()})});};
      expect((await frame(a)).status).toBe(200);expect((await frame(b)).status).toBe(200);
      const worker=(api as any).vision,pid=worker.child.pid;
      expect((await fetch(`${base}/interviews/${a.sessionId}/face-check`,{method:'DELETE',headers:{Authorization:`Bearer ${a.integrityToken}`}})).status).toBe(200);
      expect(worker.child.pid).toBe(pid);
      const response=await frame(b);expect(response.status).toBe(200);expect((await response.json() as any).observation.faceCount).toBe(0);
      expect(worker.child.pid).toBe(pid);
      await fetch(`${base}/interviews/${b.sessionId}/face-check`,{method:'DELETE',headers:{Authorization:`Bearer ${b.integrityToken}`}});
      expect(worker.child).toBeNull();
    }finally{clock?.mockRestore();await server.close();}
  },45000);

  it('completes the actual interview while inference is pending, releases it and rejects its late result',async()=>{
    const provider=new DeterministicProvider(),store=new InMemorySessionStore({provider}),api=new ApiServer({provider,store,authenticationRequired:false});
    const server=await api.listen(0),base=`http://127.0.0.1:${server.port}`;
    let begin!:()=>void,release!:(value:any)=>void;const entered=new Promise<void>(resolve=>begin=resolve);
    const inference=vi.spyOn((api as any).vision,'analyze').mockImplementation(()=>{begin();return new Promise(resolve=>release=resolve);});
    const cancel=vi.spyOn((api as any).vision,'releaseSession');
    try {
      const session=await(await fetch(`${base}/interviews`,{method:'POST',headers:json,body:JSON.stringify({resumeText:STRONG_RESUME,numRounds:1})})).json() as any;
      let current=await(await fetch(`${base}/interviews/${session.sessionId}/start`,{method:'POST'})).json() as any;
      const frame=()=>fetch(`${base}/interviews/${session.sessionId}/proctoring-frame`,{method:'POST',headers:{...json,Authorization:`Bearer ${session.integrityToken}`},body:JSON.stringify({consent:true,image,capturedAt:new Date().toISOString()})});
      const pending=frame();await entered;
      for(let i=0;i<12&&current.publicState.state!=='COMPLETED';i++){
        const answer=await fetch(`${base}/interviews/${session.sessionId}/answer`,{method:'POST',headers:json,body:JSON.stringify({questionId:current.currentQuestion.id,text:'I would explain the implementation using a concrete example, validate assumptions, compare trade-offs and test the result.'})});
        expect(answer.status).toBe(200);current=await answer.json();
        if(current.publicState.state!=='COMPLETED')current=await(await fetch(`${base}/interviews/${session.sessionId}/next-question`,{method:'POST'})).json();
      }
      expect(current.publicState.state).toBe('COMPLETED');expect(cancel).toHaveBeenCalledWith(session.sessionId);
      release(observation);const late=await pending;expect(late.status).toBe(409);expect((await late.json() as any).publicState.state).toBe('COMPLETED');
      expect((await frame()).status).toBe(409);expect(inference).toHaveBeenCalledTimes(1);
      expect((await store.load(session.sessionId))!.integrityEvents).toEqual([]);
    }finally{release?.(observation);inference.mockRestore();cancel.mockRestore();await server.close();}
  },30000);
});
