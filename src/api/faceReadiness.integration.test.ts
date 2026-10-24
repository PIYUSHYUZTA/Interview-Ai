import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';

describe('face readiness API using real models',()=>{
  afterEach(()=>vi.restoreAllMocks());
  it('authorizes readiness, rejects missing/forged results, checks real faces, expires and deletes metadata',async()=>{
    const api=new ApiServer({provider:new DeterministicProvider(),authenticationRequired:false});const server=await api.listen(0);const base=`http://127.0.0.1:${server.port}`;let clock:ReturnType<typeof vi.spyOn>|undefined;
    try{
      const create=async()=> (await(await fetch(`${base}/interviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resumeText:STRONG_RESUME,numRounds:1})})).json()) as any;
      const session=await create(), other=await create();
      const url=`${base}/interviews/${session.sessionId}`;
      const start=()=>fetch(`${url}/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proctored:true,identityVerified:true})});
      expect((await start()).status).toBe(409);
      expect((await fetch(`${url}/face-check`,{headers:{Authorization:`Bearer ${other.integrityToken}`}})).status).toBe(401);
      const headers={'Content-Type':'application/json',Authorization:`Bearer ${session.integrityToken}`};let now=Date.now();clock=vi.spyOn(Date,'now').mockReturnValue(now);
      const sample=async(file:string,extra={})=>fetch(`${url}/face-check`,{method:'POST',headers,body:JSON.stringify({consent:true,image:readFileSync(file).toString('base64'),capturedAt:new Date(Date.now()).toISOString(),...extra})});
      const blank=await sample('proctoring/fixtures/blank.jpg');expect(blank.status).toBe(200);expect(await blank.json()).toMatchObject({faceReadiness:{ready:false,identityVerified:false}});
      expect((await start()).status).toBe(409);
      now+=2000;clock.mockReturnValue(now);
      const first=await sample('proctoring/fixtures/portrait.jpg');expect(first.status).toBe(200);expect(await first.json()).toMatchObject({faceReadiness:{goodSamples:1,ready:false}});
      now+=2000;clock.mockReturnValue(now);
      const second=await sample('proctoring/fixtures/portrait.jpg');expect(second.status).toBe(200);expect(await second.json()).toMatchObject({faceReadiness:{goodSamples:2,ready:true,identityVerified:false,identityVerification:'not_implemented'}});
      const status=()=>fetch(`${url}/face-check`,{headers});expect(await(await status()).json()).toMatchObject({ready:true});
      now+=31000;clock.mockReturnValue(now);expect((await start()).status).toBe(409);expect(await(await status()).json()).toMatchObject({ready:false,state:'TRACKING_LOST'});
      for(let i=0;i<2;i++){now+=2000;clock.mockReturnValue(now);await sample('proctoring/fixtures/portrait.jpg');}
      expect((await start()).status).toBe(200);
      expect((await sample('proctoring/fixtures/portrait.jpg',{consent:false})).status).toBe(400);
      expect((await fetch(`${url}/face-check`,{method:'DELETE',headers})).status).toBe(200);expect(await(await status()).json()).toMatchObject({ready:false,state:'NOT_CHECKED',identityVerified:false});
    }finally{clock?.mockRestore();await server.close();}
  },30000);
  it('discards an in-flight check after consent withdrawal',async()=>{
    const api=new ApiServer({provider:new DeterministicProvider(),authenticationRequired:false});const server=await api.listen(0);const base=`http://127.0.0.1:${server.port}`;
    let began!:()=>void;let release!:(value:any)=>void;const entered=new Promise<void>(resolve=>began=resolve);
    const inference=vi.spyOn((api as any).vision,'analyze').mockImplementation(()=>{began();return new Promise(resolve=>release=resolve);});
    try{
      const session=await(await fetch(`${base}/interviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resumeText:STRONG_RESUME})})).json() as any;
      const url=`${base}/interviews/${session.sessionId}/face-check`;const headers={'Content-Type':'application/json',Authorization:`Bearer ${session.integrityToken}`};
      const pending=fetch(url,{method:'POST',headers,body:JSON.stringify({consent:true,image:readFileSync('proctoring/fixtures/blank.jpg').toString('base64'),capturedAt:new Date().toISOString()})});
      await entered;expect((await fetch(url,{method:'DELETE',headers})).status).toBe(200);
      release({faceState:'FACE_NOT_DETECTED',faceCount:0,faceTracks:[],faceTrackingReliable:false});
      expect((await pending).status).toBe(409);expect(await(await fetch(url,{headers})).json()).toMatchObject({state:'NOT_CHECKED',ready:false,identityVerified:false});
    }finally{release?.({});inference.mockRestore();await server.close();}
  });

  it('enforces the server-required readiness policy even when the client requests an unproctored start',async()=>{
    const api=new ApiServer({provider:new DeterministicProvider(),authenticationRequired:false,config:{faceReadinessRequired:true}});const server=await api.listen(0);const base=`http://127.0.0.1:${server.port}`;
    try{
      const session=await(await fetch(`${base}/interviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resumeText:STRONG_RESUME})})).json() as any;
      const response=await fetch(`${base}/interviews/${session.sessionId}/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proctored:false})});expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:'FACE_READINESS_REQUIRED'});
    }finally{await server.close();}
  });
  it('rejects another authenticated candidate even with the interview face token',async()=>{
    const api=new ApiServer({provider:new DeterministicProvider(),dataDirectory:path.resolve(`.browser-verification/face-authorization-${Date.now()}`)});const server=await api.listen(0);const base=`http://127.0.0.1:${server.port}`;
    try{
      const register=async(name:string)=>{const response=await fetch(`${base}/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email:`${name}-${Date.now()}@example.test`,password:'FaceAuthPass!2026'})});expect(response.status).toBe(201);return response.headers.get('set-cookie')!.split(';')[0];};
      const cookie=await register('Owner');const session=await(await fetch(`${base}/interviews`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({resumeText:STRONG_RESUME})})).json() as any;
      const other=await register('Other');const url=`${base}/interviews/${session.sessionId}/face-check`;
      expect((await fetch(url,{headers:{Authorization:`Bearer ${session.integrityToken}`,Cookie:other}})).status).toBe(404);
      expect((await fetch(url,{headers:{Authorization:`Bearer ${session.integrityToken}`}})).status).toBe(401);
    }finally{await server.close();}
  });

});
