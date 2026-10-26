import {describe,expect,it} from 'vitest';
import {monitoringPresentation} from '../../frontend/src/components/monitoringPresentation.js';
import type {VisionObservation,FaceReadinessStatus} from '../../frontend/src/types.js';

const now=1700000000000;
const observation={faceState:'FACE_PRESENT',faceCount:1,faceTrackingReliable:true,faceQuality:{checks:{singleFace:true,largeEnough:true,wellLit:true,sharpEnough:true,forwardFacing:true},score:1,method:'image-and-geometry-checks',detectorConfidence:null},headOrientation:'roughly_forward',gazeDirection:'roughly_centered',upperBodyVisible:true,upperBodyMovement:null,handCount:0,handPositions:[],handMovement:null} as VisionObservation;
const input={camera:true,consent:true,observation,observedAt:now,readiness:null as FaceReadinessStatus|null,now};
describe('truthful candidate monitoring presentation',()=>{
  it('requires a recent usable backend face result for Active',()=>{
    expect(monitoringPresentation(input).tracking).toBe('Active');
    expect(monitoringPresentation({...input,observedAt:now+800}).tracking).toBe('Active'); // newer than the 1 s clock tick at ~2 samples/s
    for(const override of [{observation:null},{observedAt:null},{observedAt:now-6000},{observedAt:now+2001},{camera:false},{consent:false}])expect(monitoringPresentation({...input,...override}).tracking).toBe('Unavailable');
  });
  it('never calls presence or readiness identity verification',()=>{
    const ready={state:'FACE_PRESENT',ready:true,identityVerified:false,identityVerification:'not_implemented',checkedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString(),goodSamples:2,message:'Face readiness confirmed'} as FaceReadinessStatus;
    expect(monitoringPresentation({...input,readiness:ready})).toMatchObject({identity:'Not verified',readiness:'Ready'});
    expect(monitoringPresentation({...input,readiness:{...ready,expiresAt:new Date(now-1).toISOString()}}).readiness).toBe('Retry required');
  });
  it('reports temporary loss only when returned by the backend',()=>{
    expect(monitoringPresentation({...input,observation:{...observation,faceState:'TRACKING_LOST',faceCount:0}}).tracking).toBe('Temporarily lost');
    expect(monitoringPresentation({...input,observation:{...observation,faceState:'FACE_NOT_DETECTED',faceCount:0}}).tracking).toBe('Unavailable');
  });
  it('shows measured lighting and framing guidance without optimistic active state',()=>{
    const poor={...observation,faceState:'QUALITY_LOW' as const,faceQuality:{...observation.faceQuality!,checks:{...observation.faceQuality!.checks,wellLit:false}}};
    expect(monitoringPresentation({...input,observation:poor})).toMatchObject({tracking:'Unavailable',help:expect.stringContaining('even lighting')});
    const multiple={...observation,faceState:'MULTIPLE_FACES' as const,faceCount:2};
    expect(monitoringPresentation({...input,observation:multiple}).help).toContain('only person');
  });
  it('does not equate camera permission or analysis request with backend confirmation',()=>{
    expect(monitoringPresentation({...input,observation:null,readiness:null})).toMatchObject({tracking:'Unavailable',readiness:'Not checked',identity:'Not verified'});
    expect(monitoringPresentation({...input,observation:{...observation,faceTrackingReliable:false}}).tracking).toBe('Unavailable');
  });
});

import {faceStatus} from '../../frontend/src/components/monitoringPresentation.js';
describe('live face status on the camera preview',()=>{
  const quality=(checks:Partial<Record<'singleFace'|'largeEnough'|'wellLit'|'sharpEnough'|'forwardFacing',boolean>>,extra={})=>({checks:{singleFace:true,largeEnough:true,wellLit:true,sharpEnough:true,forwardFacing:true,...checks},score:1,method:'image-and-geometry-checks' as const,detectorConfidence:null,...extra});
  const direction=(headDirections:string[],headReliable=true)=>({headDirections,headReliable} as any);
  it('names each tracking state truthfully',()=>{
    expect(faceStatus(null)).toEqual({label:'Looking for your face…',tone:'waiting'});
    const present = (directionEstimate: any) => ({faceState:'FACE_PRESENT',faceCount:1,directionEstimate} as any);
    expect(faceStatus(present({headReliable:true,headDirections:[],gazeReliable:true,gazeDirections:['left']}))).toEqual({label:'Face detected · facing forward · eyes off-centre',tone:'notice'});
    expect(faceStatus(present({headReliable:true,headDirections:[],gazeReliable:false,gazeDirections:['unavailable']}))).toEqual({label:'Face detected · facing forward',tone:'ok'});
    expect(faceStatus({...present({headReliable:true,headDirections:[],gazeReliable:false,gazeDirections:['unavailable']}),movementObservation:{handNearFace:true}} as any)).toEqual({label:'Face detected · facing forward · hand near face',tone:'notice'});
    expect(faceStatus({...present({headReliable:true,headDirections:[],gazeReliable:false,gazeDirections:['unavailable']}),phoneObservation:{status:'seen'}} as any)).toEqual({label:'Face detected · facing forward · possible phone in view',tone:'notice'});
    expect(faceStatus({...present({headReliable:true,headDirections:[],gazeReliable:false,gazeDirections:['unavailable']}),phoneObservation:{status:'candidate'}} as any).label).toBe('Face detected · facing forward');
    expect(faceStatus(present({headReliable:true,headDirections:['right'],gazeReliable:false,gazeDirections:['unavailable'],repeatedHeadTurns:true})).label).toBe('Face detected · head turned · frequent head turns');
    expect(faceStatus({faceState:'MULTIPLE_FACES',faceCount:2} as any).label).toBe('2 faces in view');
    expect(faceStatus({faceState:'FACE_NOT_DETECTED',faceCount:0,phoneObservation:{status:'seen'}} as any).label).toBe('No face in view · possible phone in view');
    expect(faceStatus({faceState:'FACE_NOT_DETECTED',faceCount:0} as any).label).toBe('No face in view');
    expect(faceStatus({faceState:'TRACKING_LOST',faceCount:0} as any).label).toBe('Face lost · tracking resumes when you return');
    expect(faceStatus({faceState:'QUALITY_LOW',faceCount:1,faceQuality:quality({largeEnough:false})} as any).label).toBe('Face detected · move closer');
    expect(faceStatus({faceState:'QUALITY_LOW',faceCount:1,faceQuality:quality({wellLit:false})} as any).label).toBe('Face detected · add more light');
    expect(faceStatus({faceState:'FACE_PRESENT',faceCount:1,faceQuality:quality({}),directionEstimate:direction([])} as any)).toEqual({label:'Face detected · facing forward',tone:'ok'});
    expect(faceStatus({faceState:'FACE_PRESENT',faceCount:1,faceQuality:quality({},{lowLight:true}),directionEstimate:direction([])} as any).label).toBe('Face detected · facing forward · low light');
    expect(faceStatus({faceState:'FACE_PRESENT',faceCount:1,faceQuality:quality({}),directionEstimate:direction(['left'])} as any).label).toBe('Face detected · head turned');
    expect(faceStatus({faceState:'FACE_PRESENT',faceCount:1,faceQuality:quality({}),directionEstimate:direction(['down'])} as any).label).toBe('Face detected · head tilted down');
    expect(faceStatus({faceState:'FACE_PRESENT',faceCount:1,faceQuality:quality({}),directionEstimate:direction(['left'],false)} as any).label).toBe('Face detected · facing forward');
  });
});
